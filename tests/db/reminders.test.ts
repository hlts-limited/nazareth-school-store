// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { expireUnpaidOrders } from "../../src/modules/orders/service";
import { getSettings } from "../../src/modules/settings";

const HOUR = 3_600_000;
let parentId = "";

before(async () => {
  parentId = (await db.user.findFirstOrThrow({ where: { type: "PARENT" } })).id;
});

async function order(status: "PENDING_PAYMENT" | "AWAITING_VERIFICATION", hoursAgo: number) {
  const o = await db.order.create({ data: { parentId, status, method: "TRANSFER", subtotal: 12000 } });
  // updatedAt is set by Prisma on every write, so backdate it with SQL
  await db.$executeRaw`UPDATE "Order" SET "updatedAt" = ${new Date(Date.now() - hoursAgo * HOUR)} WHERE id = ${o.id}`;
  return o;
}
const events = (orderId: string) => db.orderEvent.findMany({ where: { orderId }, select: { message: true } }).then((e) => e.map((x) => x.message));

test("unpaid order: one WhatsApp reminder halfway to the cancel deadline, never twice", async () => {
  const { autoCancelHours } = await getSettings();
  const due = await order("PENDING_PAYMENT", autoCancelHours * 0.6);
  const tooNew = await order("PENDING_PAYMENT", autoCancelHours * 0.2);

  const first = await expireUnpaidOrders();
  assert.ok(first.paymentReminders >= 1);
  assert.ok((await events(due.id)).includes("Payment reminder sent"));
  assert.equal((await events(tooNew.id)).length, 0);
  const note = await db.notification.findFirst({ where: { userId: parentId, title: { contains: "waiting for payment" } }, orderBy: { createdAt: "desc" } });
  assert.ok(note, "the parent is notified");
  assert.equal(note.channels, "whatsapp,email", "phone messages go on WhatsApp");
  assert.match(note.body, /upload your transfer receipt/);

  await expireUnpaidOrders();
  assert.equal((await events(due.id)).filter((m) => m === "Payment reminder sent").length, 1);
});

test("receipt waiting over 2 days: the accounts staff get one nudge listing it", async () => {
  const slow = await order("AWAITING_VERIFICATION", 50);
  const recent = await order("AWAITING_VERIFICATION", 10);
  const accountant = await db.user.findFirstOrThrow({ where: { type: "STAFF", roles: { some: { role: { permissions: { has: "payments.review" } } } } } });

  const r = await expireUnpaidOrders();
  assert.ok(r.reviewReminders >= 1);
  assert.ok((await events(slow.id)).some((m) => m.startsWith("Review reminder")));
  assert.equal((await events(recent.id)).length, 0);
  const note = await db.notification.findFirst({ where: { userId: accountant.id, title: { contains: "waiting over 2 days" } }, orderBy: { createdAt: "desc" } });
  assert.ok(note);
  assert.equal(note.channels, "whatsapp,email");

  const again = await expireUnpaidOrders();
  assert.equal(again.reviewReminders, 0, "no second nudge for the same receipts");
});
