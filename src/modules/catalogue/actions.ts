"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zBool, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { randomToken } from "@/shared/lib/crypto";
import { readUpload, storage } from "@/shared/lib/storage";
import { staffFor, auditActor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { createCategory, createItem, updateItem } from "./service";

const itemSchema = z.object({
  name: zText(160, "Enter the item name"),
  description: zOptText(1000),
  categoryId: zText(100, "Choose a category"),
  price: zInt(1, "Enter the price in naira"),
  reorderLevel: zInt(0),
  openingStock: zInt(0).optional(),
  classIds: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
  compulsory: zBool,
  isActive: zBool.optional(),
  variants: z.string().optional().transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
});

async function saveImage(form: FormData): Promise<string | undefined | { error: string }> {
  const file = form.get("image") as File | null;
  if (!file || file.size === 0) return undefined;
  const up = await readUpload(file, { allowPdf: false });
  if ("error" in up) return { error: up.error! };
  const key = `items/${randomToken(12)}.${up.ext}`;
  await storage().put(key, up.buf, up.mime);
  return key;
}

export async function createItemAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("catalogue.manage");
    const d = parseForm(itemSchema, form);
    const img = await saveImage(form);
    if (img && typeof img === "object") return fail(img.error, { image: img.error });
    const item = await createItem({ ...d, openingStock: d.openingStock ?? 0, imageKey: img }, v.user.id);
    await audit(await auditActor(v), "Added item", "Item", item.id, { name: item.name, price: item.price });
    return ok(`${item.name} added.`, { redirect: "/admin/store/items" });
  });
}

export async function updateItemAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("catalogue.manage");
    const id = String(form.get("id") ?? "");
    const d = parseForm(itemSchema, form);
    const img = await saveImage(form);
    if (img && typeof img === "object") return fail(img.error, { image: img.error });
    await updateItem(id, { ...d, newVariants: d.variants, imageKey: img, isActive: d.isActive ?? false });
    await audit(await auditActor(v), "Updated item", "Item", id, { name: d.name, price: d.price });
    return ok("Item saved.", { redirect: "/admin/store/items" });
  });
}

export async function createCategoryAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("catalogue.manage");
    const d = parseForm(z.object({ name: zText(80, "Enter a name"), parentId: zOptText(100) }), form);
    const c = await createCategory(d.name, d.parentId);
    await audit(await auditActor(v), "Added category", "Category", c.id, { name: c.name });
    return ok(`${c.name} added.`);
  });
}
