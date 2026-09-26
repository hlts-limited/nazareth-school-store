import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Tables deliberately left out of backups: sign-ins are re-done after a restore, and the backup list describes the files themselves.
const NOT_BACKED_UP = new Set(["Backup", "LoginAttempt", "Session", "ViewAsSession"]);

test("every database table is in the backup (or deliberately excluded)", () => {
  const models = [...readFileSync("prisma/schema.prisma", "utf8").matchAll(/^model (\w+)/gm)].map((m) => m[1]);
  const backed = new Set([...readFileSync("src/modules/backup/service.ts", "utf8").matchAll(/\["\w+", "(\w+)"\]/g)].map((m) => m[1]));
  const missing = models.filter((m) => !backed.has(m) && !NOT_BACKED_UP.has(m));
  assert.deepEqual(missing, [], `Add these tables to TABLES in src/modules/backup/service.ts: ${missing.join(", ")}`);
});
