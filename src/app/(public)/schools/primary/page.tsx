import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";
import { StageCard } from "../../_stage";

export const metadata: Metadata = { title: "Primary School", description: `Prep 1 to Primary 6 at ${SCHOOL.name}, Festac Town.` };

export default function PrimaryPage() {
  return (
    <>
      <PageHero crumb={[["Our schools"], ["Primary School"]]} title="Primary School" lead="Building strong academic foundations from Prep 1 to Primary 6." img="/images/cultural-day/13.jpg" />
      <Section>
        <Split img="/images/cultural-day/12.jpg" alt="Primary School pupils at Cultural Day">
          <h2>About our Primary School</h2>
          <p>Our Primary School takes pupils from Prep 1 through Primary 6.</p>
          <p>Our balanced curriculum builds strong academic foundations and develops critical thinking and problem-solving abilities. In Upper Primary, a rigorous programme aligned with national standards prepares pupils for the First School Leaving Certificate (FSLC) examination and the next stage of their education.</p>
          <p>Pupils learn with experienced and dedicated teachers, and make use of our computer and science laboratories, library, and sports facilities.</p>
          <div className="row">
            <Link className="btn primary" href="/admissions/process">Admission process</Link>
            <Link className="btn" href="/academics/curriculum">Full curriculum</Link>
          </div>
        </Split>
      </Section>
      <Section eyebrow="Academics" title="Primary curriculum">
        <div className="grid g2">
          <StageCard id="lower-primary" />
          <StageCard id="upper-primary" />
        </div>
      </Section>
      <SectionLinks group="Our schools" current="/schools/primary" />
      <AdmissionCta />
    </>
  );
}
