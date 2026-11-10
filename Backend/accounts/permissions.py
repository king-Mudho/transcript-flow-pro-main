"""The project's real authorization gates.

The frontend hides pages a role cannot use, but that is a convenience only:
every endpoint must carry one of these classes, because a client-side check can
be bypassed trivially.

Roles
  admin      everything, including prices, branches, drivers, team, settings
  staff      day-to-day work: statuses, delivery edits, batches, payments
  msu_staff  the MSU release portal only, and only while it is switched on

When REQUIRE_MFA is on, admin and staff tokens must carry the `mfa` claim,
which is only set after a second-factor check at sign-in.
"""

from django.conf import settings
from rest_framework.permissions import BasePermission

from accounts.models import Role

TEAM_ROLES = (Role.ADMIN, Role.STAFF)


def mfa_satisfied(request) -> bool:
    if not getattr(settings, "REQUIRE_MFA", False):
        return True
    token = getattr(request, "auth", None)
    try:
        return bool(token and token.get("mfa"))
    except AttributeError:
        return False


def msu_portal_enabled() -> bool:
    from core.models import SiteSettings

    return SiteSettings.load().msu_portal_enabled


def _has(request, *roles) -> bool:
    user = request.user
    return bool(user and user.is_authenticated and user.roles.filter(role__in=roles).exists())


class IsAdmin(BasePermission):
    """Signed-in users holding the ``admin`` role."""

    message = "Only an admin can do this."

    def has_permission(self, request, view):
        return _has(request, Role.ADMIN) and mfa_satisfied(request)


class IsTeam(BasePermission):
    """Admins and staff: the people who run the service day to day."""

    def has_permission(self, request, view):
        return _has(request, *TEAM_ROLES) and mfa_satisfied(request)


class IsMsuStaff(BasePermission):
    """MSU staff, and only while the MSU portal is switched on in Settings."""

    def has_permission(self, request, view):
        return _has(request, Role.MSU_STAFF) and msu_portal_enabled() and mfa_satisfied(request)


class IsTeamOrMsu(BasePermission):
    """The team, or MSU staff while the portal is on (for MSU-safe views)."""

    def has_permission(self, request, view):
        return IsTeam().has_permission(request, view) or IsMsuStaff().has_permission(request, view)


class IsSignedIn(BasePermission):
    """Any account; used by the second-factor enrolment endpoints, which must
    work before the token carries the mfa claim."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)
