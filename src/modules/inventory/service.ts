import type { StockMovementType } from "@prisma/client";
import { db, type Tx } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";

/** Reserve stock for an order. Atomic: fails (returns false) if not enough is available. */
export async function reserve(tx: Tx, variantId: string, qty: number) {
  const n = await tx.$executeRaw`UPDATE "ItemVariant" SET "reserved" = "reserved" + ${qty} WHERE "id" = ${variantId} AND "onHand" - "reserved" >= ${qty}`;
  return n === 1;
}

/** Give reserved stock back (order cancelled, or line removed). */
export async function release(tx: Tx, variantId: string, qty: number) {
  await tx.$executeRaw`UPDATE "ItemVariant" SET "reserved" = GREATEST("reserved" - ${qty}, 0) WHERE "id" = ${variantId}`;
}

/** Items physically leave the store at hand-out: on-hand and reserved both go down. */
export async function deductForHandout(tx: Tx, variantId: string, qty: number, orderId: string, userId: string, reason: string) {
  const n = await tx.$executeRaw`UPDATE "ItemVariant" SET "onHand" = "onHand" - ${qty}, "reserved" = GREATEST("reserved" - ${qty}, 0) WHERE "id" = ${variantId} AND "onHand" >= ${qty}`;
  if (n !== 1) throw new UserError("Not enough stock on hand for one of these items. Restock it first.");
  await tx.stockMovement.create({ data: { variantId, type: "SALE", qty: -qty, orderId, userId, reason } });
}

/** Restock, adjustment or return. qty is signed. */
export async function recordMovement(variantId: string, type: StockMovementType, qty: number, reason: string, userId: string) {
  if (!qty) throw new UserError("Enter a quantity.");
  return db.$transaction(async (tx) => {
    const n = await tx.$executeRaw`UPDATE "ItemVariant" SET "onHand" = "onHand" + ${qty} WHERE "id" = ${variantId} AND "onHand" + ${qty} >= 0`;
    if (n !== 1) throw new UserError("That would make on-hand stock negative.");
    return tx.stockMovement.create({ data: { variantId, type, qty, reason, userId } });
  });
}

export async function lowStock(take = 50) {
  const variants = await db.itemVariant.findMany({ where: { item: { isActive: true } }, include: { item: true } });
  return variants
    .map((v) => ({ ...v, available: v.onHand - v.reserved }))
    .filter((v) => v.available <= v.item.reorderLevel)
    .sort((a, b) => a.available - b.available)
    .slice(0, take);
}

export async function stockLevels(q?: string) {
  return db.itemVariant.findMany({
    where: q?.trim() ? { item: { name: { contains: q.trim(), mode: "insensitive" } } } : {},
    include: { item: true },
    orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
    take: 400,
  });
}

export async function recentMovements(take = 40) {
  const rows = await db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take, include: { variant: { include: { item: true } } } });
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter(Boolean) as string[] } } });
  return rows.map((r) => ({ ...r, by: users.find((u) => u.id === r.userId)?.firstName ?? "System" }));
}
