from django.urls import path

from requests_app.views import (
    BatchCloseView,
    BatchDetailView,
    BatchListCreateView,
    BatchResolveView,
    DispatchReadyView,
)

urlpatterns = [
    path("ready/", DispatchReadyView.as_view(), name="dispatch-ready"),
    path("batches/", BatchListCreateView.as_view(), name="dispatch-batches"),
    path("batches/<uuid:pk>/", BatchDetailView.as_view(), name="dispatch-batch"),
    path("batches/<uuid:pk>/resolve/", BatchResolveView.as_view(), name="dispatch-resolve"),
    path("batches/<uuid:pk>/close/", BatchCloseView.as_view(), name="dispatch-close"),
]
