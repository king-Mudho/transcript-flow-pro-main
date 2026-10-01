from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User, UserRole
from branches.models import ZimpostBranch


class BranchTests(APITestCase):
    def setUp(self):
        self.active_branch = ZimpostBranch.objects.create(
            branch_name="Harare Main PO", branch_area="Harare", active=True
        )
        self.inactive_branch = ZimpostBranch.objects.create(
            branch_name="Old Branch", branch_area="Harare", active=False
        )

        self.admin_user = User.objects.create_user(email="admin@example.com", password="pw12345678")
        UserRole.objects.create(user=self.admin_user, role=Role.ADMIN)
        self.plain_user = User.objects.create_user(email="plain@example.com", password="pw12345678")

    def _auth(self, user):
        access = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_public_can_list_active_branches_only(self):
        response = self.client.get("/api/branches/", {"active": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [b["branch_name"] for b in response.data]
        self.assertIn("Harare Main PO", names)
        self.assertNotIn("Old Branch", names)

    def test_public_cannot_list_all_branches(self):
        response = self.client.get("/api/branches/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_list_all_branches(self):
        self._auth(self.plain_user)
        response = self.client.get("/api/branches/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_all_branches(self):
        self._auth(self.admin_user)
        response = self.client.get("/api/branches/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_admin_can_create_update_delete_branch(self):
        self._auth(self.admin_user)

        create = self.client.post(
            "/api/branches/",
            {"branch_name": "New Branch", "branch_area": "Bulawayo", "active": True},
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        branch_id = create.data["id"]

        update = self.client.patch(f"/api/branches/{branch_id}/", {"branch_name": "Renamed"})
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["branch_name"], "Renamed")

        delete = self.client.delete(f"/api/branches/{branch_id}/")
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_non_admin_cannot_write_branches(self):
        self._auth(self.plain_user)
        response = self.client.post(
            "/api/branches/", {"branch_name": "Nope", "branch_area": "Nowhere", "active": True}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
