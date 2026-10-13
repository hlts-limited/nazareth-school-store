import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";
import { StageCard } from "../../_stage";

export const metadata: Metadata = { title: "Pre-School", description: `Kindergarten and Pre-Nursery at ${SCHOOL.name}, Festac Town.` };

export default function PreSchoolPage() {
  return (
    <>
      <PageHero crumb={[["Our schools"], ["Pre-School"]]} title="Pre-School" lead="A nurturing start for our youngest learners in Kindergarten and Pre-Nursery." img="/images/cultural-day/05.jpg" />
      <Section>
        <Split img="/images/cultural-day/10.jpg" alt="Pre-School pupils at Cultural Day">
          <h2>About our Pre-School</h2>
          <p>Our Pre-School is where Kindergarten and Pre-Nursery pupils begin their journey at {SCHOOL.name}.</p>
          <p>In a nurturing environment, young learners develop foundational skills through play-based and structured learning activities — building early phonics and numeracy, creativity through arts and music, and the social skills they need to grow in confidence.</p>
          <p>Like every part of {SCHOOL.name}, the Pre-School is built on a strong foundation of faith, discipline, and academic excellence. We nurture each child&apos;s character and moral values alongside their intellect, because we believe every child is gifted and capable of greatness.</p>
          <div className="row">
            <Link className="btn primary" href="/admissions/process">Admission process</Link>
            <Link className="btn" href="/academics/curriculum">Full curriculum</Link>
          </div>
        </Split>
      </Section>
      <Section eyebrow="Academics" title="Pre-School curriculum">
        <div className="grid g2"><StageCard id="pre-school" /></div>
      </Section>
      <SectionLinks group="Our schools" current="/schools/pre-school" />
      <AdmissionCta />
    </>
  );
}
