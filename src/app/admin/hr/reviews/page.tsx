import Link from "next/link";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Empty, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { hrReviewQueue, reviewStaffDocAction, staffDocLabel } from "@/modules/hr";

export const metadata = { title: "To review" };

/** Documents waiting for HR and bank details waiting for the Bursar, oldest first. */
export default async function ReviewsPage() {
  const v = await requireStaff("hr.view.section");
  const docs = v.permissions.has("hr.manage"), bank = v.permissions.has("hr.bank.approve");
  const q = await hrReviewQueue({ docs, bank });
  return (
    <>
      <PageHeader title="To review" sub="Documents for HR to approve, and bank details for the Bursar to verify. Nobody reviews their own." />
      <div className="stack">
        {docs && (
          <section className="card pad-0">
            <div className="card-h"><h3>Documents ({q.docs.length})</h3></div>
            {!q.docs.length ? <Empty title="Nothing to review">New uploads appear here.</Empty> : (
              <div className="tbl-wrap"><table className="t rt">
                <thead><tr><th>Staff</th><th>Document</th><th>Uploaded</th><th /></tr></thead>
                <tbody>{q.docs.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Staff"><Link href={`/admin/hr/${d.employeeId}`}>{d.employee.user.firstName} {d.employee.user.lastName}</Link></td>
                    <td data-label="Document"><a href={`/api/files/${d.fileKey}`} target="_blank" rel="noreferrer">{staffDocLabel(d.kind)}</a></td>
                    <td data-label="Uploaded">{fmtDate(d.uploadedAt)}</td>
                    <td data-label="" className="r">{d.employee.userId === v.user.id ? <span className="small muted">Your own</span> : (
                      <div className="row tight" style={{ justifyContent: "flex-end" }}>
                        <ActionForm action={reviewStaffDocAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton size="sm" variant="success" icon="check">Approve</SubmitButton></ActionForm>
                        <ActionForm action={reviewStaffDocAction} className="row tight"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="decision" value="reject" /><input className="input sm" name="note" placeholder="What's wrong?" aria-label="Reason" style={{ width: 140 }} /><SubmitButton size="sm" variant="ghost">Reject</SubmitButton></ActionForm>
                      </div>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        )}
        {bank && (
          <section className="card pad-0">
            <div className="card-h"><h3>Bank details ({q.banks.length})</h3></div>
            {!q.banks.length ? <Empty title="Nothing to verify">New bank details appear here.</Empty> : (
              <div className="tbl-wrap"><table className="t rt">
                <thead><tr><th>Staff</th><th>Bank</th><th>Account</th><th /></tr></thead>
                <tbody>{q.banks.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Staff"><Link href={`/admin/hr/${e.id}`}>{e.user.firstName} {e.user.lastName}</Link></td>
                    <td data-label="Bank">{e.bankName}</td>
                    <td data-label="Account" className="mono">•••• {e.accountLast4}</td>
                    <td data-label="" className="r"><Link className="btn sm" href={`/admin/hr/${e.id}`}>Check and verify</Link></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        )}
        {!docs && !bank && <Empty title="Nothing for you here">Reviews are done by HR and the Bursar.</Empty>}
      </div>
    </>
  );
}
