from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/branches/", include("branches.urls")),
    path("api/requests/", include("requests_app.urls")),
    path("api/dispatch/", include("requests_app.dispatch_urls")),
    path("api/drivers/", include("requests_app.driver_urls")),
]
