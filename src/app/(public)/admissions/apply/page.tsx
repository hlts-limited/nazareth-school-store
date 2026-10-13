import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { naira } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { admissionNotice, admissionStatus } from "@/modules/admissions";
import { PageHero, Section, SectionLinks } from "../../_parts";
import { SCHOOLS, STAGES } from "../../_content";

export const metadata: Metadata = { title: "Apply online", description: `Apply for a place at ${SCHOOL.name}.` };

export default async function ApplyPage() {
  const s = await admissionStatus();
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Apply online"]]} title="Apply online" lead="Begin your child's journey with us. Choose the form for the class your child is joining." />
      <Section>
        <div className="stack loose">
          <Note tone={s.open ? "ok" : "warn"} icon={s.open ? "check" : "alert"}>
            {admissionNotice(s)}
            {s.open && s.window && <> {s.window.formFee ? `The form fee is ${naira(s.window.formFee)}, paid securely online.` : "There is no form fee."}</>}
          </Note>
          <div className="grid g2">
            {SCHOOLS.map((sc) => (
              <article key={sc.href} className="card stack">
                <div className="stack tight">
                  <span className="eyebrow">Admission form</span>
                  <h2>{sc.name}</h2>
                  <p className="muted">For children joining:</p>
                </div>
                <div className="row tight">
                  {STAGES.filter((st) => sc.stages.includes(st.id)).flatMap((st) => st.classes).map((c) => <span key={c} className="pill plain">{c}</span>)}
                </div>
                <div className="row" style={{ marginTop: "auto" }}>
                  {s.open
                    ? <Link className="btn primary" href={`/admissions/apply/form?school=${sc.href.split("/").pop()}`}>Start application<Icon name="chev" size="sm" /></Link>
                    : <button type="button" className="btn primary" disabled>Applications closed</button>}
                  <Link className="btn" href={sc.href}>About the {sc.name}</Link>
                </div>
              </article>
            ))}
          </div>
          <div className="card row between">
            <div className="stack tight">
              <h3>Already applied?</h3>
              <p className="muted">Open the private link you saved when you applied, or check your result with the application number.</p>
            </div>
            <div className="row">
              <Link className="btn" href="/admissions/results">Check a result</Link>
              <a className="btn" href={`tel:${SCHOOL.phone.tel}`}><Icon name="phone" size="sm" />Call the office</a>
            </div>
          </div>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/apply" />
    </>
  );
}
