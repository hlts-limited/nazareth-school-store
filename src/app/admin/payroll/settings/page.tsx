import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { payrollRates, saveRatesAction } from "@/modules/payroll";

export const metadata = { title: "Rates & tax bands" };

const Pct = ({ id, label, value, hint }: { id: string; label: string; value: number; hint?: string }) => (
  <div className="field"><label htmlFor={`rt-${id}`}>{label}</label><input className="input" id={`rt-${id}`} name={id} inputMode="decimal" defaultValue={value} /><span className="hint">{hint ?? "%"}</span><FieldError name={id} /></div>
);

/** The rates and bands each payroll run copies when stage 1 is calculated. */
export default async function PayrollSettingsPage() {
  const v = await requireStaff("payroll.view");
  const r = await payrollRates();
  const can = v.permissions.has("payroll.run");
  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Rates & tax bands" sub="Each run copies these when stage 1 is calculated, so changing them never alters a run already approved or paid." />
      <ActionForm action={saveRatesAction} className="stack">
        <Note tone="info" icon="info">The defaults follow the plan. The school&apos;s tax adviser should confirm the pension base, the NHIS rate, NHF on basic, and the penalty amounts before the first live payroll.</Note>
        <fieldset className="card stack" disabled={!can}>
          <legend>Statutory deductions (stage 1)</legend>
          <div className="grid g3">
            <Pct id="pensionPct" label="Pension (employee)" value={r.pensionPct} hint="% of annual gross" />
            <Pct id="pensionEmployerPct" label="Pension (employer)" value={r.pensionEmployerPct} hint="% (on the remittance file only)" />
            <Pct id="nhfPct" label="NHF" value={r.nhfPct} hint="% of basic salary" />
            <Pct id="basicPctOfGross" label="Basic salary" value={r.basicPctOfGross} hint="% of gross (100 = gross is basic)" />
            <Pct id="nhisPct" label="NHIS / NHIA (employee)" value={r.nhisPct} hint="% of annual gross; 0 = not deducted" />
            <Pct id="rentReliefPct" label="Rent relief" value={r.rentReliefPct} hint="% of declared yearly rent" />
            <div className="field"><label htmlFor="rt-cap">Rent relief cap (₦ a year)</label><input className="input" id="rt-cap" name="rentReliefCapNaira" inputMode="decimal" defaultValue={r.rentReliefCapNaira} /></div>
          </div>
        </fieldset>
        <fieldset className="card stack" disabled={!can}>
          <legend>Tax bands (stage 2), annual taxable income</legend>
          <div className="tbl-wrap"><table className="t">
            <thead><tr><th>Band</th><th>Up to (₦ a year)</th><th>Rate (%)</th></tr></thead>
            <tbody>{r.taxBands.map((b, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{b.upToNaira === null ? <span className="muted">No upper limit<input type="hidden" name="bandTop" value="" /></span> : <input className="input sm" name="bandTop" inputMode="numeric" defaultValue={b.upToNaira} aria-label={`Band ${i + 1} upper limit`} />}</td>
                <td><input className="input sm" name="bandRate" inputMode="decimal" defaultValue={b.ratePct} aria-label={`Band ${i + 1} rate`} style={{ maxWidth: 90 }} /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="small muted">Nigeria Tax Act 2025 bands: 0% to ₦800,000, then 15%, 18%, 21%, 23% and 25% above ₦50m.</p>
        </fieldset>
        <fieldset className="card stack" disabled={!can}>
          <legend>Penalties (stage 3)</legend>
          <div className="grid g3">
            <div className="field"><label htmlFor="rt-late">Per late day (₦)</label><input className="input" id="rt-late" name="latePenaltyNaira" inputMode="decimal" defaultValue={r.latePenaltyNaira} /><span className="hint">₦1,000 is the plan&apos;s illustration.</span></div>
            <div className="field"><label htmlFor="rt-abs">Absence without permission</label>
              <select className="input" id="rt-abs" name="absenceRule" defaultValue={r.absenceRule}><option value="dayPay">A day&apos;s pay (monthly gross ÷ school days)</option><option value="fixed">A fixed amount per day</option></select>
            </div>
            <div className="field"><label htmlFor="rt-absn">Fixed amount per absent day (₦)</label><input className="input" id="rt-absn" name="absencePenaltyNaira" inputMode="decimal" defaultValue={r.absencePenaltyNaira} /></div>
            <Pct id="maxPenaltyPct" label="Most a month's penalties may take" value={r.maxPenaltyPct} hint="% of pay after tax; the rest carries to next month" />
          </div>
        </fieldset>
        {can && <div><SubmitButton icon="check">Save rates</SubmitButton></div>}
      </ActionForm>
    </div>
  );
}
