from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts import mfa
from accounts.models import Role, User, UserRole
from accounts.permissions import IsAdmin, IsSignedIn, msu_portal_enabled
from accounts.serializers import (
    ROLE_LABELS,
    MeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    TeamInviteSerializer,
    TeamMemberSerializer,
    TeamUpdateSerializer,
    send_invite,
)
from core.audit import audit

# Without "Keep me signed in" a session ends after this long, however active.
SHORT_SESSION = timedelta(hours=12)


def issue_tokens(user, mfa_verified: bool, keep_signed_in: bool = False) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["mfa"] = bool(mfa_verified)
    if not keep_signed_in:
        refresh.set_exp(lifetime=SHORT_SESSION)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "mfa_setup_required": bool(settings.REQUIRE_MFA and not user.mfa_enabled),
    }


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class LoginView(APIView):
    """POST {email, password, otp?, keep_signed_in?}.

    Accounts with a second factor must send the current six-digit code; the
    first attempt without one answers 400 with ``otp_required: true`` so the
    sign-in page can ask for it. MSU staff cannot sign in while the MSU portal
    is switched off.
    """

    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        password = request.data.get("password") or ""
        user = authenticate(request, email=email, password=password)
        if user is None or not user.is_active:
            return Response(
                {"detail": "No active account found with the given credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        roles = set(user.roles.values_list("role", flat=True))
        if roles == {Role.MSU_STAFF} and not msu_portal_enabled():
            return Response(
                {"detail": "The MSU staff portal is switched off."},
                status=status.HTTP_403_FORBIDDEN,
            )

        verified = False
        if user.mfa_enabled:
            otp = request.data.get("otp")
            if not otp:
                return Response(
                    {"detail": "Enter the six-digit code from your app.", "otp_required": True},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not mfa.verify(user.totp_secret, otp):
                return Response(
                    {"detail": "That code is not right. Try the newest one.", "otp_required": True},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            verified = True
        return Response(issue_tokens(user, verified, bool(request.data.get("keep_signed_in"))))


class LogoutView(APIView):
    """Blacklist a refresh token so it cannot be exchanged again.

    The access token stays valid until it expires (30 minutes) — it is a bearer
    token and cannot be recalled. Logging out revokes the ability to renew.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            raise ValidationError({"refresh": "This field is required."})
        try:
            RefreshToken(refresh).blacklist()
        except TokenError as exc:
            # Already blacklisted, malformed, or expired — all client errors, so
            # report a 400 rather than letting this become a 500.
            raise ValidationError({"refresh": str(exc)}) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Identity of the current token holder, including roles.

    The frontend route guard calls this to decide which workspace to show. That
    decision is cosmetic; each endpoint enforces access itself.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user, context={"request": request}).data)


class MfaSetupView(APIView):
    """POST: start enrolment. Returns a new secret and an otpauth:// link for
    the authenticator app. Nothing changes until the first code is confirmed."""

    permission_classes = [IsSignedIn]

    def post(self, request):
        user = request.user
        if user.mfa_enabled:
            return Response(
                {"detail": "Two-step sign-in is already on for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.totp_secret = mfa.new_secret()
        user.save(update_fields=["totp_secret"])
        from core.models import SiteSettings

        issuer = SiteSettings.load().service_name or "MSU Transcript"
        return Response(
            {
                "secret": user.totp_secret,
                "otpauth_uri": mfa.provisioning_uri(user.totp_secret, user.email, issuer),
            }
        )


class MfaConfirmView(APIView):
    """POST {code, refresh?}: turn two-step sign-in on and return fresh tokens
    that carry the second-factor claim."""

    permission_classes = [IsSignedIn]

    def post(self, request):
        user = request.user
        if not user.totp_secret or not mfa.verify(user.totp_secret, request.data.get("code")):
            return Response(
                {"detail": "That code is not right. Try the newest one."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.mfa_enabled = True
        user.save(update_fields=["mfa_enabled"])
        old = request.data.get("refresh")
        if old:
            try:
                RefreshToken(old).blacklist()
            except TokenError:
                pass
        audit(user, "mfa.enabled", "user", user.pk, None, {"email": user.email})
        return Response(issue_tokens(user, True, bool(request.data.get("keep_signed_in"))))


class PasswordResetThrottle(AnonRateThrottle):
    scope = "password_reset"


class PasswordResetRequestView(APIView):
    """Email a reset link. Always answers 204, whether or not the address
    belongs to an account, so the form cannot be used to discover accounts."""

    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.send_link()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------- team


def _set_role(user, role):
    UserRole.objects.filter(user=user).exclude(role=role).delete()
    UserRole.objects.get_or_create(user=user, role=role)


def _other_active_admins(user) -> bool:
    return (
        UserRole.objects.filter(role=Role.ADMIN, user__is_active=True).exclude(user=user).exists()
    )


class TeamListView(APIView):
    """GET the team; POST {email, full_name, role} to invite someone. The
    invitation email carries a one-time link to choose a password."""

    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.filter(roles__isnull=False).distinct().order_by("email")
        return Response(TeamMemberSerializer(users, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = TeamInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.filter(email__iexact=data["email"]).first()
        if user is not None and user.roles.exists():
            return Response(
                {"detail": "That person is already on the team."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user is None:
            user = User.objects.create_user(email=data["email"], password=None)
            user.set_unusable_password()
        user.full_name = data.get("full_name", "") or user.full_name
        user.is_active = True
        user.save()
        _set_role(user, data["role"])
        send_invite(user, ROLE_LABELS[data["role"]], request.user)
        audit(
            request.user,
            "team.invite",
            "user",
            user.pk,
            None,
            {"email": user.email, "role": data["role"]},
        )
        return Response(TeamMemberSerializer(user).data, status=status.HTTP_201_CREATED)


class TeamDeleteMixin:
    """DELETE a team account. You cannot delete yourself, and the last active
    admin cannot be deleted. Their history entries stay, without a name link.
    Deactivating (PATCH is_active=false) is the reversible alternative."""

    def delete(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.roles.filter(role=Role.ADMIN).exists() and not _other_active_admins(user):
            return Response(
                {"detail": "There must always be at least one active admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        snapshot = dict(TeamMemberSerializer(user).data)
        user.delete()
        audit(request.user, "team.delete", "user", pk, snapshot, None)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamDetailView(TeamDeleteMixin, APIView):
    """PATCH {full_name?, role?, is_active?}. Deactivating signs the person
    out at their next token refresh. The last active admin cannot be demoted or
    deactivated, so the workspace can never lock itself out."""

    permission_classes = [IsAdmin]

    @transaction.atomic
    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        serializer = TeamUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        before = TeamMemberSerializer(user).data

        is_admin = user.roles.filter(role=Role.ADMIN).exists()
        losing_admin = is_admin and (
            ("role" in data and data["role"] != Role.ADMIN) or data.get("is_active") is False
        )
        if losing_admin and not _other_active_admins(user):
            return Response(
                {"detail": "There must always be at least one active admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if "full_name" in data:
            user.full_name = data["full_name"]
        if "is_active" in data:
            user.is_active = data["is_active"]
        user.save()
        if "role" in data:
            _set_role(user, data["role"])
        after = TeamMemberSerializer(user).data
        audit(request.user, "team.update", "user", user.pk, dict(before), dict(after))
        return Response(after)


class TeamResetMfaView(APIView):
    """POST: switch two-step sign-in off for someone who lost their phone.
    They enrol again at their next sign-in."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        user.mfa_enabled = False
        user.totp_secret = ""
        user.save(update_fields=["mfa_enabled", "totp_secret"])
        audit(request.user, "team.reset_mfa", "user", user.pk, None, {"email": user.email})
        return Response(TeamMemberSerializer(user).data)
