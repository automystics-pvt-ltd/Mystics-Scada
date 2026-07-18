#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Solar SCADA — VPS Deploy Script
#  Usage: bash deploy.sh
#  Run from: /home/automystics-scada/htdocs/scada.automystics.tech
# ═══════════════════════════════════════════════════════════════

set -e
DEPLOY_DIR="/home/automystics-scada/htdocs/scada.automystics.tech"
REPO="https://github.com/automystics-pvt-ltd/Mystics-Scada"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

cd "$DEPLOY_DIR" || fail "Deploy directory not found: $DEPLOY_DIR"
log "Working directory: $(pwd)"

# ── 1. Pull latest code ──────────────────────────────────────────────────────
log "Pulling latest code from GitHub..."
git fetch origin main
git reset --hard origin/main
log "Code updated to: $(git log --oneline -1)"

# ── 2. Install dependencies ──────────────────────────────────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── 3. Database setup & migrations ──────────────────────────────────────────
log "Running database migrations..."
# Ensure scada user exists
sudo -u postgres psql << 'SQL' 2>/dev/null || true
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'scada') THEN
    CREATE USER scada WITH PASSWORD 'scada';
  END IF;
END $$;
SQL
sudo -u postgres psql -c "CREATE DATABASE solar_scada OWNER scada;" 2>/dev/null || true
sudo -u postgres psql -d solar_scada -c "GRANT ALL ON SCHEMA public TO scada;" 2>/dev/null || true

pnpm --filter @workspace/db run db:push
log "Database migrations done."

# ── 4. Build API ─────────────────────────────────────────────────────────────
log "Building API server..."
pnpm --filter @workspace/api-server run build
log "API build done."

# ── 5. Build frontend ────────────────────────────────────────────────────────
log "Building frontend..."
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/solar-scada run build
log "Frontend build done."

# ── 6. Ensure systemd services exist ────────────────────────────────────────
log "Checking systemd services..."

# API service
if [ ! -f /etc/systemd/system/solar-scada-api.service ]; then
  warn "Creating solar-scada-api.service..."
  cat > /etc/systemd/system/solar-scada-api.service << 'SVC'
[Unit]
Description=Solar SCADA API Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/automystics-scada/htdocs/scada.automystics.tech/artifacts/api-server
EnvironmentFile=/home/automystics-scada/htdocs/scada.automystics.tech/.env
Environment=NODE_ENV=production
Environment=FRONTEND_DIST=/home/automystics-scada/htdocs/scada.automystics.tech/artifacts/solar-scada/dist/public
ExecStart=/usr/bin/node --enable-source-maps /home/automystics-scada/htdocs/scada.automystics.tech/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC
fi

# Proxy service
if [ ! -f /etc/systemd/system/solar-scada-proxy.service ]; then
  warn "Creating solar-scada-proxy.service..."
  cat > /etc/systemd/system/solar-scada-proxy.service << 'SVC'
[Unit]
Description=Solar SCADA Proxy (port 3003)
After=network.target solar-scada-api.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/automystics-scada/htdocs/scada.automystics.tech
EnvironmentFile=/home/automystics-scada/htdocs/scada.automystics.tech/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /home/automystics-scada/htdocs/scada.automystics.tech/serve.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SVC
fi

# ── 7. Write serve.mjs if missing ───────────────────────────────────────────
if [ ! -f serve.mjs ]; then
  warn "Writing serve.mjs proxy..."
  cat > serve.mjs << 'MJS'
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.FRONTEND_DIST ??
  path.join(__dirname, "artifacts/solar-scada/dist/public");
const API_PORT = Number(process.env.API_PORT ?? 8080);
const PORT = Number(process.env.PORT ?? 3003);

const MIME = {
  ".html":".html", ".js":"application/javascript", ".mjs":"application/javascript",
  ".css":"text/css", ".json":"application/json", ".png":"image/png",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".svg":"image/svg+xml",
  ".ico":"image/x-icon", ".woff":"font/woff", ".woff2":"font/woff2", ".ttf":"font/ttf",
};

function serveFile(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    return false;
  }
  return true;
}

http.createServer((req, res) => {
  // Proxy /api/* → Express on API_PORT
  if (req.url.startsWith("/api/")) {
    const opts = {
      hostname: "127.0.0.1", port: API_PORT,
      path: req.url, method: req.method,
      headers: req.headers,
    };
    const proxy = http.request(opts, (pr) => {
      res.writeHead(pr.statusCode, pr.headers);
      pr.pipe(res);
    });
    proxy.on("error", () => { res.writeHead(502); res.end("API unavailable"); });
    req.pipe(proxy);
    return;
  }

  // Serve static files
  const urlPath = req.url.split("?")[0];
  const filePath = path.join(DIST, urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  // SPA fallback
  serveFile(res, path.join(DIST, "index.html")) || (() => {
    res.writeHead(404); res.end("Not found");
  })();
}).listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
MJS
fi

# ── 8. Ensure SMTP vars in .env ──────────────────────────────────────────────
if ! grep -q "^SMTP_HOST" .env 2>/dev/null; then
  warn "SMTP vars not found in .env — add them manually:"
  warn "  SMTP_HOST=smtp.gmail.com"
  warn "  SMTP_PORT=587"
  warn "  SMTP_USER=your@gmail.com"
  warn "  SMTP_PASS=your-app-password"
  warn "  SMTP_FROM=AppName <your@gmail.com>"
fi

# ── 9. Reload & restart services ─────────────────────────────────────────────
log "Restarting services..."
systemctl daemon-reload
systemctl enable solar-scada-api solar-scada-proxy 2>/dev/null || true
systemctl restart solar-scada-api
sleep 4
systemctl restart solar-scada-proxy
sleep 2

# ── 10. Health check ─────────────────────────────────────────────────────────
log "Running health checks..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/healthz)
if [ "$API_STATUS" = "200" ]; then
  log "✅ API healthy (port 8080)"
else
  fail "❌ API not responding (HTTP $API_STATUS)"
fi

PROXY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3003/api/healthz)
if [ "$PROXY_STATUS" = "200" ]; then
  log "✅ Proxy healthy (port 3003)"
else
  warn "⚠️  Proxy not responding (HTTP $PROXY_STATUS) — check serve.mjs"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}  App: https://scada.automystics.tech${NC}"
echo -e "${GREEN}  Admin: https://scada.automystics.tech/platform-admin${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
