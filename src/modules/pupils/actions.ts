"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { auditActor, hashPassword, parentForAction, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { env } from "@/shared/config/env";
import { addPupil, commitImport, deletePupils, emptyBin, moveToClass, parseImport, restorePupil, searchIds, sendParentInvite } from "./service";

/** Without Termii nothing is sent automatically, so point the office to the WhatsApp button instead. */
const inviteNote = (phone: string) => env().TERMII_API_KEY
  ? `Invite sent to ${phone} by WhatsApp.`
  : `Press "WhatsApp invite" next to the pupil to send the parent their invite.`;

export async function addPupilAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.manage");
    const d = parseForm(z.object({
      lastName: zText(80, "Enter the surname"), firstName: zText(80, "Enter the first name"), regNumber: zText(40, "Enter the reg number"),
      classId: zText(100, "Choose a class"), gender: zOptText(20), parentPhone: zText(20, "Enter the parent's phone"),
      parentName: zOptText(120), parentEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
      consent: z.literal("on", { errorMap: () => ({ message: "Record the parent's consent" }) }),
    }), form);
    const r = await addPupil({ ...d, parentEmail: d.parentEmail || undefined });
    await audit(await auditActor(v), "Added pupil", "Pupil", r.pupil.id, { name: `${r.pupil.firstName} ${r.pupil.lastName}`, reg: r.pupil.regNumber });
    const who = `${r.pupil.firstName} ${r.pupil.lastName}`;
    return ok(r.parentCreated ? `${who} added. ${inviteNote(r.parent.phone ?? "the parent")}` : `${who} added and linked to ${r.parent.firstName} ${r.parent.lastName}.`, { redirect: `/admin/office/pupils?q=${encodeURIComponent(r.pupil.lastName)}` });
  });
}

const idsSchema = z.object({ ids: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])) });

export async function deletePupilsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.delete");
    const { ids } = parseForm(idsSchema, form);
    if (ids.length > 5 && form.get("confirm") !== "DELETE") return fail("Type DELETE to confirm.", { confirm: "Type DELETE" });
    const r = await deletePupils(ids, `${v.user.firstName} ${v.user.lastName}`);
    await audit(await auditActor(v), "Deleted pupils", "Pupil", null, { ids, ...r });
    return ok(`${r.deleted} deleted${r.archived ? `, ${r.archived} archived (they have orders or a wallet balance)` : ""}. Deleted pupils can be restored for 30 days.`);
  });
}

export async function moveClassAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.manage");
    const d = parseForm(idsSchema.extend({ classId: zText(100, "Choose a class") }), form);
    const n = await moveToClass(d.ids, d.classId);
    const c = await db.class.findUnique({ where: { id: d.classId } });
    await audit(await auditActor(v), "Moved pupils to class", "Pupil", null, { count: n, class: c?.name });
    return ok(`${n} pupil${n === 1 ? "" : "s"} moved to ${c?.name}.`);
  });
}

export async function selectAllMatchingAction(q: string, classId: string, status: string) {
  await staffFor("pupils.view");
  return searchIds({ q, classId: classId || undefined, status: (status || "active") as "active" | "archived" | "all" });
}

export async function restorePupilAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.manage");
    const p = await restorePupil(String(form.get("id")));
    await audit(await auditActor(v), "Restored pupil", "Pupil", p.id, { name: `${p.firstName} ${p.lastName}` });
    return ok(`${p.firstName} ${p.lastName} restored.`);
  });
}

export async function emptyBinAction(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.empty_bin");
    const n = await emptyBin();
    await audit(await auditActor(v), "Emptied bin", "Pupil", null, { count: n });
    return ok(`${n} pupil${n === 1 ? "" : "s"} permanently deleted.`);
  });
}

export async function previewImportAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await staffFor("pupils.manage");
    const rows = await parseImport(String(form.get("text") ?? ""));
    if (!rows.length) return fail("Paste at least one row.");
    return { ok: true, data: { rows } };
  });
}

export async function commitImportAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.manage");
    const rows = await parseImport(String(form.get("text") ?? ""));
    const n = await commitImport(rows);
    await audit(await auditActor(v), "Imported pupils", "Pupil", null, { rows: rows.length, added: n });
    return ok(`${n} pupil${n === 1 ? "" : "s"} imported. ${env().TERMII_API_KEY ? "Invites sent to new parents by WhatsApp." : "Send each new parent their invite with the green \"WhatsApp invite\" button."}`, { redirect: "/admin/office/pupils" });
  });
}

export async function resendInviteAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("pupils.manage");
    const id = String(form.get("parentId"));
    await sendParentInvite(id);
    await audit(await auditActor(v), "Re-sent invite", "User", id);
    return ok(env().TERMII_API_KEY ? "New invite sent by WhatsApp." : "New invite link created. Press \"WhatsApp invite\" to send it.");
  });
}

/** Parent sets or removes a 4–6 digit PIN that the pupil must enter at login */
export async function setPupilPinAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({ pupilId: zText(100), pin: z.string().regex(/^(\d{4,6})?$/, "Use 4 to 6 digits") }), form);
    const link = await db.guardian.findUnique({ where: { parentId_pupilId: { parentId: parent.id, pupilId: d.pupilId } } });
    if (!link) return fail("That isn't your child.");
    await db.pupil.update({ where: { id: d.pupilId }, data: { pinHash: d.pin ? await hashPassword(d.pin) : null } });
    return ok(d.pin ? "PIN set. Your child will need it to sign in." : "PIN removed.");
  });
}
