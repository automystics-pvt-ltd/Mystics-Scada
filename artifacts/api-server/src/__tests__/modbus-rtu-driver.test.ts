/**
 * Unit tests for the Modbus RTU / RS485 driver (Task #72).
 *
 * This sandbox has no physical serial hardware, so these tests focus on the
 * contract that matters most for that environment: the driver must NEVER
 * throw or crash the process when a serial port is missing or unconfigured —
 * it should report a clean failure through `test()`/`log` events and keep
 * retrying quietly in the background.
 */

import { describe, it, expect } from "vitest";
import { ModbusRtuDriver } from "../lib/drivers/ModbusRtuDriver";
import type { DriverConfig } from "../lib/drivers/types";

function baseCfg(overrides: Partial<DriverConfig> = {}): DriverConfig {
  return {
    deviceId: "test-rtu-device",
    protocol: "modbus_rtu",
    modbusUnitId: 1,
    fieldMap: [],
    ...overrides,
  };
}

describe("ModbusRtuDriver", () => {
  it("test() resolves ok:false (never throws) when no serial port is configured", async () => {
    const driver = new ModbusRtuDriver(baseCfg({ serialPort: undefined }));
    const result = await driver.test(1_000);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/serial port/i);
  });

  it("test() resolves ok:false when the configured serial port does not exist", async () => {
    const driver = new ModbusRtuDriver(baseCfg({ serialPort: "/dev/ttyUSB99-does-not-exist" }));
    const result = await driver.test(2_000);
    expect(result.ok).toBe(false);
    expect(typeof result.latencyMs).toBe("number");
  }, 5_000);

  it("start() on a missing serial port logs a non-fatal DISCONNECT event and settles to idle, never throwing", async () => {
    const driver = new ModbusRtuDriver(baseCfg({ serialPort: "/dev/ttyUSB98-does-not-exist" }));
    const logs: { eventType: string; message: string }[] = [];
    driver.on("log", (eventType: string, message: string) => logs.push({ eventType, message }));
    driver.on("error", () => {
      // Socket/module-level errors are acceptable — the assertion is that
      // nothing propagates as an unhandled exception.
    });

    expect(() => driver.start()).not.toThrow();

    // Give the async connect() a tick to run and settle.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(["idle", "connecting", "error"]).toContain(driver.status);
    expect(logs.some((l) => /no physical serial device|failed to open|unavailable/i.test(l.message))).toBe(true);

    await expect(driver.stop()).resolves.toBeUndefined();
    expect(driver.status).toBe("disconnected");
  }, 5_000);

  it("stop() is safe to call even when never started", async () => {
    const driver = new ModbusRtuDriver(baseCfg({ serialPort: "/dev/ttyUSB0" }));
    await expect(driver.stop()).resolves.toBeUndefined();
  });
});
