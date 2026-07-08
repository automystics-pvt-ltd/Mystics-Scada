/**
 * SSRF protection for tenant-configurable webhook URLs.
 *
 * Rules enforced both at save-time (fast structural checks) and at
 * send-time (DNS-resolve + re-check resolved IP, defence against DNS rebinding):
 *
 *  - Protocol must be https (or http when ALLOW_HTTP_WEBHOOKS=true in dev)
 *  - Hostname must not be a bare IP in a private/loopback/link-local range
 *  - Hostname must not be "localhost" or end in .local / .internal / .lan / .corp / .home
 *  - After DNS resolution the resolved IP is checked against the same ranges
 *    (DNS rebinding defence: a hostname could resolve to a public IP at config
 *    time but 127.0.0.1 at delivery time)
 */

import dns from "node:dns";

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`Webhook URL blocked: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

// ── Private / special-use IP ranges ─────────────────────────────────────────

/** IPv4 CIDR ranges that are never valid webhook targets. */
const BLOCKED_IPV4_RANGES: Array<{ base: number; mask: number; label: string }> = [
  { base: ipToInt("127.0.0.0"), mask: cidrMask(8),  label: "loopback" },
  { base: ipToInt("10.0.0.0"),  mask: cidrMask(8),  label: "RFC1918" },
  { base: ipToInt("172.16.0.0"), mask: cidrMask(12), label: "RFC1918" },
  { base: ipToInt("192.168.0.0"), mask: cidrMask(16), label: "RFC1918" },
  { base: ipToInt("169.254.0.0"), mask: cidrMask(16), label: "link-local" },
  { base: ipToInt("100.64.0.0"), mask: cidrMask(10), label: "shared-address-space" },
  { base: ipToInt("0.0.0.0"),   mask: cidrMask(8),  label: "unspecified" },
  { base: ipToInt("192.0.2.0"), mask: cidrMask(24), label: "documentation" },
  { base: ipToInt("198.51.100.0"), mask: cidrMask(24), label: "documentation" },
  { base: ipToInt("203.0.113.0"), mask: cidrMask(24), label: "documentation" },
  { base: ipToInt("240.0.0.0"), mask: cidrMask(4),  label: "reserved" },
  { base: ipToInt("255.255.255.255"), mask: 0xffffffff, label: "broadcast" },
];

/** IPv6 prefix strings whose hex-start blocks the address. */
const BLOCKED_IPV6_PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: "::1",         label: "loopback" },
  { prefix: "::ffff:",     label: "IPv4-mapped" },   // covers all mapped IPv4s inc. private
  { prefix: "fe80",        label: "link-local" },
  { prefix: "fc",          label: "unique-local" },
  { prefix: "fd",          label: "unique-local" },
  { prefix: "2001:db8",    label: "documentation" },
  { prefix: "::",          label: "unspecified" },    // must be last (shortest prefix)
];

/** Internal hostname suffixes that must never be webhook targets. */
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".lan", ".corp", ".home", ".localdomain"];

/** Bare hostnames that are always blocked regardless of DNS. */
const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

// ── Structural validation (no network I/O) ───────────────────────────────────

/**
 * Validates URL structure without DNS resolution.
 * Safe to call at config-save time.
 * Throws SsrfBlockedError on any violation.
 */
export function validateWebhookUrlStructure(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("URL is not valid");
  }

  const proto = parsed.protocol;
  const allowHttp =
    process.env["NODE_ENV"] === "development" &&
    process.env["ALLOW_HTTP_WEBHOOKS"] === "true";

  if (proto !== "https:" && !(allowHttp && proto === "http:")) {
    throw new SsrfBlockedError(`protocol "${proto}" is not allowed (only https)`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Bare blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfBlockedError(`hostname "${hostname}" is blocked`);
  }

  // Blocked suffixes
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) {
      throw new SsrfBlockedError(`hostname "${hostname}" matches blocked suffix "${suffix}"`);
    }
  }

  // Reject bare IPv4 addresses in blocked ranges
  if (isIPv4(hostname)) {
    assertIpv4Safe(hostname);
    return parsed; // raw public IPv4 is structurally fine (DNS step will re-verify)
  }

  // Reject bare IPv6 addresses
  const rawIpv6 = stripIpv6Brackets(hostname);
  if (rawIpv6) {
    assertIpv6Safe(rawIpv6);
  }

  return parsed;
}

/**
 * Resolves the URL's hostname via DNS and verifies the resolved IP is not in a
 * blocked range.  Throws SsrfBlockedError if the resolved address is private.
 * Call this immediately before issuing the HTTP request (DNS rebinding defence).
 */
export async function validateWebhookUrlDns(parsed: URL): Promise<void> {
  const hostname = parsed.hostname.toLowerCase();

  // If already a bare IP, structural check is sufficient — nothing to resolve
  if (isIPv4(hostname) || stripIpv6Brackets(hostname)) return;

  let address: string;
  try {
    const result = await dns.promises.lookup(hostname, { verbatim: true });
    address = result.address;
  } catch (err) {
    throw new SsrfBlockedError(`DNS lookup failed for "${hostname}": ${String(err)}`);
  }

  if (isIPv4(address)) {
    assertIpv4Safe(address);
  } else {
    assertIpv6Safe(address);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function cidrMask(bits: number): number {
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
}

function isIPv4(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

function stripIpv6Brackets(s: string): string | null {
  // hostname from URL is already without brackets in most cases, but handle both
  const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
  return inner.includes(":") ? inner : null;
}

function assertIpv4Safe(ip: string): void {
  const n = ipToInt(ip);
  for (const { base, mask, label } of BLOCKED_IPV4_RANGES) {
    if ((n & mask) === (base & mask)) {
      throw new SsrfBlockedError(`IP ${ip} is in blocked range (${label})`);
    }
  }
}

function assertIpv6Safe(addr: string): void {
  const lower = addr.toLowerCase();
  // "::1" and "::" exact matches
  if (lower === "::1" || lower === "::") {
    throw new SsrfBlockedError(`IPv6 address "${addr}" is blocked (loopback/unspecified)`);
  }
  for (const { prefix, label } of BLOCKED_IPV6_PREFIXES) {
    if (lower.startsWith(prefix)) {
      throw new SsrfBlockedError(`IPv6 address "${addr}" is in blocked range (${label})`);
    }
  }
}
