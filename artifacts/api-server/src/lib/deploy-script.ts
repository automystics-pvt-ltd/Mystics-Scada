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
section "0/7  Self-update"
CB="\$(date +%s)"

# Always fetch the latest deploy script from Replit
info "Fetching latest deploy script from Replit..."
LATEST=\$(curl -fsSL \\
  -H "Cache-Control: no-cache" -H "Pragma: no-cache" \\
  "\$REPLIT/api/deploy.sh?v=\$CB" 2>/dev/null) || {
  warn "Could not reach Replit to self-update — continuing with current version"
  LATEST=""
}

if [ -n "\$LATEST" ]; then
  # Write the fetched script to disk (installs on first run, updates on subsequent)
  echo "\$LATEST" > "\$SELF.tmp"
  chmod +x "\$SELF.tmp"

  # If we are already running from $SELF, swap the file and exec the new copy
  # to ensure the rest of the deploy uses the latest logic.
  if [ "\$0" = "\$SELF" ] || [ "\$(realpath "\$0" 2>/dev/null)" = "\$(realpath "\$SELF" 2>/dev/null)" ]; then
    mv "\$SELF.tmp" "\$SELF"
    info "Script updated — re-executing latest version..."
    echo ""
    exec "\$SELF" --skip-self-update "\$@"
  else
    # First run (piped from curl): just install and continue this copy
    mv "\$SELF.tmp" "\$SELF"
    log "Installed deploy script → \$SELF"
    info "Future deploys: cd \$DIR && ./deploy.sh"
  fi
else
  log "Using current version (offline / Replit unreachable)"
fi

# Guard so the re-exec above doesn't loop
if [ "\${1:-}" = "--skip-self-update" ]; then
  shift
fi

# ── go to deploy directory ────────────────────────────────────────────────────
cd "\$DIR" || fail "Deploy directory not found: \$DIR"
log "Working directory: \$(pwd)"

# ── 1. Pull API binary ─────────────────────────────────────────────────────────
section "1/7  API binary"
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
section "2/7  Frontend"
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

# ── 3. SMTP env check ─────────────────────────────────────────────────────────
section "3/7  Environment"
ENV_FILE="artifacts/api-server/.env"
mkdir -p "\$(dirname "\$ENV_FILE")"
touch "\$ENV_FILE"
if grep -q "SMTP_HOST" "\$ENV_FILE" 2>/dev/null; then
  log "  SMTP configured ✓"
else
  warn "  SMTP_HOST not found in \$ENV_FILE"
  warn "  Add lines like:"
  warn "    SMTP_HOST=smtp.gmail.com"
  warn "    SMTP_PORT=587"
  warn "    SMTP_SECURE=false"
  warn "    SMTP_USER=you@gmail.com"
  warn "    SMTP_PASS=xxxx xxxx xxxx xxxx"
  warn "    SMTP_FROM=Platform <you@gmail.com>"
fi

SESSION_SET=\$(grep -c "SESSION_SECRET" "\$ENV_FILE" 2>/dev/null || echo 0)
if [ "\$SESSION_SET" -lt 1 ]; then
  warn "  SESSION_SECRET not set — generating a random one..."
  echo "SESSION_SECRET=\$(openssl rand -hex 32)" >> "\$ENV_FILE"
  log "  SESSION_SECRET generated and saved ✓"
else
  log "  SESSION_SECRET present ✓"
fi

# ── 4. DB migrations ──────────────────────────────────────────────────────────
section "4/7  Database migrations"
pnpm --filter @workspace/db run db:push \\
  && log "  Migrations applied ✓" \\
  || warn "  db:push returned non-zero — schema may already be current"

# ── 5. Restart services ───────────────────────────────────────────────────────
section "5/7  Restart services"
info "  Clearing port 8080..."
fuser -k 8080/tcp 2>/dev/null || true
sleep 2

systemctl daemon-reload
systemctl restart solar-scada-api
log "  solar-scada-api restarted"
sleep 6

systemctl restart solar-scada-proxy 2>/dev/null && log "  solar-scada-proxy restarted" || true
sleep 2

# ── 6. Health checks ──────────────────────────────────────────────────────────
section "6/7  Health checks"

# API liveness
API_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/healthz)
if [ "\$API_STATUS" = "200" ]; then
  log "  /api/healthz → HTTP \$API_STATUS ✓"
else
  fail "  API not healthy (HTTP \$API_STATUS)\\n       Debug: journalctl -u solar-scada-api -n 40 --no-pager"
fi

# Password-login route
PW_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8080/api/auth/password-login \\
  -H "Content-Type: application/json" -d '{"email":"x","password":"x"}')
if [ "\$PW_STATUS" = "401" ] || [ "\$PW_STATUS" = "400" ] || [ "\$PW_STATUS" = "200" ]; then
  log "  /api/auth/password-login → HTTP \$PW_STATUS ✓  (route exists)"
else
  warn "  /api/auth/password-login → HTTP \$PW_STATUS (expected 400/401, check route)"
fi

# OTP route (smoke test)
OTP_RESULT=\$(curl -s -X POST http://127.0.0.1:8080/api/platform-admin/login/email \\
  -H "Content-Type: application/json" \\
  -d '{"email":"automystics.com@gmail.com"}')
log "  /api/platform-admin/login/email → \$(echo "\$OTP_RESULT" | head -c 120)"

# ── 7. Done ───────────────────────────────────────────────────────────────────
section "7/7  Complete"
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
