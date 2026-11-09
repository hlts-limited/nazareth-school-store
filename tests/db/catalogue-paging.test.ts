// Runs against the throwaway test database: npm run test:db (uses the demo seed's items)
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { pageItems, shopItems, SHOP_PER_PAGE } from "../../src/modules/catalogue/service";

test("store items: paged in the database, every item exactly once across the pages", async () => {
  const total = await db.item.count();
  assert.ok(total > 10, "the demo seed has items");
  const first = await pageItems({ perPage: 10 });
  assert.equal(first.total, total);
  assert.equal(first.pages, Math.ceil(total / 10));
  const seen = new Set<string>();
  for (let p = 1; p <= first.pages; p++) for (const it of (await pageItems({ perPage: 10, page: p })).rows) seen.add(it.id);
  assert.equal(seen.size, total, "no item missing or repeated");
  assert.equal((await pageItems({ perPage: 10, page: 999 })).page, first.pages, "a page past the end shows the last page");
});

test("shop: required items first on page 1, the rest paged; search narrows it", async () => {
  const cls = await db.class.findFirstOrThrow({ where: { items: { some: { isCompulsory: true } } } });
  const s = await shopItems(cls.id, {});
  const firstOptional = s.items.findIndex((i) => !i.compulsory);
  assert.ok(s.items.some((i) => i.compulsory), "this class has required items");
  if (firstOptional >= 0) assert.ok(s.items.slice(firstOptional).every((i) => !i.compulsory), "required items come first");
  assert.ok(s.items.filter((i) => !i.compulsory).length <= SHOP_PER_PAGE);
  if (s.pages > 1) assert.ok((await shopItems(cls.id, { page: 2 })).items.every((i) => !i.compulsory), "required items only on page 1");
  const name = s.items[0].name.split(" ")[0];
  const found = await shopItems(cls.id, { q: name });
  assert.ok(found.items.length >= 1 && found.items.every((i) => i.name.toLowerCase().includes(name.toLowerCase()) || i.sku.toLowerCase().includes(name.toLowerCase())));
});
