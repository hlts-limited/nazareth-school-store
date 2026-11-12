"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zText, type ActionResult } from "@/shared/lib/action";
import { requestMeta } from "@/shared/lib/request";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, isLocked, recordAttempt, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import {
  applicationByToken, familyDocLink, createApplication, DOC_KINDS, docLabel, lookupResult, saveDocument, startApplicationFee, type DocKind,
} from "./service";

import { readApplicationForm, saveUploads, staffName } from "./action-helpers";

/* What families do on the website: apply, pay the form fee, upload documents, check the result. */

export async function submitApplicationAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (form.get("website")) return ok("Thank you."); // honeypot: only bots fill the hidden field
    const { ip } = await requestMeta();
    const key = `admission-apply:${ip}`;
    if (await isLocked(key)) return fail("Too many applications from this connection. Please wait a few minutes and try again.");
    const f = await readApplicationForm(form, { docsRequired: true, declaration: true });
    if (!f.valid) return f.result;
    await recordAttempt(key, false); // counts towards the per-connection limit (5 in 5 minutes)
    const r = await createApplication(f.child);
    await saveUploads(r.app.id, f.uploads);
    return ok(undefined, { redirect: r.link });
  });
}

/** The office registers a child (Secretary, Super Admin, Alpha). Documents can be added now or later. */
export async function registerApplicationAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const o = parseForm(z.object({
      windowId: zText(100, "Choose the admission session"), classId: z.string().optional(),
      fee: z.enum(["paid", "online", "waived"], { errorMap: () => ({ message: "Choose how the form fee is handled" }) }),
    }), form);
    const f = await readApplicationForm(form, { docsRequired: false, declaration: false });
    if (!f.valid) return f.result;
    const r = await createApplication({ ...f.child, classId: o.classId || undefined }, { windowId: o.windowId, fee: o.fee, by: staffName(v) });
    await saveUploads(r.app.id, f.uploads);
    await audit(await auditActor(v), "Registered applicant at the office", "Application", r.app.id, { number: r.app.number, fee: o.fee, documents: f.uploads.map((u) => u.kind) });
    return ok(`${r.app.otherNames.split(/\s+/)[0]} ${r.app.surname} registered (${r.app.number}).`, { redirect: `/admin/admissions/${r.app.id}?registered=1` });
  });
}

export async function payApplicationFeeAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const url = await startApplicationFee(String(form.get("number") ?? ""), String(form.get("token") ?? ""));
    return ok(undefined, { redirect: url });
  });
}

export async function uploadApplicationDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const app = await applicationByToken(String(form.get("number") ?? ""), String(form.get("token") ?? ""));
    if (!app) return fail("Application not found.");
    if (!["SUBMITTED", "EXAM_SCHEDULED"].includes(app.status)) return fail("Documents can't be changed on this application any more. Please contact the school office.");
    // After the form is sent, families may only add a document that is still missing; changes are made by the office
    if (app.documents.some((d) => d.kind === String(form.get("kind")))) return fail("This document is already with the school. To change it, please contact the school office.");
    const kind = String(form.get("kind")) as DocKind;
    const doc = DOC_KINDS.find((k) => k.kind === kind);
    if (!doc) return fail("Choose a document.");
    const file = form.get("file") as File | null;
    const up = await readUpload(file, { allowPdf: kind !== "passport" });
    if ("error" in up) return fail(up.error!, { [`file-${kind}`]: up.error! });
    await saveDocument(app.id, kind, { buf: up.buf, mime: up.mime, ext: up.ext, name: file?.name ?? kind });
    return ok(`${docLabel(kind, (app.details as Record<string, string> | null)?.religion)} uploaded.`);
  });
}

export type ResultLookup = ActionResult & { result?: Awaited<ReturnType<typeof lookupResult>> | null; values?: { number: string; initial: string }; links?: { letter?: string; form: string } };

export async function lookupResultAction(_: ResultLookup, form: FormData): Promise<ResultLookup> {
  const { ip } = await requestMeta();
  const key = `admission-result:${ip}`;
  if (await isLocked(key)) return { ok: false, message: "Too many tries. Please wait 5 minutes and try again.", values: { number: String(form.get("number") ?? ""), initial: String(form.get("initial") ?? "") } };
  const number = String(form.get("number") ?? "").trim();
  const initial = String(form.get("initial") ?? "").trim();
  const values = { number, initial }; // shown again in the form after it resets
  if (!number || !/^[a-zA-Z]$/.test(initial)) return { ok: false, values, fieldErrors: { ...(number ? {} : { number: "Enter the application number" }), ...(/^[a-zA-Z]$/.test(initial) ? {} : { initial: "One letter" }) } };
  const result = await lookupResult(number, initial);
  await recordAttempt(key, !!result);
  if (!result) return { ok: false, values, message: "We couldn't find that application. Check the number and the first letter of the child's surname." };
  // Links to print or download the application form, and the admission letter for a child who passed
  const links = { form: familyDocLink(result.number, "form"), ...(result.outcome === "ADMITTED" ? { letter: familyDocLink(result.number, "letter") } : {}) };
  return { ok: true, result, values, links };
}
