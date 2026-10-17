#!/usr/bin/env bash
# Deploy Fomka with Docker Compose. Run it on the server, inside the git checkout:
#
#   ./deploy.sh              # pull the latest commit, back up the database, rebuild, restart
#   ./deploy.sh --no-pull    # deploy the checkout as it is
#
# Steps: git pull (fast-forward only) -> copy of stock.db into ./backups/ -> build the image
# -> restart -> wait for the health check. If the new version doesn't become healthy, the
# previous image is started again.
#
# Settings come from .env next to this file (see .env.example), e.g.:
#   ADMIN_PIN=4821  WORKER_PIN=1357   (first start only; must differ)
#   APP_PORT=3000   APP_BIND=127.0.0.1 (behind a reverse proxy)   HTTPS_ONLY=true
# Script options (environment): DEPLOY_BRANCH (default: production), KEEP_BACKUPS (default: 10),
# HEALTH_TIMEOUT seconds (default: 90).
set -euo pipefail

cd "$(dirname "$0")"

BRANCH="${DEPLOY_BRANCH:-production}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
IMAGE=housekeeping-stock
PULL=1

for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h | --help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed"
compose() { docker compose "$@"; }

# ---------- config ----------
if [[ ! -f .env ]]; then
  warn "no .env: using defaults (port 3000, PINs 1234/0000 on the first start). See .env.example."
elif ! grep -Eq '^ADMIN_PIN=[0-9]{4}$' .env || ! grep -Eq '^WORKER_PIN=[0-9]{4}$' .env; then
  warn "ADMIN_PIN/WORKER_PIN not set in .env: a new database starts with 1234/0000 (change them in Settings)"
fi

# ---------- code ----------
if [[ $PULL == 1 ]]; then
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "uncommitted changes in the checkout (commit/stash them or use --no-pull)"
  log "Updating to origin/$BRANCH"
  git fetch --quiet origin "$BRANCH"
  git checkout --quiet "$BRANCH"
  git merge --ff-only --quiet "origin/$BRANCH"
fi
log "Deploying $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"

# ---------- backup ----------
container_id() { compose ps -q app 2>/dev/null || true; }

if [[ -n "$(container_id)" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$(container_id)")" == true ]]; then
  stamp="$(date +%Y-%m-%d_%H%M%S)"
  mkdir -p backups
  log "Backing up the database to backups/stock-$stamp.db"
  # SQLite online backup (safe while the app is writing), then copy it out of the volume
  compose exec -T app node -e "
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SQLITE_PATH, { readonly: true, fileMustExist: true });
    db.backup('/app/data/predeploy.db').then(() => db.close(), (e) => { console.error(e); process.exit(1); });
  " || die "database backup failed; nothing was changed"
  compose cp app:/app/data/predeploy.db "backups/stock-$stamp.db"
  compose exec -T app rm -f /app/data/predeploy.db
  # keep the newest $KEEP_BACKUPS
  ls -1t backups/stock-*.db 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -f
else
  log "App not running: skipping the database backup"
fi

# ---------- build + restart ----------
had_previous=0
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker tag "$IMAGE:latest" "$IMAGE:previous"
  had_previous=1
fi

log "Building the image"
compose build --pull app

log "Starting the new version"
compose up -d --remove-orphans

wait_healthy() {
  local waited=0 status
  while ((waited < HEALTH_TIMEOUT)); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$(container_id)" 2>/dev/null || echo starting)"
    [[ $status == healthy ]] && return 0
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

if wait_healthy; then
  docker image prune -f >/dev/null
  port="${APP_PORT:-$(grep -E '^APP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)}"
  log "Deployed $(git rev-parse --short HEAD): http://localhost:${port:-3000}"
  exit 0
fi

warn "the new version did not become healthy within ${HEALTH_TIMEOUT}s. Last log lines:"
compose logs --tail=40 app >&2 || true
if [[ $had_previous == 1 ]]; then
  log "Rolling back to the previous image"
  docker tag "$IMAGE:previous" "$IMAGE:latest"
  compose up -d --no-build app
  wait_healthy && log "Previous version is running again" || warn "the previous version is not healthy either"
fi
die "deploy failed"
