"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, SubmitButton } from "@/shared/ui/client";

type Action = (p: ActionResult, f: FormData) => Promise<ActionResult>;
type Part = { id: string; name: string; monthly: number; custom: boolean };

const n = (naira: number) => `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/**
 * How this person's gross is made up. Each part can be changed; the total must equal the gross HR set.
 * "Use the school's shares" goes back to the default split (e.g. 50 / 25 / 15 / 10).
 */
export function SalarySplit({ action, employeeId, grossKobo, parts, base, canEdit }: {
  action: Action; employeeId: string; grossKobo: number; parts: Part[]; base: "gross" | "components"; canEdit: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(parts.map((p) => [p.id, String(p.monthly / 100)])));
  const total = Object.values(values).reduce((a, v) => a + (Number(v.replace(/[,\s₦]/g, "")) || 0), 0);
  const gross = grossKobo / 100;
  const diff = Math.round((total - gross) * 100) / 100;
  const custom = parts.some((p) => p.custom);
  return (
    <section className="card stack">
      <div className="row between"><h3>Salary breakdown</h3><span className="small muted">{custom ? "Set for this person" : "School's default shares"}</span></div>
      <ActionForm action={action} className="stack">
        <input type="hidden" name="employeeId" value={employeeId} />
        <div className="tbl-wrap"><table className="t">
          <thead><tr><th>Part</th><th className="r">Monthly (₦)</th><th className="r">Share</th></tr></thead>
          <tbody>
            {parts.map((p) => {
              const v = Number(values[p.id]?.replace(/[,\s₦]/g, "")) || 0;
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="r">{canEdit
                    ? <input className="input sm mw-160 text-right tnum" name={`part.${p.id}`} inputMode="decimal" value={values[p.id] ?? ""} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} aria-label={`${p.name} monthly amount`} />
                    : <span className="tnum">{n(p.monthly / 100)}</span>}</td>
                  <td className="r small muted tnum">{gross ? `${Math.round((v / gross) * 1000) / 10}%` : "—"}</td>
                </tr>
              );
            })}
            <tr className="sum">
              <td><b>Gross</b></td>
              <td className="r tnum"><b className={diff === 0 ? "" : "c-err"}>{n(total)}</b></td>
              <td className="r small">{diff === 0 ? <span className="c-ok">Matches</span> : <span className="c-err">{diff > 0 ? `${n(diff)} too much` : `${n(-diff)} short`}</span>}</td>
            </tr>
          </tbody>
        </table></div>
        <p className="small muted">Gross is {n(gross)} (set in the record). {base === "components" ? "Pension and NHF are worked out on the parts ticked for them in Rates & tax." : "Pension and NHF are currently worked out on the whole gross; the breakdown shows on payslips."}</p>
        {canEdit && (
          <div className="row tight">
            <SubmitButton size="sm" icon="check" disabled={diff !== 0}>Save breakdown</SubmitButton>
            {custom && <SubmitButton size="sm" variant="ghost" name="reset" value="1">Use the school&apos;s shares</SubmitButton>}
          </div>
        )}
      </ActionForm>
    </section>
  );
}
