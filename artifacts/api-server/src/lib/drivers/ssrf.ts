/**
 * Lightweight SSRF guard for outbound driver connection targets.
 *
 * SCADA devices legitimately live on RFC 1918 private networks, so we do NOT
 * block 10.x, 172.16–31.x, or 192.168.x.  We only block:
 *   • loopback      (127.x / ::1)
 *   • link-local    (169.254.x — blocks AWS/GCP metadata on 169.254.169.254)
 *   • unspecified   (0.0.0.0 / ::)
 *
 * Hostname lookups are deferred to the OS (DNS-rebind prevention is out of scope
 * for this tier of protection).
 */

import { logger } from "../logger.js";

const BLOCKED_PREFIXES = [
  "127.",
  "169.254.",
  "0.0.0.0",
  "::1",
  "::",
  "localhost",
];

export class SsrfBlockedError extends Error {
  constructor(target: string) {
    super(`Connection target '${target}' is blocked by SSRF policy`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Throws SsrfBlockedError if the target (host/IP/URL) is in a blocked range.
 * Call before opening any driver-initiated outbound connection.
 */
export function assertNotSsrfTarget(target: string | null | undefined): void {
  if (!target) return;

  // Normalise: strip protocol prefix so we can check the raw host
  let host = target.trim().toLowerCase();
  try {
    const parsed = new URL(host.includes("://") ? host : `tcp://${host}`);
    host = parsed.hostname;
  } catch {
    // leave as-is; best-effort check on the raw string
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (host === prefix || host.startsWith(prefix)) {
      // Log only the sanitized hostname — never the raw target which may contain
      // credentials in userinfo or tokenized query parameters.
      logger.warn({ resolvedHost: host }, "SSRF policy blocked outbound connection attempt");
      throw new SsrfBlockedError(target);
    }
  }
}
