import Link from "next/link";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, SearchParamSelect, SubmitButton } from "@/shared/ui/client";
import { Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { admissionStatus, admittedList, enrolManyAction, listWindows } from "@/modules/admissions";
import { SelectAll } from "../_select";

export const metadata = { title: "Admitted pupils" };

export default async function AdmittedPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const v = await requireStaff("admissions.view");
  const sp = await searchParams;
  const [windows, current] = await Promise.all([listWindows(), admissionStatus()]);
  const windowId = sp.w === "all" ? undefined : (sp.w ?? current.window?.id);
  const { waiting, enrolled } = await admittedList(windowId);
  const canMove = v.permissions.has("admissions.manage") && v.permissions.has("pupils.manage");

  return (
    <>
      <PageHeader title="Admitted pupils" sub="Children who passed the entrance exam. Move them into the class they applied for so their parents can buy books and uniforms in the School Store."
        actions={<Link className="btn" href="/admin/admissions?status=ADMITTED"><Icon name="file" size="sm" />Applications</Link>} />
      <div className="stack loose">
        {windows.length > 1 && <section className="card"><div className="row"><SearchParamSelect param="w" id="ad-w" label="Session" options={[...windows.map((w) => [w.id, w.session] as [string, string]), ["all", "All sessions"]]} /></div></section>}

        <section className="card stack">
          <div className="row between">
            <h3>Waiting to be moved into a class <span className="muted">({waiting.length})</span></h3>
          </div>
          {waiting.length === 0 ? <Empty title="No one waiting">Children appear here when you record &ldquo;Admitted&rdquo; on their application.</Empty> : (
            <ActionForm action={enrolManyAction} className="stack" id="enrol-form">
              <div className="tbl-wrap"><table className="t rt">
                <thead><tr>{canMove && <th style={{ width: 36 }}><SelectAll form="enrol-form" /></th>}<th>Child</th><th>Class</th><th>Parent</th><th>Application</th></tr></thead>
                <tbody>
                  {waiting.map((a) => (
                    <tr key={a.id}>
                      {canMove && <td data-label=""><input type="checkbox" name="ids" value={a.id} defaultChecked aria-label={`Select ${a.otherNames} ${a.surname}`} /></td>}
                      <td data-label="Child"><b>{a.surname}</b>, {a.otherNames}</td>
                      <td data-label="Class">{a.class.name}</td>
                      <td data-label="Parent">{a.parentName}<div className="small muted">{a.parentPhone}</div></td>
                      <td data-label="Application"><Link className="mono" href={`/admin/admissions/${a.id}`}>{a.number}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {canMove ? (
                <>
                  <Note icon="info">Each ticked child becomes a pupil in their class with the next reg number. Their parent is linked by phone number; a new parent is invited to the School Store by SMS/email.</Note>
                  <div><SubmitButton icon="check" variant="success" confirmText="Move the ticked children into their classes?">Move ticked children into their classes</SubmitButton></div>
                </>
              ) : <p className="small muted">The Secretary moves admitted children into their classes.</p>}
            </ActionForm>
          )}
        </section>

        <section className="card stack">
          <h3>Already in their classes <span className="muted">({enrolled.length})</span></h3>
          {enrolled.length === 0 ? <p className="muted small">None yet.</p> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Pupil</th><th>Reg number</th><th>Class</th><th>Parent</th><th>Moved</th></tr></thead>
              <tbody>
                {enrolled.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Pupil"><b>{a.surname}</b>, {a.otherNames}</td>
                    <td data-label="Reg number" className="mono">{a.pupil ? <Link href={`/admin/office/pupils?q=${encodeURIComponent(a.pupil.regNumber)}`}>{a.pupil.regNumber}</Link> : "—"}</td>
                    <td data-label="Class">{a.pupil?.class.name ?? a.class.name}</td>
                    <td data-label="Parent">{a.parentName}<div className="small muted">{a.parentPhone}</div></td>
                    <td data-label="Moved">{fmtDate(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      </div>
    </>
  );
}
