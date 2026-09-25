import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { env } from "../config/env";
import { signS3, sniffType, stripJpegMetadata } from "./files";

export { sniffType, stripJpegMetadata } from "./files";
const hashHex = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");

/**
 * File storage for receipts, product photos and backups.
 * - Local disk (default): files live in STORAGE_DIR. Use on a VPS / your own server.
 * - S3-compatible (Cloudflare R2, AWS S3, DigitalOcean Spaces): set S3_* variables. Required on Vercel.
 * Files are never served directly; they go through /api/files, which checks permissions.
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private p(key: string) { return path.join(this.root, safeKey(key)); }
  async put(key: string, data: Buffer) {
    const file = this.p(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }
  async get(key: string) {
    try { return await fs.readFile(this.p(key)); } catch { return null; }
  }
  async delete(key: string) {
    try { await fs.unlink(this.p(key)); } catch { /* already gone */ }
  }
  async list(prefix: string) {
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries: import("node:fs").Dirent[] = [];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else out.push(path.relative(this.root, full).split(path.sep).join("/"));
      }
    };
    await walk(path.join(this.root, safeKey(prefix.replace(/\/$/, "")) ));
    return out;
  }
}

// ---- Minimal S3 client (AWS Signature V4, see files.ts), no SDK needed ----
class S3Storage implements Storage {
  constructor(private cfg: { endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string }) {}
  private async req(method: string, key: string, body?: Buffer, contentType?: string, query = "") {
    const url = new URL(this.cfg.endpoint);
    const p = `/${this.cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const payloadHash = hashHex(body ?? "");
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const extra: Record<string, string> = contentType ? { "content-type": contentType } : {};
    const s = signS3({ method, host: url.host, path: p, query, region: this.cfg.region, accessKey: this.cfg.accessKey, secretKey: this.cfg.secretKey, payloadHash, amzDate, extraHeaders: extra });
    const res = await fetch(`${url.origin}${p}${query ? "?" + query : ""}`, {
      method, body: body ? new Uint8Array(body) : undefined,
      headers: { ...s.headers, authorization: s.authorization },
    });
    return res;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const r = await this.req("PUT", safeKey(key), data, contentType);
    if (!r.ok) throw new Error(`Storage upload failed (${r.status})`);
  }
  async get(key: string) {
    const r = await this.req("GET", safeKey(key));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Storage read failed (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  async delete(key: string) {
    await this.req("DELETE", safeKey(key));
  }
  async list(prefix: string) {
    // ListObjectsV2 on the bucket root
    const url = new URL(this.cfg.endpoint);
    const p = `/${this.cfg.bucket}`;
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const params = new URLSearchParams({ "list-type": "2", prefix, ...(token ? { "continuation-token": token } : {}) });
      const query = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const payloadHash = hashHex("");
      const s = signS3({ method: "GET", host: url.host, path: p, query, region: this.cfg.region, accessKey: this.cfg.accessKey, secretKey: this.cfg.secretKey, payloadHash, amzDate });
      const r = await fetch(`${url.origin}${p}?${query}`, { headers: { ...s.headers, authorization: s.authorization } });
      const xml = await r.text();
      for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
      const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
      token = next ? next[1] : undefined;
    } while (token);
    return keys;
  }
}

let instance: Storage | null = null;
export function storage(): Storage {
  if (instance) return instance;
  const e = env();
  if (e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY) {
    instance = new S3Storage({ endpoint: e.S3_ENDPOINT, region: e.S3_REGION, bucket: e.S3_BUCKET, accessKey: e.S3_ACCESS_KEY_ID, secretKey: e.S3_SECRET_ACCESS_KEY });
  } else if (process.env.VERCEL) {
    // Vercel has no lasting disk: files saved locally would vanish. Fail loudly instead.
    throw new Error("File storage isn't set up. On Vercel, set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (e.g. Cloudflare R2).");
  } else {
    instance = new LocalStorage(path.resolve(e.STORAGE_DIR));
  }
  return instance;
}

// ---------- Upload validation ----------
// 4 MB: Vercel rejects request bodies over 4.5 MB, so anything bigger would fail with a confusing error.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function readUpload(file: File | null, opts: { allowPdf: boolean }) {
  if (!file || file.size === 0) return { error: "Choose a file to upload." } as const;
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is over 4 MB. Please choose a smaller photo." } as const;
  let buf: Buffer = Buffer.from(await file.arrayBuffer());
  const t = sniffType(buf);
  if (!t || (!opts.allowPdf && t.mime === "application/pdf")) {
    return { error: opts.allowPdf ? "Upload a JPG, PNG, WebP or PDF file." : "Upload a JPG, PNG or WebP image." } as const;
  }
  if (t.mime === "image/jpeg") buf = stripJpegMetadata(buf);
  return { buf, ...t } as const;
}
