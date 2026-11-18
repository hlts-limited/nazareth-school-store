// Runs against the throwaway test database: npm run test:db
// Counter orders: the Registrar places an order for a parent without internet; it works exactly like an online order.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { addPupil } from "../../src/modules/pupils/service";
import { addToCart } from "../../src/modules/cart/service";
import { checkout } from "../../src/modules/orders/service";
import { confirmPaystack, startPaystack } from "../../src/modules/payments/service";
import { credit } from "../../src/modules/wallet/service";
import { counterFamily, counterOrder, findPupilsForCounter, placeCounterOrder } from "../../src/modules/counter/service";
import { invoiceRows } from "../../src/modules/payments/invoices";
import { orderNo } from "../../src/shared/lib/format";

const run = Date.now().toString(36);
const registrar = { id: "registrar-counter-test", name: "Counter Registrar" };
let classId = "", categoryId = "";
let n = 0;

before(async () => {
  classId = (await db.class.findFirstOrThrow({ orderBy: { sortOrder: "asc" } })).id;
  categoryId = (await db.category.findFirstOrThrow()).id;
});

const phone = () => `0807${String(Date.now() % 1_000_000).padStart(6, "0")}${++n}`.slice(0, 11);
async function item(onHand: number, price: number) {
  n++;
  const sku = `TC-${run}-${n}`;
  return db.item.create({ data: { sku, name: `Counter book ${n}`, categoryId, price, classes: { create: { classId, isCompulsory: true } }, variants: { create: { label: "Standard", sku, onHand } } }, include: { variants: true } });
}

test("a counter order for two children: wallet first, Paystack pays the rest, then it's packed like any order", async () => {
  const p = phone();
  const a = await addPupil({ firstName: "Ada", lastName: `Counter${run}`, regNumber: `TC-${run}-A`, classId, parentPhone: p, parentName: `Mama Counter${run}` });
  const b = await addPupil({ firstName: "Bayo", lastName: `Counter${run}`, regNumber: `TC-${run}-B`, classId, parentPhone: p });
  assert.equal(a.parent.id, b.parent.id, "same parent by phone");
  const parentId = a.parent.id;
  await db.$transaction((tx) => credit(tx, parentId, "ADJUSTMENT", 1_000, { reason: "Return credit", actorName: "Accounts" }));

  const found = await findPupilsForCounter(`Counter${run}`);
  assert.equal(found.length, 2);
  const book = await item(10, 3_000);
  const fam = await counterFamily(parentId);
  assert.equal(fam.children.length, 2);
  assert.equal(fam.wallet, 1_000);
  const listed = fam.children[0].items.find((i) => i.id === book.id)!;
  assert.ok(listed.required && !listed.bought, "the booklist item shows as still needed");

  const order = await placeCounterOrder(parentId, [{ pupilId: a.pupil.id, variantId: book.variants[0].id, qty: 1 }, { pupilId: b.pupil.id, variantId: book.variants[0].id, qty: 1 }], registrar);
  assert.equal(order.subtotal, 6_000);
  assert.equal(order.walletUsed, 1_000, "wallet credit used first");
  assert.equal(order.placedBy, registrar.name);
  assert.deepEqual(await db.itemVariant.findUniqueOrThrow({ where: { id: book.variants[0].id }, select: { reserved: true } }), { reserved: 2 }, "stock held as online");

  // Paystack at the desk (simulated in tests)
  await startPaystack({ id: parentId, email: null, phone: p }, order.id);
  const pay = await db.payment.findFirstOrThrow({ where: { orderId: order.id, method: "PAYSTACK", status: "PENDING" } });
  assert.equal((await confirmPaystack(pay.paystackRef!)).status, "approved");
  const paid = await counterOrder(orderNo(order.number));
  assert.equal(paid?.status, "PAYMENT_APPROVED", "goes to packing");
  assert.equal(paid?.amountReceived, 5_000);
  assert.ok(await db.orderEvent.findFirst({ where: { orderId: order.id, message: { contains: "school counter" } } }), "the timeline says it was placed at the counter");

  // Accounts can tell counter sales apart
  const rows = await invoiceRows({ q: orderNo(order.number), channel: "counter" });
  assert.ok(rows.length >= 2 && rows.every((r) => r.channel.startsWith("Counter")));
  assert.equal((await invoiceRows({ q: orderNo(order.number), channel: "online" })).length, 0);
});

test("counter orders refuse other families' children, empty orders, and stock already taken online", async () => {
  const mine = await addPupil({ firstName: "Chi", lastName: `Counter${run}`, regNumber: `TC-${run}-C`, classId, parentPhone: phone() });
  const other = await addPupil({ firstName: "Dayo", lastName: `Other${run}`, regNumber: `TC-${run}-D`, classId, parentPhone: phone() });
  const last = await item(1, 2_000);
  await assert.rejects(placeCounterOrder(mine.parent.id, [{ pupilId: other.pupil.id, variantId: last.variants[0].id, qty: 1 }], registrar), /own children/);
  await assert.rejects(placeCounterOrder(mine.parent.id, [], registrar), /at least one/);
  // The other family buys the last one online first
  await addToCart(other.parent.id, other.pupil.id, last.variants[0].id, 1);
  await checkout(other.parent.id, "PAYSTACK", "Other parent");
  await assert.rejects(placeCounterOrder(mine.parent.id, [{ pupilId: mine.pupil.id, variantId: last.variants[0].id, qty: 1 }], registrar), /sold out/);
});
