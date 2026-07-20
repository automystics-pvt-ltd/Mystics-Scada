/**
 * deploy-script.ts
 *
 * The deploy script is embedded here as a string so it is always available
 * from GET /api/deploy.sh regardless of whether a file exists on disk.
 *
 * FIRST-TIME SETUP (from any machine that can reach the Replit dev URL):
 *
 *   curl -fsSL https://b374b4f9-0594-4265-a46a-a2422069eeba-00-2eey4le8q0k3m.sisko.replit.dev/api/deploy.sh | bash
 *
 * After that first run the script installs itself to the VPS at:
 *   /home/automystics-scada/htdocs/scada.automystics.tech/deploy.sh
 *
 * Every future deploy from the VPS:
 *   cd /home/automystics-scada/htdocs/scada.automystics.tech && ./deploy.sh
 *
 * The script always self-updates from Replit before doing anything, so
 * running the old copy is safe — it will pull the latest version of itself
 * first, then exec the new copy.
 */

export const DEPLOY_SCRIPT = `#!/bin/bash
# Solar SCADA — Auto Deploy Script
# Installs itself on first run; self-updates on every subsequent run.
# Usage: ./deploy.sh   (or pipe from curl on first install)
set -e

# ── colours ───────────────────────────────────────────────────────────────────
GREEN="\\033[0;32m"; YELLOW="\\033[1;33m"; RED="\\033[0;31m"; CYAN="\\033[0;36m"; BOLD="\\033[1m"; NC="\\033[0m"
log()     { echo -e "\${GREEN}[DEPLOY]\${NC} \$1"; }
info()    { echo -e "\${CYAN}[INFO]\${NC}   \$1"; }
warn()    { echo -e "\${YELLOW}[WARN]\${NC}   \$1"; }
fail()    { echo -e "\${RED}[ERROR]\${NC}  \$1"; exit 1; }
section() { echo -e "\\n\${BOLD}\${CYAN}━━━ \$1 \${NC}"; }

# ── config ────────────────────────────────────────────────────────────────────
REPLIT="https://b374b4f9-0594-4265-a46a-a2422069eeba-00-2eey4le8q0k3m.sisko.replit.dev"
DIR="/home/automystics-scada/htdocs/scada.automystics.tech"
SELF="\$DIR/deploy.sh"

echo ""
echo -e "\${BOLD}\${CYAN}╔══════════════════════════════════════╗\${NC}"
echo -e "\${BOLD}\${CYAN}║   Solar SCADA — Auto Deploy Script   ║\${NC}"
echo -e "\${BOLD}\${CYAN}╚══════════════════════════════════════╝\${NC}"
echo ""

# ── 0. Self-install / self-update ─────────────────────────────────────────────
# IMPORTANT: guard check MUST come before the update block to avoid re-exec loop.
SKIP_SELF_UPDATE=false
if [ "\${1:-}" = "--skip-self-update" ]; then
  SKIP_SELF_UPDATE=true
  shift
fi

section "0/7  Self-update"
CB="\$(date +%s)"

if [ "\$SKIP_SELF_UPDATE" = "false" ]; then
  info "Fetching latest deploy script from Replit..."
  LATEST=\$(curl -fsSL \\
    -H "Cache-Control: no-cache" -H "Pragma: no-cache" \\
    "\$REPLIT/api/deploy.sh?v=\$CB" 2>/dev/null) || {
    warn "Could not reach Replit to self-update — continuing with current version"
    LATEST=""
  }

  if [ -n "\$LATEST" ]; then
    echo "\$LATEST" > "\$SELF.tmp"
    chmod +x "\$SELF.tmp"

    if [ "\$0" = "\$SELF" ] || [ "\$(realpath "\$0" 2>/dev/null)" = "\$(realpath "\$SELF" 2>/dev/null)" ]; then
      # Running as the installed file — swap and re-exec once with the skip flag
      mv "\$SELF.tmp" "\$SELF"
      info "Script updated — re-executing latest version..."
      echo ""
      exec "\$SELF" --skip-self-update
    else
      # First run piped from curl — install for future use, continue this copy
      mv "\$SELF.tmp" "\$SELF"
      log "Installed deploy script → \$SELF"
      info "Future deploys: cd \$DIR && ./deploy.sh"
    fi
  else
    log "Using current version (Replit unreachable)"
  fi
else
  log "Self-update skipped (already on latest)"
fi

# ── go to deploy directory ────────────────────────────────────────────────────
cd "\$DIR" || fail "Deploy directory not found: \$DIR"
log "Working directory: \$(pwd)"

# ── 1. Git pull ───────────────────────────────────────────────────────────────
section "1/8  Git pull"
if [ -d ".git" ]; then
  git pull --ff-only 2>&1 | while IFS= read -r line; do info "  \$line"; done
  log "  git pull ✓"
else
  warn "  Not a git repository — skipping git pull"
fi

# ── 2. Pull API binary ─────────────────────────────────────────────────────────
section "2/8  API binary"
info "Downloading from \$REPLIT (cache-buster: \$CB)..."
curl -fsSL \\
  -H "Cache-Control: no-cache" -H "Pragma: no-cache" \\
  "\$REPLIT/api/dist/api.mjs?v=\$CB" \\
  -o artifacts/api-server/dist/index.mjs \\
  || fail "Failed to download API binary"

SIZE=\$(du -h artifacts/api-server/dist/index.mjs | cut -f1)
log "  Binary: \$SIZE"

# Verify key routes exist
PW_HITS=\$(grep -c "password-login" artifacts/api-server/dist/index.mjs 2>/dev/null || echo 0)
if [ "\$PW_HITS" -lt 1 ]; then
  fail "STALE BINARY: password-login route missing (\$PW_HITS hits). Replit may still be building — wait 30 s and retry."
fi
log "  Verified: \$PW_HITS password-login ref(s) ✓"

# ── 2. Pull frontend ───────────────────────────────────────────────────────────
section "3/8  Frontend"
curl -fsSL \\
  -H "Cache-Control: no-cache" -H "Pragma: no-cache" \\
  "\$REPLIT/api/dist/frontend.tar.gz?v=\$CB" \\
  -o /tmp/fe.tar.gz \\
  || fail "Failed to download frontend tarball"

FE_SIZE=\$(du -h /tmp/fe.tar.gz | cut -f1)
log "  Tarball: \$FE_SIZE"

mkdir -p artifacts/solar-scada/dist/public
rm -rf artifacts/solar-scada/dist/public/*
tar -xzf /tmp/fe.tar.gz -C artifacts/solar-scada/dist/public || fail "Failed to extract frontend"
log "  Extracted to artifacts/solar-scada/dist/public ✓"

# ── 3. Environment / SMTP setup ───────────────────────────────────────────────
section "4/8  Environment"
# The systemd EnvironmentFile points to the ROOT .env — write everything here.
# artifacts/api-server/.env is NOT read by systemd, so writing there had no effect.
ENV_FILE="\$DIR/.env"
touch "\$ENV_FILE"

# Helper: set/replace a key=value in .env (does not duplicate)
set_env() {
  local key="\$1" val="\$2"
  if grep -q "^\${key}=" "\$ENV_FILE" 2>/dev/null; then
    sed -i "s|^\${key}=.*|\${key}=\${val}|" "\$ENV_FILE"
  else
    echo "\${key}=\${val}" >> "\$ENV_FILE"
  fi
}

# If caller passes vars as environment variables, write them to .env now.
[ -n "\${SMTP_HOST:-}" ]              && set_env SMTP_HOST              "\$SMTP_HOST"              && log "  SMTP_HOST written to .env"
[ -n "\${SMTP_PORT:-}" ]              && set_env SMTP_PORT              "\$SMTP_PORT"              && log "  SMTP_PORT written to .env"
[ -n "\${SMTP_SECURE:-}" ]            && set_env SMTP_SECURE            "\$SMTP_SECURE"            && log "  SMTP_SECURE written to .env"
[ -n "\${SMTP_USER:-}" ]              && set_env SMTP_USER              "\$SMTP_USER"              && log "  SMTP_USER written to .env"
[ -n "\${SMTP_PASS:-}" ]              && set_env SMTP_PASS              "\$SMTP_PASS"              && log "  SMTP_PASS written to .env"
[ -n "\${SMTP_FROM:-}" ]              && set_env SMTP_FROM              "\$SMTP_FROM"              && log "  SMTP_FROM written to .env"
[ -n "\${PLATFORM_ADMIN_EMAILS:-}" ]  && set_env PLATFORM_ADMIN_EMAILS  "\$PLATFORM_ADMIN_EMAILS"  && log "  PLATFORM_ADMIN_EMAILS written to .env"
[ -n "\${PLATFORM_ADMIN_PASSCODE:-}" ] && set_env PLATFORM_ADMIN_PASSCODE "\$PLATFORM_ADMIN_PASSCODE" && log "  PLATFORM_ADMIN_PASSCODE written to .env"
[ -n "\${MQTT_BROKER_URL:-}" ]        && set_env MQTT_BROKER_URL        "\$MQTT_BROKER_URL"        && log "  MQTT_BROKER_URL written to .env"
[ -n "\${MQTT_TOPIC:-}" ]             && set_env MQTT_TOPIC             "\$MQTT_TOPIC"             && log "  MQTT_TOPIC written to .env"
[ -n "\${MQTT_USERNAME:-}" ]          && set_env MQTT_USERNAME          "\$MQTT_USERNAME"          && log "  MQTT_USERNAME written to .env"
[ -n "\${MQTT_PASSWORD:-}" ]          && set_env MQTT_PASSWORD          "\$MQTT_PASSWORD"          && log "  MQTT_PASSWORD written to .env"
[ -n "\${MQTT_DEVICE_NAME:-}" ]       && set_env MQTT_DEVICE_NAME       "\$MQTT_DEVICE_NAME"       && log "  MQTT_DEVICE_NAME written to .env"

if grep -q "^SMTP_HOST=" "\$ENV_FILE" 2>/dev/null; then
  SMTP_HOST_VAL=\$(grep "^SMTP_HOST=" "\$ENV_FILE" | cut -d= -f2)
  SMTP_USER_VAL=\$(grep "^SMTP_USER=" "\$ENV_FILE" | cut -d= -f2 || echo "(not set)")
  log "  SMTP configured: \$SMTP_HOST_VAL as \$SMTP_USER_VAL ✓"
else
  warn "  ┌─ SMTP NOT configured — OTP emails will not be sent ─────────────────"
  warn "  │  Users will be redirected to password login automatically."
  warn "  │"
  warn "  │  To enable email OTP, re-run deploy with SMTP vars:"
  warn "  │"
  warn "  │  SMTP_HOST=smtp.gmail.com \\"
  warn "  │  SMTP_PORT=587 \\"
  warn "  │  SMTP_SECURE=false \\"
  warn "  │  SMTP_USER=you@gmail.com \\"
  warn "  │  SMTP_PASS='xxxx xxxx xxxx xxxx' \\"
  warn "  │  SMTP_FROM='Solar SCADA <you@gmail.com>' \\"
  warn "  │  ./deploy.sh"
  warn "  └──────────────────────────────────────────────────────────────────────"
fi

# APP_URL — used in password-reset emails; set to production URL if not overridden
if ! grep -q "^APP_URL=" "\$ENV_FILE" 2>/dev/null; then
  set_env APP_URL "https://scada.automystics.tech"
  log "  APP_URL=https://scada.automystics.tech set ✓"
else
  log "  APP_URL present ✓"
fi

# AUTH_BYPASS — always enable so the app opens without login
set_env AUTH_BYPASS "true"
log "  AUTH_BYPASS=true set ✓"

# SESSION_SECRET — auto-generate if missing
SESSION_SET=\$(grep -c "^SESSION_SECRET=" "\$ENV_FILE" 2>/dev/null || echo 0)
if [ "\$SESSION_SET" -lt 1 ]; then
  set_env SESSION_SECRET "\$(openssl rand -hex 32)"
  log "  SESSION_SECRET generated and saved ✓"
else
  log "  SESSION_SECRET present ✓"
fi

# ── 4. DB migrations ──────────────────────────────────────────────────────────
section "5/8  Database migrations"
# ENV_FILE is now the root .env — no fallback needed
DB_URL=\$(grep "^DATABASE_URL=" "\$ENV_FILE" 2>/dev/null | cut -d= -f2-)
if [ -z "\$DB_URL" ]; then
  warn "  DATABASE_URL not found in \$ENV_FILE — skipping schema push"
else
  DATABASE_URL="\$DB_URL" pnpm --filter @workspace/db run push \\
    && log "  Migrations applied ✓" \\
    || warn "  push returned non-zero — schema may already be current"
fi

# ── 5. Restart services ───────────────────────────────────────────────────────
section "6/8  Restart services"
info "  Clearing port 18080 (solar-scada dedicated port)..."
fuser -k 18080/tcp 2>/dev/null || true
sleep 2

systemctl daemon-reload
systemctl restart solar-scada-api
log "  solar-scada-api restarted"
sleep 6

systemctl restart solar-scada-proxy 2>/dev/null && log "  solar-scada-proxy restarted" || true
sleep 2

# ── 6. Health checks ──────────────────────────────────────────────────────────
section "7/8  Health checks"

# API liveness
API_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18080/api/healthz)
if [ "\$API_STATUS" = "200" ]; then
  log "  /api/healthz → HTTP \$API_STATUS ✓"
else
  fail "  API not healthy (HTTP \$API_STATUS)\\n       Debug: journalctl -u solar-scada-api -n 40 --no-pager"
fi

# Password-login route
PW_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:18080/api/auth/password-login \\
  -H "Content-Type: application/json" -d '{"email":"x","password":"x"}')
if [ "\$PW_STATUS" = "401" ] || [ "\$PW_STATUS" = "400" ] || [ "\$PW_STATUS" = "200" ]; then
  log "  /api/auth/password-login → HTTP \$PW_STATUS ✓  (route exists)"
else
  warn "  /api/auth/password-login → HTTP \$PW_STATUS (expected 400/401, check route)"
fi

# OTP route (smoke test)
OTP_RESULT=\$(curl -s -X POST http://127.0.0.1:18080/api/platform-admin/login/email \\
  -H "Content-Type: application/json" \\
  -d '{"email":"automystics.com@gmail.com"}')
log "  /api/platform-admin/login/email → \$(echo "\$OTP_RESULT" | head -c 120)"

# ── 7. Done ───────────────────────────────────────────────────────────────────
section "8/8  Complete"
echo ""
echo -e "\${BOLD}\${GREEN}  ✅  Deploy successful!\${NC}"
echo ""
echo -e "  \${BOLD}App:\${NC}   https://scada.automystics.tech"
echo -e "  \${BOLD}Admin:\${NC} https://scada.automystics.tech/platform-admin"
echo ""
echo -e "\${CYAN}  Next deploy — just run from the VPS:\${NC}"
echo -e "  \${BOLD}  cd \$DIR && ./deploy.sh\${NC}"
echo ""
`;
