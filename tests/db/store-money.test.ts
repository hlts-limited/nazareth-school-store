// Runs against the throwaway test database: npm run test:db
// The store's money and stock path end to end: cart → checkout → Paystack (simulated) → packing → pick-up,
// plus wallets, cancellations, the last item in stock, and piles with books still to arrive.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { addPupil } from "../../src/modules/pupils/service";
import { addToCart } from "../../src/modules/cart/service";
import { checkout, cancelOrder } from "../../src/modules/orders/service";
import { confirmPaystack, payFromWallet, startPaystack } from "../../src/modules/payments/service";
import { handOut, lineNowReady, markReady, setLinePacked, startPacking } from "../../src/modules/fulfilment/service";
import { recordMovement } from "../../src/modules/inventory/service";
import { balance, credit } from "../../src/modules/wallet/service";

const run = Date.now().toString(36);
let classId = "", categoryId = "", staffId = "";
let n = 0;

before(async () => {
  classId = (await db.class.findFirstOrThrow({ orderBy: { sortOrder: "asc" } })).id;
  categoryId = (await db.category.findFirstOrThrow()).id;
  staffId = (await db.user.findFirstOrThrow({ where: { type: "STAFF" } })).id;
});

/** A new family: one parent and one child in the test class, with an empty wallet */
async function family() {
  n++;
  const phone = `0803${String(Date.now() % 1_000_000).padStart(6, "0")}${n}`.slice(0, 11);
  const r = await addPupil({ firstName: `Kid${n}`, lastName: `Money${run}`, regNumber: `TM-${run}-${n}`, classId, parentPhone: phone, parentName: `Parent${n} Money${run}` });
  return { parentId: r.parent.id, pupilId: r.pupil.id };
}

/** An item for the test class with a given stock level and price (naira) */
async function item(onHand: number, price = 2_000) {
  n++;
  const sku = `TM-${run}-I${n}`;
  const it = await db.item.create({
    data: { sku, name: `Test book ${n}`, categoryId, price, classes: { create: { classId, isCompulsory: false } }, variants: { create: { label: "Standard", sku, onHand } } },
    include: { variants: true },
  });
  return { item: it, variant: it.variants[0] };
}
const stock = (variantId: string) => db.itemVariant.findUniqueOrThrow({ where: { id: variantId }, select: { onHand: true, reserved: true } });

/** Pay the order's outstanding amount through the simulated Paystack checkout */
async function payOnline(orderId: string, parentId: string) {
  await startPaystack({ id: parentId, email: null, phone: "08030000000" }, orderId);
  const pay = await db.payment.findFirstOrThrow({ where: { orderId, method: "PAYSTACK", status: "PENDING" }, orderBy: { createdAt: "desc" } });
  return { ref: pay.paystackRef!, result: await confirmPaystack(pay.paystackRef!) };
}

test("checkout reserves stock; Paystack approves once; packing and pick-up take the stock out", async () => {
  const f = await family();
  const { variant } = await item(5, 3_000);
  await addToCart(f.parentId, f.pupilId, variant.id, 2);
  const order = await checkout(f.parentId, "PAYSTACK", [], "Test parent");
  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.subtotal, 6_000);
  assert.deepEqual(await stock(variant.id), { onHand: 5, reserved: 2 }, "two held for the order, none taken yet");
  assert.equal(await db.cartItem.count({ where: { parentId: f.parentId } }), 0, "the cart is emptied");

  const { ref, result } = await payOnline(order.id, f.parentId);
  assert.equal(result.status, "approved");
  const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(paid.status, "PAYMENT_APPROVED");
  assert.equal(paid.amountReceived, 6_000);
  // The browser callback and the webhook both confirm: the second must change nothing
  assert.equal((await confirmPaystack(ref)).status, "already");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).amountReceived, 6_000, "money is counted once");

  await startPacking(order.id, "Registrar");
  const ready = await markReady(order.id, "Registrar");
  assert.equal(ready.status, "READY");
  assert.match(ready.pickupCode ?? "", /^\w{4}$/);
  const lines = await db.orderLine.findMany({ where: { orderId: order.id } });
  await handOut(order.id, lines.map((l) => l.id), "Mrs Test", "Mother", { id: staffId, name: "Registrar" });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "HANDED_OUT");
  assert.deepEqual(await stock(variant.id), { onHand: 3, reserved: 0 }, "stock leaves the store only at hand-out");
  assert.equal(await db.stockMovement.count({ where: { orderId: order.id, type: "SALE" } }), 1);
  await assert.rejects(handOut(order.id, lines.map((l) => l.id), "Mrs Test", "Mother", { id: staffId, name: "Registrar" }), /isn't ready for pick-up/, "can't be handed out twice");
});

test("the last one in stock can't be sold twice", async () => {
  const a = await family(), b = await family();
  const { variant } = await item(1);
  await addToCart(a.parentId, a.pupilId, variant.id, 1);
  await addToCart(b.parentId, b.pupilId, variant.id, 1); // both carts hold it; only one checkout can win
  await checkout(a.parentId, "PAYSTACK", [], "A");
  await assert.rejects(checkout(b.parentId, "PAYSTACK", [], "B"), /just sold out/);
  assert.deepEqual(await stock(variant.id), { onHand: 1, reserved: 1 });
  assert.equal(await db.cartItem.count({ where: { parentId: b.parentId } }), 1, "the losing cart is left as it was");
});

test("wallet: pays the whole order at once, or part of it before Paystack", async () => {
  const f = await family();
  await db.$transaction((tx) => credit(tx, f.pupilId, "ADJUSTMENT", 5_000, { reason: "Test credit", actorName: "Accounts" }));
  const cheap = await item(10, 2_000);
  await addToCart(f.parentId, f.pupilId, cheap.variant.id, 1);
  const whole = await checkout(f.parentId, "PAYSTACK", [f.pupilId], "Parent");
  assert.equal(whole.status, "PAYMENT_APPROVED");
  assert.equal(whole.method, "WALLET");
  assert.equal(await balance(f.pupilId), 3_000);

  const dear = await item(10, 7_000);
  await addToCart(f.parentId, f.pupilId, dear.variant.id, 1);
  const part = await checkout(f.parentId, "PAYSTACK", [f.pupilId], "Parent");
  assert.equal(part.status, "PENDING_PAYMENT");
  assert.equal(part.walletUsed, 3_000);
  assert.equal(await balance(f.pupilId), 0, "wallet emptied into the order");
  const { result } = await payOnline(part.id, f.parentId);
  assert.equal(result.status, "approved");
  const after = await db.order.findUniqueOrThrow({ where: { id: part.id } });
  assert.equal(after.amountReceived, 4_000, "Paystack collects only the rest");

  // Not enough in the wallet to pay an unpaid order from it
  const third = await item(10, 9_000);
  await addToCart(f.parentId, f.pupilId, third.variant.id, 1);
  const unpaid = await checkout(f.parentId, "PAYSTACK", [], "Parent");
  await assert.rejects(payFromWallet(f.parentId, unpaid.id, "Parent"), /wallets hold/);
});

test("cancelling: stock goes back, and money already paid goes to the child's wallet", async () => {
  const f = await family();
  const { variant } = await item(4, 2_500);
  await addToCart(f.parentId, f.pupilId, variant.id, 2);
  const unpaid = await checkout(f.parentId, "PAYSTACK", [], "Parent");
  await db.$transaction((tx) => cancelOrder(tx, unpaid.id, "Not paid in time", "System"));
  assert.deepEqual(await stock(variant.id), { onHand: 4, reserved: 0 }, "reservation released");
  assert.equal(await balance(f.pupilId), 0, "nothing was paid, nothing credited");

  await addToCart(f.parentId, f.pupilId, variant.id, 2);
  const paid = await checkout(f.parentId, "PAYSTACK", [], "Parent");
  await payOnline(paid.id, f.parentId);
  await db.$transaction((tx) => cancelOrder(tx, paid.id, "Cancelled by the school", "Accounts"));
  assert.equal(await balance(f.pupilId), 5_000, "the full payment is in the wallet");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { orderId: paid.id } })).status, "VOID");
  assert.deepEqual(await stock(variant.id), { onHand: 4, reserved: 0 });
});

test("a pile with a book out of stock: sold now, packed in two goes, parent told about the pile not the book", async () => {
  const f = await family();
  const inStock = await item(3, 1_500), missing = await item(0, 2_500);
  n++;
  const sku = `TM-${run}-P${n}`;
  const pile = await db.item.create({
    data: {
      sku, name: `Test pile ${n}`, description: "All core books", categoryId, price: 4_000, isPile: true, reorderLevel: 0,
      classes: { create: { classId, isCompulsory: true } }, variants: { create: { label: "Standard", sku } },
      pileParts: { create: [{ bookId: inStock.item.id, qty: 1, sortOrder: 0 }, { bookId: missing.item.id, qty: 1, sortOrder: 1 }] },
    },
    include: { variants: true },
  });
  await addToCart(f.parentId, f.pupilId, pile.variants[0].id, 1);
  const order = await checkout(f.parentId, "PAYSTACK", [], "Parent");
  assert.equal(order.subtotal, 4_000);
  const lines = await db.orderLine.findMany({ where: { orderId: order.id }, orderBy: { itemName: "asc" } });
  assert.equal(lines.length, 2, "one line per book");
  assert.ok(lines.every((l) => l.pileName === pile.name));
  assert.deepEqual(lines.map((l) => l.reserved).sort(), [false, true], "only the book in stock is held");

  await payOnline(order.id, f.parentId);
  await startPacking(order.id, "Registrar");
  const waiting = await db.orderLine.findFirstOrThrow({ where: { orderId: order.id, variantId: missing.variant.id } });
  assert.equal(waiting.status, "AWAITING_STOCK");
  await assert.rejects(setLinePacked(waiting.id, true), /isn't in stock yet/);
  await markReady(order.id, "Registrar");

  await recordMovement(missing.variant.id, "RESTOCK", 2, "Delivery", staffId);
  await lineNowReady(waiting.id, "Registrar");
  assert.equal((await db.orderLine.findUniqueOrThrow({ where: { id: waiting.id } })).status, "READY");
  const told = await db.notification.findFirstOrThrow({ where: { userId: f.parentId, title: { contains: "More items ready" } }, orderBy: { createdAt: "desc" } });
  assert.match(told.body, new RegExp(`More of ${pile.name}`));
  assert.doesNotMatch(told.body, new RegExp(missing.item.name), "the book's name isn't shown to the parent");
});
