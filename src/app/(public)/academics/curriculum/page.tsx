import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { AdmissionCta, PageHero, Section, SectionLinks } from "../../_parts";
import { StageCard } from "../../_stage";
import { FACILITIES, STAGES, SUBJECTS } from "../../_content";

export const metadata: Metadata = { title: "Curriculum", description: `The ${SCHOOL.name} curriculum from Kindergarten to Primary 6.` };

export default function CurriculumPage() {
  return (
    <>
      <PageHero crumb={[["Academics"], ["Curriculum"]]} title="Our curriculum" lead="Excellence in education, one pupil at a time — from Kindergarten through Primary 6." img="/images/cultural-day/07.jpg" />
      <Section title="Our academic programmes" lead={`${SCHOOL.name} offers a full education from Kindergarten through Primary School. Our curriculum and experienced educators help pupils achieve strong results at every level, while our foundation of faith and discipline nurtures their character and moral values.`}>
        <nav className="row tight" aria-label="Jump to stage">
          {STAGES.map((s) => <a key={s.id} className="chip" href={`#${s.id}`}>{s.name}</a>)}
          <a className="chip" href="#subjects">Subjects &amp; facilities</a>
        </nav>
      </Section>
      <Section>
        <div className="grid g3">
          {STAGES.map((s) => <StageCard key={s.id} id={s.id} />)}
        </div>
      </Section>
      <Section id="subjects" eyebrow="Primary" title="Subjects offered" lead="A broad curriculum covering all the major disciplines.">
        <div className="value-row">
          {SUBJECTS.map((s) => <span key={s} className="value">{s}</span>)}
        </div>
      </Section>
      <Section eyebrow="Learning spaces" title="Our facilities">
        <div className="grid g4">
          {FACILITIES.map(([icon, title, text]) => (
            <div key={title} className="card stack tight">
              <span className="reason-ic"><Icon name={icon} /></span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </Section>
      <SectionLinks group="Academics" current="/academics/curriculum" />
      <AdmissionCta />
    </>
  );
}
