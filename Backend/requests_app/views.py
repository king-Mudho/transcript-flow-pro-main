from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from requests_app.models import Request, RequestStatus
from requests_app.serializers import (
    RequestAdminSerializer,
    RequestCreateSerializer,
    RequestPaidUpdateSerializer,
    RequestStatusLookupSerializer,
)


class RequestListCreateView(generics.ListCreateAPIView):
    """Two very different operations that happen to share one URL:

    - POST is public. Anyone (a graduate, not logged in) can submit a request.
    - GET is admin-only and returns every field, including the applicant's
      contact details.

    Because the permissions and exposed fields differ so sharply, both are
    resolved per HTTP method rather than set once on the class.
    """

    # select_related avoids a per-row branch query when serializing the list.
    queryset = Request.objects.select_related("zimpost_branch").order_by("-created_at")

    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsAdmin()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RequestCreateSerializer
        return RequestAdminSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Atomic because the serializer generates the reference number by
        # checking for collisions and then inserting; the two must not be
        # separated by another writer.
        with transaction.atomic():
            serializer.save()
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class RequestStatusLookupView(APIView):
    """Public status check: GET /api/requests/status/?reference_number=&reg_number=

    This is the one public read of a request, so it is deliberately narrow.
    Both the reference number and the registration number must match, which
    means knowing a reference number alone is not enough to look someone up.
    The response is restricted to RequestStatusLookupSerializer's field list —
    no contact details, clearance flags, or delivery address.
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
        # reference_number is unique, so this matches at most one row. The
        # registration number is compared case-insensitively because applicants
        # type it by hand.
        req = Request.objects.filter(
            reference_number=reference_number, reg_number__iexact=reg_number
        ).first()
        if req is None:
            # 404 rather than an error body: "no match" is a normal outcome the
            # UI renders as an empty state.
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(RequestStatusLookupSerializer(req).data)


class RequestPaidUpdateView(generics.UpdateAPIView):
    """PATCH /api/requests/{id}/ — admin toggle for the `paid` flag.

    RequestPaidUpdateSerializer exposes only `paid`, so this endpoint cannot be
    used to edit any other field even if extra keys are posted.
    """

    serializer_class = RequestPaidUpdateSerializer
    permission_classes = [IsAdmin]
    queryset = Request.objects.select_related("zimpost_branch")
    http_method_names = ["patch"]

    def update(self, request, *args, **kwargs):
        # Fetch once and reuse: calling get_object() again after super().update()
        # would re-query the row and re-run permission checks for no benefit.
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Respond with the full admin representation so the client can refresh
        # the row without a second request.
        return Response(RequestAdminSerializer(instance).data)


class RequestBulkUpdateStatusView(APIView):
    """POST /api/requests/bulk-update-status/ with {ids, status, status_reason}.

    Powers the admin table's "apply to selected" action.
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        ids = request.data.get("ids")
        new_status = request.data.get("status")

        if not isinstance(ids, list) or not ids:
            return Response(
                {"detail": "ids must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST
            )

        # Validate the ids before they reach the ORM. A malformed UUID in an
        # __in lookup raises deep inside Django and would surface as a 500.
        try:
            parsed_ids = [UUID(str(value)) for value in ids]
        except (ValueError, AttributeError, TypeError):
            return Response(
                {"detail": "ids must all be valid UUIDs."}, status=status.HTTP_400_BAD_REQUEST
            )

        if new_status not in {choice.value for choice in RequestStatus}:
            return Response({"detail": "invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        update_fields = {"status": new_status}
        # Presence of the key, not its value, decides whether status_reason is
        # touched: the client omits it entirely for most transitions, and sends
        # an explicit null to clear a previous rejection reason.
        if "status_reason" in request.data:
            update_fields["status_reason"] = request.data.get("status_reason")

        with transaction.atomic():
            updated = Request.objects.filter(id__in=parsed_ids).update(**update_fields)
        return Response({"updated": updated})


class RequestExportView(APIView):
    """GET /api/requests/export/ — download the requests table as .xlsx.

    Export and the `exported_at` stamp happen in one transaction so a failure
    part-way through cannot mark rows as exported without delivering a file.

    The optional search/status/zone/exported query params mirror the admin
    table's filters, so "export filtered" produces exactly the rows the admin is
    looking at without having to send every id in the URL.
    """

    permission_classes = [IsAdmin]

    HEADERS = [
        "Full Name",
        "Reg #",
        "Programme Name",
        "Year Completed",
        "Reference #",
        "Zone",
        "Address / Zimpost Branch",
    ]

    def _filtered_queryset(self, request):
        qs = Request.objects.select_related("zimpost_branch").order_by("-created_at")

        status_filter = request.query_params.get("status", "all")
        if status_filter != "all":
            qs = qs.filter(status=status_filter)

        zone_filter = request.query_params.get("zone", "all")
        if zone_filter != "all":
            qs = qs.filter(zone=zone_filter)

        exported_filter = request.query_params.get("exported", "all")
        if exported_filter == "not_exported":
            qs = qs.filter(exported_at__isnull=True)
        elif exported_filter == "exported":
            qs = qs.filter(exported_at__isnull=False)

        search = request.query_params.get("search", "")
        if search:
            qs = qs.filter(
                Q(reference_number__icontains=search)
                | Q(full_name__icontains=search)
                | Q(reg_number__icontains=search)
                | Q(programme_name__icontains=search)
            )

        return qs

    def _delivery_address(self, req):
        """Harare requests carry a street address; everyone else collects from a
        Zimpost branch."""
        if req.zone == "harare":
            return req.harare_address or ""
        if req.zimpost_branch:
            return f"{req.zimpost_branch.branch_name} — {req.zimpost_branch.branch_area}"
        return ""

    def get(self, request):
        with transaction.atomic():
            requests_list = list(self._filtered_queryset(request))

            wb = Workbook()
            ws = wb.active
            ws.title = "Requests"
            ws.append(self.HEADERS)
            for req in requests_list:
                ws.append(
                    [
                        req.full_name,
                        req.reg_number,
                        req.programme_name,
                        req.year_completed,
                        req.reference_number,
                        "Harare" if req.zone == "harare" else "Outside Harare",
                        self._delivery_address(req),
                    ]
                )

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
