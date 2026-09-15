from rest_framework import serializers

from branches.models import ZimpostBranch


class ZimpostBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZimpostBranch
        fields = ("id", "branch_name", "branch_area", "active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")
