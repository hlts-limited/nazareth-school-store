import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { decryptField } from "@/shared/lib/crypto";
import { createBackup } from "@/modules/backup";
import { bulkTransfer, createTransferRecipient, paystackBalanceKobo, transferFeeKobo, transferMode, verifyTransfer } from "@/modules/payments";
import { notify } from "@/modules/notifications";
import { defaultsStillCurrent, periodLabel, runTotals, type Actor } from "./service";

const payable = <I extends { held: boolean; netKobo: number }>(items: I[]) => items.filter((i) => !i.held && i.netKobo > 0);
const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** What the Proprietor sees before approving: totals, held staff, and the change from last month. */
export async function approvalSummary(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { items: { include: { employee: { include: { user: true } }, payments: true } } } });
  const prev = await db.payrollRun.findFirst({ where: { period: { lt: run.period }, status: { in: ["APPROVED", "PAID", "LOCKED"] } }, orderBy: { period: "desc" }, include: { items: true } });
  const t = runTotals(run.items);
  const prevNet = prev ? runTotals(prev.items).netPayable : null;
  const fees = payable(run.items).reduce((a, i) => a + transferFeeKobo(i.netKobo), 0);
  return { run, totals: t, prevPeriod: prev?.period ?? null, prevNet, change: prevNet === null ? null : t.netPayable - prevNet, fees };
}

export async function approveRun(runId: string, by: Actor) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "DEFAULTS_REVIEWED") throw new UserError("This run isn't waiting for approval.");
  if (run.preparerIds.includes(by.id)) throw new UserError("You worked on this run's stages, so you can't approve it. Someone who didn't prepare it must approve.");
  if (!(await defaultsStillCurrent(runId))) throw new UserError("Attendance or penalties have changed since stage 3 was reviewed. Send it back so the Bursar can calculate again.");
  // An encrypted backup first, as in the plan
  await createBackup("SAFETY", { id: by.id, name: `${by.name} (before approving ${periodLabel(run.period)} payroll)` });
  return db.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedBy: by.name, approvedById: by.id, approvedAt: new Date(), sentBackNote: null } });
}

export async function sendBack(runId: string, note: string, by: Actor) {
  if (!note.trim()) throw new UserError("Say what needs changing.", { note: "Required" });
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { items: { include: { payments: true } } } });
  if (!["DEFAULTS_REVIEWED", "APPROVED"].includes(run.status)) throw new UserError("Only a run waiting for approval, or approved but unpaid, can be sent back.");
  if (run.items.some((i) => i.payments.length)) throw new UserError("Payments have already been sent for this run, so it can't go back.");
  return db.payrollRun.update({ where: { id: runId }, data: {
    status: "DRAFT", sentBackNote: `${note.trim()} (${by.name})`, approvedBy: null, approvedById: null, approvedAt: null,
    statutoryRevBy: null, statutoryRevAt: null, taxCalcAt: null, taxCalcBy: null, taxRevAt: null, taxRevBy: null,
    defaultsCalcAt: null, defaultsCalcBy: null, defaultsRevAt: null, defaultsRevBy: null,
  } });
}

const reference = (period: string, itemId: string, attempt: number) => `nzs_sal_${period.replace("-", "")}_${itemId.replace(/-/g, "").slice(0, 10)}_${attempt}`;

/** A Paystack transfer recipient for this person's verified account (made once, reset when the bank changes). */
async function recipientFor(employeeId: string) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  if (e.bankStatus !== "VERIFIED" || !e.accountNumberEnc || !e.bankCode) throw new UserError("Bank details not verified.");
  if (e.paystackRecipient) return e.paystackRecipient;
  const code = await createTransferRecipient(decryptField(e.accountNameEnc ?? ""), decryptField(e.accountNumberEnc), e.bankCode);
  await db.employee.update({ where: { id: employeeId }, data: { paystackRecipient: code } });
  return code;
}

/** The items to pay now: payable, and without a payment that is waiting or has succeeded. */
async function due(runId: string) {
  const items = await db.payrollItem.findMany({ where: { runId }, include: { payments: true, employee: true } });
  return payable(items).filter((i) => !i.payments.some((p) => p.status === "PENDING" || p.status === "SUCCESS"));
}

export async function payPreview(runId: string) {
  const items = await due(runId);
  const total = items.reduce((a, i) => a + i.netKobo, 0);
  const fees = items.reduce((a, i) => a + transferFeeKobo(i.netKobo), 0);
  let balance: number | null = null;
  try { balance = await paystackBalanceKobo(); } catch { balance = null; }
  return { count: items.length, total, fees, balance, mode: transferMode() };
}

/**
 * Pay every due salary through Paystack bulk transfers (100 a batch). The Proprietor retypes the total; if the
 * balance is short nothing is sent. Each payment row is written before sending, and the database allows only one
 * live payment per payslip, so a double press or a second person can't pay anyone twice.
 */
export async function payRun(runId: string, confirmTotalNaira: number) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (!["APPROVED", "PAID"].includes(run.status)) throw new UserError("Approve the run before paying.");
  const items = await due(runId);
  if (!items.length) throw new UserError("Everyone due has been paid, or is waiting for Paystack.");
  const total = items.reduce((a, i) => a + i.netKobo, 0);
  if (Math.round(confirmTotalNaira * 100) !== total) throw new UserError(`The total you typed doesn't match. Type ${naira(total)} exactly to confirm.`, { confirm: "Doesn't match" });
  const fees = items.reduce((a, i) => a + transferFeeKobo(i.netKobo), 0);
  const balance = await paystackBalanceKobo();
  if (balance < total + fees) throw new UserError(`The Paystack balance is ${naira(balance)}, short by ${naira(total + fees - balance)}. Top up the balance, then press Pay again. Nothing was sent.`);

  const live = transferMode() === "live";
  // Write the payment rows first; the unique index refuses a second live payment for the same payslip
  const rows: { id: string; reference: string; amountKobo: number; recipient: string; name: string }[] = [];
  for (const it of items) {
    const recipient = await recipientFor(it.employeeId);
    const attempt = (await db.salaryPayment.count({ where: { itemId: it.id } })) + 1;
    try {
      const p = await db.salaryPayment.create({ data: { itemId: it.id, attempt, reference: reference(run.period, it.id, attempt), amountKobo: it.netKobo, live } });
      rows.push({ id: p.id, reference: p.reference, amountKobo: p.amountKobo, recipient, name: it.employee.staffCode });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") continue; // someone else is already paying this one
      throw e;
    }
  }
  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    try {
      const results = await bulkTransfer(batch.map((r) => ({ amountKobo: r.amountKobo, recipient: r.recipient, reference: r.reference, reason: `${periodLabel(run.period)} salary` })));
      for (const res of results) {
        await db.salaryPayment.update({ where: { reference: res.reference }, data: { status: res.status, transferCode: res.transferCode ?? null, failReason: res.reason ?? null } });
        if (res.status === "FAILED") failed++; else sent++;
      }
    } catch (e) {
      // The whole batch was refused: mark it failed so it can be retried
      for (const r of batch) await db.salaryPayment.update({ where: { id: r.id }, data: { status: "FAILED", failReason: e instanceof UserError ? e.message : "Paystack didn't accept the batch" } });
      failed += batch.length;
    }
  }
  await settleRun(runId);
  return { sent, failed, total, mode: transferMode() };
}

/** Paystack's result for one transfer (webhook or Refresh). */
export async function applyTransferResult(ref: string, status: "SUCCESS" | "FAILED" | "REVERSED" | "PENDING", reason?: string) {
  const p = await db.salaryPayment.findUnique({ where: { reference: ref }, include: { item: true } });
  if (!p) return null;
  if (p.status === status) return p;
  const updated = await db.salaryPayment.update({ where: { id: p.id }, data: { status, failReason: reason ?? (status === "SUCCESS" ? null : p.failReason) } });
  await settleRun(p.item.runId);
  return updated;
}

/** When every payable salary has succeeded, the run is paid and staff are told their payslip is ready. */
async function settleRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { items: { include: { payments: true, employee: true } } } });
  const toPay = payable(run.items);
  const allPaid = toPay.length > 0 && toPay.every((i) => i.payments.some((p) => p.status === "SUCCESS"));
  if (allPaid && run.status === "APPROVED") {
    await db.payrollRun.update({ where: { id: runId }, data: { status: "PAID", paidAt: new Date() } });
    for (const i of toPay) await notify(i.employee.userId, "Salary paid", `Your ${periodLabel(run.period)} salary has been paid. Your payslip is on your staff page.`, ["inapp"]);
  }
}

export async function refreshPending(runId: string) {
  const pending = await db.salaryPayment.findMany({ where: { status: "PENDING", item: { runId } } });
  let changed = 0;
  for (const p of pending) {
    const r = await verifyTransfer(p.reference);
    if (r.status !== "PENDING") { await applyTransferResult(p.reference, r.status, r.reason); changed++; }
  }
  return { checked: pending.length, changed };
}

/** Daily: paid runs lock once their month is over. */
export async function lockFinishedRuns(now = new Date()) {
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const r = await db.payrollRun.updateMany({ where: { status: "PAID", period: { lt: thisMonth } }, data: { status: "LOCKED", lockedAt: now } });
  return r.count;
}

