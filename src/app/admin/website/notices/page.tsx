import { fmtDateTime, isoDay } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { deleteNoticeAction, listNotices, saveNoticeAction } from "@/modules/website";

export const metadata = { title: "Website notices" };

type N = Awaited<ReturnType<typeof listNotices>>[number];

function NoticeFields({ n }: { n?: N }) {
  const id = n?.id ?? "new";
  return (
    <>
      {n && <input type="hidden" name="id" value={n.id} />}
      <div className="field"><label htmlFor={`nt-${id}`}>Notice</label><input className="input" id={`nt-${id}`} name="text" maxLength={220} defaultValue={n?.text} placeholder="e.g. Cultural Day holds on Wednesday, 14th October." /><FieldError name="text" /></div>
      <div className="grid g3">
        <div className="field"><label htmlFor={`ns-${id}`}>Show from</label><input className="input" type="date" id={`ns-${id}`} name="startsAt" defaultValue={isoDay(n?.startsAt)} /><FieldError name="startsAt" /></div>
        <div className="field"><label htmlFor={`ne-${id}`}>Until (last day, optional)</label><input className="input" type="date" id={`ne-${id}`} name="endsAt" defaultValue={n?.endsAt ? isoDay(new Date(n.endsAt.getTime() - 1)) : ""} /><FieldError name="endsAt" /></div>
        <div className="field"><label htmlFor={`nl-${id}`}>Link (optional)</label><input className="input" id={`nl-${id}`} name="link" defaultValue={n?.link ?? ""} placeholder="/events" /><FieldError name="link" /></div>
      </div>
    </>
  );
}

export default async function NoticesPage() {
  await requireStaff("website.manage");
  const notices = await listNotices();
  const now = new Date();
  const state = (n: N) => n.startsAt > now ? ["info", "Scheduled"] : n.endsAt && n.endsAt <= now ? ["plain", "Ended"] : ["ok", "Showing"];
  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Website notices" sub="Short messages in the bar at the top of every website page. The admission status is added automatically." />
      <div className="stack loose">
        <ActionForm action={saveNoticeAction} className="card stack" resetOnSuccess>
          <h3>New notice</h3>
          <NoticeFields />
          <div><SubmitButton icon="plus">Add notice</SubmitButton></div>
        </ActionForm>
        {notices.length > 3 && <Note>Up to 3 notices show at once (the newest).</Note>}
        {notices.length === 0 ? <div className="card"><Empty title="No notices yet">Add one above, e.g. a reminder about resumption or an upcoming event.</Empty></div> : (
          <div className="stack">
            {notices.map((n) => {
              const [tone, label] = state(n);
              return (
                <section key={n.id} className="card stack">
                  <div className="row between">
                    <div className="stack tight">
                      <b>{n.text}</b>
                      <span className="small muted">From {fmtDateTime(n.startsAt)}{n.endsAt ? ` until ${fmtDateTime(n.endsAt)}` : ", no end date"}{n.link ? ` · links to ${n.link}` : ""}</span>
                    </div>
                    <div className="row tight">
                      <span className={`pill ${tone}`}>{label}</span>
                      <ActionForm action={deleteNoticeAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <SubmitButton variant="ghost" size="sm" icon="trash" confirmText="Delete this notice?">Delete</SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                  <details>
                    <summary className="small" style={{ cursor: "pointer" }}><Icon name="cog" size="sm" /> Edit</summary>
                    <ActionForm action={saveNoticeAction} className="stack">
                      <NoticeFields n={n} />
                      <div><SubmitButton variant="default">Save notice</SubmitButton></div>
                    </ActionForm>
                  </details>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
