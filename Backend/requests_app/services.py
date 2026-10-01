import random
import re
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from branches.models import ZimpostBranch
from requests_app.models import (
    BatchStatus,
    DispatchBatch,
    Driver,
    PaymentMethod,
    Request,
    RequestStatus,
    RequestZone,
)

# Prices stay constants here until an admin settings page exists (backlog B4.3).
FEE_HARARE = Decimal("15.00")
FEE_OUTSIDE = Decimal("20.00")

HARARE_TZ = ZoneInfo("Africa/Harare")

# How many times to retry when a generated reference number is already taken.
# Collisions are rare (1 in a million per attempt against a small table), so
# exhausting this many attempts means something is wrong rather than unlucky.
MAX_REFERENCE_ATTEMPTS = 10


def generate_reference_number() -> str:
    """Return an unused reference number in the form ``MSU-<year>-<6 digits>``.

    The number is random rather than sequential so it can't be used to infer how
    many requests exist or to guess someone else's reference.

    Call this inside the same transaction as the ``Request`` insert. The
    unique constraint on ``reference_number`` is what ultimately guarantees
    uniqueness.
    """
    for _ in range(MAX_REFERENCE_ATTEMPTS):
        candidate = f"MSU-{timezone.now().year}-{random.randint(0, 999999):06d}"
        if not Request.objects.filter(reference_number=candidate).exists():
            return candidate
    raise RuntimeError(
        f"Could not generate a unique reference number after {MAX_REFERENCE_ATTEMPTS} attempts"
    )


def fee_for_zone(zone: str) -> tuple[Decimal, str]:
    if zone == RequestZone.HARARE:
        return FEE_HARARE, PaymentMethod.CASH_ON_DELIVERY
    return FEE_OUTSIDE, PaymentMethod.CASH_DEPOSIT


def normalise_phone(raw: str) -> str:
    """Return a Zimbabwean number in +263 form, or raise ValidationError."""
    digits = re.sub(r"[\s\-().]", "", raw or "")
    if digits.startswith("00263"):
        digits = "+" + digits[2:]
    elif digits.startswith("263"):
        digits = "+" + digits
    elif digits.startswith("0"):
        digits = "+263" + digits[1:]
    if not re.fullmatch(r"\+263\d{9}", digits):
        raise ValidationError("Enter a valid Zimbabwe phone number, e.g. 0771234567.")
    return digits


def validate_delivery(zone, harare_address, suburb, branch):
    """Shared by submission and admin edits. Returns cleaned (address, suburb, branch)."""
    if zone == RequestZone.HARARE:
        if len((harare_address or "").strip()) < 5:
            raise ValidationError("Enter the delivery address in Harare.")
        if not (suburb or "").strip():
            raise ValidationError("Enter the suburb for the Harare address.")
        return harare_address.strip(), suburb.strip(), None
    if zone == RequestZone.OUTSIDE_HARARE:
        if branch is None or not branch.active:
            raise ValidationError("Choose an active Zimpost branch.")
        return None, "", branch
    raise ValidationError("Invalid zone.")


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
) -> Request:
    """Move one request, enforcing every stage rule. Raises ValidationError."""
    old_status = req.status
    batch = req.batch
    req._actor = actor
    req._note = note or reason or ""
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
    req.save()
    if batch is not None and old_status == RequestStatus.DISPATCHED:
        maybe_close_batch(batch)
    return req


# ------------------------------------------------------------ admin edits


@transaction.atomic
def update_request(req: Request, data: dict, actor) -> Request:
    """Apply an admin PATCH: paid flag and/or delivery details."""
    delivery_keys = {"zone", "harare_address", "suburb", "zimpost_branch", "phone_number", "email"}
    touching_delivery = bool(delivery_keys & set(data))

    if touching_delivery and req.status in (RequestStatus.DISPATCHED, RequestStatus.COLLECTED):
        raise ValidationError("Locked after dispatch.")

    req._actor = actor
    if "paid" in data:
        req.paid = bool(data["paid"])

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
            if zone != req.zone:
                req.zone = zone
                req.fee_amount, req.payment_method = fee_for_zone(zone)
        if "phone_number" in data:
            req.phone_number = data["phone_number"].strip()
        if "email" in data:
            req.email = (data["email"] or "").strip() or None
    req.save()
    return req


# -------------------------------------------------------- dispatch batches


def _next_batch_number() -> str:
    today = datetime.now(HARARE_TZ).strftime("%Y%m%d")
    prefix = f"HRE-{today}-"
    existing = DispatchBatch.objects.filter(batch_number__startswith=prefix).count()
    return f"{prefix}{existing + 1:02d}"


@transaction.atomic
def create_dispatch_batch(request_ids, driver_id, actor, notes: str = "") -> DispatchBatch:
    """Group collected Harare requests into a batch for one driver, atomically."""
    if not request_ids:
        raise ValidationError("Select at least one request.")
    driver = Driver.objects.filter(pk=driver_id).first()
    if driver is None or not driver.active:
        raise ValidationError("Choose an active driver.")

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
    maybe_close_batch(batch)
    return req


def maybe_close_batch(batch: DispatchBatch) -> bool:
    if batch.status == BatchStatus.CLOSED:
        return True
    if batch.requests.filter(status=RequestStatus.DISPATCHED).exists():
        return False
    batch.status = BatchStatus.CLOSED
    batch.closed_at = timezone.now()
    batch.save(update_fields=["status", "closed_at"])
    return True
