import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDateTime } from "@/shared/lib/format";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Kpi, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { calculateAction, markReviewedAction, overrideAction, periodLabel, runByPeriod, runTotals, STAGE_ORDER, type Overrides } from "@/modules/payroll";
import { money, RunStatus } from "../_ui";

export const metadata = { title: "Payroll run" };
export const dynamic = "force-dynamic";

type Lines = {
  statutory: { annualGross: number; pension: number; nhf: number; nhis: number; rentRelief: number; taxable: number; off: string[] };
  overrides: Overrides;
  tax?: { annual: number; monthly: number };
  defaults?: { late: number; absence: number; manual: number; waived: number; carried: number; total: number; applied: number; carryForward: number; days: { late: number; absent: number; schoolDays: number } };
};

const ITEMS: [keyof Overrides, string][] = [["pension", "Pension"], ["nhf", "NHF"], ["nhis", "NHIS"], ["rent", "Rent relief"]];

export default async function PayrollRunPage({ params }: { params: Promise<{ period: string }> }) {
  const v = await requireStaff("payroll.view");
  const run = await runByPeriod((await params).period);
  if (!run) notFound();
  const canRun = v.permissions.has("payroll.run");
  const pos = STAGE_ORDER.indexOf(run.status);
  const t = runTotals(run.items);
  const rows = run.items.map((it) => ({ it, l: it.lines as unknown as Lines, name: `${it.employee.user.firstName} ${it.employee.user.lastName}` }));

  const Stage = ({ n, title, done, calcAt, calcBy, revAt, revBy, children }: { n: 1 | 2 | 3; title: string; done: boolean; calcAt: Date | null; calcBy: string | null; revAt: Date | null; revBy: string | null; children: React.ReactNode }) => {
    const open = pos === n - 1;
    return (
      <section className={`card pad-0 pr-stage${open ? " open" : ""}${done ? " done" : ""}`}>
        <div className="card-h">
          <h3><span className="step-n">{done ? <Icon name="check" size="sm" /> : n}</span> {title}</h3>
          <span className="small muted">{calcAt ? `Calculated ${fmtDateTime(calcAt)} by ${calcBy}` : "Not calculated"}{revAt ? ` · reviewed by ${revBy}` : ""}</span>
        </div>
        {calcAt ? children : <p className="pad muted small">{open ? "Press Calculate to work out this stage." : `Opens when stage ${n - 1} is reviewed.`}</p>}
        {canRun && open && (
          <div className="row tight pad">
            <ActionForm action={calculateAction}><input type="hidden" name="runId" value={run.id} /><input type="hidden" name="stage" value={n} /><SubmitButton size="sm" variant="default" icon="refresh">Calculate</SubmitButton></ActionForm>
            {calcAt && <ActionForm action={markReviewedAction}><input type="hidden" name="runId" value={run.id} /><input type="hidden" name="stage" value={n} /><SubmitButton size="sm" icon="check" confirmText={n === 3 ? "Mark stage 3 reviewed and send this payroll to the Proprietor for approval?" : undefined}>Mark reviewed</SubmitButton></ActionForm>}
          </div>
        )}
        {canRun && pos > n - 1 && pos < 4 && <p className="pad small muted">To change this stage, press Calculate again on it: every later stage is reset.</p>}
        {canRun && pos > n - 1 && pos < 4 && (
          <div className="pad" style={{ paddingTop: 0 }}><ActionForm action={calculateAction}><input type="hidden" name="runId" value={run.id} /><input type="hidden" name="stage" value={n} /><SubmitButton size="sm" variant="ghost" icon="refresh" confirmText={`Calculate stage ${n} again? Every later stage will need calculating and reviewing again.`}>Calculate again</SubmitButton></ActionForm></div>
        )}
      </section>
    );
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader title={`Payroll: ${periodLabel(run.period)}`} sub={<RunStatus s={run.status} />}
        actions={<Link className="btn" href="/admin/payroll"><Icon name="back" size="sm" />All runs</Link>} />
      <div className="stack">
        {run.sentBackNote && pos < 4 && <Note tone="warn" icon="alert">Sent back by the Proprietor: {run.sentBackNote}</Note>}
        {run.items.length > 0 && (
          <div className="grid g4">
            <Kpi label="Staff" value={`${t.staff}${t.held ? ` (${t.held} held)` : ""}`} />
            <Kpi label="Gross" value={money(t.gross)} />
            <Kpi label="Statutory + tax" value={money(t.statutory + t.tax)} />
            <Kpi label="Net to pay" value={pos >= 3 ? money(t.netPayable) : "—"} sub={t.held ? "excludes held staff" : undefined} />
          </div>
        )}
        {rows.some((r) => r.it.held) && (
          <Note tone="warn" icon="alert">Held (not paid until fixed): {rows.filter((r) => r.it.held).map((r) => `${r.name}: ${r.it.heldReason}`).join("; ")}.</Note>
        )}

        <Stage n={1} title="Statutory deductions" done={pos >= 1} calcAt={run.statutoryCalcAt} calcBy={run.statutoryCalcBy} revAt={run.statutoryRevAt} revBy={run.statutoryRevBy}>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th className="r">Monthly gross</th><th className="r">Pension</th><th className="r">NHF</th><th className="r">NHIS</th><th className="r">Rent relief (yr)</th><th className="r">Taxable (yr)</th><th>Switched off</th></tr></thead>
            <tbody>{rows.map(({ it, l, name }) => (
              <tr key={it.id}>
                <td data-label="Staff"><b>{name}</b>{it.held && <div><Pill tone="warn">Held</Pill></div>}</td>
                <td data-label="Gross" className="r">{money(it.grossKobo)}</td>
                <td data-label="Pension" className="r">{money(it.pensionKobo)}</td>
                <td data-label="NHF" className="r">{money(it.nhfKobo)}</td>
                <td data-label="NHIS" className="r">{money(it.nhisKobo)}</td>
                <td data-label="Rent relief" className="r">{money(l.statutory.rentRelief)}</td>
                <td data-label="Taxable" className="r">{money(l.statutory.taxable)}</td>
                <td data-label="Switched off">
                  {l.statutory.off.length ? <span className="small">{l.statutory.off.map((k) => `${k.toUpperCase()}: ${l.overrides[k as keyof Overrides]?.reason}`).join("; ")}</span> : <span className="small muted">—</span>}
                  {canRun && pos < 4 && (
                    <details className="fold small"><summary>Switch an item</summary>
                      <ActionForm action={overrideAction} className="stack tight">
                        <input type="hidden" name="employeeId" value={it.employeeId} />
                        <select className="input sm" name="item" aria-label="Item">{ITEMS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
                        <label className="check small"><input type="checkbox" name="off" defaultChecked /> Switch off (untick to switch back on)</label>
                        <input className="input sm" name="reason" placeholder="Reason, e.g. on probation" aria-label="Reason" />
                        <SubmitButton size="sm" variant="default">Save</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </Stage>

        <Stage n={2} title="Tax (PAYE)" done={pos >= 2} calcAt={run.taxCalcAt} calcBy={run.taxCalcBy} revAt={run.taxRevAt} revBy={run.taxRevBy}>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th className="r">Taxable (yr)</th><th className="r">Tax (yr)</th><th className="r">Tax (month)</th><th className="r">Pay after tax</th></tr></thead>
            <tbody>{rows.map(({ it, l, name }) => (
              <tr key={it.id}>
                <td data-label="Staff">{name}</td>
                <td data-label="Taxable" className="r">{money(l.statutory.taxable)}</td>
                <td data-label="Tax (yr)" className="r">{money(l.tax?.annual ?? 0)}</td>
                <td data-label="Tax (month)" className="r"><b>{money(it.taxKobo)}</b></td>
                <td data-label="After tax" className="r">{money(it.grossKobo - it.pensionKobo - it.nhfKobo - it.nhisKobo - it.taxKobo)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Stage>

        <Stage n={3} title="Penalties" done={pos >= 3} calcAt={run.defaultsCalcAt} calcBy={run.defaultsCalcBy} revAt={run.defaultsRevAt} revBy={run.defaultsRevBy}>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th className="r">Late / absent days</th><th className="r">Lateness</th><th className="r">Absence</th><th className="r">Other − waived</th><th className="r">Taken</th><th className="r">Carried over</th><th className="r">Net pay</th></tr></thead>
            <tbody>{rows.map(({ it, l, name }) => {
              const d = l.defaults;
              return (
                <tr key={it.id}>
                  <td data-label="Staff">{name}</td>
                  <td data-label="Days" className="r">{d ? `${d.days.late} / ${d.days.absent}` : "—"}</td>
                  <td data-label="Lateness" className="r">{d ? money(d.late) : "—"}</td>
                  <td data-label="Absence" className="r">{d ? money(d.absence) : "—"}</td>
                  <td data-label="Other" className="r">{d ? `${money(d.manual + d.carried)} − ${money(d.waived)}` : "—"}</td>
                  <td data-label="Taken" className="r">{money(it.penaltiesKobo)}</td>
                  <td data-label="Carried" className="r">{it.carryKobo ? money(it.carryKobo) : "—"}</td>
                  <td data-label="Net" className="r"><b>{money(it.netKobo)}</b></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <p className="pad small muted">Penalties come from the month&apos;s attendance and the entries under <Link href="/admin/payroll/penalties">Penalties &amp; waivers</Link>. They are taken after tax and don&apos;t reduce taxable income.</p>
        </Stage>

        {pos >= 3 && <Note tone={pos === 3 ? "warn" : "ok"} icon={pos === 3 ? "clock" : "check"}>{pos === 3 ? "Waiting for the Proprietor to approve." : `Approved by ${run.approvedBy}.`}</Note>}
      </div>
    </div>
  );
}
