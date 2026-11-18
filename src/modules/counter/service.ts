import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { orderNo, parseOrderNo } from "@/shared/lib/format";
import { booklistProgress } from "@/modules/cart";
import { pileStock, shopItems, variantAvailable } from "@/modules/catalogue";
import { placeOrder, type OrderEntry } from "@/modules/orders";
import { balance } from "@/modules/wallet";

/*
 * The school counter: the Registrar places a School Store order for a parent who can't buy online (no internet).
 * It goes through the same order code as the online cart (stock, piles, wallet first, invoice), is paid on
 * Paystack at the desk, and then follows the normal packing and pick-up steps.
 */

/** Pupils matching a name or registration number, with their parent, to start a counter order */
export async function findPupilsForCounter(q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  const words = t.split(/\s+/).filter(Boolean).slice(0, 3);
  const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });
  return db.pupil.findMany({
    where: { deletedAt: null, status: "ACTIVE", OR: [{ regNumber: ci(t) }, { AND: words.map((w) => ({ OR: [{ firstName: ci(w) }, { lastName: ci(w) }] })) }] },
    include: { class: true, guardians: { include: { parent: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 20,
  });
}

/** One thing the counter can sell to a child: an item with its sizes and how many are free to sell */
export type CounterItem = {
  id: string; name: string; price: number; required: boolean; bought: boolean; pile: boolean; pileNote?: string;
  variants: { id: string; label: string; available: number }[];
};

/**
 * Everything the counter needs for one family: the parent, each of their children with what they can buy
 * (required items first, those already bought marked), and the parent's wallet credit (used first).
 */
export async function counterFamily(parentId: string, search?: string) {
  const parent = await db.user.findUnique({ where: { id: parentId }, include: { guardianships: { include: { pupil: { include: { class: true } } } } } });
  if (!parent || parent.type !== "PARENT") throw new UserError("That parent wasn't found.");
  const children = parent.guardianships.map((g) => g.pupil).filter((p) => !p.deletedAt && p.status === "ACTIVE");
  const kids = await Promise.all(children.map(async (p) => {
    const [shop, progress] = await Promise.all([shopItems(p.classId, { q: search }), booklistProgress(p.id, p.classId)]);
    const items: CounterItem[] = shop.items.map((it) => {
      const ps = it.isPile ? pileStock(it) : null;
      return {
        id: it.id, name: it.name, price: it.price, required: it.compulsory, bought: progress.bought.has(it.id), pile: it.isPile,
        pileNote: ps && ps.inStock < ps.total ? "Some books to follow" : undefined,
        variants: it.variants.map((v) => ({ id: v.id, label: v.label, available: it.isPile ? 1 : variantAvailable(v) })),
      };
    });
    return { id: p.id, name: `${p.firstName} ${p.lastName}`, firstName: p.firstName, regNumber: p.regNumber, className: p.class.name, items, more: shop.pages > 1 };
  }));
  return { parent, children: kids, wallet: await balance(parentId) };
}

/** Place the order for the parent. Prices come from the shop, never from the counter screen. */
export async function placeCounterOrder(parentId: string, entries: OrderEntry[], by: { id: string; name: string }) {
  const clean = entries.filter((e) => e.qty > 0).map((e) => ({ pupilId: e.pupilId, variantId: e.variantId, qty: Math.min(50, Math.floor(e.qty)) }));
  if (!clean.length) throw new UserError("Tick at least one item to buy.");
  return placeOrder(parentId, clean, { method: "PAYSTACK", actorName: by.name, placedBy: by });
}

/** A counter order by its number, with what the desk needs to show */
export async function counterOrder(no: string) {
  const n = parseOrderNo(no);
  if (!n) return null;
  return db.order.findFirst({
    where: { number: n, placedById: { not: null } },
    include: { parent: true, lines: { include: { pupil: true } }, payments: { orderBy: { createdAt: "desc" } } },
  });
}

/** Counter orders still waiting to be paid (newest first), and the last ones placed */
export async function counterOrders() {
  const [unpaid, recent] = await Promise.all([
    db.order.findMany({ where: { placedById: { not: null }, status: { in: ["PENDING_PAYMENT", "PART_PAID"] } }, include: { parent: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.order.findMany({ where: { placedById: { not: null }, status: { notIn: ["PENDING_PAYMENT", "PART_PAID"] } }, include: { parent: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { unpaid, recent };
}

export const counterOrderPath = (n: number) => `/admin/store/counter/${orderNo(n)}`;
