"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zBool, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { normalizePhone } from "@/shared/lib/format";
import { requestMeta } from "@/shared/lib/request";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, isLocked, recordAttempt, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import {
  addPhoto, createEnquiry, deleteEvent, deleteNotice, deletePhoto, renameAlbum, saveEvent, saveNotice, setEnquiryHandled, updatePhoto,
} from "./service";

const lagos = (local: string) => new Date(`${local.length === 10 ? `${local}T00:00` : local}:00+01:00`);
const zLocal = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, msg);
const zOptLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const zLink = z.string().trim().max(300).optional().or(z.literal("")).transform((v) => (v ? v : undefined))
  .refine((v) => !v || v.startsWith("/") || /^https:\/\//.test(v), "Use a page on this site (/admissions/apply) or an https:// link");

// ---------- Public: Contact page ----------

export async function sendEnquiryAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (form.get("website")) return ok("Thank you. Your message has been sent."); // honeypot
    const { ip } = await requestMeta();
    const key = `enquiry:${ip}`;
    if (await isLocked(key)) return fail("Too many messages from this connection. Please wait a few minutes, or call the school office.");
    const d = parseForm(z.object({
      name: zText(120, "Enter your name"),
      email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
      phone: zOptText(20),
      subject: zText(120, "Enter a subject"),
      message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(3000),
    }), form);
    const phone = d.phone ? normalizePhone(d.phone) : null;
    if (d.phone && !phone) return fail("Please check the highlighted fields.", { phone: "Enter a valid Nigerian phone number" });
    if (!d.email && !phone) return fail("Please check the highlighted fields.", { email: "Give an email or a phone number so we can reply", phone: "Or a phone number" });
    await recordAttempt(key, false); // counts towards the per-connection limit (5 in 5 minutes)
    await createEnquiry({ name: d.name, email: d.email?.toLowerCase() || undefined, phone: phone ?? undefined, subject: d.subject, message: d.message });
    return ok("Thank you. Your message has been sent, and the school office will reply soon.");
  });
}

// ---------- Back office ----------

const staff = () => staffFor("website.manage");

export async function saveNoticeAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const d = parseForm(z.object({
      id: z.string().optional(), text: zText(220, "Write the notice"), link: zLink,
      startsAt: zLocal("Choose when it starts"), endsAt: zOptLocal,
    }), form);
    // A date-only end means "until the end of that day"
    const ends = d.endsAt ? (d.endsAt.length === 10 ? new Date(lagos(d.endsAt).getTime() + 86400_000) : lagos(d.endsAt)) : undefined;
    const n = await saveNotice(d.id || undefined, { text: d.text, link: d.link, startsAt: lagos(d.startsAt), endsAt: ends }, v.user.id);
    await audit(await auditActor(v), d.id ? "Updated website notice" : "Added website notice", "Notice", n.id, { text: n.text });
    return ok(d.id ? "Notice saved." : "Notice added.");
  });
}

export async function deleteNoticeAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const n = await deleteNotice(String(form.get("id")));
    await audit(await auditActor(v), "Deleted website notice", "Notice", n.id, { text: n.text });
    return ok("Notice deleted.");
  });
}

export async function saveEventAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const d = parseForm(z.object({
      id: z.string().optional(), title: zText(140, "Enter the event name"),
      startsAt: zLocal("Choose the date"), endsAt: zOptLocal,
      venue: zOptText(120), description: zOptText(1500), published: zBool,
    }), form);
    const e = await saveEvent(d.id || undefined, {
      title: d.title, startsAt: lagos(d.startsAt), endsAt: d.endsAt ? lagos(d.endsAt) : undefined, venue: d.venue, description: d.description, published: d.published,
    });
    await audit(await auditActor(v), d.id ? "Updated event" : "Added event", "Event", e.id, { title: e.title, startsAt: d.startsAt });
    return ok(d.id ? "Event saved." : "Event added.");
  });
}

export async function deleteEventAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const e = await deleteEvent(String(form.get("id")));
    await audit(await auditActor(v), "Deleted event", "Event", e.id, { title: e.title });
    return ok("Event deleted.");
  });
}

/** One photo per call: the browser shrinks each photo first, then uploads them one after another. */
export async function uploadPhotoAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const d = parseForm(z.object({ album: zText(80, "Enter an album name"), caption: zOptText(160) }), form);
    const file = form.get("file") as File | null;
    const up = await readUpload(file, { allowPdf: false });
    if ("error" in up) return fail(up.error!, { file: up.error! });
    const p = await addPhoto(d.album, d.caption, up);
    await audit(await auditActor(v), "Added gallery photo", "GalleryPhoto", p.id, { album: p.album });
    return ok("Photo added.");
  });
}

export async function updatePhotoAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const d = parseForm(z.object({ id: zText(100), album: zText(80, "Enter an album name"), caption: zOptText(160) }), form);
    await updatePhoto(d.id, { album: d.album, caption: d.caption });
    await audit(await auditActor(v), "Edited gallery photo", "GalleryPhoto", d.id, { album: d.album });
    return ok("Photo saved.");
  });
}

export async function deletePhotoAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const p = await deletePhoto(String(form.get("id")));
    await audit(await auditActor(v), "Deleted gallery photo", "GalleryPhoto", p.id, { album: p.album });
    return ok("Photo deleted.");
  });
}

export async function renameAlbumAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const d = parseForm(z.object({ from: zText(80), to: zText(80, "Enter the new album name") }), form);
    const n = await renameAlbum(d.from, d.to);
    await audit(await auditActor(v), "Renamed gallery album", "GalleryPhoto", null, { from: d.from, to: d.to, photos: n });
    return ok(`Album renamed (${n} photo${n === 1 ? "" : "s"}).`);
  });
}

export async function setEnquiryHandledAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staff();
    const handled = form.get("handled") === "1";
    const e = await setEnquiryHandled(String(form.get("id")), handled, v.user.id);
    await audit(await auditActor(v), handled ? "Marked enquiry as handled" : "Reopened enquiry", "Enquiry", e.id, { subject: e.subject });
    return ok(handled ? "Marked as handled." : "Moved back to open.");
  });
}
