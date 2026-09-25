import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Pupil, Session, User } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { requestMeta } from "@/shared/lib/request";
import { ROLE_DEFS, type Permission, roleName } from "@/modules/access-control";
import type { AuditActor } from "@/modules/audit";
import { enforceLimits, readSession, VIEWAS_COOKIE } from "./session";

export type StaffViewer = { kind: "staff"; session: Session; user: User; roles: string[]; permissions: Set<string>; isAdmin: boolean };
export type ParentViewer = { kind: "parent"; session: Session; user: User };
export type PupilViewer = { kind: "pupil"; session: Session; pupil: Pupil };
export type Viewer = StaffViewer | ParentViewer | PupilViewer;

/** Who is signed in on this request (null if nobody, or the session timed out). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const s = await readSession();
  if (!s) return null;
  if (s.kind === "PUPIL" && s.pupilId) {
    const pupil = await db.pupil.findUnique({ where: { id: s.pupilId } });
    if (!pupil || pupil.status !== "ACTIVE" || pupil.deletedAt) return null;
    if (!(await enforceLimits(s, "PUPIL"))) return null;
    return { kind: "pupil", session: s, pupil };
  }
  if (!s.userId) return null;
  const user = await db.user.findUnique({ where: { id: s.userId }, include: { roles: true } });
  if (!user || user.status !== "ACTIVE") return null;
  if (s.kind === "PARENT") {
    if (!(await enforceLimits(s, "PARENT"))) return null;
    return { kind: "parent", session: s, user };
  }
  const roles = user.roles.map((r) => r.roleId);
  const isAdmin = roles.includes("admin");
  if (!(await enforceLimits(s, isAdmin ? "ADMIN" : "STAFF"))) return null;
  const permissions = new Set<string>(ROLE_DEFS.filter((r) => roles.includes(r.id)).flatMap((r) => r.permissions));
  return { kind: "staff", session: s, user, roles, permissions, isAdmin };
});

export async function requireStaff(perm?: Permission): Promise<StaffViewer> {
  const v = await getViewer();
  if (!v || v.kind !== "staff") redirect("/login?next=admin");
  if (perm && !v.permissions.has(perm)) redirect("/admin?denied=1");
  return v;
}

/** Use inside server actions: throws a friendly error instead of redirecting. */
export async function staffFor(perm: Permission): Promise<StaffViewer> {
  const v = await getViewer();
  if (!v || v.kind !== "staff") throw new UserError("Your session has ended. Please sign in again.");
  if (!v.permissions.has(perm)) throw new UserError("You don't have permission to do that.");
  return v;
}

// ---------- View-as (Super Admin sees a parent's or pupil's screens, read-only) ----------
export type ViewAs = { id: string; targetKind: "parent" | "pupil"; targetId: string; name: string; expiresAt: Date };

export const getViewAs = cache(async (): Promise<ViewAs | null> => {
  const v = await getViewer();
  if (!v || v.kind !== "staff" || !v.permissions.has("viewas.use")) return null;
  const jar = await cookies();
  const id = jar.get(VIEWAS_COOKIE)?.value;
  if (!id) return null;
  const row = await db.viewAsSession.findFirst({ where: { id, adminId: v.user.id, sessionId: v.session.id, endedAt: null, expiresAt: { gt: new Date() } } });
  if (!row) return null;
  let name = "";
  if (row.targetKind === "parent") {
    const u = await db.user.findUnique({ where: { id: row.targetId } });
    name = u ? `${u.title ? u.title + " " : ""}${u.firstName} ${u.lastName}` : "parent";
  } else {
    const p = await db.pupil.findUnique({ where: { id: row.targetId } });
    name = p ? `${p.firstName} ${p.lastName}` : "pupil";
  }
  return { id: row.id, targetKind: row.targetKind as "parent" | "pupil", targetId: row.targetId, name, expiresAt: row.expiresAt };
});

/** For parent pages: the parent being shown (the signed-in parent, or the one an admin is viewing as). */
export async function requireParentActor(): Promise<{ parent: User; readOnly: boolean; viewAs: ViewAs | null }> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.kind === "parent") return { parent: v.user, readOnly: false, viewAs: null };
  if (v.kind === "staff") {
    const va = await getViewAs();
    if (va?.targetKind === "parent") {
      const parent = await db.user.findUnique({ where: { id: va.targetId } });
      if (parent) return { parent, readOnly: true, viewAs: va };
    }
    redirect("/admin");
  }
  redirect("/pupil");
}

export async function requirePupilActor(): Promise<{ pupil: Pupil; readOnly: boolean; viewAs: ViewAs | null }> {
  const v = await getViewer();
  if (!v) redirect("/login?tab=pupil");
  if (v.kind === "pupil") return { pupil: v.pupil, readOnly: false, viewAs: null };
  if (v.kind === "staff") {
    const va = await getViewAs();
    if (va?.targetKind === "pupil") {
      const pupil = await db.pupil.findUnique({ where: { id: va.targetId } });
      if (pupil) return { pupil, readOnly: true, viewAs: va };
    }
    redirect("/admin");
  }
  redirect("/home");
}

/** For parent server actions: a real parent session only (view-as is read-only). */
export async function parentForAction(): Promise<User> {
  const v = await getViewer();
  if (v?.kind === "staff" && (await getViewAs())) throw new UserError("Read-only while viewing as someone else. Exit view-as to make changes.");
  if (!v || v.kind !== "parent") throw new UserError("Your session has ended. Please sign in again.");
  return v.user;
}

export async function pupilForAction(): Promise<Pupil> {
  const v = await getViewer();
  if (v?.kind === "staff" && (await getViewAs())) throw new UserError("Read-only while viewing as someone else.");
  if (!v || v.kind !== "pupil") throw new UserError("Your session has ended. Please sign in again.");
  return v.pupil;
}

/** Name/role/IP for the audit log */
export async function auditActor(v: Viewer): Promise<AuditActor> {
  const { ip } = await requestMeta();
  if (v.kind === "pupil") return { id: v.pupil.id, name: `${v.pupil.firstName} ${v.pupil.lastName}`, role: "Pupil", ip };
  if (v.kind === "parent") return { id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}`, role: "Parent", ip };
  return { id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}`, role: v.roles.map(roleName).join(", "), ip };
}

export const displayName = (u: { title?: string | null; firstName: string; lastName: string }) => `${u.title ? u.title + " " : ""}${u.firstName} ${u.lastName}`;
