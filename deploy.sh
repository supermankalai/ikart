#!/usr/bin/env bash
# Deploy the latest code on the server:  cd /opt/ikart && bash deploy.sh
# 1. backs up the database  2. pulls code  3. updates backend packages
# 4. rebuilds the frontend  5. restarts the backend (which applies DB updates automatically)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE="ikart"
BACKUP_DIR="/var/backups/ikart"

cd "$APP_DIR"

echo "==> 1/5 Backing up database"
mkdir -p "$BACKUP_DIR"
DB_URL="$(grep -E '^DATABASE_URL=' backend/.env | cut -d= -f2- | sed 's/+psycopg//')"
BACKUP_FILE="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"
echo "    saved $BACKUP_FILE"
ls -1t "$BACKUP_DIR"/db-*.sql.gz | tail -n +11 | xargs -r rm --   # keep the newest 10

echo "==> 2/5 Pulling latest code"
git pull --ff-only

echo "==> 3/5 Updating backend packages"
backend/.venv/bin/pip install -q -r backend/requirements.txt

echo "==> 4/5 Building frontend"
cd frontend
npm ci --no-audit --no-fund
npm run build
cd ..

echo "==> 5/5 Restarting backend (creates new tables/columns automatically)"
sudo systemctl restart "$SERVICE"
sleep 3
if curl -fsS http://127.0.0.1:8000/api/health; then
  echo
  echo "Deploy OK"
else
  echo "Backend did not come up. Recent logs:"
  journalctl -u "$SERVICE" -n 40 --no-pager
  exit 1
fi
