import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { naira, orderNo, parseOrderNo } from "@/shared/lib/format";
import { getSettings } from "@/modules/settings";
import { credit } from "@/modules/wallet";
import { addEvent } from "@/modules/orders";
import { notify } from "@/modules/notifications";

/*
 * Returns: a parent brings an item back (wrong size, changed their mind). The Registrar records it at the store;
 * Accounts approves it. Approval credits the parent's wallet with what was paid for it (the school does not give
 * cash back) and, unless it is damaged, puts it back in stock. Exchanges are a return plus a new order, which the
 * wallet pays for first. Books bought as part of a pile can't be returned.
 */

type Staff = { id: string; name: string };

/** How many of a line can still be brought back: collected, not in a pile, not already returned or waiting */
function returnable(l: { status: string; pileItemId: string | null; qty: number; returnedQty: number; returns: { status: string; qty: number }[] }) {
  if (l.status !== "HANDED_OUT" || l.pileItemId) return 0;
  const pending = l.returns.filter((r) => r.status === "PENDING").reduce((a, r) => a + r.qty, 0);
  return Math.max(0, l.qty - l.returnedQty - pending);
}

const DAY = 86_400_000;

/** An order as the Registrar sees it at the returns desk: each line, and how many can be returned and until when */
export async function orderForReturn(no: string) {
  const n = parseOrderNo(no);
  if (!n) return null;
  const [o, s] = await Promise.all([
    db.order.findUnique({ where: { number: n }, include: { parent: true, lines: { include: { pupil: true, returns: true }, orderBy: { itemName: "asc" } } } }),
    getSettings(),
  ]);
  if (!o) return null;
  const now = Date.now();
  return {
    order: o,
    windowDays: s.returnWindowDays,
    lines: o.lines.map((l) => {
      const until = l.handedOutAt ? new Date(l.handedOutAt.getTime() + s.returnWindowDays * DAY) : null;
      const left = returnable(l);
      const why = l.pileItemId ? "Part of a pile: piles can't be returned"
        : l.status !== "HANDED_OUT" ? "Not collected yet"
        : !s.returnWindowDays ? "Returns are switched off in Settings"
        : until && until.getTime() < now ? `Return window ended ${until.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}`
        : left === 0 ? (l.returns.some((r) => r.status === "PENDING") ? "Waiting for Accounts" : "Already returned") : null;
      return { ...l, left: why ? 0 : left, until, why };
    }),
  };
}

/** Registrar records a return. Nothing is credited until Accounts approves. */
export async function recordReturn(lineId: string, qty: number, reason: string, resellable: boolean, by: Staff) {
  if (!reason.trim()) throw new UserError("Say why it's being returned.", { reason: "Required" });
  const line = await db.orderLine.findUnique({ where: { id: lineId }, include: { order: true, returns: true } });
  if (!line) throw new UserError("That item wasn't found.");
  const view = await orderForReturn(orderNo(line.order.number));
  const l = view?.lines.find((x) => x.id === lineId);
  if (!l || l.why) throw new UserError(l?.why ?? "This item can't be returned.");
  if (qty < 1 || qty > l.left) throw new UserError(`You can return at most ${l.left}.`, { qty: `At most ${l.left}` });
  const amount = line.unitPrice * qty;
  const r = await db.$transaction(async (tx) => {
    const req = await tx.returnRequest.create({ data: { orderId: line.orderId, lineId, qty, amount, reason: reason.trim(), resellable, recordedById: by.id, recordedBy: by.name } });
    await addEvent(tx, line.orderId, `Return recorded: ${qty} × ${line.itemName} (${naira(amount)}), waiting for Accounts`, by.name);
    return req;
  });
  return { request: r, amount, order: line.order };
}

/** Returns waiting for Accounts, oldest first; and the last 50 decided */
export async function returnQueues() {
  const include = { order: { include: { parent: true } }, line: { include: { pupil: true } } } as const;
  const [pending, recent] = await Promise.all([
    db.returnRequest.findMany({ where: { status: "PENDING" }, include, orderBy: { createdAt: "asc" } }),
    db.returnRequest.findMany({ where: { status: { not: "PENDING" } }, include, orderBy: { decidedAt: "desc" }, take: 50 }),
  ]);
  return { pending, recent };
}

/**
 * Accounts decides. Approve: credit the parent's wallet, put a resellable item back in stock, tell the parent.
 * Nobody approves a return they recorded themselves.
 */
export async function decideReturn(id: string, approve: boolean, note: string | undefined, by: Staff) {
  const res = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "ReturnRequest" WHERE "id" = ${id} FOR UPDATE`;
    const r = await tx.returnRequest.findUnique({ where: { id }, include: { order: true, line: true } });
    if (!r) throw new UserError("That return wasn't found.");
    if (r.status !== "PENDING") throw new UserError("This return has already been decided.");
    if (r.recordedById === by.id) throw new UserError("You recorded this return, so someone else in Accounts must approve it.");
    if (!approve && !note?.trim()) throw new UserError("Say why it's not approved.", { note: "Required" });
    await tx.returnRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: by.id, decidedBy: by.name, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    const no = orderNo(r.order.number);
    if (!approve) {
      await addEvent(tx, r.orderId, `Return not approved: ${r.qty} × ${r.line.itemName} · ${note?.trim()}`, by.name);
      return { r, no };
    }
    await tx.orderLine.update({ where: { id: r.lineId }, data: { returnedQty: { increment: r.qty } } });
    await credit(tx, r.order.parentId, "RETURN_CREDIT", r.amount, { orderId: r.orderId, reason: `${r.qty} × ${r.line.itemName} returned`, actorName: by.name });
    if (r.resellable) {
      await tx.itemVariant.update({ where: { id: r.line.variantId }, data: { onHand: { increment: r.qty } } });
      await tx.stockMovement.create({ data: { variantId: r.line.variantId, type: "RETURN", qty: r.qty, orderId: r.orderId, userId: by.id, reason: `Returned on ${no}` } });
    }
    await addEvent(tx, r.orderId, `Return approved: ${r.qty} × ${r.line.itemName} · ${naira(r.amount)} credited to the wallet`, by.name);
    return { r, no };
  });
  if (approve) {
    await notify(res.r.order.parentId, `${naira(res.r.amount)} added to your wallet`,
      `The return of ${res.r.qty} × ${res.r.line.itemName} from order ${res.no} is approved. ${naira(res.r.amount)} is in your wallet and will be used first on your next order.`, ["whatsapp", "email"]);
  }
  return res.r;
}

/** Returns credited to wallets in the last `days` days (Accounts overview) */
export async function returnsCredited(days = 30) {
  const r = await db.returnRequest.aggregate({ where: { status: "APPROVED", decidedAt: { gte: new Date(Date.now() - days * DAY) } }, _sum: { amount: true }, _count: true });
  return { amount: r._sum.amount ?? 0, count: r._count };
}
