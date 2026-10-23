import { fmtDateTime } from "@/shared/lib/format";
import { branchName } from "@/shared/config/school";
import { Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { blockedAttempts, FLAG_WORDS } from "@/modules/attendance";

export const metadata = { title: "Blocked clock-ins" };
export const dynamic = "force-dynamic";

/** Clock-ins refused because of where the phone was, with the exact attempted location. Super Admin and Alpha only. */
export default async function BlockedClockIns() {
  await requireStaff("settings.manage");
  const rows = await blockedAttempts(300);
  const flagged = rows.filter((r) => r.flags.length).length;
  return (
    <>
      <PageHeader title="Blocked clock-ins" sub="Every clock-in or clock-out refused because of the phone's location, with where the phone was. Kept for 90 days." />
      <div className="stack">
        {flagged > 0 && <Note tone="warn" icon="alert">{flagged} of these {rows.length === 1 ? "has" : "have"} a pattern flag. Check them first.</Note>}
        <section className="card pad-0">
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>When</th><th>Staff</th><th>Why it was blocked</th><th>Where the phone was</th><th>Flags</th></tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={5}><Empty title="No blocked clock-ins">Nobody has tried to clock in away from their branch.</Empty></td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="When">{fmtDateTime(r.createdAt)}<div className="small muted">Clock {r.kind}</div></td>
                  <td data-label="Staff"><b>{r.employee.user.firstName} {r.employee.user.lastName}</b><div className="small muted"><span className="mono">{r.employee.staffCode}</span> · {branchName(r.employee.branch) ?? "branch not set"}</div></td>
                  <td data-label="Why">{r.reason}</td>
                  <td data-label="Where">
                    {r.lat != null && r.lng != null
                      ? <><a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer" className="mono small">{r.lat.toFixed(6)}, {r.lng.toFixed(6)}</a>
                        <div className="small muted">{r.accuracyM != null ? `accurate to about ${Math.round(r.accuracyM)} m` : "accuracy not given"}{r.distanceM != null ? ` · ${r.distanceM.toLocaleString()} m away` : ""}</div></>
                      : <span className="muted">Not shared</span>}
                  </td>
                  <td data-label="Flags">{r.flags.length ? r.flags.map((f) => <span key={f} className="flag" title={FLAG_WORDS[f] ?? f}>{FLAG_WORDS[f] ?? f}</span>) : <span className="muted small">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}
