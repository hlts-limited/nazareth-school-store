import { DEFAULT_CLASSES } from "../config/school";

/** Admission class by age: 2 → Kindergarten, 3 → Pre-Nursery, 4 → Prep 1 … 10 → Primary 5. Primary 6 doesn't admit new pupils. */
export const MIN_AGE = 2;
export const ADMISSION_CLASSES = DEFAULT_CLASSES.slice(0, DEFAULT_CLASSES.indexOf("Primary 6"));
export const MAX_AGE = MIN_AGE + ADMISSION_CLASSES.length - 1;

/** The age that counts is the child's age on 31 December of the year the admission session starts
 *  (the session the school creates: "2026/2027" → 2026-12-31, "2027/2028" → 2027-12-31). */
export const AGE_DAY = "31 December";
export const ageDay = (session: string) => `${session.match(/\d{4}/)?.[0] ?? new Date().getFullYear()}-12-31`;

/** Whole years between two YYYY-MM-DD days (no time zones involved). */
export function ageOn(dob: string, day: string) {
  const [y1, m1, d1] = dob.split("-").map(Number);
  const [y2, m2, d2] = day.split("-").map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

export type AgeClass = { age: number; on: string; className: string | null; problem: string | null };

export function admissionClassFor(dob: string, session: string): AgeClass {
  const on = ageDay(session);
  const age = ageOn(dob, on);
  const when = new Date(`${on}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  if (age < MIN_AGE) return { age, on, className: null, problem: `Children must be at least ${MIN_AGE} years old on ${when} (the start of the ${session} session).` };
  if (age > MAX_AGE) return { age, on, className: null, problem: `Admission is for children aged ${MIN_AGE} to ${MAX_AGE} on ${when}. We don't admit new pupils into Primary 6.` };
  return { age, on, className: ADMISSION_CLASSES[age - MIN_AGE], problem: null };
}

/** A stored date of birth (midnight in Lagos) back to YYYY-MM-DD */
export const lagosDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
