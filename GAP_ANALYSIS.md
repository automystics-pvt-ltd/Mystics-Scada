# Enterprise SCADA Platform — Gap Analysis
**Date:** July 2026  
**Reference Spec:** Enterprise SCADA Platform Requirements (uploaded)  
**Platform:** Solar SCADA (this codebase)

Legend: ✅ Implemented · 🟡 Partial · ❌ Not built

---

## 1. INDUSTRIAL PROTOCOL SUPPORT

| Protocol | Status | Notes |
|---|---|---|
| Modbus TCP | ✅ | Full polling, holding registers (FC03), reconnect guard |
| Modbus RTU | ✅ | RS-485 serial, graceful ENOENT degradation, idle+retry |
| MQTT | ✅ | JSON topic subscription, configurable broker |
| HTTP/REST | ✅ | JSON polling driver, SSRF-guarded |
| WebSocket | ✅ | Persistent connection, JSON frames |
| OPC-UA | 🟡 | Polling only — push subscriptions not implemented; security mode mapping done; no live server test |
| BACnet/IP | 🟡 | Read-only (Present Value); shared UDP singleton; no write support |
| FTP/SFTP | 🟡 | FTP source ingestion for CSV files exists; SFTP not implemented |
| CSV / Excel ingest | 🟡 | CSV ingestion via FTP sources; direct upload UI is placeholder only |
| RS-232 | ❌ | No serial driver abstraction for RS-232 |
| OPC-DA | ❌ | Not implemented (Windows COM — would need a bridge) |
| CAN Bus | ❌ | No driver |
| IEC 61850 | ❌ | No driver |
| IEC 60870-5-104 | ❌ | No driver |
| DNP3 | ❌ | No driver |
| SNMP | ❌ | No driver |
| GraphQL data source | ❌ | No driver |
| **Write commands (any protocol)** | ❌ | All drivers are read-only; no FC06/FC16 Modbus writes, no BACnet WriteProperty, no OPC-UA write |
| Per-protocol communication logs | 🟡 | `deviceCommLogs` table exists; UI partial |
| Per-protocol retry/polling config | ✅ | Configurable per device template |
| SSRF guard | ✅ | Covers create / update / restart / connection-test paths |

---

## 2. SECURITY & ACCESS CONTROL

| Requirement | Status | Notes |
|---|---|---|
| Role-Based Access Control (RBAC) | ✅ | `rolesTable` per org; permissions string array; enforced in middleware |
| OTP / MFA (email) | ✅ | 6-digit OTP, 5 min TTL, 50s cooldown, timing-safe verify |
| Signed session cookies | ✅ | `cookie-parser` signed cookies; `SESSION_SECRET` env |
| Tenant isolation | ✅ | All queries scoped by `orgId`; enforced server-side |
| Audit trails | 🟡 | `auditLogsTable` exists with action/resourceType/metadata; not all actions logged (see §7) |
| Credential encryption at rest | ✅ | AES-256-GCM for HTTP auth values, just-in-time decrypt in driver registry |
| Encryption in transit | ✅ | HTTPS via reverse proxy on VPS |
| Attribute-Based Access Control (ABAC) | ❌ | No attribute policy engine |
| IP whitelisting | ❌ | Not implemented |
| Device whitelisting | ❌ | Not implemented |
| OAuth2 / OpenID Connect | ❌ | Not implemented |
| Microsoft Entra ID / Azure AD | ❌ | Not implemented |
| LDAP | ❌ | Not implemented |
| SAML | ❌ | Not implemented |
| Password auth + complexity policies | ❌ | `passwordHash` column exists but login is OTP-only; no password UX |
| Account lockout after failed attempts | ❌ | Not implemented |
| Concurrent session restrictions | ❌ | Not implemented |
| Password expiration | ❌ | Not implemented |
| User impersonation (admin) | ❌ | Not implemented |
| Push / TOTP MFA | ❌ | Email OTP only; no TOTP/authenticator app support |

---

## 3. PLATFORM ADMIN CAPABILITIES

### Admin Pages Built
| Page | Status | Notes |
|---|---|---|
| Superadmin dashboard | ✅ | KPIs: orgs, users, devices, revenue |
| Tenant / Org management | ✅ | Create, suspend, activate orgs |
| User management (global) | ✅ | Cross-org user list, status, role assignment |
| System health | ✅ | Driver status, worker health |
| Billing / subscriptions | 🟡 | Page exists; no payment processor connected |
| DB Admin console | ✅ | Table browser, schema, SQL console, query history, indexes, slow queries, connections, REINDEX, export |

### Missing Admin Capabilities
| Capability | Status |
|---|---|
| Manage authentication providers (OAuth, SAML, LDAP per tenant) | ❌ |
| Manage licenses (feature flags, seat limits, expiry) | ❌ |
| Per-tenant branding (logo, colors, domain) | ❌ |
| Manage protocol/communication profiles (global templates) | ❌ |
| Manage polling engines (priority queues, engine health) | ❌ |
| Manage background workers (pause, resume, retry) | ❌ |
| Manage Redis cache (flush, stats, TTL inspector) | ❌ |
| Manage message queues | ❌ |
| Manage API keys / API gateway | ❌ |
| Manage integrations (3rd-party webhooks, connectors) | 🟡 Webhook channel in notificationConfigs only |
| Data retention policy management | ❌ |
| Historical archive management | ❌ |
| Manage global alarm rules / thresholds | ❌ |
| Manage global dashboards / widget library | ❌ |
| Manage system-wide themes | ❌ |

### DB Admin Console Gaps
| Feature | Status | Notes |
|---|---|---|
| Table browser | ✅ | |
| Schema inspector (columns, types, indexes, FKs) | ✅ | |
| SQL query console | ✅ | |
| Query history | ✅ | Last 20 queries |
| Slow query monitor | ✅ | From `pg_stat_activity` |
| Live connections monitor | ✅ | |
| Index management (REINDEX per table) | ✅ | |
| DB statistics + size bars | ✅ | |
| Multi-field record edit | ✅ | |
| Bulk delete | 🟡 | UI exists; no confirmation/approval flow |
| Export (SQL dump) | ✅ | |
| Stored procedure browser | ❌ | |
| View browser | ❌ | |
| Function browser | ❌ | |
| Visual ER / relationship diagram | ❌ | |
| Data dictionary (column descriptions) | ❌ | |
| Visual query builder | ❌ | |
| Read-only mode toggle | ❌ | |
| Table partitioning management | ❌ | |
| Backup / restore | ❌ | |
| Archive | ❌ | |
| Import (CSV/SQL) | ❌ | |
| Soft delete support | ❌ | |
| Truncate table (permission-controlled) | ❌ | |
| Deadlock monitoring | ❌ | |
| Database maintenance scheduler | ❌ | |
| Approval workflow for destructive actions | ❌ | |

---

## 4. MULTI-TENANCY

| Requirement | Status | Notes |
|---|---|---|
| Multiple tenants / orgs | ✅ | `organizations` table; full isolation |
| Per-org: users, roles, plants, devices | ✅ | All scoped by `orgId` |
| Per-org: dashboards | 🟡 | Dashboards are not yet tenant-customisable |
| Per-org: reports | ✅ | Scoped by orgId |
| Per-org: historical data | ✅ | `deviceReadings` scoped by device → org |
| Per-org: notifications | ✅ | `notificationConfigs` per org |
| Per-org: audit logs | ✅ | |
| Per-org: branding | ❌ | |
| Per-org: configuration overrides | ❌ | No per-tenant feature flags or config |
| Tenant self-service provisioning | ❌ | Orgs created by superadmin only |

---

## 5. LIVE SCADA DASHBOARD

| Feature | Status | Notes |
|---|---|---|
| Real-time telemetry (SSE) | ✅ | Second-level refresh via SSE stream |
| Device status | ✅ | |
| Communication health | ✅ | |
| Power generation | ✅ | |
| Energy consumption | ✅ | |
| Solar irradiance | ✅ | |
| Temperature, humidity, wind speed | ✅ | Weather station integration |
| Performance ratio / efficiency | ✅ | |
| Carbon savings | ✅ | |
| Alarm summary | ✅ | |
| Fault summary | ✅ | |
| Communication summary | ✅ | |
| Inverter monitoring | ✅ | Drill-down per inverter |
| String monitoring | ✅ | String diagnostics page |
| SLD (Single Line Diagram) | ✅ | Interactive breaker/disconnect state |
| Drill-down navigation (portfolio → plant → device) | ✅ | |
| Trend charts | ✅ | |
| Gauge widgets | ✅ | |
| KPI cards | ✅ | |
| Animated process diagrams | 🟡 | SLD is animated; no general process diagram builder |
| Battery state of charge | ❌ | No battery driver or schema |
| Grid status (import/export, frequency) | ❌ | No grid tie / smart meter integration |
| Power quality (voltage, current, power factor, THD) | ❌ | No power quality telemetry type |
| Revenue tracking | ❌ | |
| Interactive GIS / site map | ❌ | Leaflet not integrated; plant location is text only |
| Heat maps | ❌ | |
| Widget-based custom dashboards | ❌ | Dashboards are fixed layout, not user-configurable |
| Drag-and-drop widget builder | ❌ | |

---

## 6. ALARMS & EVENTS

| Feature | Status | Notes |
|---|---|---|
| Severity levels: Critical / Major / Minor / Warning / Info | ✅ | |
| Alarm history (lifecycle transitions) | ✅ | `alertHistoryTable` |
| Alarm acknowledgment | ✅ | With actor + note |
| Email alert notifications | ✅ | Via SMTP mailer |
| Webhook notifications | 🟡 | Config schema exists; delivery not fully wired |
| SMS alerts | 🟡 | Channel defined in schema; no SMS provider integrated |
| Slack notifications | 🟡 | Channel defined in schema; no Slack API integration |
| PagerDuty | 🟡 | Channel defined in schema; no integration |
| Alarm shelving | ❌ | |
| Alarm suppression (scheduled/conditional) | ❌ | |
| Escalation rules (time-based / tier-based) | ❌ | |
| WhatsApp alerts | ❌ | |
| Microsoft Teams alerts | ❌ | |
| Push notifications (mobile) | ❌ | |
| Alarm analytics (frequency, MTTR, MTBF) | ❌ | |
| Root cause correlation | ❌ | |
| Historical event playback | ❌ | |
| Alarm timeline visualisation | ❌ | |
| Smart alarm prioritisation (AI) | 🟡 | AI insights fire-and-forget; no ML-based ranking |

---

## 7. AUDIT & COMPLIANCE

| Tracked Action | Status | Notes |
|---|---|---|
| Login / Logout | 🟡 | `lastLoginAt` on user; no dedicated login event row |
| Alert acknowledgment | ✅ | |
| Record create / update / delete (devices, plants) | ✅ | `auditLogsTable` captures these |
| Device configuration changes | ✅ | |
| Role / permission changes | ❌ | Not logged |
| Failed login attempts | ❌ | |
| Password reset | ❌ | |
| Export / download events | ❌ | |
| Database queries | ❌ | |
| API calls | ❌ | |
| User impersonation | ❌ | Feature doesn't exist |
| **Captured metadata per event** | | |
| Timestamp, userId, orgId, action, resourceId | ✅ | |
| IP address | ❌ | Not captured |
| Browser / OS / location | ❌ | Not captured |
| Before / after value diff | 🟡 | `metadata` JSONB — some routes include diffs, inconsistent |
| Reason / approval details | ❌ | |
| Immutable audit storage | ❌ | Rows are deletable; no append-only enforcement |
| Searchable audit UI | ✅ | `/org/audit-log` page with filters |

---

## 8. REPORTING ENGINE

| Feature | Status | Notes |
|---|---|---|
| Scheduled reports (daily/weekly/monthly) | ✅ | `reportSchedules` table + scheduler |
| Email delivery | ✅ | |
| PDF export | ✅ | pdfkit, generated on demand |
| CSV export | ✅ | |
| Role-based report visibility | ✅ | |
| Energy / solar generation reports | ✅ | |
| Alarm reports | 🟡 | Basic; no frequency/MTTR analytics |
| Maintenance reports | 🟡 | Work orders exist; no formatted maintenance report |
| Inverter / weather / communication reports | 🟡 | Data exists; report templates limited |
| Shift reports | ❌ | |
| Power quality reports | ❌ | No power quality data |
| Fault / asset health reports | ❌ | |
| Audit / security / login / user activity reports | ❌ | |
| API / database reports | ❌ | |
| Custom / ad-hoc report builder | ❌ | |
| Interactive drag-and-drop report designer | ❌ | |
| Excel (.xlsx) export | ❌ | |
| Word / PowerPoint export | ❌ | |
| Report versioning | ❌ | |
| Digital signatures on reports | ❌ | |
| Duplicate schedule prevention | ✅ | DB unique constraint |

---

## 9. AI CAPABILITIES

| Feature | Status | Notes |
|---|---|---|
| Rule-based AI insights (irradiance-gated) | ✅ | Fires during daylight; silent at night except health_decline |
| Maintenance recommendations → work orders | ✅ | AI insight → WO creation with maintenance.manage permission |
| Insight dismissal | ✅ | Stored in `userPreferences` JSONB; day-scoped IDs |
| Equipment health scoring | 🟡 | Health score formula exists in frontend; not ML-derived |
| Anomaly detection | 🟡 | Rule-based threshold checks; no statistical/ML model |
| Predictive maintenance (ML) | ❌ | |
| Failure prediction | ❌ | |
| Energy / solar generation forecasting | ❌ | |
| Natural language queries (LLM) | ❌ | |
| AI-generated report narratives | ❌ | |
| Root cause analysis (AI) | ❌ | |
| Chat-based operational assistant | ❌ | |
| LLM / AI provider integration | ❌ | No OpenAI/Anthropic/Gemini calls anywhere |

---

## 10. UI/UX

| Requirement | Status | Notes |
|---|---|---|
| Modern responsive layout | ✅ | |
| Professional industrial / dark theme | ✅ | Command-centre aesthetics |
| Collapsible navigation | ✅ | |
| Interactive charts | ✅ | SVG-based (recharts replaced due to React 19 incompatibility) |
| Animated gauges | ✅ | |
| Large KPI cards | ✅ | |
| SLD animated diagram | ✅ | |
| Light mode | ❌ | Dark only |
| Configurable themes per org | ❌ | |
| Drag-and-drop widgets / dashboard builder | ❌ | |
| Resizable panels | ❌ | |
| Saved views / filters | ❌ | |
| Global search | ❌ | |
| Keyboard shortcuts | ❌ | |
| Accessibility (WCAG compliance) | ❌ | |
| GIS / map visualisations | ❌ | |
| Heat maps | ❌ | |

---

## 11. TECHNICAL ARCHITECTURE

| Requirement | Status | Notes |
|---|---|---|
| React + TypeScript frontend | ✅ | Vite + React 19 |
| Tailwind CSS | ✅ | |
| Node.js / Express backend | ✅ | Express 5 |
| PostgreSQL | ✅ | Drizzle ORM |
| Drizzle schema + migrations | ✅ | `db:push` |
| SSE real-time streaming | ✅ | Replaces WebSocket for telemetry |
| Background workers (ingestion retry, FTP scheduler) | ✅ | |
| pnpm monorepo | ✅ | Workspace packages: db, api-spec, api-zod, api-client-react, edge-agent, permissions |
| REST API with OpenAPI spec | ✅ | Orval codegen |
| TimescaleDB (time-series optimised) | ❌ | Standard PostgreSQL only; no hypertables |
| Redis cache | ❌ | In-memory maps used instead |
| Message queue (RabbitMQ / BullMQ / etc.) | ❌ | Retry queue is a DB table, not a broker |
| GraphQL API layer | ❌ | |
| SignalR / real WebSockets (bidirectional) | ❌ | SSE is one-way server push |
| Docker / Kubernetes deployment | ❌ | Bare systemd on VPS |
| CI/CD pipeline | ❌ | Manual deploy via `deploy.sh` |
| AG Grid | ❌ | Custom table components |
| ECharts | ❌ | Custom SVG charts |
| Leaflet (GIS) | ❌ | |

---

## SUMMARY SCORECARD

| Area | Built | Partial | Missing | % Done |
|---|---|---|---|---|
| Industrial Protocols | 5 | 4 | 9 | ~35% |
| Security & Access Control | 5 | 1 | 13 | ~25% |
| Platform Admin Pages | 6 | 2 | 14 | ~30% |
| DB Admin Console | 11 | 1 | 13 | ~45% |
| Multi-Tenancy | 6 | 1 | 4 | ~60% |
| Live Dashboard | 15 | 2 | 8 | ~60% |
| Alarms & Events | 5 | 5 | 9 | ~30% |
| Audit & Compliance | 5 | 2 | 11 | ~25% |
| Reporting Engine | 6 | 5 | 14 | ~30% |
| AI Capabilities | 4 | 3 | 7 | ~40% |
| UI/UX | 7 | 0 | 8 | ~45% |
| Technical Architecture | 10 | 0 | 9 | ~50% |
| **OVERALL** | **~85** | **~26** | **~119** | **~37%** |

---

## TOP PRIORITY GAPS (Highest Value / Most Foundational)

### Tier 1 — Foundation (blocks other features)
1. **Protocol write commands** — Modbus FC06/FC16, BACnet WriteProperty, OPC-UA write. Required for remote device control.
2. **Redis cache** — Replace in-memory maps; required for multi-process / HA deployments.
3. **TimescaleDB hypertables** — `deviceReadings` will not scale beyond ~6 months without time-series partitioning.
4. **Audit log completeness** — IP, browser, before/after diff; immutable storage; login events.

### Tier 2 — Core Enterprise Features (customer-facing)
5. **GIS / Leaflet map** — Plant location map; spec requires it prominently.
6. **Alarm shelving & suppression** — Standard in every enterprise SCADA.
7. **Alarm escalation rules** — Time-based, tier-based escalation.
8. **SMS / Slack / Teams notification delivery** — Schema channels exist; just need provider integrations.
9. **Custom dashboard builder** — Drag-and-drop widgets; major UX gap.
10. **Light mode + configurable themes** — Required for white-label multi-tenancy.

### Tier 3 — Advanced (differentiators)
11. **LLM integration** — Natural language queries, AI-generated report narratives, chat assistant.
12. **Power quality telemetry** — Voltage, current, PF, THD; needed for grid-connected sites.
13. **Battery / BESS monitoring** — Growing requirement for solar+storage.
14. **Report designer** — Interactive drag-and-drop; Excel/Word/PPT export.
15. **OAuth2 / SAML / Entra ID** — Required for enterprise SSO.
16. **IEC 60870-5-104 / DNP3** — Required for utility-scale / grid-connected deployments.
