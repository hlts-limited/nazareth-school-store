import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";
import { StageCard } from "../../_stage";

export const metadata: Metadata = { title: "School A", description: `Prep 1 to Primary 2 at ${SCHOOL.name}, Festac Town.` };

export default function SchoolAPage() {
  return (
    <>
      <PageHero crumb={[["Our schools"], ["School A"]]} title="School A" lead="Prep 1, Prep 2, Primary 1 and Primary 2: building strong foundations for learning." img="/images/cultural-day/12.jpg" />
      <Section>
        <Split img="/images/cultural-day/11.jpg" alt="School A pupils at Cultural Day">
          <h2>About School A</h2>
          <p>School A takes pupils from Prep 1 through Primary 2, the years when children become confident readers, writers and problem-solvers.</p>
          <p>A balanced curriculum builds strong foundations in English, Mathematics and Science, alongside Computer Studies and French, and develops critical thinking from the very first years of primary school.</p>
          <p>Pupils learn with experienced and dedicated teachers, and make use of our computer and science laboratories, library, and sports facilities. When they finish Primary 2, they move up to School B.</p>
          <div className="row">
            <Link className="btn primary" href="/admissions/process">Admission process</Link>
            <Link className="btn" href="/academics/curriculum">Full curriculum</Link>
          </div>
        </Split>
      </Section>
      <Section eyebrow="Academics" title="School A curriculum">
        <div className="grid g2"><StageCard id="school-a" /></div>
      </Section>
      <SectionLinks group="Our schools" current="/schools/school-a" />
      <AdmissionCta />
    </>
  );
}
