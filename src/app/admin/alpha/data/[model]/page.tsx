import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { MODELS, listRows, rowKey, show } from "@/modules/alpha";

export async function generateMetadata({ params }: { params: Promise<{ model: string }> }) {
  return { title: (await params).model };
}

const MAX_COLS = 7;

export default async function TableRows({ params, searchParams }: { params: Promise<{ model: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireStaff("system.alpha");
  const { model } = await params;
  const m = MODELS.find((x) => x.name === model);
  if (!m) notFound();
  const sp = await searchParams;
  const { rows, total, page, pages } = await listRows(m, { q: sp.q, page: Number(sp.page) || 1 });
  const cols = [...m.pk, ...m.fields.map((f) => f.name).filter((n) => !m.pk.includes(n))].slice(0, MAX_COLS);
  const link = (n: number) => `/admin/alpha/data/${m.name}?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(n) })}`;
  return (
    <>
      <PageHeader title={m.name} sub={<><Link href="/admin/alpha/data">Data explorer</Link> · {total.toLocaleString()} row{total === 1 ? "" : "s"}{sp.q ? " found" : ""}</>}
        actions={!m.readOnly && <Link className="btn primary" href={`/admin/alpha/data/${m.name}/row?new=1`}><Icon name="plus" size="sm" /> Add row</Link>} />
      <div className="stack">
        {m.readOnly && <Note icon="shield">{m.readOnly}</Note>}
        <div className="row" style={{ maxWidth: 460 }}><SearchParamInput param="q" id="al-q" placeholder="Search text columns" /></div>
        <Card pad={false}>
          {rows.length === 0 ? <Empty title="No rows" /> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}<th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const k = rowKey(m, r);
                  return (
                    <tr key={k}>
                      {cols.map((c) => <td key={c} data-label={c} className="small" style={{ maxWidth: 240, overflowWrap: "anywhere" }}>{show(c, r[c]).slice(0, 80)}</td>)}
                      <td data-label="" className="r"><Link className="btn sm" href={`/admin/alpha/data/${m.name}/row?k=${encodeURIComponent(k)}`}>Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </Card>
        {pages > 1 && <div className="row between"><span className="small muted">Page {page} of {pages}</span><div className="pager">{page > 1 && <Link className="btn sm" href={link(page - 1)}>Previous</Link>}{page < pages && <Link className="btn sm" href={link(page + 1)}>Next</Link>}</div></div>}
      </div>
    </>
  );
}
