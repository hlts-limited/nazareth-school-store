import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { AdmissionCta, PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Vision & mission", description: `The vision, mission and core values of ${SCHOOL.name}.` };

const VALUES = ["Excellence", "Integrity", "Discipline", "Teamwork", "Innovation"];

export default function VisionPage() {
  return (
    <>
      <PageHero
        crumb={[["About"], ["Vision & mission"]]}
        title="Our vision, mission and values"
        lead={`Guided by faith and driven by excellence, our vision, mission and values shape how ${SCHOOL.name} nurtures every child.`}
        img="/images/cultural-day/15.jpg"
      />
      <Section>
        <div className="grid g2">
          <div className="card stack quote-card">
            <span className="reason-ic"><Icon name="eye" /></span>
            <h2>Our vision</h2>
            <blockquote>A society where every child has access to good, quality, functional education regardless of social background.</blockquote>
          </div>
          <div className="card stack quote-card">
            <span className="reason-ic"><Icon name="heart" /></span>
            <h2>Our mission</h2>
            <blockquote>To provide holistic education of the human person through application of optimum human and material resources to engender self-actualization and promote the dignity of man.</blockquote>
          </div>
        </div>
      </Section>
      <Section eyebrow="What we live by" title="Our core values">
        <div className="value-row">
          {VALUES.map((v) => <span key={v} className="value"><Icon name="check" size="sm" />{v}</span>)}
        </div>
      </Section>
      <SectionLinks group="About" current="/about/vision" />
      <AdmissionCta />
    </>
  );
}
