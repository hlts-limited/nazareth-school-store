import { Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { env } from "@/shared/config/env";

// ---------- Table metadata (from the Prisma schema) ----------

export type FieldInfo = {
  name: string; type: string; kind: "scalar" | "enum"; isList: boolean; isRequired: boolean;
  isId: boolean; hasDefault: boolean; isUpdatedAt: boolean; enumValues?: string[];
};
export type ModelInfo = { name: string; delegate: string; pk: string[]; fields: FieldInfo[]; readOnly?: string };

/** Never shown or edited in the explorer (and masked in SQL results). Use "Set password" instead. */
export const SECRET_FIELDS = new Set(["passwordHash", "totpSecret", "inviteToken", "accessTokenHash"]);

/** Tables that can be read but not changed here, and why. */
const READ_ONLY: Record<string, string> = {
  AuditLog: "The audit log is append-only. Nobody can change or delete entries, the Alpha Admin included.",
  Backup: "Backups are created and removed by the backup system. Use Backups & restores.",
  Session: "Sessions can only be ended (sign out). Use \"Sign out everywhere\" on a user.",
};

const ENUMS = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));

export const MODELS: ModelInfo[] = Prisma.dmmf.datamodel.models.map((m) => {
  const fields: FieldInfo[] = m.fields
    .filter((f) => f.kind === "scalar" || f.kind === "enum")
    .map((f) => ({
      name: f.name, type: f.type, kind: f.kind as "scalar" | "enum", isList: f.isList, isRequired: f.isRequired, isId: f.isId,
      hasDefault: f.hasDefaultValue, isUpdatedAt: !!f.isUpdatedAt, enumValues: f.kind === "enum" ? ENUMS.get(f.type) : undefined,
    }));
  const pk = m.primaryKey?.fields?.length ? [...m.primaryKey.fields] : fields.filter((f) => f.isId).map((f) => f.name);
  return { name: m.name, delegate: m.name[0].toLowerCase() + m.name.slice(1), pk, fields, readOnly: READ_ONLY[m.name] };
}).sort((a, b) => a.name.localeCompare(b.name));

export function modelInfo(name: string) {
  const m = MODELS.find((x) => x.name === name);
  if (!m) throw new UserError("Unknown table.");
  return m;
}

type Delegate = {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>; findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  count: (a?: unknown) => Promise<number>; create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>; delete: (a: unknown) => Promise<Record<string, unknown>>;
};
const delegate = (m: ModelInfo) => (db as unknown as Record<string, Delegate>)[m.delegate];

// ---------- Row keys (single or composite primary keys) ----------

export const rowKey = (m: ModelInfo, row: Record<string, unknown>) => JSON.stringify(m.pk.map((f) => row[f]));

function whereFor(m: ModelInfo, key: string) {
  let vals: unknown[];
  try { vals = JSON.parse(key); } catch { throw new UserError("Invalid row."); }
  if (!Array.isArray(vals) || vals.length !== m.pk.length) throw new UserError("Invalid row.");
  const pkFields = m.pk.map((n) => m.fields.find((f) => f.name === n)!);
  const typed = pkFields.map((f, i) => coerce(f, String(vals[i])));
  if (m.pk.length === 1) return { [m.pk[0]]: typed[0] };
  return { [m.pk.join("_")]: Object.fromEntries(m.pk.map((n, i) => [n, typed[i]])) };
}

// ---------- Display ----------

/** A value as text for tables and forms. Secrets are masked. */
export function show(field: string, v: unknown): string {
  if (SECRET_FIELDS.has(field)) return v == null ? "" : "•••••• (hidden)";
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `<${v.length} bytes>`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ---------- Reading ----------

export const PAGE = 50;

export async function tableCounts() {
  return Promise.all(MODELS.map(async (m) => ({ name: m.name, count: await delegate(m).count(), readOnly: !!m.readOnly })));
}

export async function listRows(m: ModelInfo, opts: { q?: string; page?: number }) {
  const q = opts.q?.trim();
  const text = m.fields.filter((f) => f.kind === "scalar" && f.type === "String" && !f.isList && !SECRET_FIELDS.has(f.name));
  const where = q ? { OR: [
    ...text.map((f) => ({ [f.name]: { contains: q, mode: "insensitive" } })),
    ...m.fields.filter((f) => f.kind === "enum" && f.enumValues?.includes(q.toUpperCase())).map((f) => ({ [f.name]: q.toUpperCase() })),
  ] } : {};
  const sortField = m.fields.find((f) => f.name === "createdAt") ? "createdAt" : m.pk[0];
  const page = Math.max(1, opts.page ?? 1);
  const [rows, total] = await Promise.all([
    delegate(m).findMany({ where, orderBy: { [sortField]: sortField === "createdAt" ? "desc" : "asc" }, take: PAGE, skip: (page - 1) * PAGE }),
    delegate(m).count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

export async function getRow(m: ModelInfo, key: string) {
  return delegate(m).findUnique({ where: whereFor(m, key) });
}

// ---------- Writing ----------

/** Turn form text into the field's type. "" means null for optional fields. */
function coerce(f: FieldInfo, raw: string): unknown {
  if (raw === "" && !f.isRequired) return null;
  if (f.isList) {
    try { const a = JSON.parse(raw || "[]"); if (Array.isArray(a)) return a; } catch { /* fall through */ }
    throw new UserError(`${f.name}: enter a JSON list, e.g. ["a","b"].`, { [f.name]: "JSON list" });
  }
  if (f.kind === "enum") {
    if (!f.enumValues?.includes(raw)) throw new UserError(`${f.name}: choose one of ${f.enumValues?.join(", ")}.`, { [f.name]: "Not allowed" });
    return raw;
  }
  switch (f.type) {
    case "Int": case "Float": {
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n) || (f.type === "Int" && !Number.isInteger(n))) throw new UserError(`${f.name}: enter a ${f.type === "Int" ? "whole " : ""}number.`, { [f.name]: "Number" });
      return n;
    }
    case "BigInt": try { return BigInt(raw); } catch { throw new UserError(`${f.name}: enter a whole number.`, { [f.name]: "Number" }); }
    case "Decimal": return new Prisma.Decimal(raw);
    case "Boolean":
      if (raw !== "true" && raw !== "false") throw new UserError(`${f.name}: true or false.`, { [f.name]: "true / false" });
      return raw === "true";
    case "DateTime": {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new UserError(`${f.name}: enter a date, e.g. 2026-10-13T09:00:00Z.`, { [f.name]: "Date" });
      return d;
    }
    case "Json":
      try { return raw === "" ? Prisma.JsonNull : JSON.parse(raw); } catch { throw new UserError(`${f.name}: enter valid JSON.`, { [f.name]: "JSON" }); }
    default: return raw;
  }
}

const editable = (m: ModelInfo, creating: boolean) =>
  m.fields.filter((f) => !SECRET_FIELDS.has(f.name) && !f.isUpdatedAt && (creating || !m.pk.includes(f.name)));

export const editableFields = editable;

function assertWritable(m: ModelInfo) {
  if (m.readOnly) throw new UserError(m.readOnly);
}

/** Prisma errors in plain words */
function friendly(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") throw new UserError("Another row already has that value (it must be unique).");
    if (e.code === "P2003") throw new UserError("That points at a row that doesn't exist, or other rows still depend on this one.");
    if (e.code === "P2025") throw new UserError("That row no longer exists.");
    throw new UserError(`The database refused the change (${e.code}).`);
  }
  if (e instanceof Prisma.PrismaClientValidationError) throw new UserError("Some values are missing or the wrong type.");
  throw e;
}

/** Returns the fields that changed, as { field: [before, after] } text, for the audit log. */
export async function updateRow(m: ModelInfo, key: string, form: Record<string, string>) {
  assertWritable(m);
  const before = await getRow(m, key);
  if (!before) throw new UserError("That row no longer exists.");
  const data: Record<string, unknown> = {};
  const changes: Record<string, [string, string]> = {};
  for (const f of editable(m, false)) {
    if (!(f.name in form)) continue;
    const was = show(f.name, before[f.name]);
    if (form[f.name] === was) continue;
    data[f.name] = coerce(f, form[f.name]);
    changes[f.name] = [was, form[f.name]];
  }
  if (!Object.keys(data).length) return { changes, row: before };
  try {
    const row = await delegate(m).update({ where: whereFor(m, key), data });
    return { changes, row };
  } catch (e) { friendly(e); }
}

export async function createRow(m: ModelInfo, form: Record<string, string>) {
  assertWritable(m);
  const data: Record<string, unknown> = {};
  for (const f of editable(m, true)) {
    const raw = form[f.name] ?? "";
    if (raw === "" && (f.hasDefault || !f.isRequired)) continue;
    if (raw === "" && f.isRequired) throw new UserError(`${f.name} is required.`, { [f.name]: "Required" });
    data[f.name] = coerce(f, raw);
  }
  try { return await delegate(m).create({ data }); } catch (e) { friendly(e); }
}

export async function deleteRow(m: ModelInfo, key: string) {
  assertWritable(m);
  try { return await delegate(m).delete({ where: whereFor(m, key) }); } catch (e) { friendly(e); }
}

// ---------- Read-only SQL ----------

const READ_START = /^\s*(select|with|explain|show|table|values)\b/i;
// Functions that read server files, reach other servers, or tie up the database
const BLOCKED = /\b(pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|lo_\w+|dblink\w*|pg_sleep\w*|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|set_config|pg_advisory\w*|copy)\b/i;
export const SQL_ROW_LIMIT = 500;

/** One reading statement, inside a READ ONLY transaction with a 15-second limit. Nothing can be changed. */
export async function runReadOnlySql(sql: string) {
  const text = sql.trim().replace(/;\s*$/, "");
  if (!text) throw new UserError("Enter a query.", { sql: "Required" });
  if (text.length > 10_000) throw new UserError("That query is too long.", { sql: "Too long" });
  if (text.includes(";")) throw new UserError("Run one statement at a time (no semicolons inside the query).", { sql: "One statement" });
  if (!READ_START.test(text)) throw new UserError("Only reading queries can run here: SELECT, WITH, EXPLAIN, SHOW, TABLE or VALUES.", { sql: "Read-only" });
  if (BLOCKED.test(text)) throw new UserError("That function isn't allowed in the console.", { sql: "Not allowed" });
  const started = Date.now();
  try {
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(text);
    }, { timeout: 20_000, maxWait: 5_000 });
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const shown = rows.slice(0, SQL_ROW_LIMIT).map((r) => columns.map((c) => show(c, r[c])));
    return { columns, rows: shown, total: rows.length, ms: Date.now() - started };
  } catch (e) {
    if (e instanceof UserError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const pg = msg.match(/(?:Message|message): `?([^`\n]+)/)?.[1] ?? msg.split("\n").filter(Boolean).pop() ?? "Query failed";
    throw new UserError(`The database said: ${pg.slice(0, 300)}`, { sql: "Query failed" });
  }
}

// ---------- Overview ----------

export async function systemOverview() {
  const [size, migrations, sessions, lastBackup, backups, auditCount, counts] = await Promise.all([
    db.$queryRawUnsafe<{ size: string }[]>("SELECT pg_size_pretty(pg_database_size(current_database())) AS size"),
    db.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
      `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC`),
    db.session.count({ where: { revokedAt: null } }),
    db.backup.findFirst({ orderBy: { createdAt: "desc" } }),
    db.backup.count(),
    db.auditLog.count(),
    tableCounts(),
  ]);
  const e = env();
  const services = {
    "Card payments (Paystack)": !!e.PAYSTACK_SECRET_KEY,
    "Email (Resend)": !!e.RESEND_API_KEY,
    "SMS (Termii)": !!e.TERMII_API_KEY,
    "File storage (S3 / R2)": !!(e.S3_ENDPOINT && e.S3_BUCKET),
    "Daily job secret (CRON_SECRET)": !!e.CRON_SECRET,
  };
  return { size: size[0]?.size ?? "?", migrations, sessions, lastBackup, backups, auditCount, counts, services, appUrl: e.APP_URL };
}
