import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { forceSignOut, listActiveSessions, requireStaff } from "@/modules/auth";
import { getSettings } from "@/modules/settings";
import { saveSessionLimitsAction } from "@/modules/settings-admin";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const me = await requireStaff("sessions.manage");
  const [sessions, settings] = await Promise.all([listActiveSessions(), getSettings()]);
  const L = settings.sessionLimits;
  const rows: [string, string, number, number | string, number, string][] = [
    ["PARENT", "Parent", L.PARENT.idleMinutes, L.PARENT.maxHours, L.PARENT.devices, `or ${L.PARENT.rememberDays} days with “Remember this device”`],
    ["PUPIL", "Pupil", L.PUPIL.idleMinutes, L.PUPIL.maxHours, L.PUPIL.devices, ""],
    ["STAFF", "Secretary, Registrar, Accountant", L.STAFF.idleMinutes, L.STAFF.maxHours, L.STAFF.devices, ""],
    ["ADMIN", "Super Admin", L.ADMIN.idleMinutes, L.ADMIN.maxHours, L.ADMIN.devices, ""],
  ];
  return (
    <>
      <PageHeader title="Sessions" sub="Signed-in devices across the school. Sessions end after the idle timeout or the maximum length." />
      <div className="stack loose">
        <Card pad={false}>
          <CardHeader title="Active sessions" right={<span className="small muted">{sessions.length} devices</span>} />
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>User</th><th>Type</th><th>Device</th><th>Signed in</th><th>Last active</th><th /></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td data-label="User"><b>{s.name}</b></td><td data-label="Type">{s.role}</td><td data-label="Device">{s.device}</td>
                  <td data-label="Signed in">{fmtDateTime(s.createdAt)}</td><td data-label="Last active">{fmtDateTime(s.lastActiveAt)}</td>
                  <td data-label="" className="r">{s.id === me.session.id ? <span className="small muted">This device</span> : <ActionForm action={forceSignOut}><input type="hidden" name="id" value={s.id} /><SubmitButton size="sm" variant="danger">Sign out</SubmitButton></ActionForm>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
        <ActionForm action={saveSessionLimitsAction} className="card pad-0">
          <CardHeader title="Session limits" right={<SubmitButton size="sm">Save limits</SubmitButton>} />
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Account</th><th>Idle timeout (min)</th><th>Max session (hours)</th><th>Devices at once</th></tr></thead>
            <tbody>
              {rows.map(([k, label, idle, max, dev, note]) => (
                <tr key={k}>
                  <td data-label="Account"><b>{label}</b>{note && <div className="tiny muted">{note}</div>}</td>
                  <td data-label="Idle (min)"><input className="input sm tnum" style={{ width: 90 }} name={`${k}.idle`} defaultValue={idle} inputMode="numeric" aria-label={`${label} idle minutes`} /></td>
                  <td data-label="Max (hours)"><input className="input sm tnum" style={{ width: 90 }} name={`${k}.max`} defaultValue={max} inputMode="numeric" aria-label={`${label} max hours`} /></td>
                  <td data-label="Devices"><input className="input sm tnum" style={{ width: 70 }} name={`${k}.devices`} defaultValue={dev} inputMode="numeric" aria-label={`${label} devices`} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="card-b small muted" style={{ borderTop: "1px solid var(--line-2)" }}>A warning appears 2 minutes before an idle timeout. Signing in on one device too many ends the oldest session. Changing a password or role ends all of that person&apos;s sessions. View-as sessions last {L.VIEW_AS.maxMinutes} minutes.</div>
        </ActionForm>
      </div>
    </>
  );
}
