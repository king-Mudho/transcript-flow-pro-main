import re

from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User, UserRole


class NoPublicSignupTests(APITestCase):
    def test_signup_endpoint_is_gone(self):
        response = self.client.post(
            "/api/auth/signup/", {"email": "x@example.com", "password": "pw12345678"}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(User.objects.exists())

    def test_first_user_is_not_promoted(self):
        user = User.objects.create_user(email="first@example.com", password="pw12345678")
        self.assertFalse(UserRole.objects.filter(user=user).exists())

    def test_make_admin_command_grants_role(self):
        from django.core.management import call_command

        call_command("make_admin", "boss@example.com", password="pw12345678", verbosity=0)
        user = User.objects.get(email="boss@example.com")
        self.assertTrue(UserRole.objects.filter(user=user, role=Role.ADMIN).exists())


class AuthEndpointTests(APITestCase):
    def test_login_and_me(self):
        user = User.objects.create_user(email="user@example.com", password="pw12345678")
        UserRole.objects.create(user=user, role=Role.ADMIN)
        login = self.client.post(
            reverse("auth-login"), {"email": "user@example.com", "password": "pw12345678"}
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        me = self.client.get(reverse("auth-me"))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data["email"], "user@example.com")
        self.assertTrue(me.data["is_admin"])

    def test_non_admin_me_is_not_admin(self):
        User.objects.create_user(email="plain@example.com", password="pw12345678")
        login = self.client.post(
            reverse("auth-login"), {"email": "plain@example.com", "password": "pw12345678"}
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertFalse(self.client.get(reverse("auth-me")).data["is_admin"])

    def test_login_wrong_password_rejected(self):
        User.objects.create_user(email="user2@example.com", password="pw12345678")
        response = self.client.post(
            reverse("auth-login"), {"email": "user2@example.com", "password": "wrongpass"}
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self):
        User.objects.create_user(email="user3@example.com", password="pw12345678")
        login = self.client.post(
            reverse("auth-login"), {"email": "user3@example.com", "password": "pw12345678"}
        )
        access, refresh = login.data["access"], login.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        logout = self.client.post(reverse("auth-logout"), {"refresh": refresh})
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)
        refresh_attempt = self.client.post(reverse("auth-refresh"), {"refresh": refresh})
        self.assertEqual(refresh_attempt.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_authentication(self):
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="staff@example.com", password="oldpass-12345")

    def _request_link(self):
        response = self.client.post(reverse("auth-password-reset"), {"email": "staff@example.com"})
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(mail.outbox), 1)
        match = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body)
        return match.group(1), match.group(2)

    def test_reset_flow_changes_password(self):
        uid, token = self._request_link()
        response = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": uid, "token": token, "password": "brand-new-pass-91"},
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brand-new-pass-91"))

    def test_token_is_single_use(self):
        uid, token = self._request_link()
        body = {"uid": uid, "token": token, "password": "brand-new-pass-91"}
        self.client.post(reverse("auth-password-reset-confirm"), body)
        again = self.client.post(reverse("auth-password-reset-confirm"), body)
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_email_looks_identical(self):
        response = self.client.post(reverse("auth-password-reset"), {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(mail.outbox), 0)

    def test_bad_token_refused(self):
        uid, _ = self._request_link()
        response = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": uid, "token": "nope", "password": "brand-new-pass-91"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
