import re

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import mail_admins
from django.db import connection, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsTeam
from core.audit import audit
from core.models import (
    DEFAULT_MESSAGES,
    DEFAULT_THRESHOLDS,
    AnalyticsEvent,
    AuditLog,
    ClientError,
    SiteSettings,
    Suburb,
)

HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        exclude = ("id",)
        read_only_fields = ("updated_at",)

    def validate_fee_harare(self, value):
        if value <= 0:
            raise serializers.ValidationError("A price must be above zero.")
        return value

    validate_fee_outside = validate_fee_harare

    def _colour(self, value):
        if not HEX.match(value or ""):
            raise serializers.ValidationError("Use a colour like #0F2750.")
        return value.upper()

    validate_primary_color = _colour
    validate_accent_color = _colour

    def validate_support_whatsapp(self, value):
        from requests_app.services import normalise_phone

        try:
            return normalise_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0]) from exc

    def validate_stage_thresholds(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Thresholds must be an object.")
        clean = {}
        for stage, default in DEFAULT_THRESHOLDS.items():
            pair = value.get(stage, default)
            try:
                amber, red = int(pair[0]), int(pair[1])
            except (TypeError, ValueError, IndexError) as exc:
                raise serializers.ValidationError(f"Give two numbers of days for {stage}.") from exc
            if amber < 0 or red < amber:
                raise serializers.ValidationError("Red must be the same as or after amber.")
            clean[stage] = [amber, red]
        return clean

    def validate_message_templates(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Messages must be an object.")
        return {k: str(value.get(k) or DEFAULT_MESSAGES[k])[:600] for k in DEFAULT_MESSAGES}

    def validate_retention_months(self, value):
        if value < 1:
            raise serializers.ValidationError("Keep data for at least one month.")
        return value


PUBLIC_FIELDS = (
    "fee_harare",
    "fee_outside",
    "service_name",
    "short_name",
    "tagline",
    "operator_line",
    "support_whatsapp",
    "primary_color",
    "accent_color",
    "logo_url",
    "terms_version",
)


class PublicSettingsView(APIView):
    """Prices, brand and the suburb list: the only settings anyone can read
    without signing in."""

    permission_classes = [AllowAny]

    def get(self, request):
        site = SiteSettings.load()
        data = {name: getattr(site, name) for name in PUBLIC_FIELDS}
        data["suburbs"] = list(
            Suburb.objects.filter(active=True).order_by("name").values("id", "name", "area")
        )
        return Response(data)


class SettingsView(APIView):
    """GET for the team (thresholds and portal state); PATCH for admins only.
    Every changed field is written to the audit log with old and new values."""

    def get_permissions(self):
        return [IsTeam()] if self.request.method == "GET" else [IsAdmin()]

    def get(self, request):
        return Response(SettingsSerializer(SiteSettings.load()).data)

    @transaction.atomic
    def patch(self, request):
        site = SiteSettings.objects.select_for_update().get(pk=SiteSettings.load().pk)
        before = SettingsSerializer(site).data
        serializer = SettingsSerializer(site, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        after = SettingsSerializer(site).data
        for key in request.data:
            if key in after and before.get(key) != after.get(key):
                action = "price.change" if key.startswith("fee_") else "settings.change"
                audit(request.user, action, "settings", key, before.get(key), after.get(key))
        return Response(after)


class SuburbSerializer(serializers.ModelSerializer):
    request_count = serializers.SerializerMethodField()

    class Meta:
        model = Suburb
        fields = ("id", "name", "area", "active", "request_count")
        read_only_fields = ("id", "request_count")

    def get_request_count(self, obj):
        return obj.requests.count()

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Enter the suburb name.")
        return value


class SuburbListView(APIView):
    def get_permissions(self):
        return [IsTeam()] if self.request.method == "GET" else [IsAdmin()]

    def get(self, request):
        return Response(SuburbSerializer(Suburb.objects.all(), many=True).data)

    def post(self, request):
        serializer = SuburbSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        suburb = serializer.save()
        audit(request.user, "suburb.create", "suburb", suburb.pk, None, serializer.data)
        return Response(SuburbSerializer(suburb).data, status=status.HTTP_201_CREATED)


class SuburbDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        suburb = get_object_or_404(Suburb, pk=pk)
        before = SuburbSerializer(suburb).data
        serializer = SuburbSerializer(suburb, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(request.user, "suburb.update", "suburb", suburb.pk, dict(before), serializer.data)
        return Response(serializer.data)

    def delete(self, request, pk):
        suburb = get_object_or_404(Suburb, pk=pk)
        if suburb.requests.exists():
            return Response(
                {"detail": "Requests use this suburb, so it can only be deactivated."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        before = SuburbSerializer(suburb).data
        suburb.delete()
        audit(request.user, "suburb.delete", "suburb", pk, dict(before), None)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuburbMapView(APIView):
    """POST {name, suburb_id}: point every open Harare request whose typed
    "Other" suburb is `name` at a suburb from the list (B9.7)."""

    permission_classes = [IsTeam]

    def get(self, request):
        from requests_app.models import OPEN_STATUSES, Request

        rows = Request.objects.filter(
            zone="harare", suburb_ref__isnull=True, status__in=OPEN_STATUSES
        ).values_list("suburb", flat=True)
        counts = {}
        for name in rows:
            counts[name] = counts.get(name, 0) + 1
        return Response([{"name": k, "count": v} for k, v in sorted(counts.items())])

    def post(self, request):
        from requests_app import services
        from requests_app.models import Request

        suburb = get_object_or_404(Suburb, pk=request.data.get("suburb_id"))
        name = (request.data.get("name") or "").strip()
        changed = 0
        for req in Request.objects.filter(
            zone="harare",
            suburb_ref__isnull=True,
            suburb__iexact=name,
            status__in=("received", "submitted_to_msu", "collected_from_msu"),
        ):
            services.update_request(req, {"suburb": suburb.name}, request.user)
            changed += 1
        return Response({"mapped": changed})


class AuditLogSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "action",
            "entity",
            "entity_id",
            "old_value",
            "new_value",
            "created_at",
        )

    def get_actor(self, obj):
        if obj.actor:
            return obj.actor.full_name or obj.actor.email
        if obj.actor_label:
            return f"{obj.actor_label} (account deleted)"
        return "System"


class AuditLogView(APIView):
    """GET ?entity=&action=&search=&export=xlsx — admins only (B9.7)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = AuditLog.objects.select_related("actor")
        entity = request.query_params.get("entity")
        if entity:
            qs = qs.filter(entity=entity)
        action = request.query_params.get("action")
        if action:
            qs = qs.filter(action__startswith=action)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(actor__email__icontains=search) | qs.filter(entity_id__icontains=search)
        rows = AuditLogSerializer(qs[:1000], many=True).data
        if request.query_params.get("export") != "xlsx":
            return Response(rows)
        wb = Workbook()
        ws = wb.active
        ws.title = "Audit log"
        ws.append(["When", "Who", "Action", "What", "Old value", "New value"])
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for r in rows:
            ws.append(
                [
                    r["created_at"],
                    r["actor"],
                    r["action"],
                    f"{r['entity']} {r['entity_id']}".strip(),
                    str(r["old_value"]) if r["old_value"] is not None else "",
                    str(r["new_value"]) if r["new_value"] is not None else "",
                ]
            )
        for col, width in zip("ABCDEF", (22, 26, 20, 30, 40, 40), strict=True):
            ws.column_dimensions[col].width = width
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="audit-log.xlsx"'
        wb.save(response)
        return response


class AnalyticsThrottle(AnonRateThrottle):
    scope = "analytics"


class AnalyticsView(APIView):
    """POST {name, path?, step?, visit?}: privacy-friendly usage counting. No IP
    address, cookie or user agent is stored."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnalyticsThrottle]

    def post(self, request):
        name = str(request.data.get("name") or "")[:40]
        if name not in ("page_view", "funnel"):
            return Response(status=status.HTTP_204_NO_CONTENT)
        AnalyticsEvent.objects.create(
            name=name,
            path=str(request.data.get("path") or "")[:200],
            step=str(request.data.get("step") or "")[:40],
            visit=str(request.data.get("visit") or "")[:40],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClientErrorView(APIView):
    """POST {message, stack?, url?}: browser errors. Stored, and emailed to
    ADMINS at most once per distinct message every 5 minutes (B7.3)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnalyticsThrottle]

    def post(self, request):
        message = str(request.data.get("message") or "")[:2000]
        if not message:
            return Response(status=status.HTTP_204_NO_CONTENT)
        url = str(request.data.get("url") or "")[:500]
        stack = str(request.data.get("stack") or "")[:8000]
        ClientError.objects.create(message=message, stack=stack, url=url)
        key = f"client-error-alert:{hash(message)}"
        if cache.add(key, 1, 300):
            mail_admins(
                f"Browser error: {message[:80]}",
                f"{message}\n\nPage: {url}\nTime: {timezone.now().isoformat()}\n\n{stack}",
                fail_silently=True,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class HealthView(APIView):
    """GET: 200 when the API and database answer. For uptime monitoring."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:  # noqa: BLE001
            return Response({"status": "error", "database": "down"}, status=503)
        return Response({"status": "ok", "time": timezone.now().isoformat()})
