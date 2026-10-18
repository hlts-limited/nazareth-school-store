import type { galleryAlbums } from "@/modules/website";

export type Photo = { src: string; alt: string; uploaded?: boolean };

// Photos from the old website, shown after the albums staff upload in the back office (Website → Gallery).
const CULTURAL_DAY: Photo[] = ["01", "02", "03", "04", "05", "07", "08", "09", "10", "11", "12", "13", "14", "15"].map((n) => ({
  src: `/images/cultural-day/${n}.jpg`,
  alt: "Cultural Day",
}));

/** Every gallery album, newest first, with the old website's Cultural Day photos last unless staff uploaded that album */
export function photoAlbums(albums: Awaited<ReturnType<typeof galleryAlbums>>): { name: string; photos: Photo[] }[] {
  return [
    ...albums.map((a) => ({ name: a.name, photos: a.photos.map((p) => ({ src: `/api/files/${p.fileKey}`, alt: p.caption || a.name, uploaded: true })) })),
    ...(albums.some((a) => a.name === "Cultural Day") ? [] : [{ name: "Cultural Day", photos: CULTURAL_DAY }]),
  ];
}
