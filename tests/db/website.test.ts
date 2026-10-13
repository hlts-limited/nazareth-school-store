// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { storage } from "../../src/shared/lib/storage";
import {
  activeNotices, addPhoto, deletePhoto, galleryAlbums, pastEvents, renameAlbum, saveEvent, saveNotice, setEnquiryHandled, createEnquiry, listEnquiries, upcomingEvents,
} from "../../src/modules/website/service";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
let staffId = "";

before(async () => {
  await db.notice.deleteMany();
  await db.event.deleteMany();
  await db.galleryPhoto.deleteMany();
  await db.enquiry.deleteMany();
  staffId = (await db.user.findFirstOrThrow({ where: { type: "STAFF" } })).id;
});

test("notice bar shows current notices only, newest first, at most three", async () => {
  await saveNotice(undefined, { text: "Expired", startsAt: at(-10), endsAt: at(-1) }, staffId);
  await saveNotice(undefined, { text: "Not yet", startsAt: at(2) }, staffId);
  for (let i = 1; i <= 4; i++) await saveNotice(undefined, { text: `Live ${i}`, startsAt: at(-i), endsAt: i === 1 ? at(1) : undefined }, staffId);
  const shown = (await activeNotices()).map((n) => n.text);
  assert.deepEqual(shown, ["Live 1", "Live 2", "Live 3"]);
});

test("events: drafts are hidden, upcoming and past are split", async () => {
  await saveEvent(undefined, { title: "Cultural Day", startsAt: at(1), venue: "School field", published: true });
  await saveEvent(undefined, { title: "Sports Day", startsAt: at(20), published: true });
  await saveEvent(undefined, { title: "Draft PTA meeting", startsAt: at(5), published: false });
  await saveEvent(undefined, { title: "Inter-house quiz", startsAt: at(-3), published: true });
  // An event that started an hour ago and runs all day is still upcoming
  await saveEvent(undefined, { title: "Book fair", startsAt: new Date(Date.now() - 3_600_000), endsAt: at(0.3), published: true });
  // A one-off event from this morning (no end time) is not "past" yet
  await saveEvent(undefined, { title: "Assembly", startsAt: new Date(Date.now() - 2 * 3_600_000), published: true });

  assert.deepEqual((await upcomingEvents()).map((e) => e.title), ["Assembly", "Book fair", "Cultural Day", "Sports Day"]);
  assert.deepEqual((await upcomingEvents(2)).map((e) => e.title), ["Assembly", "Book fair"]);
  assert.deepEqual((await pastEvents()).map((e) => e.title), ["Inter-house quiz"]);
});

test("gallery: albums keep photo order; deleting a photo removes its file", async () => {
  const jpeg = { buf: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mime: "image/jpeg", ext: "jpg" };
  const a = await addPhoto("Cultural Day 2026", "Dancers", jpeg);
  const b = await addPhoto("Cultural Day 2026", undefined, jpeg);
  await addPhoto("Sports Day", "Relay", jpeg);
  assert.equal(b.sortOrder, a.sortOrder + 1);
  assert.ok(await storage().get(a.fileKey));
  assert.ok(a.fileKey.startsWith("gallery/"), "gallery files are served publicly by prefix");

  const albums = await galleryAlbums();
  assert.deepEqual(albums.map((x) => x.name), ["Sports Day", "Cultural Day 2026"]);
  assert.deepEqual(albums[1].photos.map((p) => p.id), [a.id, b.id]);

  assert.equal(await renameAlbum("Sports Day", "Sports Day 2026"), 1);
  await deletePhoto(a.id);
  assert.equal(await storage().get(a.fileKey), null);
  assert.equal(await db.galleryPhoto.count(), 2);
});

test("contact messages can be marked handled and reopened", async () => {
  const e = await createEnquiry({ name: "Mrs Ade", phone: "08030000000", subject: "Admissions", message: "When is the next exam?" });
  assert.equal((await listEnquiries("open")).length, 1);
  await setEnquiryHandled(e.id, true, staffId);
  assert.equal((await listEnquiries("open")).length, 0);
  assert.equal((await listEnquiries("handled"))[0].handledById, staffId);
  await setEnquiryHandled(e.id, false, staffId);
  assert.equal((await listEnquiries("open"))[0].handledById, null);
});
