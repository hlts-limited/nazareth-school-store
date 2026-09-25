import type { Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { randomToken } from "@/shared/lib/crypto";
import { normalizePhone } from "@/shared/lib/format";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { notify } from "@/modules/notifications";
import { balances } from "@/modules/wallet";

export const PER_PAGE = 20;

export async function childrenOf(parentId: string) {
  return db.pupil.findMany({
    where: { guardians: { some: { parentId } }, status: "ACTIVE", deletedAt: null },
    include: { class: true },
    orderBy: [{ class: { sortOrder: "desc" } }, { firstName: "asc" }],
  });
}

export type PupilSearch = { q?: string; classId?: string; status?: "active" | "archived" | "all"; page?: number };

function searchWhere(s: PupilSearch): Prisma.PupilWhereInput {
  const where: Prisma.PupilWhereInput = { deletedAt: null };
  if (s.status !== "all") where.status = s.status === "archived" ? "ARCHIVED" : "ACTIVE";
  if (s.classId) where.classId = s.classId;
  const q = s.q?.trim();
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    where.AND = words.map((w) => ({
      OR: [
        { firstName: { contains: w, mode: "insensitive" } },
        { lastName: { contains: w, mode: "insensitive" } },
        { regNumber: { contains: w, mode: "insensitive" } },
      ],
    }));
  }
  return where;
}

export async function searchPupils(s: PupilSearch) {
  const where = searchWhere(s);
  const page = Math.max(1, s.page ?? 1);
  const [rows, total] = await Promise.all([
    db.pupil.findMany({
      where, include: { class: true, guardians: { include: { parent: true } } },
      orderBy: [{ class: { sortOrder: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
      take: PER_PAGE, skip: (page - 1) * PER_PAGE,
    }),
    db.pupil.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

/** ids of every pupil matching a search (for "select all matching") */
export async function searchIds(s: PupilSearch) {
  const rows = await db.pupil.findMany({ where: searchWhere(s), select: { id: true }, take: 5000 });
  return rows.map((r) => r.id);
}

export async function suggestRegNumber() {
  const year = new Date().getFullYear();
  const all = await db.pupil.findMany({ select: { regNumber: true } });
  const max = all.reduce((m, p) => Math.max(m, parseInt(p.regNumber.split("/").pop() ?? "0", 10) || 0), 0);
  return `NAZ/${year}/${String(max + 1).padStart(3, "0")}`;
}

/** The invite text parents receive, automatically or from the office's own WhatsApp. */
export function parentInviteMessage(firstName: string, token: string) {
  return `Hello ${firstName}, welcome to the ${SCHOOL.storeName}. Set your password here to buy books and uniforms for your children: ${env().APP_URL}/invite/${token} (link valid for 14 days)`;
}

/** wa.me link that opens WhatsApp with the invite typed out for this parent (the office presses Send). */
export function whatsAppInviteLink(phone: string | null, firstName: string, token: string) {
  const local = phone ? normalizePhone(phone) : null;
  if (!local) return null;
  return `https://wa.me/234${local.slice(1)}?text=${encodeURIComponent(parentInviteMessage(firstName, token))}`;
}

/** Send (or re-send) a parent's invite link: WhatsApp first (falls back to SMS), plus email if we have one. */
export async function sendParentInvite(parentId: string) {
  const token = randomToken(24);
  const p = await db.user.update({ where: { id: parentId }, data: { inviteToken: token, inviteExpiresAt: new Date(Date.now() + 14 * 86400_000) } });
  await notify(p.id, `Welcome to the ${SCHOOL.storeName}`, parentInviteMessage(p.firstName, token), ["whatsapp", "email"]);
}

export type NewPupil = {
  firstName: string; lastName: string; regNumber: string; classId: string; gender?: string;
  parentPhone: string; parentName?: string; parentEmail?: string; relationship?: string;
};

/** Add a pupil and link them to a parent (found by phone, or created and invited). */
export async function addPupil(input: NewPupil) {
  const reg = input.regNumber.trim().toUpperCase();
  const phone = normalizePhone(input.parentPhone);
  if (!phone) throw new UserError("Enter a valid Nigerian phone number, e.g. 08031234567.", { parentPhone: "Invalid phone number" });
  if (await db.pupil.findUnique({ where: { regNumber: reg } })) throw new UserError("That reg number is already used.", { regNumber: "Already used" });

  let parent = await db.user.findUnique({ where: { phone } });
  if (parent && parent.type !== "PARENT") throw new UserError("That phone number belongs to a staff account.", { parentPhone: "Belongs to staff" });
  const created = !parent;
  if (!parent) {
    const [first, ...rest] = (input.parentName?.trim() || `Parent ${input.lastName}`).split(/\s+/);
    const email = input.parentEmail?.trim().toLowerCase() || null;
    if (email && (await db.user.findUnique({ where: { email } }))) throw new UserError("That email is already used by another account.", { parentEmail: "Already used" });
    parent = await db.user.create({ data: { type: "PARENT", status: "INVITED", firstName: first, lastName: rest.join(" ") || input.lastName, phone, email } });
  }
  const pupil = await db.pupil.create({
    data: {
      firstName: input.firstName.trim(), lastName: input.lastName.trim(), regNumber: reg, classId: input.classId, gender: input.gender,
      guardians: { create: { parentId: parent.id, relationship: input.relationship ?? "Parent" } },
      wallet: { create: {} },
    },
  });
  if (created || parent.status === "INVITED") await sendParentInvite(parent.id);
  return { pupil, parent, parentCreated: created };
}

export async function moveToClass(ids: string[], classId: string) {
  const r = await db.pupil.updateMany({ where: { id: { in: ids } }, data: { classId } });
  return r.count;
}

/**
 * Delete selected pupils. Pupils with orders or a wallet balance are archived instead,
 * so financial records stay complete. Deleted pupils stay in the bin for 30 days.
 */
export async function deletePupils(ids: string[], byName: string) {
  const withOrders = await db.orderLine.findMany({ where: { pupilId: { in: ids } }, select: { pupilId: true }, distinct: ["pupilId"] });
  const bal = await balances(ids);
  const keep = new Set([...withOrders.map((o) => o.pupilId), ...ids.filter((id) => (bal[id] ?? 0) !== 0)]);
  const archiveIds = ids.filter((id) => keep.has(id));
  const deleteIds = ids.filter((id) => !keep.has(id));
  await db.$transaction([
    db.pupil.updateMany({ where: { id: { in: archiveIds } }, data: { status: "ARCHIVED" } }),
    db.pupil.updateMany({ where: { id: { in: deleteIds } }, data: { deletedAt: new Date(), deletedBy: byName } }),
    db.session.updateMany({ where: { pupilId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "Pupil removed" } }),
  ]);
  return { archived: archiveIds.length, deleted: deleteIds.length };
}

export async function restorePupil(id: string) {
  return db.pupil.update({ where: { id }, data: { deletedAt: null, deletedBy: null, status: "ACTIVE" } });
}

export const binContents = () => db.pupil.findMany({ where: { deletedAt: { not: null } }, include: { class: true }, orderBy: { deletedAt: "desc" } });

/** Permanently remove pupils in the bin (all, or only those older than `olderThanDays`). */
export async function emptyBin(olderThanDays?: number) {
  const where: Prisma.PupilWhereInput = { deletedAt: olderThanDays ? { lt: new Date(Date.now() - olderThanDays * 86400_000) } : { not: null } };
  const r = await db.pupil.deleteMany({ where });
  return r.count;
}

// ---------- Bulk import ----------
export type ImportRow = { line: number; lastName: string; firstName: string; regNumber: string; className: string; parentPhone: string; parentName: string; error?: string; classId?: string };

/** One pasted/CSV line → cells. Tab-separated (pasted from Excel) or CSV with "quoted, fields" and "" escapes. */
export function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const cells: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export async function parseImport(text: string): Promise<ImportRow[]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const hasHeader = /surname|last\s*name/i.test(lines[0]);
  const classes = await db.class.findMany();
  const existing = new Set((await db.pupil.findMany({ select: { regNumber: true } })).map((p) => p.regNumber));
  const seen = new Set<string>();
  return lines.slice(hasHeader ? 1 : 0).map((l, i) => {
    const cells = splitRow(l);
    const [lastName = "", firstName = "", reg = "", className = "", phone = "", parentName = ""] = cells;
    const regNumber = reg.toUpperCase();
    const cls = classes.find((c) => c.name.toLowerCase() === className.toLowerCase());
    let error: string | undefined;
    if (!lastName || !firstName) error = "Name missing";
    else if (!regNumber) error = "Reg number missing";
    else if (existing.has(regNumber) || seen.has(regNumber)) error = "Reg number already used";
    else if (!cls) error = `Unknown class "${className}"`;
    else if (!normalizePhone(phone)) error = "Parent phone missing or invalid";
    seen.add(regNumber);
    return { line: i + (hasHeader ? 2 : 1), lastName, firstName, regNumber, className, parentPhone: phone, parentName, error, classId: cls?.id };
  });
}

export async function commitImport(rows: ImportRow[]) {
  let added = 0;
  for (const r of rows.filter((x) => !x.error && x.classId)) {
    try {
      await addPupil({ firstName: r.firstName, lastName: r.lastName, regNumber: r.regNumber, classId: r.classId!, parentPhone: r.parentPhone, parentName: r.parentName || undefined });
      added++;
    } catch { /* row skipped; shown as not imported */ }
  }
  return added;
}
