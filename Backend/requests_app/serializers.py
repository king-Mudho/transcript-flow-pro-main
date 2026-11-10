from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from branches.models import ZimpostBranch
from branches.serializers import ZimpostBranchSerializer
from requests_app import services
from requests_app.models import (
    Channel,
    ClearanceFile,
    DispatchBatch,
    DocumentType,
    Driver,
    HandInList,
    Notification,
    Payment,
    Request,
    RequestEvent,
    RequestItem,
    RequestStatus,
    RequestZone,
    SavedView,
    TeamNote,
    allowed_next,
)


def _clean(func, *args):
    """Run a service validator, converting Django errors into DRF ones."""
    try:
        return func(*args)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages[0]) from exc


def _person(user):
    if user is None:
        return None
    return user.full_name or user.email


# ------------------------------------------------------------ submission


class ItemSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(
        choices=[DocumentType.TRANSCRIPT, DocumentType.DEGREE_CERTIFICATE]
    )
    quantity = serializers.IntegerField(min_value=1, max_value=10)


class RequestSubmitSerializer(serializers.Serializer):
    """Public submission form.

    Takes only what the graduate types. Fee, payment method, status, paid and
    exported_at are never read from the payload: they are set on the server, so
    a hand-made call cannot choose them.
    """

    full_name = serializers.CharField(min_length=2, max_length=120)
    reg_number = serializers.CharField(min_length=3, max_length=40)
    programme_name = serializers.CharField(min_length=2, max_length=160)
    year_completed = serializers.IntegerField()
    phone_number = serializers.CharField(min_length=6, max_length=30)
    email = serializers.EmailField(
        max_length=160, required=False, allow_blank=True, allow_null=True
    )
    cleared_department = serializers.BooleanField()
    cleared_accounts = serializers.BooleanField()
    cleared_library = serializers.BooleanField()
    zone = serializers.ChoiceField(choices=RequestZone.choices)
    harare_address = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    suburb = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    directions = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    zimpost_branch = serializers.PrimaryKeyRelatedField(
        queryset=ZimpostBranch.objects.all(), required=False, allow_null=True
    )
    items = ItemSerializer(many=True, required=False)
    clearance_file_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=5
    )
    consent = serializers.BooleanField(required=False, default=False)
    confirm_duplicate = serializers.BooleanField(required=False, default=False)

    def validate_full_name(self, value):
        return " ".join(value.split())

    def validate_reg_number(self, value):
        reg = services.normalise_reg(value)
        if len(reg) < 3:
            raise serializers.ValidationError("Enter your registration number.")
        return reg

    def validate_phone_number(self, value):
        return _clean(services.normalise_phone, value)

    def validate_year_completed(self, value):
        this_year = timezone.now().year
        if not (this_year - 14 <= value <= this_year):
            raise serializers.ValidationError("Year completed must be within the last 15 years.")
        return value

    def validate_items(self, value):
        merged = {}
        for item in value:
            merged[item["document_type"]] = merged.get(item["document_type"], 0) + item["quantity"]
        if not merged:
            raise serializers.ValidationError("Choose at least one document.")
        return [{"document_type": k, "quantity": v} for k, v in merged.items()]

    def validate(self, attrs):
        if not (
            attrs["cleared_department"] and attrs["cleared_accounts"] and attrs["cleared_library"]
        ):
            raise serializers.ValidationError("All three clearance approvals must be confirmed.")
        address, suburb, branch = _clean(
            services.validate_delivery,
            attrs["zone"],
            attrs.get("harare_address"),
            attrs.get("suburb"),
            attrs.get("zimpost_branch"),
        )
        if not attrs.get("consent"):
            raise serializers.ValidationError(
                "Please agree to the Terms and Privacy notice to send your request."
            )
        attrs["harare_address"], attrs["suburb"], attrs["zimpost_branch"] = address, suburb, branch
        attrs["directions"] = (
            (attrs.get("directions") or "").strip() if attrs["zone"] == RequestZone.HARARE else ""
        )
        attrs["email"] = (attrs.get("email") or "").strip() or None
        return attrs


class AssistedRequestSerializer(RequestSubmitSerializer):
    """Staff-assisted request (B9.2): the same form plus how it came in."""

    channel = serializers.ChoiceField(choices=[Channel.WHATSAPP, Channel.PHONE, Channel.WALK_IN])


# ------------------------------------------------------------ admin views


def stage_level(req, site) -> str:
    """ok | amber | red, from days in the current stage and Settings."""
    if req.status not in ("received", "submitted_to_msu", "collected_from_msu", "dispatched"):
        return "ok"
    days = days_in_stage(req)
    limits = site.thresholds(req.status) or [None, None]
    if limits[1] is not None and days >= limits[1]:
        return "red"
    if limits[0] is not None and days >= limits[0]:
        return "amber"
    return "ok"


def days_in_stage(req) -> int:
    since = req.status_changed_at or req.created_at
    return max((timezone.now() - since).days, 0)


def payment_state(req) -> str:
    if req.paid:
        return "paid"
    if req.amount_paid and req.amount_paid > 0:
        return "part_paid"
    return "unpaid"


def documents_summary(items) -> str:
    parts = []
    for item in items:
        label = {
            "transcript": "Academic transcript",
            "degree_certificate": "Degree certificate",
        }.get(item.document_type, "Document (not recorded)")
        parts.append(f"{label} × {item.quantity}")
    return ", ".join(parts) or "Academic transcript × 1"


class ItemReadSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_document_type_display", read_only=True)

    class Meta:
        model = RequestItem
        fields = ("document_type", "label", "quantity")


class RequestAdminSerializer(serializers.ModelSerializer):
    """Full record for the team. Read-only: every mutation goes through a
    dedicated endpoint so the set of fields staff can change stays explicit."""

    zimpost_branches = ZimpostBranchSerializer(source="zimpost_branch", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True, default=None)
    driver_name = serializers.CharField(
        source="batch.driver.full_name", read_only=True, default=None
    )
    handin_number = serializers.CharField(source="handin_list.number", read_only=True, default=None)
    items = ItemReadSerializer(many=True, read_only=True)
    documents = serializers.SerializerMethodField()
    allowed_next = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()
    days_in_stage = serializers.SerializerMethodField()
    stage_level = serializers.SerializerMethodField()
    payment_state = serializers.SerializerMethodField()
    cash_due = serializers.SerializerMethodField()
    possible_duplicate = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    clearance_file_count = serializers.SerializerMethodField()
    suburb_mapped = serializers.SerializerMethodField()

    class Meta:
        model = Request
        fields = (
            "id",
            "reference_number",
            "full_name",
            "reg_number",
            "programme_name",
            "year_completed",
            "phone_number",
            "email",
            "cleared_department",
            "cleared_accounts",
            "cleared_library",
            "clearance_verified",
            "clearance_file_count",
            "zone",
            "harare_address",
            "suburb",
            "suburb_mapped",
            "directions",
            "zimpost_branch",
            "zimpost_branches",
            "items",
            "documents",
            "fee_amount",
            "payment_method",
            "amount_paid",
            "paid",
            "payment_state",
            "cash_due",
            "status",
            "status_reason",
            "status_changed_at",
            "days_in_stage",
            "stage_level",
            "exported_at",
            "batch",
            "batch_number",
            "driver_name",
            "zimpost_tracking_number",
            "dispatched_at",
            "handin_number",
            "ready_at_msu_at",
            "channel",
            "created_by_name",
            "consent_at",
            "terms_version",
            "consent_via",
            "possible_duplicate",
            "anonymised_at",
            "allowed_next",
            "locked",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def _site(self):
        site = self.context.get("site")
        if site is None:
            from core.models import SiteSettings

            site = SiteSettings.load()
            self.context["site"] = site
        return site

    def get_documents(self, obj):
        return documents_summary(obj.items.all())

    def get_allowed_next(self, obj):
        return allowed_next(obj.status)

    def get_locked(self, obj):
        return obj.status in (RequestStatus.DISPATCHED, RequestStatus.COLLECTED)

    def get_days_in_stage(self, obj):
        return days_in_stage(obj)

    def get_stage_level(self, obj):
        return stage_level(obj, self._site())

    def get_payment_state(self, obj):
        return payment_state(obj)

    def get_cash_due(self, obj):
        return services.cash_due(obj)

    def get_possible_duplicate(self, obj):
        value = getattr(obj, "possible_duplicate", None)
        if value is None:
            if obj.status not in (
                "received",
                "submitted_to_msu",
                "collected_from_msu",
                "dispatched",
            ):
                return False
            return services.open_duplicates(obj.reg_number, exclude_id=obj.pk).exists()
        return bool(value)

    def get_created_by_name(self, obj):
        return _person(obj.created_by)

    def get_clearance_file_count(self, obj):
        return obj.clearance_files.count()

    def get_suburb_mapped(self, obj):
        return obj.zone != RequestZone.HARARE or obj.suburb_ref_id is not None


class ClearanceFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClearanceFile
        fields = ("id", "original_name", "content_type", "size", "created_at")


class PaymentSerializer(serializers.ModelSerializer):
    received_by = serializers.SerializerMethodField()
    is_reversal = serializers.SerializerMethodField()
    reversed = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "amount",
            "method",
            "received_by",
            "received_at",
            "receipt_number",
            "note",
            "is_reversal",
            "reversed",
            "created_at",
        )

    def get_received_by(self, obj):
        if obj.received_by_driver_id:
            return f"{obj.received_by_driver.full_name} (driver)"
        return _person(obj.received_by_user) or "—"

    def get_is_reversal(self, obj):
        return obj.reversal_of_id is not None

    def get_reversed(self, obj):
        return hasattr(obj, "reversed_by")


class TeamNoteSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    class Meta:
        model = TeamNote
        fields = ("id", "text", "author", "created_at")
        read_only_fields = ("id", "author", "created_at")

    def get_author(self, obj):
        return _person(obj.author) or "—"

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Write a note.")
        return value[:2000]


class RequestDetailSerializer(RequestAdminSerializer):
    clearance_files = ClearanceFileSerializer(many=True, read_only=True)
    payments = serializers.SerializerMethodField()
    team_notes = TeamNoteSerializer(many=True, read_only=True)
    duplicates = serializers.SerializerMethodField()

    class Meta(RequestAdminSerializer.Meta):
        fields = (
            *RequestAdminSerializer.Meta.fields,
            "clearance_files",
            "payments",
            "team_notes",
            "duplicates",
        )

    def get_payments(self, obj):
        rows = obj.payments.select_related("received_by_driver", "received_by_user").all()
        return PaymentSerializer(rows, many=True).data

    def get_duplicates(self, obj):
        return [
            {"id": str(r.id), "reference_number": r.reference_number, "status": r.status}
            for r in services.open_duplicates(obj.reg_number, exclude_id=obj.pk)[:5]
        ]


class RequestUpdateSerializer(serializers.Serializer):
    """Team PATCH: delivery details, contact details and the clearance check."""

    zone = serializers.ChoiceField(choices=RequestZone.choices, required=False)
    harare_address = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    suburb = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    directions = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    zimpost_branch = serializers.PrimaryKeyRelatedField(
        queryset=ZimpostBranch.objects.all(), required=False, allow_null=True
    )
    phone_number = serializers.CharField(min_length=6, max_length=30, required=False)
    email = serializers.EmailField(
        max_length=160, required=False, allow_blank=True, allow_null=True
    )
    clearance_verified = serializers.BooleanField(required=False)


class RequestEventSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = RequestEvent
        fields = (
            "id",
            "event_type",
            "field",
            "from_value",
            "to_value",
            "note",
            "actor",
            "created_at",
        )

    def get_actor(self, obj):
        if obj.actor:
            return _person(obj.actor)
        if obj.actor_label:
            return f"{obj.actor_label} (account deleted)"
        return "Graduate"


class MsuRequestSerializer(serializers.ModelSerializer):
    """What MSU staff may see (B10.1): no phone numbers, emails or addresses."""

    items = ItemReadSerializer(many=True, read_only=True)
    documents = serializers.SerializerMethodField()
    handin_number = serializers.CharField(source="handin_list.number", read_only=True, default=None)
    clearance_files = ClearanceFileSerializer(many=True, read_only=True)
    days_with_msu = serializers.SerializerMethodField()
    stage_level = serializers.SerializerMethodField()
    submitted_at = serializers.DateTimeField(source="status_changed_at", read_only=True)

    class Meta:
        model = Request
        fields = (
            "id",
            "reference_number",
            "full_name",
            "reg_number",
            "programme_name",
            "year_completed",
            "items",
            "documents",
            "cleared_department",
            "cleared_accounts",
            "cleared_library",
            "clearance_verified",
            "clearance_files",
            "status",
            "status_reason",
            "handin_number",
            "ready_at_msu_at",
            "days_with_msu",
            "stage_level",
            "submitted_at",
        )
        read_only_fields = fields

    def get_documents(self, obj):
        return documents_summary(obj.items.all())

    def get_days_with_msu(self, obj):
        return days_in_stage(obj) if obj.status == RequestStatus.SUBMITTED_TO_MSU else None

    def get_stage_level(self, obj):
        from core.models import SiteSettings

        site = self.context.setdefault("site", SiteSettings.load())
        return stage_level(obj, site)


class HandInListSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    request_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = HandInList
        fields = ("id", "number", "created_by", "created_at", "request_count")

    def get_created_by(self, obj):
        return _person(obj.created_by) or "—"


class SavedViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedView
        fields = ("id", "name", "params", "created_at")
        read_only_fields = ("id", "created_at")


class NotificationSerializer(serializers.ModelSerializer):
    reference_number = serializers.CharField(source="request.reference_number", read_only=True)
    request_id = serializers.UUIDField(source="request.id", read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "request_id",
            "reference_number",
            "channel",
            "recipient",
            "message",
            "status",
            "error",
            "created_at",
        )


# ------------------------------------------------------------ public lookup


def lookup_payload(req: Request) -> dict:
    """The only representation exposed to the public status lookup.

    This function is the security boundary for that endpoint. It never returns
    staff names, team notes, the id, clearance flags or the graduate's contact
    details. The delivery address is shown to someone who has proved both the
    reference and registration number, as in the tracking design (G08).
    Driver details appear only for a Harare request that is currently
    Dispatched in a batch.
    """
    # Date each stage was last reached. Status changes only.
    reached = {}
    for event in req.events.filter(event_type="status_change").order_by("created_at", "id"):
        reached[event.to_value] = event.created_at

    branch = req.zimpost_branch if req.zone == RequestZone.OUTSIDE_HARARE else None
    if req.zone == RequestZone.HARARE:
        deliver_to = ", ".join(p for p in [req.harare_address or "", req.suburb or ""] if p)
    else:
        deliver_to = f"Zimpost {branch.branch_name}" if branch else ""

    data = {
        "reference_number": req.reference_number,
        "full_name": req.full_name,
        "programme_name": req.programme_name,
        "status": req.status,
        "status_reason": req.status_reason if req.status == RequestStatus.REJECTED else None,
        "paid": req.paid,
        "amount_paid": req.amount_paid,
        "zone": req.zone,
        "fee_amount": req.fee_amount,
        "payment_method": req.payment_method,
        "created_at": req.created_at,
        "documents": documents_summary(req.items.all()),
        "items": [
            {"document_type": i.document_type, "quantity": i.quantity} for i in req.items.all()
        ],
        "deliver_to": "" if req.anonymised_at else deliver_to,
        "address_editable": req.status not in (RequestStatus.DISPATCHED, RequestStatus.COLLECTED),
        "stages": reached,
        "branch": (
            {"branch_name": branch.branch_name, "branch_area": branch.branch_area}
            if branch
            else None
        ),
        "zimpost": None,
        "driver": None,
        "delivered_by": None,
    }

    if req.zone == RequestZone.OUTSIDE_HARARE and req.status in (
        RequestStatus.DISPATCHED,
        RequestStatus.COLLECTED,
    ):
        data["zimpost"] = {
            "dispatched_at": req.dispatched_at,
            "tracking_number": req.zimpost_tracking_number or None,
        }

    if req.zone == RequestZone.HARARE and req.batch_id:
        driver = req.batch.driver
        if req.status == RequestStatus.DISPATCHED:
            data["driver"] = {
                "full_name": driver.full_name,
                "phone": driver.phone,
                "whatsapp_phone": driver.whatsapp_phone or driver.phone,
                "bike_registration": driver.bike_registration,
                "photo_url": driver.photo_url or None,
                "dispatched_at": req.dispatched_at,
            }
        elif req.status == RequestStatus.COLLECTED:
            data["delivered_by"] = driver.full_name.split()[0] if driver.full_name else None
    return data


# --------------------------------------------------------------- dispatch


class DriverSerializer(serializers.ModelSerializer):
    off_today = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    available_today = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Driver
        fields = (
            "id",
            "full_name",
            "phone",
            "whatsapp_phone",
            "bike_registration",
            "photo_url",
            "active",
            "notes",
            "off_today",
            "available_today",
            "state",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
        extra_kwargs = {"whatsapp_phone": {"required": False, "allow_blank": True}}

    def get_off_today(self, obj):
        return obj.off_today()

    def get_state(self, obj):
        return services.driver_state(obj)

    def validate_phone(self, value):
        return _clean(services.normalise_phone, value)

    def validate_whatsapp_phone(self, value):
        return _clean(services.normalise_phone, value) if value else ""

    def validate(self, attrs):
        # WhatsApp number defaults to the phone number.
        if not attrs.get("whatsapp_phone"):
            phone = attrs.get("phone") or (self.instance.phone if self.instance else "")
            if "whatsapp_phone" in attrs or self.instance is None:
                attrs["whatsapp_phone"] = phone
        if "available_today" in attrs:
            available = attrs.pop("available_today")
            attrs["off_on"] = None if available else services.harare_today()
        return attrs


class BatchSerializer(serializers.ModelSerializer):
    driver = DriverSerializer(read_only=True)
    document_count = serializers.SerializerMethodField()
    outstanding = serializers.SerializerMethodField()
    delivered = serializers.SerializerMethodField()
    cash_to_collect = serializers.SerializerMethodField()
    cash_received_by_name = serializers.SerializerMethodField()
    variance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = DispatchBatch
        fields = (
            "id",
            "batch_number",
            "status",
            "driver",
            "dispatched_at",
            "closed_at",
            "notes",
            "document_count",
            "outstanding",
            "delivered",
            "cash_to_collect",
            "cash_expected",
            "cash_handed_in",
            "cash_received_by_name",
            "variance",
            "variance_note",
            "reconciled_at",
        )

    def get_document_count(self, obj):
        return obj.requests.count()

    def get_outstanding(self, obj):
        return obj.requests.filter(status=RequestStatus.DISPATCHED).count()

    def get_delivered(self, obj):
        return obj.requests.filter(status=RequestStatus.COLLECTED).count()

    def get_cash_to_collect(self, obj):
        """Cash so far: delivered documents still owing cash on delivery."""
        if obj.cash_expected is not None:
            return obj.cash_expected
        return services.batch_cash_expected(obj)

    def get_cash_received_by_name(self, obj):
        return _person(obj.cash_received_by)


class BatchDetailSerializer(BatchSerializer):
    requests = serializers.SerializerMethodField()

    class Meta(BatchSerializer.Meta):
        fields = (*BatchSerializer.Meta.fields, "requests")

    def get_requests(self, obj):
        # A fixed order (by suburb, then reference) so the batch page, the
        # waybill and the labels list documents the same way every time.
        rows = (
            obj.requests.select_related("zimpost_branch", "batch__driver", "handin_list")
            .prefetch_related("items")
            .order_by("suburb", "reference_number")
        )
        return RequestAdminSerializer(rows, many=True).data
