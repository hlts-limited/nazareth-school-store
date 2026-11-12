
import { z } from "zod";
import { fail, parseForm, zOptText, zText } from "@/shared/lib/action";
import { normalizePhone } from "@/shared/lib/format";
import { readUpload } from "@/shared/lib/storage";
import {
  DOC_KINDS, docLabel, RELIGIONS, saveDocument, type DocKind,
} from "./service";


/* Shared by the family and office actions: date parsing and reading the application form with its documents. */

export const zDay = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
export const zDateTime = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg);
export const lagos = (local: string) => new Date(`${local.length === 10 ? `${local}T00:00` : local}:00+01:00`);


export type Upload = { kind: DocKind; buf: Buffer; mime: string; ext: string; name: string };

/** The application form's fields and documents, shared by the website and the office. */
export async function readApplicationForm(form: FormData, opts: { docsRequired: boolean; declaration: boolean }) {
  const d = parseForm(z.object({
    surname: zText(80, "Enter the child's surname"), otherNames: zText(120, "Enter the child's other names"),
    dateOfBirth: zDay("Enter the date of birth"), gender: z.enum(["Female", "Male"], { errorMap: () => ({ message: "Choose the gender" }) }),
    previousSchool: zOptText(160), currentClass: zOptText(60),
    nationality: zOptText(60), stateOfOrigin: zOptText(60), languages: zOptText(120),
    religion: z.enum(RELIGIONS, { errorMap: () => ({ message: "Choose the religion" }) }),
    parentName: zText(120, "Enter the parent's full name"), relationship: zText(40, "Choose the relationship to the child"),
    parentPhone: zText(20, "Enter a phone number"), parentEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
    occupation: zOptText(80), address: zText(300, "Enter the home address"),
    otherParentName: zOptText(120), otherParentPhone: zOptText(20),
    health: zOptText(600),
    declaration: opts.declaration ? z.literal("on", { errorMap: () => ({ message: "Please confirm the declaration" }) }) : z.string().optional(),
  }), form);
  const errors: Record<string, string> = {};
  const phone = normalizePhone(d.parentPhone);
  if (!phone) errors.parentPhone = "Enter a valid Nigerian phone number, e.g. 08031234567";
  const dob = lagos(d.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) errors.dateOfBirth = "Check the date of birth";

  const uploads: Upload[] = [];
  for (const doc of DOC_KINDS) {
    const file = form.get(`doc-${doc.kind}`) as File | null;
    if (!file || !file.size) {
      if (opts.docsRequired && doc.required) errors[`doc-${doc.kind}`] = `Upload the ${docLabel(doc.kind, d.religion).toLowerCase()}`;
      continue;
    }
    const up = await readUpload(file, { allowPdf: doc.kind !== "passport" });
    if ("error" in up) { errors[`doc-${doc.kind}`] = up.error!; continue; }
    uploads.push({ kind: doc.kind, buf: up.buf, mime: up.mime, ext: up.ext, name: file.name });
  }
  if (Object.keys(errors).length) return { valid: false as const, result: fail("Please check the highlighted fields.", errors) };

  const child = {
    surname: d.surname, otherNames: d.otherNames, dateOfBirth: dob, gender: d.gender, previousSchool: d.previousSchool,
    parentName: d.parentName, relationship: d.relationship, parentPhone: phone!, parentEmail: d.parentEmail?.toLowerCase() || undefined, address: d.address,
    details: {
      currentClass: d.currentClass, nationality: d.nationality, stateOfOrigin: d.stateOfOrigin, religion: d.religion, languages: d.languages,
      occupation: d.occupation, otherParentName: d.otherParentName, otherParentPhone: d.otherParentPhone, health: d.health,
      ...(opts.declaration ? { declaredAt: new Date().toISOString() } : {}),
    },
  };
  return { valid: true as const, child, uploads };
}

export const saveUploads = async (applicationId: string, uploads: Upload[]) => {
  for (const u of uploads) await saveDocument(applicationId, u.kind, u);
};

export const staffName = (v: { user: { firstName: string; lastName: string } }) => `${v.user.firstName} ${v.user.lastName}`;
