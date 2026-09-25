import JSZip from "jszip";
import type { BackupKind } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { decryptWithPassword, encryptWithPassword, randomToken, sha256 } from "@/shared/lib/crypto";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";

const APP_ID = "nazareth-school-store";
const FORMAT_VERSION = 1;

/** Tables in the order they must be inserted (parents before children). Sessions and login attempts are not backed up. */
const TABLES = [
  ["setting", "Setting"], ["role", "Role"], ["class", "Class"], ["user", "User"], ["userRole", "UserRole"],
  ["pupil", "Pupil"], ["guardian", "Guardian"], ["category", "Category"], ["item", "Item"], ["itemClass", "ItemClass"], ["itemVariant", "ItemVariant"],
  ["order", "Order"], ["orderLine", "OrderLine"], ["orderEvent", "OrderEvent"], ["payment", "Payment"], ["receipt", "Receipt"], ["invoice", "Invoice"], ["pickup", "Pickup"],
  ["wallet", "Wallet"], ["walletTransaction", "WalletTransaction"], ["stockMovement", "StockMovement"], ["cartItem", "CartItem"], ["wishlistItem", "WishlistItem"],
  ["notification", "Notification"], ["auditLog", "AuditLog"],
] as const;
const FILE_PREFIXES = ["receipts/", "items/"];

type Delegate = { findMany: (a?: unknown) => Promise<Record<string, unknown>[]>; createMany: (a: { data: unknown[] }) => Promise<unknown> };
const delegate = (client: unknown, name: string) => (client as Record<string, Delegate>)[name];

type Manifest = { app: string; format: number; createdAt: string; createdBy: string; counts: Record<string, number>; files: number };

function stamp(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}-${g("hour")}${g("minute")}`;
}

export async function createBackup(kind: BackupKind, by: { id?: string; name: string }) {
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  for (const [model, table] of TABLES) {
    let rows = await delegate(db, model).findMany();
    if (model === "category") rows = sortCategories(rows);
    counts[table] = rows.length;
    zip.file(`data/${table}.json`, JSON.stringify(rows));
  }
  let files = 0;
  for (const prefix of FILE_PREFIXES) {
    for (const key of await storage().list(prefix)) {
      const buf = await storage().get(key);
      if (buf) { zip.file(`files/${key}`, buf); files++; }
    }
  }
  const manifest: Manifest = { app: APP_ID, format: FORMAT_VERSION, createdAt: new Date().toISOString(), createdBy: by.name, counts, files };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const plain = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const enc = encryptWithPassword(plain, env().BACKUP_PASSWORD);
  const fileName = `nazareth-backup-${stamp()}${kind === "SAFETY" ? "-before-restore" : ""}.nzbak`;
  const fileKey = `backups/${fileName}`;
  await storage().put(fileKey, enc, "application/octet-stream");
  return db.backup.create({ data: { fileName, fileKey, size: enc.length, checksum: sha256(enc), kind, createdById: by.id ?? null, createdBy: by.name, counts: { ...counts, files } } });
}

function sortCategories(rows: Record<string, unknown>[]) {
  const out: Record<string, unknown>[] = [];
  const done = new Set<string>();
  let guard = 0;
  while (out.length < rows.length && guard++ < 50) {
    for (const r of rows) if (!done.has(r.id as string) && (!r.parentId || done.has(r.parentId as string))) { out.push(r); done.add(r.id as string); }
  }
  return out;
}

export const listBackups = () => db.backup.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

export async function readBackupFile(id: string) {
  const b = await db.backup.findUnique({ where: { id } });
  if (!b) return null;
  const buf = await storage().get(b.fileKey);
  return buf ? { backup: b, buf } : null;
}

async function openArchive(buf: Buffer, password: string) {
  const plain = decryptWithPassword(buf, password);
  const zip = await JSZip.loadAsync(plain);
  const mf = zip.file("manifest.json");
  if (!mf) throw new UserError("This backup is missing its manifest.");
  const manifest = JSON.parse(await mf.async("string")) as Manifest;
  if (manifest.app !== APP_ID) throw new UserError("This backup is from a different app.");
  if (manifest.format > FORMAT_VERSION) throw new UserError("This backup was made by a newer version of the app. Update the app first.");
  return { zip, manifest };
}

/** Step 1 of restore: check the uploaded file and show what's inside. Nothing changes yet. */
export async function stageRestore(buf: Buffer, password: string) {
  const { manifest } = await openArchive(buf, password);
  // Re-encrypt the staged copy with this server's backup password, so step 2 doesn't need the uploaded file's password again
  const plain = decryptWithPassword(buf, password);
  const token = randomToken(16);
  await storage().put(`tmp/restore-${token}.nzbak`, encryptWithPassword(plain, env().BACKUP_PASSWORD), "application/octet-stream");
  return { token, manifest };
}

export async function stageExisting(backupId: string) {
  const f = await readBackupFile(backupId);
  if (!f) throw new UserError("Backup file not found.");
  const { manifest } = await openArchive(f.buf, env().BACKUP_PASSWORD);
  const token = randomToken(16);
  await storage().put(`tmp/restore-${token}.nzbak`, f.buf, "application/octet-stream");
  return { token, manifest };
}

/** Step 2: take a safety backup, then replace all data with the backup's contents. Everyone is signed out. */
export async function runRestore(token: string, by: { id: string; name: string }) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new UserError("Invalid restore request.");
  const key = `tmp/restore-${token}.nzbak`;
  const buf = await storage().get(key);
  if (!buf) throw new UserError("The uploaded backup has expired. Upload it again.");
  const { zip, manifest } = await openArchive(buf, env().BACKUP_PASSWORD);

  await createBackup("SAFETY", by);

  const data: Record<string, unknown[]> = {};
  for (const [, table] of TABLES) {
    const f = zip.file(`data/${table}.json`);
    data[table] = f ? JSON.parse(await f.async("string")) : [];
  }

  await db.$transaction(async (tx) => {
    const all = [...TABLES.map(([, t]) => `"${t}"`), `"Session"`, `"ViewAsSession"`, `"LoginAttempt"`].join(", ");
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${all} CASCADE`);
    for (const [model, table] of TABLES) {
      const rows = data[table];
      for (let i = 0; i < rows.length; i += 1000) await delegate(tx, model).createMany({ data: rows.slice(i, i + 1000) });
    }
    await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"', 'number'), GREATEST(COALESCE((SELECT MAX("number") FROM "Order"), 0), 1), (SELECT COUNT(*) > 0 FROM "Order"))`);
  }, { timeout: 10 * 60_000, maxWait: 15_000 });

  for (const f of Object.values(zip.files)) {
    if (f.dir || !f.name.startsWith("files/")) continue;
    await storage().put(f.name.slice(6), await f.async("nodebuffer"), "application/octet-stream");
  }
  await storage().delete(key);
  return manifest;
}

/** Keep 30 daily automatic backups + one per month for 12 months + the last 10 safety backups. */
export async function applyRetention() {
  const all = await db.backup.findMany({ orderBy: { createdAt: "desc" } });
  const keep = new Set<string>();
  const auto = all.filter((b) => b.kind === "AUTOMATIC");
  auto.slice(0, 30).forEach((b) => keep.add(b.id));
  const months = new Set<string>();
  for (const b of auto) { const m = b.createdAt.toISOString().slice(0, 7); if (!months.has(m) && months.size < 12) { months.add(m); keep.add(b.id); } }
  all.filter((b) => b.kind === "SAFETY").slice(0, 10).forEach((b) => keep.add(b.id));
  all.filter((b) => b.kind === "MANUAL").forEach((b) => keep.add(b.id));
  let removed = 0;
  for (const b of all) if (!keep.has(b.id)) { await storage().delete(b.fileKey); await db.backup.delete({ where: { id: b.id } }); removed++; }
  return removed;
}
