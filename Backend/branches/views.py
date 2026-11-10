import csv
import io

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from branches.models import ZimpostBranch
from branches.serializers import ZimpostBranchSerializer
from core.audit import audit


class ZimpostBranchViewSet(viewsets.ModelViewSet):
    """GET /?active=true is public (the request form's searchable list);
    everything else is admin-only. A branch any request uses can only be
    deactivated, never deleted."""

    queryset = ZimpostBranch.objects.all().order_by("branch_area", "branch_name")
    serializer_class = ZimpostBranchSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        if self.action == "list" and self.request.query_params.get("active") == "true":
            return [AllowAny()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list" and self.request.query_params.get("active") == "true":
            qs = qs.filter(active=True)
        return qs

    def perform_create(self, serializer):
        branch = serializer.save()
        audit(self.request.user, "branch.create", "branch", branch.pk, None, serializer.data)

    def perform_update(self, serializer):
        before = ZimpostBranchSerializer(serializer.instance).data
        branch = serializer.save()
        audit(
            self.request.user, "branch.update", "branch", branch.pk, dict(before), serializer.data
        )

    def destroy(self, request, *args, **kwargs):
        branch = self.get_object()
        if branch.requests.exists():
            return Response(
                {"detail": "Requests use this branch, so it can only be deactivated."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        before = ZimpostBranchSerializer(branch).data
        branch.delete()
        audit(request.user, "branch.delete", "branch", before["id"], dict(before), None)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="import")
    def import_csv(self, request):
        """POST a CSV file with columns branch_name, branch_area[, active].
        Existing branches (same name and area) are updated, new ones added."""
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Choose a CSV file."}, status=400)
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return Response({"detail": "Save the CSV as UTF-8 and try again."}, status=400)
        reader = csv.DictReader(io.StringIO(text))
        fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
        if not {"branch_name", "branch_area"} <= fields:
            return Response(
                {"detail": "The CSV needs branch_name and branch_area columns."}, status=400
            )
        created = updated = 0
        errors = []
        with transaction.atomic():
            for line, row in enumerate(reader, start=2):
                row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
                name, area = row.get("branch_name", ""), row.get("branch_area", "")
                if not name or not area:
                    errors.append(f"Line {line}: name and area are both needed.")
                    continue
                active = row.get("active", "yes").lower() not in ("no", "false", "0", "inactive")
                branch = ZimpostBranch.objects.filter(
                    branch_name__iexact=name, branch_area__iexact=area
                ).first()
                if branch:
                    if branch.active != active:
                        branch.active = active
                        branch.save(update_fields=["active", "updated_at"])
                    updated += 1
                else:
                    ZimpostBranch.objects.create(branch_name=name, branch_area=area, active=active)
                    created += 1
        audit(
            request.user,
            "branch.import",
            "branch",
            "",
            None,
            {"created": created, "updated": updated},
        )
        return Response({"created": created, "updated": updated, "errors": errors})
