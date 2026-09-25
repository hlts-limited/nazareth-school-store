import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { balances } from "@/modules/wallet";

const cartInclude = {
  pupil: { include: { class: true } },
  variant: { include: { item: { include: { category: { include: { parent: true } } } } } },
} as const;

export async function assertGuardian(parentId: string, pupilId: string) {
  const g = await db.guardian.findUnique({ where: { parentId_pupilId: { parentId, pupilId } }, include: { pupil: true } });
  if (!g || g.pupil.status !== "ACTIVE" || g.pupil.deletedAt) throw new UserError("That child isn't linked to your account.");
  return g.pupil;
}

export async function getCart(parentId: string) {
  const lines = await db.cartItem.findMany({ where: { parentId }, include: cartInclude, orderBy: { createdAt: "asc" } });
  const pupilIds = [...new Set(lines.map((l) => l.pupilId))];
  const bal = await balances(pupilIds);
  const groups = pupilIds.map((pid) => {
    const ls = lines.filter((l) => l.pupilId === pid);
    const subtotal = ls.reduce((a, l) => a + (l.variant.priceOverride ?? l.variant.item.price) * l.qty, 0);
    return { pupil: ls[0].pupil, lines: ls, subtotal, walletBalance: bal[pid] ?? 0 };
  });
  return { lines, groups, count: lines.reduce((a, l) => a + l.qty, 0), subtotal: groups.reduce((a, g) => a + g.subtotal, 0) };
}
export type Cart = Awaited<ReturnType<typeof getCart>>;

export const cartCount = async (parentId: string) => (await db.cartItem.aggregate({ where: { parentId }, _sum: { qty: true } }))._sum.qty ?? 0;

export async function addToCart(parentId: string, pupilId: string, variantId: string, qty = 1) {
  const pupil = await assertGuardian(parentId, pupilId);
  const v = await db.itemVariant.findUnique({ where: { id: variantId }, include: { item: { include: { classes: true } } } });
  if (!v || !v.item.isActive) throw new UserError("That item is no longer available.");
  if (!v.item.classes.some((c) => c.classId === pupil.classId)) throw new UserError(`That item isn't for ${pupil.firstName}'s class.`);
  const existing = await db.cartItem.findUnique({ where: { parentId_pupilId_variantId: { parentId, pupilId, variantId } } });
  const inCartTotal = (await db.cartItem.aggregate({ where: { parentId, variantId }, _sum: { qty: true } }))._sum.qty ?? 0;
  if (inCartTotal + qty > v.onHand - v.reserved) throw new UserError(v.onHand - v.reserved <= 0 ? "Sorry, that's out of stock." : `Only ${v.onHand - v.reserved} left in stock.`);
  if (existing) await db.cartItem.update({ where: { id: existing.id }, data: { qty: existing.qty + qty } });
  else await db.cartItem.create({ data: { parentId, pupilId, variantId, qty } });
  return { item: v.item, pupil };
}

export async function setQty(parentId: string, cartItemId: string, qty: number) {
  const line = await db.cartItem.findFirst({ where: { id: cartItemId, parentId }, include: { variant: true } });
  if (!line) throw new UserError("That item is no longer in your cart.");
  if (qty <= 0) { await db.cartItem.delete({ where: { id: line.id } }); return; }
  const others = (await db.cartItem.aggregate({ where: { parentId, variantId: line.variantId, id: { not: line.id } }, _sum: { qty: true } }))._sum.qty ?? 0;
  if (others + qty > line.variant.onHand - line.variant.reserved) throw new UserError("Not enough in stock for that quantity.");
  await db.cartItem.update({ where: { id: line.id }, data: { qty } });
}

/** Items already bought (paid or awaiting payment) for a pupil */
export async function boughtItemIds(pupilId: string) {
  const lines = await db.orderLine.findMany({
    where: { pupilId, status: { not: "CANCELLED" }, order: { status: { notIn: ["CANCELLED"] } } },
    select: { variant: { select: { itemId: true } } },
  });
  return new Set(lines.map((l) => l.variant.itemId));
}

/** Add every required booklist item the child doesn't have yet. Sized items need a size, so they're listed instead. */
export async function addBooklist(parentId: string, pupilId: string) {
  const pupil = await assertGuardian(parentId, pupilId);
  const required = await db.item.findMany({ where: { isActive: true, classes: { some: { classId: pupil.classId, isCompulsory: true } } }, include: { variants: true } });
  const bought = await boughtItemIds(pupilId);
  const inCart = new Set((await db.cartItem.findMany({ where: { parentId, pupilId }, include: { variant: true } })).map((c) => c.variant.itemId));
  let added = 0; const needSize: string[] = []; const outOfStock: string[] = [];
  for (const it of required) {
    if (bought.has(it.id) || inCart.has(it.id)) continue;
    if (it.hasVariants) { needSize.push(it.name); continue; }
    const v = it.variants[0];
    if (!v || v.onHand - v.reserved <= 0) { outOfStock.push(it.name); continue; }
    await db.cartItem.create({ data: { parentId, pupilId, variantId: v.id, qty: 1 } });
    added++;
  }
  return { pupil, added, needSize, outOfStock };
}

export async function booklistProgress(pupilId: string, classId: string) {
  const required = await db.item.findMany({ where: { isActive: true, classes: { some: { classId, isCompulsory: true } } }, select: { id: true, name: true, price: true } });
  const bought = await boughtItemIds(pupilId);
  return { required, have: required.filter((r) => bought.has(r.id)), bought };
}

// ---- Wishlist (pupils suggest, parents buy) ----
export async function toggleWish(pupilId: string, itemId: string) {
  const key = { pupilId_itemId: { pupilId, itemId } };
  const ex = await db.wishlistItem.findUnique({ where: key });
  if (ex) { await db.wishlistItem.delete({ where: key }); return false; }
  await db.wishlistItem.create({ data: { pupilId, itemId } });
  return true;
}
export async function wishlistForParent(parentId: string) {
  return db.wishlistItem.findMany({
    where: { pupil: { guardians: { some: { parentId } }, deletedAt: null } },
    include: { pupil: true, item: { include: { variants: true } } },
    orderBy: { createdAt: "desc" },
  });
}
