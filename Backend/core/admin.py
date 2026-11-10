from django.contrib import admin

from core.models import AuditLog, ClientError, SiteSettings, Suburb


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = ("service_name", "fee_harare", "fee_outside", "msu_portal_enabled", "updated_at")

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Suburb)
class SuburbAdmin(admin.ModelAdmin):
    list_display = ("name", "area", "active")
    list_filter = ("active",)
    search_fields = ("name", "area")


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AuditLog)
class AuditLogAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "actor", "action", "entity", "entity_id")
    list_filter = ("entity",)
    search_fields = ("action", "entity_id", "actor__email")


@admin.register(ClientError)
class ClientErrorAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "message", "url")
    search_fields = ("message", "url")
