"""MSU staff portal (Stage 10).

Off by default. While the Settings switch is off, IsMsuStaff refuses every
call and MSU accounts cannot sign in. MSU staff only ever see requests that
have reached MSU, and only the MSU-safe fields (no phone numbers, emails or
addresses).
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsMsuStaff
from requests_app import services
from requests_app.models import MSU_REJECT_REASONS, Request, RequestStatus
from requests_app.serializers import MsuRequestSerializer


def msu_visible():
    """Requests at Submitted to MSU and those MSU has handled."""
    handled = Q(status=RequestStatus.REJECTED) | Q(
        status__in=(
            RequestStatus.COLLECTED_FROM_MSU,
            RequestStatus.DISPATCHED,
            RequestStatus.COLLECTED,
        )
    )
    # Every request at these stages has been through MSU.
    return (
        Request.objects.filter(Q(status=RequestStatus.SUBMITTED_TO_MSU) | handled)
        .prefetch_related("items", "clearance_files")
        .select_related("handin_list")
    )


class MsuQueueView(APIView):
    """GET ?tab=to_process|ready|rejected&handin=HL-1010&search="""

    permission_classes = [IsMsuStaff]

    def get(self, request):
        tab = request.query_params.get("tab") or "to_process"
        qs = msu_visible()
        if tab == "ready":
            qs = qs.filter(status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=False)
        elif tab == "rejected":
            qs = qs.filter(status=RequestStatus.REJECTED)
        else:
            qs = qs.filter(status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=True)
        handin = request.query_params.get("handin")
        if handin:
            qs = qs.filter(handin_list__number=handin)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(reference_number__icontains=search)
                | Q(full_name__icontains=search)
                | Q(reg_number__icontains=search.replace(" ", ""))
            )
        qs = qs.order_by("status_changed_at", "reference_number")[:500]
        counts = {
            "to_process": msu_visible()
            .filter(status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=True)
            .count(),
            "ready": msu_visible()
            .filter(status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=False)
            .count(),
            "rejected": msu_visible().filter(status=RequestStatus.REJECTED).count(),
        }
        return Response(
            {
                "counts": counts,
                "reasons": MSU_REJECT_REASONS,
                "results": MsuRequestSerializer(qs, many=True).data,
            }
        )


class MsuReadyView(APIView):
    """POST {ids}: ready for collection. The graduate's stage is unchanged."""

    permission_classes = [IsMsuStaff]

    def post(self, request):
        ids = request.data.get("ids") or []
        moved, skipped = 0, []
        for req in msu_visible().filter(id__in=ids):
            try:
                services.set_ready_at_msu(req, request.user, True)
                moved += 1
            except DjangoValidationError as exc:
                skipped.append(
                    {"reference_number": req.reference_number, "reason": exc.messages[0]}
                )
        return Response({"moved": moved, "skipped": skipped})


class MsuRejectView(APIView):
    """POST {reason_code, note?}: MSU will not release the document."""

    permission_classes = [IsMsuStaff]

    def post(self, request, pk):
        req = get_object_or_404(msu_visible(), pk=pk)
        try:
            services.msu_reject(
                req,
                request.user,
                request.data.get("reason_code") or "",
                request.data.get("note") or "",
            )
        except DjangoValidationError as exc:
            return Response({"detail": exc.messages[0]}, status=400)
        return Response(MsuRequestSerializer(Request.objects.get(pk=pk)).data)
