"""Acceptance tests for backlog Stages 4 to 11 (payments, pricing, graduate
experience, team and reporting, MSU portal, security and data protection)."""

import io
import json
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts import mfa
from accounts.models import Role, User, UserRole
from branches.models import ZimpostBranch
from core.models import AuditLog, SiteSettings, Suburb
from requests_app import services
from requests_app.models import (
    DispatchBatch,
    Driver,
    HandInList,
    Payment,
    Request,
    RequestItem,
)
from tests.test_requests import DB_FIELDS, SUBMIT

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

_media = tempfile.mkdtemp(prefix="msu-test-media-")


def make(ref, **overrides):
    return Request.objects.create(reference_number=ref, **{**DB_FIELDS, **overrides})


@override_settings(PRIVATE_MEDIA_ROOT=_media, REQUIRE_MFA=False)
class Base(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@example.com", password="pw12345678")
        UserRole.objects.create(user=self.admin, role=Role.ADMIN)
        self.staff = User.objects.create_user(email="staff@example.com", password="pw12345678")
        UserRole.objects.create(user=self.staff, role=Role.STAFF)
        self.msu = User.objects.create_user(email="msu@example.com", password="pw12345678")
        UserRole.objects.create(user=self.msu, role=Role.MSU_STAFF)
        self.branch = ZimpostBranch.objects.create(branch_name="Gweru PO", branch_area="Gweru")
        self.driver = Driver.objects.create(full_name="Blessing Mutasa", phone="+263785550192")

    def auth(self, user, mfa_claim=False):
        refresh = RefreshToken.for_user(user)
        refresh["mfa"] = mfa_claim
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def submit(self, **overrides):
        self.client.credentials()
        return self.client.post("/api/requests/", {**SUBMIT, **overrides}, format="json")

    def walk(self, req, *statuses):
        for s in statuses:
            services.change_status(req, s, self.admin)
            req.refresh_from_db()


# ------------------------------------------------------------- Stage 4


class PaymentTests(Base):
    def setUp(self):
        super().setUp()
        self.req = make("MSU-2026-100001")
        self.auth(self.admin)

    def test_full_payment_marks_paid_with_receipt_and_receiver(self):
        r = self.client.post(
            f"/api/requests/{self.req.id}/payments/", {"amount": 15}, format="json"
        )
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data["receipt_number"].startswith("RCT-"))
        self.assertEqual(r.data["received_by"], "admin@example.com")
        self.req.refresh_from_db()
        self.assertTrue(self.req.paid)
        self.assertEqual(self.req.amount_paid, Decimal("15.00"))

    def test_part_payment_and_filters(self):
        self.client.post(f"/api/requests/{self.req.id}/payments/", {"amount": 5}, format="json")
        self.req.refresh_from_db()
        self.assertFalse(self.req.paid)

        def ids(payment):
            rows = self.client.get("/api/requests/", {"payment": payment}).data["results"]
            return [r["id"] for r in rows]

        self.assertIn(str(self.req.id), ids("part_paid"))
        self.assertNotIn(str(self.req.id), ids("unpaid"))

    def test_payments_cannot_be_deleted_only_reversed(self):
        r = self.client.post(
            f"/api/requests/{self.req.id}/payments/", {"amount": 15}, format="json"
        )
        payment = Payment.objects.get(pk=r.data["id"])
        with self.assertRaises(ValidationError):
            payment.delete()
        self.assertEqual(
            self.client.post(f"/api/payments/{payment.id}/reverse/", {}, format="json").status_code,
            400,
        )
        rev = self.client.post(
            f"/api/payments/{payment.id}/reverse/", {"reason": "Wrong request"}, format="json"
        )
        self.assertEqual(rev.status_code, 201)
        self.req.refresh_from_db()
        self.assertFalse(self.req.paid)
        self.assertEqual(self.req.amount_paid, Decimal("0"))
        self.assertTrue(
            self.req.events.filter(event_type="payment", note__contains="Reversed").exists()
        )

    def test_export_has_amount_paid(self):
        self.client.post(f"/api/requests/{self.req.id}/payments/", {"amount": 15}, format="json")
        ws = load_workbook(io.BytesIO(self.client.get("/api/requests/export/").content)).active
        headers = [c.value for c in ws[1]]
        self.assertEqual(ws.cell(row=2, column=headers.index("Amount Paid (US$)") + 1).value, 15)


class ReconciliationTests(Base):
    def setUp(self):
        super().setUp()
        self.auth(self.admin)
        self.reqs = []
        for i in range(5):
            r = make(f"MSU-2026-20000{i}")
            self.walk(r, "submitted_to_msu", "collected_from_msu")
            self.reqs.append(r)
        self.batch = services.create_dispatch_batch(
            [r.id for r in self.reqs], self.driver.id, self.admin
        )
        for r in self.reqs:
            services.resolve_batch_item(
                self.batch, Request.objects.get(pk=r.id), True, "", self.admin
            )

    def test_expected_cash_is_fees_of_delivered_unpaid(self):
        data = self.client.get(f"/api/dispatch/batches/{self.batch.id}/").data
        self.assertEqual(Decimal(str(data["cash_to_collect"])), Decimal("75.00"))
        self.assertEqual(data["delivered"], 5)

    def test_short_hand_in_needs_note_and_shows_in_report(self):
        url = f"/api/dispatch/batches/{self.batch.id}/close/"
        self.assertEqual(
            self.client.post(url, {"cash_handed_in": 70}, format="json").status_code, 400
        )
        ok = self.client.post(url, {"cash_handed_in": 70, "note": "US$5 short"}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(Decimal(str(ok.data["variance"])), Decimal("-5.00"))
        report = self.client.get("/api/reports/cash/").data["drivers"][0]
        self.assertEqual(Decimal(str(report["variance"])), Decimal("-5.00"))

    def test_each_delivered_document_ends_paid_by_driver(self):
        self.client.post(
            f"/api/dispatch/batches/{self.batch.id}/close/", {"cash_handed_in": 75}, format="json"
        )
        for r in self.reqs:
            r.refresh_from_db()
            self.assertTrue(r.paid)
            self.assertEqual(r.payments.get().received_by_driver, self.driver)

    def test_close_disabled_until_every_request_has_a_result(self):
        other = make("MSU-2026-209999")
        self.walk(other, "submitted_to_msu", "collected_from_msu")
        batch = services.create_dispatch_batch([other.id], self.driver.id, self.admin)
        r = self.client.post(
            f"/api/dispatch/batches/{batch.id}/close/", {"cash_handed_in": 0}, format="json"
        )
        self.assertEqual(r.status_code, 400)


class PriceTests(Base):
    def test_price_change_updates_public_and_new_requests_only(self):
        old = make("MSU-2026-300001")
        self.auth(self.admin)
        r = self.client.patch("/api/settings/", {"fee_harare": "18.00"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            Decimal(str(self.client.get("/api/settings/public/").data["fee_harare"])),
            Decimal("18.00"),
        )
        created = self.submit(reg_number="R654321A")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(
            Request.objects.get(reference_number=created.data["reference_number"]).fee_amount,
            Decimal("18.00"),
        )
        old.refresh_from_db()
        self.assertEqual(old.fee_amount, Decimal("15.00"))
        entry = AuditLog.objects.get(action="price.change")
        self.assertEqual((entry.old_value, entry.new_value), ("15.00", "18.00"))

    def test_only_admins_change_settings(self):
        self.auth(self.staff)
        self.assertEqual(
            self.client.patch("/api/settings/", {"fee_harare": "1"}, format="json").status_code, 403
        )
        self.assertEqual(self.client.get("/api/settings/").status_code, 200)


# ------------------------------------------------------------- Stage 5


class GraduateExperienceTests(Base):
    def test_phone_and_reg_are_normalised_and_bad_phone_refused(self):
        r = self.submit(phone_number="0771 234 567", reg_number="r 212345 x")
        self.assertEqual(r.status_code, 201)
        req = Request.objects.get(reference_number=r.data["reference_number"])
        self.assertEqual(req.phone_number, "+263771234567")
        self.assertEqual(req.reg_number, "R212345X")
        self.assertTrue(r.data["reg_format_ok"])
        self.assertEqual(self.submit(phone_number="12345", reg_number="R1").status_code, 400)

    def test_consent_required_and_recorded(self):
        self.assertEqual(self.submit(consent=False).status_code, 400)
        r = self.submit()
        req = Request.objects.get(reference_number=r.data["reference_number"])
        self.assertIsNotNone(req.consent_at)
        self.assertEqual(req.terms_version, SiteSettings.load().terms_version)

    def test_several_documents_one_fee(self):
        r = self.submit(
            items=[
                {"document_type": "transcript", "quantity": 2},
                {"document_type": "degree_certificate", "quantity": 1},
            ]
        )
        req = Request.objects.get(reference_number=r.data["reference_number"])
        self.assertEqual(req.fee_amount, Decimal("15.00"))
        self.assertEqual(
            sorted(req.items.values_list("document_type", "quantity")),
            [("degree_certificate", 1), ("transcript", 2)],
        )

    def test_duplicate_warning_and_admin_filter(self):
        first = self.submit()
        dup = self.submit()
        self.assertEqual(dup.status_code, 409)
        self.assertEqual(dup.data["reference_number"], first.data["reference_number"])
        other_phone = self.submit(phone_number="0779999999")
        self.assertEqual(other_phone.status_code, 409)
        self.assertIsNone(other_phone.data["reference_number"])
        second = self.submit(confirm_duplicate=True)
        self.assertEqual(second.status_code, 201)
        self.auth(self.admin)
        rows = self.client.get("/api/requests/", {"duplicate": "1"}).data["results"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r["possible_duplicate"] for r in rows))

    def test_lost_reference_needs_matching_phone(self):
        r = self.submit()
        found = self.client.post(
            "/api/requests/find-reference/",
            {"reg_number": "r123456", "phone_number": "0771234567"},
            format="json",
        )
        self.assertEqual(found.data["results"][0]["reference_number"], r.data["reference_number"])
        wrong = self.client.post(
            "/api/requests/find-reference/",
            {"reg_number": "R123456", "phone_number": "0770000000"},
            format="json",
        )
        self.assertEqual(wrong.data["results"], [])

    def test_honeypot_refuses_bots(self):
        self.assertEqual(self.submit(website="http://spam").status_code, 400)

    def test_clearance_upload_private_and_claimed(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        bad = self.client.post(
            "/api/requests/clearance-upload/",
            {"file": SimpleUploadedFile("x.txt", b"hello", content_type="text/plain")},
        )
        self.assertEqual(bad.status_code, 400)
        up = self.client.post(
            "/api/requests/clearance-upload/",
            {"file": SimpleUploadedFile("portal.png", PNG, content_type="image/png")},
        )
        self.assertEqual(up.status_code, 201)
        r = self.submit(clearance_file_ids=[up.data["id"]])
        req = Request.objects.get(reference_number=r.data["reference_number"])
        url = f"/api/requests/{req.id}/clearance/{up.data['id']}/"
        self.assertEqual(self.client.get(url).status_code, 401)
        self.auth(self.admin)
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_unverified_clearance_needs_override_note(self):
        req = make("MSU-2026-500001", clearance_verified=False)
        with self.assertRaises(ValidationError):
            services.change_status(req, "submitted_to_msu", self.admin)
        req.refresh_from_db()
        services.change_status(req, "submitted_to_msu", self.admin, note="Checked by phone")
        self.assertEqual(req.status, "submitted_to_msu")


@override_settings(LOOKUP_RATE_LIMIT=10, LOOKUP_WINDOW_SECONDS=600)
class LookupRateLimitTests(Base):
    def test_eleventh_lookup_is_refused(self):
        for _ in range(10):
            self.assertEqual(
                self.client.get(
                    "/api/requests/status/", {"reference_number": "X", "reg_number": "Y"}
                ).status_code,
                404,
            )
        self.assertEqual(
            self.client.get(
                "/api/requests/status/", {"reference_number": "X", "reg_number": "Y"}
            ).status_code,
            429,
        )


# ------------------------------------------------------------- Stage 6 / 9


class TeamTests(Base):
    def test_invite_and_roles(self):
        self.auth(self.admin)
        r = self.client.post(
            "/api/team/",
            {"email": "new@example.com", "full_name": "New Person", "role": "staff"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("reset-password", mail.outbox[0].body)
        user = User.objects.get(email="new@example.com")
        self.assertTrue(user.roles.filter(role="staff").exists())
        off = self.client.patch(f"/api/team/{user.id}/", {"is_active": False}, format="json")
        self.assertFalse(off.data["is_active"])

    def test_last_admin_cannot_be_removed(self):
        self.auth(self.admin)
        r = self.client.patch(f"/api/team/{self.admin.id}/", {"role": "staff"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_staff_can_work_but_not_administer(self):
        req = make("MSU-2026-600001")
        self.auth(self.staff)
        self.assertEqual(
            self.client.post(
                f"/api/requests/{req.id}/payments/", {"amount": 15}, format="json"
            ).status_code,
            201,
        )
        self.assertEqual(self.client.get("/api/team/").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/drivers/", {"full_name": "X", "phone": "0771234567"}
            ).status_code,
            403,
        )
        self.assertEqual(self.client.get("/api/drivers/").status_code, 200)
        self.assertEqual(self.client.get("/api/audit-log/").status_code, 403)

    def test_history_names_the_staff_member(self):
        self.staff.full_name = "Rudo Staff"
        self.staff.save()
        req = make("MSU-2026-600002")
        self.auth(self.staff)
        self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(req.id)], "status": "submitted_to_msu"},
            format="json",
        )
        history = self.client.get(f"/api/requests/{req.id}/history/").data
        self.assertTrue(any(e["actor"] == "Rudo Staff" for e in history))


class AdminToolsTests(Base):
    def setUp(self):
        super().setUp()
        self.auth(self.admin)

    def test_global_search_last_four_phone_digits(self):
        make("MSU-2026-700001", phone_number="+263771239876")
        data = self.client.get("/api/requests/search/", {"q": "9876"}).data
        self.assertEqual(data["groups"][0]["type"], "phone")
        exact = self.client.get("/api/requests/search/", {"q": "MSU-2026-700001"}).data
        self.assertIsNotNone(exact["exact"])

    def test_handin_list_for_bulk_submission(self):
        reqs = [make(f"MSU-2026-71{i:04d}") for i in range(12)]
        r = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(x.id) for x in reqs], "status": "submitted_to_msu"},
            format="json",
        )
        self.assertEqual(r.data["moved"], 12)
        handin = HandInList.objects.get()
        self.assertTrue(handin.number.startswith("HL-"))
        self.assertEqual(handin.requests.count(), 12)
        detail = self.client.get(f"/api/handin-lists/{handin.id}/").data
        self.assertEqual(len(detail["requests"]), 12)
        self.assertTrue(reqs[0].events.filter(note__contains=handin.number).exists())

    def test_tab_counts_and_days_in_stage(self):
        old = make("MSU-2026-720001")
        Request.objects.filter(pk=old.pk).update(
            status_changed_at=timezone.now() - timedelta(days=5)
        )
        make("MSU-2026-720002")
        counts = self.client.get("/api/requests/counts/").data
        self.assertEqual(counts["received"], 2)
        rows = {r["reference_number"]: r for r in self.client.get("/api/requests/").data["results"]}
        self.assertEqual(rows["MSU-2026-720001"]["stage_level"], "red")
        self.assertEqual(rows["MSU-2026-720002"]["stage_level"], "ok")

    def test_saved_views_are_per_user(self):
        self.client.post(
            "/api/saved-views/",
            {"name": "At MSU over 5 days", "params": {"status": "submitted_to_msu", "min_days": 5}},
            format="json",
        )
        self.assertEqual(len(self.client.get("/api/saved-views/").data), 1)
        self.auth(self.staff)
        self.assertEqual(len(self.client.get("/api/saved-views/").data), 0)

    def test_notes_are_internal(self):
        req = make("MSU-2026-730001")
        self.client.post(
            f"/api/requests/{req.id}/notes/", {"text": "Called graduate"}, format="json"
        )
        detail = self.client.get(f"/api/requests/{req.id}/").data
        self.assertEqual(detail["team_notes"][0]["text"], "Called graduate")
        self.client.credentials()
        public = self.client.get(
            "/api/requests/status/",
            {"reference_number": req.reference_number, "reg_number": req.reg_number},
        )
        self.assertNotIn("Called graduate", json.dumps(public.data, default=str))

    def test_detail_previous_and_next(self):
        a, b, c = (make(f"MSU-2026-74000{i}") for i in range(3))
        data = self.client.get(f"/api/requests/{b.id}/").data
        self.assertEqual(
            {data["neighbours"]["previous"], data["neighbours"]["next"]}, {str(a.id), str(c.id)}
        )

    def test_driver_off_today_cannot_be_picked(self):
        req = make("MSU-2026-750001")
        self.walk(req, "submitted_to_msu", "collected_from_msu")
        self.client.post(
            f"/api/drivers/{self.driver.id}/availability/",
            {"available_today": False},
            format="json",
        )
        r = self.client.post(
            "/api/dispatch/batches/",
            {"request_ids": [str(req.id)], "driver_id": str(self.driver.id)},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_branch_in_use_only_deactivates_and_csv_import(self):
        make(
            "MSU-2026-760001",
            zone="outside_harare",
            harare_address=None,
            suburb="",
            zimpost_branch=self.branch,
            fee_amount="20.00",
            payment_method="cash_deposit",
        )
        self.assertEqual(self.client.delete(f"/api/branches/{self.branch.id}/").status_code, 400)
        from django.core.files.uploadedfile import SimpleUploadedFile

        csv = SimpleUploadedFile(
            "b.csv", b"branch_name,branch_area\nKwekwe Central,Midlands\n", content_type="text/csv"
        )
        r = self.client.post("/api/branches/import/", {"file": csv})
        self.assertEqual(r.data["created"], 1)
        names = [
            b["branch_name"] for b in self.client.get("/api/branches/", {"active": "true"}).data
        ]
        self.assertIn("Kwekwe Central", names)

    def test_suburb_in_settings_reaches_form(self):
        self.client.post("/api/suburbs/", {"name": "New Marlborough"}, format="json")
        names = [s["name"] for s in self.client.get("/api/settings/public/").data["suburbs"]]
        self.assertIn("New Marlborough", names)
        self.assertTrue(AuditLog.objects.filter(action="suburb.create").exists())

    def test_assisted_request_records_channel_and_staff(self):
        self.auth(self.staff)
        r = self.client.post(
            "/api/requests/assisted/", {**SUBMIT, "channel": "walk_in"}, format="json"
        )
        self.assertEqual(r.status_code, 201)
        req = Request.objects.get(pk=r.data["id"])
        self.assertEqual((req.channel, req.created_by), ("walk_in", self.staff))
        self.assertIn("staff:", req.consent_via)

    def test_overview_counts_match_list(self):
        make("MSU-2026-770001")
        make("MSU-2026-770002", status="received")
        data = self.client.get("/api/reports/overview/").data
        self.assertEqual(
            data["by_status"]["received"],
            self.client.get("/api/requests/", {"status": "received"}).data["count"],
        )

    def test_sidebar_counts(self):
        make("MSU-2026-780001")
        self.assertEqual(self.client.get("/api/requests/sidebar-counts/").data["received"], 1)


# ------------------------------------------------------------- Stage 10


class MsuPortalTests(Base):
    def setUp(self):
        super().setUp()
        self.req = make("MSU-2026-800001")
        self.walk(self.req, "submitted_to_msu")

    def test_portal_off_blocks_msu_staff(self):
        r = self.client.post(
            "/api/auth/login/",
            {"email": "msu@example.com", "password": "pw12345678"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        self.auth(self.msu)
        self.assertEqual(self.client.get("/api/msu/queue/").status_code, 403)

    def test_portal_on_shows_queue_without_contact_details(self):
        site = SiteSettings.load()
        site.msu_portal_enabled = True
        site.save()
        self.auth(self.msu)
        data = self.client.get("/api/msu/queue/").data
        self.assertEqual(len(data["results"]), 1)
        text = json.dumps(data, default=str)
        self.assertNotIn("0771234567", text)
        self.assertNotIn("+26377", text)
        self.assertNotIn("Main St", text)
        self.assertEqual(self.client.get("/api/requests/").status_code, 403)

        ready = self.client.post("/api/msu/ready/", {"ids": [str(self.req.id)]}, format="json")
        self.assertEqual(ready.data["moved"], 1)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, "submitted_to_msu")
        self.assertIsNotNone(self.req.ready_at_msu_at)
        self.assertTrue(self.req.events.filter(event_type="msu", actor=self.msu).exists())

    def test_reject_with_reason_shows_on_tracking(self):
        site = SiteSettings.load()
        site.msu_portal_enabled = True
        site.save()
        self.auth(self.msu)
        self.assertEqual(
            self.client.post(
                f"/api/msu/requests/{self.req.id}/reject/", {}, format="json"
            ).status_code,
            400,
        )
        r = self.client.post(
            f"/api/msu/requests/{self.req.id}/reject/", {"reason_code": "library"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.client.credentials()
        public = self.client.get(
            "/api/requests/status/",
            {"reference_number": self.req.reference_number, "reg_number": self.req.reg_number},
        ).data
        self.assertIn("Library clearance", public["status_reason"])

    def test_collection_run_with_portal_off(self):
        self.auth(self.admin)
        self.client.post("/api/requests/ready-at-msu/", {"ids": [str(self.req.id)]}, format="json")
        rows = self.client.get("/api/requests/", {"status": "ready_at_msu"}).data["results"]
        self.assertEqual(len(rows), 1)
        r = self.client.post(
            "/api/requests/bulk-update-status/",
            {"ids": [str(self.req.id)], "status": "collected_from_msu"},
            format="json",
        )
        self.assertEqual(r.data["moved"], 1)

    def test_monthly_report(self):
        services.change_status(self.req, "collected_from_msu", self.admin)
        other = make("MSU-2026-800002")
        self.walk(other, "submitted_to_msu")
        services.change_status(other, "rejected", self.admin, reason="Balance owing at Accounts")
        self.auth(self.admin)
        data = self.client.get("/api/reports/monthly/").data
        self.assertEqual((data["handed_in"], data["released"], data["rejected"]), (2, 1, 1))
        self.assertEqual(data["rejected_by_reason"][0]["reason"], "Balance owing at Accounts")
        xlsx = self.client.get("/api/reports/monthly/", {"export": "xlsx"})
        self.assertEqual(xlsx.status_code, 200)
        load_workbook(io.BytesIO(xlsx.content))


# ------------------------------------------------------------- Stage 11


class SecurityTests(Base):
    def test_public_key_cannot_read_private_data(self):
        self.client.credentials()
        for url in (
            "/api/requests/",
            "/api/drivers/",
            "/api/team/",
            "/api/audit-log/",
            "/api/notifications/",
            "/api/settings/",
        ):
            self.assertIn(self.client.get(url).status_code, (401, 403), url)

    @override_settings(REQUIRE_MFA=True)
    def test_second_factor_required(self):
        self.auth(self.admin, mfa_claim=False)
        self.assertEqual(self.client.get("/api/requests/").status_code, 403)
        setup = self.client.post("/api/auth/mfa/setup/")
        self.assertEqual(setup.status_code, 200)
        code = mfa.code_at(setup.data["secret"])
        tokens = self.client.post("/api/auth/mfa/confirm/", {"code": code}, format="json").data
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get("/api/requests/").status_code, 200)

        self.client.credentials()
        need = self.client.post(
            "/api/auth/login/",
            {"email": "admin@example.com", "password": "pw12345678"},
            format="json",
        )
        self.assertTrue(need.data["otp_required"])
        self.admin.refresh_from_db()
        ok = self.client.post(
            "/api/auth/login/",
            {
                "email": "admin@example.com",
                "password": "pw12345678",
                "otp": mfa.code_at(self.admin.totp_secret),
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 200)


class DataProtectionTests(Base):
    def test_retention_anonymises_old_closed_requests(self):
        old = make("MSU-2026-900001")
        services.change_status(old, "submitted_to_msu", self.admin)
        services.change_status(old, "rejected", self.admin, reason="Record not found")
        Request.objects.filter(pk=old.pk).update(
            status_changed_at=timezone.now() - timedelta(days=400)
        )
        fresh = make("MSU-2026-900002")
        call_command("apply_retention", verbosity=0)
        old.refresh_from_db()
        fresh.refresh_from_db()
        self.assertIsNotNone(old.anonymised_at)
        self.assertEqual(old.phone_number, services.ANONYMISED)
        self.assertIsNone(fresh.anonymised_at)
        self.assertTrue(
            AuditLog.objects.filter(action="retention.run", new_value__anonymised=1).exists()
        )

    def test_export_and_erase_one_graduate(self):
        req = make("MSU-2026-910001")
        self.auth(self.admin)
        export = self.client.get("/api/requests/graduate-data/", {"reg_number": "r123456"})
        self.assertEqual(export.status_code, 200)
        self.assertEqual(
            json.loads(export.content)["requests"][0]["reference_number"], req.reference_number
        )
        erase = self.client.post(
            "/api/requests/graduate-data/",
            {"reg_number": "R123456", "confirm": True},
            format="json",
        )
        self.assertEqual(erase.data["anonymised"], 1)
        self.assertEqual(AuditLog.objects.filter(entity="graduate").count(), 2)


class MiscTests(Base):
    def test_health_and_analytics(self):
        self.assertEqual(self.client.get("/api/health/").status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/analytics/",
                {"name": "funnel", "step": "step1", "visit": "abc"},
                format="json",
            ).status_code,
            204,
        )
        self.auth(self.admin)
        funnel = {
            s["step"]: s["visits"] for s in self.client.get("/api/reports/overview/").data["funnel"]
        }
        self.assertEqual(funnel["step1"], 1)

    def test_existing_requests_get_items_on_creation_default(self):
        r = self.submit()
        req = Request.objects.get(reference_number=r.data["reference_number"])
        self.assertEqual(list(req.items.values_list("document_type", flat=True)), ["transcript"])
        self.assertEqual(RequestItem.objects.count(), 1)

    def test_whatsapp_message_template(self):
        req = make("MSU-2026-920001")
        self.walk(req, "submitted_to_msu", "collected_from_msu")
        batch = services.create_dispatch_batch([req.id], self.driver.id, self.admin)
        self.assertIsInstance(batch, DispatchBatch)
        self.auth(self.staff)
        msg = self.client.get(f"/api/requests/{req.id}/message/").data["message"]
        self.assertIn("Blessing Mutasa", msg)
        self.assertIn("/status?ref=MSU-2026-920001", msg)

    def test_suburb_list_seeded(self):
        self.assertTrue(Suburb.objects.filter(name="Avondale").exists())


class DeleteTests(Base):
    def test_admin_deletes_request_with_reason_and_audit(self):
        req = make("MSU-2026-990001")
        self.auth(self.admin)
        url = f"/api/requests/{req.id}/"
        self.assertEqual(self.client.delete(url, {}, format="json").status_code, 400)
        r = self.client.delete(url, {"reason": "Test entry"}, format="json")
        self.assertEqual(r.status_code, 204)
        self.assertFalse(Request.objects.filter(pk=req.pk).exists())
        entry = AuditLog.objects.get(action="request.delete")
        self.assertEqual(entry.old_value["reference_number"], "MSU-2026-990001")

    def test_staff_cannot_delete(self):
        req = make("MSU-2026-990002")
        self.auth(self.staff)
        r = self.client.delete(f"/api/requests/{req.id}/", {"reason": "x"}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.client.post(
            "/api/requests/bulk-delete/", {"ids": [str(req.id)], "reason": "x"}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_paid_or_dispatched_requests_are_kept(self):
        paid = make("MSU-2026-990003")
        services.record_payment(paid, 15, self.admin)
        out = make("MSU-2026-990004")
        self.walk(out, "submitted_to_msu", "collected_from_msu")
        services.create_dispatch_batch([out.id], self.driver.id, self.admin)
        free = make("MSU-2026-990005")
        self.auth(self.admin)
        r = self.client.post(
            "/api/requests/bulk-delete/",
            {"ids": [str(paid.id), str(out.id), str(free.id)], "reason": "Clean-up"},
            format="json",
        )
        self.assertEqual(r.data["deleted"], 1)
        self.assertEqual(len(r.data["skipped"]), 2)
        self.assertTrue(Request.objects.filter(pk__in=[paid.pk, out.pk]).count() == 2)

    def test_delete_team_member_rules(self):
        self.auth(self.admin)
        self.assertEqual(self.client.delete(f"/api/team/{self.admin.id}/").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/team/{self.staff.id}/").status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.staff.pk).exists())
        self.assertTrue(AuditLog.objects.filter(action="team.delete").exists())
        self.auth(self.msu)
        self.assertEqual(self.client.delete(f"/api/team/{self.admin.id}/").status_code, 403)


class DeletedActorTests(Base):
    def test_history_keeps_name_after_staff_deleted(self):
        self.staff.full_name = "Tino Staff"
        self.staff.save()
        req = make("MSU-2026-995001")
        services.change_status(req, "submitted_to_msu", self.staff)
        self.auth(self.admin)
        self.client.delete(f"/api/team/{self.staff.id}/")
        history = self.client.get(f"/api/requests/{req.id}/history/").data
        self.assertEqual(history[0]["actor"], "Tino Staff (account deleted)")
        self.assertEqual(history[-1]["actor"], "Graduate")
