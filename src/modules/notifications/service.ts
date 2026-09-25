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

/**
 * Notify a user: always stored in-app, then sent by the chosen channels.
 * Sending never throws — a failure is recorded on the notification so the office can follow up.
 */
export async function notify(userId: string, title: string, body: string, channels: Channel[] = ["sms", "email"]) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const n = await db.notification.create({ data: { userId, title, body, channels: channels.join(",") } });
  const errors: string[] = [];
  for (const ch of channels) {
    try {
      if (ch === "email" && user.email) await sendEmail(user.email, title, body);
      if ((ch === "sms" || ch === "whatsapp") && user.phone) await sendSms(user.phone, `${SCHOOL.name}: ${body}`, ch === "whatsapp");
    } catch (e) {
      errors.push(`${ch}: ${(e as Error).message}`);
      // WhatsApp didn't go through (e.g. number not on WhatsApp): fall back to a plain SMS
      if (ch === "whatsapp" && !channels.includes("sms") && user.phone) {
        try { await sendSms(user.phone, `${SCHOOL.name}: ${body}`); } catch (e2) { errors.push(`sms: ${(e2 as Error).message}`); }
      }
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
