#!/usr/bin/env bash
#
# Restore a backup made by backup.sh (backlog B11.3). Intended for STAGING:
# it drops and recreates the target database.
#
#   sudo -u msu bash /srv/msu/deploy/restore.sh /srv/msu/backups/db-20261110-0115.dump \
#        [/srv/msu/backups/files-20261110-0115.tar.gz]
#
# Uses the database settings in the environment (load the staging .env first:
#   set -a; source /srv/msu-staging/Backend/.env; set +a).

set -euo pipefail

DUMP="${1:?Give the .dump file to restore}"
FILES="${2:-}"

read -r -p "This replaces database '$POSTGRES_DB' on $POSTGRES_HOST. Type the database name to continue: " CONFIRM
[[ "$CONFIRM" == "$POSTGRES_DB" ]] || { echo "Cancelled."; exit 1; }

export PGPASSWORD="$POSTGRES_PASSWORD"
pg_restore --host="$POSTGRES_HOST" --port="${POSTGRES_PORT:-5432}" --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" --clean --if-exists --no-owner "$DUMP"

if [[ -n "$FILES" ]]; then
    TARGET="$(dirname "${PRIVATE_MEDIA_ROOT:-/srv/msu/Backend/private_media}")"
    tar -xzf "$FILES" -C "$TARGET"
fi

echo "Restored $DUMP into $POSTGRES_DB. Now run: python manage.py migrate && python manage.py check"
