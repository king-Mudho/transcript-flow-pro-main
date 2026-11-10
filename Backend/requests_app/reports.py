"""Figures for the Overview (B6.2), the driver cash report (B4.2) and the
monthly report for MSU (B10.4). Everything is worked out on the server from
requests, the history log and payments, never in the browser."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsMsuStaff, IsTeam
from core.models import AnalyticsEvent, SiteSettings
from requests_app import services
from requests_app.models import (
    MSU_REJECT_REASONS,
    OPEN_STATUSES,
    BatchStatus,
    DispatchBatch,
    Payment,
    Request,
    RequestEvent,
    RequestStatus,
    RequestZone,
)
from requests_app.serializers import days_in_stage

TZ = services.HARARE_TZ
STAGE_ORDER = ["received", "submitted_to_msu", "collected_from_msu", "dispatched", "collected"]


def _day_start(d: date):
    return timezone.make_aware(datetime.combine(d, time.min), TZ)


def _parse_day(value, default):
    try:
        return date.fromisoformat(str(value)) if value else default
    except ValueError:
        return default


def _days(delta: timedelta) -> float:
    return round(delta.total_seconds() / 86400, 1)


def stage_durations(request_ids=None):
    """Average days spent in each stage, from the history log."""
    events = RequestEvent.objects.filter(event_type="status_change").order_by(
        "request_id", "created_at", "id"
    )
    if request_ids is not None:
        events = events.filter(request_id__in=request_ids)
    totals, counts = defaultdict(float), defaultdict(int)
    last = {}
    for ev in events.values("request_id", "to_value", "created_at"):
        prev = last.get(ev["request_id"])
        if prev is not None and prev[0] in STAGE_ORDER:
            totals[prev[0]] += (ev["created_at"] - prev[1]).total_seconds() / 86400
            counts[prev[0]] += 1
        last[ev["request_id"]] = (ev["to_value"], ev["created_at"])
    return {
        stage: round(totals[stage] / counts[stage], 1) if counts[stage] else None
        for stage in STAGE_ORDER[:-1]
    }


def weekly_funnel(since):
    steps = ["home", "step1", "step2", "step3", "step4", "submitted"]
    rows = (
        AnalyticsEvent.objects.filter(name="funnel", created_at__gte=since)
        .values("step")
        .annotate(visits=Count("visit", distinct=True))
    )
    found = {r["step"]: r["visits"] for r in rows}
    return [{"step": s, "visits": found.get(s, 0)} for s in steps]


class OverviewView(APIView):
    """GET ?date_from=&date_to= (dates on requests' submission)."""

    permission_classes = [IsTeam]

    def get(self, request):
        from requests_app.views import base_queryset, filter_requests

        site = SiteSettings.load()
        now = timezone.now()
        today = services.harare_today()
        week_start = _day_start(today - timedelta(days=today.weekday()))

        scoped = filter_requests(base_queryset(), request.query_params)
        by_status = {
            r["status"]: r["n"] for r in scoped.order_by().values("status").annotate(n=Count("id"))
        }

        stuck = []
        for stage in ("received", "submitted_to_msu", "collected_from_msu", "dispatched"):
            limits = site.thresholds(stage)
            if not limits:
                continue
            cutoff = now - timedelta(days=limits[1])
            for req in Request.objects.filter(status=stage, status_changed_at__lte=cutoff).order_by(
                "status_changed_at"
            )[:50]:
                stuck.append(
                    {
                        "id": str(req.id),
                        "reference_number": req.reference_number,
                        "full_name": req.full_name,
                        "status": req.status,
                        "days": days_in_stage(req),
                    }
                )

        received_week = Payment.objects.filter(received_at__gte=week_start).aggregate(
            t=Sum("amount")
        )["t"] or Decimal("0")
        expected_week = DispatchBatch.objects.filter(reconciled_at__gte=week_start).aggregate(
            t=Sum("cash_expected")
        )["t"] or Decimal("0")
        outstanding = Decimal("0")
        for req in Request.objects.filter(
            status__in=(RequestStatus.DISPATCHED, RequestStatus.COLLECTED), paid=False
        ):
            outstanding += max(req.fee_amount - req.amount_paid, Decimal("0"))

        start = _parse_day(request.query_params.get("date_from"), today - timedelta(days=30))
        end = _parse_day(request.query_params.get("date_to"), today)
        deliveries = (
            Request.objects.filter(
                status=RequestStatus.COLLECTED,
                zone=RequestZone.HARARE,
                batch__isnull=False,
                status_changed_at__gte=_day_start(start),
                status_changed_at__lt=_day_start(end + timedelta(days=1)),
            )
            .values("batch__driver__full_name")
            .annotate(n=Count("id"))
            .order_by("-n")
        )

        return Response(
            {
                "by_status": {s.value: by_status.get(s.value, 0) for s in RequestStatus},
                "total": sum(by_status.values()),
                "new_today": Request.objects.filter(created_at__gte=_day_start(today)).count(),
                "new_this_week": Request.objects.filter(created_at__gte=week_start).count(),
                "open": Request.objects.filter(status__in=OPEN_STATUSES).count(),
                "stuck": stuck,
                "avg_days_per_stage": stage_durations(
                    list(scoped.values_list("id", flat=True)[:5000])
                ),
                "cash": {
                    "expected_this_week": expected_week,
                    "received_this_week": received_week,
                    "outstanding": outstanding,
                },
                "deliveries_per_driver": [
                    {"driver": d["batch__driver__full_name"], "deliveries": d["n"]}
                    for d in deliveries
                ],
                "funnel": weekly_funnel(now - timedelta(days=7)),
            }
        )


class CashReportView(APIView):
    """GET ?date=YYYY-MM-DD — per driver: expected, handed in, variance for the
    batches closed that day (B4.2)."""

    permission_classes = [IsTeam]

    def get(self, request):
        day = _parse_day(request.query_params.get("date"), services.harare_today())
        batches = DispatchBatch.objects.filter(
            status=BatchStatus.CLOSED,
            reconciled_at__gte=_day_start(day),
            reconciled_at__lt=_day_start(day + timedelta(days=1)),
        ).select_related("driver")
        rows = defaultdict(
            lambda: {"expected": Decimal("0"), "handed_in": Decimal("0"), "batches": []}
        )
        for b in batches:
            row = rows[b.driver.full_name]
            row["expected"] += b.cash_expected or 0
            row["handed_in"] += b.cash_handed_in or 0
            row["batches"].append(
                {"id": str(b.id), "batch_number": b.batch_number, "note": b.variance_note}
            )
        result = [
            {
                "driver": name,
                "expected": r["expected"],
                "handed_in": r["handed_in"],
                "variance": r["handed_in"] - r["expected"],
                "batches": r["batches"],
            }
            for name, r in sorted(rows.items())
        ]
        return Response({"date": day.isoformat(), "drivers": result})


class IsAdminOrMsu(BasePermission):
    def has_permission(self, request, view):
        return IsAdmin().has_permission(request, view) or IsMsuStaff().has_permission(request, view)


def _reason_label(text: str) -> str:
    for label in MSU_REJECT_REASONS.values():
        if text and text.startswith(label):
            return label
    return "Other"


def monthly_report(year: int, month: int) -> dict:
    start = datetime(year, month, 1, tzinfo=TZ)
    end = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=TZ)
    in_month = RequestEvent.objects.filter(
        event_type="status_change", created_at__gte=start, created_at__lt=end
    )

    handed_in = (
        in_month.filter(to_value="submitted_to_msu", from_value="received")
        .values("request_id")
        .distinct()
        .count()
    )
    released_events = list(
        in_month.filter(to_value="collected_from_msu", from_value="submitted_to_msu").values(
            "request_id", "created_at"
        )
    )
    rejected_events = list(
        in_month.filter(to_value="rejected").values("request_id", "created_at", "note")
    )

    reasons = defaultdict(int)
    for ev in rejected_events:
        reasons[_reason_label(ev["note"])] += 1

    days_with_msu = []
    for ev in released_events + rejected_events:
        sent = (
            RequestEvent.objects.filter(
                request_id=ev["request_id"],
                event_type="status_change",
                to_value="submitted_to_msu",
                created_at__lte=ev["created_at"],
            )
            .order_by("-created_at")
            .values_list("created_at", flat=True)
            .first()
        )
        if sent:
            days_with_msu.append(_days(ev["created_at"] - sent))

    collected = list(
        in_month.filter(to_value="collected")
        .select_related("request")
        .values("request__zone", "request__created_at", "created_at")
    )
    deliveries = {"harare": 0, "outside_harare": 0}
    end_to_end = []
    for ev in collected:
        deliveries[ev["request__zone"]] = deliveries.get(ev["request__zone"], 0) + 1
        end_to_end.append(_days(ev["created_at"] - ev["request__created_at"]))

    return {
        "month": f"{year:04d}-{month:02d}",
        "handed_in": handed_in,
        "released": len({e["request_id"] for e in released_events}),
        "rejected": len({e["request_id"] for e in rejected_events}),
        "rejected_by_reason": [
            {"reason": k, "count": v} for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])
        ],
        "avg_days_with_msu": round(sum(days_with_msu) / len(days_with_msu), 1)
        if days_with_msu
        else None,
        "longest_days_with_msu": max(days_with_msu) if days_with_msu else None,
        "deliveries": deliveries,
        "avg_days_end_to_end": round(sum(end_to_end) / len(end_to_end), 1) if end_to_end else None,
    }


class MonthlyReportView(APIView):
    """GET ?month=YYYY-MM[&export=xlsx] — admins, and MSU staff while the
    portal is on."""

    permission_classes = [IsAdminOrMsu]

    def get(self, request):
        raw = request.query_params.get("month") or services.harare_today().strftime("%Y-%m")
        try:
            year, month = (int(p) for p in raw.split("-")[:2])
            if not 1 <= month <= 12:
                raise ValueError
        except ValueError:
            return Response({"detail": "month must be YYYY-MM."}, status=400)
        data = monthly_report(year, month)
        if request.query_params.get("export") != "xlsx":
            return Response(data)

        site = SiteSettings.load()
        wb = Workbook()
        ws = wb.active
        ws.title = "Monthly report"
        ws.append([f"{site.service_name} — monthly report {data['month']}"])
        ws["A1"].font = Font(bold=True, size=13)
        ws.append([])
        for label, value in [
            ("Requests handed in to MSU", data["handed_in"]),
            ("Released by MSU", data["released"]),
            ("Rejected by MSU", data["rejected"]),
            ("Average days with MSU", data["avg_days_with_msu"]),
            ("Longest days with MSU", data["longest_days_with_msu"]),
            ("Harare deliveries", data["deliveries"].get("harare", 0)),
            ("Zimpost deliveries", data["deliveries"].get("outside_harare", 0)),
            ("Average days end to end", data["avg_days_end_to_end"]),
        ]:
            ws.append([label, value if value is not None else "—"])
        ws.append([])
        ws.append(["Rejections by reason", "Count"])
        ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
        for row in data["rejected_by_reason"]:
            ws.append([row["reason"], row["count"]])
        ws.column_dimensions["A"].width = 34
        ws.column_dimensions["B"].width = 14
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="msu-report-{data["month"]}.xlsx"'
        wb.save(response)
        return response
