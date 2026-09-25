"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { env } from "@/shared/config/env";
import { inviteStaff, resetStaff, setRoles, setStatus } from "./service";

/** Until RESEND_API_KEY is set, emails are only logged — say so instead of claiming they were sent. */
const sentNote = (who: string) => env().RESEND_API_KEY
  ? `Invite emailed to ${who}.`
  : `Email isn't set up yet, so nothing was sent to ${who}. Use "Copy invite link" and send it to them directly.`;

const rolesField = z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v ? (Array.isArray(v) ? v : [v]) : []));

export async function inviteStaffAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("staff.manage");
    const d = parseForm(z.object({ firstName: zText(60, "Enter a first name"), lastName: zText(60, "Enter a surname"), email: z.string().trim().email("Enter a valid email"), phone: zOptText(20), roles: rolesField }), form);
    const u = await inviteStaff(d);
    await audit(await auditActor(v), "Invited staff", "User", u.id, { email: u.email, roles: d.roles });
    return ok(sentNote(u.email!));
  });
}

export async function setRolesAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("staff.manage");
    const d = parseForm(z.object({ userId: zText(100), roles: rolesField }), form);
    if (d.userId === v.user.id && !d.roles.includes("admin")) return fail("You can't remove your own Super Admin role.");
    await setRoles(d.userId, d.roles);
    await audit(await auditActor(v), "Changed roles", "User", d.userId, { roles: d.roles });
    return ok("Roles saved. That person has been signed out everywhere.");
  });
}

export async function setStaffStatusAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("staff.manage");
    const d = parseForm(z.object({ userId: zText(100), status: z.enum(["ACTIVE", "DISABLED"]) }), form);
    if (d.userId === v.user.id) return fail("You can't disable your own account.");
    await setStatus(d.userId, d.status);
    await audit(await auditActor(v), d.status === "DISABLED" ? "Disabled staff" : "Enabled staff", "User", d.userId);
    return ok(d.status === "DISABLED" ? "Account disabled and signed out." : "Account enabled.");
  });
}

export async function resetStaffAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("staff.manage");
    const id = String(form.get("userId"));
    await resetStaff(id);
    await audit(await auditActor(v), "Reset staff password", "User", id);
    return ok(env().RESEND_API_KEY ? "A new set-up link has been emailed." : `New set-up link created. Email isn't set up yet, so use "Copy invite link" and send it to them directly.`);
  });
}
