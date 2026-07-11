---
name: Alert dedup keys and status authority in simulated/live hybrid systems
description: Lessons from a device-offline alerting job in a system that mixes real driver state with deterministic demo simulation.
---

Two related pitfalls when a background job writes alerts/status for entities that also have a display-name field:

1. **Dedup/resolve alerts by a stable ID, never by display name.** Keying "is there already an open alert for this device" on `deviceName` breaks as soon as two devices share a name (common in seeded demo data) — one device's alert blocks or resolves another's. Add a nullable `deviceId`-style column to the alerts table and key on that.

2. **When a system already renders a "simulated" fallback status for devices without live data, and you then add a real background health/offline job, decide explicitly whether the job's real status should override the simulation.** If every entity has an actively-managed live status field, hiding it behind a demo simulation defeats the entire purpose of the health feature being built — trust the live field unconditionally, and reserve simulation only for cosmetic fields that have no live equivalent (e.g. signal strength percentage) or entities truly outside live management.

**Why:** A device-offline-detection job was rejected in code review because (a) alert dedup used device name, producing duplicate/blocked alerts for devices sharing a name, and (b) the API response layer still overrode a device's real DB `offline` status with a deterministic simulated status whenever `lastSeenAt` was unset — which is the common case for demo devices configured with unreachable fake IPs, so the new offline job's output was invisible to users.

**How to apply:** When adding any "is this the same thing we already alerted on" check, grep for how existing alert/notification creation dedups (often by title+name) before copying the pattern — check whether a stable ID is available or needs adding. When wiring a new real-status signal into a codebase with an existing simulated/demo fallback, search all response-mapping functions for where the fallback branch is chosen and make sure the new signal isn't silently overridden.
