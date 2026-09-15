import uuid

from django.db import models

from branches.models import ZimpostBranch


class RequestStatus(models.TextChoices):
    SUBMITTED = "submitted", "Submitted"
    IN_TRANSIT = "in_transit", "In transit"
    COLLECTED = "collected", "Collected"
    REJECTED = "rejected", "Rejected"


class RequestZone(models.TextChoices):
    HARARE = "harare", "Harare"
    OUTSIDE_HARARE = "outside_harare", "Outside Harare"


class PaymentMethod(models.TextChoices):
    CASH_ON_DELIVERY = "cash_on_delivery", "Cash on delivery"
    CASH_DEPOSIT = "cash_deposit", "Cash deposit"


class Request(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_number = models.CharField(max_length=32, unique=True)
    full_name = models.CharField(max_length=255)
    reg_number = models.CharField(max_length=64)
    programme_name = models.CharField(max_length=255)
    year_completed = models.IntegerField()
    phone_number = models.CharField(max_length=32)
    email = models.EmailField(null=True, blank=True)
    cleared_department = models.BooleanField(default=False)
    cleared_accounts = models.BooleanField(default=False)
    cleared_library = models.BooleanField(default=False)
    zone = models.CharField(max_length=20, choices=RequestZone.choices)
    harare_address = models.TextField(null=True, blank=True)
    zimpost_branch = models.ForeignKey(
        ZimpostBranch, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    paid = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20, choices=RequestStatus.choices, default=RequestStatus.SUBMITTED
    )
    status_reason = models.TextField(null=True, blank=True)
    exported_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"], name="idx_requests_status"),
            models.Index(fields=["-created_at"], name="idx_requests_created"),
            models.Index(fields=["zone"], name="idx_requests_zone"),
        ]

    def __str__(self):
        return self.reference_number
