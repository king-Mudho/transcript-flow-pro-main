from rest_framework.routers import DefaultRouter

from requests_app.views import DriverViewSet

router = DefaultRouter()
router.register("", DriverViewSet, basename="driver")
urlpatterns = router.urls
