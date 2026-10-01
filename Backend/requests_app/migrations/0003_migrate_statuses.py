from django.db import migrations


STATUS_MAP = {"submitted": "received", "in_transit": "dispatched"}


def forwards(apps, schema_editor):
    Request = apps.get_model("requests_app", "Request")
    RequestEvent = apps.get_model("requests_app", "RequestEvent")

    for old, new in STATUS_MAP.items():
        Request.objects.filter(status=old).update(status=new)
    # B1.5: stale rejection reasons go; rejected rows without one get a placeholder
    # so the new CHECK constraint can be applied.
    Request.objects.exclude(status="rejected").update(status_reason=None)
    Request.objects.filter(status="rejected", status_reason__isnull=True).update(
        status_reason="No reason recorded"
    )
    Request.objects.filter(status="rejected", status_reason="").update(
        status_reason="No reason recorded"
    )

    # B2.2: backfill history. created_at is auto_now_add, so switch that off
    # for the duration to keep the original timestamps.
    created_field = RequestEvent._meta.get_field("created_at")
    created_field.auto_now_add = False
    try:
        events = []
        for r in Request.objects.all().iterator():
            events.append(
                RequestEvent(
                    request=r,
                    event_type="status_change",
                    field="status",
                    from_value="",
                    to_value="received",
                    note="Request received",
                    created_at=r.created_at,
                )
            )
            if r.status != "received":
                events.append(
                    RequestEvent(
                        request=r,
                        event_type="status_change",
                        field="status",
                        from_value="received",
                        to_value=r.status,
                        note="Migrated from the previous status flow",
                        created_at=r.updated_at,
                    )
                )
        RequestEvent.objects.bulk_create(events, batch_size=500)
    finally:
        created_field.auto_now_add = True


def backwards(apps, schema_editor):
    Request = apps.get_model("requests_app", "Request")
    Request.objects.filter(status="received").update(status="submitted")
    Request.objects.filter(status="dispatched").update(status="in_transit")
    Request.objects.filter(status__in=["submitted_to_msu", "collected_from_msu"]).update(
        status="submitted"
    )


class Migration(migrations.Migration):
    # Data only, on purpose. Postgres refuses schema changes (such as building an
    # index) in a transaction that has already updated rows with foreign keys,
    # so the schema work lives in 0002 and the constraint in 0004.

    dependencies = [("requests_app", "0002_status_flow_dispatch")]

    operations = [migrations.RunPython(forwards, backwards)]
