"""History log: turns each change to a Request into RequestEvent rows."""

_EVENT_TYPE = {
    "status": "status_change",
    "batch_id": "dispatch",
    "ready_at_msu_at": "msu",
    "handin_list_id": "handin",
}

_FIELD_NAMES = {
    "ready_at_msu_at": "ready_at_msu",
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
    if name == "handin_list_id":
        from requests_app.models import HandInList

        handin = HandInList.objects.filter(pk=value).first()
        return handin.number if handin else str(value)
    if name == "ready_at_msu_at":
        return "Ready at MSU"
    if name == "clearance_verified":
        return "Verified" if value else "Not verified"
    return str(value)


def record_changes(request, old):
    from django.db import transaction

    from requests_app.models import RequestEvent
    from requests_app.notifications import notify_status

    actor = request._actor
    note = request._note or ""

    if old is None:
        RequestEvent.objects.create(
            request=request,
            event_type="status_change",
            field="status",
            from_value="",
            to_value=request.status,
            note=note or "Request received",
            actor=actor,
        )
        transaction.on_commit(lambda: notify_status(request.pk))
        return

    for name in request.TRACKED:
        before, after = getattr(old, name), getattr(request, name)
        if str(before) == str(after) or (
            before in (None, "", False) and after in (None, "", False)
        ):
            continue
        if name == "ready_at_msu_at" and before and after:
            continue
        RequestEvent.objects.create(
            request=request,
            event_type=_EVENT_TYPE.get(name, "details_edit"),
            field=_FIELD_NAMES.get(name, name.removesuffix("_id")),
            from_value=_display(name, before),
            to_value=_display(name, after)
            if after
            else ("Not ready" if name == "ready_at_msu_at" else ""),
            note=note if name in ("status", "batch_id") else "",
            actor=actor,
        )
        if name == "status":
            transaction.on_commit(lambda: notify_status(request.pk))
