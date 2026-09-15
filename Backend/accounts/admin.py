from django.contrib import admin

from accounts.models import User, UserRole


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "is_active", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff")
    search_fields = ("email",)
    ordering = ("-date_joined",)


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    """Granting the admin role is automatic for the first account (see
    accounts.signals); this is how it gets granted to anyone after that."""

    list_display = ("user", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("user__email",)
