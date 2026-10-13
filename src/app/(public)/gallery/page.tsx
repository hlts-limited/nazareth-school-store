import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { AdmissionCta, PageHero, Section } from "../_parts";
import { Gallery } from "./_lightbox";

export const metadata: Metadata = { title: "Gallery", description: `Photos and videos of school life at ${SCHOOL.name}.` };

// Phase 5 moves photos into the back office so staff can upload them. Until then they live in public/images.
const PHOTOS = ["01", "02", "03", "04", "05", "07", "08", "09", "10", "11", "12", "13", "14", "15"].map((n) => ({
  src: `/images/cultural-day/${n}.jpg`,
  alt: "Cultural Day",
}));

// The channel's uploads playlist ("UU" + the channel id without its "UC" prefix).
const UPLOADS = "UUtaIN1rhzuUJ-rQLaxNCdaQ";

export default function GalleryPage() {
  return (
    <>
      <PageHero crumb={[["Gallery"]]} title="Our gallery" lead={`Memorable moments and activities that show life at ${SCHOOL.name}.`} />
      <Section eyebrow="Photos" title="Cultural Day" lead="Every picture tells a story of learning, friendship, and unforgettable experiences.">
        <Gallery photos={PHOTOS} />
      </Section>
      <Section eyebrow="Nazareth School Festac TV" title="Latest videos" lead="Watch our latest highlights on YouTube.">
        <div className="stack">
          <div className="video-frame">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/videoseries?list=${UPLOADS}&rel=0`}
              title={`${SCHOOL.name} videos on YouTube`}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <div><a className="btn" href={SCHOOL.social.youtube} target="_blank" rel="noopener noreferrer"><Icon name="youtube" size="sm" />Visit our YouTube channel</a></div>
        </div>
      </Section>
      <AdmissionCta />
    </>
  );
}
