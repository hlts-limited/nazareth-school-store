# Project context for Claude Code

Nazareth School Store: parents buy books and school accessories for all their children in one checkout.
Stack: Next.js 15 (App Router, server actions), React 19, PostgreSQL + Prisma 6, Tailwind v4 (+ custom CSS in src/app/globals.css), TypeScript. Windows dev machine.

## Status (handover)
- Code was written in a cloud workspace that couldn't download npm packages, so it has **never been installed, built or run**. First job: `npm install`, set up `.env`, `npm run db:up`, `npm run setup`, `npm run dev`, then fix any build/type errors.
- Verified so far: unit tests in tests/ (payment maths, encryption, file checks, S3 signing), schema + raw SQL tested on PostgreSQL 16.
- "Not built yet" list is at the end of README.md.

## Conventions
- Modular monolith: features live in src/modules/<name>/ with service.ts (logic + DB), actions.ts ("use server": permission check → zod validation → service → audit log), index.ts (public API). Outside a module, import only from "@/modules/<name>" (ESLint rule enforces this).
- Every server action checks a permission from src/modules/access-control/permissions.ts, never a role name.
- Money is whole naira (Int). Order numbers display as NZ-<number+24800>.
- Parent/pupil pages use requireParentActor()/requirePupilActor() so Super Admin "view as" works (read-only).
- Forms use <ActionForm> from src/shared/ui/client.tsx; actions return ActionResult ({ ok, message, fieldErrors, redirect }).
- Keep the UI responsive (phone first) and consistent with the existing CSS classes (card, btn, pill, note, t rt tables).

## Classes (promotion order)
Kindergarten, Pre-Nursery, Prep 1, Prep 2, Primary 1–6 (src/shared/config/school.ts).
