import type { Metadata } from "next";
import Link from "next/link";
import { ADMISSION, SCHOOL } from "@/shared/config/school";
import { Empty } from "@/shared/ui/primitives";
import { PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Admission results", description: `Entrance assessment dates and admission results at ${SCHOOL.name}.` };

// Result lookup by application number arrives with the admissions module (phase 4).
export default function ResultsPage() {
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Admission results"]]} title="Admission results" lead="Entrance assessment dates and admission results are published here." />
      <Section>
        <div className="card">
          <Empty
            title={`No results published for ${ADMISSION.session}`}
            action={<Link className="btn" href="/contact">Contact the school office</Link>}
          >
            When results are ready, you will be able to check your child&apos;s result here with the application number you received when you applied.
          </Empty>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/results" />
    </>
  );
}
