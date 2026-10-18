import { db } from "@/shared/lib/db";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";

type Channel = "sms" | "whatsapp" | "email" | "inapp";

async function sendEmail(to: string, subject: string, text: string) {
  const e = env();
  if (!e.RESEND_API_KEY) { console.info(`[email → ${to}] ${subject}\n${text}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to, subject, text: `${text}\n\n— ${SCHOOL.storeName}\n${SCHOOL.motto}` }),
  });
  if (!r.ok) {
    // Resend explains the problem (e.g. unverified domain, or testing mode only sends to your own address)
    const why = await r.json().then((j: { message?: string }) => j.message, () => undefined);
    console.error(`[email → ${to}] failed (${r.status}): ${why ?? "no details"}`);
    throw new Error(`Email failed (${r.status})${why ? `: ${why}` : ""}`);
  }
}

async function sendSms(to: string, text: string, whatsapp = false) {
  const e = env();
  const intl = to.startsWith("0") ? "234" + to.slice(1) : to;
  if (!e.TERMII_API_KEY) { console.info(`[${whatsapp ? "whatsapp" : "sms"} → ${intl}] ${text}`); return; }
  const r = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: e.TERMII_API_KEY, to: intl, from: e.TERMII_SENDER_ID, sms: text, type: "plain", channel: whatsapp ? "whatsapp" : "generic" }),
  });
  if (!r.ok) throw new Error(`SMS failed (${r.status})`);
}

/** WhatsApp first; if it doesn't go through (e.g. the number isn't on WhatsApp), the same text goes by plain SMS. */
async function sendWhatsApp(phone: string, text: string, errors: string[]) {
  try { await sendSms(phone, text, true); return; } catch (e) { errors.push(`whatsapp: ${(e as Error).message}`); }
  try { await sendSms(phone, text); } catch (e) { errors.push(`sms: ${(e as Error).message}`); }
}

/**
 * Message someone who has no account yet (e.g. an applicant's parent) on WhatsApp and by email.
 * Never throws; returns what failed so the caller can tell the office.
 */
export async function notifyContact(to: { phone?: string | null; email?: string | null }, title: string, body: string): Promise<string[]> {
  const errors: string[] = [];
  if (to.phone) await sendWhatsApp(to.phone, `${SCHOOL.name}: ${body}`, errors);
  if (to.email) { try { await sendEmail(to.email, title, body); } catch (e) { errors.push(`email: ${(e as Error).message}`); } }
  return errors;
}

/**
 * Notify a user: always stored in-app, then sent by the chosen channels.
 * Phone messages always go on WhatsApp ("sms" is treated as WhatsApp), with a plain SMS only as the fallback.
 * Sending never throws — a failure is recorded on the notification so the office can follow up.
 */
export async function notify(userId: string, title: string, body: string, channels: Channel[] = ["whatsapp", "email"]) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const use = [...new Set(channels.map((c) => (c === "sms" ? "whatsapp" : c)))];
  const n = await db.notification.create({ data: { userId, title, body, channels: use.join(",") } });
  const errors: string[] = [];
  for (const ch of use) {
    if (ch === "whatsapp" && user.phone) await sendWhatsApp(user.phone, `${SCHOOL.name}: ${body}`, errors);
    if (ch === "email" && user.email) {
      try { await sendEmail(user.email, title, body); } catch (e) { errors.push(`email: ${(e as Error).message}`); }
    }
  }
  await db.notification.update({ where: { id: n.id }, data: { sentAt: new Date(), error: errors.length ? errors.join("; ") : null } });
}

export async function listNotifications(userId: string, take = 30) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}
export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
