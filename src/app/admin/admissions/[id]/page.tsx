import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, fmtDateTime, naira } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { suggestRegNumber } from "@/modules/pupils";
import {
  applicationDetail, decideAction, DOC_KINDS, enrolAction, missingDocs, setExamSlotAction, STATUS_LABEL, withdrawAction,
} from "@/modules/admissions";
import { STATUS_TONE } from "../_tone";

export const metadata = { title: "Application" };

const DETAIL_LABELS: [string, string][] = [
  ["currentClass", "Current class"], ["nationality", "Nationality"], ["stateOfOrigin", "State of origin"], ["religion", "Religion"], ["languages", "Languages"],
  ["occupation", "Parent's occupation"], ["otherParentName", "Other parent"], ["otherParentPhone", "Other parent's phone"],
];

const age = (dob: Date) => {
  const now = new Date();
  let y = now.getFullYear() - dob.getFullYear();
  if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) y--;
  return y;
};

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireStaff("admissions.view");
  const app = await applicationDetail((await params).id);
  if (!app) notFound();
  const canManage = v.permissions.has("admissions.manage");
  const [classes, reg] = app.status === "ADMITTED" && canManage ? await Promise.all([listClasses(), suggestRegNumber()]) : [[], ""];
  const details = (app.details ?? {}) as Record<string, string | undefined>;
  const missing = missingDocs(app.documents);
  const open = ["SUBMITTED", "EXAM_SCHEDULED", "ADMITTED", "WAITLISTED", "NOT_ADMITTED"].includes(app.status);

  return (
    <div style={{ maxWidth: 1080 }}>
      <PageHeader
        title={<span className="row tight">{app.surname}, {app.otherNames} <span className={`pill ${STATUS_TONE[app.status]}`}>{STATUS_LABEL[app.status]}</span></span>}
        sub={<><span className="mono">{app.number}</span> · {app.class.name} · {app.window.session} session</>}
        actions={<Link className="btn" href="/admin/admissions"><Icon name="back" size="sm" />All applications</Link>}
      />
      <div className="detail-grid">
        <div className="stack">
          {app.status === "AWAITING_PAYMENT" && <Note tone="warn" icon="alert">The family hasn&apos;t paid the {naira(app.feeAmount)} form fee yet, so this application isn&apos;t complete.</Note>}
          {app.window.resultsPublishedAt && open && <Note>Results for {app.window.session} are published: the family sees any decision you save straight away.</Note>}

          <section className="card stack">
            <h3>The child</h3>
            <dl className="facts">
              <div><dt>Full name</dt><dd>{app.otherNames} {app.surname}</dd></div>
              <div><dt>Date of birth</dt><dd>{fmtDate(app.dateOfBirth)} (age {age(app.dateOfBirth)})</dd></div>
              <div><dt>Gender</dt><dd>{app.gender}</dd></div>
              <div><dt>Applying for</dt><dd>{app.class.name}</dd></div>
              <div><dt>Previous school</dt><dd>{app.previousSchool ?? "—"}</dd></div>
              {DETAIL_LABELS.slice(0, 5).filter(([k]) => details[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{details[k]}</dd></div>)}
            </dl>
            {details.health && <Note tone="warn" icon="heart"><b>Health or learning needs:</b> {details.health}</Note>}
          </section>

          <section className="card stack">
            <h3>Parent or guardian</h3>
            <dl className="facts">
              <div><dt>Name</dt><dd>{app.parentName} ({app.relationship})</dd></div>
              <div><dt>Phone</dt><dd><a href={`tel:${app.parentPhone}`}>{app.parentPhone}</a></dd></div>
              <div><dt>Email</dt><dd>{app.parentEmail ? <a href={`mailto:${app.parentEmail}`}>{app.parentEmail}</a> : "—"}</dd></div>
              <div><dt>Address</dt><dd>{app.address}</dd></div>
              {DETAIL_LABELS.slice(5).filter(([k]) => details[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{details[k]}</dd></div>)}
            </dl>
          </section>

          <section className="card stack">
            <div className="row between"><h3>Documents</h3>{missing.length ? <span className="pill warn">Missing: {missing.map((m) => m.label).join(", ")}</span> : <span className="pill ok">Required documents in</span>}</div>
            <div className="doc-grid">
              {DOC_KINDS.map((d) => {
                const doc = app.documents.find((x) => x.kind === d.kind);
                const src = doc ? `/api/files/${doc.fileKey}` : null;
                return (
                  <div key={d.kind} className="doc-card">
                    {src && doc?.mimeType.startsWith("image/")
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={d.label} /></a>
                      : <div className="doc-ph"><Icon name="file" /></div>}
                    <div className="stack tight">
                      <b className="small">{d.label}</b>
                      {doc ? <a className="small" href={src!} target="_blank" rel="noreferrer">Open {doc.mimeType === "application/pdf" ? "PDF" : "image"}</a> : <span className="small muted">{d.required ? "Not uploaded" : "Not provided"}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card stack">
            <h3>Entrance assessment</h3>
            {app.examSlot ? <p><b>{fmtDateTime(app.examSlot.startsAt)}</b><br /><span className="muted">{app.examSlot.venue}</span></p> : <p className="muted">Not scheduled yet.</p>}
            {canManage && ["SUBMITTED", "EXAM_SCHEDULED"].includes(app.status) && (
              app.window.examSlots.length ? (
                <ActionForm action={setExamSlotAction} className="stack tight">
                  <input type="hidden" name="id" value={app.id} />
                  <label className="lbl" htmlFor="slot">Exam slot</label>
                  <select className="input" id="slot" name="slotId" defaultValue={app.examSlotId ?? ""}>
                    <option value="">Not scheduled</option>
                    {app.window.examSlots.map((s) => <option key={s.id} value={s.id} disabled={s._count.applications >= s.capacity && s.id !== app.examSlotId}>{fmtDateTime(s.startsAt)} · {s.venue} ({s._count.applications}/{s.capacity})</option>)}
                  </select>
                  <SubmitButton variant="default" size="sm">Save exam slot</SubmitButton>
                </ActionForm>
              ) : <p className="small muted">Add exam slots under <Link href="/admin/admissions/windows">Windows &amp; exams</Link> first.</p>
            )}
          </section>

          {canManage && open && (
            <section className="card stack">
              <h3>Decision</h3>
              {app.decidedAt && <p className="small muted">Last decided {fmtDateTime(app.decidedAt)}{app.decisionNote ? `: “${app.decisionNote}”` : ""}</p>}
              <ActionForm action={decideAction} className="stack tight">
                <input type="hidden" name="id" value={app.id} />
                <div className="stack tight">
                  {(["ADMITTED", "WAITLISTED", "NOT_ADMITTED"] as const).map((d) => (
                    <label key={d} className="check"><input type="radio" name="decision" value={d} defaultChecked={app.status === d} /> {STATUS_LABEL[d]}</label>
                  ))}
                </div>
                <FieldError name="decision" />
                <label className="lbl" htmlFor="note">Note for the file (staff only)</label>
                <textarea className="input" id="note" name="note" rows={2} defaultValue={app.decisionNote ?? ""} />
                <SubmitButton size="sm">Save decision</SubmitButton>
              </ActionForm>
            </section>
          )}

          {canManage && app.status === "ADMITTED" && (
            <section className="card stack">
              <h3>Enrol as a pupil</h3>
              <p className="small muted">Creates the pupil record and links it to the parent by phone number. A new parent gets a School Store invite.</p>
              <ActionForm action={enrolAction} className="stack tight">
                <input type="hidden" name="id" value={app.id} />
                <label className="lbl" htmlFor="reg">Reg number</label>
                <input className="input mono" id="reg" name="regNumber" defaultValue={reg} />
                <FieldError name="regNumber" />
                <label className="lbl" htmlFor="cls">Class</label>
                <select className="input" id="cls" name="classId" defaultValue={app.classId}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <SubmitButton variant="success" size="sm" icon="check">Enrol {app.otherNames.split(/\s+/)[0]}</SubmitButton>
              </ActionForm>
            </section>
          )}

          {app.pupil && (
            <section className="card stack">
              <h3>Enrolled</h3>
              <p>{app.pupil.firstName} {app.pupil.lastName} · <span className="mono">{app.pupil.regNumber}</span></p>
              <Link className="btn sm" href={`/admin/office/pupils?q=${encodeURIComponent(app.pupil.regNumber)}`}>Open in Pupils</Link>
            </section>
          )}

          <section className="card stack">
            <h3>History</h3>
            <dl className="facts small">
              <div><dt>Started</dt><dd>{fmtDateTime(app.createdAt)}</dd></div>
              {app.feePaidAt && <div><dt>Form fee paid</dt><dd>{naira(app.feeAmount)} · {fmtDate(app.feePaidAt)}</dd></div>}
              <div><dt>Submitted</dt><dd>{app.submittedAt ? fmtDateTime(app.submittedAt) : "—"}</dd></div>
              {app.decidedAt && <div><dt>Decided</dt><dd>{fmtDateTime(app.decidedAt)}</dd></div>}
            </dl>
            {canManage && !["ENROLLED", "WITHDRAWN"].includes(app.status) && (
              <ActionForm action={withdrawAction}>
                <input type="hidden" name="id" value={app.id} />
                <SubmitButton variant="ghost" size="sm" confirmText="Mark this application as withdrawn?">Mark as withdrawn</SubmitButton>
              </ActionForm>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
