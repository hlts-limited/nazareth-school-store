// Staff documents and record options. No server imports: used by forms in the browser too.

export const STAFF_DOC_KINDS = [
  { kind: "cv", label: "CV / résumé", required: true, many: false, sensitive: false, expires: false },
  { kind: "certificate", label: "Academic certificates", required: true, many: true, sensitive: false, expires: false },
  { kind: "trcn", label: "Teaching licence (TRCN)", required: "teachers", many: false, sensitive: false, expires: true },
  { kind: "id", label: "Valid ID (NIN, passport, driver's licence or voter's card)", required: true, many: false, sensitive: true, expires: true },
  { kind: "passport", label: "Passport photograph", required: true, many: false, sensitive: false, expires: false },
  { kind: "guarantor", label: "Guarantor form (signed)", required: true, many: false, sensitive: true, expires: false },
  { kind: "reference", label: "Reference letter", required: false, many: true, sensitive: false, expires: false },
  { kind: "contract", label: "Employment contract", required: false, many: false, sensitive: false, expires: false, hrOnly: true },
  { kind: "other", label: "Other", required: false, many: true, sensitive: false, expires: false },
] as const;

export type StaffDocKind = (typeof STAFF_DOC_KINDS)[number]["kind"];

export const staffDocLabel = (kind: string) => STAFF_DOC_KINDS.find((d) => d.kind === kind)?.label ?? kind;
export const isSensitiveDoc = (kind: string) => STAFF_DOC_KINDS.some((d) => d.kind === kind && d.sensitive);

/** The document kinds this person must have approved before their record is complete. */
export const requiredDocKinds = (isTeacher: boolean): StaffDocKind[] =>
  STAFF_DOC_KINDS.filter((d) => d.required === true || (d.required === "teachers" && isTeacher)).map((d) => d.kind);

export const STAFF_SECTIONS_LIST = [
  { id: "pre-school", name: "Pre-School" },
  { id: "school-a", name: "School A" },
  { id: "school-b", name: "School B" },
  { id: "admin", name: "Administration and support" },
] as const;

export const sectionName = (id: string) => STAFF_SECTIONS_LIST.find((s) => s.id === id)?.name ?? id;

export const POSITIONS = [
  "Class Teacher", "Subject Teacher", "Head Teacher", "Teaching Assistant", "Bursar", "Secretary", "Accountant", "Registrar",
  "Librarian", "Nurse", "Driver", "Security", "Cleaner", "Cook", "Other",
] as const;
