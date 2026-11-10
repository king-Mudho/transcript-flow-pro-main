"""Messages to graduates (B5.2).

Phase 1 is manual: the admin workspace opens WhatsApp with `message_for()`.
Phase 2 is automatic: each status change sends one SMS (when an SMS provider is
configured) and one email (when the graduate gave an address). Every attempt
is logged in Notification with its result, so failed sends are visible.

Sending never raises: a provider outage must not stop a status change.
"""

import json
import logging
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def tracking_link(req) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/status?ref={req.reference_number}"


def template_key(req) -> str:
    if req.status == "dispatched":
        return "dispatched_harare" if req.zone == "harare" else "dispatched_zimpost"
    return req.status


def message_for(req, site=None) -> str:
    from core.models import SiteSettings

    site = site or SiteSettings.load()
    driver = req.batch.driver if req.batch_id and req.batch else None
    branch = req.zimpost_branch
    first = (req.full_name or "").split()[0] if req.full_name else ""
    values = {
        "name": req.full_name,
        "first_name": first,
        "reference": req.reference_number,
        "link": tracking_link(req),
        "fee": f"{req.fee_amount:g}" if req.fee_amount is not None else "",
        "branch": branch.branch_name if branch else "",
        "driver": driver.full_name if driver else "your driver",
        "driver_phone": driver.phone if driver else "",
        "reason": req.status_reason or "",
        "service": site.service_name,
        "support": site.support_whatsapp,
    }
    template = site.message(template_key(req))
    try:
        return template.format(**values)
    except (KeyError, IndexError, ValueError):
        # A mistyped placeholder in Settings must not stop the message.
        return template


def _send_sms(phone: str, text: str):
    request = urllib.request.Request(
        settings.SMS_API_URL,
        data=json.dumps({"to": phone, "message": text, "sender": settings.SMS_SENDER_ID}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.SMS_API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 (configured URL)
        if response.status >= 300:
            raise RuntimeError(f"SMS provider answered {response.status}")


def notify_status(request_id):
    from requests_app.models import Notification, Request

    req = (
        Request.objects.select_related("batch__driver", "zimpost_branch")
        .filter(pk=request_id)
        .first()
    )
    if req is None or req.anonymised_at:
        return
    text = message_for(req)

    # SMS
    if req.phone_number:
        if not settings.SMS_API_URL:
            Notification.objects.create(
                request=req,
                channel="sms",
                recipient=req.phone_number,
                message=text,
                status=Notification.Status.SKIPPED,
                error="No SMS provider configured.",
            )
        else:
            try:
                _send_sms(req.phone_number, text)
                Notification.objects.create(
                    request=req,
                    channel="sms",
                    recipient=req.phone_number,
                    message=text,
                    status=Notification.Status.SENT,
                )
            except Exception as exc:  # noqa: BLE001 - any provider failure is logged
                logger.warning("SMS to %s failed: %s", req.reference_number, exc)
                Notification.objects.create(
                    request=req,
                    channel="sms",
                    recipient=req.phone_number,
                    message=text,
                    status=Notification.Status.FAILED,
                    error=str(exc)[:500],
                )

    # Email
    if req.email:
        from core.models import SiteSettings

        subject = f"{SiteSettings.load().short_name}: {req.reference_number} update"
        try:
            send_mail(subject, text, None, [req.email])
            Notification.objects.create(
                request=req,
                channel="email",
                recipient=req.email,
                message=text,
                status=Notification.Status.SENT,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Email to %s failed: %s", req.reference_number, exc)
            Notification.objects.create(
                request=req,
                channel="email",
                recipient=req.email,
                message=text,
                status=Notification.Status.FAILED,
                error=str(exc)[:500],
            )
