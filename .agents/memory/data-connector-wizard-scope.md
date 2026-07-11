---
name: Data Connector Wizard vs. Device registration scope
description: Why new protocol drivers (OPC-UA, BACnet) were NOT added to the Universal Data Connector Wizard.
---

The "Universal Data Connector Wizard" (`data-connector-wizard.tsx`) only supports `rest_api` / `mqtt` / `websocket` / `csv_upload` — it's a generic HTTP/broker source wizard with a JSONPath-based field-mapping step. It does **not** cover `modbus` at all, even though Modbus is a fully-supported protocol driver.

Industrial/structured-addressing protocols (Modbus, OPC-UA, BACnet) are registered instead through the Devices page ("Register Device" dialog in `devices.tsx`), the autoprovisioning wizard (`autoprovision-wizard.tsx`), and Device Templates (`device-template-builder.tsx`) — these use protocol-specific structured fields (register address, NodeId, object type/instance/property) rather than JSONPath mapping.

**How to apply:** when adding a new industrial/structured protocol driver, add UI to the Devices/Templates/Driver-Health surfaces, not the Data Connector Wizard — match precedent (Modbus is the existing example of a protocol intentionally absent from the wizard).
