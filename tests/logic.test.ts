import { test } from "node:test";
import assert from "node:assert/strict";
import { amountDue, invoiceLabel, settle, stepIndex, statusesFor } from "../src/modules/orders/status";
import { normalizePhone, orderNo, parseOrderNo, invoiceNo } from "../src/shared/lib/format";
import { decryptWithPassword, encryptWithPassword } from "../src/shared/lib/crypto";
import { signS3, sniffType, stripJpegMetadata } from "../src/shared/lib/files";

test("overpayment: approved, excess goes to wallet", () => {
  assert.deepEqual(settle(46300, 50000), { outcome: "approved", applied: 46300, excess: 3700, balance: 0 });
});

test("exact payment: approved, no excess", () => {
  assert.deepEqual(settle(18400, 18400), { outcome: "approved", applied: 18400, excess: 0, balance: 0 });
});

test("underpayment: part paid, balance reported", () => {
  assert.deepEqual(settle(38500, 30000), { outcome: "part", applied: 30000, excess: 0, balance: 8500 });
});

test("second transfer after part payment settles the balance", () => {
  const o = { subtotal: 38500, walletUsed: 0, amountReceived: 30000 };
  assert.equal(amountDue(o), 8500);
  assert.equal(settle(amountDue(o), 10000).excess, 1500);
});

test("wallet use reduces what's due", () => {
  assert.equal(amountDue({ subtotal: 20000, walletUsed: 3700, amountReceived: 0 }), 16300);
  assert.equal(amountDue({ subtotal: 20000, walletUsed: 3700, amountReceived: 20000 }), 0);
});

test("invoice status labels map order statuses", () => {
  assert.equal(invoiceLabel("PAYMENT_APPROVED"), "Approved");
  assert.equal(invoiceLabel("HANDED_OUT"), "Approved");
  assert.equal(invoiceLabel("AWAITING_VERIFICATION"), "Pending");
  assert.equal(invoiceLabel("PENDING_PAYMENT"), "Pending");
  assert.equal(invoiceLabel("PART_PAID"), "Part paid");
  assert.deepEqual(statusesFor("Pending").sort(), ["AWAITING_VERIFICATION", "PENDING_PAYMENT"]);
});

test("tracking steps", () => {
  assert.equal(stepIndex("AWAITING_VERIFICATION"), 1);
  assert.equal(stepIndex("READY"), 3);
  assert.equal(stepIndex("HANDED_OUT"), 5);
});

test("order numbers round-trip", () => {
  assert.equal(orderNo(15), "NZ-24815");
  assert.equal(invoiceNo(15), "INV-24815");
  assert.equal(parseOrderNo("NZ-24815"), 15);
  assert.equal(parseOrderNo("24815"), 15);
  assert.equal(parseOrderNo("hello"), null);
});

test("Nigerian phone numbers are normalised", () => {
  assert.equal(normalizePhone("0803 456 7812"), "08034567812");
  assert.equal(normalizePhone("+234 803 456 7812"), "08034567812");
  assert.equal(normalizePhone("2348034567812"), "08034567812");
  assert.equal(normalizePhone("12345"), null);
});

test("backup encryption round-trips and rejects a wrong password", () => {
  const data = Buffer.from("pupils and orders ".repeat(100));
  const enc = encryptWithPassword(data, "correct horse");
  assert.ok(!enc.includes(Buffer.from("pupils and orders")));
  assert.deepEqual(decryptWithPassword(enc, "correct horse"), data);
  assert.throws(() => decryptWithPassword(enc, "wrong"), /Wrong backup password/);
  assert.throws(() => decryptWithPassword(Buffer.from("not a backup at all, clearly not one"), "x"), /not a Nazareth/);
});

test("file type is detected from content, not the name", () => {
  assert.equal(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime, "image/jpeg");
  assert.equal(sniffType(Buffer.from("%PDF-1.7 xxxxxxxx"))?.mime, "application/pdf");
  assert.equal(sniffType(Buffer.from("<html><script>alert(1)</script>")), null);
});

test("JPEG metadata (EXIF, GPS) is stripped", () => {
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x08]), Buffer.from("Exif\0\0")]);
  const dqt = Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x01, 0x02]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), exif, dqt, sos]);
  const out = stripJpegMetadata(jpg);
  assert.ok(!out.includes(Buffer.from("Exif")));
  assert.deepEqual(out, Buffer.concat([Buffer.from([0xff, 0xd8]), dqt, sos]));
});

test("S3 request signing matches AWS's published example", () => {
  // Example from the AWS docs: "GET Object" with a Range header
  const s = signS3({
    method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", region: "us-east-1",
    accessKey: "AKIAIOSFODNN7EXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", amzDate: "20130524T000000Z",
    extraHeaders: { range: "bytes=0-9" },
  });
  assert.equal(s.signature, "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
});

test("role boundaries for the website and admissions", async () => {
  const { ROLE_DEFS, STAFF_SECTIONS, ALL_PERMISSIONS } = await import("../src/modules/access-control/permissions");
  const perms = (id: string) => new Set(ROLE_DEFS.find((r) => r.id === id)!.permissions);
  for (const p of ["admissions.view", "admissions.manage", "admissions.publish", "website.manage"]) {
    assert.ok(perms("secretary").has(p as never), `secretary has ${p}`);
    assert.ok(perms("admin").has(p as never), `admin has ${p}`);
    assert.ok(!perms("accountant").has(p as never), `accountant lacks ${p}`);
    assert.ok(!perms("registrar").has(p as never), `registrar lacks ${p}`);
  }
  // Every back-office link sits in a section guarded by a real permission
  const all = new Set(ALL_PERMISSIONS);
  for (const s of STAFF_SECTIONS) assert.ok(all.has(s.perm), `${s.id} uses a known permission`);
});

test("Alpha access is never part of a role, not even Super Admin", async () => {
  const { ROLE_DEFS, ALL_PERMISSIONS, roleName } = await import("../src/modules/access-control/permissions");
  for (const r of ROLE_DEFS) assert.ok(!(r.permissions as string[]).includes("system.alpha"), `${r.id} must not have system.alpha`);
  assert.ok((ALL_PERMISSIONS as string[]).includes("system.alpha"));
  assert.equal(roleName("alpha"), "Alpha Admin");
});

test("admission class is chosen by age on 31 December of the session's first year", async () => {
  const { admissionClassFor, ageOn, lagosDay } = await import("../src/shared/lib/admission-age");
  const cls = (dob: string) => admissionClassFor(dob, "2026/2027").className;
  assert.equal(admissionClassFor("2024-12-31", "2026/2027").on, "2026-12-31");
  assert.equal(admissionClassFor("2024-12-31", "2027/2028").on, "2027-12-31", "follows whichever session the school creates");
  assert.equal(ageOn("2024-12-31", "2026-12-31"), 2, "birthday on the day counts");
  assert.equal(ageOn("2025-01-01", "2026-12-31"), 1, "a day short");
  assert.equal(cls("2024-12-31"), "Kindergarten");
  assert.equal(cls("2024-01-15"), "Kindergarten", "2 by 31 December, even though 1 in September");
  assert.equal(cls("2023-06-15"), "Pre-Nursery");
  assert.equal(cls("2022-01-01"), "Prep 1");
  assert.equal(cls("2021-03-04"), "Prep 2");
  assert.equal(cls("2020-12-31"), "Primary 1");
  assert.equal(cls("2016-12-31"), "Primary 5");
  assert.equal(cls("2015-12-31"), null, "11-year-olds would be Primary 6: not admitted");
  assert.match(admissionClassFor("2015-12-31", "2026/2027").problem!, /Primary 6/);
  assert.equal(cls("2025-01-01"), null, "under 2");
  assert.match(admissionClassFor("2025-01-01", "2026/2027").problem!, /at least 2 years old on 31 December 2026/);
  assert.equal(lagosDay(new Date("2021-03-04T00:00:00+01:00")), "2021-03-04", "stored midnight-in-Lagos dates read back as the same day");
});

test("document labels follow the family's religion", async () => {
  const { DOC_KINDS, docLabel } = await import("../src/modules/admissions/docs");
  assert.deepEqual(DOC_KINDS.map((d) => d.kind), ["passport", "faith", "birth"]);
  assert.ok(DOC_KINDS.every((d) => d.required));
  assert.equal(docLabel("faith", "Catholic"), "Baptismal certificate");
  assert.equal(docLabel("faith", "Christian (other denomination)"), "Dedication certificate");
  assert.match(docLabel("faith"), /Catholic.*dedication/);
});

test("old website addresses redirect permanently", async () => {
  const { default: config } = await import("../next.config");
  const redirects = await config.redirects!();
  const to = (src: string) => redirects.find((r) => r.source === src);
  // Every page of the old static site (hlts-limited/Nazareth-website)
  const OLD_PAGES = [
    "index", "welcome-address", "history", "vision-mission", "management", "nursery-primary-school", "high-school", "curriculum", "co-curricular",
    "why-choose-nazareth", "admission-process", "admission-faqs", "apply-online", "admission-update", "gallery", "contact", "admin-login", "admin-dashboard",
  ];
  for (const src of OLD_PAGES.map((p) => `/${p}.html`)) {
    const r = to(src);
    assert.ok(r, `${src} redirects`);
    assert.equal(r.permanent, true);
  }
});
