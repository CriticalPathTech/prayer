#!/usr/bin/env bash
#
# railway-sync-env.sh — reconcile Railway env vars to the minimal required set.
#
# Reads secrets from ./.env at the repo root. Cross-service references and
# Railway-injected values (RAILWAY_GIT_COMMIT_SHA, DATABASE_URL from the
# Postgres service) are set as Railway variable references, not copied.
#
# Usage:
#   ./scripts/railway-sync-env.sh            # sync both services (api, web)
#   ./scripts/railway-sync-env.sh api        # sync only api
#   ./scripts/railway-sync-env.sh web        # sync only web
#
# Re-runnable and idempotent. Prints a summary per service.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if ! command -v railway >/dev/null 2>&1; then
  echo "error: railway CLI not on PATH. Install with: brew install railway" >&2
  exit 1
fi

if ! railway status >/dev/null 2>&1; then
  echo "error: repo is not linked. Run: railway link" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found. Copy .env.example to .env and fill in values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is not set in $ENV_FILE" >&2
    exit 1
  fi
}

desired_api() {
  # AUTH_URL is local-only — only used here to derive AUTH_JWKS_URL and by
  # `pnpm bootstrap` (which never runs in prod). The api process reads
  # AUTH_JWKS_URL directly, so we don't ship AUTH_URL to Railway.
  require_env AUTH_URL
  cat <<EOF
DATABASE_URL=\${{Postgres.DATABASE_URL}}
AUTH_JWKS_URL=$AUTH_URL/auth/v1/.well-known/jwks.json
CORS_ORIGIN=https://\${{web.RAILWAY_PUBLIC_DOMAIN}}
NODE_ENV=production
LOG_LEVEL=info
EOF
}

desired_web() {
  require_env VITE_AUTH_URL
  require_env VITE_AUTH_ANON_KEY
  cat <<EOF
VITE_API_URL=https://\${{api.RAILWAY_PUBLIC_DOMAIN}}
VITE_AUTH_URL=$VITE_AUTH_URL
VITE_AUTH_ANON_KEY=$VITE_AUTH_ANON_KEY
EOF
}

sync_service() {
  local service="$1"
  local desired
  case "$service" in
    api) desired="$(desired_api)";;
    web) desired="$(desired_web)";;
    *) echo "unknown service: $service" >&2; exit 1;;
  esac

  echo "=== $service ==="

  local desired_keys
  desired_keys="$(echo "$desired" | awk -F= 'NF>0 {print $1}')"

  local current_keys
  current_keys="$(railway variable list --service "$service" --kv 2>/dev/null \
    | awk -F= 'NF>0 {print $1}' \
    | grep -Ev '^(RAILWAY_|PORT$)' || true)"

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    railway variable set --service "$service" --skip-deploys "$key=$value" >/dev/null
    echo "  set    $key"
  done <<<"$desired"

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! grep -qx "$key" <<<"$desired_keys"; then
      railway variable delete --service "$service" --skip-deploys "$key" -y >/dev/null 2>&1 \
        || railway variable delete --service "$service" --skip-deploys "$key" >/dev/null 2>&1 \
        || { echo "  warn: could not unset $key"; continue; }
      echo "  unset  $key"
    fi
  done <<<"$current_keys"
}

if [[ $# -eq 0 ]]; then
  targets=(api web)
else
  targets=("$@")
fi

for svc in "${targets[@]}"; do
  sync_service "$svc"
done

echo
echo "Done. Trigger a redeploy with: railway redeploy --service <api|web> -y"
