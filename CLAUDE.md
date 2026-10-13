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
- Done: public frame + homepage, and the content pages in src/app/(public) (about, schools, academics, admissions info, gallery, contact). Shared page parts are in `_parts.tsx`; class lists come from DEFAULT_CLASSES via `_content.ts`. Old `.html` addresses redirect in next.config.ts.
- Admission status (open/closed) lives in `ADMISSION` in school.ts until the admissions module replaces it. `/admissions/apply` and `/admissions/results` are placeholders for that module.
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
