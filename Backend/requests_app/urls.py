from django.urls import path

from requests_app.views import (
    RequestBulkUpdateStatusView,
    RequestDetailUpdateView,
    RequestExportView,
    RequestHistoryView,
    RequestListCreateView,
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
    path("<uuid:pk>/", RequestDetailUpdateView.as_view(), name="request-update"),
    path("<uuid:pk>/history/", RequestHistoryView.as_view(), name="request-history"),
]
