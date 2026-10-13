import type { Metadata } from "next";
import Image from "next/image";
import { SCHOOL } from "@/shared/config/school";
import { AdmissionCta, PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Management", description: `The management team of ${SCHOOL.name}.` };

// Add members as the school sends names, roles and photos (photos go in public/images/staff/).
const TEAM = [
  { name: SCHOOL.supervisor, role: "Supervisor", img: "/images/irene.jpg", quote: "Leads Nazareth School with a commitment to faith, discipline, and academic excellence, nurturing every child entrusted to our care." },
];

export default function ManagementPage() {
  return (
    <>
      <PageHero crumb={[["About"], ["Management"]]} title="School management" lead={`Meet the leadership committed to academic excellence, character development, and the success of every pupil at ${SCHOOL.name}.`} />
      <Section title="Our management team" lead="Our leadership team works together to provide quality education, strong moral values, effective administration, and a nurturing environment for every learner.">
        <div className="grid g3">
          {TEAM.map((m) => (
            <article key={m.name} className="card pad-0 school-card">
              <div className="school-card-img portrait">
                <Image src={m.img} alt={m.name} fill sizes="(max-width: 860px) 100vw, 400px" />
              </div>
              <div className="stack tight card-b">
                <div><h3>{m.name}</h3><span className="eyebrow">{m.role}</span></div>
                <p className="muted">&ldquo;{m.quote}&rdquo;</p>
              </div>
            </article>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 16 }}>More members of our management team will be introduced here soon.</p>
      </Section>
      <SectionLinks group="About" current="/about/management" />
      <AdmissionCta />
    </>
  );
}
