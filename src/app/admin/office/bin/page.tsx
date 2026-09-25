import { fmtDateTime } from "@/shared/lib/format";
import { Card, Empty, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { binContents, emptyBinAction, restorePupilAction } from "@/modules/pupils";

export const metadata = { title: "Recently deleted" };

export default async function BinPage() {
  const v = await requireStaff("pupils.manage");
  const list = await binContents();
  const canEmpty = v.permissions.has("pupils.empty_bin");
  return (
    <>
      <PageHeader title="Recently deleted" sub="Deleted pupils stay here for 30 days and can be restored. After that they're removed automatically."
        actions={canEmpty && list.length > 0 ? <ActionForm action={emptyBinAction}><SubmitButton variant="danger" icon="trash" confirmText="Permanently delete everyone in the bin? This can't be undone.">Empty bin</SubmitButton></ActionForm> : undefined} />
      <Card pad={false}>
        {list.length === 0 ? <Empty title="Bin is empty">Pupils you delete appear here for 30 days.</Empty> : (
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Pupil</th><th>Reg no.</th><th>Class</th><th>Deleted</th><th>By</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td data-label="Pupil"><b>{p.firstName} {p.lastName}</b></td><td data-label="Reg no." className="mono">{p.regNumber}</td><td data-label="Class">{p.class.name}</td>
                  <td data-label="Deleted">{p.deletedAt ? fmtDateTime(p.deletedAt) : ""}</td><td data-label="By">{p.deletedBy}</td>
                  <td data-label="" className="r"><ActionForm action={restorePupilAction}><input type="hidden" name="id" value={p.id} /><SubmitButton size="sm" variant="default" icon="restore">Restore</SubmitButton></ActionForm></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      {!canEmpty && list.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Only the Super Admin can empty the bin.</p>}
    </>
  );
}
