import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { naira, fmtDate } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { admissionNotice, admissionStatus } from "@/modules/admissions";
import { PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Admission process", description: `How to apply for a place at ${SCHOOL.name}.` };

const STEPS: [string, string][] = [
  ["Fill in the application form", "Apply online on the Apply online page, or collect a form from the school office. If there is a form fee, you pay it securely online with Paystack."],
  ["Save your application link", "You get an application number and a private link. Use the link to upload documents and to see your child's exam date."],
  ["Upload documents", "Upload a passport photograph and birth certificate, plus the latest school report and a testimonial if your child is changing schools."],
  ["Entrance assessment", "The school gives your child an assessment date. It appears on your application page and on the Admission results page."],
  ["Admission results", "When results are published, check them with the application number. Admitted children are then enrolled, and you are invited to the School Store."],
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
              <div><dt>Classes</dt><dd>Kindergarten to Primary 6</dd></div>
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
