import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { naira, fmtDate } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { ADMISSION_CLASSES, AGE_DAY, MAX_AGE, MIN_AGE } from "@/shared/lib/admission-age";
import { admissionNotice, admissionStatus } from "@/modules/admissions";
import { PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Admission process", description: `How to apply for a place at ${SCHOOL.name}.` };

const STEPS: [string, string][] = [
  ["Fill in the application form", `Apply online, or register at the school office. The class is chosen by your child's age on ${AGE_DAY} of the year the admission session starts: age ${MIN_AGE} ${ADMISSION_CLASSES[0]}, ${MIN_AGE + 1} ${ADMISSION_CLASSES[1]}, ${MIN_AGE + 2} ${ADMISSION_CLASSES[2]}, and so on up to age ${MAX_AGE} ${ADMISSION_CLASSES[ADMISSION_CLASSES.length - 1]}. If there is a form fee, you pay it securely online with Paystack.`],
  ["Upload documents", "With the form, upload the candidate's passport photograph, a baptismal certificate (Catholic) or dedication certificate (non-Catholic), and the birth certificate. Phone photos are fine."],
  ["Save your application link", "You get an application number and a private link. Use the link to see your child's exam date and result, and to replace a document."],
  ["Entrance exam", "The school gives your child an exam date. You'll get it by text or email, and it appears on your application page and on the Admission results page."],
  ["Admission results", "When results are published, check whether your child passed with the application number. Children who pass are placed in their class, and you are invited to the School Store to buy books and uniforms."],
];

export default async function ProcessPage() {
  const s = await admissionStatus();
  const w = s.window;
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Admission process"]]} title="Admission process" lead="Apply online or visit the school office. Here is what to expect, step by step." />
      <Section>
        <div className="process">
          <div className="stack">
            <Note tone={s.open ? "ok" : "warn"} icon={s.open ? "check" : "alert"}>{admissionNotice(s)}</Note>
            <ol className="steps">
              {STEPS.map(([title, text], i) => (
                <li key={title}>
                  <span className="step-n" aria-hidden="true">{i + 1}</span>
                  <div className="stack tight"><h3>{title}</h3><p className="muted">{text}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <aside className="card stack">
            <h3>Admission at a glance</h3>
            <dl className="facts">
              {w && <div><dt>Session</dt><dd>{w.session}</dd></div>}
              <div><dt>Status</dt><dd>{s.open ? "Open" : s.upcoming ? "Opening soon" : "Closed"}</dd></div>
              {w && (s.open || s.upcoming) && <div><dt>{s.open ? "Closes" : "Opens"}</dt><dd>{fmtDate(s.open ? new Date(w.closesAt.getTime() - 1) : w.opensAt)}</dd></div>}
              {w && (s.open || s.upcoming) && <div><dt>Form fee</dt><dd>{w.formFee ? naira(w.formFee) : "Free"}</dd></div>}
              <div><dt>Admission into</dt><dd>{ADMISSION_CLASSES[0]} to {ADMISSION_CLASSES[ADMISSION_CLASSES.length - 1]} (ages {MIN_AGE} to {MAX_AGE})</dd></div>
              <div><dt>Office hours</dt><dd>{SCHOOL.officeHours}</dd></div>
            </dl>
            <div className="stack tight">
              <a className="btn block" href={`tel:${SCHOOL.phone.tel}`}><Icon name="phone" size="sm" />{SCHOOL.phone.display}</a>
              <Link className="btn primary block" href="/admissions/apply">{s.open ? "Apply online" : "Admission forms"}</Link>
            </div>
          </aside>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/process" />
    </>
  );
}
