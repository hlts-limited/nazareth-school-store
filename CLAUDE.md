# Project context for Claude Code

Nazareth School Store: parents buy books and school accessories for all their children in one checkout.
Stack: Next.js 15 (App Router, server actions), React 19, PostgreSQL + Prisma 6, Tailwind v4 (+ custom CSS in src/app/globals.css), TypeScript. Windows dev machine.

## Status
- Installs, builds and runs locally on Windows (Node 24, PostgreSQL 18 installed natively; no Docker). `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass. Production runs on Vercel (fra1).
- Local database without Docker: create role `nazareth` (password `nazareth`, CREATEDB) and database `nazareth_store` in PostgreSQL, then `npm run setup`.
- Checked by hand with the demo accounts: parent (booklist → cart → simulated Paystack → approved), pupil dashboard, and registrar / secretary / accountant / Super Admin back offices, including role boundaries and the audit log.
- "Not built yet" list is at the end of README.md.

## In progress: website merge (branch `website-merge`)
The public school website (previously static HTML in hlts-limited/Nazareth-website) is being moved into this app so the website, admissions and store are one system with one database and one back office. Phases: public site frame → content pages → admissions module → gallery/events/notices → shared navigation → tests → retire the old site. Do not point nazarethpryschool.org at this app until the owner says so.
- Done: public frame + homepage, and the content pages in src/app/(public) (about, schools, academics, admissions info, gallery, contact).
- The school has three sections (SCHOOL_DIVISIONS in src/shared/config/school.ts): Pre-School (Kindergarten, Pre-Nursery), School A (Prep 1 – Primary 2), School B (Primary 3 – 6). Pages /schools/pre-school, /schools/school-a, /schools/school-b (/schools/primary redirects to School A). Admissions shows each applicant's school and filters by it.
- UI motion lives at the end of globals.css (button lift and sweep, card lift, dropdown/menu animations, hero entrance, scroll reveal via animation-timeline, page fade-in via template.tsx). Keep it under the prefers-reduced-motion rule. The website menu keeps one dropdown open at a time (src/app/(public)/_nav.tsx). Shared page parts are in `_parts.tsx`; class lists come from DEFAULT_CLASSES via `_content.ts`. Old `.html` addresses redirect in next.config.ts.
- Admissions module (src/modules/admissions): admission windows (dates + optional form fee via Paystack), exam slots, applications, documents. Admission open/closed comes from the windows table (`admissionStatus()`), shown in the website's notice bar. Families get a private link `/admissions/application/<number>/<token>` (token stored as sha256) to pay, upload documents and see their exam/result; `/admissions/results` looks up by number + surname initial (rate-limited). Staff: /admin/admissions (Secretary and Super Admin). Enrol calls pupils' `addPupil`, which invites the parent.
- Navigation: store pages (parent and pupil) end with `SchoolFooter` (src/shared/ui/school-footer.tsx) linking to the website; sign-in and invite pages link home; the back office has "View the school website".
- Website module (src/modules/website, permission `website.manage`, Secretary + Super Admin): notices for the announcement bar (up to 3, plus the automatic admission notice), events (/events and the homepage), gallery albums (photos are resized to 1600px JPEG in the browser before upload, stored under `gallery/`, served publicly), and Contact-page messages (/admin/website).
- Admission rules: the class is chosen by age on 31 December of the session's first year (2026/2027 → 31 Dec 2026) (2 Kindergarten … 10 Primary 5; no admission into Primary 6), in src/shared/lib/admission-age.ts, used by the browser form and the server. Required documents (src/modules/admissions/docs.ts): passport photo, baptismal (Catholic) / dedication certificate, birth certificate, uploaded with the form; photos are shrunk in the browser (ActionForm `prepare`) so the request stays under Vercel's 4.5 MB limit. The office can register a child (/admin/admissions/new: any session, class override, form fee paid/online/waived), book exams in bulk (parents get SMS/email via notifyContact), record results in bulk, make a new family link, and move admitted children into their applied class on /admin/admissions/admitted (auto reg numbers, parent invited).
- Application-fee Paystack references start with `NZA`; the shared webhook routes them to `confirmApplicationFee`.
- `vercel-build` runs migrations and the seed only when VERCEL_ENV=production (or MIGRATE_ON_BUILD is set on a preview that has its own database). Preview deployments share production env vars, so never remove that guard.
- Alpha Admin (src/modules/alpha, /admin/alpha): the single account named by ALPHA_ADMIN_EMAIL gets every permission including `system.alpha` (never part of a role; Super Admin doesn't have it), always needs 2FA, and is hidden/protected from Staff & roles and from other admins' forced sign-out. It has the Data explorer (edit any table except AuditLog/Backup/Session; secrets masked), a read-only SQL console (READ ONLY transaction, 15 s limit, one statement), every backup and restore, and the full audit log with CSV export. Every Alpha action is audited. Keep the audit log append-only and the SQL console read-only.
- Tests: `npm test` (pure logic) and `npm run test:db` (scripts/test-db.ts: local `<db>_test` database, temp storage, simulated Paystack; tests in tests/db run one file at a time and clear the rows they use). Never point test:db at a remote database; the script refuses.
- Dark mode uses `--red-fill` for red backgrounds with white text (the bright `--red` fails contrast there).
- The public pages' CSP allows YouTube (nocookie) and Google Maps frames only; it has no `frame-src 'self'`.

## Conventions
- Modular monolith: features live in src/modules/<name>/ with service.ts (logic + DB), actions.ts ("use server": permission check → zod validation → service → audit log), index.ts (public API). Outside a module, import only from "@/modules/<name>" (ESLint rule enforces this).
- Every server action checks a permission from src/modules/access-control/permissions.ts, never a role name.
- Money is whole naira (Int). Order numbers display as NZ-<number+24800>.
- Parent/pupil pages use requireParentActor()/requirePupilActor() so Super Admin "view as" works (read-only).
- Forms use <ActionForm> from src/shared/ui/client.tsx; actions return ActionResult ({ ok, message, fieldErrors, redirect }).
- Keep the UI responsive (phone first) and consistent with the existing CSS classes (card, btn, pill, note, t rt tables).

## Classes (promotion order)
Kindergarten, Pre-Nursery, Prep 1, Prep 2, Primary 1–6 (src/shared/config/school.ts).
