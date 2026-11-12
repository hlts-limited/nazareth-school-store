"use server";

import { z } from "zod";
import { ok, parseForm, runAction, zInt, zText, type ActionResult } from "@/shared/lib/action";
import { parentForAction, pupilForAction } from "@/modules/auth";
import { addBooklist, addToCart, clearWish, removeWishForParent, setQty, toggleWish } from "./service";

export async function addToCartAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({ pupilId: zText(100), variantId: zText(100, "Choose a size first"), qty: zInt(1).optional() }), form);
    const r = await addToCart(parent.id, d.pupilId, d.variantId, d.qty ?? 1);
    // Bought from the wishlist? Remove it there.
    await clearWish(d.pupilId, r.item.id);
    return ok(`Added ${r.item.name} for ${r.pupil.firstName}.`);
  });
}

export async function setQtyAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({ id: zText(100), qty: zInt(0) }), form);
    await setQty(parent.id, d.id, d.qty);
    return ok(d.qty === 0 ? "Removed from cart." : undefined);
  });
}

export async function addBooklistAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const pupilId = String(form.get("pupilId"));
    const r = await addBooklist(parent.id, pupilId);
    const parts = [`Added ${r.added} booklist item${r.added === 1 ? "" : "s"} for ${r.pupil.firstName}.`];
    if (r.needSize.length) parts.push(`Choose sizes for: ${r.needSize.join(", ")}.`);
    if (r.outOfStock.length) parts.push(`Out of stock: ${r.outOfStock.join(", ")}.`);
    // "Buy what's missing" goes straight on to the cart; "Add full booklist" in the shop stays put
    return ok(parts.join(" "), form.get("then") === "cart" && r.added > 0 ? { redirect: "/cart" } : {});
  });
}

export async function removeWishAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({ pupilId: zText(100), itemId: zText(100) }), form);
    await removeWishForParent(parent.id, d.pupilId, d.itemId);
    return ok("Taken off the wishlist.");
  });
}

export async function toggleWishAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const pupil = await pupilForAction();
    const on = await toggleWish(pupil.id, String(form.get("itemId")));
    return ok(on ? "Added to your wishlist. Your parent will see it." : "Removed from your wishlist.");
  });
}
