import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { fmtDateTime } from "@/shared/lib/format";
import { admissionStatus, lookupResultAction, upcomingExams } from "@/modules/admissions";
import { PageHero, Section, SectionLinks } from "../../_parts";
import { ResultLookupForm } from "./_lookup";

export const metadata: Metadata = { title: "Admission results", description: `Entrance assessment dates and admission results at ${SCHOOL.name}.` };

export default async function ResultsPage() {
  const [s, exams] = await Promise.all([admissionStatus(), upcomingExams()]);
  const published = !!s.window?.resultsPublishedAt;
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Admission results"]]} title="Admission results" lead="Check your child's entrance assessment date and admission result with the application number." />
      <Section>
        <div className="process">
          <ResultLookupForm action={lookupResultAction} />
          <aside className="card stack">
            <h3>{s.window ? `${s.window.session} session` : "Admission"}</h3>
            <p className="small muted">{published ? "Results for this session have been published." : "Results have not been published yet. Assessment dates appear here as they are set."}</p>
            {exams.length > 0 && (
              <dl className="facts">
                {exams.map((e) => <div key={e.id}><dt>{fmtDateTime(e.startsAt)}</dt><dd>{e.venue}</dd></div>)}
              </dl>
            )}
            <p className="small muted">Lost your application number? Call the school office on <a href={`tel:${SCHOOL.phone.tel}`}>{SCHOOL.phone.display}</a>.</p>
          </aside>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/results" />
    </>
  );
}
