#!/usr/bin/env bash
#
# Nightly backup (backlog B11.3). Run by msu-backup.timer as the msu user, with
# the database settings from /srv/msu/Backend/.env in the environment.
#
#   - a compressed pg_dump (custom format, restorable with pg_restore)
#   - an archive of private_media (clearance uploads)
#   - keeps BACKUP_KEEP_DAYS days locally (default 30)
#   - if BACKUP_REMOTE is set (an rclone remote, e.g. "b2:msu-backups"), copies
#     tonight's files off the server too. Keep at least one copy off-site.
#
# Test a restore every quarter with restore.sh into staging, and write it up
# in docs/handover/runbook.md.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/msu/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
PRIVATE_MEDIA="${PRIVATE_MEDIA_ROOT:-/srv/msu/Backend/private_media}"
STAMP="$(date +%Y%m%d-%H%M)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    --host="${POSTGRES_HOST:-127.0.0.1}" --port="${POSTGRES_PORT:-5432}" \
    --username="$POSTGRES_USER" --format=custom --compress=9 \
    --file="$DB_FILE" "$POSTGRES_DB"

FILES_FILE="$BACKUP_DIR/files-$STAMP.tar.gz"
if [[ -d "$PRIVATE_MEDIA" ]]; then
    tar -czf "$FILES_FILE" -C "$(dirname "$PRIVATE_MEDIA")" "$(basename "$PRIVATE_MEDIA")"
fi

chmod 600 "$BACKUP_DIR"/*-"$STAMP"* 2>/dev/null || true

# Prove the dump is readable before trusting it.
pg_restore --list "$DB_FILE" > /dev/null

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete

if [[ -n "${BACKUP_REMOTE:-}" ]] && command -v rclone > /dev/null; then
    rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" --include "*-$STAMP*"
fi

echo "Backup complete: $DB_FILE"
