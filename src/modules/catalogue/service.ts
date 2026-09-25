import type { Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { slugify } from "@/shared/lib/format";
import { UserError } from "@/shared/lib/action";

export const listClasses = () => db.class.findMany({ orderBy: { sortOrder: "asc" } });

export async function categoryTree() {
  const cats = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { items: true } } } });
  const roots = cats.filter((c) => !c.parentId);
  return roots.map((r) => ({
    ...r,
    children: cats.filter((c) => c.parentId === r.id),
    totalItems: r._count.items + cats.filter((c) => c.parentId === r.id).reduce((a, c) => a + c._count.items, 0),
  }));
}
export type CategoryNode = Awaited<ReturnType<typeof categoryTree>>[number];

export async function createCategory(name: string, parentId?: string) {
  const parent = parentId ? await db.category.findUnique({ where: { id: parentId } }) : null;
  let slug = slugify((parent ? parent.slug + "-" : "") + name);
  if (await db.category.findUnique({ where: { slug } })) slug += "-" + Date.now().toString(36);
  return db.category.create({ data: { name, slug, parentId: parent?.id, color: parent?.color ?? "#4A4446", sortOrder: 99 } });
}

const itemInclude = {
  category: { include: { parent: true } },
  variants: { orderBy: { sortOrder: "asc" } },
  classes: { include: { class: true } },
} satisfies Prisma.ItemInclude;
export type ItemFull = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

/** Items in a category — including items in its sub-categories */
async function categoryIds(categoryId: string) {
  const kids = await db.category.findMany({ where: { parentId: categoryId }, select: { id: true } });
  return [categoryId, ...kids.map((k) => k.id)];
}

export async function listItems(opts: { categoryId?: string; q?: string; classId?: string; activeOnly?: boolean; take?: number }) {
  const where: Prisma.ItemWhereInput = {};
  if (opts.activeOnly) where.isActive = true;
  if (opts.categoryId) where.categoryId = { in: await categoryIds(opts.categoryId) };
  if (opts.classId) where.classes = { some: { classId: opts.classId } };
  if (opts.q?.trim()) where.OR = [{ name: { contains: opts.q.trim(), mode: "insensitive" } }, { sku: { contains: opts.q.trim(), mode: "insensitive" } }];
  return db.item.findMany({ where, include: itemInclude, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }], take: opts.take ?? 300 });
}

export const getItem = (id: string) => db.item.findUnique({ where: { id }, include: itemInclude });

export const variantAvailable = (v: { onHand: number; reserved: number }) => Math.max(0, v.onHand - v.reserved);
export const itemAvailable = (it: { variants: { onHand: number; reserved: number }[] }) => it.variants.reduce((a, v) => a + variantAvailable(v), 0);
export const variantPrice = (it: { price: number }, v: { priceOverride: number | null }) => v.priceOverride ?? it.price;

/** Items for a pupil's class, required ones first */
export async function shopItems(classId: string, opts: { categoryId?: string; q?: string }) {
  const items = await listItems({ classId, activeOnly: true, categoryId: opts.categoryId, q: opts.q });
  return items
    .map((it) => ({ ...it, compulsory: it.classes.find((c) => c.classId === classId)?.isCompulsory ?? false }))
    .sort((a, b) => Number(b.compulsory) - Number(a.compulsory) || a.name.localeCompare(b.name));
}

export async function requiredItems(classId: string) {
  return db.item.findMany({ where: { isActive: true, classes: { some: { classId, isCompulsory: true } } }, include: itemInclude, orderBy: { name: "asc" } });
}

export type ItemInput = {
  name: string; description?: string; categoryId: string; price: number; reorderLevel: number;
  classIds: string[]; compulsory: boolean; variants: string[]; openingStock: number; imageKey?: string; isActive?: boolean;
};

async function nextSku(categoryId: string) {
  const cat = await db.category.findUnique({ where: { id: categoryId }, include: { parent: true } });
  const root = (cat?.parent?.slug ?? cat?.slug ?? "itm").slice(0, 3).toUpperCase();
  const count = await db.item.count();
  return `${root}-${String(count + 1).padStart(4, "0")}`;
}

export async function createItem(input: ItemInput, userId: string) {
  if (!input.classIds.length) throw new UserError("Choose at least one class.", { classIds: "Choose at least one class" });
  const sku = await nextSku(input.categoryId);
  const labels = input.variants.length ? input.variants : ["Standard"];
  return db.$transaction(async (tx) => {
    const item = await tx.item.create({
      data: {
        sku, name: input.name, description: input.description, categoryId: input.categoryId, price: input.price,
        reorderLevel: input.reorderLevel, hasVariants: input.variants.length > 0, imageKey: input.imageKey,
        classes: { create: input.classIds.map((classId) => ({ classId, isCompulsory: input.compulsory })) },
        variants: { create: labels.map((label, i) => ({ label, sku: labels.length > 1 ? `${sku}-${slugify(label).toUpperCase()}` : sku, onHand: input.openingStock, sortOrder: i })) },
      },
      include: { variants: true },
    });
    if (input.openingStock > 0) {
      await tx.stockMovement.createMany({ data: item.variants.map((v) => ({ variantId: v.id, type: "RESTOCK" as const, qty: input.openingStock, reason: "Opening stock", userId })) });
    }
    return item;
  });
}

export async function updateItem(id: string, input: Omit<ItemInput, "variants" | "openingStock"> & { newVariants: string[] }) {
  if (!input.classIds.length) throw new UserError("Choose at least one class.", { classIds: "Choose at least one class" });
  return db.$transaction(async (tx) => {
    const item = await tx.item.update({
      where: { id },
      data: {
        name: input.name, description: input.description, categoryId: input.categoryId, price: input.price,
        reorderLevel: input.reorderLevel, isActive: input.isActive ?? true, ...(input.imageKey ? { imageKey: input.imageKey } : {}),
      },
      include: { variants: true },
    });
    await tx.itemClass.deleteMany({ where: { itemId: id } });
    await tx.itemClass.createMany({ data: input.classIds.map((classId) => ({ itemId: id, classId, isCompulsory: input.compulsory })) });
    const existing = new Set(item.variants.map((v) => v.label.toLowerCase()));
    const add = input.newVariants.filter((l) => !existing.has(l.toLowerCase()));
    for (const [i, label] of add.entries()) {
      await tx.itemVariant.create({ data: { itemId: id, label, sku: `${item.sku}-${slugify(label).toUpperCase()}`, sortOrder: item.variants.length + i } });
    }
    if (add.length && !item.hasVariants) await tx.item.update({ where: { id }, data: { hasVariants: true } });
    return item;
  });
}
