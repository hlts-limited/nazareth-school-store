import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { AdmissionCta, Checklist, PageHero, Section, SectionLinks, Split } from "../../_parts";

export const metadata: Metadata = { title: "Co-curricular activities", description: `Sports, events and activities at ${SCHOOL.name}.` };

const EVENTS: [string, string, string][] = [
  ["users", "Inter-house sports", "A day of school spirit, teamwork, and friendly competition."],
  ["heart", "Cultural Day", "Celebrating our heritage through traditional attire, music, dance, and food."],
  ["sun", "Creative arts & music", "Art, music, and creative expression from Pre-School upwards."],
  ["layers", "Coding programmes", "Hands-on coding that builds digital skills and problem-solving."],
];

export default function CoCurricularPage() {
  return (
    <>
      <PageHero crumb={[["Academics"], ["Co-curricular"]]} title="Co-curricular activities" lead="Building character, teamwork, and lasting memories beyond the classroom." img="/images/cultural-day/11.jpg" />
      <Section>
        <Split img="/images/cultural-day/09.jpg" alt={`Pupils of ${SCHOOL.name} performing at Cultural Day`}>
          <span className="eyebrow">Physical fitness</span>
          <h2>Sports and physical development</h2>
          <p>At {SCHOOL.name}, learning extends beyond the classroom. Our football field, basketball court, and indoor sports facilities give pupils room to play, compete, and stay active.</p>
          <Checklist items={[
            "Discipline: focus, commitment and good sportsmanship",
            "Teamwork: learning to cooperate and support one another",
            "A healthy lifestyle: active habits that last a lifetime",
          ]} />
        </Split>
      </Section>
      <Section eyebrow="Holistic development" title="Events and activities" lead="Vibrant events that help every pupil discover their talents.">
        <div className="grid g4">
          {EVENTS.map(([icon, title, text]) => (
            <div key={title} className="card stack tight">
              <span className="reason-ic"><Icon name={icon} /></span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </Section>
      <SectionLinks group="Academics" current="/academics/co-curricular" />
      <AdmissionCta />
    </>
  );
}
