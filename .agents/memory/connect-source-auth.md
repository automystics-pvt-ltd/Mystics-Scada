---
name: Connect Source auth credential handling
description: How HTTP/WebSocket auth credentials are stored, encrypted, and used in the driver framework
---

## Rule
`httpAuthValue` (bearer token, API key, basic "user:pass") is always encrypted at rest using `encryptCredential()` from `credentialCrypto.ts`, and decrypted just-in-time when building a `DriverConfig` for the driver registry and connection-test route. The plaintext value is **never** stored in the DB or returned in any API response.

**Why:** The device `config` JSONB column is visible to DB admins, backups, and super-admin tooling. Storing plaintext credentials there would expose them on any DB read. Pattern follows the existing FTP credential model (`ftpSources.ts`).

## How to apply
- **POST /devices**: encrypt before DB insert → `httpAuthValue: encryptCredential(body.httpAuthValue)`
- **PATCH /devices**: encrypt on update; empty string clears the field
- **Registry `_launchDriver`**: decrypt before DriverConfig → `decryptCredential(rawCfg.httpAuthValue)`
- **`/devices/:id/connection-test`**: decrypt before DriverConfig
- **Preflight endpoint** (`POST /devices/connection-preflight`): value comes from request body and is used once (never persisted) — no encrypt/decrypt needed
- **`toDeviceResponse`**: returns `httpAuthMethod`, `httpApiKeyHeader`, `httpAuthConfigured` (bool) — never `httpAuthValue`
- **`HttpDriver._buildHeaders()`** and **`WebSocketDriver._buildHeaders()`**: both handle all four auth methods (none, bearer, api_key, basic)

## Cross-field Zod validation
`validateHttpAuth` superRefine is applied to `RegisterDeviceBody`, `UpdateDeviceBody`, and `PreflightBody`:
- `bearer` or `basic`: requires `httpAuthValue`
- `api_key`: requires both `httpAuthValue` and `httpApiKeyHeader`

## Preflight endpoint
`POST /api/devices/connection-preflight` — runs a real driver test without a saved device ID. Must be registered **before** `/:id` routes in Express. 7-second timeout (vs 5s for saved-device test).
