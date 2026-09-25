import { redirect } from "next/navigation";
import { naira } from "@/shared/lib/format";
import { Bars, Card, Kpi, Note, PageHeader } from "@/shared/ui/primitives";
import { STAFF_SECTIONS } from "@/modules/access-control";
import { requireStaff } from "@/modules/auth";
import { adminOverview } from "@/modules/reports";

export const metadata = { title: "Back office" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const v = await requireStaff();
  const { denied } = await searchParams;
  if (!v.isAdmin) {
    const first = STAFF_SECTIONS.find((s) => v.permissions.has(s.perm));
    if (first) redirect(first.items[0].href + (denied ? "?denied=1" : ""));
    return <Note tone="warn">Your account has no role yet. Ask the Super Admin to give you one.</Note>;
  }
  const o = await adminOverview();
  return (
    <>
      {denied && <div style={{ marginBottom: 16 }}><Note tone="warn">You don&apos;t have permission for that page.</Note></div>}
      <PageHeader title="Overview" sub="Switch workspace at the top to work as the Accountant, Registrar or Secretary." />
      <div className="stack loose">
        <div className="grid g4">
          <Kpi label="Paid sales (all time)" value={naira(o.sales)} />
          <Kpi label="Orders" value={o.orders} />
          <Kpi label="Families" value={o.families} />
          <Kpi label="Active sessions" value={o.sessions} />
        </div>
        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card className="stack"><h3>Orders by status</h3><Bars rows={o.byStatus.map(([l, n]) => [l, n, String(n)])} /></Card>
          <Card className="stack"><h3>Paid sales by class</h3><Bars color="var(--ink)" rows={o.byClass.map(([l, n]) => [l, n, naira(n)])} /></Card>
        </div>
      </div>
    </>
  );
}
