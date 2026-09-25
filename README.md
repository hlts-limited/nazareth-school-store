# Nazareth School Store

*Growing in Wisdom, Age and Grace*

This is the online store where Nazareth School parents buy books, uniforms and school accessories for all their children in one checkout. They pay with Paystack or by bank transfer, and they can follow each order until it's collected. Staff manage everything from a back office, and each person only sees what their role allows.

| Who | What they can do |
|---|---|
| **Parent** | See all their children on one dashboard. Shop from each child's class booklist. Check out once for every child. Pay by Paystack, bank transfer (with a receipt upload) or wallet. Track orders and show a pick-up code. See each child's wallet. |
| **Pupil** (surname + reg number, plus an optional PIN) | See their booklist, their orders and their wallet balance. Add items to a wishlist that their parent sees. Pupils can't pay. |
| **Accountant** | Review transfer receipts against the bank statement: approve them, reject them, or record a part payment. Overpayments go to the child's wallet automatically. Filter invoices by class, date range and status, and export them to Excel, CSV or PDF. Adjust or refund wallets. |
| **Registrar** | Manage items (with sizes, photos and classes) and nested categories. Record restocks and adjustments and see the stock movement log. Pack orders, mark them ready, and hand them out at the pick-up desk. |
| **Secretary** | Add pupils and link them to parents by phone number, with an SMS invite. Bulk-import pupils from Excel with a check before saving. Search by name or reg number. Select pupils to move them to another class or delete them, with a 30-day bin for restoring. |
| **Super Admin** | Everything above, through a workspace switcher. Also: view as any parent or pupil (read-only, 2FA, logged), staff and roles, active sessions and session limits, backup and restore, the audit log, and school settings. |

---

## 1. Run it on your computer (Windows)

You need:
- **Node.js 20 or newer**: https://nodejs.org (choose "LTS")
- **Docker Desktop** for the database: https://www.docker.com/products/docker-desktop
  (Or install PostgreSQL 16 yourself and change `DATABASE_URL` in `.env` to point at it.)

Open **PowerShell** in this folder and run:

```powershell
npm install
copy .env.example .env
```

Open `.env` in a text editor and set:
- `SESSION_SECRET`: a long random string. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `BACKUP_PASSWORD`: any strong password. Write it down somewhere safe.
- `CRON_SECRET`: any random string.
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: the first Super Admin account.

Then start the database, create the tables and add the starting data:

```powershell
npm run db:up        # starts PostgreSQL in Docker
npm run setup        # creates tables, applies security rules, seeds classes/roles/categories (+ demo data)
npm run dev          # starts the app
```

Open **http://localhost:3000**.

### Signing in the first time
- **Super Admin:** use the email and password you set in `.env`. The seed script prints a 2FA set-up key; add it to Google Authenticator or Microsoft Authenticator. You can also run `npm run totp -- admin@yourschool.com.ng` to see the current code.
- **Demo data** (only when `SEED_DEMO="true"`):
  - Parent: `funke.adeyemi@example.com` (or `08034567812`), password `Demo!2026`
  - Pupil: surname `Adeyemi`, reg number `NAZ/2019/014`
  - Registrar: `store@example.com` / `Demo!2026`
  - Secretary: `office@example.com` / `Demo!2026`
  - Accountant: `accounts@example.com` / `Demo!2026`, plus a 2FA code (`npm run totp -- accounts@example.com`)
- Without Paystack keys, the store uses a **simulated Paystack checkout** so you can test the whole flow. It works in development only and never in production.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with live reload |
| `npm test` | Unit tests for payment maths, encryption, file checks and S3 signing |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code style and module boundaries |
| `npm run db:studio` | Browse the database in a web UI |
| `npm run totp -- <email>` | Show a staff member's current 2FA code |

---

## 2. How it's organised (modular)

```
src/
  app/                      # pages and routes only, kept thin
    (parent)/               # home, shop, cart, orders, wallet, notifications, account
    pupil/                  # pupil dashboard
    admin/                  # back office: accounts/, store/, office/, and Super Admin pages
    api/                    # file downloads, exports, Paystack webhook, daily jobs, health check
  modules/                  # one folder per feature; other code imports only its index.ts
    auth/                   # logins, sessions and limits, 2FA, view-as, rate limiting
    access-control/         # permissions and roles
    pupils/  catalogue/  inventory/  cart/  orders/  payments/  wallet/
    fulfilment/  notifications/  reports/  audit/  backup/  settings/  staff/  jobs/
  shared/
    ui/                     # design-system components (buttons, dialogs, forms, toasts)
    lib/                    # database, storage, crypto, formatting, action helpers
    config/                 # environment variables, school details, class list
prisma/
  schema.prisma             # database tables
  sql/harden.sql            # append-only audit log, no negative stock, search indexes
  seed.ts
```

Each module has a `service.ts` (business rules and database access), an `actions.ts` (server actions that check permissions, validate input and write the audit log), and an `index.ts` (its public API). An ESLint rule blocks imports that reach inside another module.

The classes are Kindergarten, Pre-Nursery, Prep 1, Prep 2 and Primary 1–6. They are seeded in that order, which is also the promotion order. Edit `src/shared/config/school.ts` before the first `npm run setup` if the order is different at your school.

---

## 3. Deploy so every device sees the same data

All devices talk to **one central database** on a server, so a pupil added on the Secretary's laptop shows up on a parent's phone straight away. Pick one of these options.

### Option A: managed cloud (least maintenance)
1. **Database:** create a PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and copy its connection string.
2. **File storage:** create a [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket (or AWS S3 / DigitalOcean Spaces) and an access key. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_REGION` (`auto` for R2). This is required on Vercel, because it doesn't keep files on disk.
3. **App:** push this folder to GitHub, import it on [Vercel](https://vercel.com), and add every variable from `.env.example` in the project settings. Set `APP_URL` to your domain.
4. **Tables:** run `npx prisma migrate deploy` and `npm run db:harden` once, with `DATABASE_URL` pointing at the production database. Then run `npx prisma db seed` with `SEED_DEMO="false"`.
5. The **daily job** runs automatically through `vercel.json` (Vercel sends `CRON_SECRET`).

### Option B: your own server (VPS with Docker)
```bash
# on the server (Ubuntu), in this folder, with .env filled in
docker compose --profile app up -d --build
```
The app listens on port 3000 on the server itself. Put a web server such as **Caddy** in front of it for HTTPS; a one-line `Caddyfile` is enough: `store.yourschool.com.ng { reverse_proxy 127.0.0.1:3000 }`. Add the daily job to the crontab:
```
0 1 * * *  curl -s -H "Authorization: Bearer $CRON_SECRET" https://store.yourschool.com.ng/api/cron/daily
```

### Before going live
- [ ] Commit the `prisma/migrations` folder that `npm run setup` created.
- [ ] Put Paystack **live** keys in `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`. In the Paystack dashboard, set the webhook URL to `https://<your-domain>/api/paystack/webhook`.
- [ ] Set the school's bank details in **Super Admin → Settings**.
- [ ] Set `TERMII_API_KEY` and `TERMII_SENDER_ID` (register the sender ID with Termii) for SMS and WhatsApp, and `RESEND_API_KEY` for email. Until then, messages are only printed in the server log.
- [ ] Create one real backup, download it, and test restoring it on a test copy of the database.
- [ ] Invite the real staff from **Super Admin → Staff & roles**, and delete or disable the demo accounts.

---

## 4. Payments, step by step
- **Paystack:** the parent is sent to Paystack's secure page. When they return, the app asks Paystack's API whether the payment succeeded and only approves the order if it did. The webhook does the same check, and a payment is never counted twice.
- **Bank transfer:** the parent sees the school's account details and a reference (the order number), then uploads the receipt. The Accountant enters the amount **actually received** according to the bank statement:
  - **more than was due:** the order is approved and the extra goes into the child's wallet. If the order covered several children, the parent can choose which child keeps it.
  - **less than was due:** the order becomes *Part paid*. The parent is told the balance by SMS, WhatsApp and email, and gets a reminder after 24 hours.
  - **a balance that's never paid:** the order is cancelled after the time limit set in Settings. Its stock goes back on sale, and any money already received goes into the child's wallet.
- If a receipt file was already used on another order, the review screen warns the Accountant that it may be a duplicate.

## 5. Security built in
- **Accounts and sign-in:**
  - Passwords are hashed with bcrypt.
  - Accountant and Super Admin accounts need 2FA (authenticator app).
  - Staff accounts are created by invite only.
  - Changing someone's roles or password signs them out everywhere.
- **Sessions:** sessions are stored on the server, so they can be revoked. Idle timeouts, a maximum length and a limit on devices at once can all be edited in **Super Admin → Sessions**. A warning appears 2 minutes before an idle sign-out.
- **Pupil sign-in:** after 3 failed attempts a check question appears, and after 5 the login is locked for 15 minutes. Parents can add a PIN. Pupil screens are read-only.
- **Permissions:** every server action checks a permission on the server. Parents can only reach their own children and orders.
- **Uploads:** receipts are checked by their actual content (JPG, PNG, WebP or PDF, 5 MB max). Location data is removed from photos, and receipts are served only to their owner and to accounts staff.
- **Audit log:** it can't be edited or deleted (a database trigger blocks it). It records sign-ins, approvals, stock changes, exports, view-as sessions, backups and restores.
- **Web protections:** security headers (CSP, HSTS, frame protection) and HTTPS-only cookies in production.
- **Backups:** backups are encrypted (AES-256-GCM). Restoring needs 2FA, typing RESTORE, and an automatic safety backup taken first.

## 6. Not built yet (next steps)

These items from the plan still need doing:
- **Automated browser tests and load tests** before launch. The payment maths, encryption and file checks already have unit tests.
- **Virus scanning** of uploaded receipts (for example ClamAV). Uploads are already restricted by file type and served in a sandbox.
- **Extra database protections:** field-level encryption of phone numbers and emails, and PostgreSQL row-level security. Access is currently enforced in the application code.
- **Offline support:** a service worker for offline caching. The app is already installable (web manifest and icons), but it doesn't cache pages offline.
- **Live updates:** staff screens update when you navigate or refresh, not by live push.
- **Smaller features:**
  - Booklists per term. They are per class for now.
  - One-click end-of-session promotion. Use "Move to class" on selected pupils for now.
  - Pupil photos.
  - Adding the Paystack fee at checkout.
  - A self-service data download for parents.
