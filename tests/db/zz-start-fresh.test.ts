// Runs against the throwaway test database: npm run test:db
// Named "zz-" so it runs last: it empties the store, pupil and admissions data that the other files use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { storage } from "../../src/shared/lib/storage";
import { startFresh } from "../../src/modules/alpha/reset";

test("start fresh: store, pupil and admissions data go; admins, real staff, settings and website stay; backup first", async () => {
  const admin = await db.user.findFirstOrThrow({ where: { roles: { some: { roleId: "admin" } }, email: { not: { endsWith: "@example.com" } } } }).catch(() => null)
    ?? await db.user.findFirstOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com" } });
  const realStaff = await db.user.upsert({ where: { email: "teacher@nazareth.test" }, update: {}, create: { type: "STAFF", status: "ACTIVE", firstName: "Real", lastName: "Teacher", email: "teacher@nazareth.test", roles: { create: { roleId: "secretary" } } } });
  await storage().put("items/zz-test.jpg", Buffer.from([1]), "image/jpeg");
  await storage().put("gallery/zz-keep.jpg", Buffer.from([1]), "image/jpeg");
  const before = { classes: await db.class.count(), categories: await db.category.count(), events: await db.event.count(), backups: await db.backup.count() };
  assert.ok((await db.pupil.count()) > 0 && (await db.item.count()) > 0, "the demo seed gives something to clear");

  const r = await startFresh({ name: "Test" });

  assert.equal(await db.pupil.count(), 0);
  assert.equal(await db.user.count({ where: { type: "PARENT" } }), 0);
  assert.equal(await db.item.count(), 0);
  assert.equal(await db.order.count(), 0);
  assert.equal(await db.payment.count(), 0);
  assert.equal(await db.application.count(), 0);
  // Demo staff are deleted, or (when they were given a staff record) switched off with no roles and no sign-ins
  const demoLeft = await db.user.findMany({ where: { type: "STAFF", email: { endsWith: "@example.com" }, NOT: { id: admin.id } }, include: { roles: true, employee: true } });
  for (const d of demoLeft) {
    assert.equal(d.status, "DISABLED", `${d.email} is switched off`);
    assert.equal(d.roles.length, 0);
    assert.ok(d.employee, "only demo accounts with a staff record are kept");
    assert.equal(await db.session.count({ where: { userId: d.id } }), 0);
  }
  assert.ok(await db.user.findUnique({ where: { id: admin.id } }), "the Super Admin stays");
  assert.ok(await db.user.findUnique({ where: { id: realStaff.id } }), "real staff stay");
  assert.equal(await db.class.count(), before.classes);
  assert.equal(await db.category.count(), before.categories);
  assert.equal(await db.event.count(), before.events);
  assert.equal(await db.backup.count(), before.backups + 1, "a backup is taken first");
  assert.ok(r.backup);
  assert.equal(await storage().get("items/zz-test.jpg"), null, "store item photos are removed");
  assert.ok(await storage().get("gallery/zz-keep.jpg"), "website photos stay");

  // Order numbers start again
  const parent = await db.user.create({ data: { type: "PARENT", status: "ACTIVE", firstName: "New", lastName: "Parent", phone: "08000000000" } });
  const o = await db.order.create({ data: { parentId: parent.id, method: "TRANSFER", subtotal: 1000 } });
  assert.equal(o.number, 1);
});
