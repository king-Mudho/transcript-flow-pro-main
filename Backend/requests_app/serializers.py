from rest_framework import serializers

from branches.serializers import ZimpostBranchSerializer
from requests_app.models import Request
from requests_app.services import generate_reference_number


class RequestCreateSerializer(serializers.ModelSerializer):
    """Public submission form. Deliberately excludes `paid`, `status`,
    `status_reason` and `exported_at` so an applicant cannot set their own
    request to collected or mark it paid."""

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
            "zimpost_branch",
            "fee_amount",
            "payment_method",
        )
        read_only_fields = ("id", "reference_number")

    def create(self, validated_data):
        # Generated server-side so the reference number can't be chosen or
        # guessed by the submitter. The caller wraps this in a transaction.
        validated_data["reference_number"] = generate_reference_number()
        return Request.objects.create(**validated_data)


class RequestAdminSerializer(serializers.ModelSerializer):
    """Full record for the admin dashboard. Read-only: every mutation goes
    through a dedicated endpoint (paid toggle, bulk status update) so the set of
    fields an admin can change stays explicit."""

    # Nested branch detail, so the table can show the branch name without a
    # second lookup. Named `zimpost_branches` (plural) to match the shape the
    # frontend's RequestRow type expects.
    zimpost_branches = ZimpostBranchSerializer(source="zimpost_branch", read_only=True)

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
            "zimpost_branch",
            "zimpost_branches",
            "fee_amount",
            "payment_method",
            "paid",
            "status",
            "status_reason",
            "exported_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class RequestPaidUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Request
        fields = ("paid",)


class RequestStatusLookupSerializer(serializers.ModelSerializer):
    """The only representation exposed to the public status lookup.

    The field list is the security boundary for that endpoint — it withholds
    the id, phone number, email, clearance flags and delivery address. Adding a
    field here exposes it to anyone holding a reference + registration number,
    so extend it deliberately.
    """

    class Meta:
        model = Request
        fields = (
            "reference_number",
            "full_name",
            "programme_name",
            "status",
            "status_reason",
            "paid",
            "zone",
            "fee_amount",
            "payment_method",
            "created_at",
        )
