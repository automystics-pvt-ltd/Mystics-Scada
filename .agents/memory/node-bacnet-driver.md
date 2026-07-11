---
name: node-bacnet driver integration
description: Quirks of node-bacnet@^0.2.4 relevant to writing/maintaining the BACnet/IP driver.
---

- `node-bacnet` ships no TypeScript types — needs an ambient `declare module "node-bacnet"` shim (kept minimal/`any`-shaped since the driver narrows the runtime shape itself).
- The library binds a UDP socket per `Client` instance (BACnet/IP uses connectionless UDP broadcast/unicast on port 47808). Multiple `Client` instances in one process compete for the same port — use one shared, ref-counted singleton `Client` for all BACnet devices, not one per device.
- API is callback-based (not Promise-based); wrap each call (readProperty, whoIs, etc.) in a `new Promise` with a manual timeout, since the library itself won't reject on device silence (BACnet has no TCP-style connection to detect drop).
- Import via `.default ?? mod` interop pattern under dynamic `import()` — same pattern used for `node-opcua`.
- Field mapping: BACnet addressing is structured (`objectType` + `objectInstance` + `propertyId`), not a flat register/JSONPath like Modbus/HTTP — camelCase aliases (e.g. `analogInput`) map to the library's SCREAMING_SNAKE enums via alias tables + generic camel→snake fallback.
