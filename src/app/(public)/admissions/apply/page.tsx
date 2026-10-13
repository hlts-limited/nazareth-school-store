import type { Metadata } from "next";
import Link from "next/link";
import { ADMISSION, SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { PageHero, Section, SectionLinks } from "../../_parts";
import { SCHOOLS, STAGES } from "../../_content";

export const metadata: Metadata = { title: "Apply online", description: `Apply for a place at ${SCHOOL.name}.` };

// The online form arrives with the admissions module (phase 4). Until then this page
// shows which form fits which class, and how to reach the office.
export default function ApplyPage() {
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Apply online"]]} title="Apply online" lead="Begin your child's journey with us. Choose the form for the class your child is joining." />
      <Section>
        <div className="stack loose">
          <Note tone={ADMISSION.open ? "info" : "warn"} icon={ADMISSION.open ? "info" : "alert"}>
            {ADMISSION.open
              ? "Online applications are coming soon. Please collect a form from the school office in the meantime."
              : ADMISSION.closedNote}
          </Note>
          <div className="grid g2">
            {SCHOOLS.map((s) => (
              <article key={s.href} className="card stack">
                <div className="stack tight">
                  <span className="eyebrow">Admission form</span>
                  <h2>{s.name}</h2>
                  <p className="muted">For children joining:</p>
                </div>
                <div className="row tight">
                  {STAGES.filter((st) => s.stages.includes(st.id)).flatMap((st) => st.classes).map((c) => <span key={c} className="pill plain">{c}</span>)}
                </div>
                <div className="row" style={{ marginTop: "auto" }}>
                  <button type="button" className="btn primary" disabled>Online form not open</button>
                  <Link className="btn" href={s.href}>About the {s.name}</Link>
                </div>
              </article>
            ))}
          </div>
          <div className="card row between">
            <div className="stack tight">
              <h3>Prefer to apply in person?</h3>
              <p className="muted">Visit the school office at {SCHOOL.address.line1}, {SCHOOL.address.line2}, {SCHOOL.officeHours.toLowerCase()}.</p>
            </div>
            <div className="row">
              <a className="btn" href={`tel:${SCHOOL.phone.tel}`}><Icon name="phone" size="sm" />Call the office</a>
              <Link className="btn" href="/admissions/process">Admission process</Link>
            </div>
          </div>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/apply" />
    </>
  );
}
