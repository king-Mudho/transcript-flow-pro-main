from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User, UserRole


class FirstAdminBootstrapTests(APITestCase):
    def test_first_user_becomes_admin_second_does_not(self):
        first = User.objects.create_user(email="first@example.com", password="pw12345678")
        second = User.objects.create_user(email="second@example.com", password="pw12345678")

        self.assertTrue(UserRole.objects.filter(user=first, role=Role.ADMIN).exists())
        self.assertFalse(UserRole.objects.filter(user=second, role=Role.ADMIN).exists())
        self.assertEqual(UserRole.objects.filter(role=Role.ADMIN).count(), 1)


class AuthEndpointTests(APITestCase):
    def test_signup_creates_admin_and_returns_tokens_immediately(self):
        response = self.client.post(
            reverse("auth-signup"), {"email": "admin@example.com", "password": "pw12345678"}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        user = User.objects.get(email="admin@example.com")
        self.assertTrue(UserRole.objects.filter(user=user, role=Role.ADMIN).exists())

    def test_signup_duplicate_email_rejected(self):
        User.objects.create_user(email="dupe@example.com", password="pw12345678")
        response = self.client.post(
            reverse("auth-signup"), {"email": "dupe@example.com", "password": "pw12345678"}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_and_me(self):
        User.objects.create_user(email="user@example.com", password="pw12345678")
        login = self.client.post(
            reverse("auth-login"), {"email": "user@example.com", "password": "pw12345678"}
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        access = login.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = self.client.get(reverse("auth-me"))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data["email"], "user@example.com")
        self.assertTrue(me.data["is_admin"])

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
