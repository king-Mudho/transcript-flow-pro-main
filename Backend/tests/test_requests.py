from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from requests_app.models import Request
from requests_app.services import generate_reference_number

VALID_PAYLOAD = {
    "full_name": "Jane Doe",
    "reg_number": "R123456",
    "programme_name": "BSc Computer Science",
    "year_completed": 2024,
    "phone_number": "0771234567",
    "email": "jane@example.com",
    "cleared_department": True,
    "cleared_accounts": True,
    "cleared_library": True,
    "zone": "harare",
    "harare_address": "123 Main St",
    "fee_amount": "15.00",
    "payment_method": "cash_on_delivery",
}


class ReferenceNumberTests(APITestCase):
    def test_format(self):
        ref = generate_reference_number()
        self.assertRegex(ref, r"^MSU-\d{4}-\d{6}$")
        # timezone.now(), not datetime.now(): the service builds the year from
        # UTC, so a local-time comparison could disagree around New Year.
        self.assertEqual(ref.split("-")[1], str(timezone.now().year))

    def test_uniqueness_across_many_generations(self):
        refs = set()
        for _ in range(20):
            ref = generate_reference_number()
            Request.objects.create(reference_number=ref, **VALID_PAYLOAD)
            refs.add(ref)
        self.assertEqual(len(refs), 20)


class RequestCreationTests(APITestCase):
    def test_anonymous_can_create_request(self):
        response = self.client.post("/api/requests/", VALID_PAYLOAD)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertRegex(response.data["reference_number"], r"^MSU-\d{4}-\d{6}$")
        self.assertEqual(Request.objects.count(), 1)

    def test_missing_required_field_rejected(self):
        payload = dict(VALID_PAYLOAD)
        del payload["full_name"]
        response = self.client.post("/api/requests/", payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class StatusLookupTests(APITestCase):
    def setUp(self):
        self.req = Request.objects.create(reference_number="MSU-2024-000001", **VALID_PAYLOAD)

    def test_lookup_returns_limited_field_set(self):
        response = self.client.get(
            "/api/requests/status/",
            {"reference_number": "MSU-2024-000001", "reg_number": "R123456"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        expected_fields = {
            "reference_number",
            "full_name",
            "programme_name",
            "status",
            "status_reason",
            "paid",
            "zone",
            "fee_amount",
            "payment_method",
            "created_at",
        }
        self.assertEqual(set(response.data.keys()), expected_fields)

    def test_lookup_reg_number_case_insensitive(self):
        response = self.client.get(
            "/api/requests/status/",
            {"reference_number": "MSU-2024-000001", "reg_number": "r123456"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_lookup_wrong_reg_number_returns_nothing(self):
        response = self.client.get(
            "/api/requests/status/",
            {"reference_number": "MSU-2024-000001", "reg_number": "WRONG"},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_lookup_unknown_reference_returns_nothing(self):
        response = self.client.get(
            "/api/requests/status/",
            {"reference_number": "MSU-2024-999999", "reg_number": "R123456"},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AdminAccessEnforcementTests(APITestCase):
    def setUp(self):
        self.req = Request.objects.create(reference_number="MSU-2024-000002", **VALID_PAYLOAD)
        # First user created is auto-bootstrapped as admin by the post_save signal.
        self.admin_user = User.objects.create_user(email="admin@example.com", password="pw12345678")
        self.plain_user = User.objects.create_user(email="plain@example.com", password="pw12345678")

    def _auth(self, user):
        access = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_anonymous_cannot_list_requests(self):
        response = self.client.get("/api/requests/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_list_requests(self):
        self._auth(self.plain_user)
        response = self.client.get("/api/requests/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_requests(self):
        self._auth(self.admin_user)
        response = self.client.get("/api/requests/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertIn("zimpost_branches", response.data[0])

    def test_non_admin_cannot_bulk_update_status(self):
        self._auth(self.plain_user)
        response = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(self.req.id)], "status": "in_transit"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_bulk_update_status(self):
        self._auth(self.admin_user)
        response = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(self.req.id)], "status": "in_transit", "status_reason": "On the way"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, "in_transit")
        self.assertEqual(self.req.status_reason, "On the way")

    def test_non_admin_cannot_update_paid(self):
        self._auth(self.plain_user)
        response = self.client.patch(f"/api/requests/{self.req.id}/", {"paid": True})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_paid(self):
        self._auth(self.admin_user)
        response = self.client.patch(f"/api/requests/{self.req.id}/", {"paid": True})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req.refresh_from_db()
        self.assertTrue(self.req.paid)

    def test_bulk_update_rejects_malformed_uuid_with_400(self):
        # A non-UUID id reaching the ORM raises inside Django and would surface
        # as a 500; it must be caught and reported as a bad request.
        self._auth(self.admin_user)
        response = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": ["not-a-uuid"], "status": "collected"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_update_rejects_empty_or_non_list_ids(self):
        self._auth(self.admin_user)
        for bad_ids in ([], "not-a-list", None):
            response = self.client.post(
                "/api/requests/bulk-update-status/",
                {"ids": bad_ids, "status": "collected"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_update_rejects_invalid_status(self):
        self._auth(self.admin_user)
        response = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(self.req.id)], "status": "not_a_status"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_update_clears_status_reason_when_explicit_null(self):
        self.req.status_reason = "Previously rejected"
        self.req.save()
        self._auth(self.admin_user)
        response = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(self.req.id)], "status": "rejected", "status_reason": None},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req.refresh_from_db()
        self.assertIsNone(self.req.status_reason)

    def test_bulk_update_leaves_status_reason_untouched_when_key_absent(self):
        self.req.status_reason = "Keep me"
        self.req.save()
        self._auth(self.admin_user)
        response = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(self.req.id)], "status": "collected"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status_reason, "Keep me")

    def test_export_respects_filters_and_only_marks_filtered_rows(self):
        other = Request.objects.create(
            reference_number="MSU-2024-000003",
            **{**VALID_PAYLOAD, "full_name": "John Smith", "zone": "outside_harare"},
        )
        self._auth(self.admin_user)
        response = self.client.get("/api/requests/export/", {"zone": "outside_harare"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["X-Exported-Count"], "1")

        other.refresh_from_db()
        self.req.refresh_from_db()
        self.assertIsNotNone(other.exported_at)
        self.assertIsNone(self.req.exported_at)

    def test_export_search_filter_matches_across_expected_fields(self):
        self._auth(self.admin_user)
        response = self.client.get("/api/requests/export/", {"search": "jane"})
        self.assertEqual(response["X-Exported-Count"], "1")

        response = self.client.get("/api/requests/export/", {"search": "nomatch"})
        self.assertEqual(response["X-Exported-Count"], "0")

    def test_non_admin_cannot_export(self):
        self._auth(self.plain_user)
        response = self.client.get("/api/requests/export/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_export_and_marks_exported_at(self):
        self._auth(self.admin_user)
        response = self.client.get("/api/requests/export/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.req.refresh_from_db()
        self.assertIsNotNone(self.req.exported_at)
