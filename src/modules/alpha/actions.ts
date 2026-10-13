"use server";

import { db } from "@/shared/lib/db";
import { fail, ok, runAction, type ActionResult } from "@/shared/lib/action";
import { auditActor, hashPassword, passwordProblem, revokeAllForUser, staffFor, verifyTotp } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { createRow, deleteRow, editableFields, modelInfo, rowKey, runReadOnlySql, updateRow } from "./service";

const alpha = () => staffFor("system.alpha");

/** Form fields named f.<field> → { field: value } */
const fieldValues = (form: FormData) =>
  Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("f.")).map(([k, v]) => [k.slice(2), String(v)]));

export async function updateRowAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await alpha();
    const m = modelInfo(String(form.get("model")));
    const key = String(form.get("key"));
    const r = await updateRow(m, key, fieldValues(form));
    const n = Object.keys(r.changes).length;
    if (!n) return ok("Nothing changed.");
    await audit(await auditActor(v), "Alpha: edited row", m.name, key, { changes: r.changes });
    return ok(`Saved (${n} field${n === 1 ? "" : "s"} changed).`);
  });
}

export async function createRowAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await alpha();
    const m = modelInfo(String(form.get("model")));
    const row = await createRow(m, fieldValues(form));
    const key = rowKey(m, row);
    await audit(await auditActor(v), "Alpha: added row", m.name, key, { values: Object.fromEntries(editableFields(m, true).map((f) => [f.name, String(row[f.name] ?? "")])) });
    return ok("Row added.", { redirect: `/admin/alpha/data/${m.name}/row?k=${encodeURIComponent(key)}` });
  });
}

export async function deleteRowAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await alpha();
    const m = modelInfo(String(form.get("model")));
    if (form.get("confirm") !== "DELETE") return fail("Type DELETE to confirm.", { confirm: "Type DELETE" });
    const key = String(form.get("key"));
    const row = await deleteRow(m, key);
    await audit(await auditActor(v), "Alpha: deleted row", m.name, key, { values: Object.fromEntries(editableFields(m, true).map((f) => [f.name, String(row[f.name] ?? "")])) });
    return ok("Row deleted.", { redirect: `/admin/alpha/data/${m.name}` });
  });
}

/** Read-only query. Every query is recorded in the audit log. */
export async function runSqlAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await alpha();
    const sql = String(form.get("sql") ?? "");
    const actor = await auditActor(v);
    try {
      const r = await runReadOnlySql(sql);
      await audit(actor, "Alpha: ran SQL query", "Database", null, { sql: sql.slice(0, 2000), rows: r.total });
      return { ok: true, data: r };
    } catch (e) {
      await audit(actor, "Alpha: SQL query refused", "Database", null, { sql: sql.slice(0, 2000) });
      throw e;
    }
  });
}

/** Set any account's password (staff or parent). Their sessions end. Confirmed with the Alpha Admin's 2FA code. */
export async function setPasswordAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await alpha();
    const userId = String(form.get("userId"));
    const password = String(form.get("password") ?? "");
    const problem = passwordProblem(password);
    if (problem) return fail(problem, { password: problem });
    if (!verifyTotp(String(form.get("code") ?? ""), v.user.totpSecret)) return fail("That 2FA code is not correct.", { code: "Code not correct" });
    const u = await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), status: "ACTIVE", inviteToken: null } });
    if (u.id !== v.user.id) await revokeAllForUser(u.id, "Password set by Alpha Admin");
    await audit(await auditActor(v), "Alpha: set password", "User", u.id, { email: u.email, phone: u.phone });
    return ok(`Password set for ${u.firstName} ${u.lastName}.${u.id !== v.user.id ? " They have been signed out everywhere." : ""}`);
  });
}

export async function signOutEverywhereAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await alpha();
    const userId = String(form.get("userId"));
    if (userId === v.user.id) return fail("Use Sign out for your own account.");
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await revokeAllForUser(u.id, "Signed out by Alpha Admin");
    await audit(await auditActor(v), "Alpha: signed user out everywhere", "User", u.id, { email: u.email, phone: u.phone });
    return ok(`${u.firstName} ${u.lastName} has been signed out everywhere.`);
  });
}
