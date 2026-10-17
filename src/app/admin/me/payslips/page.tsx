import { db } from "@/shared/lib/db";
import { Icon } from "@/shared/ui/icon";
import { Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { periodLabel } from "@/modules/payroll";
import { money } from "../../payroll/_ui";

export const metadata = { title: "My payslips" };

/** A staff member's payslips: every approved month, to download or print. */
export default async function MyPayslipsPage() {
  const v = await requireStaff("self.service");
  const e = await db.employee.findUnique({ where: { userId: v.user.id } });
  if (!e) return <><PageHeader title="My payslips" /><div className="card"><Empty title="No staff record yet">HR hasn&apos;t registered you as a member of staff.</Empty></div></>;
  const items = await db.payrollItem.findMany({
    where: { employeeId: e.id, run: { status: { in: ["APPROVED", "PAID", "LOCKED"] } } },
    include: { run: true, payments: true }, orderBy: { run: { period: "desc" } },
  });
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="My payslips" sub="Each month's payslip shows your pay, every deduction and your totals for the year." />
      <section className="card pad-0">
        {!items.length ? <Empty title="No payslips yet">Your payslip appears here once the month&apos;s payroll is approved.</Empty> : (
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Month</th><th className="r">Gross</th><th className="r">Net pay</th><th>Status</th><th /></tr></thead>
            <tbody>{items.map((i) => {
              const paid = i.payments.some((p) => p.status === "SUCCESS");
              return (
                <tr key={i.id}>
                  <td data-label="Month"><b>{periodLabel(i.run.period)}</b></td>
                  <td data-label="Gross" className="r">{money(i.grossKobo)}</td>
                  <td data-label="Net pay" className="r"><b>{money(i.netKobo)}</b></td>
                  <td data-label="Status">{paid ? <Pill tone="ok">Paid</Pill> : i.held ? <Pill tone="warn">Held: {i.heldReason}</Pill> : <Pill tone="info">Approved</Pill>}</td>
                  <td data-label="" className="r"><div className="row tight" style={{ justifyContent: "flex-end" }}>
                    <a className="btn sm" href={`/api/payslips/${i.id}?print=1`} target="_blank" rel="noopener"><Icon name="print" size="sm" />Print</a>
                    <a className="btn sm" href={`/api/payslips/${i.id}`} download><Icon name="download" size="sm" />Download</a>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
