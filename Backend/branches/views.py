from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from accounts.permissions import IsAdmin
from branches.models import ZimpostBranch
from branches.serializers import ZimpostBranchSerializer


class ZimpostBranchViewSet(viewsets.ModelViewSet):
    """GET /?active=true is public (mirrors the "branches public read" RLS policy,
    scoped by the frontend's own /request usage); everything else is admin-only,
    mirroring "branches admin write"."""

    queryset = ZimpostBranch.objects.all().order_by("branch_name")
    serializer_class = ZimpostBranchSerializer

    def get_permissions(self):
        if self.action == "list" and self.request.query_params.get("active") == "true":
            return [AllowAny()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list" and self.request.query_params.get("active") == "true":
            qs = qs.filter(active=True)
        return qs
