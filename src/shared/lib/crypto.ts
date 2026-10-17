import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export function hmac(secret: string, data: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Random 4-digit code (1000–9999) */
export const randomCode4 = () => String(1000 + (randomBytes(2).readUInt16BE(0) % 9000));

// ---------- Password-based file encryption (backups) ----------
// Format: "NZBK1" | salt(16) | iv(12) | tag(16) | ciphertext   — AES-256-GCM, key = scrypt(password, salt)
const MAGIC = Buffer.from("NZBK1");

export function encryptWithPassword(plain: Buffer, password: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), enc]);
}

export function decryptWithPassword(data: Buffer, password: string): Buffer {
  if (data.length < 50 || !data.subarray(0, 5).equals(MAGIC)) throw new Error("This is not a Nazareth School Store backup file.");
  const salt = data.subarray(5, 21);
  const iv = data.subarray(21, 33);
  const tag = data.subarray(33, 49);
  const key = scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data.subarray(49)), decipher.final()]);
  } catch {
    throw new Error("Wrong backup password, or the file is damaged.");
  }
}

// ---------- Field encryption (staff bank details) ----------
// Format: "v1." + base64url(iv(12) | tag(16) | ciphertext) — AES-256-GCM with a key from DATA_ENCRYPTION_KEY.

function fieldKey() {
  const e = env();
  const secret = e.DATA_ENCRYPTION_KEY ?? e.SESSION_SECRET;
  return Buffer.from(hkdfSync("sha256", secret, "nazareth-field-encryption", "v1", 32));
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function decryptField(value: string): string {
  if (!value.startsWith("v1.")) throw new Error("Unknown encrypted field format");
  const buf = Buffer.from(value.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
