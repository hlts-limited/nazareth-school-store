import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";
import { StageCard } from "../../_stage";

export const metadata: Metadata = { title: "School B", description: `Primary 3 to Primary 6 at ${SCHOOL.name}, Festac Town.` };

export default function SchoolBPage() {
  return (
    <>
      <PageHero crumb={[["Our schools"], ["School B"]]} title="School B" lead="Primary 3 to Primary 6: preparing pupils for the FSLC examination and secondary school." img="/images/cultural-day/13.jpg" />
      <Section>
        <Split img="/images/cultural-day/14.jpg" alt="School B pupils at Cultural Day">
          <h2>About School B</h2>
          <p>School B takes pupils from Primary 3 through Primary 6, the final years of primary education at {SCHOOL.name}.</p>
          <p>A rigorous programme aligned with national standards deepens pupils&apos; knowledge across the core subjects, adds coding, and prepares them for the First School Leaving Certificate (FSLC) examination and the next stage of their education.</p>
          <p>Pupils grow in independence and leadership, supported by experienced teachers and our computer and science laboratories, library, and sports facilities.</p>
          <div className="row">
            <Link className="btn primary" href="/admissions/process">Admission process</Link>
            <Link className="btn" href="/academics/curriculum">Full curriculum</Link>
          </div>
        </Split>
      </Section>
      <Section eyebrow="Academics" title="School B curriculum">
        <div className="grid g2"><StageCard id="school-b" /></div>
      </Section>
      <SectionLinks group="Our schools" current="/schools/school-b" />
      <AdmissionCta />
    </>
  );
}
