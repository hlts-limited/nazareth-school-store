import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { galleryAlbums } from "@/modules/website";
import { AdmissionCta, PageHero, Section } from "../_parts";
import { photoAlbums } from "../_photos";
import { Gallery } from "./_lightbox";

export const metadata: Metadata = { title: "Gallery", description: `Photos and videos of school life at ${SCHOOL.name}.` };

// The channel's uploads playlist ("UU" + the channel id without its "UC" prefix).
const UPLOADS = "UUtaIN1rhzuUJ-rQLaxNCdaQ";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default async function GalleryPage() {
  const albums = await galleryAlbums();
  const all = photoAlbums(albums);
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
