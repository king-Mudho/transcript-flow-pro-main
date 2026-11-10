import re

from django.db import migrations


def _phone(raw):
    digits = re.sub(r"[\s\-().]", "", raw or "")
    if digits.startswith("00263"):
        digits = "+" + digits[2:]
    elif digits.startswith("263"):
        digits = "+" + digits
    elif digits.startswith("0"):
        digits = "+263" + digits[1:]
    elif re.fullmatch(r"7\d{8}", digits):
        digits = "+263" + digits
    return digits if re.fullmatch(r"\+2637\d{8}", digits) else None


def forwards(apps, schema_editor):
    """Bring existing requests up to the new rules without touching history:

    - status_changed_at from the latest status event (or updated_at)
    - one "Not recorded" item per request (B5.7)
    - clearance treated as verified for requests already past Received (B5.6)
    - a legacy payment row for requests already ticked Paid (B4.1)
    - phone numbers to +2637… and reg numbers uppercase without spaces (B5.3)
    - Harare suburbs linked to the managed suburb list where the name matches
    """
    Request = apps.get_model("requests_app", "Request")
    RequestEvent = apps.get_model("requests_app", "RequestEvent")
    RequestItem = apps.get_model("requests_app", "RequestItem")
    Payment = apps.get_model("requests_app", "Payment")
    Suburb = apps.get_model("core", "Suburb")

    suburbs = {s.name.lower(): s for s in Suburb.objects.all()}
    legacy = 0
    for req in Request.objects.all().iterator():
        fields = {}
        last = (
            RequestEvent.objects.filter(request_id=req.pk, event_type="status_change")
            .order_by("-created_at")
            .values_list("created_at", flat=True)
            .first()
        )
        fields["status_changed_at"] = last or req.updated_at or req.created_at
        if req.status != "received":
            fields["clearance_verified"] = True
        phone = _phone(req.phone_number)
        if phone and phone != req.phone_number:
            fields["phone_number"] = phone
        reg = re.sub(r"\s+", "", req.reg_number or "").upper()
        if reg and reg != req.reg_number:
            fields["reg_number"] = reg
        if req.zone == "harare" and req.suburb:
            match = suburbs.get(req.suburb.strip().lower())
            if match:
                fields["suburb_ref_id"] = match.pk
        if req.paid and not Payment.objects.filter(request_id=req.pk).exists():
            legacy += 1
            Payment.objects.create(
                request_id=req.pk,
                amount=req.fee_amount,
                method=req.payment_method,
                received_at=req.updated_at or req.created_at,
                receipt_number=f"RCT-LEGACY-{legacy:05d}",
                note="Marked paid before payments were recorded in detail.",
            )
            fields["amount_paid"] = req.fee_amount
        Request.objects.filter(pk=req.pk).update(**fields)
        if not RequestItem.objects.filter(request_id=req.pk).exists():
            RequestItem.objects.create(request_id=req.pk, document_type="not_recorded", quantity=1)


class Migration(migrations.Migration):
    dependencies = [
        ("requests_app", "0005_dispatchbatch_cash_expected_and_more"),
        ("core", "0002_seed_settings_and_suburbs"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
