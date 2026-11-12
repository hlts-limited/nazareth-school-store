import type { WalletTxType } from "@prisma/client";
import { db, type Tx } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";

/*
 * One wallet per parent, shared by all their children. Money only comes in as credit the school owes the family
 * (an approved return, a cancelled paid order, an overpayment, or an Accounts adjustment). It is spent first at
 * every checkout, before Paystack. The school does not hand out cash refunds from it.
 */

async function walletId(tx: Tx, parentId: string) {
  const w = await tx.wallet.upsert({ where: { parentId }, create: { parentId }, update: {} });
  return w.id;
}

export async function balance(parentId: string, tx: Tx = db) {
  const r = await tx.walletTransaction.aggregate({ where: { wallet: { parentId } }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

/** Balances for several parents at once (Accounts' list) */
export async function balances(parentIds: string[], tx: Tx = db): Promise<Record<string, number>> {
  if (!parentIds.length) return {};
  const wallets = await tx.wallet.findMany({ where: { parentId: { in: parentIds } }, select: { id: true, parentId: true } });
  const rows = await tx.walletTransaction.groupBy({ by: ["walletId"], where: { walletId: { in: wallets.map((w) => w.id) } }, _sum: { amount: true } });
  const out: Record<string, number> = Object.fromEntries(parentIds.map((id) => [id, 0]));
  for (const w of wallets) if (w.parentId) out[w.parentId] = rows.find((r) => r.walletId === w.id)?._sum.amount ?? 0;
  return out;
}

type Meta = { orderId?: string; reason?: string; actorName?: string };

export async function credit(tx: Tx, parentId: string, type: WalletTxType, amount: number, meta: Meta = {}) {
  if (amount <= 0) return;
  await tx.walletTransaction.create({ data: { walletId: await walletId(tx, parentId), type, amount, ...meta } });
}

export async function debit(tx: Tx, parentId: string, type: WalletTxType, amount: number, meta: Meta = {}) {
  if (amount <= 0) return;
  // Lock the wallet row so two checkouts can't spend the same balance
  const id = await walletId(tx, parentId);
  await tx.$executeRaw`SELECT 1 FROM "Wallet" WHERE "id" = ${id} FOR UPDATE`;
  const bal = await balance(parentId, tx);
  if (bal < amount) throw new UserError("Not enough money in the wallet.");
  await tx.walletTransaction.create({ data: { walletId: id, type, amount: -amount, ...meta } });
}

/**
 * Use as much of the parent's wallet as possible (up to `max`) and return the amount used.
 * Called at checkout and before every Paystack payment, so the wallet is always spent first.
 */
export async function spendUpTo(tx: Tx, parentId: string, max: number, meta: Meta) {
  if (max <= 0) return 0;
  const id = await walletId(tx, parentId);
  await tx.$executeRaw`SELECT 1 FROM "Wallet" WHERE "id" = ${id} FOR UPDATE`;
  const use = Math.min(await balance(parentId, tx), max);
  if (use > 0) await tx.walletTransaction.create({ data: { walletId: id, type: "CHECKOUT_DEBIT", amount: -use, ...meta } });
  return Math.max(0, use);
}

/** A parent's wallet entries, newest first */
export async function statement(parentId: string, take = 100) {
  return db.walletTransaction.findMany({ where: { wallet: { parentId } }, orderBy: { createdAt: "desc" }, take });
}

/** Accounts: manual credit/debit, or money actually paid back to the parent outside the system. Reason is required. */
export async function adjust(parentId: string, kind: "credit" | "debit" | "refund", amount: number, reason: string, actorName: string) {
  if (!reason.trim()) throw new UserError("Enter a reason.");
  return db.$transaction(async (tx) => {
    if (kind === "credit") await credit(tx, parentId, "ADJUSTMENT", amount, { reason, actorName });
    else await debit(tx, parentId, kind === "refund" ? "REFUND" : "ADJUSTMENT", amount, { reason, actorName });
  });
}

/** Parents with money in their wallet (or matching a search), for Accounts */
export async function parentsWithBalance(q?: string) {
  const t = q?.trim();
  const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const where = t
    ? { type: "PARENT" as const, OR: [{ firstName: ci(t) }, { lastName: ci(t) }, { phone: { contains: t } }, { email: ci(t) }, { guardianships: { some: { pupil: { OR: [{ firstName: ci(t) }, { lastName: ci(t) }, { regNumber: ci(t) }] } } } }] }
    : { type: "PARENT" as const, wallet: { transactions: { some: {} } } };
  const parents = await db.user.findMany({ where, include: { guardianships: { include: { pupil: true } } }, take: 100, orderBy: { lastName: "asc" } });
  const bal = await balances(parents.map((p) => p.id));
  return parents.map((p) => ({ ...p, balance: bal[p.id] ?? 0 })).filter((p) => t || p.balance !== 0);
}

/** All money held in wallets (what the school owes families in store credit) */
export async function totalHeld() {
  const r = await db.walletTransaction.aggregate({ _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
