from django.conf import settings
from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers

from accounts.models import Role, User


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def send_link(self):
        email = self.validated_data["email"]
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is None:
            return
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
        send_mail(
            "Reset your MSU Transcript admin password",
            "Use this link to choose a new password. It works once and expires soon.\n\n"
            f"{link}\n\nIf you did not ask for this, ignore this email.",
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

    class Meta:
        model = User
        fields = ("id", "email", "roles", "is_admin")

    def get_roles(self, obj):
        return list(obj.roles.values_list("role", flat=True))

    def get_is_admin(self, obj):
        return obj.roles.filter(role=Role.ADMIN).exists()
