from django.contrib import admin

from requests_app.models import Request


@admin.register(Request)
class RequestAdmin(admin.ModelAdmin):
    """Read-mostly view for support/debugging. Day-to-day processing happens in
    the app's own admin dashboard, not here."""

    list_display = (
        "reference_number",
        "full_name",
        "reg_number",
        "zone",
        "status",
        "paid",
        "created_at",
    )
    list_filter = ("status", "zone", "paid", "payment_method")
    search_fields = ("reference_number", "full_name", "reg_number", "programme_name")
    ordering = ("-created_at",)
    readonly_fields = ("reference_number", "created_at", "updated_at")
    list_select_related = ("zimpost_branch",)
