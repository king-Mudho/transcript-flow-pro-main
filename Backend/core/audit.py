import json


def _jsonable(value):
    """Round-trip through JSON so Decimals, UUIDs and dates are stored as text."""
    if value is None:
        return None
    return json.loads(json.dumps(value, default=str))


def audit(actor, action, entity, entity_id="", old=None, new=None):
    """Write one audit-log entry. `old` and `new` are any JSON-like values."""
    from core.models import AuditLog

    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id or ""),
        old_value=_jsonable(old),
        new_value=_jsonable(new),
    )
