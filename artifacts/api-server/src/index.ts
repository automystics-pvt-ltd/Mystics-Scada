import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeedData } from "./lib/seed";
import { initFaultStore } from "./lib/initFaultStore";
import { driverRegistry } from "./lib/drivers/registry";
import { startRetryWorker } from "./lib/retryWorker";
import { startFtpScheduler } from "./lib/ftpScheduler";
import { startOfflineDetectionJob } from "./lib/offlineDetection";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  // Seed data first (non-fatal — log and continue)
  await ensureSeedData().catch((err: unknown) => {
    logger.error({ err }, "Failed to seed initial data");
  });

  // Restore persisted fault simulations BEFORE accepting traffic so that
  // any request or SSE connection made immediately after startup sees the
  // correct fault state.  Errors inside initFaultStore are caught and logged.
  await initFaultStore();

  // Start IoT protocol drivers for all configured devices.
  // Non-fatal — log and continue if any driver fails to start.
  await driverRegistry.init().catch((err: unknown) => {
    logger.error({ err }, "DriverRegistry: failed to initialize");
  });

  // Start durable ingestion retry worker (retries failed device_readings writes).
  startRetryWorker();

  // Start FTP/SFTP scheduled file-pull scheduler.
  startFtpScheduler();

  // Start the device offline-detection sweep (60s interval).
  startOfflineDetectionJob();

  // Now open the port
  await new Promise<void>((resolve, reject) => {
    app.listen(port, (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Server listening");
      resolve();
    });
  });
}

startServer().catch((err: unknown) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
