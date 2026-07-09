---
name: SSE stream testing with supertest
description: How to read the first event from an SSE/text-event-stream endpoint in vitest+supertest without leaking timers or hanging the test suite.
---

## Pattern

Use supertest's `.parse(fn)` to intercept the raw `http.IncomingMessage`, accumulate chunks until a complete `event: telemetry\ndata: ...` line is found, then call `res.destroy()` to close the connection. The route must have a `req.on("close", ...)` handler that calls `clearInterval` — that cleanup fires automatically when the socket is destroyed.

```typescript
function readFirstFleetEvent(req: SupertestTest): Promise<FleetStreamPayload> {
  return new Promise<FleetStreamPayload>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SSE timeout")), 2000);

    req
      .parse((res, done) => {
        let finished = false;
        const once = (err: Error | null, body: unknown) => {
          if (!finished) { finished = true; clearTimeout(timeout); done(err, body); }
        };
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
          const match = /^event: telemetry\ndata: (.+)$/m.exec(buf);
          if (match) {
            res.destroy();
            try { once(null, JSON.parse(match[1]!)); } catch (e) { once(e as Error, null); }
          }
        });
        res.on("error", (e: Error) => {
          if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") once(e, null);
        });
        res.on("end", () => once(new Error("stream ended before event"), null));
      })
      .then((res) => resolve(res.body as FleetStreamPayload))
      .catch((e: Error) => {
        if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") reject(e);
      });
  });
}
```

**Why:** ECONNRESET fires on both the response stream and the superagent promise after `res.destroy()`. Both must be swallowed; only non-reset errors are real failures. The `once` guard prevents `done` from being called twice.

**How to apply:** Any test that needs to assert on SSE payload without waiting for the stream to close. Works because the Solar SCADA stream calls `pushFleet()` / `pushPlant()` synchronously before setting any intervals, so the first event is always immediately available.

## Vitest mock caveat for SSE routes

`vi.mock("@workspace/db")` must export every table the route imports (including `notificationConfigsTable`) or vitest throws a fatal "No export is defined" error at module load time — even if the route never hits that code path in the test.

## isSuperAdmin: false is safer in tests

Using `isSuperAdmin: true` on the mock user causes `resolveOrgId` to return `null` (no org filter). For fault-inject POST routes this then requires `PLANT_ORG_MAP[plant.id]` to be truthy — which should work for demo plants, but proved fragile in practice. Prefer `isSuperAdmin: false` + `permissions: ["plant.manage", ...]` in `fakeUser` so `resolveOrgId` returns the real `orgId` from `req.user` and the org check is trivially satisfied.
