import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";

export const metadata: Metadata = { title: "Our history", description: `The story of ${SCHOOL.name}, Festac Town.` };

const FOUNDATION: [string, string, string][] = [
  ["heart", "Faith", "Our foundation is built on faith."],
  ["shield", "Discipline", "We build self-discipline, integrity, and respect."],
  ["chart", "Excellence", "We pursue academic excellence at every level."],
  ["users", "Character", "We nurture moral values alongside the intellect."],
];

export default function HistoryPage() {
  return (
    <>
      <PageHero crumb={[["About"], ["Our history"]]} title="Our history" lead={`The story of ${SCHOOL.name}, Festac Town: ${SCHOOL.motto.toLowerCase()}.`} />
      <Section>
        <Split img="/images/cultural-day/02.jpg" alt={`Pupils of ${SCHOOL.name} at Cultural Day`}>
          <h2>The story of {SCHOOL.name}</h2>
          <p>{SCHOOL.name} is a nursery and primary school in Festac Town, Lagos, built on a strong foundation of faith, discipline, and academic excellence.</p>
          <p>Our motto, &ldquo;{SCHOOL.motto}&rdquo;, reflects what we want for every child entrusted to our care: to develop not only their intellect, but also their character and moral values. Our vision is a society where every child has access to good, quality, functional education regardless of social background.</p>
          <p>Today, under the supervision of {SCHOOL.supervisor}, our dedicated team of educators work to create a supportive and inspiring environment where pupils can thrive and reach their full potential.</p>
        </Split>
      </Section>
      <Section eyebrow="Our motto" title={SCHOOL.motto}>
        <div className="grid g4">
          {FOUNDATION.map(([icon, title, text]) => (
            <div key={title} className="card stack tight">
              <span className="reason-ic"><Icon name={icon} /></span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </Section>
      <SectionLinks group="About" current="/about/history" />
      <AdmissionCta />
    </>
  );
}
