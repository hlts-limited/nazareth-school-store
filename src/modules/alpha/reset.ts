// "Start fresh": clears the store, pupil and admissions data so the system starts like new, after a full backup.
// Kept: the Super Admin and Alpha Admin accounts, real staff (and their HR, attendance and payroll), settings,
// classes, store categories, roles, website content (events, news, gallery, notices, messages), backups and the
// audit log (which can't be deleted and records that this happened).
import type { Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { createBackup } from "@/modules/backup";

/** Stored files that belong only to the data being cleared */
const FILE_PREFIXES = ["items/", "receipts/", "admissions/"];

/**
 * Demo staff are the seed's example.com accounts. The school's own Super Admin (SEED_ADMIN_EMAIL) and the Alpha
 * Admin are never touched, even if their address is an example.com one.
 */
function demoStaffWhere(): Prisma.UserWhereInput {
  // The seed falls back to admin@example.com when SEED_ADMIN_EMAIL isn't set, so that address is kept too
  const keep = [env().SEED_ADMIN_EMAIL ?? "admin@example.com", env().ALPHA_ADMIN_EMAIL].filter((e): e is string => !!e).map((e) => e.toLowerCase());
  return { type: "STAFF", email: { endsWith: "@example.com", mode: "insensitive" }, ...(keep.length && { NOT: { email: { in: keep } } }) };
}

/** What a reset would remove and keep, for the confirmation page */
export async function freshPreview() {
  const demo = await db.user.findMany({ where: demoStaffWhere(), select: { email: true, employee: { select: { id: true } } } });
  const [pupils, parents, items, orders, payments, applications, staffKept, events, news, photos] = await Promise.all([
    db.pupil.count(), db.user.count({ where: { type: "PARENT" } }), db.item.count(), db.order.count(), db.payment.count(), db.application.count(),
    db.user.count({ where: { type: "STAFF", NOT: demoStaffWhere() } }), db.event.count(), db.newsPost.count(), db.galleryPhoto.count(),
  ]);
  return {
    remove: { pupils, parents, items, orders, payments, applications, demoStaff: demo.filter((d) => !d.employee).length },
    keep: { staff: staffKept, events, news, photos },
    // Demo staff who were given a staff record are switched off rather than deleted, so their HR and payroll history stays whole
    demoStaffDisabled: demo.filter((d) => d.employee).map((d) => d.email),
  };
}

export async function startFresh(by: { id?: string; name: string }) {
  // 1. A full backup first: everything can be put back from Alpha → Backups & restores
  const backup = await createBackup("MANUAL", { id: by.id, name: `${by.name} (before Start fresh)` });

  const demo = await db.user.findMany({ where: demoStaffWhere(), select: { id: true, employee: { select: { id: true } } } });
  const demoDelete = demo.filter((d) => !d.employee).map((d) => d.id);
  const demoDisable = demo.filter((d) => d.employee).map((d) => d.id);

  // 2. Delete, children before parents, in one transaction: either everything goes or nothing does
  const counts = await db.$transaction(async (tx) => {
    const c: Record<string, number> = {};
    const run = async (name: string, p: Promise<{ count: number }>) => { c[name] = (await p).count; };
    await run("pickups", tx.pickup.deleteMany());
    await run("invoices", tx.invoice.deleteMany());
    await run("receipts", tx.receipt.deleteMany());
    await run("payments", tx.payment.deleteMany());
    await run("orderEvents", tx.orderEvent.deleteMany());
    await run("orderLines", tx.orderLine.deleteMany());
    await run("orders", tx.order.deleteMany());
    await run("walletTransactions", tx.walletTransaction.deleteMany());
    await run("wallets", tx.wallet.deleteMany());
    await run("cartItems", tx.cartItem.deleteMany());
    await run("wishlistItems", tx.wishlistItem.deleteMany());
    await run("stockMovements", tx.stockMovement.deleteMany());
    await run("pileParts", tx.pilePart.deleteMany());
    await run("itemClasses", tx.itemClass.deleteMany());
    await run("itemVariants", tx.itemVariant.deleteMany());
    await run("items", tx.item.deleteMany());
    await run("applicationDocuments", tx.applicationDocument.deleteMany());
    await run("applications", tx.application.deleteMany());
    await run("examSlots", tx.examSlot.deleteMany());
    await run("admissionWindows", tx.admissionWindow.deleteMany());
    await run("guardians", tx.guardian.deleteMany());
    await run("pupils", tx.pupil.deleteMany());
    const goingUsers = { OR: [{ type: "PARENT" as const }, { id: { in: demoDelete } }] };
    const going = (await tx.user.findMany({ where: goingUsers, select: { id: true } })).map((u) => u.id);
    await run("notifications", tx.notification.deleteMany({ where: { userId: { in: going } } }));
    await run("sessions", tx.session.deleteMany({ where: { OR: [{ kind: "PUPIL" }, { kind: "PARENT" }, { userId: { in: [...going, ...demoDisable] } }] } }));
    await run("viewAsSessions", tx.viewAsSession.deleteMany());
    await run("loginAttempts", tx.loginAttempt.deleteMany());
    await run("users", tx.user.deleteMany({ where: { id: { in: going } } }));
    if (demoDisable.length) {
      await tx.userRole.deleteMany({ where: { userId: { in: demoDisable } } });
      c.demoStaffDisabled = (await tx.user.updateMany({ where: { id: { in: demoDisable } }, data: { status: "DISABLED" } })).count;
    }
    // Order numbers start again from the first number
    await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"', 'number'), 1, false)`);
    return c;
  }, { timeout: 120_000 });

  // 3. The files that belonged to the deleted data (after the database change has gone through)
  let files = 0;
  for (const prefix of FILE_PREFIXES) {
    for (const key of await storage().list(prefix)) {
      await storage().delete(key).catch(() => {});
      files++;
    }
  }
  return { backup: backup.fileName, counts: { ...counts, files } };
}
