import type { Metadata } from "next";
import Link from "next/link";
import { ADMISSION, SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Admission process", description: `How to apply for a place at ${SCHOOL.name}.` };

const STEPS: [string, string][] = [
  ["Get the admission form", "Start your application on the Apply online page, or collect a form from the school office."],
  ["Fill in and submit", "Complete the form with your child's details and the class you are applying for."],
  ["Upload documents", "Upload the required documents, such as a passport photograph and birth certificate."],
  ["Entrance assessment", "Your child is invited for an entrance assessment. Dates are published on the Admission results page."],
  ["Admission results", "Check the result with your application number. Successful pupils then complete school fees payment to take up their place."],
];

export default function ProcessPage() {
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Admission process"]]} title="Admission process" lead="Apply online or visit the school office. Here is what to expect, step by step." />
      <Section>
        <div className="process">
          <div className="stack">
            {!ADMISSION.open && <Note tone="warn" icon="alert">{ADMISSION.closedNote}</Note>}
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
              <div><dt>Session</dt><dd>{ADMISSION.session}</dd></div>
              <div><dt>Status</dt><dd>{ADMISSION.open ? "Open" : "Closed"}</dd></div>
              <div><dt>Classes</dt><dd>Kindergarten to Primary 6</dd></div>
              <div><dt>Forms</dt><dd>Online, or at the school office</dd></div>
              <div><dt>Office hours</dt><dd>{SCHOOL.officeHours}</dd></div>
            </dl>
            <div className="stack tight">
              <a className="btn block" href={`tel:${SCHOOL.phone.tel}`}><Icon name="phone" size="sm" />{SCHOOL.phone.display}</a>
              <Link className="btn primary block" href="/admissions/apply">Apply online</Link>
            </div>
          </aside>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/process" />
    </>
  );
}
