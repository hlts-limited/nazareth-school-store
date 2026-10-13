// Runs against the throwaway test database: npm run test:db
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { UserError } from "../../src/shared/lib/action";
import { createRow, deleteRow, getRow, listRows, modelInfo, rowKey, runReadOnlySql, show, updateRow } from "../../src/modules/alpha/service";

test("SQL console reads data and hides secrets", async () => {
  const r = await runReadOnlySql(`SELECT email, "passwordHash" FROM "User" WHERE type = 'STAFF' LIMIT 1;`);
  assert.deepEqual(r.columns, ["email", "passwordHash"]);
  assert.equal(r.rows[0][1], "•••••• (hidden)");
});

test("SQL console can't change anything", async () => {
  const before = await db.class.count();
  for (const sql of [
    `DELETE FROM "Class"`,
    `UPDATE "User" SET status = 'DISABLED'`,
    `SELECT 1; DELETE FROM "Class"`,
    `SELECT pg_read_file('/etc/passwd')`,
    `SELECT pg_sleep(30)`,
  ]) await assert.rejects(runReadOnlySql(sql), UserError, sql);
  // Writes hidden inside a reading statement are stopped by the read-only transaction
  await assert.rejects(runReadOnlySql(`WITH gone AS (DELETE FROM "Class" RETURNING id) SELECT * FROM gone`), /read-only/);
  await assert.rejects(runReadOnlySql(`EXPLAIN ANALYZE DELETE FROM "Class"`), /read-only/);
  assert.equal(await db.class.count(), before);
});

test("data explorer edits, adds and deletes rows, and reports what changed", async () => {
  const m = modelInfo("Enquiry");
  const row = await createRow(m, { name: "Alpha test", subject: "S", message: "M", email: "" });
  assert.equal(row.email, null, "empty optional fields become null");
  const key = rowKey(m, row);
  const r = await updateRow(m, key, { name: "Alpha test 2", subject: "S", message: "M", createdAt: show("createdAt", row.createdAt) });
  assert.deepEqual(r.changes, { name: ["Alpha test", "Alpha test 2"] }, "unchanged fields (including dates) aren't touched");
  assert.equal((await getRow(m, key))?.name, "Alpha test 2");
  assert.ok((await listRows(m, { q: "alpha TEST" })).total >= 1);
  await deleteRow(m, key);
  assert.equal(await getRow(m, key), null);
});

test("data explorer checks types and protects the audit log", async () => {
  await assert.rejects(createRow(modelInfo("Class"), { name: "X", sortOrder: "two" }), /number/);
  const audit = modelInfo("AuditLog");
  const any = await db.auditLog.findFirst();
  if (any) {
    await assert.rejects(updateRow(audit, rowKey(audit, any), { action: "changed" }), /append-only/);
    await assert.rejects(deleteRow(audit, rowKey(audit, any)), /append-only/);
  }
  await assert.rejects(createRow(audit, { action: "fake" }), /append-only/);
});

test("secret fields can't be edited through the explorer", async () => {
  const m = modelInfo("User");
  const u = await db.user.findFirstOrThrow({ where: { passwordHash: { not: null } } });
  const r = await updateRow(m, rowKey(m, u), { passwordHash: "x", totpSecret: "y" });
  assert.deepEqual(r.changes, {});
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash, u.passwordHash);
});
