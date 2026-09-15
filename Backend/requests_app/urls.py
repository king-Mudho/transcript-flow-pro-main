from django.urls import path

from requests_app.views import (
    RequestBulkUpdateStatusView,
    RequestExportView,
    RequestListCreateView,
    RequestPaidUpdateView,
    RequestStatusLookupView,
)

urlpatterns = [
    path("status/", RequestStatusLookupView.as_view(), name="request-status"),
    path("export/", RequestExportView.as_view(), name="request-export"),
    path(
        "bulk-update-status/",
        RequestBulkUpdateStatusView.as_view(),
        name="request-bulk-update-status",
    ),
    path("", RequestListCreateView.as_view(), name="request-list-create"),
    path("<uuid:pk>/", RequestPaidUpdateView.as_view(), name="request-paid-update"),
]
