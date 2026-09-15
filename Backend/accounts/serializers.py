from django.contrib.auth import password_validation
from rest_framework import serializers

from accounts.models import Role, User


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        value = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"], password=validated_data["password"]
        )


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
