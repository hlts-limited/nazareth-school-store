import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { galleryAlbums } from "@/modules/website";
import { AdmissionCta, PageHero, Section } from "../_parts";
import { photoAlbums } from "../_photos";
import { Gallery } from "./_lightbox";
import { YouTubeVideos } from "../_youtube";

export const metadata: Metadata = { title: "Gallery", description: `Photos and videos of school life at ${SCHOOL.name}.` };

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
        <YouTubeVideos />
      </Section>
      <AdmissionCta />
    </>
  );
}
