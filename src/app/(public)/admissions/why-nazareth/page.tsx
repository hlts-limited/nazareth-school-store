import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";

export const metadata: Metadata = { title: "Why Nazareth?", description: `Why parents choose ${SCHOOL.name}, Festac Town.` };

const REASONS: [string, string, string][] = [
  ["chart", "Academic excellence", "Our curriculum and experienced educators help pupils achieve strong results at every level."],
  ["users", "Qualified teachers", "Experienced and dedicated educators committed to every pupil's success."],
  ["layers", "Modern facilities", "Computer and science laboratories, a library, and sports facilities support learning."],
  ["heart", "Faith & moral values", "We nurture character and moral values alongside the intellect."],
  ["check", "Excellent results", "Pupils are well prepared for the FSLC and other examinations."],
  ["sun", "Vibrant events", "From inter-house sports to cultural festivals, our events build character and teamwork."],
  ["qr", "Technology & coding", "Computer Studies and coding give pupils strong digital skills from an early age."],
  ["shield", "Safe environment", "A secure and caring place to learn for every pupil."],
];

export default function WhyNazarethPage() {
  return (
    <>
      <PageHero crumb={[["Admissions"], ["Why Nazareth?"]]} title={`Why choose ${SCHOOL.name}?`} lead="Reasons parents trust us with their children's education." />
      <Section>
        <Split img="/images/cultural-day/08.jpg" alt={`Pupils of ${SCHOOL.name} at Cultural Day`}>
          <span className="eyebrow">Our commitment</span>
          <h2>Why bring your child to {SCHOOL.name}?</h2>
          <p>Choosing the right school is one of the most important decisions you will make as a parent. At {SCHOOL.name}, we nurture academic excellence, moral values, and leadership skills in every child entrusted to our care.</p>
          <p>Our school is built on a strong foundation of faith, discipline, and academic excellence. Our experienced educators create a supportive and inspiring environment where pupils can thrive and reach their full potential.</p>
          <p>We believe that every child is gifted and capable of greatness, so we develop not only their intellect but also their character and moral values.</p>
        </Split>
      </Section>
      <Section eyebrow="Our highlights" title={`Eight reasons to choose ${SCHOOL.name}`}>
        <div className="grid g4">
          {REASONS.map(([icon, title, text]) => (
            <div key={title} className="card stack tight">
              <span className="reason-ic"><Icon name={icon} /></span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/why-nazareth" />
      <AdmissionCta />
    </>
  );
}
