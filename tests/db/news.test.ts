// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { storage } from "../../src/shared/lib/storage";
import { deleteNews, latestNews, newsBySlug, saveNews } from "../../src/modules/website/service";

const DAY = 86_400_000;
const jpeg = { buf: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 7]), mime: "image/jpeg", ext: "jpg" };
const body = "The Primary 6 team came first in the state mathematics quiz.";

before(async () => { await db.newsPost.deleteMany(); });

test("news: address from the headline, unique, kept when edited", async () => {
  const a = await saveNews(undefined, { title: "Maths Quiz: We Won!", body, published: true, publishedAt: new Date(Date.now() - DAY) });
  const b = await saveNews(undefined, { title: "Maths quiz — we won", body, published: true, publishedAt: new Date() });
  assert.equal(a.slug, "maths-quiz-we-won");
  assert.equal(b.slug, "maths-quiz-we-won-2");
  const edited = await saveNews(a.id, { title: "A new headline", body, published: true, publishedAt: a.publishedAt });
  assert.equal(edited.slug, a.slug, "links already shared keep working");
});

test("news: drafts and future dates stay off the website; newest first", async () => {
  await saveNews(undefined, { title: "Draft", body, published: false, publishedAt: new Date() });
  const later = await saveNews(undefined, { title: "Next week", body, published: true, publishedAt: new Date(Date.now() + 7 * DAY) });
  const shown = (await latestNews()).map((n) => n.title);
  assert.ok(!shown.includes("Draft") && !shown.includes("Next week"));
  assert.equal(shown[0], "Maths quiz — we won");
  assert.equal(await newsBySlug(later.slug), null);
});

test("news: photo replaced or removed deletes the old file; deleting the post deletes its photo", async () => {
  const n = await saveNews(undefined, { title: "Excursion", body, published: true, publishedAt: new Date() }, jpeg);
  assert.ok(n.photoKey?.startsWith("news/"));
  const first = n.photoKey!;
  const replaced = await saveNews(n.id, { title: "Excursion", body, published: true, publishedAt: n.publishedAt }, jpeg);
  assert.notEqual(replaced.photoKey, first);
  assert.equal(await storage().get(first), null);
  const removed = await saveNews(n.id, { title: "Excursion", body, published: true, publishedAt: n.publishedAt }, "remove");
  assert.equal(removed.photoKey, null);
  assert.equal(await storage().get(replaced.photoKey!), null);
  const again = await saveNews(n.id, { title: "Excursion", body, published: true, publishedAt: n.publishedAt }, jpeg);
  await deleteNews(n.id);
  assert.equal(await storage().get(again.photoKey!), null);
});
