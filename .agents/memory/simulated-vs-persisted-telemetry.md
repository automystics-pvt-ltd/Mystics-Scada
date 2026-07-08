---
name: Simulated telemetry vs persisted state
description: Decision pattern for SCADA/monitoring-style dashboards on which data to simulate in-memory vs persist in a database.
---

For a SCADA/industrial-monitoring-style dashboard (plants, inverters, strings, weather, yield/PR/availability/revenue), it's a valid and simpler architecture to compute all read-heavy "live" telemetry deterministically in-memory on the server using time-seeded pseudo-random functions — no DB round-trips, no seed/migration complexity for data that's inherently synthetic anyway.

**Why:** Telemetry has no real sensors to persist from in a Phase 1 demo; computing it as a pure function of time keeps it consistent across requests/replicas without needing a datastore, while still feeling "live" (numbers change as time advances).

**How to apply:** Only persist entities that need real CRUD/mutation semantics with state that must survive across requests and be user-editable — e.g. alerts, alert history, work orders, users/roles, generated reports. Keep the simulation layer (`lib/simulation.ts`) separate from the persistence-backed domain layer so the boundary stays clear as the app grows.
