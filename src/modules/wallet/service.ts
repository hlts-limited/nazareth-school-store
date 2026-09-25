import type { WalletTxType } from "@prisma/client";
import { db, type Tx } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";

async function walletId(tx: Tx, pupilId: string) {
  const w = await tx.wallet.upsert({ where: { pupilId }, create: { pupilId }, update: {} });
  return w.id;
}

export async function balance(pupilId: string, tx: Tx = db) {
  const r = await tx.walletTransaction.aggregate({ where: { wallet: { pupilId } }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export async function balances(pupilIds: string[], tx: Tx = db): Promise<Record<string, number>> {
  if (!pupilIds.length) return {};
  const rows = await tx.walletTransaction.groupBy({ by: ["walletId"], where: { wallet: { pupilId: { in: pupilIds } } }, _sum: { amount: true } });
  const wallets = await tx.wallet.findMany({ where: { pupilId: { in: pupilIds } } });
  const out: Record<string, number> = Object.fromEntries(pupilIds.map((id) => [id, 0]));
  for (const w of wallets) out[w.pupilId] = rows.find((r) => r.walletId === w.id)?._sum.amount ?? 0;
  return out;
}

export async function credit(tx: Tx, pupilId: string, type: WalletTxType, amount: number, meta: { orderId?: string; reason?: string; actorName?: string; movable?: boolean } = {}) {
  if (amount <= 0) return;
  await tx.walletTransaction.create({ data: { walletId: await walletId(tx, pupilId), type, amount, ...meta } });
}

export async function debit(tx: Tx, pupilId: string, type: WalletTxType, amount: number, meta: { orderId?: string; reason?: string; actorName?: string } = {}) {
  if (amount <= 0) return;
  // Lock the wallet row so two checkouts can't spend the same balance
  const id = await walletId(tx, pupilId);
  await tx.$executeRaw`SELECT 1 FROM "Wallet" WHERE "id" = ${id} FOR UPDATE`;
  const bal = await balance(pupilId, tx);
  if (bal < amount) throw new UserError("Not enough money in the wallet.");
  await tx.walletTransaction.create({ data: { walletId: id, type, amount: -amount, ...meta } });
}

export async function statement(pupilIds: string[], take = 100) {
  return db.walletTransaction.findMany({
    where: { wallet: { pupilId: { in: pupilIds } } },
    include: { wallet: { include: { pupil: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Parent moves an overpayment credit from one of their children to another (once). */
export async function moveExcess(txId: string, toPupilId: string, parentId: string, actorName: string) {
  return db.$transaction(async (tx) => {
    const t = await tx.walletTransaction.findUnique({ where: { id: txId }, include: { wallet: true } });
    if (!t || !t.movable) throw new UserError("This credit can no longer be moved.");
    const kids = await tx.guardian.findMany({ where: { parentId } });
    const ids = kids.map((k) => k.pupilId);
    if (!ids.includes(t.wallet.pupilId) || !ids.includes(toPupilId)) throw new UserError("You can only move money between your own children.");
    await tx.walletTransaction.update({ where: { id: t.id }, data: { movable: false } });
    if (toPupilId === t.wallet.pupilId) return;
    await debit(tx, t.wallet.pupilId, "TRANSFER_OUT", t.amount, { orderId: t.orderId ?? undefined, reason: "Moved to sibling", actorName });
    await credit(tx, toPupilId, "TRANSFER_IN", t.amount, { orderId: t.orderId ?? undefined, reason: "Moved from sibling", actorName });
  });
}

/** Accountant: manual credit/debit or a cash/transfer refund to the parent. Reason is required. */
export async function adjust(pupilId: string, kind: "credit" | "debit" | "refund", amount: number, reason: string, actorName: string) {
  if (!reason.trim()) throw new UserError("Enter a reason.");
  return db.$transaction(async (tx) => {
    if (kind === "credit") await credit(tx, pupilId, "ADJUSTMENT", amount, { reason, actorName });
    else await debit(tx, pupilId, kind === "refund" ? "REFUND" : "ADJUSTMENT", amount, { reason, actorName });
  });
}

export async function pupilsWithBalance(q?: string) {
  const where = q?.trim()
    ? { deletedAt: null, OR: [{ firstName: { contains: q.trim(), mode: "insensitive" as const } }, { lastName: { contains: q.trim(), mode: "insensitive" as const } }, { regNumber: { contains: q.trim(), mode: "insensitive" as const } }] }
    : { deletedAt: null, wallet: { transactions: { some: {} } } };
  const pupils = await db.pupil.findMany({ where, include: { class: true, guardians: { include: { parent: true } } }, take: 60, orderBy: { lastName: "asc" } });
  const bal = await balances(pupils.map((p) => p.id));
  return pupils.map((p) => ({ ...p, balance: bal[p.id] ?? 0 })).filter((p) => q?.trim() || p.balance !== 0);
}

export async function totalHeld() {
  const r = await db.walletTransaction.aggregate({ _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
