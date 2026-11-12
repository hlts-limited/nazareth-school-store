import Link from "next/link";
import { Card, CardHeader, Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { searchEverything } from "@/modules/search";

export const metadata = { title: "Search" };

/** One search across pupils, parents, orders, staff, store items and applications: whatever this person may see. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await requireStaff();
  const q = (await searchParams).q?.trim() ?? "";
  const groups = await searchEverything(q, v.permissions);
  return (
    <>
      <PageHeader title="Search" sub="Type a name, registration number, phone, order number (NZ-…), staff code or item." />
      <div className="stack">
        <div className="search-wide"><SearchParamInput param="q" id="gs-q" placeholder="Search everything you can see" /></div>
        {q.length < 2 ? <Card><Empty title="Start typing">At least two letters or digits.</Empty></Card>
          : groups.length === 0 ? <Card><Empty title="Nothing found">Try a surname, a registration number or an order number.</Empty></Card>
          : groups.map((g) => (
            <Card key={g.id} pad={false}>
              <CardHeader title={`${g.label} (${g.hits.length}${g.hits.length === 8 ? "+" : ""})`} />
              <ul className="hit-list">
                {g.hits.map((h, i) => {
                  const inner = <><span className="grow"><b>{h.title}</b><small>{h.sub}</small></span>{h.tag && <Pill tone="plain">{h.tag}</Pill>}</>;
                  return <li key={i}>{h.href ? <Link className="hit" href={h.href}>{inner}</Link> : <div className="hit">{inner}</div>}</li>;
                })}
              </ul>
            </Card>
          ))}
      </div>
    </>
  );
}
