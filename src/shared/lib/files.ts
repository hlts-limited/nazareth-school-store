import { createHash, createHmac } from "node:crypto";

// Pure helpers for files (no app dependencies, so they can be unit-tested)

/** Detect the real file type from its first bytes (don't trust the browser's claim). */
export function sniffType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.subarray(0, 5).toString() === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

/** Remove EXIF/metadata segments (which can include GPS location) from a JPEG. */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return buf;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // start of scan: rest is image data
    const len = buf.readUInt16BE(i + 2);
    const isAppMeta = marker === 0xe1 || marker === 0xed || (marker >= 0xe2 && marker <= 0xef && marker !== 0xee);
    if (!isAppMeta) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return buf;
}


// ---- AWS Signature V4 for S3-compatible storage ----
const hashHex = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const hmacBuf = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();

export function signS3(opts: {
  method: string; host: string; path: string; query?: string; region: string; accessKey: string; secretKey: string;
  payloadHash: string; amzDate: string; extraHeaders?: Record<string, string>;
}) {
  const date = opts.amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: opts.host, "x-amz-content-sha256": opts.payloadHash, "x-amz-date": opts.amzDate, ...(opts.extraHeaders ?? {}) };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === n)!]).trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [opts.method, opts.path, opts.query ?? "", canonicalHeaders, signedHeaders, opts.payloadHash].join("\n");
  const scope = `${date}/${opts.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", opts.amzDate, scope, hashHex(canonicalRequest)].join("\n");
  const kDate = hmacBuf("AWS4" + opts.secretKey, date);
  const kSigning = hmacBuf(hmacBuf(hmacBuf(kDate, opts.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return {
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    headers,
  };
}

