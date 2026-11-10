from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import (
    LoginView,
    LogoutView,
    MeView,
    MfaConfirmView,
    MfaSetupView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("mfa/setup/", MfaSetupView.as_view(), name="auth-mfa-setup"),
    path("mfa/confirm/", MfaConfirmView.as_view(), name="auth-mfa-confirm"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
]
