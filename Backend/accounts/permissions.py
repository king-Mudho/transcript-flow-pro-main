from rest_framework.permissions import BasePermission

from accounts.models import Role


class IsAdmin(BasePermission):
    """Allow only signed-in users holding the ``admin`` role.

    This is the project's real authorization gate. The frontend also hides admin
    routes from non-admins, but that is a convenience only — every admin
    endpoint must carry this permission, because a client-side check can be
    bypassed trivially.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.roles.filter(role=Role.ADMIN).exists())
