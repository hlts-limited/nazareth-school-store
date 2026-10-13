import Link from "next/link";
import { fmtDate, fmtDateTime, isoDay, naira } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { addExamSlotAction, admissionStatus, deleteExamSlotAction, listWindows, publishResultsAction, saveWindowAction } from "@/modules/admissions";

export const metadata = { title: "Admission windows" };

type W = Awaited<ReturnType<typeof listWindows>>[number];

function WindowFields({ w }: { w?: W }) {
  const id = w?.id ?? "new";
  return (
    <>
      {w && <input type="hidden" name="id" value={w.id} />}
      <div className="grid g4">
        <div className="field"><label htmlFor={`ws-${id}`}>Session</label><input className="input" id={`ws-${id}`} name="session" placeholder="2027/2028" defaultValue={w?.session} /><FieldError name="session" /></div>
        <div className="field"><label htmlFor={`wo-${id}`}>Opens</label><input className="input" type="date" id={`wo-${id}`} name="opensAt" defaultValue={w ? isoDay(w.opensAt) : undefined} /><FieldError name="opensAt" /></div>
        <div className="field"><label htmlFor={`wc-${id}`}>Closes (last day)</label><input className="input" type="date" id={`wc-${id}`} name="closesAt" defaultValue={w ? isoDay(new Date(w.closesAt.getTime() - 1)) : undefined} /><FieldError name="closesAt" /></div>
        <div className="field"><label htmlFor={`wf-${id}`}>Form fee (₦)</label><input className="input tnum" id={`wf-${id}`} name="formFee" inputMode="numeric" defaultValue={w?.formFee ?? 0} /><span className="hint">0 = free. Paid online with Paystack.</span><FieldError name="formFee" /></div>
      </div>
      <div className="field"><label htmlFor={`wn-${id}`}>Note for staff (optional)</label><input className="input" id={`wn-${id}`} name="note" defaultValue={w?.note ?? ""} /></div>
    </>
  );
}

export default async function WindowsPage() {
  const v = await requireStaff("admissions.view");
  const canPublish = v.permissions.has("admissions.publish");
  const [windows, status] = await Promise.all([listWindows(), admissionStatus()]);
  const now = new Date();

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Admission windows & exams" sub="The website's Apply online page opens and closes on these dates automatically." actions={<Link className="btn" href="/admin/admissions"><Icon name="file" size="sm" />Applications</Link>} />
      <div className="stack loose">
        {canPublish && (
          <details className="card stack" open={!windows.length}>
            <summary className="row between" style={{ cursor: "pointer" }}><h3>New admission window</h3><Icon name="plus" size="sm" /></summary>
            <ActionForm action={saveWindowAction} className="stack" resetOnSuccess>
              <WindowFields />
              <div><SubmitButton icon="plus">Create window</SubmitButton></div>
            </ActionForm>
          </details>
        )}

        {!windows.length && <div className="card"><Empty title="No admission windows yet">Create the first window above. Until then the website says admission is closed.</Empty></div>}

        {windows.map((w) => {
          const isOpen = status.open && status.window?.id === w.id;
          const state = isOpen ? ["ok", "Open now"] : w.opensAt > now ? ["info", "Upcoming"] : ["plain", "Closed"];
          return (
            <section key={w.id} className="card stack">
              <div className="row between">
                <div className="stack tight">
                  <h2 className="row tight">{w.session} <span className={`pill ${state[0]}`}>{state[1]}</span></h2>
                  <span className="muted small">{fmtDate(w.opensAt)} – {fmtDate(new Date(w.closesAt.getTime() - 1))} · {w.formFee ? `${naira(w.formFee)} form fee` : "Free form"} · {w._count.applications} application{w._count.applications === 1 ? "" : "s"}</span>
                </div>
                <div className="row tight">
                  <Link className="btn sm" href={`/admin/admissions?w=${w.id}`}>Applications</Link>
                  {canPublish && (
                    <ActionForm action={publishResultsAction}>
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="publish" value={w.resultsPublishedAt ? "0" : "1"} />
                      <SubmitButton size="sm" variant={w.resultsPublishedAt ? "default" : "primary"} icon={w.resultsPublishedAt ? "eye" : "check"}
                        confirmText={w.resultsPublishedAt ? "Hide results from the website?" : `Publish ${w.session} results? Families will see every decision you've saved.`}>
                        {w.resultsPublishedAt ? "Unpublish results" : "Publish results"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </div>
              {w.resultsPublishedAt && <Note tone="ok" icon="check">Results published {fmtDateTime(w.resultsPublishedAt)}. Families can check them on the website.</Note>}
              {w.note && <p className="small muted">{w.note}</p>}

              <div className="stack tight">
                <h3>Entrance exam slots</h3>
                {w.examSlots.length ? (
                  <div className="tbl-wrap"><table className="t rt">
                    <thead><tr><th>Date and time</th><th>Venue</th><th>Booked</th><th>Note</th>{canPublish && <th />}</tr></thead>
                    <tbody>
                      {w.examSlots.map((s) => (
                        <tr key={s.id}>
                          <td data-label="When">{fmtDateTime(s.startsAt)}</td>
                          <td data-label="Venue">{s.venue}</td>
                          <td data-label="Booked">{s._count.applications} / {s.capacity}</td>
                          <td data-label="Note">{s.note ?? "—"}</td>
                          {canPublish && <td className="r">{s._count.applications === 0 && (
                            <ActionForm action={deleteExamSlotAction}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="ghost" size="sm" icon="trash" confirmText="Delete this exam slot?">Delete</SubmitButton></ActionForm>
                          )}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                ) : <p className="small muted">No exam slots yet.</p>}
                {canPublish && (
                  <ActionForm action={addExamSlotAction} className="row slot-form" resetOnSuccess>
                    <input type="hidden" name="windowId" value={w.id} />
                    <div className="field"><label htmlFor={`ss-${w.id}`}>Date and time</label><input className="input" type="datetime-local" id={`ss-${w.id}`} name="startsAt" /><FieldError name="startsAt" /></div>
                    <div className="field"><label htmlFor={`sv-${w.id}`}>Venue</label><input className="input" id={`sv-${w.id}`} name="venue" placeholder="School hall" /><FieldError name="venue" /></div>
                    <div className="field"><label htmlFor={`sc-${w.id}`}>Places</label><input className="input tnum" id={`sc-${w.id}`} name="capacity" inputMode="numeric" defaultValue={40} style={{ width: 90 }} /><FieldError name="capacity" /></div>
                    <div className="field"><label htmlFor={`sn-${w.id}`}>Note (shown to families)</label><input className="input" id={`sn-${w.id}`} name="note" placeholder="Bring a pencil and eraser" /></div>
                    <SubmitButton variant="default" icon="plus">Add slot</SubmitButton>
                  </ActionForm>
                )}
              </div>

              {canPublish && (
                <details>
                  <summary className="small" style={{ cursor: "pointer" }}>Edit dates and fee</summary>
                  <ActionForm action={saveWindowAction} className="stack" >
                    <WindowFields w={w} />
                    <div><SubmitButton variant="default">Save changes</SubmitButton></div>
                  </ActionForm>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
