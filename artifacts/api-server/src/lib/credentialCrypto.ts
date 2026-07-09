/**
 * AES-256-GCM symmetric encryption for sensitive credential fields
 * (FTP passwords, SFTP keys, etc.).
 *
 * Key is derived from SESSION_SECRET using scryptSync so even if the DB is
 * dumped the ciphertext is unreadable without the server's secret.
 *
 * Stored format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALG    = "aes-256-gcm" as const;
const SALT   = "solar-scada-creds-v1"; // static salt — uniqueness comes from random IV per encrypt
const KEY_LEN = 32;

function deriveKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — cannot derive credential encryption key");
  }
  return scryptSync(secret, SALT, KEY_LEN);
}

let _cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!_cachedKey) _cachedKey = deriveKey();
  return _cachedKey;
}

/**
 * Encrypt a plaintext credential. Returns a "<iv>:<tag>:<ct>" string safe
 * to store in a text column.
 */
export function encryptCredential(plaintext: string): string {
  const key  = getKey();
  const iv   = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALG, key, iv);
  const ct   = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/**
 * Decrypt a credential previously encrypted by encryptCredential.
 * Returns null if the input is not in the expected format (e.g. a legacy
 * plaintext value stored before encryption was added).
 */
export function decryptCredential(stored: string): string {
  // Detect legacy plaintext (no colons in expected positions)
  const parts = stored.split(":");
  if (parts.length < 3) {
    // Legacy — return as-is; credentials will be re-encrypted on next save
    return stored;
  }
  try {
    const key     = getKey();
    const iv      = Buffer.from(parts[0]!, "hex");
    const tag     = Buffer.from(parts[1]!, "hex");
    const ct      = Buffer.from(parts.slice(2).join(":"), "hex");
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct).toString("utf8") + decipher.final("utf8");
  } catch {
    // Corrupt or tampered — return empty string (connection will fail safely)
    return "";
  }
}
