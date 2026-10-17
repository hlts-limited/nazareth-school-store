import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Empty, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listRuns, periodLabel, startRunAction } from "@/modules/payroll";
import { RunStatus } from "./_ui";

export const metadata = { title: "Payroll" };

export default async function PayrollRunsPage() {
  const v = await requireStaff("payroll.view");
  const runs = await listRuns();
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const canRun = v.permissions.has("payroll.run");
  return (
    <>
      <PageHeader title="Payroll" sub="Each month: the Bursar calculates and reviews three stages (statutory, tax, penalties), then the Proprietor approves and pays." />
      <div className="stack">
        {canRun && !runs.some((r) => r.period === thisMonth) && (
          <ActionForm action={startRunAction} className="card row tight">
            <label className="lbl" htmlFor="pr-m">Start payroll for</label>
            <input className="input" id="pr-m" type="month" name="period" defaultValue={thisMonth} max={thisMonth} style={{ maxWidth: 190 }} />
            <SubmitButton icon="plus">Start</SubmitButton>
            <FieldError name="period" />
          </ActionForm>
        )}
        <section className="card pad-0">
          {!runs.length ? <Empty title="No payroll yet">{canRun ? "Start this month's payroll above." : "The Bursar starts each month's payroll."}</Empty> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Month</th><th>Staff</th><th>Status</th><th /></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={r.id}>
                  <td data-label="Month"><Link href={`/admin/payroll/${r.period}`}><b>{periodLabel(r.period)}</b></Link></td>
                  <td data-label="Staff">{r._count.items || "—"}</td>
                  <td data-label="Status"><RunStatus s={r.status} /></td>
                  <td data-label="" className="r"><Link className="btn sm" href={`/admin/payroll/${r.period}`}>Open</Link></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </>
  );
}
