import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Reliable repo-root resolution: go three levels up from the compiled
// binary (artifacts/api-server/dist/index.mjs → repo root).
// This works regardless of the systemd WorkingDirectory setting.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
import router from "./routes";
import { logger } from "./lib/logger";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const app: Express = express();

// Trust the Replit reverse proxy so cookies and `req.secure` work correctly.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Accept CSV payloads for the bulk import endpoint
app.use(express.text({ type: "text/csv", limit: "10mb" }));
// Signed cookies — SESSION_SECRET is validated above
app.use(cookieParser(process.env.SESSION_SECRET));

app.use("/api", router);

// Serve the React frontend in production
// FRONTEND_DIST can be set in .env; defaults to the built solar-scada output
// relative to the repo root (where the systemd service WorkingDirectory points).
const frontendDist =
  process.env.FRONTEND_DIST ??
  path.join(REPO_ROOT, "artifacts/solar-scada/dist/public");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — every non-API route returns index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend static files");
} else {
  logger.warn({ frontendDist }, "Frontend dist not found — skipping static serving");
}

export default app;
