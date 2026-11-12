import Link from "next/link";
import { Card, Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { navFor, roleName } from "@/modules/access-control";
import { requireStaff } from "@/modules/auth";
import { myTasks } from "@/modules/reports";

export const metadata = { title: "My tasks" };

/** Everyone's first page: what is waiting for them, then shortcuts to the areas they use. */
export default async function MyTasks({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const v = await requireStaff();
  const { denied } = await searchParams;
  const areas = navFor(v.permissions).filter((s) => s.id !== "today");
  if (!areas.length) return <Note tone="warn">Your account has no role yet. Ask the Super Admin to give you one.</Note>;
  const tasks = await myTasks(v);
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      {denied && <div className="mb-16"><Note tone="warn">You don&apos;t have permission for that page.</Note></div>}
      <PageHeader title={`${greeting}, ${v.user.firstName}`} sub={`${v.roles.map(roleName).join(", ")} · ${tasks.length ? `${tasks.length} thing${tasks.length === 1 ? "" : "s"} waiting for you` : "nothing waiting for you"}`} />
      <div className="stack loose">
        <Card pad={false}>
          {tasks.length === 0 ? <Empty title="All caught up">New work appears here as it comes in.</Empty> : (
            <ul className="task-list">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={t.href} className={`task tone-${t.tone}`}>
                    <span className="task-ic"><Icon name={t.icon} size="sm" /></span>
                    <span className="grow"><b>{t.title}</b>{t.sub && <small>{t.sub}</small>}</span>
                    {t.count !== undefined && <span className="task-n tnum">{t.count.toLocaleString()}</span>}
                    <Icon name="chev" size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <section className="stack">
          <h3>Your areas</h3>
          <div className="area-grid">
            {areas.map((s) => (
              <Link key={s.id} href={s.items[0].href} className="area-card">
                <Icon name={s.items[0].icon} size="sm" />
                <b>{s.label}</b>
                <small>{s.items.slice(0, 3).map((i) => i.label).join(" · ")}</small>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
