import { Card, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { SQL_ROW_LIMIT, runSqlAction } from "@/modules/alpha";
import { SqlConsole } from "./_console";

export const metadata = { title: "SQL console" };

export default async function SqlPage() {
  await requireStaff("system.alpha");
  return (
    <>
      <PageHeader title="SQL console" sub="Read-only queries against the live database. Ctrl + Enter runs the query." />
      <div className="stack">
        <Note icon="shield">Queries run in a read-only transaction with a 15-second limit, one statement at a time, and every query is recorded in the audit log. To change data, use the Data explorer. Table names with capitals need double quotes, e.g. &quot;Order&quot;.</Note>
        <Card><SqlConsole action={runSqlAction} limit={SQL_ROW_LIMIT} /></Card>
      </div>
    </>
  );
}
