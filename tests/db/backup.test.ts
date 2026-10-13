// Runs against the throwaway test database: npm run test:db
// Full backup → change data → restore, including the admissions and website tables and their files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { storage } from "../../src/shared/lib/storage";
import { createBackup, readBackupFile } from "../../src/modules/backup/service";
import { runRestore, stageExisting, stageRestore } from "../../src/modules/backup/service";
import { env } from "../../src/shared/config/env";

const snapshot = async () => ({
  users: await db.user.count(), pupils: await db.pupil.count(), orders: await db.order.count(), audit: await db.auditLog.count(),
  windows: await db.admissionWindow.count(), applications: await db.application.count(), docs: await db.applicationDocument.count(),
  notices: await db.notice.count(), events: await db.event.count(), photos: await db.galleryPhoto.count(), enquiries: await db.enquiry.count(),
});

test("backup and restore round-trips every table and file", async () => {
  // Make sure the new tables have something in them
  const staff = await db.user.findFirstOrThrow({ where: { type: "STAFF" } });
  const cls = await db.class.findFirstOrThrow();
  await db.applicationDocument.deleteMany({ where: { application: { number: "NZA30-BACKUP" } } });
  await db.application.deleteMany({ where: { number: "NZA30-BACKUP" } });
  await db.admissionWindow.deleteMany({ where: { session: "2030/2031" } });
  const safetyBefore = await db.backup.count({ where: { kind: "SAFETY" } });
  const w = await db.admissionWindow.create({ data: { session: "2030/2031", opensAt: new Date("2030-01-01"), closesAt: new Date("2030-03-01"), formFee: 2500 } });
  const app = await db.application.create({
    data: {
      number: "NZA30-BACKUP", accessTokenHash: "x".repeat(64), windowId: w.id, classId: cls.id, status: "SUBMITTED", surname: "Backup", otherNames: "Test",
      dateOfBirth: new Date("2022-01-01"), gender: "Male", parentName: "P", relationship: "Father", parentPhone: "08030000099", address: "A", details: {},
    },
  });
  await storage().put(`admissions/${app.id}/birth-test.pdf`, Buffer.from("%PDF-1.4 backup test"), "application/pdf");
  await db.applicationDocument.create({ data: { applicationId: app.id, kind: "birth", fileKey: `admissions/${app.id}/birth-test.pdf`, fileName: "birth.pdf", mimeType: "application/pdf", size: 20 } });
  await storage().put("gallery/backup-test.jpg", Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg");
  await db.galleryPhoto.create({ data: { album: "Backup album", fileKey: "gallery/backup-test.jpg" } });
  await db.notice.create({ data: { text: "Backup notice", startsAt: new Date(), createdById: staff.id } });
  await db.event.create({ data: { title: "Backup event", startsAt: new Date() } });
  await db.enquiry.create({ data: { name: "Backup", subject: "S", message: "M" } });

  const before = await snapshot();
  const b = await createBackup("MANUAL", { id: staff.id, name: "Test" });
  const counts = b.counts as Record<string, number>;
  assert.equal(counts.Application, before.applications);
  assert.equal(counts.GalleryPhoto, before.photos);
  assert.ok(counts.files >= 2);

  // Things go wrong after the backup
  await db.notice.deleteMany();
  await db.applicationDocument.deleteMany();
  await db.application.deleteMany({ where: { id: app.id } });
  await storage().delete("gallery/backup-test.jpg");
  await storage().delete(`admissions/${app.id}/birth-test.pdf`);
  await db.enquiry.create({ data: { name: "After backup", subject: "S", message: "M" } });

  const staged = await stageExisting(b.id);
  assert.equal(staged.manifest.counts.Application, before.applications);
  await runRestore(staged.token, { id: staff.id, name: "Test" });

  assert.deepEqual(await snapshot(), before);
  assert.ok(await db.application.findUnique({ where: { number: "NZA30-BACKUP" } }));
  assert.equal(await db.enquiry.count({ where: { name: "After backup" } }), 0);
  assert.ok(await storage().get("gallery/backup-test.jpg"));
  assert.equal((await storage().get(`admissions/${app.id}/birth-test.pdf`))?.toString(), "%PDF-1.4 backup test");
  assert.equal(await db.backup.count({ where: { kind: "SAFETY" } }), safetyBefore + 1, "a safety backup is taken before restoring");
});

test("a downloaded backup can be uploaded again, and a wrong password is refused", async () => {
  const staff = await db.user.findFirstOrThrow({ where: { type: "STAFF" } });
  const b = await createBackup("MANUAL", { id: staff.id, name: "Test" });
  const file = await readBackupFile(b.id);
  assert.ok(file);
  await assert.rejects(stageRestore(file.buf, "not-the-password"));
  const staged = await stageRestore(file.buf, env().BACKUP_PASSWORD);
  assert.equal(staged.manifest.app, "nazareth-school-store");
});
