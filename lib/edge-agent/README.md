# @workspace/edge-agent

Edge Gateway Agent — runs on a plant-local machine (Raspberry Pi, industrial
PC, or Linux VM) and polls devices on the plant LAN (Modbus TCP, MQTT, HTTP)
that are not reachable from the cloud. Readings are forwarded to the cloud
API over a single outbound HTTPS connection — no inbound firewall rules or
VPN required.

## Setup

1. In the SCADA app, go to **Org Settings → Gateways → Generate Token** and
   copy the plaintext token (shown once).
2. Assign devices to the new gateway from the **Devices** page — set the
   "Assigned Gateway" field on each device that lives on this plant's LAN.
3. Deploy the agent at the plant site:

   ```bash
   cp .env.gateway.example .env.gateway   # fill in GATEWAY_TOKEN and API_URL
   docker compose up -d
   ```

   Or run it directly with Node.js:

   ```bash
   pnpm --filter @workspace/edge-agent run build
   GATEWAY_TOKEN=... API_URL=https://your-project.replit.app/api node dist/index.js
   ```

## Supported protocols

Modbus TCP, MQTT, and HTTP (JSON) are supported today — the same protocols
most solar inverters, meters, and PLCs speak on a plant LAN. OPC-UA, BACnet,
Modbus RTU, and WebSocket devices should stay assigned to the cloud driver
registry (leave "Assigned Gateway" unset) until a future release extends
agent support to those protocols.

## Offline buffering

Readings are written to a local SQLite file (`BUFFER_DB_PATH`, default
`./data/readings.db`) before being sent to the cloud. If the cloud is
unreachable, readings accumulate there (capped at `BUFFER_MAX_ROWS`, oldest
pruned first) and are flushed automatically once connectivity returns.

## Scope

Read-only telemetry collection only. The agent never writes registers or
publishes MQTT messages back to devices — see Task #79 for the full scope
notes (no two-way control, no auto network discovery, no Windows support,
no OTA self-update).
