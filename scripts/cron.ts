/* Run the daily jobs from the command line (for a VPS crontab):
 *   0 1 * * *  cd /srv/nazareth-school-store && npm run cron >> /var/log/nazareth-cron.log 2>&1
 * Or call the HTTP endpoint instead: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/daily
 */
const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/cron/daily`;

(async () => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
  console.log(new Date().toISOString(), r.status, await r.text());
  if (!r.ok) process.exit(1);
})();
