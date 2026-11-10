from django.urls import path

from requests_app import views

urlpatterns = [
    path("status/", views.RequestStatusLookupView.as_view(), name="request-status"),
    path("find-reference/", views.FindReferenceView.as_view(), name="request-find-reference"),
    path("clearance-upload/", views.ClearanceUploadView.as_view(), name="clearance-upload"),
    path("assisted/", views.AssistedRequestView.as_view(), name="request-assisted"),
    path("export/", views.RequestExportView.as_view(), name="request-export"),
    path("counts/", views.RequestCountsView.as_view(), name="request-counts"),
    path("sidebar-counts/", views.SidebarCountsView.as_view(), name="request-sidebar-counts"),
    path("search/", views.RequestSearchView.as_view(), name="request-search"),
    path("ready-at-msu/", views.ReadyAtMsuView.as_view(), name="request-ready-at-msu"),
    path("graduate-data/", views.GraduateDataView.as_view(), name="graduate-data"),
    path("bulk-delete/", views.RequestBulkDeleteView.as_view(), name="request-bulk-delete"),
    path(
        "bulk-update-status/",
        views.RequestBulkUpdateStatusView.as_view(),
        name="request-bulk-update-status",
    ),
    path("", views.RequestListCreateView.as_view(), name="request-list-create"),
    path("<uuid:pk>/", views.RequestDetailUpdateView.as_view(), name="request-update"),
    path("<uuid:pk>/history/", views.RequestHistoryView.as_view(), name="request-history"),
    path("<uuid:pk>/notes/", views.TeamNotesView.as_view(), name="request-notes"),
    path("<uuid:pk>/message/", views.GraduateMessageView.as_view(), name="request-message"),
    path("<uuid:pk>/payments/", views.RecordPaymentView.as_view(), name="request-payments"),
    path(
        "<uuid:pk>/clearance/<uuid:file_id>/",
        views.ClearanceFileView.as_view(),
        name="request-clearance-file",
    ),
]
