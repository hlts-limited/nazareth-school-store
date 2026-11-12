// Runs against the throwaway test database: npm run test:db
// Returns: the Registrar records, Accounts approves, the parent's wallet is credited (no cash), stock comes back,
// and the next order uses that credit first. Piles can't be returned; deletes are for the Alpha Admin only.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { addPupil } from "../../src/modules/pupils/service";
import { addToCart } from "../../src/modules/cart/service";
import { checkout } from "../../src/modules/orders/service";
import { confirmPaystack, startPaystack } from "../../src/modules/payments/service";
import { handOut, markReady, startPacking } from "../../src/modules/fulfilment/service";
import { decideReturn, orderForReturn, recordReturn } from "../../src/modules/returns/service";
import { balance } from "../../src/modules/wallet/service";
import { invoiceRows } from "../../src/modules/payments/invoices";
import { deleteItem } from "../../src/modules/catalogue/service";
import { deleteStaffMember } from "../../src/modules/staff/service";
import { orderNo } from "../../src/shared/lib/format";

const run = Date.now().toString(36);
let classId = "", categoryId = "";
const registrar = { id: "registrar-test", name: "Registrar Test" };
const accounts = { id: "accounts-test", name: "Accounts Test" };
let n = 0;

before(async () => {
  classId = (await db.class.findFirstOrThrow({ orderBy: { sortOrder: "asc" } })).id;
  categoryId = (await db.category.findFirstOrThrow()).id;
});

async function family() {
  n++;
  const r = await addPupil({ firstName: `Kid${n}`, lastName: `Ret${run}`, regNumber: `TR-${run}-${n}`, classId, parentPhone: `0805${String(Date.now() % 1_000_000).padStart(6, "0")}${n}`.slice(0, 11), parentName: `Parent${n} Ret${run}` });
  return { parentId: r.parent.id, pupilId: r.pupil.id };
}
async function item(onHand: number, price: number, opts: { pile?: { bookId: string } } = {}) {
  n++;
  const sku = `TR-${run}-I${n}`;
  return db.item.create({
    data: {
      sku, name: `Return book ${n}`, categoryId, price, isPile: !!opts.pile, classes: { create: { classId, isCompulsory: false } }, variants: { create: { label: "Standard", sku, onHand } },
      ...(opts.pile ? { pileParts: { create: { bookId: opts.pile.bookId, qty: 1 } } } : {}),
    },
    include: { variants: true },
  });
}
/** Buy, pay on Paystack (simulated), pack and collect: a finished order */
async function collectedOrder(f: { parentId: string; pupilId: string }, variantId: string, qty: number) {
  await addToCart(f.parentId, f.pupilId, variantId, qty);
  const o = await checkout(f.parentId, "PAYSTACK", "Parent");
  if (o.status !== "PAYMENT_APPROVED") {
    await startPaystack({ id: f.parentId, email: null, phone: "08030000000" }, o.id);
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: o.id, method: "PAYSTACK", status: "PENDING" } });
    await confirmPaystack(pay.paystackRef!);
  }
  await startPacking(o.id, "Registrar");
  await markReady(o.id, "Registrar");
  const lines = await db.orderLine.findMany({ where: { orderId: o.id } });
  await handOut(o.id, lines.map((l) => l.id), "Mrs Test", "Mother", { id: registrar.id, name: "Registrar" });
  return { order: o, lines };
}

test("a return credits the parent's wallet only after Accounts approves, and restocks it", async () => {
  const f = await family();
  const it = await item(5, 3_000);
  const { order, lines } = await collectedOrder(f, it.variants[0].id, 2);
  const line = lines[0];
  assert.deepEqual(await db.itemVariant.findUniqueOrThrow({ where: { id: it.variants[0].id }, select: { onHand: true } }), { onHand: 3 });

  await assert.rejects(recordReturn(line.id, 3, "Too many", true, registrar), /at most 2/);
  await assert.rejects(recordReturn(line.id, 1, " ", true, registrar), /why/);
  const { request } = await recordReturn(line.id, 1, "Wrong book", true, registrar);
  assert.equal(request.amount, 3_000);
  assert.equal(await balance(f.parentId), 0, "nothing credited until Accounts approves");
  // While it waits, the same unit can't be recorded twice
  assert.equal((await orderForReturn(orderNo(order.number)))!.lines[0].left, 1);

  await assert.rejects(decideReturn(request.id, true, undefined, registrar), /someone else in Accounts/, "whoever recorded it can't approve it");
  await decideReturn(request.id, true, undefined, accounts);
  assert.equal(await balance(f.parentId), 3_000, "the price paid is in the parent's wallet");
  assert.deepEqual(await db.itemVariant.findUniqueOrThrow({ where: { id: it.variants[0].id }, select: { onHand: true } }), { onHand: 4 }, "back in stock");
  assert.equal((await db.orderLine.findUniqueOrThrow({ where: { id: line.id } })).returnedQty, 1);
  await assert.rejects(decideReturn(request.id, true, undefined, accounts), /already been decided/);
  const told = await db.notification.findFirstOrThrow({ where: { userId: f.parentId, title: { contains: "added to your wallet" } } });
  assert.match(told.body, /used first on your next order/);

  // Accounts sees the breakdown: what was returned, how it was paid
  const rows = await invoiceRows({ q: orderNo(order.number) });
  const row = rows.find((r) => r.order === orderNo(order.number))!;
  assert.equal(row.amount, 6_000);
  assert.equal(row.returned, 3_000);
  assert.equal(row.paystack, 6_000);
  assert.equal(row.fromWallet, 0);

  // The next order spends the credit first; Paystack is only for the rest
  const other = await item(5, 5_000);
  await addToCart(f.parentId, f.pupilId, other.variants[0].id, 1);
  const next = await checkout(f.parentId, "PAYSTACK", "Parent");
  assert.equal(next.walletUsed, 3_000);
  assert.equal(next.subtotal - next.walletUsed, 2_000);
  assert.equal(await balance(f.parentId), 0);
  const nextRow = (await invoiceRows({ q: orderNo(next.number) })).find((r) => r.order === orderNo(next.number))!;
  assert.equal(nextRow.fromWallet, 3_000);
  assert.equal(nextRow.balance, 2_000, "what's still to pay on Paystack");
});

test("a declined return credits nothing; a damaged one isn't restocked; pile books can't be returned", async () => {
  const f = await family();
  const it = await item(5, 1_000);
  const { lines } = await collectedOrder(f, it.variants[0].id, 2);
  const a = await recordReturn(lines[0].id, 1, "Changed mind", true, registrar);
  await assert.rejects(decideReturn(a.request.id, false, " ", accounts), /why/);
  await decideReturn(a.request.id, false, "Used, can't be resold", accounts);
  assert.equal(await balance(f.parentId), 0);

  const b = await recordReturn(lines[0].id, 1, "Torn cover", false, registrar);
  const before = (await db.itemVariant.findUniqueOrThrow({ where: { id: it.variants[0].id } })).onHand;
  await decideReturn(b.request.id, true, undefined, accounts);
  assert.equal(await balance(f.parentId), 1_000, "damaged still credits the parent");
  assert.equal((await db.itemVariant.findUniqueOrThrow({ where: { id: it.variants[0].id } })).onHand, before, "but isn't put back on the shelf");

  const book = await item(3, 2_000);
  const pile = await item(0, 2_000, { pile: { bookId: book.id } });
  const g = await family();
  const { order, lines: pileLines } = await collectedOrder(g, pile.variants[0].id, 1);
  assert.ok(pileLines.every((l) => l.pileItemId), "pile bought as its books");
  const view = await orderForReturn(orderNo(order.number));
  assert.ok(view!.lines.every((l) => l.left === 0 && /pile/i.test(l.why ?? "")));
  await assert.rejects(recordReturn(pileLines[0].id, 1, "Not needed", true, registrar), /pile/i);
});

test("returns close after the return window", async () => {
  const f = await family();
  const it = await item(5, 1_000);
  const { order, lines } = await collectedOrder(f, it.variants[0].id, 1);
  await db.orderLine.update({ where: { id: lines[0].id }, data: { handedOutAt: new Date(Date.now() - 40 * 86_400_000) } });
  const view = await orderForReturn(orderNo(order.number));
  assert.match(view!.lines[0].why ?? "", /window ended/);
  await assert.rejects(recordReturn(lines[0].id, 1, "Late", true, registrar), /window ended/);
});

test("Alpha-only deletes refuse anything with history", async () => {
  // An item on an order stays; an unused one can go
  const f = await family();
  const used = await item(5, 500);
  await collectedOrder(f, used.variants[0].id, 1);
  await assert.rejects(deleteItem(used.id), /order line/);
  const unused = await item(5, 500);
  await deleteItem(unused.id);
  assert.equal(await db.item.count({ where: { id: unused.id } }), 0);

  // A staff member never paid can go; nobody deletes themselves
  const u = await db.user.create({ data: { type: "STAFF", status: "INVITED", firstName: "Temp", lastName: `Del${run}`, email: `del.${run}@nazareth.test` } });
  await assert.rejects(deleteStaffMember(u.id, u.id), /your own account/);
  await deleteStaffMember(u.id, "someone-else");
  assert.equal(await db.user.count({ where: { id: u.id } }), 0);
});
