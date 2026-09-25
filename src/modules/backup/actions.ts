"use server";

import { fail, ok, runAction, type ActionResult } from "@/shared/lib/action";
import { auditActor, staffFor, verifyTotp } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { createBackup, runRestore, stageExisting, stageRestore } from "./service";

const who = (v: { user: { id: string; firstName: string; lastName: string } }) => ({ id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}` });

export async function createBackupAction(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("backup.manage");
    const b = await createBackup("MANUAL", who(v));
    await audit(await auditActor(v), "Created backup", "Backup", b.id, { file: b.fileName });
    return ok(`Backup created: ${b.fileName}. Download a copy to keep offline.`);
  });
}

/** Upload a backup file: it's decrypted and checked, and a summary is returned. Nothing changes yet. */
export async function uploadBackupAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("backup.manage");
    const file = form.get("file") as File | null;
    const password = String(form.get("password") ?? "");
    if (!file || !file.size) return fail("Choose a backup file.", { file: "Required" });
    if (!password) return fail("Enter the backup password.", { password: "Required" });
    const { token, manifest } = await stageRestore(Buffer.from(await file.arrayBuffer()), password);
    await audit(await auditActor(v), "Uploaded backup for restore", "Backup", null, { file: file.name, createdAt: manifest.createdAt });
    return { ok: true, message: "Backup checked. Review the summary before restoring.", data: { token, manifest, fileName: file.name } };
  });
}

export async function prepareRestoreAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await staffFor("backup.manage");
    const { token, manifest } = await stageExisting(String(form.get("backupId")));
    return { ok: true, data: { token, manifest, fileName: String(form.get("fileName") ?? "") } };
  });
}

export async function restoreAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("backup.manage");
    if (form.get("confirm") !== "RESTORE") return fail("Type RESTORE to confirm.", { confirm: "Type RESTORE" });
    if (!verifyTotp(String(form.get("code") ?? ""), v.user.totpSecret)) return fail("That 2FA code is not correct.", { code: "Code not correct" });
    const actor = await auditActor(v);
    const manifest = await runRestore(String(form.get("token")), who(v));
    await audit(actor, "Restored backup", "Backup", null, { createdAt: manifest.createdAt, counts: manifest.counts });
    return ok("Restore complete. Everyone has been signed out; sign in again.", { redirect: "/login?tab=staff" });
  });
}
