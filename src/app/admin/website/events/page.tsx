import { fmtDateTime } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Empty, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { deleteEventAction, listEvents, saveEventAction } from "@/modules/website";

export const metadata = { title: "Events" };

type E = Awaited<ReturnType<typeof listEvents>>[number];

/** yyyy-mm-ddThh:mm in Lagos time, for datetime-local inputs */
const localInput = (d?: Date | null) => {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
};

function EventFields({ e }: { e?: E }) {
  const id = e?.id ?? "new";
  return (
    <>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid g2">
        <div className="field"><label htmlFor={`et-${id}`}>Event</label><input className="input" id={`et-${id}`} name="title" defaultValue={e?.title} placeholder="Inter-house sports" /><FieldError name="title" /></div>
        <div className="field"><label htmlFor={`ev-${id}`}>Venue (optional)</label><input className="input" id={`ev-${id}`} name="venue" defaultValue={e?.venue ?? ""} placeholder="School field" /></div>
        <div className="field"><label htmlFor={`es-${id}`}>Starts</label><input className="input" type="datetime-local" id={`es-${id}`} name="startsAt" defaultValue={localInput(e?.startsAt)} /><FieldError name="startsAt" /></div>
        <div className="field"><label htmlFor={`ee-${id}`}>Ends (optional)</label><input className="input" type="datetime-local" id={`ee-${id}`} name="endsAt" defaultValue={localInput(e?.endsAt)} /><FieldError name="endsAt" /></div>
      </div>
      <div className="field"><label htmlFor={`ed-${id}`}>Details for parents (optional)</label><textarea className="input" id={`ed-${id}`} name="description" rows={3} defaultValue={e?.description ?? ""} /></div>
      <label className="check"><input type="checkbox" name="published" defaultChecked={e ? e.published : true} /> Show on the website</label>
    </>
  );
}

export default async function EventsAdminPage() {
  await requireStaff("website.manage");
  const events = await listEvents();
  const now = new Date();
  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Events" sub="Upcoming events appear on the website's Events page and the next three on the homepage." />
      <div className="stack loose">
        <details className="card stack" open={!events.length}>
          <summary className="row between" style={{ cursor: "pointer" }}><h3>New event</h3></summary>
          <ActionForm action={saveEventAction} className="stack" resetOnSuccess>
            <EventFields />
            <div><SubmitButton icon="plus">Add event</SubmitButton></div>
          </ActionForm>
        </details>
        {events.length === 0 ? <div className="card"><Empty title="No events yet">Add resumption dates, sports days, open days and more.</Empty></div> : events.map((e) => (
          <section key={e.id} className="card stack">
            <div className="row between">
              <div className="stack tight">
                <h3>{e.title}</h3>
                <span className="small muted">{fmtDateTime(e.startsAt)}{e.endsAt ? ` – ${fmtDateTime(e.endsAt)}` : ""}{e.venue ? ` · ${e.venue}` : ""}</span>
              </div>
              <div className="row tight">
                {!e.published ? <span className="pill plain">Hidden</span> : (e.endsAt ?? e.startsAt) < now ? <span className="pill plain">Past</span> : <span className="pill ok">Upcoming</span>}
                <ActionForm action={deleteEventAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <SubmitButton variant="ghost" size="sm" icon="trash" confirmText={`Delete "${e.title}"?`}>Delete</SubmitButton>
                </ActionForm>
              </div>
            </div>
            <details>
              <summary className="small" style={{ cursor: "pointer" }}>Edit</summary>
              <ActionForm action={saveEventAction} className="stack">
                <EventFields e={e} />
                <div><SubmitButton variant="default">Save event</SubmitButton></div>
              </ActionForm>
            </details>
          </section>
        ))}
      </div>
    </div>
  );
}
