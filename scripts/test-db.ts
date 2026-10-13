/* Database tests: npm run test:db
 * Uses a separate database next to the one in .env (same server, name + "_test", created on first run), applies the migrations
 * and the demo seed (both safe to repeat), then runs tests/db/*.test.ts against it. Each test clears the rows it relies on. Files go to a temporary folder. Your own data and storage are never touched.
 * Payments use the simulated checkout and no email or SMS is sent.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("Set DATABASE_URL in .env first.");
const url = new URL(base);
const name = url.pathname.slice(1);
url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
if (!url.pathname.endsWith("_test")) throw new Error("Refusing to run: the test database name must end in _test.");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error(`Refusing to run against ${url.hostname}: database tests only run on a local server.`);

const storageDir = mkdtempSync(join(tmpdir(), "nazareth-test-"));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: url.toString(),
  DATABASE_URL_UNPOOLED: url.toString(),
  STORAGE_DIR: storageDir,
  S3_ENDPOINT: "", S3_BUCKET: "",
  PAYSTACK_SECRET_KEY: "", PAYSTACK_PUBLIC_KEY: "",
  RESEND_API_KEY: "", TERMII_API_KEY: "",
  SEED_DEMO: "true",
};
const run = (cmd: string) => execSync(cmd, { stdio: "inherit", env });

let failed = false;
try {
  run("npx prisma migrate deploy");
  run("npm run db:harden");
  run("npx prisma db seed");
  run("npx tsx --test --test-concurrency=1 tests/db/*.test.ts"); // one file at a time: they share the database
} catch {
  failed = true;
} finally {
  rmSync(storageDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
