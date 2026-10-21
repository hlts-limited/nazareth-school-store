import QRCode from "qrcode";
import { db } from "@/shared/lib/db";
import { SCHOOL } from "@/shared/config/school";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import {
  addHolidayAction, attendanceSettings, BRANCHES, currentGateCode, KioskLink, lagosDate, newKioskLinkAction, PrintButton, removeHolidayAction, retirePrintedCodeAction,
  saveAttendanceSettingsAction, UseMyLocation,
} from "@/modules/attendance";

export const metadata = { title: "Attendance settings" };

const DAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];

export default async function AttendanceSettingsPage() {
  await requireStaff("attendance.manage");
  const s = await attendanceSettings();
  const year = lagosDate().slice(0, 4);
  const holidays = await db.holiday.findMany({ where: { date: { gte: new Date(`${Number(year) - 1}-09-01T00:00:00Z`) } }, orderBy: { date: "asc" } });
  const printed = s.qrMode === "static" ? await QRCode.toDataURL((await currentGateCode()).code, { margin: 1, width: 600 }) : null;
  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title="Attendance settings" sub="These apply to every clock-in. The open questions for the school (cutoff, location, photo spot) are set here." />
      <div className="stack">
        <ActionForm action={saveAttendanceSettingsAction} className="card stack">
          <h3>Clock-in rules</h3>
          <div className="grid g3">
            <div className="field"><label htmlFor="as-cut">Late after</label><input className="input" id="as-cut" type="time" name="lateCutoff" defaultValue={s.lateCutoff} /><FieldError name="lateCutoff" /></div>
            <div className="field"><label htmlFor="as-qr">Gate code</label>
              <select className="input" id="as-qr" name="qrMode" defaultValue={s.qrMode}>
                <option value="rotating">Changing code on a gate screen (recommended)</option>
                <option value="static">One printed code</option>
              </select>
            </div>
            <div className="field"><label htmlFor="as-spot">The photo must show</label><input className="input" id="as-spot" name="photoSpot" defaultValue={s.photoSpot} /><FieldError name="photoSpot" /></div>
          </div>
          <label className="check small"><input type="checkbox" name="photoRequired" defaultChecked={s.photoRequired} /> A live photo is required at every clock-in and clock-out</label>
          <div className="field">
            <span className="lbl">School days</span>
            <div className="row tight">{DAYS.map(([n, l]) => <label key={n} className="check small"><input type="checkbox" name="workDays" value={n} defaultChecked={s.workDays.includes(n)} /> {l}</label>)}</div>
            <FieldError name="workDays" />
          </div>
          <div className="divider" />
          <h3>Branch locations</h3>
          <p className="small muted">Each member of staff clocks in at the branch they&apos;re deployed to (set on their staff record), within the allowed distance of its gate. Leave all three empty to not check location.</p>
          {!s.branches.length && s.gps && <p className="small">Until the branches are filled in, the one location saved earlier is used ({s.gps.lat}, {s.gps.lng}).</p>}
          {BRANCHES.map((b) => {
            const cur = s.branches.find((x) => x.id === b.id);
            return (
              <div key={b.id} className="branch-loc">
                <b>{b.name}</b>
                <div className="grid g3">
                  <div className="field"><label htmlFor={`lat-${b.id}`}>Latitude</label><input className="input mono" id={`lat-${b.id}`} name={`lat-${b.id}`} defaultValue={cur?.lat ?? ""} placeholder="6.4650" /><FieldError name={`lat-${b.id}`} /></div>
                  <div className="field"><label htmlFor={`lng-${b.id}`}>Longitude</label><input className="input mono" id={`lng-${b.id}`} name={`lng-${b.id}`} defaultValue={cur?.lng ?? ""} placeholder="3.2830" /></div>
                  <div className="field"><label htmlFor={`radius-${b.id}`}>Allowed distance (metres)</label><input className="input" id={`radius-${b.id}`} name={`radius-${b.id}`} inputMode="numeric" defaultValue={cur?.radiusM ?? 150} /></div>
                </div>
              </div>
            );
          })}
          <UseMyLocation />
          <div><SubmitButton icon="check">Save settings</SubmitButton></div>
        </ActionForm>

        <section className="card stack">
          <h3>Gate code</h3>
          {s.qrMode === "rotating" ? (
            <>
              <p className="small">Put an old tablet or phone at the gate, open the gate screen link on it and leave it on, plugged in. The code on it changes every 30 seconds, so a photo of it is useless a moment later.</p>
              <KioskLink action={newKioskLinkAction} />
              {!s.kioskTokenHash && <Note tone="warn" icon="alert">No gate screen is set up yet: staff can&apos;t clock in until one is.</Note>}
            </>
          ) : (
            <>
              <Note tone="warn" icon="alert">A printed code can be photographed and used from home. Keep the location check and the photo on, and look over the day&apos;s photos.</Note>
              <div className="print-qr stack tight">
                <b>{SCHOOL.name}: staff clock-in</b>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {printed && <img src={printed} alt="Printed gate code" width={260} height={260} />}
                <span className="small">Open Clock in / out on your phone and scan this code.</span>
              </div>
              <div><PrintButton /></div>
            </>
          )}
          <ActionForm action={retirePrintedCodeAction}>
            <SubmitButton size="sm" variant="ghost" confirmText="Stop every current gate code and gate screen link? You'll need to print a new code or open a new gate link.">Replace all codes</SubmitButton>
          </ActionForm>
        </section>

        <section className="card stack">
          <h3>Public holidays and school closures</h3>
          <p className="small muted">On these days nobody is marked absent.</p>
          <ActionForm action={addHolidayAction} className="row tight" resetOnSuccess>
            <input className="input" type="date" name="day" aria-label="Date" style={{ maxWidth: 170 }} />
            <input className="input" name="name" placeholder="e.g. Independence Day" aria-label="Holiday name" style={{ maxWidth: 260 }} />
            <SubmitButton size="sm" icon="plus">Add</SubmitButton>
            <FieldError name="day" /><FieldError name="name" />
          </ActionForm>
          {!holidays.length ? <p className="small muted">None added.</p> : (
            <ul className="plain-list">
              {holidays.map((h) => (
                <li key={h.id} className="row between">
                  <span><b>{h.name}</b> <span className="small muted">· {fmtDate(h.date)}</span></span>
                  <ActionForm action={removeHolidayAction}><input type="hidden" name="id" value={h.id} /><SubmitButton size="sm" variant="ghost" icon="trash">Remove</SubmitButton></ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
