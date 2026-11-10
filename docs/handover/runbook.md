# Runbook

## Environments

| | Production | Staging |
| --- | --- | --- |
| Address | https://collectmytranscriptmsu.com | e.g. https://staging.collectmytranscriptmsu.com |
| Server path | `/srv/msu` | `/srv/msu-staging` (same scripts, its own `.env` files and database) |
| Purpose | Live service | Every release is tested here first; UAT runs here; restores are tested here |

Set up staging exactly like production (`deploy/setup-server.sh`, then
`deploy/deploy.sh` with `APP_DIR` and the service names adjusted), with its own
database, `SECRET_KEY` and `VITE_SITE_URL`. Never point staging at the live
database.

## Releasing

1. Merge to `main`; run the tests (`python manage.py test`, `npx tsc --noEmit`,
   `npx eslint src`, `npm run build`).
2. Deploy to staging: `sudo bash /srv/msu-staging/deploy/deploy.sh`. Run the
   relevant parts of `uat-checklist.md`.
3. Deploy to production: `sudo bash /srv/msu/deploy/deploy.sh`. It installs
   dependencies, migrates, builds, installs the systemd units and timers, and
   restarts.
4. Add an entry to `release-notes.md`.

Migrations in this release add tables and backfill existing requests (items,
payments for requests already ticked Paid, phone format, suburbs). Take a
backup first (`sudo systemctl start msu-backup`).

## First sign-in after this release

`REQUIRE_MFA=True` in production: every admin and staff member sets up two-step
sign-in at their next sign-in. If someone loses their phone, another admin uses
*Settings › Team and roles › Reset*. If the only admin is locked out:

```
sudo -u msu /srv/msu/Backend/venv/bin/python /srv/msu/Backend/manage.py shell -c \
  "from accounts.models import User; u=User.objects.get(email='ADMIN_EMAIL'); u.mfa_enabled=False; u.totp_secret=''; u.save()"
```

## Backups

* `msu-backup.timer` runs `deploy/backup.sh` at 01:15: a `pg_dump` (custom
  format) and an archive of `private_media`, kept 30 days in `/srv/msu/backups`.
* Set `BACKUP_REMOTE` (an rclone remote) so a copy leaves the server.
* Check: `systemctl list-timers msu-backup.timer`, `journalctl -u msu-backup`.

### Quarterly restore test

1. Copy last night's `db-*.dump` and `files-*.tar.gz` to the staging server.
2. `set -a; source /srv/msu-staging/Backend/.env; set +a`
3. `bash /srv/msu-staging/deploy/restore.sh db-….dump files-….tar.gz`
4. `python manage.py migrate && python manage.py check`, then open staging,
   track a request and open a clearance file.
5. Record the date, the backup used and the result here:

| Date | Backup | Result | By |
| --- | --- | --- | --- |
| | | | |

## Monitoring and alerts

* **Uptime**: add two monitors in an uptime service (for example UptimeRobot or
  Better Stack) checking every 5 minutes and alerting the team by SMS/email:
  `https://collectmytranscriptmsu.com/` (expects 200) and
  `https://collectmytranscriptmsu.com/api/health/` (expects 200 and
  `"status": "ok"`; it answers 503 if the database is down). Add the same for
  staging and confirm that stopping staging (`systemctl stop msu-backend`)
  raises an alert.
* **Errors**: server errors and browser errors are emailed to `ADMINS`
  straight away (needs `EMAIL_HOST`). Browser errors are also stored in the
  Django admin under *Client errors*.
* **Failed messages**: Reports › Messages › Failed.

## Data retention

`msu-retention.timer` runs `python manage.py apply_retention` daily at 02:30.
Dry run: `python manage.py apply_retention --dry-run`. Each run writes an audit
entry (Settings › Audit log, filter *Retention*).

## Incidents

| Symptom | Check | Fix |
| --- | --- | --- |
| Site down (502) | `systemctl status msu-frontend msu-backend nginx` | `systemctl restart msu-backend msu-frontend`; read `journalctl -u msu-backend -n 200` |
| `/api/health/` 503 | `systemctl status postgresql`, disk space `df -h` | Restart PostgreSQL; free disk (old backups) |
| Graduates get "Too many attempts" | Shared campus IP hitting the 10-per-10-minutes lookup limit | Raise `LOOKUP_RATE_LIMIT` in `.env`, restart backend |
| SMS not arriving | Reports › Messages › Failed shows the provider's error | Check `SMS_API_*`, provider balance |
| Nobody can sign in | Check the server clock (`timedatectl`); two-step codes need correct time | Enable NTP |
| Wrong price charged | Settings › Prices and the audit log | Fix the price; existing requests keep their fee by design |

Record each incident: date, impact, cause, fix, follow-up.
