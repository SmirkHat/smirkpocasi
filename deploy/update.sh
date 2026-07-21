#!/usr/bin/env bash
# Pull latest main from the public repo and rebuild only when HEAD changed.
# Install: sudo cp deploy/update.sh /usr/local/bin/smirkpocasi-update && sudo chmod +x ...
# Cron every 5 min: */5 * * * * /usr/local/bin/smirkpocasi-update >> /var/log/smirkpocasi-update.log 2>&1
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smirkpocasi}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"

cd "$REPO_DIR"

# Avoid concurrent runs (cron overlap during slow builds).
exec 9>"$REPO_DIR/.update.lock"
if ! flock -n 9; then
  echo "$(date -Is) skip: update already running"
  exit 0
fi

git fetch --quiet "$REMOTE" "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE/$BRANCH")"

if [[ "$LOCAL" == "$REMOTE_SHA" ]]; then
  exit 0
fi

echo "$(date -Is) updating $LOCAL → $REMOTE_SHA"
git merge --ff-only "$REMOTE_SHA"
docker compose up -d --build --remove-orphans
docker image prune -f
echo "$(date -Is) done"
