"""History log: turns each change to a Request into RequestEvent rows."""

_EVENT_TYPE = {
    "status": "status_change",
    "paid": "payment",
    "batch_id": "dispatch",
}


def _display(name, value):
    if value in (None, ""):
        return ""
    if name == "zimpost_branch_id":
        from branches.models import ZimpostBranch

        branch = ZimpostBranch.objects.filter(pk=value).first()
        return f"{branch.branch_name} — {branch.branch_area}" if branch else str(value)
    if name == "batch_id":
        from requests_app.models import DispatchBatch

        batch = DispatchBatch.objects.filter(pk=value).first()
        return batch.batch_number if batch else str(value)
    return str(value)


def record_changes(request, old):
    from requests_app.models import RequestEvent

    actor = request._actor
    note = request._note or ""

    if old is None:
        RequestEvent.objects.create(
            request=request,
            event_type="status_change",
            field="status",
            from_value="",
            to_value=request.status,
            note="Request received",
            actor=actor,
        )
        return

    for name in request.TRACKED:
        before, after = getattr(old, name), getattr(request, name)
        if str(before) == str(after) or (before in (None, "") and after in (None, "")):
            continue
        RequestEvent.objects.create(
            request=request,
            event_type=_EVENT_TYPE.get(name, "details_edit"),
            field=name.removesuffix("_id"),
            from_value=_display(name, before),
            to_value=_display(name, after),
            note=note if name in ("status", "batch_id") else "",
            actor=actor,
        )
