from django.urls import path

from core import views

urlpatterns = [
    path("settings/public/", views.PublicSettingsView.as_view(), name="settings-public"),
    path("settings/", views.SettingsView.as_view(), name="settings"),
    path("suburbs/", views.SuburbListView.as_view(), name="suburbs"),
    path("suburbs/unmapped/", views.SuburbMapView.as_view(), name="suburbs-unmapped"),
    path("suburbs/<int:pk>/", views.SuburbDetailView.as_view(), name="suburb"),
    path("audit-log/", views.AuditLogView.as_view(), name="audit-log"),
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path("client-errors/", views.ClientErrorView.as_view(), name="client-errors"),
    path("health/", views.HealthView.as_view(), name="health"),
]
