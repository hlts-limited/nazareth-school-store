import { ORDER_NUMBER_OFFSET } from "../config/school";

/** ₦12,500 — money is stored in whole naira */
export function naira(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₦${Math.abs(Math.round(n)).toLocaleString("en-NG")}`;
}

export function fmtDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

export function fmtDateTime(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  });
}

/** yyyy-mm-dd in Lagos time */
export function isoDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const orderNo = (n: number) => `NZ-${n + ORDER_NUMBER_OFFSET}`;
export const invoiceNo = (n: number) => `INV-${n + ORDER_NUMBER_OFFSET}`;

/** "NZ-24815" -> 15 ; returns null if it doesn't look like an order number */
export function parseOrderNo(s: string): number | null {
  const m = /^(?:NZ-)?(\d+)$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10) - ORDER_NUMBER_OFFSET;
  return n > 0 ? n : null;
}

export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

export const maskPhone = (p?: string | null) => (p ? `${p.slice(0, 3)}****${p.slice(-4)}` : "—");

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Nigerian phone numbers: accepts 0803..., +234803..., 234803... and returns 0803... */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let local = digits;
  if (digits.startsWith("234") && digits.length === 13) local = "0" + digits.slice(3);
  if (/^0[789][01]\d{8}$/.test(local)) return local;
  return null;
}

export const AVATAR_COLORS = ["#D7262D", "#2A62A3", "#1C7C47", "#5B45A8", "#B06A12", "#0F7C86", "#8E1B1F", "#4A4446"];
export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
