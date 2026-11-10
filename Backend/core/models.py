from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# Messages sent to graduates at each stage (WhatsApp templates and automatic
# SMS/email). Placeholders: {name} {first_name} {reference} {link} {fee}
# {branch} {driver} {driver_phone} {reason} {service} {support}.
DEFAULT_MESSAGES = {
    "received": (
        "Hello {first_name}, we have your request {reference}. We will submit it to MSU next. "
        "Track it: {link}"
    ),
    "submitted_to_msu": (
        "Hello {first_name}, your request {reference} is now with MSU. We will collect your "
        "document once MSU releases it. Track it: {link}"
    ),
    "collected_from_msu": (
        "Good news {first_name}: we have collected your document for {reference} from MSU. "
        "Next, it goes out for delivery. Track it: {link}"
    ),
    "rejected": (
        "Hello {first_name}, MSU could not release your document for {reference}. Reason: "
        "{reason}. You owe nothing for this request. Questions? WhatsApp {support}."
    ),
    "dispatched_harare": (
        "Hello {first_name}, your document ({reference}) is on its way with {driver}, "
        "{driver_phone}. Please have US${fee} ready in cash. Track it: {link}"
    ),
    "dispatched_zimpost": (
        "Hello {first_name}, your document ({reference}) has been sent to Zimpost {branch}. "
        "Track it: {link}"
    ),
    "collected": (
        "Thank you {first_name}. Your request {reference} is complete. We hope it serves you well."
    ),
}

# Days in a stage before the requests list shows amber, then red.
DEFAULT_THRESHOLDS = {
    "received": [2, 4],
    "submitted_to_msu": [5, 10],
    "collected_from_msu": [2, 4],
    "dispatched": [2, 5],
}


def _default_messages():
    return dict(DEFAULT_MESSAGES)


def _default_thresholds():
    return {k: list(v) for k, v in DEFAULT_THRESHOLDS.items()}


class SiteSettings(models.Model):
    """One row of service-wide settings, edited on the admin Settings page.

    Prices here are what new requests are charged. Each request stores the fee
    it was made with, so changing a price never alters existing requests.
    """

    fee_harare = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("15.00"))
    fee_outside = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("20.00"))

    # Brand (B11.4). Every screen, PDF and message reads these.
    service_name = models.CharField(max_length=120, default="MSU Transcript Collection Solution")
    short_name = models.CharField(max_length=60, default="MSU Transcript")
    tagline = models.CharField(max_length=120, default="Collection Solution")
    operator_line = models.CharField(
        max_length=200, default="Operated by Sofala Digital for MSU graduates."
    )
    support_whatsapp = models.CharField(max_length=20, default="+263714460652")
    primary_color = models.CharField(max_length=7, default="#0F2750")
    accent_color = models.CharField(max_length=7, default="#D19936")
    logo_url = models.URLField(max_length=500, blank=True, default="")

    hub_address = models.CharField(
        max_length=255, default="MSU Transcript hub, Harare", help_text="Pickup point on labels"
    )
    msu_portal_enabled = models.BooleanField(default=False)
    retention_months = models.PositiveIntegerField(default=12)
    terms_version = models.CharField(max_length=20, default="2026-10")
    stage_thresholds = models.JSONField(default=_default_thresholds)
    message_templates = models.JSONField(default=_default_messages)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "site settings"
        verbose_name_plural = "site settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Settings cannot be deleted.")

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def message(self, key: str) -> str:
        return (self.message_templates or {}).get(key) or DEFAULT_MESSAGES.get(key, "")

    def thresholds(self, stage: str):
        value = (self.stage_thresholds or {}).get(stage) or DEFAULT_THRESHOLDS.get(stage)
        return value


class Suburb(models.Model):
    """Managed list of Harare suburbs, used by the request form and to group
    deliveries on the Dispatch page."""

    name = models.CharField(max_length=120, unique=True)
    area = models.CharField(max_length=120, blank=True, default="")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class AuditLog(models.Model):
    """Every change to prices, roles, branches, suburbs, drivers and settings,
    plus data-protection actions. Append-only."""

    id = models.BigAutoField(primary_key=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    actor_label = models.CharField(max_length=200, blank=True, default="")
    action = models.CharField(max_length=60)
    entity = models.CharField(max_length=60)
    entity_id = models.CharField(max_length=64, blank=True, default="")
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["entity", "-created_at"], name="idx_audit_entity")]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Audit entries cannot be edited.")
        if self.actor_id and not self.actor_label:
            self.actor_label = self.actor.full_name or self.actor.email
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit entries cannot be deleted.")


class AnalyticsEvent(models.Model):
    """Privacy-friendly usage counting: no IP address, no cookies, no user
    agent. `visit` is a random id the browser keeps for one tab session, so a
    funnel can be counted without identifying anyone."""

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=40)  # page_view | funnel
    path = models.CharField(max_length=200, blank=True, default="")
    step = models.CharField(max_length=40, blank=True, default="")
    visit = models.CharField(max_length=40, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)


class ClientError(models.Model):
    """Errors reported by the graduate site and admin workspace browsers."""

    id = models.BigAutoField(primary_key=True)
    message = models.TextField()
    stack = models.TextField(blank=True, default="")
    url = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
