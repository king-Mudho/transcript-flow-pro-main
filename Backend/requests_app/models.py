import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from branches.models import ZimpostBranch


class RequestStatus(models.TextChoices):
    RECEIVED = "received", "Received"
    SUBMITTED_TO_MSU = "submitted_to_msu", "Submitted to MSU"
    COLLECTED_FROM_MSU = "collected_from_msu", "Collected from MSU"
    REJECTED = "rejected", "Rejected"
    DISPATCHED = "dispatched", "Dispatched"
    COLLECTED = "collected", "Collected"


# Allowed forward moves. Anything not listed here (or in BACK_MOVES) is refused.
FORWARD_MOVES = {
    "received": ["submitted_to_msu"],
    "submitted_to_msu": ["collected_from_msu", "rejected"],
    "collected_from_msu": ["dispatched"],
    "dispatched": ["collected"],
    "rejected": [],
    "collected": [],
}

# One step back to fix a mistake. Always needs a note.
BACK_MOVES = {
    "submitted_to_msu": ["received"],
    "collected_from_msu": ["submitted_to_msu"],
    "rejected": ["submitted_to_msu"],
    "dispatched": ["collected_from_msu"],
    "collected": ["dispatched"],
}

LOCKED_STATUSES = ("dispatched", "collected")
LOCKED_FIELDS = ("zone", "harare_address", "suburb", "zimpost_branch_id")


def allowed_next(status: str) -> list[str]:
    """Statuses reachable from `status`, forward moves first."""
    return list(FORWARD_MOVES.get(status, [])) + list(BACK_MOVES.get(status, []))


def is_back_move(old: str, new: str) -> bool:
    return new in BACK_MOVES.get(old, [])


class RequestZone(models.TextChoices):
    HARARE = "harare", "Harare"
    OUTSIDE_HARARE = "outside_harare", "Outside Harare"


class PaymentMethod(models.TextChoices):
    CASH_ON_DELIVERY = "cash_on_delivery", "Cash on delivery"
    CASH_DEPOSIT = "cash_deposit", "Cash deposit"


class Driver(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    whatsapp_phone = models.CharField(max_length=20, blank=True)
    bike_registration = models.CharField(max_length=32, blank=True)
    photo_url = models.URLField(max_length=500, blank=True)
    active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name


class BatchStatus(models.TextChoices):
    OUT_FOR_DELIVERY = "out_for_delivery", "Out for delivery"
    CLOSED = "closed", "Closed"


class DispatchBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch_number = models.CharField(max_length=32, unique=True)
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="batches")
    status = models.CharField(
        max_length=20, choices=BatchStatus.choices, default=BatchStatus.OUT_FOR_DELIVERY
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    dispatched_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-dispatched_at"]

    def __str__(self):
        return self.batch_number


class Request(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_number = models.CharField(max_length=32, unique=True)
    full_name = models.CharField(max_length=255)
    reg_number = models.CharField(max_length=64, db_index=True)
    programme_name = models.CharField(max_length=255)
    year_completed = models.IntegerField()
    phone_number = models.CharField(max_length=32, db_index=True)
    email = models.EmailField(null=True, blank=True)
    cleared_department = models.BooleanField(default=False)
    cleared_accounts = models.BooleanField(default=False)
    cleared_library = models.BooleanField(default=False)
    zone = models.CharField(max_length=20, choices=RequestZone.choices)
    harare_address = models.TextField(null=True, blank=True)
    suburb = models.CharField(max_length=120, blank=True, default="")
    zimpost_branch = models.ForeignKey(
        ZimpostBranch, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    paid = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20, choices=RequestStatus.choices, default=RequestStatus.RECEIVED
    )
    status_reason = models.TextField(null=True, blank=True)
    exported_at = models.DateTimeField(null=True, blank=True)
    batch = models.ForeignKey(
        DispatchBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    zimpost_tracking_number = models.CharField(max_length=64, blank=True, default="")
    dispatched_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"], name="idx_requests_status"),
            models.Index(fields=["-created_at"], name="idx_requests_created"),
            models.Index(fields=["zone"], name="idx_requests_zone"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="rejected")
                | (Q(status_reason__isnull=False) & ~Q(status_reason="")),
                name="rejected_requires_reason",
            ),
        ]

    def __str__(self):
        return self.reference_number

    # ------------------------------------------------------------------
    # Every write goes through save(), so the rules below hold for the API,
    # the Django admin and scripts alike. Callers that know who is acting set
    # `_actor` (a User) and optionally `_note` / `_via_batch` before saving.
    # (Queryset .update() bypasses save(); do not use it on requests.)
    # ------------------------------------------------------------------

    _actor = None
    _note = ""
    _via_batch = False

    TRACKED = (
        "status",
        "zone",
        "harare_address",
        "suburb",
        "zimpost_branch_id",
        "phone_number",
        "email",
        "fee_amount",
        "payment_method",
        "paid",
        "batch_id",
    )

    def save(self, *args, **kwargs):
        from requests_app.events import record_changes

        old = None
        if not self._state.adding:
            old = Request.objects.filter(pk=self.pk).first()

        if old is not None:
            self._validate_transition(old)

        # Any status other than Rejected carries no reason.
        if self.status != RequestStatus.REJECTED:
            self.status_reason = None

        super().save(*args, **kwargs)
        record_changes(self, old)
        self._note = ""
        self._via_batch = False

    def _validate_transition(self, old):
        if old.status != self.status:
            if self.status not in allowed_next(old.status):
                raise ValidationError(
                    f"Cannot move from {RequestStatus(old.status).label} "
                    f"to {RequestStatus(self.status).label}."
                )
            if is_back_move(old.status, self.status) and not (self._note or "").strip():
                raise ValidationError("Stepping back a stage needs a note explaining why.")
            if self.status == RequestStatus.REJECTED and not (self.status_reason or "").strip():
                raise ValidationError("A rejection needs a reason.")
            if (
                self.status == RequestStatus.DISPATCHED
                and self.zone == RequestZone.HARARE
                and not self._via_batch
            ):
                raise ValidationError("Harare requests are dispatched through a dispatch batch.")

        if old.status in LOCKED_STATUSES and self.status in LOCKED_STATUSES:
            for name in LOCKED_FIELDS:
                if getattr(old, name) != getattr(self, name):
                    raise ValidationError("Delivery details are locked after dispatch.")


class RequestEvent(models.Model):
    """Append-only history of a request. Written by Request.save() and the
    dispatch service only; nothing in the API can edit or delete a row."""

    class EventType(models.TextChoices):
        STATUS_CHANGE = "status_change", "Status change"
        DETAILS_EDIT = "details_edit", "Details edit"
        DISPATCH = "dispatch", "Dispatch"
        PAYMENT = "payment", "Payment"
        NOTE = "note", "Note"

    id = models.BigAutoField(primary_key=True)
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    field = models.CharField(max_length=40, blank=True)
    from_value = models.TextField(blank=True, null=True)
    to_value = models.TextField(blank=True, null=True)
    note = models.TextField(blank=True, default="")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["request", "-created_at"], name="idx_events_request")]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Request events cannot be edited.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Request events cannot be deleted.")
