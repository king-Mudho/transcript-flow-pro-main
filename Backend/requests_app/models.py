import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

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
LOCKED_FIELDS = ("zone", "harare_address", "suburb", "directions", "zimpost_branch_id")
OPEN_STATUSES = ("received", "submitted_to_msu", "collected_from_msu", "dispatched")


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


class Channel(models.TextChoices):
    WEB = "web", "Website"
    WHATSAPP = "whatsapp", "WhatsApp"
    PHONE = "phone", "Phone call"
    WALK_IN = "walk_in", "Walk-in"


class DocumentType(models.TextChoices):
    TRANSCRIPT = "transcript", "Academic transcript"
    DEGREE_CERTIFICATE = "degree_certificate", "Degree certificate"
    NOT_RECORDED = "not_recorded", "Not recorded"


# Reasons MSU can give when it will not release a document (B10.2).
MSU_REJECT_REASONS = {
    "library": "Library clearance not approved",
    "accounts": "Balance owing at Accounts",
    "department": "Department approval missing",
    "not_found": "Record not found",
    "other": "Other",
}


class Driver(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    whatsapp_phone = models.CharField(max_length=20, blank=True)
    bike_registration = models.CharField(max_length=32, blank=True)
    photo_url = models.URLField(max_length=500, blank=True)
    active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    # Set to a date when the driver is off that day; anything else means on.
    off_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name

    def off_today(self) -> bool:
        from requests_app.services import harare_today

        return self.off_on == harare_today()


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
    # Cash reconciliation when the batch is closed (B4.2).
    cash_expected = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cash_handed_in = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cash_received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    variance_note = models.TextField(blank=True, default="")
    reconciled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-dispatched_at"]

    @property
    def variance(self):
        if self.cash_expected is None or self.cash_handed_in is None:
            return None
        return self.cash_handed_in - self.cash_expected

    def __str__(self):
        return self.batch_number


class HandInList(models.Model):
    """Requests handed to MSU together, with a printed list for MSU to sign."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


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

    directions = models.TextField(blank=True, default="")
    suburb_ref = models.ForeignKey(
        "core.Suburb", null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    channel = models.CharField(max_length=20, choices=Channel.choices, default=Channel.WEB)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    consent_at = models.DateTimeField(null=True, blank=True)
    terms_version = models.CharField(max_length=20, blank=True, default="")
    consent_via = models.CharField(max_length=200, blank=True, default="")
    clearance_verified = models.BooleanField(default=False)
    ready_at_msu_at = models.DateTimeField(null=True, blank=True)
    ready_at_msu_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    handin_list = models.ForeignKey(
        HandInList, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    status_changed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    anonymised_at = models.DateTimeField(null=True, blank=True)

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
        "directions",
        "zimpost_branch_id",
        "phone_number",
        "email",
        "fee_amount",
        "payment_method",
        "batch_id",
        "clearance_verified",
        "ready_at_msu_at",
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
        if old is None or old.status != self.status:
            self.status_changed_at = timezone.now()

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
                old.status == RequestStatus.RECEIVED
                and self.status == RequestStatus.SUBMITTED_TO_MSU
                and not self.clearance_verified
                and not (self._note or "").strip()
            ):
                raise ValidationError(
                    "Clearance is not verified. Verify it, or add a note to override."
                )
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
        MSU = "msu", "MSU"
        HANDIN = "handin", "Hand-in list"
        MESSAGE = "message", "Message"

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
    # The actor's name when the event was written, so history still says who
    # did it after their account is deleted.
    actor_label = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["request", "-created_at"], name="idx_events_request")]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Request events cannot be edited.")
        if self.actor_id and not self.actor_label:
            self.actor_label = self.actor.full_name or self.actor.email
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Request events cannot be deleted.")


class RequestItem(models.Model):
    """Documents in a request. One fee covers every item."""

    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="items")
    document_type = models.CharField(max_length=30, choices=DocumentType.choices)
    quantity = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["request", "document_type"], name="uniq_item_per_type"),
            models.CheckConstraint(condition=Q(quantity__gte=1), name="item_quantity_positive"),
        ]

    def __str__(self):
        return f"{self.get_document_type_display()} x {self.quantity}"


def private_storage():
    from django.core.files.storage import FileSystemStorage

    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT, base_url=None)


def clearance_upload_path(instance, filename):
    return f"clearance/{instance.id}"


class ClearanceFile(models.Model):
    """A screenshot or PDF of the graduate's portal clearance.

    Stored under PRIVATE_MEDIA_ROOT, which the web server never serves: the
    file is only streamed by an endpoint that checks the reader's role.
    Uploaded before the request exists, then claimed by the submission.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(
        Request, null=True, blank=True, on_delete=models.CASCADE, related_name="clearance_files"
    )
    file = models.FileField(upload_to=clearance_upload_path, storage=private_storage)
    original_name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=60)
    size = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Payment(models.Model):
    """Cash received against a request. Never edited or deleted: a mistake is
    fixed with a reversal (a negative payment that points at the original)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(Request, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    received_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    received_by_driver = models.ForeignKey(
        Driver, null=True, blank=True, on_delete=models.PROTECT, related_name="payments"
    )
    received_at = models.DateTimeField()
    receipt_number = models.CharField(max_length=24, unique=True)
    note = models.TextField(blank=True, default="")
    reversal_of = models.OneToOneField(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversed_by"
    )
    batch = models.ForeignKey(
        DispatchBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-received_at", "-created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Payments cannot be edited. Record a reversal instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Payments cannot be deleted. Record a reversal instead.")


class TeamNote(models.Model):
    """Short internal notes on a request. Never shown to graduates."""

    id = models.BigAutoField(primary_key=True)
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="team_notes")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class SavedView(models.Model):
    """A named set of requests-list filters, kept per user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_views"
    )
    name = models.CharField(max_length=60)
    params = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]


class Notification(models.Model):
    """Every message sent (or attempted) to a graduate, with its result."""

    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Not configured"

    id = models.BigAutoField(primary_key=True)
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="notifications")
    channel = models.CharField(max_length=10)  # sms | email
    recipient = models.CharField(max_length=200)
    message = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices)
    error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
