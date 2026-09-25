import { db } from "@/shared/lib/db";
import { ORDER_STATUS, PAID_STATUSES } from "@/modules/orders";

export async function navCounts() {
  const [review, pack, bin] = await Promise.all([
    db.order.count({ where: { status: "AWAITING_VERIFICATION" } }),
    db.order.count({ where: { status: { in: ["PAYMENT_APPROVED", "PACKING"] } } }),
    db.pupil.count({ where: { deletedAt: { not: null } } }),
  ]);
  return { review, pack, bin };
}

export async function adminOverview() {
  const [paid, orders, families, sessions, byStatus, classes] = await Promise.all([
    db.order.aggregate({ where: { status: { in: PAID_STATUSES } }, _sum: { subtotal: true } }),
    db.order.count(),
    db.guardian.findMany({ where: { pupil: { deletedAt: null, status: "ACTIVE" } }, distinct: ["parentId"], select: { parentId: true } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.class.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const lines = await db.orderLine.findMany({ where: { order: { status: { in: PAID_STATUSES } } }, select: { qty: true, unitPrice: true, pupil: { select: { classId: true } } } });
  const byClass = classes.map((c) => [c.name, lines.filter((l) => l.pupil.classId === c.id).reduce((a, l) => a + l.qty * l.unitPrice, 0)] as [string, number]);
  return {
    sales: paid._sum.subtotal ?? 0, orders, families: families.length, sessions,
    byStatus: byStatus.map((s) => [ORDER_STATUS[s.status].label, s._count._all] as [string, number]).sort((a, b) => b[1] - a[1]),
    byClass,
  };
}

export async function accountsOverview() {
  const [queue, oldest, partPaid] = await Promise.all([
    db.order.count({ where: { status: "AWAITING_VERIFICATION" } }),
    db.order.findFirst({ where: { status: "AWAITING_VERIFICATION" }, orderBy: { updatedAt: "asc" } }),
    db.order.findMany({ where: { status: "PART_PAID" } }),
  ]);
  return { queue, oldest: oldest?.updatedAt ?? null, partPaid: partPaid.length, outstanding: partPaid.reduce((a, o) => a + Math.max(0, o.subtotal - o.walletUsed - o.amountReceived), 0) };
}

export async function storeOverview() {
  const [toPack, packing, ready] = await Promise.all([
    db.order.count({ where: { status: "PAYMENT_APPROVED" } }),
    db.order.count({ where: { status: "PACKING" } }),
    db.order.count({ where: { status: { in: ["READY", "PARTIALLY_HANDED_OUT"] } } }),
  ]);
  return { toPack, packing, ready };
}
