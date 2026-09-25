import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { randomCode4 } from "@/shared/lib/crypto";
import { orderNo } from "@/shared/lib/format";
import { SCHOOL } from "@/shared/config/school";
import { deductForHandout } from "@/modules/inventory";
import { addEvent } from "@/modules/orders";
import { notify } from "@/modules/notifications";

const packInclude = {
  parent: true,
  lines: { include: { pupil: { include: { class: true } }, variant: true }, orderBy: { pupilId: "asc" as const } },
};

export async function packingQueue() {
  const [toPack, awaitingStock] = await Promise.all([
    db.order.findMany({ where: { status: { in: ["PAYMENT_APPROVED", "PACKING"] } }, include: packInclude, orderBy: { updatedAt: "asc" } }),
    db.order.findMany({ where: { status: { in: ["READY", "PARTIALLY_HANDED_OUT"] }, lines: { some: { status: "AWAITING_STOCK" } } }, include: packInclude, orderBy: { updatedAt: "asc" } }),
  ]);
  return { toPack, awaitingStock };
}

export async function startPacking(orderId: string, actorName: string) {
  await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { lines: { include: { variant: true } } } });
    if (!o || o.status !== "PAYMENT_APPROVED") throw new UserError("This order isn't waiting to be packed.");
    for (const l of o.lines) {
      await tx.orderLine.update({ where: { id: l.id }, data: { status: l.variant.onHand >= l.qty ? "PACKING" : "AWAITING_STOCK" } });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "PACKING" } });
    await addEvent(tx, orderId, "Being packed", actorName);
  });
}

/** Registrar ticks / unticks an item while packing (untick = can't supply yet) */
export async function setLinePacked(lineId: string, packed: boolean) {
  const l = await db.orderLine.findUnique({ where: { id: lineId }, include: { order: true } });
  if (!l || l.order.status !== "PACKING") throw new UserError("That order isn't being packed.");
  await db.orderLine.update({ where: { id: lineId }, data: { status: packed ? "PACKING" : "AWAITING_STOCK" } });
}

async function uniquePickupCode() {
  for (let i = 0; i < 20; i++) {
    const code = randomCode4();
    const clash = await db.order.findFirst({ where: { pickupCode: code, status: { in: ["READY", "PARTIALLY_HANDED_OUT"] } } });
    if (!clash) return code;
  }
  throw new Error("Could not generate a pick-up code");
}

export async function markReady(orderId: string, actorName: string) {
  const code = await uniquePickupCode();
  const o = await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!o || o.status !== "PACKING") throw new UserError("Start packing this order first.");
    if (!o.lines.some((l) => l.status === "PACKING")) throw new UserError("Tick at least one packed item.");
    await tx.orderLine.updateMany({ where: { orderId, status: "PACKING" }, data: { status: "READY" } });
    const waiting = o.lines.filter((l) => l.status === "AWAITING_STOCK").length;
    await addEvent(tx, orderId, `Ready for pick-up${waiting ? ` (${waiting} item${waiting > 1 ? "s" : ""} awaiting stock)` : ""}`, actorName);
    const updated = await tx.order.update({ where: { id: orderId }, data: { status: "READY", pickupCode: code } });
    return { ...updated, waiting };
  });
  await notify(o.parentId, `${orderNo(o.number)} is ready for pick-up`,
    `Order ${orderNo(o.number)} is ready for pick-up at ${SCHOOL.pickupPlace}. Pick-up code: ${code}.${o.waiting ? ` ${o.waiting} item${o.waiting > 1 ? "s are" : " is"} awaiting stock; we'll tell you when ${o.waiting > 1 ? "they arrive" : "it arrives"}.` : ""}`,
    ["sms", "whatsapp", "email"]);
  return o;
}

/** Item that was awaiting stock has arrived */
export async function lineNowReady(lineId: string, actorName: string) {
  const l = await db.orderLine.findUnique({ where: { id: lineId }, include: { variant: true, order: true } });
  if (!l || l.status !== "AWAITING_STOCK") throw new UserError("That item isn't awaiting stock.");
  if (l.variant.onHand < l.qty) throw new UserError("Restock this item first.");
  await db.$transaction(async (tx) => {
    await tx.orderLine.update({ where: { id: lineId }, data: { status: "READY" } });
    if (l.order.status === "PARTIALLY_HANDED_OUT" || l.order.status === "READY") await tx.order.update({ where: { id: l.orderId }, data: { status: l.order.status } });
    await addEvent(tx, l.orderId, `${l.itemName} arrived and is ready`, actorName);
  });
  await notify(l.order.parentId, `More items ready on ${orderNo(l.order.number)}`, `${l.itemName} for order ${orderNo(l.order.number)} is now ready. Use pick-up code ${l.order.pickupCode}.`, ["sms", "whatsapp"]);
}

export async function findByPickupCode(code: string) {
  if (!/^\d{4}$/.test(code)) return null;
  return db.order.findFirst({ where: { pickupCode: code, status: { in: ["READY", "PARTIALLY_HANDED_OUT"] } }, include: packInclude });
}

export async function handOut(orderId: string, lineIds: string[], collectedByName: string, relationship: string, staff: { id: string; name: string }) {
  if (!lineIds.length) throw new UserError("Tick the items being handed out.");
  if (!collectedByName.trim()) throw new UserError("Enter who collected the items.");
  const res = await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!o || !["READY", "PARTIALLY_HANDED_OUT"].includes(o.status)) throw new UserError("This order isn't ready for pick-up.");
    let count = 0;
    for (const l of o.lines.filter((x) => lineIds.includes(x.id) && x.status === "READY")) {
      await deductForHandout(tx, l.variantId, l.qty, o.id, staff.id, orderNo(o.number));
      await tx.orderLine.update({ where: { id: l.id }, data: { status: "HANDED_OUT" } });
      count += l.qty;
    }
    if (!count) throw new UserError("Nothing selected is ready to hand out.");
    const left = await tx.orderLine.count({ where: { orderId, status: { notIn: ["HANDED_OUT", "CANCELLED"] } } });
    await tx.pickup.create({ data: { orderId, collectedByName, relationship, itemCount: count, handedOutById: staff.id } });
    await addEvent(tx, orderId, `${left ? "Partly collected" : "Collected"} by ${collectedByName} (${relationship}) · ${count} item${count > 1 ? "s" : ""}`, staff.name);
    const updated = await tx.order.update({ where: { id: orderId }, data: { status: left ? "PARTIALLY_HANDED_OUT" : "HANDED_OUT" } });
    return { order: updated, count, left };
  });
  await notify(res.order.parentId, `${orderNo(res.order.number)} collected`, `${res.count} item${res.count > 1 ? "s" : ""} from order ${orderNo(res.order.number)} ${res.count > 1 ? "were" : "was"} collected by ${collectedByName}.${res.left ? " Some items are still to come." : " Thank you!"}`, ["sms"]);
  return res;
}
