---
name: OPC-UA driver decisions
description: Scope and security decisions made when building the OPC-UA protocol driver; consult before extending it.
---

- **Push subscriptions dropped from scope, polling-only shipped.** node-opcua v2.174.0's `ClientSubscription`/`ClientMonitoredItem` API couldn't be confidently verified via static/introspection-only review — no live OPC-UA server was available to test the subscription lifecycle end-to-end. Rather than ship unverified runtime behavior for a protocol driver, kept the existing polling approach. Follow-up task tracks adding real subscription support once it can be tested against an actual server (e.g. node-opcua's own demo server).
- **Security mode**: `opcuaSecurityMode` ("None"/"Sign"/"SignAndEncrypt") maps None→`SecurityPolicy.None`, Sign/SignAndEncrypt→`SecurityPolicy.Basic256Sha256`, relying on node-opcua's auto-generated client certificate. No user-supplied certificate management — cert-based security is explicitly out of scope.
- **Connection test**: reads the standard NodeId `ns=0;i=2255` (Server.NamespaceArray) as a universal liveness/sanity check, since it exists on every spec-compliant OPC-UA server — avoids needing vendor-specific namespace knowledge for a generic "does this server respond" check.
- **Credentials**: `opcuaPassword` follows the same encrypted-at-rest pattern as `httpAuthValue` (see connect-source-auth memory) — decrypt just-in-time in registry/launch and connection-test; API responses only ever expose `opcuaPasswordConfigured: boolean`, never the value.
