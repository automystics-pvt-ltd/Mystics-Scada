import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeedData } from "./lib/seed";
import { seedPasswordUser } from "./lib/seedPasswordUser";
import { initFaultStore } from "./lib/initFaultStore";
import { driverRegistry } from "./lib/drivers/registry";
import { startRetryWorker } from "./lib/retryWorker";
import { startFtpScheduler } from "./lib/ftpScheduler";
import { startOfflineDetectionJob } from "./lib/offlineDetection";
import { db, plantsTable } from "@workspace/db";
import { loadDbPlant } from "./lib/simulation";

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

  // Ensure the temporary password-login user exists with correct hash
  await seedPasswordUser().catch((err: unknown) => {
    logger.warn({ err }, "seedPasswordUser skipped — DB may not be ready yet");
  });

  // Load user-created plants from DB into in-memory simulation layer
  await db.select().from(plantsTable).then((rows) => {
    for (const row of rows) loadDbPlant(row);
    if (rows.length > 0) logger.info({ count: rows.length }, "Loaded DB plants into simulation");
  }).catch((err: unknown) => {
    logger.warn({ err }, "Could not load DB plants — plantsTable may not exist yet");
  });

  // Restore persisted fault simulations — non-fatal so the API starts even
  // when the DB schema has not been migrated yet (e.g. fresh VPS deployment).
  await initFaultStore().catch((err: unknown) => {
    logger.warn({ err }, "initFaultStore skipped — DB tables may not exist yet");
  });

  // Start IoT protocol drivers for all configured devices.
  // Non-fatal — log and continue if any driver fails to start.
  await driverRegistry.init().catch((err: unknown) => {
    logger.error({ err }, "DriverRegistry: failed to initialize");
  });

  // Start durable ingestion retry worker (retries failed device_readings writes).
  try { startRetryWorker(); } catch (err) {
    logger.warn({ err }, "startRetryWorker skipped — DB tables may not exist yet");
  }

  // Start FTP/SFTP scheduled file-pull scheduler.
  try { startFtpScheduler(); } catch (err) {
    logger.warn({ err }, "startFtpScheduler skipped");
  }

  // Start the device offline-detection sweep (60s interval).
  try { startOfflineDetectionJob(); } catch (err) {
    logger.warn({ err }, "startOfflineDetectionJob skipped");
  }

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
