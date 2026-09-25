import { db } from "@/shared/lib/db";
import { audit } from "@/modules/audit";
import { applyRetention, createBackup } from "@/modules/backup";
import { expireUnpaidOrders } from "@/modules/orders";
import { emptyBin } from "@/modules/pupils";

/** Everything that runs once a day (see /api/cron/daily and scripts/cron.ts). */
export async function runDailyJobs() {
  const orders = await expireUnpaidOrders();
  const backup = await createBackup("AUTOMATIC", { name: "Automatic (nightly)" });
  const removedBackups = await applyRetention();
  const purgedPupils = await emptyBin(30);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [attempts, sessions] = await Promise.all([
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: since } } }),
    db.session.deleteMany({ where: { OR: [{ revokedAt: { lt: since } }, { expiresAt: { lt: since } }] } }),
  ]);
  const result = { ...orders, backup: backup.fileName, removedBackups, purgedPupils, oldLoginAttempts: attempts.count, oldSessions: sessions.count };
  await audit({ name: "System", role: "Scheduled job" }, "Daily jobs ran", "System", null, result);
  return result;
}
