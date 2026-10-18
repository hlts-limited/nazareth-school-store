import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { randomToken } from "@/shared/lib/crypto";
import { storage } from "@/shared/lib/storage";

// ---------- Notices (announcement bar) ----------

/** Notices showing right now, newest first */
export async function activeNotices(now = new Date()) {
  return db.notice.findMany({
    where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: "desc" },
    take: 3,
  });
}

export async function listNotices() {
  return db.notice.findMany({ orderBy: [{ startsAt: "desc" }], take: 100 });
}

export type NoticeInput = { text: string; link?: string; startsAt: Date; endsAt?: Date };

export async function saveNotice(id: string | undefined, input: NoticeInput, staffId: string) {
  if (input.endsAt && input.endsAt <= input.startsAt) throw new UserError("The end date must be after the start date.", { endsAt: "Must be after the start" });
  const data = { text: input.text, link: input.link ?? null, startsAt: input.startsAt, endsAt: input.endsAt ?? null };
  return id ? db.notice.update({ where: { id }, data }) : db.notice.create({ data: { ...data, createdById: staffId } });
}

export async function deleteNotice(id: string) {
  return db.notice.delete({ where: { id } });
}

// ---------- Events ----------

export async function upcomingEvents(take = 20, now = new Date()) {
  // An event stays "upcoming" until it ends (or until the end of its start day)
  const startOfToday = new Date(now.getTime() - 24 * 3600_000);
  return db.event.findMany({
    where: { published: true, OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: startOfToday } }] },
    orderBy: { startsAt: "asc" },
    take,
  });
}

export async function pastEvents(take = 12, now = new Date()) {
  // The opposite of upcomingEvents, so an event never shows in both lists
  const startOfToday = new Date(now.getTime() - 24 * 3600_000);
  return db.event.findMany({
    where: { published: true, OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: startOfToday } }] },
    orderBy: { startsAt: "desc" },
    take,
  });
}

export async function listEvents() {
  return db.event.findMany({ orderBy: { startsAt: "desc" }, take: 200 });
}

export type EventInput = { title: string; startsAt: Date; endsAt?: Date; venue?: string; description?: string; published: boolean };

type Upload = { buf: Buffer; mime: string; ext: string };

/** `photo`: a new photo replaces the old one, "remove" takes it off, undefined leaves it as it is */
export async function saveEvent(id: string | undefined, input: EventInput, photo?: Upload | "remove") {
  if (input.endsAt && input.endsAt <= input.startsAt) throw new UserError("The end must be after the start.", { endsAt: "Must be after the start" });
  const before = id ? await db.event.findUnique({ where: { id }, select: { photoKey: true } }) : null;
  let photoKey: string | null | undefined;
  if (photo === "remove") photoKey = null;
  else if (photo) {
    photoKey = `events/${randomToken(12).replace(/[^a-zA-Z0-9]/g, "")}.${photo.ext}`;
    await storage().put(photoKey, photo.buf, photo.mime);
  }
  const data = { ...input, endsAt: input.endsAt ?? null, venue: input.venue ?? null, description: input.description ?? null, ...(photoKey !== undefined && { photoKey }) };
  const e = id ? await db.event.update({ where: { id }, data }) : await db.event.create({ data });
  if (photoKey !== undefined && before?.photoKey) await storage().delete(before.photoKey).catch(() => {});
  return e;
}

export async function deleteEvent(id: string) {
  const e = await db.event.delete({ where: { id } });
  if (e.photoKey) await storage().delete(e.photoKey).catch(() => {});
  return e;
}

// ---------- Gallery ----------

/** Albums, most recently added first, each with its photos in order */
export async function galleryAlbums() {
  const photos = await db.galleryPhoto.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const albums = new Map<string, { name: string; latest: Date; photos: typeof photos }>();
  for (const p of photos) {
    const a = albums.get(p.album) ?? { name: p.album, latest: p.createdAt, photos: [] };
    a.photos.push(p);
    if (p.createdAt > a.latest) a.latest = p.createdAt;
    albums.set(p.album, a);
  }
  return [...albums.values()].sort((a, b) => b.latest.getTime() - a.latest.getTime());
}

/** Saves the photo, and its small grid copy when the browser sent one (stored next to it as "<name>-sm.<ext>") */
export async function addPhoto(album: string, caption: string | undefined, file: { buf: Buffer; mime: string; ext: string }, thumb?: { buf: Buffer; mime: string; ext: string }) {
  const name = `gallery/${randomToken(12).replace(/[^a-zA-Z0-9]/g, "")}`;
  const key = `${name}.${file.ext}`;
  await storage().put(key, file.buf, file.mime);
  const thumbKey = thumb ? `${name}-sm.${thumb.ext}` : null;
  if (thumb && thumbKey) await storage().put(thumbKey, thumb.buf, thumb.mime);
  const last = await db.galleryPhoto.findFirst({ where: { album }, orderBy: { sortOrder: "desc" } });
  return db.galleryPhoto.create({ data: { album, caption: caption ?? null, fileKey: key, thumbKey, sortOrder: (last?.sortOrder ?? 0) + 1 } });
}

export async function updatePhoto(id: string, data: { album: string; caption?: string }) {
  return db.galleryPhoto.update({ where: { id }, data: { album: data.album, caption: data.caption ?? null } });
}

export async function deletePhoto(id: string) {
  const p = await db.galleryPhoto.delete({ where: { id } });
  await storage().delete(p.fileKey);
  if (p.thumbKey) await storage().delete(p.thumbKey).catch(() => {});
  return p;
}

export async function renameAlbum(from: string, to: string) {
  const r = await db.galleryPhoto.updateMany({ where: { album: from }, data: { album: to } });
  return r.count;
}

// ---------- Enquiries (Contact page) ----------

export type EnquiryInput = { name: string; email?: string; phone?: string; subject: string; message: string };

export async function createEnquiry(input: EnquiryInput) {
  return db.enquiry.create({ data: input });
}

export async function listEnquiries(show: "open" | "handled" | "all", take = 100) {
  return db.enquiry.findMany({
    where: show === "open" ? { handledAt: null } : show === "handled" ? { handledAt: { not: null } } : {},
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function setEnquiryHandled(id: string, handled: boolean, staffId: string) {
  return db.enquiry.update({ where: { id }, data: handled ? { handledAt: new Date(), handledById: staffId } : { handledAt: null, handledById: null } });
}
