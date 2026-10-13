import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { galleryAlbums } from "@/modules/website";
import { AdmissionCta, PageHero, Section } from "../_parts";
import { Gallery } from "./_lightbox";

export const metadata: Metadata = { title: "Gallery", description: `Photos and videos of school life at ${SCHOOL.name}.` };

// Photos from the old website, shown after the albums staff upload in the back office (Website → Gallery).
const CULTURAL_DAY = ["01", "02", "03", "04", "05", "07", "08", "09", "10", "11", "12", "13", "14", "15"].map((n) => ({
  src: `/images/cultural-day/${n}.jpg`,
  alt: "Cultural Day",
}));

// The channel's uploads playlist ("UU" + the channel id without its "UC" prefix).
const UPLOADS = "UUtaIN1rhzuUJ-rQLaxNCdaQ";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default async function GalleryPage() {
  const albums = await galleryAlbums();
  const all = [
    ...albums.map((a) => ({ name: a.name, photos: a.photos.map((p) => ({ src: `/api/files/${p.fileKey}`, alt: p.caption || a.name, uploaded: true })) })),
    ...(albums.some((a) => a.name === "Cultural Day") ? [] : [{ name: "Cultural Day", photos: CULTURAL_DAY }]),
  ];
  return (
    <>
      <PageHero crumb={[["School life"], ["Gallery"]]} title="Our gallery" lead={`Memorable moments and activities that show life at ${SCHOOL.name}.`} />
      {all.length > 1 && (
        <Section>
          <nav className="row tight" aria-label="Albums">
            {all.map((a) => <a key={a.name} className="chip" href={`#album-${slug(a.name)}`}>{a.name} <span className="muted">{a.photos.length}</span></a>)}
            <a className="chip" href="#videos">Videos</a>
          </nav>
        </Section>
      )}
      {all.map((a, i) => (
        <Section key={a.name} id={`album-${slug(a.name)}`} eyebrow={i === 0 ? "Photos" : undefined} title={a.name}>
          <Gallery photos={a.photos} />
        </Section>
      ))}
      <Section id="videos" eyebrow="Nazareth School Festac TV" title="Latest videos" lead="Watch our latest highlights on YouTube.">
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
