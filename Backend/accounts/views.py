from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.serializers import MeSerializer, SignupSerializer


class SignupView(APIView):
    """Create an account and sign in immediately.

    There is no email-confirmation step, so the response carries the token pair
    directly. Note that the very first account created on a fresh database is
    promoted to admin — see accounts.signals.bootstrap_first_admin.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {"access": str(refresh.access_token), "refresh": str(refresh)},
            status=status.HTTP_201_CREATED,
        )


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

    The frontend route guard calls this to decide whether to show the admin
    dashboard. That decision is cosmetic; each admin endpoint enforces access
    itself via the IsAdmin permission.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)
