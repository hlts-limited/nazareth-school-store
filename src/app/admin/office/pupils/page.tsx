import Link from "next/link";
import { LinkButton, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput, SearchParamSelect } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { deletePupilsAction, moveClassAction, resendInviteAction, searchPupils, selectAllMatchingAction, whatsAppInviteLink } from "@/modules/pupils";
import { PupilTable } from "../../_components";

export const metadata = { title: "Pupils" };

export default async function PupilsPage({ searchParams }: { searchParams: Promise<{ q?: string; cls?: string; status?: string; page?: string }> }) {
  const v = await requireStaff("pupils.manage");
  const sp = await searchParams;
  const status = sp.status === "archived" || sp.status === "all" ? sp.status : "active";
  const [classes, res] = await Promise.all([listClasses(), searchPupils({ q: sp.q, classId: sp.cls, status, page: Number(sp.page) || 1 })]);
  const now = new Date();
  const rows = res.rows.map((p) => {
    const g = p.guardians[0]?.parent;
    // Parents who haven't set a password yet get a "WhatsApp" button with their invite typed out
    const whatsApp = g && g.status === "INVITED" && g.inviteToken && g.inviteExpiresAt && g.inviteExpiresAt > now ? whatsAppInviteLink(g.phone, g.firstName, g.inviteToken) : null;
    return { id: p.id, name: `${p.firstName} ${p.lastName}`, sortName: `${p.lastName}, ${p.firstName}`, reg: p.regNumber, className: p.class.name, parent: g ? `${g.title ? g.title + " " : ""}${g.firstName} ${g.lastName}` : "—", parentId: g?.id ?? null, parentInvited: g?.status === "INVITED", whatsApp, phone: g?.phone ?? "—", status: p.status };
  });
  const pageLink = (n: number) => `/admin/office/pupils?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.cls ? { cls: sp.cls } : {}), ...(status !== "active" ? { status } : {}), page: String(n) })}`;
  return (
    <>
      <PageHeader title="Pupils" sub={`${res.total} ${status === "active" ? "active" : status} pupils`} actions={<><LinkButton href="/admin/office/import" icon="upload">Bulk import</LinkButton><LinkButton href="/admin/office/pupils/new" variant="primary" icon="plus">Add pupil</LinkButton></>} />
      <div className="stack">
        <section className="card"><div className="row">
          <SearchParamInput param="q" id="sp-q" placeholder="Search by name or reg number, e.g. Okafor or NAZ/2019" width={240} />
          <SearchParamSelect param="cls" id="sp-cls" label="Class" options={[["", "All classes"], ...classes.map((c) => [c.id, c.name] as [string, string])]} />
          <SearchParamSelect param="status" id="sp-st" label="Status" options={[["active", "Active"], ["archived", "Archived"], ["all", "All"]]} />
        </div></section>
        <PupilTable rows={rows} classes={classes.map((c) => ({ id: c.id, name: c.name }))} total={res.total}
          query={{ q: sp.q ?? "", classId: sp.cls ?? "", status }} deleteAction={deletePupilsAction} moveAction={moveClassAction} inviteAction={resendInviteAction}
          selectAll={selectAllMatchingAction} canDelete={v.permissions.has("pupils.delete")} />
        {res.pages > 1 && (
          <div className="row between">
            <span className="small muted">Page {res.page} of {res.pages}</span>
            <div className="pager">
              {res.page > 1 ? <Link className="btn sm" href={pageLink(res.page - 1)}><Icon name="back" size="sm" /> Previous</Link> : <span className="btn sm is-disabled"><Icon name="back" size="sm" /> Previous</span>}
              {res.page < res.pages ? <Link className="btn sm" href={pageLink(res.page + 1)}>Next <Icon name="chev" size="sm" /></Link> : <span className="btn sm is-disabled">Next <Icon name="chev" size="sm" /></span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
