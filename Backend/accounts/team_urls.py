from django.urls import path

from accounts.views import TeamDetailView, TeamListView, TeamResetMfaView

urlpatterns = [
    path("", TeamListView.as_view(), name="team-list"),
    path("<uuid:pk>/", TeamDetailView.as_view(), name="team-detail"),
    path("<uuid:pk>/reset-mfa/", TeamResetMfaView.as_view(), name="team-reset-mfa"),
]
