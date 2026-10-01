from datetime import date, datetime, time
from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import ProtectedError, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from rest_framework import generics, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from requests_app import services
from requests_app.models import (
    BatchStatus,
    DispatchBatch,
    Driver,
    Request,
    RequestStatus,
    RequestZone,
)
from requests_app.pagination import RequestPagination
from requests_app.serializers import (
    BatchDetailSerializer,
    BatchSerializer,
    DriverSerializer,
    RequestAdminSerializer,
    RequestEventSerializer,
    RequestSubmitSerializer,
    RequestUpdateSerializer,
    lookup_payload,
)


def _message(exc: DjangoValidationError) -> str:
    return exc.messages[0] if exc.messages else "Invalid request."


def _bad_request(exc: DjangoValidationError) -> Response:
    return Response({"detail": _message(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _local_day_bounds(value: str, end: bool):
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return None
    moment = datetime.combine(day, time.max if end else time.min)
    return timezone.make_aware(moment, services.HARARE_TZ)


def filter_requests(qs, params):
    """The admin filters, shared by the list, the export and "select all N"."""
    status_filter = params.get("status") or "all"
    if status_filter != "all":
        qs = qs.filter(status=status_filter)

    zone_filter = params.get("zone") or "all"
    if zone_filter != "all":
        qs = qs.filter(zone=zone_filter)

    exported_filter = params.get("exported") or "all"
    if exported_filter == "not_exported":
        qs = qs.filter(exported_at__isnull=True)
    elif exported_filter == "exported":
        qs = qs.filter(exported_at__isnull=False)

    search = (params.get("search") or "").strip()
    if search:
        qs = qs.filter(
            Q(reference_number__icontains=search)
            | Q(full_name__icontains=search)
            | Q(reg_number__icontains=search)
            | Q(programme_name__icontains=search)
            | Q(phone_number__icontains=search)
        )

    date_from = params.get("date_from")
    if date_from and (start := _local_day_bounds(date_from, end=False)):
        qs = qs.filter(created_at__gte=start)
    date_to = params.get("date_to")
    if date_to and (finish := _local_day_bounds(date_to, end=True)):
        qs = qs.filter(created_at__lte=finish)
    return qs


def base_queryset():
    return Request.objects.select_related("zimpost_branch", "batch__driver").order_by(
        "-created_at", "id"
    )


class SubmitThrottle(AnonRateThrottle):
    scope = "submit"


class RequestListCreateView(generics.ListCreateAPIView):
    """Two very different operations that happen to share one URL:

    - POST is public: a graduate submits a request. Only the typed fields are
      read; fee, payment method, status, paid and exported_at are set here.
    - GET is admin-only: one page of requests (50), filtered on the server.
    """

    pagination_class = RequestPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsAdmin()]

    def get_throttles(self):
        if self.request.method == "POST":
            return [SubmitThrottle()]
        return []

    def get_queryset(self):
        return filter_requests(base_queryset(), self.request.query_params)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RequestSubmitSerializer
        return RequestAdminSerializer

    def create(self, request, *args, **kwargs):
        serializer = RequestSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            instance = serializer.save()
        return Response(
            {"id": str(instance.id), "reference_number": instance.reference_number},
            status=status.HTTP_201_CREATED,
        )


class RequestStatusLookupView(APIView):
    """Public status check: GET /api/requests/status/?reference_number=&reg_number=

    Both the reference number and the registration number must match. The
    response is built by `lookup_payload`, which is the field allow-list.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        reference_number = request.query_params.get("reference_number", "")
        reg_number = request.query_params.get("reg_number", "")
        if not reference_number or not reg_number:
            return Response(
                {"detail": "reference_number and reg_number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        req = (
            Request.objects.select_related("zimpost_branch", "batch__driver")
            .filter(reference_number=reference_number, reg_number__iexact=reg_number)
            .first()
        )
        if req is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(lookup_payload(req))


class RequestDetailUpdateView(APIView):
    """PATCH /api/requests/{id}/ — paid tick and delivery-detail edits."""

    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        req = get_object_or_404(base_queryset(), pk=pk)
        serializer = RequestUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        try:
            services.update_request(req, data, request.user)
        except DjangoValidationError as exc:
            return _bad_request(exc)
        req = get_object_or_404(base_queryset(), pk=pk)
        return Response(RequestAdminSerializer(req).data)


class RequestHistoryView(APIView):
    """GET /api/requests/{id}/history/ — newest first, admins only."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        events = req.events.select_related("actor")
        return Response(RequestEventSerializer(events, many=True).data)


class RequestBulkUpdateStatusView(APIView):
    """POST /api/requests/bulk-update-status/

    Body: {ids | filters, status, status_reason?, note?, dispatched_at?,
    zimpost_tracking_number?}. Each request is moved on its own through the same
    rules as a single change; ones that cannot move are skipped and reported.
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        new_status = request.data.get("status")
        if new_status not in {choice.value for choice in RequestStatus}:
            return Response({"detail": "invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        ids = request.data.get("ids")
        filters = request.data.get("filters")
        if isinstance(filters, dict) and ids is None:
            qs = filter_requests(base_queryset(), filters)
        else:
            if not isinstance(ids, list) or not ids:
                return Response(
                    {"detail": "ids must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST
                )
            try:
                parsed_ids = [UUID(str(value)) for value in ids]
            except (ValueError, AttributeError, TypeError):
                return Response(
                    {"detail": "ids must all be valid UUIDs."}, status=status.HTTP_400_BAD_REQUEST
                )
            qs = base_queryset().filter(id__in=parsed_ids)

        reason = (request.data.get("status_reason") or "").strip()
        note = (request.data.get("note") or "").strip()
        if new_status == RequestStatus.REJECTED and not reason:
            return Response(
                {"detail": "A rejection needs a reason."}, status=status.HTTP_400_BAD_REQUEST
            )

        dispatched_at = None
        raw_date = request.data.get("dispatched_at")
        if raw_date:
            try:
                parsed = date.fromisoformat(str(raw_date)[:10])
            except ValueError:
                return Response(
                    {"detail": "dispatched_at must be a date (YYYY-MM-DD)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            dispatched_at = timezone.make_aware(
                datetime.combine(parsed, time(9, 0)), services.HARARE_TZ
            )
        tracking = request.data.get("zimpost_tracking_number") or ""

        moved, skipped = 0, []
        for req in qs:
            try:
                services.change_status(
                    req,
                    new_status,
                    request.user,
                    reason=reason or None,
                    note=note,
                    dispatched_at=dispatched_at,
                    tracking_number=tracking,
                )
                moved += 1
            except DjangoValidationError as exc:
                skipped.append({"reference_number": req.reference_number, "reason": _message(exc)})
        return Response({"updated": moved, "moved": moved, "skipped": skipped})


class RequestExportView(APIView):
    """GET /api/requests/export/ — every request matching the filters, as .xlsx.

    Reads all matching rows from the database (not the page on screen). Export
    and the `exported_at` stamp happen in one transaction so a failure part-way
    through cannot mark rows as exported without delivering a file.
    """

    permission_classes = [IsAdmin]

    HEADERS = [
        ("Reference #", 18),
        ("Full Name", 26),
        ("Reg #", 14),
        ("Phone Number", 18),
        ("Email", 28),
        ("Programme", 32),
        ("Year Completed", 15),
        ("Zone", 16),
        ("Address / Zimpost Branch", 40),
        ("Fee (US$)", 11),
        ("Payment Method", 18),
        ("Paid", 8),
        ("Status", 20),
        ("Submitted", 18),
    ]

    def _delivery_address(self, req):
        if req.zone == RequestZone.HARARE:
            parts = [req.harare_address or "", req.suburb or ""]
            return ", ".join(p for p in parts if p)
        if req.zimpost_branch:
            return f"{req.zimpost_branch.branch_name} — {req.zimpost_branch.branch_area}"
        return ""

    def get(self, request):
        with transaction.atomic():
            requests_list = list(filter_requests(base_queryset(), request.query_params))

            wb = Workbook()
            ws = wb.active
            ws.title = "Requests"
            ws.append([name for name, _ in self.HEADERS])
            for col, (_, width) in enumerate(self.HEADERS, start=1):
                ws.column_dimensions[get_column_letter(col)].width = width
                ws.cell(row=1, column=col).font = Font(bold=True)
            ws.freeze_panes = "A2"

            for req in requests_list:
                ws.append(
                    [
                        req.reference_number,
                        req.full_name,
                        req.reg_number,
                        req.phone_number,
                        req.email or "",
                        req.programme_name,
                        req.year_completed,
                        "Harare" if req.zone == RequestZone.HARARE else "Outside Harare",
                        self._delivery_address(req),
                        float(req.fee_amount),
                        req.get_payment_method_display(),
                        "Yes" if req.paid else "No",
                        req.get_status_display(),
                        timezone.localtime(req.created_at, services.HARARE_TZ).strftime(
                            "%Y-%m-%d %H:%M"
                        ),
                    ]
                )
                # Phone and reg numbers are text cells, so Excel keeps a leading
                # 0 or +263 and never turns them into 2.64E+11.
                for col in (3, 4):
                    cell = ws.cell(row=ws.max_row, column=col)
                    cell.value = str(cell.value)
                    cell.data_type = "s"
                    cell.number_format = "@"

            # Stamp only after the workbook is built. update() is used here on
            # purpose: exported_at is bookkeeping, not a tracked change.
            Request.objects.filter(id__in=[r.id for r in requests_list]).update(
                exported_at=timezone.now()
            )

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="requests.xlsx"'
        response["X-Exported-Count"] = str(len(requests_list))
        wb.save(response)
        return response


# --------------------------------------------------------------- dispatch


class DriverViewSet(viewsets.ModelViewSet):
    """Admin-only. Drivers who have carried a batch cannot be deleted, only
    deactivated."""

    permission_classes = [IsAdmin]
    serializer_class = DriverSerializer
    queryset = Driver.objects.all()

    def destroy(self, request, *args, **kwargs):
        driver = self.get_object()
        try:
            driver.delete()
        except ProtectedError:
            return Response(
                {"detail": "This driver has batches, so they can only be deactivated."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DispatchReadyView(generics.ListAPIView):
    """Harare requests at Collected from MSU that are not yet in a batch."""

    permission_classes = [IsAdmin]
    serializer_class = RequestAdminSerializer
    pagination_class = None

    def get_queryset(self):
        return (
            base_queryset()
            .filter(
                zone=RequestZone.HARARE,
                status=RequestStatus.COLLECTED_FROM_MSU,
                batch__isnull=True,
            )
            .order_by("suburb", "created_at")
        )


class BatchListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        batches = DispatchBatch.objects.select_related("driver")
        status_filter = request.query_params.get("status")
        if status_filter in {c.value for c in BatchStatus}:
            batches = batches.filter(status=status_filter)
        return Response(BatchSerializer(batches, many=True).data)

    def post(self, request):
        ids = request.data.get("request_ids")
        driver_id = request.data.get("driver_id")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"detail": "request_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            parsed = [UUID(str(v)) for v in ids]
            UUID(str(driver_id))
        except (ValueError, TypeError, AttributeError):
            return Response({"detail": "Invalid ids."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            batch = services.create_dispatch_batch(
                parsed, driver_id, request.user, notes=request.data.get("notes") or ""
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        return Response(BatchDetailSerializer(batch).data, status=status.HTTP_201_CREATED)


class BatchDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        batch = get_object_or_404(DispatchBatch.objects.select_related("driver"), pk=pk)
        return Response(BatchDetailSerializer(batch).data)


class BatchResolveView(APIView):
    """POST {request_id, delivered, reason?} — mark one document delivered or
    not delivered. Closes the batch when nothing is left out."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        batch = get_object_or_404(DispatchBatch, pk=pk)
        try:
            req = get_object_or_404(Request, pk=UUID(str(request.data.get("request_id"))))
        except ValueError:
            return Response({"detail": "Invalid request id."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            services.resolve_batch_item(
                batch,
                req,
                delivered=bool(request.data.get("delivered")),
                reason=request.data.get("reason") or "",
                actor=request.user,
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        batch.refresh_from_db()
        return Response(BatchDetailSerializer(batch).data)


class BatchCloseView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        batch = get_object_or_404(DispatchBatch, pk=pk)
        if not services.maybe_close_batch(batch):
            return Response(
                {"detail": "Some documents are still out for delivery."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(BatchDetailSerializer(batch).data)
