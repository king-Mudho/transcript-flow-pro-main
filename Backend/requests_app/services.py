import random
import re
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from branches.models import ZimpostBranch
from requests_app.models import (
    MSU_REJECT_REASONS,
    BatchStatus,
    DispatchBatch,
    Driver,
    HandInList,
    Payment,
    PaymentMethod,
    Request,
    RequestEvent,
    RequestStatus,
    RequestZone,
)

HARARE_TZ = ZoneInfo("Africa/Harare")

# How many times to retry when a generated reference number is already taken.
# Collisions are rare (1 in a million per attempt against a small table), so
# exhausting this many attempts means something is wrong rather than unlucky.
MAX_REFERENCE_ATTEMPTS = 10

REG_PATTERN = re.compile(r"^R\d{6}[A-Z]$")


def harare_today():
    return datetime.now(HARARE_TZ).date()


def generate_reference_number() -> str:
    """Return an unused reference number in the form ``MSU-<year>-<6 digits>``.

    The number is random rather than sequential so it can't be used to infer how
    many requests exist or to guess someone else's reference.
    """
    for _ in range(MAX_REFERENCE_ATTEMPTS):
        candidate = f"MSU-{timezone.now().year}-{random.randint(0, 999999):06d}"
        if not Request.objects.filter(reference_number=candidate).exists():
            return candidate
    raise RuntimeError(
        f"Could not generate a unique reference number after {MAX_REFERENCE_ATTEMPTS} attempts"
    )


def current_fees() -> tuple[Decimal, Decimal]:
    from core.models import SiteSettings

    s = SiteSettings.load()
    return s.fee_harare, s.fee_outside


def fee_for_zone(zone: str) -> tuple[Decimal, str]:
    """The price a NEW request in this zone is charged, from Settings."""
    harare, outside = current_fees()
    if zone == RequestZone.HARARE:
        return harare, PaymentMethod.CASH_ON_DELIVERY
    return outside, PaymentMethod.CASH_DEPOSIT


def normalise_phone(raw: str) -> str:
    """Return a Zimbabwean mobile number as +2637XXXXXXXX, or raise.

    Accepts 07X XXX XXXX, +263 7X XXX XXXX, 2637…, 002637… with or without
    spaces, dashes or brackets."""
    digits = re.sub(r"[\s\-().]", "", raw or "")
    if digits.startswith("00263"):
        digits = "+" + digits[2:]
    elif digits.startswith("263"):
        digits = "+" + digits
    elif digits.startswith("0"):
        digits = "+263" + digits[1:]
    elif re.fullmatch(r"7\d{8}", digits):
        digits = "+263" + digits
    if not re.fullmatch(r"\+2637\d{8}", digits):
        raise ValidationError("Enter a Zimbabwe mobile number, for example 077 123 4567.")
    return digits


def normalise_reg(raw: str) -> str:
    """Registration numbers are stored uppercase with no spaces."""
    return re.sub(r"\s+", "", raw or "").upper()


def reg_format_ok(reg: str) -> bool:
    """MSU format appears to be R, six digits and a letter (R123456X). Used to
    warn, not to block, until MSU confirms the format."""
    return bool(REG_PATTERN.match(reg or ""))


def match_suburb(name: str):
    from core.models import Suburb

    name = (name or "").strip()
    if not name:
        return None
    return Suburb.objects.filter(name__iexact=name, active=True).first()


def validate_delivery(zone, harare_address, suburb, branch):
    """Shared by submission and admin edits. Returns cleaned (address, suburb, branch)."""
    if zone == RequestZone.HARARE:
        if len((harare_address or "").strip()) < 5:
            raise ValidationError("Enter the delivery address (house number and street) in Harare.")
        if not (suburb or "").strip():
            raise ValidationError("Choose the suburb for the Harare address.")
        return harare_address.strip(), suburb.strip(), None
    if zone == RequestZone.OUTSIDE_HARARE:
        if branch is None or not branch.active:
            raise ValidationError("Choose an active Zimpost branch.")
        return None, "", branch
    raise ValidationError("Invalid zone.")


def open_duplicates(reg_number: str, exclude_id=None):
    qs = Request.objects.filter(
        reg_number__iexact=reg_number,
        status__in=("received", "submitted_to_msu", "collected_from_msu", "dispatched"),
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.order_by("-created_at")


# --------------------------------------------------------------- creation


@transaction.atomic
def create_request(data: dict, *, actor=None, channel="web", consent_via="graduate") -> Request:
    """Create a request from validated form data (public or staff-assisted).

    Fee and payment method come from Settings; status, paid and exported_at are
    never taken from the caller."""
    from core.models import SiteSettings
    from requests_app.models import ClearanceFile, RequestItem

    items = data.pop("items", None) or [{"document_type": "transcript", "quantity": 1}]
    file_ids = data.pop("clearance_file_ids", None) or []
    data.pop("consent", None)
    data.pop("confirm_duplicate", None)

    fee, payment_method = fee_for_zone(data["zone"])
    suburb_ref = match_suburb(data.get("suburb")) if data["zone"] == RequestZone.HARARE else None
    req = Request(
        reference_number=generate_reference_number(),
        fee_amount=fee,
        payment_method=payment_method,
        suburb_ref=suburb_ref,
        channel=channel,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        consent_at=timezone.now(),
        terms_version=SiteSettings.load().terms_version,
        consent_via=consent_via,
        **data,
    )
    req._actor = actor if getattr(actor, "is_authenticated", False) else None
    if channel != "web":
        req._note = f"Request taken by staff ({req.get_channel_display()})"
    req.save()

    for item in items:
        RequestItem.objects.create(
            request=req, document_type=item["document_type"], quantity=item["quantity"]
        )
    if file_ids:
        ClearanceFile.objects.filter(pk__in=file_ids, request__isnull=True).update(request=req)
    return req


# --------------------------------------------------------------- status moves


@transaction.atomic
def change_status(
    req: Request,
    new_status: str,
    actor,
    reason: str | None = None,
    note: str = "",
    dispatched_at=None,
    tracking_number: str = "",
    handin=None,
) -> Request:
    """Move one request, enforcing every stage rule. Raises ValidationError.

    `handin` is the hand-in list a request joins when it moves from Received
    to Submitted to MSU; its number is written into the history."""
    old_status = req.status
    req._actor = actor
    req._note = note or reason or ""
    if (
        handin is not None
        and old_status == RequestStatus.RECEIVED
        and new_status == RequestStatus.SUBMITTED_TO_MSU
    ):
        req.handin_list = handin
        req._note = f"Hand-in list {handin.number}" + (f". {req._note}" if req._note else "")
    req.status = new_status
    req.status_reason = (reason or "").strip() or None

    if new_status == RequestStatus.DISPATCHED:
        if req.zone == RequestZone.OUTSIDE_HARARE:
            req.dispatched_at = dispatched_at or timezone.now()
            req.zimpost_tracking_number = (tracking_number or "").strip()[:64]
    elif new_status in (RequestStatus.COLLECTED_FROM_MSU, RequestStatus.SUBMITTED_TO_MSU):
        # Stepping back out of Dispatched undoes the dispatch.
        if old_status == RequestStatus.DISPATCHED:
            req.dispatched_at = None
            req.zimpost_tracking_number = ""
            req.batch = None
    elif new_status == RequestStatus.RECEIVED and old_status == RequestStatus.SUBMITTED_TO_MSU:
        # Stepping back before MSU: no longer on a hand-in list.
        req.handin_list = None
        req.ready_at_msu_at = None
        req.ready_at_msu_by = None
    req.save()
    return req


def _next_handin_number() -> str:
    numbers = [
        int(n[3:]) for n in HandInList.objects.values_list("number", flat=True) if n[3:].isdigit()
    ]
    return f"HL-{max(numbers, default=1009) + 1}"


def _new_handin_list(actor) -> HandInList:
    for attempt in range(5):
        try:
            with transaction.atomic():
                return HandInList.objects.create(
                    number=_next_handin_number(),
                    created_by=actor if getattr(actor, "is_authenticated", False) else None,
                )
        except IntegrityError:
            if attempt == 4:
                raise
    raise RuntimeError("unreachable")


def move_many(requests, new_status, actor, **kwargs):
    """Move each request on its own through the same rules as a single change.

    Returns (moved, skipped, handin_list). Requests moved forward from Received
    to Submitted to MSU go on one new hand-in list (B9.4); the list is removed
    again if none of them could move."""
    moved, skipped = 0, []
    handin = None
    if new_status == RequestStatus.SUBMITTED_TO_MSU and any(
        r.status == RequestStatus.RECEIVED for r in requests
    ):
        handin = _new_handin_list(actor)
    for req in requests:
        try:
            change_status(req, new_status, actor, handin=handin, **kwargs)
        except ValidationError as exc:
            skipped.append(
                {
                    "reference_number": req.reference_number,
                    "reason": exc.messages[0] if exc.messages else "Not allowed.",
                }
            )
            continue
        moved += 1
    if handin is not None and not handin.requests.exists():
        handin.delete()
        handin = None
    return moved, skipped, handin


# ------------------------------------------------------------ admin edits


@transaction.atomic
def update_request(req: Request, data: dict, actor) -> Request:
    """Apply an admin PATCH: delivery details, contact details, clearance check."""
    delivery_keys = {
        "zone",
        "harare_address",
        "suburb",
        "directions",
        "zimpost_branch",
        "phone_number",
        "email",
    }
    touching_delivery = bool(delivery_keys & set(data))

    if touching_delivery and req.status in (RequestStatus.DISPATCHED, RequestStatus.COLLECTED):
        raise ValidationError("Locked after dispatch.")

    req._actor = actor
    if "clearance_verified" in data:
        req.clearance_verified = bool(data["clearance_verified"])

    if touching_delivery:
        if {"zone", "harare_address", "suburb", "zimpost_branch"} & set(data):
            zone = data.get("zone", req.zone)
            if "zimpost_branch" in data:
                branch = data["zimpost_branch"]
                if branch is not None and not isinstance(branch, ZimpostBranch):
                    branch = ZimpostBranch.objects.filter(pk=branch).first()
            else:
                branch = req.zimpost_branch
            address = data.get("harare_address", req.harare_address)
            suburb = data.get("suburb", req.suburb)
            req.harare_address, req.suburb, req.zimpost_branch = validate_delivery(
                zone, address, suburb, branch
            )
            req.suburb_ref = match_suburb(req.suburb) if zone == RequestZone.HARARE else None
            if zone != req.zone:
                req.zone = zone
                req.fee_amount, req.payment_method = fee_for_zone(zone)
        if "directions" in data:
            req.directions = (data["directions"] or "").strip()
        if "phone_number" in data:
            req.phone_number = normalise_phone(data["phone_number"])
        if "email" in data:
            req.email = (data["email"] or "").strip() or None
    req.save()
    _recompute_paid(req)
    return req


@transaction.atomic
def set_ready_at_msu(req: Request, actor, ready: bool = True) -> Request:
    """MSU (or the team, told by phone) says a document is ready to collect.
    The graduate's stage stays Submitted to MSU (B10.2/B10.3)."""
    if req.status != RequestStatus.SUBMITTED_TO_MSU:
        raise ValidationError("Only requests at Submitted to MSU can be marked ready.")
    req._actor = actor
    req.ready_at_msu_at = timezone.now() if ready else None
    req.ready_at_msu_by = actor if ready and getattr(actor, "is_authenticated", False) else None
    req.save()
    return req


@transaction.atomic
def msu_reject(req: Request, actor, reason_code: str, note: str = "") -> Request:
    if req.status != RequestStatus.SUBMITTED_TO_MSU:
        raise ValidationError("Only requests at Submitted to MSU can be rejected here.")
    if reason_code not in MSU_REJECT_REASONS:
        raise ValidationError("Choose a reason from the list.")
    label = MSU_REJECT_REASONS[reason_code]
    note = (note or "").strip()
    if reason_code == "other" and not note:
        raise ValidationError("Say what the reason is.")
    reason = f"{label}. {note}" if note and reason_code != "other" else (note or label)
    return change_status(req, RequestStatus.REJECTED, actor, reason=reason)


# --------------------------------------------------------------- payments


def _next_receipt_number() -> str:
    year = timezone.now().year
    prefix = f"RCT-{year}-"
    last = (
        Payment.objects.filter(receipt_number__startswith=prefix)
        .order_by("-receipt_number")
        .values_list("receipt_number", flat=True)
        .first()
    )
    seq = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{seq:06d}"


def _recompute_paid(req: Request):
    total = req.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    paid = total >= req.fee_amount and req.fee_amount > 0
    if req.amount_paid != total or req.paid != paid:
        Request.objects.filter(pk=req.pk).update(amount_paid=total, paid=paid)
        req.amount_paid, req.paid = total, paid


def _payment_event(req, payment, actor, text):
    RequestEvent.objects.create(
        request=req,
        event_type="payment",
        field="payment",
        from_value="",
        to_value=f"{payment.amount:.2f}",
        note=text,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
    )


@transaction.atomic
def record_payment(
    req: Request,
    amount,
    actor,
    *,
    method=None,
    driver=None,
    received_at=None,
    note="",
    batch=None,
) -> Payment:
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValidationError("Enter an amount above zero.")
    req = Request.objects.select_for_update().get(pk=req.pk)
    for attempt in range(5):
        try:
            with transaction.atomic():
                payment = Payment.objects.create(
                    request=req,
                    amount=amount,
                    method=method or req.payment_method,
                    received_by_user=actor if getattr(actor, "is_authenticated", False) else None,
                    received_by_driver=driver,
                    received_at=received_at or timezone.now(),
                    receipt_number=_next_receipt_number(),
                    note=(note or "").strip(),
                    batch=batch,
                    created_by=actor if getattr(actor, "is_authenticated", False) else None,
                )
            break
        except IntegrityError:
            if attempt == 4:
                raise
    who = f"driver {driver.full_name}" if driver else (actor.display_name if actor else "staff")
    _payment_event(
        req, payment, actor, f"US${amount} received by {who}, receipt {payment.receipt_number}"
    )
    _recompute_paid(req)
    return payment


@transaction.atomic
def reverse_payment(payment: Payment, actor, reason: str) -> Payment:
    if not (reason or "").strip():
        raise ValidationError("Give a reason for the reversal.")
    if payment.amount <= 0:
        raise ValidationError("A reversal cannot itself be reversed.")
    if hasattr(payment, "reversed_by"):
        raise ValidationError("This payment has already been reversed.")
    req = Request.objects.select_for_update().get(pk=payment.request_id)
    reversal = Payment.objects.create(
        request=req,
        amount=-payment.amount,
        method=payment.method,
        received_by_user=actor if getattr(actor, "is_authenticated", False) else None,
        received_at=timezone.now(),
        receipt_number=_next_receipt_number(),
        note=reason.strip(),
        reversal_of=payment,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    _payment_event(
        req, reversal, actor, f"Reversed receipt {payment.receipt_number}: {reason.strip()}"
    )
    _recompute_paid(req)
    return reversal


# -------------------------------------------------------- dispatch batches


def _next_batch_number() -> str:
    today = datetime.now(HARARE_TZ).strftime("%Y%m%d")
    prefix = f"HRE-{today}-"
    existing = DispatchBatch.objects.filter(batch_number__startswith=prefix).count()
    return f"{prefix}{existing + 1:02d}"


def driver_state(driver: Driver) -> str:
    """free | batch_out | off_today (shown in the batch panel's driver picker)."""
    if not driver.active or driver.off_today():
        return "off_today"
    if driver.batches.filter(status=BatchStatus.OUT_FOR_DELIVERY).exists():
        return "batch_out"
    return "free"


@transaction.atomic
def create_dispatch_batch(request_ids, driver_id, actor, notes: str = "") -> DispatchBatch:
    """Group collected Harare requests into a batch for one driver, atomically."""
    if not request_ids:
        raise ValidationError("Select at least one request.")
    driver = Driver.objects.filter(pk=driver_id).first()
    if driver is None or not driver.active:
        raise ValidationError("Choose an active driver.")
    if driver.off_today():
        raise ValidationError(f"{driver.full_name} is marked off today.")

    requests = list(
        Request.objects.select_for_update().filter(pk__in=request_ids).order_by("suburb")
    )
    if len(requests) != len(set(request_ids)):
        raise ValidationError("One or more requests were not found.")
    for r in requests:
        if r.zone != RequestZone.HARARE:
            raise ValidationError(f"{r.reference_number} is not a Harare request.")
        if r.status != RequestStatus.COLLECTED_FROM_MSU:
            raise ValidationError(f"{r.reference_number} is not at Collected from MSU.")
        if r.batch_id is not None:
            raise ValidationError(f"{r.reference_number} is already in a batch.")

    now = timezone.now()
    batch = DispatchBatch.objects.create(
        batch_number=_next_batch_number(),
        driver=driver,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        dispatched_at=now,
        notes=notes,
    )
    for r in requests:
        r._actor = actor
        r._via_batch = True
        r._note = f"Batch {batch.batch_number}, driver {driver.full_name}"
        r.status = RequestStatus.DISPATCHED
        r.batch = batch
        r.dispatched_at = now
        r.save()
    return batch


@transaction.atomic
def resolve_batch_item(batch: DispatchBatch, req: Request, delivered: bool, reason: str, actor):
    if batch.status == BatchStatus.CLOSED:
        raise ValidationError("This batch is closed.")
    if req.batch_id != batch.id or req.status != RequestStatus.DISPATCHED:
        raise ValidationError("That document is not out for delivery in this batch.")
    req._actor = actor
    if delivered:
        req._note = f"Delivered by driver, batch {batch.batch_number}"
        req.status = RequestStatus.COLLECTED
    else:
        if not (reason or "").strip():
            raise ValidationError("Give a reason the document was not delivered.")
        req._note = f"Not delivered ({batch.batch_number}): {reason.strip()}"
        req.status = RequestStatus.COLLECTED_FROM_MSU
        req.batch = None
        req.dispatched_at = None
    req.save()
    return req


def cash_due(req: Request) -> Decimal:
    """Cash still to collect from the graduate on delivery."""
    if req.payment_method != PaymentMethod.CASH_ON_DELIVERY:
        return Decimal("0")
    return max(req.fee_amount - (req.amount_paid or Decimal("0")), Decimal("0"))


def batch_cash_expected(batch: DispatchBatch) -> Decimal:
    """Fees of delivered, unpaid cash-on-delivery documents in the batch."""
    delivered = batch.requests.filter(status=RequestStatus.COLLECTED)
    return sum((cash_due(r) for r in delivered), Decimal("0"))


def batch_ready_to_close(batch: DispatchBatch) -> bool:
    return not batch.requests.filter(status=RequestStatus.DISPATCHED).exists()


@transaction.atomic
def close_batch(
    batch: DispatchBatch, actor, cash_handed_in, received_by=None, note=""
) -> DispatchBatch:
    """Close a batch once every document has a result, reconciling the cash.

    Records a payment against each delivered unpaid document, received by the
    driver. A hand-in that differs from what was expected needs a note."""
    batch = DispatchBatch.objects.select_for_update().get(pk=batch.pk)
    if batch.status == BatchStatus.CLOSED:
        raise ValidationError("This batch is already closed.")
    if not batch_ready_to_close(batch):
        raise ValidationError("Some documents are still out for delivery.")
    try:
        handed_in = Decimal(str(cash_handed_in))
    except Exception as exc:
        raise ValidationError("Enter the cash handed in.") from exc
    if handed_in < 0:
        raise ValidationError("Cash handed in cannot be negative.")

    expected = batch_cash_expected(batch)
    if handed_in != expected and not (note or "").strip():
        raise ValidationError("The cash does not match. Add a note explaining the difference.")

    for req in batch.requests.filter(status=RequestStatus.COLLECTED).order_by("reference_number"):
        due = cash_due(req)
        if due > 0:
            record_payment(
                req,
                due,
                actor,
                method=PaymentMethod.CASH_ON_DELIVERY,
                driver=batch.driver,
                note=f"Cash on delivery, batch {batch.batch_number}",
                batch=batch,
            )

    batch.cash_expected = expected
    batch.cash_handed_in = handed_in
    batch.cash_received_by = received_by or (
        actor if getattr(actor, "is_authenticated", False) else None
    )
    batch.variance_note = (note or "").strip()
    batch.reconciled_at = timezone.now()
    batch.status = BatchStatus.CLOSED
    batch.closed_at = timezone.now()
    batch.save()
    return batch


def maybe_close_batch(batch: DispatchBatch) -> bool:
    """Kept for callers that only need to know whether a batch can close."""
    return batch.status == BatchStatus.CLOSED or batch_ready_to_close(batch)


# ---------------------------------------------------------------- deletion


@transaction.atomic
def delete_request(req: Request, actor, reason: str = "") -> None:
    """Delete a request for good (admins only), e.g. a test entry or spam.

    Refused when it would break the books or a delivery run: requests with
    payments recorded, and requests out with a driver. A snapshot of the
    request goes in the audit log, and its clearance files are removed."""
    from core.audit import audit

    if not (reason or "").strip():
        raise ValidationError("Give a reason for deleting.")
    if req.payments.exists():
        raise ValidationError(
            f"{req.reference_number} has payments recorded, so it cannot be deleted."
        )
    if req.status == RequestStatus.DISPATCHED:
        raise ValidationError(f"{req.reference_number} is out for delivery. Resolve it first.")
    snapshot = {
        "reference_number": req.reference_number,
        "full_name": req.full_name,
        "reg_number": req.reg_number,
        "status": req.status,
        "zone": req.zone,
        "created_at": req.created_at,
        "reason": reason.strip(),
    }
    for f in req.clearance_files.all():
        f.file.delete(save=False)
    pk = req.pk
    req.delete()
    audit(actor, "request.delete", "request", pk, snapshot, None)


# ------------------------------------------------------- data protection

ANONYMISED = "[removed]"


@transaction.atomic
def anonymise_request(req: Request, actor=None) -> bool:
    """Remove street address, directions, phone and email from a request and
    its history, keeping what reports need (zone, suburb, dates, fees)."""
    if req.anonymised_at:
        return False
    Request.objects.filter(pk=req.pk).update(
        harare_address=None if req.harare_address is None else ANONYMISED,
        directions="",
        phone_number=ANONYMISED,
        email=None,
        anonymised_at=timezone.now(),
    )
    RequestEvent.objects.filter(
        request=req, field__in=("harare_address", "directions", "phone_number", "email")
    ).update(from_value=ANONYMISED, to_value=ANONYMISED)
    for f in req.clearance_files.all():
        f.file.delete(save=False)
        f.delete()
    return True
