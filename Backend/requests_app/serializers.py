from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from branches.models import ZimpostBranch
from branches.serializers import ZimpostBranchSerializer
from requests_app import services
from requests_app.models import (
    DispatchBatch,
    Driver,
    Request,
    RequestEvent,
    RequestStatus,
    RequestZone,
    allowed_next,
)


def _clean(func, *args):
    """Run a service validator, converting Django errors into DRF ones."""
    try:
        return func(*args)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages[0]) from exc


class RequestSubmitSerializer(serializers.Serializer):
    """Public submission form.

    Takes only what the graduate types. Fee, payment method, status, paid and
    exported_at are never read from the payload: they are set here, so a
    hand-made call cannot choose them.
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
    zimpost_branch = serializers.PrimaryKeyRelatedField(
        queryset=ZimpostBranch.objects.all(), required=False, allow_null=True
    )

    def validate_year_completed(self, value):
        this_year = timezone.now().year
        if not (this_year - 14 <= value <= this_year):
            raise serializers.ValidationError("Year completed must be within the last 15 years.")
        return value

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
        attrs["harare_address"], attrs["suburb"], attrs["zimpost_branch"] = address, suburb, branch
        attrs["email"] = (attrs.get("email") or "").strip() or None
        return attrs

    def create(self, validated_data):
        fee, payment_method = services.fee_for_zone(validated_data["zone"])
        return Request.objects.create(
            reference_number=services.generate_reference_number(),
            fee_amount=fee,
            payment_method=payment_method,
            **validated_data,
        )


class RequestAdminSerializer(serializers.ModelSerializer):
    """Full record for the admin dashboard. Read-only: every mutation goes
    through a dedicated endpoint so the set of fields an admin can change stays
    explicit."""

    zimpost_branches = ZimpostBranchSerializer(source="zimpost_branch", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True, default=None)
    driver_name = serializers.CharField(
        source="batch.driver.full_name", read_only=True, default=None
    )
    allowed_next = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()

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
            "zone",
            "harare_address",
            "suburb",
            "zimpost_branch",
            "zimpost_branches",
            "fee_amount",
            "payment_method",
            "paid",
            "status",
            "status_reason",
            "exported_at",
            "batch",
            "batch_number",
            "driver_name",
            "zimpost_tracking_number",
            "dispatched_at",
            "allowed_next",
            "locked",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_allowed_next(self, obj):
        return allowed_next(obj.status)

    def get_locked(self, obj):
        return obj.status in (RequestStatus.DISPATCHED, RequestStatus.COLLECTED)


class RequestUpdateSerializer(serializers.Serializer):
    """Admin PATCH: the paid tick plus delivery details."""

    paid = serializers.BooleanField(required=False)
    zone = serializers.ChoiceField(choices=RequestZone.choices, required=False)
    harare_address = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    suburb = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    zimpost_branch = serializers.PrimaryKeyRelatedField(
        queryset=ZimpostBranch.objects.all(), required=False, allow_null=True
    )
    phone_number = serializers.CharField(min_length=6, max_length=30, required=False)
    email = serializers.EmailField(
        max_length=160, required=False, allow_blank=True, allow_null=True
    )


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
        return obj.actor.email if obj.actor else "Graduate"


# ------------------------------------------------------------ public lookup


def lookup_payload(req: Request) -> dict:
    """The only representation exposed to the public status lookup.

    This function is the security boundary for that endpoint. It never returns
    staff names, notes, the id, contact details, clearance flags or the
    delivery address. Driver details appear only for a Harare request that is
    currently Dispatched in a batch.
    """
    # Date each stage was last reached. Status changes only.
    reached = {}
    for event in req.events.filter(event_type="status_change").order_by("created_at", "id"):
        reached[event.to_value] = event.created_at

    branch = req.zimpost_branch if req.zone == RequestZone.OUTSIDE_HARARE else None
    data = {
        "reference_number": req.reference_number,
        "full_name": req.full_name,
        "programme_name": req.programme_name,
        "status": req.status,
        "status_reason": req.status_reason if req.status == RequestStatus.REJECTED else None,
        "paid": req.paid,
        "zone": req.zone,
        "fee_amount": req.fee_amount,
        "payment_method": req.payment_method,
        "created_at": req.created_at,
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
            "created_at",
        )
        read_only_fields = ("id", "created_at")
        extra_kwargs = {"whatsapp_phone": {"required": False, "allow_blank": True}}

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
        return attrs


class BatchSerializer(serializers.ModelSerializer):
    driver = DriverSerializer(read_only=True)
    document_count = serializers.SerializerMethodField()
    outstanding = serializers.SerializerMethodField()

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
        )

    def get_document_count(self, obj):
        return obj.requests.count()

    def get_outstanding(self, obj):
        return obj.requests.filter(status=RequestStatus.DISPATCHED).count()


class BatchDetailSerializer(BatchSerializer):
    requests = RequestAdminSerializer(many=True, read_only=True)

    class Meta(BatchSerializer.Meta):
        fields = (*BatchSerializer.Meta.fields, "requests")
