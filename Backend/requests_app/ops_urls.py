"""Endpoints that sit beside requests: payments, hand-in lists, saved views,
notifications, reports and the MSU portal."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from requests_app import msu_views, reports, views

router = DefaultRouter()
router.register("saved-views", views.SavedViewViewSet, basename="saved-view")

urlpatterns = [
    path("payments/<uuid:pk>/reverse/", views.ReversePaymentView.as_view(), name="payment-reverse"),
    path("handin-lists/", views.HandInListView.as_view(), name="handin-lists"),
    path("handin-lists/<uuid:pk>/", views.HandInDetailView.as_view(), name="handin-list"),
    path("notifications/", views.NotificationListView.as_view(), name="notifications"),
    path("reports/overview/", reports.OverviewView.as_view(), name="report-overview"),
    path("reports/cash/", reports.CashReportView.as_view(), name="report-cash"),
    path("reports/monthly/", reports.MonthlyReportView.as_view(), name="report-monthly"),
    path("msu/queue/", msu_views.MsuQueueView.as_view(), name="msu-queue"),
    path("msu/ready/", msu_views.MsuReadyView.as_view(), name="msu-ready"),
    path("msu/requests/<uuid:pk>/reject/", msu_views.MsuRejectView.as_view(), name="msu-reject"),
    *router.urls,
]
