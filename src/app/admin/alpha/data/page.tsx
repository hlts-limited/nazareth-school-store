import Link from "next/link";
import { Card, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { tableCounts } from "@/modules/alpha";

export const metadata = { title: "Data explorer" };

export default async function DataExplorer() {
  await requireStaff("system.alpha");
  const tables = await tableCounts();
  return (
    <>
      <PageHeader title="Data explorer" sub="Every table in the database. Open one to search, edit, add or delete rows. Each change is recorded in the audit log." />
      <Card pad={false}>
        <div className="tbl-wrap"><table className="t rt">
          <thead><tr><th>Table</th><th className="r">Rows</th><th>Access</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.name}>
                <td data-label="Table"><Link href={`/admin/alpha/data/${t.name}`}><b>{t.name}</b></Link></td>
                <td data-label="Rows" className="r tnum">{t.count.toLocaleString()}</td>
                <td data-label="Access" className="small muted">{t.readOnly ? "Read-only" : "Read and edit"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </>
  );
}
