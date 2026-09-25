import { db, type Tx } from "@/shared/lib/db";
import type { Prisma } from "@prisma/client";

export type AuditActor = { id?: string | null; name: string; role: string; ip?: string };

/** Append an entry to the audit log. Entries can never be edited or deleted (database trigger). */
export async function audit(actor: AuditActor, action: string, entity: string, entityId?: string | null, details?: Prisma.InputJsonValue, tx: Tx = db) {
  await tx.auditLog.create({
    data: { actorId: actor.id ?? null, actorName: actor.name, actorRole: actor.role, action, entity, entityId: entityId ?? null, details, ip: actor.ip },
  });
}

export async function listAudit(opts: { q?: string; take?: number; skip?: number }) {
  const q = opts.q?.trim();
  const where: Prisma.AuditLogWhereInput = q
    ? { OR: [{ actorName: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }, { entity: { contains: q, mode: "insensitive" } }] }
    : {};
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.take ?? 50, skip: opts.skip ?? 0 }),
    db.auditLog.count({ where }),
  ]);
  return { rows, total };
}
