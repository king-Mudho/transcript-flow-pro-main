from rest_framework.routers import DefaultRouter

from branches.views import ZimpostBranchViewSet

router = DefaultRouter(trailing_slash=True)
router.register("", ZimpostBranchViewSet, basename="branch")

urlpatterns = router.urls
