import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listRuns, periodLabel, startRunAction } from "@/modules/payroll";
import { RunStatus } from "./_ui";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";
import { PaystackStatus } from "./_paystack";
import { Icon } from "@/shared/ui/icon";

export const metadata = { title: "Payroll" };

export default async function PayrollRunsPage() {
  const v = await requireStaff("payroll.view");
  const runs = await listRuns();
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const canRun = v.permissions.has("payroll.run");
  // The staff tax list covers approved months only, so its figures are final
  const final = runs.filter((r) => ["APPROVED", "PAID", "LOCKED"].includes(r.status)).map((r) => r.period).sort().reverse();
  const years = [...new Set(final.map((p) => p.slice(0, 4)))];
  return (
    <>
      <PageHeader title="Payroll" sub="Each month: Accounts calculates and reviews three stages (statutory, tax, penalties), then the Super Admin approves and pays." actions={<PaystackStatus />} />
      <div className="stack">
        <form className="card row tight tax-list" action="/api/admin/payroll/tax-list" method="get">
          <span className="grow"><b>Staff tax list</b><span className="small muted"> · every staff member and the tax (PAYE) deducted, as Excel</span></span>
          {final.length ? (
            <>
              <label className="sr-only" htmlFor="tl-p">Period</label>
              <select className="input w-auto" id="tl-p" name="period" defaultValue={final[0]}>
                <optgroup label="One month">{final.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}</optgroup>
                <optgroup label="Whole year (month by month)">{years.map((y) => <option key={y} value={y}>{y}</option>)}</optgroup>
              </select>
              <button className="btn primary" type="submit"><Icon name="download" size="sm" /> Download tax list</button>
            </>
          ) : <span className="small muted">Ready once a month&apos;s payroll is approved.</span>}
        </form>
        {canRun && !runs.some((r) => r.period === thisMonth) && (
          <ActionForm action={startRunAction} className="card row tight">
            <label className="lbl" htmlFor="pr-m">Start payroll for</label>
            <input className="input mw-190" id="pr-m" type="month" name="period" defaultValue={thisMonth} max={thisMonth} />
            <SubmitButton icon="plus">Start</SubmitButton>
            <FieldError name="period" />
          </ActionForm>
        )}
        <section className="card pad-0">
          <DataTable
            empty="No payroll yet" emptyText={canRun ? "Start this month's payroll above." : "Accounts starts each month's payroll."}
            columns={[{ label: "Month", sortable: true }, { label: "Staff", sortable: true }, { label: "Status", sortable: true }, { label: "", right: true }]}
            rows={runs.map((r) => ({
              id: r.id,
              sort: [r.period, r._count.items, r.status, null],
              cells: keyed([
                <Link key="m" href={`/admin/payroll/${r.period}`}><b>{periodLabel(r.period)}</b></Link>,
                r._count.items || "—",
                <RunStatus key="s" s={r.status} />,
                <Link key="o" className="btn sm" href={`/admin/payroll/${r.period}`}>Open</Link>,
              ]),
            }))}
          />
        </section>
      </div>
    </>
  );
}
