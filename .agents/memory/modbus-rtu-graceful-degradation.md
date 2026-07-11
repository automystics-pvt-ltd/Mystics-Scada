---
name: Modbus RTU driver graceful degradation without real serial hardware
description: Pattern for protocol drivers (RTU/RS485, or any hardware-attached transport) that must not crash when the physical device/port is absent, as in a cloud dev sandbox.
---

- Lazily `await import("serialport")` (or any native-binding package) inside the driver's connect path, wrapped in try/catch, instead of a static top-level import. A missing/unbuilt native binding then degrades to a clean "unavailable" status instead of crashing the whole process at module load.
- Treat `ENOENT`/"no such file or directory" from `port.open()` as an expected, non-fatal condition (no physical device attached) — log at a lower severity ("DISCONNECT"/warn, not "ERROR"), set driver status to `idle`, and retry on a long interval (e.g. 30s) rather than hot-looping.
- **Why:** this driver runs inside a shared framework that boots every configured device's driver on server start; a hardware-transport driver throwing on missing hardware would take down or spam-log the whole registry in every cloud/dev deployment that has no serial devices attached.
- **How to apply:** any new hardware-local transport driver (RTU/RS485, CAN bus, GPIO, USB-serial, etc.) added to `artifacts/api-server/src/lib/drivers/` should follow the same shape: dynamic import, graceful ENOENT handling, idle+backoff retry, never throw from `start()`/`connect()`.
