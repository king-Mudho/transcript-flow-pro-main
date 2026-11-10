from django.conf import settings
from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers

from accounts.models import Role, User


def password_link(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"


def send_invite(user, role_label: str, invited_by) -> None:
    """Email a new team member a one-time link to choose their password."""
    send_mail(
        "You have been invited to MSU Transcript Collection",
        f"{invited_by.display_name} has added you as {role_label}.\n\n"
        "Use this link to choose your password. It works once.\n\n"
        f"{password_link(user)}\n\n"
        f"Then sign in at {settings.FRONTEND_URL.rstrip('/')}/auth",
        None,
        [user.email],
    )


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def send_link(self):
        email = self.validated_data["email"]
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is None:
            return
        send_mail(
            "Reset your MSU Transcript password",
            "Use this link to choose a new password. It works once and expires soon.\n\n"
            f"{password_link(user)}\n\nIf you did not ask for this, ignore this email.",
            None,
            [user.email],
        )


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        invalid = serializers.ValidationError("This reset link is invalid or has expired.")
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(attrs["uid"])))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError, DjangoValidationError):
            raise invalid from None
        if not default_token_generator.check_token(user, attrs["token"]):
            raise invalid
        try:
            password_validation.validate_password(attrs["password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0]) from exc
        attrs["user"] = user
        return attrs

    def save(self):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["password"])
        user.save(update_fields=["password"])
        return user


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    is_team = serializers.SerializerMethodField()
    is_msu = serializers.SerializerMethodField()
    mfa_required = serializers.SerializerMethodField()
    mfa_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "full_name",
            "roles",
            "is_admin",
            "is_team",
            "is_msu",
            "mfa_enabled",
            "mfa_required",
            "mfa_verified",
        )

    def _roles(self, obj):
        if not hasattr(obj, "_role_cache"):
            obj._role_cache = set(obj.roles.values_list("role", flat=True))
        return obj._role_cache

    def get_roles(self, obj):
        return sorted(self._roles(obj))

    def get_is_admin(self, obj):
        return Role.ADMIN in self._roles(obj)

    def get_is_team(self, obj):
        return bool({Role.ADMIN, Role.STAFF} & self._roles(obj))

    def get_is_msu(self, obj):
        from accounts.permissions import msu_portal_enabled

        return Role.MSU_STAFF in self._roles(obj) and msu_portal_enabled()

    def get_mfa_required(self, obj):
        return bool(getattr(settings, "REQUIRE_MFA", False))

    def get_mfa_verified(self, obj):
        from accounts.permissions import mfa_satisfied

        request = self.context.get("request")
        return mfa_satisfied(request) if request else False


ROLE_LABELS = {Role.ADMIN: "an admin", Role.STAFF: "staff", Role.MSU_STAFF: "MSU staff"}


class TeamMemberSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "full_name", "role", "is_active", "mfa_enabled", "last_login")

    def get_role(self, obj):
        roles = set(obj.roles.values_list("role", flat=True))
        for role in (Role.ADMIN, Role.STAFF, Role.MSU_STAFF):
            if role in roles:
                return role
        return None


class TeamInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Role.choices)


class TeamUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)
