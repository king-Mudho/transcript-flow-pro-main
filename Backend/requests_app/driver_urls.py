from django.urls import path
from rest_framework.routers import DefaultRouter

from requests_app.views import DriverAvailabilityView, DriverViewSet

router = DefaultRouter()
router.register("", DriverViewSet, basename="driver")
urlpatterns = [
    path("<uuid:pk>/availability/", DriverAvailabilityView.as_view(), name="driver-availability"),
    *router.urls,
]
