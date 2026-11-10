from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.audit import audit
from core.models import SiteSettings
from requests_app import services
from requests_app.models import ClearanceFile, Request, RequestStatus


class Command(BaseCommand):
    """Data retention (B11.2). Run daily from cron or a systemd timer.

    Anonymises closed requests (Collected or Rejected) whose last stage change
    is older than the retention period in Settings: street address, directions,
    phone and email are removed, from the request and its history. Also deletes
    clearance uploads never attached to a submitted request after a day.
    """

    help = "Anonymise closed requests older than the retention period."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **options):
        months = SiteSettings.load().retention_months
        cutoff = timezone.now() - timedelta(days=30 * months)
        due = Request.objects.filter(
            status__in=(RequestStatus.COLLECTED, RequestStatus.REJECTED),
            status_changed_at__lt=cutoff,
            anonymised_at__isnull=True,
        )
        count = due.count()
        orphans = ClearanceFile.objects.filter(
            request__isnull=True, created_at__lt=timezone.now() - timedelta(days=1)
        )
        orphan_count = orphans.count()
        if dry_run:
            self.stdout.write(
                f"Would anonymise {count} request(s) and remove {orphan_count} upload(s)."
            )
            return
        changed = sum(services.anonymise_request(req) for req in due.iterator())
        for f in orphans:
            f.file.delete(save=False)
            f.delete()
        audit(
            None,
            "retention.run",
            "requests",
            "",
            None,
            {"anonymised": changed, "orphan_uploads_removed": orphan_count, "months": months},
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Anonymised {changed} request(s); removed {orphan_count} upload(s)."
            )
        )
