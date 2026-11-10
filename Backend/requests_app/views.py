import json
import logging
import urllib.parse
import urllib.request
from datetime import date, datetime, time, timedelta
from uuid import UUID

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, ProtectedError, Q
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from rest_framework import generics, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, BaseThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsTeam, IsTeamOrMsu
from core.audit import audit
from requests_app import services
from requests_app.models import (
    OPEN_STATUSES,
    BatchStatus,
    ClearanceFile,
    DispatchBatch,
    Driver,
    HandInList,
    Notification,
    Payment,
    Request,
    RequestStatus,
    RequestZone,
    SavedView,
    TeamNote,
)
from requests_app.notifications import message_for
from requests_app.pagination import RequestPagination
from requests_app.serializers import (
    AssistedRequestSerializer,
    BatchDetailSerializer,
    BatchSerializer,
    DriverSerializer,
    HandInListSerializer,
    NotificationSerializer,
    PaymentSerializer,
    RequestAdminSerializer,
    RequestDetailSerializer,
    RequestEventSerializer,
    RequestSubmitSerializer,
    RequestUpdateSerializer,
    SavedViewSerializer,
    TeamNoteSerializer,
    lookup_payload,
)

logger = logging.getLogger(__name__)


def _message(exc: DjangoValidationError) -> str:
    return exc.messages[0] if exc.messages else "Invalid request."


def _bad_request(exc: DjangoValidationError) -> Response:
    return Response({"detail": _message(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _detail(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _local_day_bounds(value: str, end: bool):
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return None
    moment = datetime.combine(day, time.max if end else time.min)
    return timezone.make_aware(moment, services.HARARE_TZ)


def _parse_ids(ids):
    if not isinstance(ids, list) or not ids:
        raise ValueError("ids must be a non-empty list.")
    try:
        return [UUID(str(value)) for value in ids]
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError("ids must all be valid UUIDs.") from exc


def filter_requests(qs, params, *, skip_status=False):
    """The list filters, shared by the list, the tab counts, the export and
    "select all N"."""
    status_filter = params.get("status") or "all"
    if not skip_status and status_filter != "all":
        if status_filter == "ready_at_msu":
            qs = qs.filter(status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=False)
        else:
            qs = qs.filter(status=status_filter)

    zone_filter = params.get("zone") or "all"
    if zone_filter != "all":
        qs = qs.filter(zone=zone_filter)

    exported_filter = params.get("exported") or "all"
    if exported_filter == "not_exported":
        qs = qs.filter(exported_at__isnull=True)
    elif exported_filter == "exported":
        qs = qs.filter(exported_at__isnull=False)

    payment = params.get("payment") or "all"
    if payment == "paid":
        qs = qs.filter(paid=True)
    elif payment == "part_paid":
        qs = qs.filter(paid=False, amount_paid__gt=0)
    elif payment == "unpaid":
        qs = qs.filter(paid=False, amount_paid__lte=0)

    if str(params.get("duplicate") or "") in ("1", "true"):
        qs = qs.filter(has_duplicate=True, status__in=OPEN_STATUSES)

    if str(params.get("ready") or "") in ("1", "true"):
        qs = qs.filter(ready_at_msu_at__isnull=False, status=RequestStatus.SUBMITTED_TO_MSU)

    if str(params.get("unmapped_suburb") or "") in ("1", "true"):
        qs = qs.filter(zone=RequestZone.HARARE, suburb_ref__isnull=True)

    handin = params.get("handin")
    if handin:
        qs = qs.filter(handin_list__number=handin)

    channel = params.get("channel") or "all"
    if channel != "all":
        qs = qs.filter(channel=channel)

    min_days = params.get("min_days")
    if min_days not in (None, ""):
        try:
            days = int(min_days)
            qs = qs.filter(status_changed_at__lte=timezone.now() - timedelta(days=days))
        except (TypeError, ValueError):
            pass

    search = (params.get("search") or "").strip()
    if search:
        compact = search.replace(" ", "")
        qs = qs.filter(
            Q(reference_number__icontains=search)
            | Q(full_name__icontains=search)
            | Q(reg_number__icontains=compact)
            | Q(programme_name__icontains=search)
            | Q(phone_number__icontains=compact.lstrip("0") if compact.isdigit() else compact)
        )

    date_from = params.get("date_from")
    if date_from and (start := _local_day_bounds(date_from, end=False)):
        qs = qs.filter(created_at__gte=start)
    date_to = params.get("date_to")
    if date_to and (finish := _local_day_bounds(date_to, end=True)):
        qs = qs.filter(created_at__lte=finish)
    return qs


def base_queryset():
    duplicates = Request.objects.filter(
        reg_number__iexact=OuterRef("reg_number"), status__in=OPEN_STATUSES
    ).exclude(pk=OuterRef("pk"))
    return (
        Request.objects.select_related(
            "zimpost_branch", "batch__driver", "handin_list", "created_by"
        )
        .prefetch_related("items")
        .annotate(has_duplicate=Exists(duplicates))
        .order_by("-created_at", "id")
    )


def _serializer_context():
    from core.models import SiteSettings

    return {"site": SiteSettings.load()}


# ------------------------------------------------------------ throttles


class SubmitThrottle(AnonRateThrottle):
    scope = "submit"


class UploadThrottle(AnonRateThrottle):
    scope = "upload"


class LookupThrottle(BaseThrottle):
    """10 public lookups per address in 10 minutes (B11.1), shared by the
    status check and the lost-reference finder. The 11th is refused."""

    def allow_request(self, request, view):
        limit = settings.LOOKUP_RATE_LIMIT
        window = settings.LOOKUP_WINDOW_SECONDS
        key = f"lookup:{self.get_ident(request)}"
        now = timezone.now().timestamp()
        history = [t for t in cache.get(key, []) if t > now - window]
        if len(history) >= limit:
            self._wait = window - (now - history[0])
            return False
        history.append(now)
        cache.set(key, history, window)
        return True

    def wait(self):
        return getattr(self, "_wait", None)


def _turnstile_ok(token: str, ip: str) -> bool:
    if not settings.TURNSTILE_SECRET:
        return True
    if not token:
        return False
    body = urllib.parse.urlencode(
        {"secret": settings.TURNSTILE_SECRET, "response": token, "remoteip": ip}
    ).encode()
    try:
        with urllib.request.urlopen(  # noqa: S310 (fixed https URL)
            "https://challenges.cloudflare.com/turnstile/v0/siteverify", data=body, timeout=8
        ) as response:
            return bool(json.loads(response.read()).get("success"))
    except Exception:  # noqa: BLE001 - a Cloudflare outage must not block graduates
        logger.warning("Turnstile check could not run; allowing the submission.")
        return True


# --------------------------------------------------------------- requests


class RequestListCreateView(generics.ListCreateAPIView):
    """Two very different operations that happen to share one URL:

    - POST is public: a graduate submits a request. Only the typed fields are
      read; fee, payment method, status, paid and exported_at are set here.
    - GET is for the team: one page of requests (50), filtered on the server.
    """

    pagination_class = RequestPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsTeam()]

    def get_throttles(self):
        if self.request.method == "POST":
            return [SubmitThrottle()]
        return []

    def get_queryset(self):
        qs = filter_requests(base_queryset(), self.request.query_params)
        order = self.request.query_params.get("order")
        if order == "oldest_in_stage":
            qs = qs.order_by("status_changed_at", "id")
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RequestSubmitSerializer
        return RequestAdminSerializer

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **_serializer_context()}

    def create(self, request, *args, **kwargs):
        # Honeypot: a field people never see. Bots that fill every field fail.
        if (request.data.get("website") or "").strip():
            return _detail("Your request could not be sent. Please try again.")
        ip = request.META.get("REMOTE_ADDR", "")
        if not _turnstile_ok(request.data.get("turnstile_token") or "", ip):
            return _detail("Please complete the check that you are not a robot.")

        serializer = RequestSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        dup = _duplicate_response(data)
        if dup is not None:
            return dup
        with transaction.atomic():
            instance = services.create_request(data)
        return Response(
            {
                "id": str(instance.id),
                "reference_number": instance.reference_number,
                "fee_amount": instance.fee_amount,
                "reg_format_ok": services.reg_format_ok(instance.reg_number),
            },
            status=status.HTTP_201_CREATED,
        )


def _duplicate_response(data):
    """B5.4: warn when the graduate already has a request in progress. The
    existing reference is only shown when the phone number matches too, so a
    registration number alone cannot reveal someone's reference."""
    if data.get("confirm_duplicate"):
        return None
    existing = services.open_duplicates(data["reg_number"]).first()
    if existing is None:
        return None
    same_phone = existing.phone_number == data["phone_number"]
    return Response(
        {
            "duplicate": True,
            "reference_number": existing.reference_number if same_phone else None,
            "detail": (
                f"You already have request {existing.reference_number} in progress."
                if same_phone
                else "There is already a request in progress for this registration number."
            ),
        },
        status=status.HTTP_409_CONFLICT,
    )


class AssistedRequestView(APIView):
    """POST: a team member takes a request for a graduate who called,
    WhatsApped or walked in (B9.2). Same checks as the public form."""

    permission_classes = [IsTeam]

    def post(self, request):
        serializer = AssistedRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        channel = data.pop("channel")
        dup = _duplicate_response(data)
        if dup is not None:
            return dup
        with transaction.atomic():
            instance = services.create_request(
                data,
                actor=request.user,
                channel=channel,
                consent_via=f"staff:{request.user.display_name}",
            )
        instance = base_queryset().get(pk=instance.pk)
        return Response(
            RequestAdminSerializer(instance, context=_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class ClearanceUploadView(APIView):
    """Public: upload one clearance screenshot or PDF before submitting.

    JPG, PNG or PDF, up to 5 MB. The type is checked from the file's first
    bytes, not its name. Returns an id the submission then claims."""

    permission_classes = [AllowAny]
    throttle_classes = [UploadThrottle]
    parser_classes = [MultiPartParser, FormParser]

    SIGNATURES = (
        (b"\xff\xd8\xff", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\n", "image/png"),
        (b"%PDF-", "application/pdf"),
    )

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return _detail("Choose a file to upload.")
        if upload.size > settings.CLEARANCE_MAX_BYTES:
            return _detail("That file is over 5 MB. Try a smaller screenshot.")
        head = upload.read(8)
        upload.seek(0)
        content_type = next((t for sig, t in self.SIGNATURES if head.startswith(sig)), None)
        if content_type is None:
            return _detail("Upload a JPG, PNG or PDF file.")
        record = ClearanceFile(
            original_name=(upload.name or "clearance")[:200],
            content_type=content_type,
            size=upload.size,
        )
        record.file.save(str(record.id), upload, save=False)
        record.save()
        return Response(
            {
                "id": str(record.id),
                "original_name": record.original_name,
                "size": record.size,
                "content_type": content_type,
            },
            status=status.HTTP_201_CREATED,
        )


class ClearanceFileView(APIView):
    """Stream a clearance file to the team, or to MSU staff for requests that
    have reached MSU. There is no public URL for these files."""

    permission_classes = [IsTeamOrMsu]

    def get(self, request, pk, file_id):
        req = get_object_or_404(Request, pk=pk)
        if not IsTeam().has_permission(request, self) and req.status == RequestStatus.RECEIVED:
            return _detail("Not found.", status.HTTP_404_NOT_FOUND)
        record = get_object_or_404(ClearanceFile, pk=file_id, request=req)
        response = FileResponse(record.file.open("rb"), content_type=record.content_type)
        response["Content-Disposition"] = f'inline; filename="{record.original_name}"'
        response["Cache-Control"] = "private, no-store"
        return response


class RequestStatusLookupView(APIView):
    """Public status check: GET /api/requests/status/?reference_number=&reg_number=

    Both the reference number and the registration number must match. The
    response is built by `lookup_payload`, which is the field allow-list.
    """

    permission_classes = [AllowAny]
    throttle_classes = [LookupThrottle]

    def get(self, request):
        reference_number = (request.query_params.get("reference_number") or "").strip().upper()
        reg_number = services.normalise_reg(request.query_params.get("reg_number", ""))
        if not reference_number or not reg_number:
            return _detail("reference_number and reg_number are required.")
        req = (
            Request.objects.select_related("zimpost_branch", "batch__driver")
            .prefetch_related("items")
            .filter(reference_number=reference_number, reg_number__iexact=reg_number)
            .first()
        )
        if req is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(lookup_payload(req))


class FindReferenceView(APIView):
    """POST {reg_number, phone_number}: the lost-reference finder (B5.1).
    Both must match; returns only references and statuses."""

    permission_classes = [AllowAny]
    throttle_classes = [LookupThrottle]

    def post(self, request):
        reg = services.normalise_reg(request.data.get("reg_number", ""))
        try:
            phone = services.normalise_phone(request.data.get("phone_number", ""))
        except DjangoValidationError:
            return Response({"results": []})
        if not reg:
            return Response({"results": []})
        rows = Request.objects.filter(reg_number__iexact=reg, phone_number=phone).order_by(
            "-created_at"
        )[:5]
        return Response(
            {
                "results": [
                    {"reference_number": r.reference_number, "status": r.status} for r in rows
                ]
            }
        )


class RequestCountsView(APIView):
    """Tab counts for the requests list: one per stage plus Ready at MSU,
    using the same filters as the list (apart from the stage)."""

    permission_classes = [IsTeam]

    def get(self, request):
        qs = filter_requests(base_queryset(), request.query_params, skip_status=True)
        counts = {
            row["status"]: row["n"]
            for row in qs.order_by().values("status").annotate(n=Count("id"))
        }
        data = {s.value: counts.get(s.value, 0) for s in RequestStatus}
        data["all"] = sum(counts.values())
        data["ready_at_msu"] = qs.filter(
            status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=False
        ).count()
        return Response(data)


class SidebarCountsView(APIView):
    """Badges for the admin sidebar and the Needs attention bell."""

    permission_classes = [IsTeam]

    def get(self, request):
        from core.models import SiteSettings

        site = SiteSettings.load()
        received = Request.objects.filter(status=RequestStatus.RECEIVED).count()
        dispatch_ready = Request.objects.filter(
            zone=RequestZone.HARARE, status=RequestStatus.COLLECTED_FROM_MSU, batch__isnull=True
        ).count()
        zimpost_ready = Request.objects.filter(
            zone=RequestZone.OUTSIDE_HARARE, status=RequestStatus.COLLECTED_FROM_MSU
        ).count()
        ready_at_msu = Request.objects.filter(
            status=RequestStatus.SUBMITTED_TO_MSU, ready_at_msu_at__isnull=False
        ).count()
        stuck = 0
        now = timezone.now()
        for stage in ("received", "submitted_to_msu", "collected_from_msu", "dispatched"):
            limits = site.thresholds(stage)
            if limits and limits[1] is not None:
                stuck += Request.objects.filter(
                    status=stage, status_changed_at__lte=now - timedelta(days=limits[1])
                ).count()
        failed = Notification.objects.filter(
            status=Notification.Status.FAILED, created_at__gte=now - timedelta(days=7)
        ).count()
        unmapped = Request.objects.filter(
            zone=RequestZone.HARARE, suburb_ref__isnull=True, status__in=OPEN_STATUSES
        ).count()
        open_batches = DispatchBatch.objects.filter(status=BatchStatus.OUT_FOR_DELIVERY).count()
        return Response(
            {
                "received": received,
                "dispatch_ready": dispatch_ready,
                "zimpost_ready": zimpost_ready,
                "ready_at_msu": ready_at_msu,
                "attention": {
                    "stuck": stuck,
                    "failed_messages": failed,
                    "unmapped_suburbs": unmapped,
                    "open_batches": open_batches,
                },
            }
        )


class RequestSearchView(APIView):
    """GET ?q= — global search across reference, name, reg number and phone,
    grouped by what matched. An exact reference (a scanned label) is flagged so
    the workspace can open it straight away."""

    permission_classes = [IsTeam]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response({"exact": None, "groups": []})
        compact = q.replace(" ", "")
        exact = Request.objects.filter(reference_number__iexact=compact).first()
        groups = []

        def rows(qs):
            return [
                {
                    "id": str(r.id),
                    "reference_number": r.reference_number,
                    "full_name": r.full_name,
                    "reg_number": r.reg_number,
                    "phone_number": r.phone_number,
                    "status": r.status,
                }
                for r in qs.order_by("-created_at")[:6]
            ]

        by_ref = rows(Request.objects.filter(reference_number__icontains=compact))
        if by_ref:
            groups.append({"type": "reference", "label": "Reference", "results": by_ref})
        by_name = rows(Request.objects.filter(full_name__icontains=q))
        if by_name:
            groups.append({"type": "name", "label": "Name", "results": by_name})
        by_reg = rows(Request.objects.filter(reg_number__icontains=compact))
        if by_reg:
            groups.append({"type": "reg", "label": "Reg number", "results": by_reg})
        digits = "".join(ch for ch in q if ch.isdigit())
        if len(digits) >= 3:
            by_phone = rows(Request.objects.filter(phone_number__contains=digits.lstrip("0")))
            if by_phone:
                groups.append({"type": "phone", "label": "Phone", "results": by_phone})
        return Response({"exact": str(exact.id) if exact else None, "groups": groups})


class RequestDetailUpdateView(APIView):
    """GET /api/requests/{id}/ — the full record, with neighbours in the list
    it was opened from (pass the list's filters). PATCH — delivery details,
    contact details and the clearance check. DELETE — admins only; see
    services.delete_request for what can be deleted."""

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == "DELETE" else [IsTeam()]

    def delete(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        try:
            services.delete_request(req, request.user, request.data.get("reason") or "")
        except DjangoValidationError as exc:
            return _bad_request(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request, pk):
        req = get_object_or_404(
            base_queryset().prefetch_related("clearance_files", "team_notes__author"), pk=pk
        )
        data = RequestDetailSerializer(req, context=_serializer_context()).data
        ids = list(
            filter_requests(base_queryset(), request.query_params).values_list("id", flat=True)[
                :5000
            ]
        )
        prev_id = next_id = None
        if req.id in ids:
            i = ids.index(req.id)
            prev_id = ids[i - 1] if i > 0 else None
            next_id = ids[i + 1] if i + 1 < len(ids) else None
        data["neighbours"] = {
            "previous": str(prev_id) if prev_id else None,
            "next": str(next_id) if next_id else None,
            "position": ids.index(req.id) + 1 if req.id in ids else None,
            "total": len(ids),
        }
        return Response(data)

    def patch(self, request, pk):
        req = get_object_or_404(base_queryset(), pk=pk)
        if "paid" in request.data:
            return _detail("Payments are recorded with Record payment, not a tick.")
        serializer = RequestUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        try:
            services.update_request(req, data, request.user)
        except DjangoValidationError as exc:
            return _bad_request(exc)
        req = get_object_or_404(base_queryset(), pk=pk)
        return Response(RequestAdminSerializer(req, context=_serializer_context()).data)


class RequestBulkDeleteView(APIView):
    """POST {ids, reason}: admins delete several requests. Each one is checked
    on its own; ones that cannot be deleted are skipped and reported."""

    permission_classes = [IsAdmin]

    def post(self, request):
        try:
            ids = _parse_ids(request.data.get("ids"))
        except ValueError as exc:
            return _detail(str(exc))
        reason = request.data.get("reason") or ""
        deleted, skipped = 0, []
        for req in Request.objects.filter(id__in=ids):
            ref = req.reference_number
            try:
                services.delete_request(req, request.user, reason)
                deleted += 1
            except DjangoValidationError as exc:
                skipped.append({"reference_number": ref, "reason": _message(exc)})
        return Response({"deleted": deleted, "skipped": skipped})


class RequestHistoryView(APIView):
    """GET /api/requests/{id}/history/ — newest first, for the team."""

    permission_classes = [IsTeam]

    def get(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        events = req.events.select_related("actor")
        return Response(RequestEventSerializer(events, many=True).data)


class TeamNotesView(APIView):
    permission_classes = [IsTeam]

    def get(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        return Response(TeamNoteSerializer(req.team_notes.select_related("author"), many=True).data)

    def post(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        serializer = TeamNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = TeamNote.objects.create(
            request=req, author=request.user, text=serializer.validated_data["text"]
        )
        return Response(TeamNoteSerializer(note).data, status=status.HTTP_201_CREATED)


class GraduateMessageView(APIView):
    """GET the ready WhatsApp message for this request's current stage
    (B5.2 phase 1). The workspace opens WhatsApp with it."""

    permission_classes = [IsTeam]

    def get(self, request, pk):
        req = get_object_or_404(
            Request.objects.select_related("batch__driver", "zimpost_branch"), pk=pk
        )
        return Response({"phone": req.phone_number, "message": message_for(req)})


class RecordPaymentView(APIView):
    """POST {amount, note?, received_at?}: record cash received (B4.1)."""

    permission_classes = [IsTeam]

    def get(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        rows = req.payments.select_related("received_by_driver", "received_by_user")
        return Response(PaymentSerializer(rows, many=True).data)

    def post(self, request, pk):
        req = get_object_or_404(Request, pk=pk)
        received_at = None
        raw = request.data.get("received_at")
        if raw:
            try:
                received_at = timezone.make_aware(
                    datetime.combine(date.fromisoformat(str(raw)[:10]), time(12, 0)),
                    services.HARARE_TZ,
                )
            except ValueError:
                return _detail("received_at must be a date (YYYY-MM-DD).")
        try:
            payment = services.record_payment(
                req,
                request.data.get("amount"),
                request.user,
                received_at=received_at,
                note=request.data.get("note") or "",
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        except (TypeError, ValueError, ArithmeticError):
            return _detail("Enter the amount received.")
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class ReversePaymentView(APIView):
    permission_classes = [IsTeam]

    def post(self, request, pk):
        payment = get_object_or_404(Payment, pk=pk)
        try:
            reversal = services.reverse_payment(
                payment, request.user, request.data.get("reason") or ""
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        return Response(PaymentSerializer(reversal).data, status=status.HTTP_201_CREATED)


class ReadyAtMsuView(APIView):
    """POST {ids, ready=true}: the team marks documents ready at MSU when MSU
    tells them by phone (B10.3 works with the portal off)."""

    permission_classes = [IsTeam]

    def post(self, request):
        try:
            ids = _parse_ids(request.data.get("ids"))
        except ValueError as exc:
            return _detail(str(exc))
        ready = request.data.get("ready", True) is not False
        moved, skipped = 0, []
        for req in Request.objects.filter(id__in=ids):
            try:
                services.set_ready_at_msu(req, request.user, ready)
                moved += 1
            except DjangoValidationError as exc:
                skipped.append({"reference_number": req.reference_number, "reason": _message(exc)})
        return Response({"moved": moved, "updated": moved, "skipped": skipped})


class RequestBulkUpdateStatusView(APIView):
    """POST /api/requests/bulk-update-status/

    Body: {ids | filters, status, status_reason?, note?, dispatched_at?,
    zimpost_tracking_number?}. Each request is moved on its own through the same
    rules as a single change; ones that cannot move are skipped and reported.
    Moves from Received to Submitted to MSU create one hand-in list.
    """

    permission_classes = [IsTeam]

    def post(self, request):
        new_status = request.data.get("status")
        if new_status not in {choice.value for choice in RequestStatus}:
            return _detail("invalid status.")

        ids = request.data.get("ids")
        filters = request.data.get("filters")
        if isinstance(filters, dict) and ids is None:
            qs = filter_requests(base_queryset(), filters)
        else:
            try:
                parsed_ids = _parse_ids(ids)
            except ValueError as exc:
                return _detail(str(exc))
            qs = base_queryset().filter(id__in=parsed_ids)

        reason = (request.data.get("status_reason") or "").strip()
        note = (request.data.get("note") or "").strip()
        if new_status == RequestStatus.REJECTED and not reason:
            return _detail("A rejection needs a reason.")

        dispatched_at = None
        raw_date = request.data.get("dispatched_at")
        if raw_date:
            try:
                parsed = date.fromisoformat(str(raw_date)[:10])
            except ValueError:
                return _detail("dispatched_at must be a date (YYYY-MM-DD).")
            dispatched_at = timezone.make_aware(
                datetime.combine(parsed, time(9, 0)), services.HARARE_TZ
            )
        tracking = request.data.get("zimpost_tracking_number") or ""

        moved, skipped, handin = services.move_many(
            list(qs),
            new_status,
            request.user,
            reason=reason or None,
            note=note,
            dispatched_at=dispatched_at,
            tracking_number=tracking,
        )
        return Response(
            {
                "updated": moved,
                "moved": moved,
                "skipped": skipped,
                "handin_list": (
                    {"id": str(handin.id), "number": handin.number} if handin else None
                ),
            }
        )


EXPORT_HEADERS = [
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
    ("Documents", 34),
    ("Amount Paid (US$)", 16),
    ("Channel", 12),
]


def delivery_address(req):
    if req.zone == RequestZone.HARARE:
        parts = [req.harare_address or "", req.suburb or ""]
        return ", ".join(p for p in parts if p)
    if req.zimpost_branch:
        return f"{req.zimpost_branch.branch_name} — {req.zimpost_branch.branch_area}"
    return ""


class RequestExportView(APIView):
    """GET /api/requests/export/ — every request matching the filters, as .xlsx.

    Reads all matching rows from the database (not the page on screen). Export
    and the `exported_at` stamp happen in one transaction so a failure part-way
    through cannot mark rows as exported without delivering a file.
    """

    permission_classes = [IsTeam]
    HEADERS = EXPORT_HEADERS

    def get(self, request):
        from requests_app.serializers import documents_summary

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
                        delivery_address(req),
                        float(req.fee_amount),
                        req.get_payment_method_display(),
                        "Yes" if req.paid else "No",
                        req.get_status_display(),
                        timezone.localtime(req.created_at, services.HARARE_TZ).strftime(
                            "%Y-%m-%d %H:%M"
                        ),
                        documents_summary(req.items.all()),
                        float(req.amount_paid or 0),
                        req.get_channel_display(),
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


class SavedViewViewSet(viewsets.ModelViewSet):
    """Each team member's saved list views (B9.3)."""

    permission_classes = [IsTeam]
    serializer_class = SavedViewSerializer

    def get_queryset(self):
        return SavedView.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class NotificationListView(generics.ListAPIView):
    """Messages sent to graduates; ?status=failed shows failed sends (B5.2)."""

    permission_classes = [IsTeam]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = Notification.objects.select_related("request")
        state = self.request.query_params.get("status")
        if state:
            qs = qs.filter(status=state)
        return qs[:200]


class HandInListView(APIView):
    permission_classes = [IsTeamOrMsu]

    def get(self, request):
        lists = HandInList.objects.select_related("created_by").annotate(
            request_count=Count("requests")
        )[:200]
        return Response(HandInListSerializer(lists, many=True).data)


class HandInDetailView(APIView):
    """One hand-in list with its requests, for the A4 sign-off sheet. MSU
    staff get the MSU-safe fields only."""

    permission_classes = [IsTeamOrMsu]

    def get(self, request, pk):
        from requests_app.serializers import MsuRequestSerializer

        handin = get_object_or_404(
            HandInList.objects.annotate(request_count=Count("requests")), pk=pk
        )
        rows = handin.requests.prefetch_related("items", "clearance_files").order_by(
            "reference_number"
        )
        serializer = (
            RequestAdminSerializer(rows, many=True, context=_serializer_context())
            if IsTeam().has_permission(request, self)
            else MsuRequestSerializer(rows, many=True)
        )
        return Response({**HandInListSerializer(handin).data, "requests": serializer.data})


# --------------------------------------------------------- data protection


class GraduateDataView(APIView):
    """GET ?reg_number= — everything held about one graduate, as a JSON file.
    POST {reg_number, confirm: true} — anonymise all their requests. Both are
    admin-only and written to the audit log (B11.2)."""

    permission_classes = [IsAdmin]

    def _requests(self, reg):
        return Request.objects.filter(reg_number__iexact=services.normalise_reg(reg))

    def get(self, request):
        reg = request.query_params.get("reg_number") or ""
        rows = self._requests(reg).prefetch_related("items", "events", "payments", "team_notes")
        if not rows:
            return _detail("No requests for that registration number.", status.HTTP_404_NOT_FOUND)
        export = []
        for r in rows:
            export.append(
                {
                    **RequestAdminSerializer(r, context=_serializer_context()).data,
                    "history": RequestEventSerializer(r.events.all(), many=True).data,
                    "payments": PaymentSerializer(r.payments.all(), many=True).data,
                }
            )
        audit(
            request.user,
            "graduate.export",
            "graduate",
            services.normalise_reg(reg),
            None,
            {"requests": len(export)},
        )
        response = HttpResponse(
            json.dumps(
                {"reg_number": services.normalise_reg(reg), "requests": export},
                default=str,
                indent=2,
            ),
            content_type="application/json",
        )
        response["Content-Disposition"] = (
            f'attachment; filename="graduate-{services.normalise_reg(reg)}.json"'
        )
        return response

    def post(self, request):
        reg = request.data.get("reg_number") or ""
        if request.data.get("confirm") is not True:
            return _detail("Confirm the erasure.")
        changed = 0
        for r in self._requests(reg):
            changed += services.anonymise_request(r, request.user)
        audit(
            request.user,
            "graduate.erase",
            "graduate",
            services.normalise_reg(reg),
            None,
            {"anonymised": changed},
        )
        return Response({"anonymised": changed})


# --------------------------------------------------------------- dispatch


class DriverViewSet(viewsets.ModelViewSet):
    """The team can read drivers (to pick one for a batch); only admins add,
    edit or deactivate them. Drivers who have carried a batch cannot be
    deleted, only deactivated."""

    serializer_class = DriverSerializer
    queryset = Driver.objects.all()

    def get_permissions(self):
        if self.action in ("list", "retrieve", "availability"):
            return [IsTeam()]
        return [IsAdmin()]

    def perform_create(self, serializer):
        driver = serializer.save()
        audit(self.request.user, "driver.create", "driver", driver.pk, None, serializer.data)

    def perform_update(self, serializer):
        before = DriverSerializer(serializer.instance).data
        driver = serializer.save()
        audit(
            self.request.user,
            "driver.update",
            "driver",
            driver.pk,
            dict(before),
            DriverSerializer(driver).data,
        )

    def destroy(self, request, *args, **kwargs):
        driver = self.get_object()
        before = DriverSerializer(driver).data
        try:
            driver.delete()
        except ProtectedError:
            return _detail("This driver has batches, so they can only be deactivated.")
        audit(request.user, "driver.delete", "driver", before["id"], dict(before), None)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DriverAvailabilityView(APIView):
    """POST {available_today}: the Available today switch (A08)."""

    permission_classes = [IsTeam]

    def post(self, request, pk):
        driver = get_object_or_404(Driver, pk=pk)
        available = request.data.get("available_today") is not False
        driver.off_on = None if available else services.harare_today()
        driver.save(update_fields=["off_on"])
        audit(
            request.user,
            "driver.availability",
            "driver",
            driver.pk,
            None,
            {"available_today": available},
        )
        return Response(DriverSerializer(driver).data)


class DispatchReadyView(generics.ListAPIView):
    """Harare requests at Collected from MSU that are not yet in a batch."""

    permission_classes = [IsTeam]
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

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **_serializer_context()}


class ZimpostReadyView(DispatchReadyView):
    """Outside Harare requests at Collected from MSU, for branch dispatch."""

    def get_queryset(self):
        return (
            base_queryset()
            .filter(zone=RequestZone.OUTSIDE_HARARE, status=RequestStatus.COLLECTED_FROM_MSU)
            .order_by("zimpost_branch__branch_name", "created_at")
        )


class BatchListCreateView(APIView):
    permission_classes = [IsTeam]

    def get(self, request):
        batches = DispatchBatch.objects.select_related("driver", "cash_received_by")
        status_filter = request.query_params.get("status")
        if status_filter in {c.value for c in BatchStatus}:
            batches = batches.filter(status=status_filter)
        return Response(BatchSerializer(batches[:200], many=True).data)

    def post(self, request):
        ids = request.data.get("request_ids")
        driver_id = request.data.get("driver_id")
        if not isinstance(ids, list) or not ids:
            return _detail("request_ids must be a non-empty list.")
        try:
            parsed = [UUID(str(v)) for v in ids]
            UUID(str(driver_id))
        except (ValueError, TypeError, AttributeError):
            return _detail("Invalid ids.")
        try:
            batch = services.create_dispatch_batch(
                parsed, driver_id, request.user, notes=request.data.get("notes") or ""
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        return Response(BatchDetailSerializer(batch).data, status=status.HTTP_201_CREATED)


class BatchDetailView(APIView):
    permission_classes = [IsTeam]

    def get(self, request, pk):
        batch = get_object_or_404(DispatchBatch.objects.select_related("driver"), pk=pk)
        return Response(BatchDetailSerializer(batch).data)


class BatchResolveView(APIView):
    """POST {request_id, delivered, reason?} — mark one document delivered or
    not delivered."""

    permission_classes = [IsTeam]

    def post(self, request, pk):
        batch = get_object_or_404(DispatchBatch, pk=pk)
        try:
            req = get_object_or_404(Request, pk=UUID(str(request.data.get("request_id"))))
        except ValueError:
            return _detail("Invalid request id.")
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
    """POST {cash_handed_in, note?}: close a batch with its cash check (B4.2).
    Refused while any document is still out."""

    permission_classes = [IsTeam]

    def post(self, request, pk):
        batch = get_object_or_404(DispatchBatch, pk=pk)
        if not services.batch_ready_to_close(batch):
            return _detail("Some documents are still out for delivery.")
        handed_in = request.data.get("cash_handed_in")
        if handed_in in (None, ""):
            return _detail("Enter the cash the driver handed in.")
        try:
            batch = services.close_batch(
                batch, request.user, handed_in, note=request.data.get("note") or ""
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        return Response(BatchDetailSerializer(batch).data)
