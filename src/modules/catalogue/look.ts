import { artKind } from "./components/item-art";

type Cat = { slug: string; color: string; parent?: { slug: string; color: string } | null };

/** Colour and placeholder drawing for an item, taken from its top-level category */
export function itemLook(item: { imageKey?: string | null; name: string; category: Cat }) {
  const root = item.category.parent ?? item.category;
  return { imageKey: item.imageKey, name: item.name, color: root.color, kind: artKind(root.slug) };
}
