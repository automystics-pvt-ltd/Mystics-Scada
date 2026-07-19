/**
 * deploy-script.ts
 *
 * The deploy script is embedded here as a string so it is always available
 * from GET /api/deploy.sh regardless of whether the file exists on disk.
 * Update this string whenever the deployment procedure changes.
 */

export const DEPLOY_SCRIPT = `#!/bin/bash
set -e
GREEN="\\033[0;32m"; YELLOW="\\033[1;33m"; RED="\\033[0;31m"; NC="\\033[0m"
log()  { echo -e "\${GREEN}[DEPLOY]\${NC} \$1"; }
warn() { echo -e "\${YELLOW}[WARN]\${NC} \$1"; }
fail() { echo -e "\${RED}[ERROR]\${NC} \$1"; exit 1; }

DIR="/home/automystics-scada/htdocs/scada.automystics.tech"
REPLIT="\${REPLIT_URL:-https://b374b4f9-0594-4265-a46a-a2422069eeba-00-2eey4le8q0k3m.sisko.replit.dev}"
CB="\$(date +%s)"  # cache-buster — forces CDN to skip cached response

cd "\$DIR" || fail "Deploy directory not found: \$DIR"
log "Working in \$(pwd)"
log "Pulling from: \$REPLIT (cache-buster: \$CB)"

# ── 1. Pull API binary ─────────────────────────────────────────────────────────
log "[1/6] Downloading API binary..."
curl -fsSL \\
  -H "Cache-Control: no-cache" -H "Pragma: no-cache" \\
  "\$REPLIT/api/dist/api.mjs?v=\$CB" \\
  -o artifacts/api-server/dist/index.mjs \\
  || fail "Failed to download API binary from \$REPLIT"
log "  API binary: \$(du -h artifacts/api-server/dist/index.mjs | cut -f1)"

# Verify binary contains the password-login route
PW_HITS=\$(grep -c "password-login" artifacts/api-server/dist/index.mjs 2>/dev/null || echo 0)
if [ "\$PW_HITS" -lt 1 ]; then
  fail "STALE BINARY: password-login route not found (\$PW_HITS hits). The Replit server may still be building — wait 30s and retry."
fi
log "  Binary verified: \$PW_HITS password-login reference(s) found ✓"

# ── 2. Pull frontend tarball ───────────────────────────────────────────────────
log "[2/6] Downloading frontend..."
curl -fsSL \\
  -H "Cache-Control: no-cache" -H "Pragma: no-cache" \\
  "\$REPLIT/api/dist/frontend.tar.gz?v=\$CB" \\
  -o /tmp/fe.tar.gz \\
  || fail "Failed to download frontend from \$REPLIT"
log "  Frontend tarball: \$(du -h /tmp/fe.tar.gz | cut -f1)"

mkdir -p artifacts/solar-scada/dist/public
rm -rf artifacts/solar-scada/dist/public/*
tar -xzf /tmp/fe.tar.gz -C artifacts/solar-scada/dist/public \\
  && log "  Frontend extracted" \\
  || fail "Failed to extract frontend tarball"

# ── 3. SMTP env vars ───────────────────────────────────────────────────────────
log "[3/6] Checking SMTP config..."
ENV_FILE="artifacts/api-server/.env"
mkdir -p "\$(dirname "\$ENV_FILE")"
touch "\$ENV_FILE"
if grep -q "SMTP_HOST" "\$ENV_FILE" 2>/dev/null; then
  log "  SMTP already configured — skipping"
else
  warn "  SMTP_HOST not found in \$ENV_FILE"
  warn "  Add SMTP vars manually or set them before running this script:"
  warn "    SMTP_HOST=smtp.gmail.com"
  warn "    SMTP_PORT=587"
  warn "    SMTP_SECURE=false"
  warn "    SMTP_USER=you@gmail.com"
  warn "    SMTP_PASS=xxxx xxxx xxxx xxxx"
  warn "    SMTP_FROM=Platform <you@gmail.com>"
fi

# ── 4. DB migrations ───────────────────────────────────────────────────────────
log "[4/6] Running DB migrations..."
pnpm --filter @workspace/db run db:push \\
  && log "  Migrations complete" \\
  || warn "  DB push failed — schema may already be up to date"

# ── 5. Restart services ────────────────────────────────────────────────────────
log "[5/6] Restarting services..."
# Kill any zombie node process still holding port 8080 before restart
log "  Clearing port 8080..."
fuser -k 8080/tcp 2>/dev/null || true
sleep 2
systemctl daemon-reload
systemctl restart solar-scada-api
sleep 5
systemctl restart solar-scada-proxy 2>/dev/null || true
sleep 2

# ── 6. Health checks ───────────────────────────────────────────────────────────
log "[6/6] Health checks..."
API_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/healthz)
if [ "\$API_STATUS" = "200" ]; then
  log "  API OK (HTTP \$API_STATUS)"
else
  fail "  API not responding (HTTP \$API_STATUS) — check: journalctl -u solar-scada-api -n 30 --no-pager"
fi

log "Testing OTP route..."
RESULT=\$(curl -s -X POST http://127.0.0.1:8080/api/platform-admin/login/email \\
  -H "Content-Type: application/json" \\
  -d '{"email":"automystics.com@gmail.com"}')
echo "  Response: \$RESULT"

log "Checking SMTP status in logs..."
journalctl -u solar-scada-api -n 20 --no-pager | grep -E "SMTP|OTP" || true

echo ""
echo -e "\${GREEN}✅ Deploy complete!\${NC}"
echo -e "\${GREEN}   App:   https://scada.automystics.tech\${NC}"
echo -e "\${GREEN}   Admin: https://scada.automystics.tech/platform-admin\${NC}"
echo ""
echo "Next deploy (from VPS):"
echo "  curl -fsSL http://127.0.0.1:8080/api/deploy.sh | bash"
`;
