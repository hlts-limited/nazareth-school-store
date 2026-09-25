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
