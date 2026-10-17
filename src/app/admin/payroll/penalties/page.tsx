import Link from "next/link";
import { db } from "@/shared/lib/db";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { addAdjustmentAction, payrollRates, periodLabel, removeAdjustmentAction } from "@/modules/payroll";
import { money } from "../_ui";

export const metadata = { title: "Penalties & waivers" };

const shift = (m: string, by: number) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7); };

/** HR enters penalties (e.g. a missed duty) and waivers; lateness and absence are added automatically from attendance. */
export default async function PenaltiesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const v = await requireStaff("payroll.view");
  const sp = await searchParams;
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : thisMonth;
  const canEnter = v.permissions.has("payroll.penalties");
  const [staff, list, rates, run] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE" }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { staffCode: "asc" } }),
    db.payrollAdjustment.findMany({ where: { period: m }, include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } }, orderBy: { createdAt: "desc" } }),
    payrollRates(), db.payrollRun.findUnique({ where: { period: m } }),
  ]);
  const closed = run && !["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED", "DEFAULTS_REVIEWED"].includes(run.status);
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Penalties & waivers" sub={periodLabel(m)}
        actions={<div className="row tight"><Link className="btn sm" href={`?m=${shift(m, -1)}`}>Previous month</Link>{m < thisMonth && <Link className="btn sm" href={`?m=${shift(m, 1)}`}>Next month</Link>}</div>} />
      <div className="stack">
        <p className="small muted">Lateness ({money(rates.latePenaltyNaira * 100)} a day) and absence without permission ({rates.absenceRule === "dayPay" ? "a day's pay" : `${money(rates.absencePenaltyNaira * 100)} a day`}) come from attendance automatically. Enter other penalties here with a reason, or a waiver to reduce someone&apos;s penalties.</p>
        {canEnter && !closed && (
          <ActionForm action={addAdjustmentAction} className="card stack" resetOnSuccess>
            <div className="grid g4">
              <div className="field"><label htmlFor="pa-e">Staff</label><select className="input" id="pa-e" name="employeeId" defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...staff.map((e) => <option key={e.id} value={e.id}>{e.user.firstName} {e.user.lastName}</option>)]}</select><FieldError name="employeeId" /></div>
              <div className="field"><label htmlFor="pa-k">Type</label><select className="input" id="pa-k" name="kind"><option value="penalty">Penalty</option><option value="waiver">Waiver</option></select></div>
              <div className="field"><label htmlFor="pa-a">Amount (₦)</label><input className="input" id="pa-a" name="amount" inputMode="decimal" /><FieldError name="amount" /></div>
              <input type="hidden" name="period" value={m} />
            </div>
            <div className="field"><label htmlFor="pa-r">Reason</label><input className="input" id="pa-r" name="reason" placeholder="e.g. Lesson notes not submitted, week 3" /><FieldError name="reason" /></div>
            <div><SubmitButton size="sm" icon="plus">Add</SubmitButton></div>
          </ActionForm>
        )}
        {closed && <p className="small muted">{periodLabel(m)}&apos;s payroll is approved; new entries go into next month.</p>}
        <section className="card pad-0">
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th>Type</th><th className="r">Amount</th><th>Reason</th><th>Entered</th><th /></tr></thead>
            <tbody>
              {!list.length && <tr><td colSpan={6} className="empty">Nothing entered for {periodLabel(m)}.</td></tr>}
              {list.map((a) => (
                <tr key={a.id}>
                  <td data-label="Staff">{a.employee.user.firstName} {a.employee.user.lastName}</td>
                  <td data-label="Type"><Pill tone={a.kind === "penalty" ? "err" : "ok"}>{a.kind === "penalty" ? "Penalty" : "Waiver"}</Pill></td>
                  <td data-label="Amount" className="r">{money(a.amountKobo)}</td>
                  <td data-label="Reason">{a.reason}</td>
                  <td data-label="Entered" className="small">{a.by} · {fmtDate(a.createdAt)}</td>
                  <td data-label="" className="r">{canEnter && !closed && <ActionForm action={removeAdjustmentAction}><input type="hidden" name="id" value={a.id} /><SubmitButton size="sm" variant="ghost" icon="trash" confirmText="Remove this entry?">Remove</SubmitButton></ActionForm>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
