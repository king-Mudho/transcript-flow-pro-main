from django.db import migrations, models


class Migration(migrations.Migration):
    # Separate from 0002 so the data fix-ups there are committed before the
    # constraint is added (Postgres refuses ALTER TABLE with pending triggers).

    dependencies = [("requests_app", "0003_migrate_statuses")]

    operations = [
        migrations.AddConstraint(
            model_name='request',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('status', 'rejected'), _negated=True), models.Q(('status_reason__isnull', False), models.Q(('status_reason', ''), _negated=True)), _connector='OR'), name='rejected_requires_reason'),
        ),
    ]
