import { db, type Tx } from "@/shared/lib/db";
import type { Prisma } from "@prisma/client";

export type AuditActor = { id?: string | null; name: string; role: string; ip?: string };

/** Append an entry to the audit log. Entries can never be edited or deleted (database trigger). */
export async function audit(actor: AuditActor, action: string, entity: string, entityId?: string | null, details?: Prisma.InputJsonValue, tx: Tx = db) {
  await tx.auditLog.create({
    data: { actorId: actor.id ?? null, actorName: actor.name, actorRole: actor.role, action, entity, entityId: entityId ?? null, details, ip: actor.ip },
  });
}

export type AuditFilter = { q?: string; who?: string; action?: string; entity?: string; from?: Date; to?: Date };

export function auditWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const q = f.q?.trim();
  const and: Prisma.AuditLogWhereInput[] = [];
  if (q) and.push({ OR: [{ actorName: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }, { entity: { contains: q, mode: "insensitive" } }] });
  if (f.who?.trim()) and.push({ actorName: { contains: f.who.trim(), mode: "insensitive" } });
  if (f.action?.trim()) and.push({ action: { contains: f.action.trim(), mode: "insensitive" } });
  if (f.entity?.trim()) and.push({ entity: { equals: f.entity.trim(), mode: "insensitive" } });
  if (f.from) and.push({ createdAt: { gte: f.from } });
  if (f.to) and.push({ createdAt: { lt: f.to } });
  return and.length ? { AND: and } : {};
}

export async function listAudit(opts: AuditFilter & { take?: number; skip?: number }) {
  const where = auditWhere(opts);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.take ?? 50, skip: opts.skip ?? 0 }),
    db.auditLog.count({ where }),
  ]);
  return { rows, total };
}
