---
name: Express static routes must precede :param routes
description: A GET /resource/some-static-path route defined after GET /resource/:id gets shadowed — Express matches path segments in registration order, not specificity.
---

Express matches routes in the order they're `router.get`/`router.post`'d, not by specificity. If `/devices/:id` is registered before `/devices/firmware-report`, a request to `/devices/firmware-report` matches `:id="firmware-report"` and never reaches the intended handler (silently returns a 404-style "not found" from the `:id` handler's own logic, which is confusing to debug since the route "exists").

**Why:** Hit this adding a fleet firmware report endpoint alongside an existing `GET /devices/:id` — the new route returned "Device not found" instead of the report, because it was appended after `:id` in the file.

**How to apply:** Always place fixed-segment sibling routes (e.g. `/resource/health-stats`, `/resource/firmware-report`) *before* any `/resource/:id` route in the same router file. When adding a new static-path GET/POST/etc. under an existing resource prefix, grep the file for `:id` routes on that prefix first and insert above them.
