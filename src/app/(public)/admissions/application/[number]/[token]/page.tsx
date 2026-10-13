import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SCHOOL } from "@/shared/config/school";
import { env } from "@/shared/config/env";
import { fmtDate, fmtDateTime, naira } from "@/shared/lib/format";
import { ActionForm, CopyButton, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import {
  applicationByToken, applicationPath, confirmApplicationFee, DECIDED, DOC_KINDS, missingDocs, payApplicationFeeAction, uploadApplicationDocAction,
} from "@/modules/admissions";
import { PageHero, Section } from "../../../../_parts";

// The link carries a private token, so keep it out of search engines and caches.
export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const OUTCOME: Record<string, { tone: "ok" | "warn" | "err"; title: string; text: string }> = {
  ADMITTED: { tone: "ok", title: "Congratulations! Your child has been offered admission.", text: "Please visit the school office to complete enrolment and pay school fees." },
  ENROLLED: { tone: "ok", title: "Your child is enrolled.", text: "Welcome to the Nazareth family. Check your phone for your School Store invite." },
  WAITLISTED: { tone: "warn", title: "Your child is on the waiting list.", text: "We will contact you if a place becomes available." },
  NOT_ADMITTED: { tone: "err", title: "We are unable to offer a place this time.", text: "Thank you for your interest. Please contact the school office if you have questions." },
};

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ number: string; token: string }>; searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const { number, token } = await params;
  const sp = await searchParams;
  let app = await applicationByToken(number, token);
  if (!app) notFound();

  // Back from Paystack: confirm with Paystack's API before marking the form fee paid
  let payment: "paid" | "already" | "failed" | null = null;
  const ref = sp.reference ?? sp.trxref;
  if (ref && app.status === "AWAITING_PAYMENT" && ref === app.feeRef) {
    payment = await confirmApplicationFee(ref);
    app = (await applicationByToken(number, token))!;
  }

  const link = `${env().APP_URL}${applicationPath(app.number, token)}`;
  const missing = missingDocs(app.documents);
  const canUpload = app.status === "SUBMITTED" || app.status === "EXAM_SCHEDULED";
  const outcome = app.window.resultsPublishedAt && DECIDED.includes(app.status) ? OUTCOME[app.status] : null;
  const child = `${app.otherNames} ${app.surname}`;

  return (
    <>
      <PageHero crumb={[["Admissions", "/admissions/process"], ["Your application"]]} title={`Application for ${app.otherNames.split(/\s+/)[0]}`} lead={`${app.class.name} · ${app.window.session} session · Application number ${app.number}`} />
      <Section>
        <div className="process">
          <div className="stack loose">
            {payment === "paid" && <Note tone="ok" icon="check">Payment received. Your application has been sent to the school.</Note>}
            {payment === "failed" && <Note tone="err" icon="alert">The payment did not go through, and your card was not charged. You can try again below.</Note>}

            {app.status === "AWAITING_PAYMENT" && (
              <div className="card stack">
                <h2>Pay the form fee</h2>
                <p className="muted">Your application is saved, but it is sent to the school only after the {naira(app.feeAmount)} form fee is paid.</p>
                <ActionForm action={payApplicationFeeAction}>
                  <input type="hidden" name="number" value={app.number} />
                  <input type="hidden" name="token" value={token} />
                  <SubmitButton icon="card">Pay {naira(app.feeAmount)} with Paystack</SubmitButton>
                </ActionForm>
              </div>
            )}

            {outcome && (
              <div className={`note ${outcome.tone} result-note`}>
                <Icon name={outcome.tone === "ok" ? "check" : "info"} />
                <span><b>{outcome.title}</b><br />{outcome.text}</span>
              </div>
            )}

            {app.status === "WITHDRAWN" && <Note tone="warn" icon="alert">This application has been withdrawn. Please contact the school office if this is a mistake.</Note>}

            {app.status !== "AWAITING_PAYMENT" && app.status !== "WITHDRAWN" && (
              <div className="card stack">
                <div className="row between">
                  <h2>Documents</h2>
                  {missing.length === 0 ? <span className="pill ok">All required documents uploaded</span> : <span className="pill warn">{missing.length} required still to upload</span>}
                </div>
                <p className="muted small">JPG, PNG, WebP or PDF, up to 4 MB each. A clear phone photo is fine.</p>
                <ul className="doc-list">
                  {DOC_KINDS.map((d) => {
                    const doc = app.documents.find((x) => x.kind === d.kind);
                    return (
                      <li key={d.kind}>
                        <div className="row nowrap" style={{ gap: 10 }}>
                          <span className={`doc-ic ${doc ? "done" : ""}`}><Icon name={doc ? "check" : "file"} size="sm" /></span>
                          <div className="grow">
                            <b>{d.label}</b>{d.required ? "" : <span className="muted"> (if any)</span>}
                            <div className="small muted">{doc ? `${doc.fileName} · uploaded ${fmtDate(doc.uploadedAt)}` : d.required ? "Required" : "Optional"}</div>
                          </div>
                        </div>
                        {canUpload && (
                          <ActionForm action={uploadApplicationDocAction} className="row tight doc-up" resetOnSuccess>
                            <input type="hidden" name="number" value={app.number} />
                            <input type="hidden" name="token" value={token} />
                            <input type="hidden" name="kind" value={d.kind} />
                            <input className="input" type="file" name="file" aria-label={`Choose ${d.label}`} accept={d.kind === "passport" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"} />
                            <SubmitButton variant="default" size="sm" icon="upload">{doc ? "Replace" : "Upload"}</SubmitButton>
                            <FieldError name={`file-${d.kind}`} />
                          </ActionForm>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {app.examSlot && (
              <div className="card stack">
                <h2>Entrance assessment</h2>
                <dl className="facts">
                  <div><dt>Date and time</dt><dd>{fmtDateTime(app.examSlot.startsAt)}</dd></div>
                  <div><dt>Venue</dt><dd>{app.examSlot.venue}</dd></div>
                </dl>
                {app.examSlot.note && <p className="muted">{app.examSlot.note}</p>}
                <p className="small muted">Please arrive 30 minutes early with your application number.</p>
              </div>
            )}
          </div>

          <aside className="stack">
            <div className="card stack">
              <h3>Keep this link</h3>
              <p className="small muted">This private page is how you upload documents and see your child&apos;s exam date. Bookmark it or send it to yourself on WhatsApp. Don&apos;t share it with anyone else.</p>
              <div className="row tight">
                <CopyButton text={link} label="Copy link" done="Link copied" />
                <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`My ${SCHOOL.name} application (${app.number}): ${link}`)}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" size="sm" />WhatsApp</a>
              </div>
            </div>
            <div className="card stack">
              <h3>Application details</h3>
              <dl className="facts">
                <div><dt>Number</dt><dd className="mono">{app.number}</dd></div>
                <div><dt>Child</dt><dd>{child}</dd></div>
                <div><dt>Class</dt><dd>{app.class.name}</dd></div>
                <div><dt>Parent</dt><dd>{app.parentName}</dd></div>
                <div><dt>Submitted</dt><dd>{app.submittedAt ? fmtDate(app.submittedAt) : "Not yet"}</dd></div>
              </dl>
              <Link className="btn block" href="/admissions/results">Check a result</Link>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
