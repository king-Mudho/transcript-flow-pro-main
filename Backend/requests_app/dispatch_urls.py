from django.urls import path

from requests_app import views

urlpatterns = [
    path("ready/", views.DispatchReadyView.as_view(), name="dispatch-ready"),
    path("zimpost-ready/", views.ZimpostReadyView.as_view(), name="dispatch-zimpost-ready"),
    path("batches/", views.BatchListCreateView.as_view(), name="dispatch-batches"),
    path("batches/<uuid:pk>/", views.BatchDetailView.as_view(), name="dispatch-batch"),
    path("batches/<uuid:pk>/resolve/", views.BatchResolveView.as_view(), name="dispatch-resolve"),
    path("batches/<uuid:pk>/close/", views.BatchCloseView.as_view(), name="dispatch-close"),
]
