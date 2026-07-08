---
name: cookie-parser signed cookies
description: res.cookie() requires explicit signed:true option; omitting it stores plain JSON and req.signedCookies silently returns false.
---

## Rule
When using `cookie-parser` for signed session cookies, always pass `{ signed: true }` explicitly in `res.cookie()` options. Without it, the cookie is stored as plain text (no `s:` HMAC prefix) and `req.signedCookies['name']` returns `false` even when the cookie is present.

**Why:** `cookie-parser` distinguishes signed from unsigned cookies by the `s:` prefix. `res.cookie(name, value, { signed: true })` stores `s:<hmac>.<value>`; omitting `signed` stores `<value>` verbatim. `req.signedCookies` only processes entries with the `s:` prefix.

**How to apply:** Check `sessionCookieOptions()` helper whenever auth cookies are not being recognized — missing `signed: true` is the most common cause of phantom 401s after a correct login.
