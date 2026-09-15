from django.contrib import admin

from branches.models import ZimpostBranch


@admin.register(ZimpostBranch)
class ZimpostBranchAdmin(admin.ModelAdmin):
    list_display = ("branch_name", "branch_area", "active", "updated_at")
    list_filter = ("active",)
    search_fields = ("branch_name", "branch_area")
    ordering = ("branch_name",)
