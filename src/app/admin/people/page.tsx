import Link from "next/link";
import { db } from "@/shared/lib/db";
import { Card, Empty, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff, startViewAs } from "@/modules/auth";
import { ViewAsButton } from "../_components";

export const metadata = { title: "View as parent or pupil" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireStaff("viewas.use");
  const sp = await searchParams;
  const tab = sp.tab === "pupils" ? "pupils" : "parents";
  const q = sp.q?.trim();
  const parents = tab === "parents" ? await db.user.findMany({
    where: { type: "PARENT", ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { guardianships: { include: { pupil: true } } }, orderBy: { lastName: "asc" }, take: 40,
  }) : [];
  const pupils = tab === "pupils" ? await db.pupil.findMany({
    where: { deletedAt: null, ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { regNumber: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { class: true }, orderBy: { lastName: "asc" }, take: 40,
  }) : [];
  return (
    <>
      <PageHeader title="View as parent or pupil" sub="Open anyone's dashboard without their password. Views are read-only, need your 2FA code and a reason, end after 30 minutes, and are logged." />
      <div className="stack">
        <div className="row">
          <div className="seg">
            <Link href="/admin/people?tab=parents" className={`btn sm ${tab === "parents" ? "" : "ghost"}`}>Parents</Link>
            <Link href="/admin/people?tab=pupils" className={`btn sm ${tab === "pupils" ? "" : "ghost"}`}>Pupils</Link>
          </div>
          <SearchParamInput param="q" id="ap-q" placeholder="Search by name, phone or reg number" />
        </div>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr>{tab === "parents" ? <><th>Parent</th><th>Phone</th><th>Children</th></> : <><th>Pupil</th><th>Reg no.</th><th>Class</th></>}<th /></tr></thead>
            <tbody>
              {tab === "parents" ? parents.map((p) => (
                <tr key={p.id}>
                  <td data-label="Parent"><b>{p.title ? p.title + " " : ""}{p.firstName} {p.lastName}</b>{p.status !== "ACTIVE" && <span className="small muted"> · {p.status.toLowerCase()}</span>}</td>
                  <td data-label="Phone" className="tnum">{p.phone}</td>
                  <td data-label="Children">{p.guardianships.map((g) => g.pupil.firstName).join(", ")}</td>
                  <td data-label="" className="r"><ViewAsButton action={startViewAs} target={`parent:${p.id}`} name={`${p.firstName} ${p.lastName}`} /></td>
                </tr>
              )) : pupils.map((p) => (
                <tr key={p.id}>
                  <td data-label="Pupil"><b>{p.firstName} {p.lastName}</b></td><td data-label="Reg no." className="mono">{p.regNumber}</td><td data-label="Class">{p.class.name}</td>
                  <td data-label="" className="r"><ViewAsButton action={startViewAs} target={`pupil:${p.id}`} name={`${p.firstName} ${p.lastName}`} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {(tab === "parents" ? parents.length : pupils.length) === 0 && <Empty title="No one matches" />}
        </Card>
      </div>
    </>
  );
}
