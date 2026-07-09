---
name: Modbus TCP driver reconnect guard
description: socket.destroy() inside _handleDisconnect triggers a "close" event which re-enters _handleDisconnect, scheduling duplicate reconnect timers.
---

In `ModbusTcpDriver._handleDisconnect()`, calling `socket.destroy()` fires the `"close"` event synchronously (or on the next tick). If the `"close"` handler calls `_handleDisconnect()` again (guarded only by `!this._stopped`), two `setTimeout` reconnect calls are scheduled — causing reconnect storms under sustained failures.

**Fix pattern:** Add a `_reconnecting` boolean flag. Set it `true` at the start of `_handleDisconnect`, check `if (this._reconnecting) return;` as the first line, and reset it to `false` inside the `setTimeout` callback before re-calling `_connect()`.

Also call `socket.removeAllListeners()` before `socket.destroy()` inside `_handleDisconnect` so no further event callbacks fire on the destroyed socket.

**How to apply:** Any driver that uses Node.js `net.Socket` with `"close"` event-triggered reconnect needs this guard.
