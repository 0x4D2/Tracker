#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${TRACKER_DB_PATH:-/var/www/tracker/data/tracker.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tracker}"
STAMP="$(date +%Y-%m)"

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/tracker-$STAMP.db'"
find "$BACKUP_DIR" -type f -name 'tracker-*.db' -mtime +400 -delete
