import Link from "next/link";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { addAdjustmentAction, payrollRates, periodLabel, removeAdjustmentAction, adjustmentsFor, runByPeriod } from "@/modules/payroll";
import { money } from "../_ui";
import { activeStaff } from "@/modules/hr";
import { BonusEntry, PenaltyEntry } from "./_entry";

export const metadata = { title: "Penalties & bonuses" };

const shift = (m: string, by: number) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7); };
const KIND = { penalty: ["Penalty", "err"], waiver: ["Waiver", "ok"], bonus: ["Bonus", "info"] } as const;

/**
 * Accounts enters penalties (in the school's categories), waivers and bonuses for a month, each with a reason.
 * Lateness and absence come from attendance automatically.
 */
export default async function PenaltiesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const v = await requireStaff("payroll.view");
  const sp = await searchParams;
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : thisMonth;
  const canEnter = v.permissions.has("payroll.penalties");
  const [staff, list, rates, run] = await Promise.all([activeStaff(), adjustmentsFor(m), payrollRates(), runByPeriod(m)]);
  const closed = run && !["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED", "DEFAULTS_REVIEWED"].includes(run.status);
  const people = staff.filter((e) => e.userId !== v.user.id).map((e) => ({ id: e.id, name: `${e.user.firstName} ${e.user.lastName}` }));
  const total = (k: string) => list.filter((a) => a.kind === k).reduce((s, a) => s + a.amountKobo, 0);
  return (
    <div className="mw-1080">
      <PageHeader title="Penalties & bonuses" sub={periodLabel(m)}
        actions={<div className="row tight"><Link className="btn sm" href={`?m=${shift(m, -1)}`}>Previous month</Link>{m < thisMonth && <Link className="btn sm" href={`?m=${shift(m, 1)}`}>Next month</Link>}</div>} />
      <div className="stack">
        <p className="small muted">Lateness ({money(rates.latePenaltyNaira * 100)} a day) and absence without permission ({rates.absenceRule === "dayPay" ? "a day's pay" : `${money(rates.absencePenaltyNaira * 100)} a day`}) come from attendance automatically. Penalty categories and bonus types are set in {v.permissions.has("payroll.run") ? <Link href="/admin/payroll/settings">Rates &amp; tax</Link> : "Rates & tax (Accounts)"}. Nobody can enter one for themselves, and whoever enters one can&apos;t approve that month&apos;s payroll.</p>
        {canEnter && !closed && (
          <div className="grid g2 items-start">
            <PenaltyEntry action={addAdjustmentAction} staff={people} period={m} categories={rates.penaltyCategories.filter((c) => c.active).map((c) => ({ name: c.name, defaultNaira: c.defaultNaira }))} />
            <BonusEntry action={addAdjustmentAction} staff={people} period={m} types={rates.bonusTypes.filter((b) => b.active).map((b) => b.name)} />
          </div>
        )}
        {closed && <p className="small muted">{periodLabel(m)}&apos;s payroll is approved; new entries go into next month.</p>}
        <div className="grid g3">
          <div className="card kpi"><span className="l">Penalties entered</span><span className="v">{money(total("penalty"))}</span></div>
          <div className="card kpi"><span className="l">Waivers</span><span className="v">{money(total("waiver"))}</span></div>
          <div className="card kpi"><span className="l">Bonuses</span><span className="v">{money(total("bonus"))}</span></div>
        </div>
        <section className="card pad-0">
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th>Type</th><th>Category</th><th className="r">Amount</th><th>Reason</th><th>Entered</th><th /></tr></thead>
            <tbody>
              {!list.length && <tr><td colSpan={7} className="empty">Nothing entered for {periodLabel(m)}.</td></tr>}
              {list.map((a) => {
                const k = KIND[a.kind as keyof typeof KIND] ?? KIND.penalty;
                return (
                  <tr key={a.id}>
                    <td data-label="Staff">{a.employee.user.firstName} {a.employee.user.lastName}</td>
                    <td data-label="Type"><Pill tone={k[1]}>{k[0]}</Pill></td>
                    <td data-label="Category">{a.category ?? "—"}</td>
                    <td data-label="Amount" className="r">{a.kind === "bonus" ? "+" : a.kind === "penalty" ? "−" : ""}{money(a.amountKobo)}</td>
                    <td data-label="Reason">{a.reason}</td>
                    <td data-label="Entered" className="small">{a.by} · {fmtDate(a.createdAt)}</td>
                    <td data-label="" className="r">{canEnter && !closed && <ActionForm action={removeAdjustmentAction}><input type="hidden" name="id" value={a.id} /><SubmitButton size="sm" variant="ghost" icon="trash" confirmText="Remove this entry?">Remove</SubmitButton></ActionForm>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
