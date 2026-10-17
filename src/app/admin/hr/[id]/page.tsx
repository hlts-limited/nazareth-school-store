import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/shared/lib/db";
import { env } from "@/shared/config/env";
import { fmtDate, naira } from "@/shared/lib/format";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { roleName } from "@/modules/access-control";
import { requireStaff } from "@/modules/auth";
import { employeeDetail, resendStaffInviteAction, sectionName, setEmployeeStatusAction, staffInviteText, updateEmployeeAction, whatsAppTo } from "@/modules/hr";
import { RecordFields } from "../_fields";
import { Bank, Checklist, Documents } from "../_parts";

export const metadata = { title: "Staff record" };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function StaffRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireStaff("hr.view.section");
  const e = await employeeDetail((await params).id);
  if (!e) notFound();
  if (!v.permissions.has("hr.view")) {
    const mine = await db.employee.findUnique({ where: { userId: v.user.id }, select: { section: true } });
    if (mine?.section !== e.section) notFound();
  }
  const canManage = v.permissions.has("hr.manage");
  const salary = v.permissions.has("hr.salary");
  const u = e.user;
  const invite = u.status === "INVITED" && u.inviteToken && u.inviteExpiresAt && u.inviteExpiresAt > new Date() ? u.inviteToken : null;
  const wa = invite ? whatsAppTo(e.phone, staffInviteText(u.firstName, invite)) : null;

  return (
    <div style={{ maxWidth: 1080 }}>
      <PageHeader
        title={<span className="row tight">{u.firstName} {u.lastName} {e.status === "INACTIVE" ? <Pill tone="err">Left</Pill> : e.onboarding.complete ? <Pill tone="ok">Complete</Pill> : <Pill tone="warn">Incomplete</Pill>}</span>}
        sub={<><span className="mono">{e.staffCode}</span> · {e.position} · {sectionName(e.section)}</>}
        actions={<Link className="btn" href="/admin/hr"><Icon name="back" size="sm" />All staff</Link>}
      />
      <div className="detail-grid">
        <div className="stack">
          {canManage && u.status === "INVITED" && (
            <div className="note warn"><Icon name="alert" /><div className="stack tight grow">
              <span><b>{u.firstName} hasn&apos;t set up their account yet.</b> Send them their set-up link on WhatsApp.</span>
              <div className="row tight">
                {wa && <a className="btn sm primary" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="chat" size="sm" />Send on WhatsApp</a>}
                {invite && <CopyButton text={`${env().APP_URL}/invite/${invite}`} label="Copy link" done="Set-up link copied." />}
                <ActionForm action={resendStaffInviteAction}><input type="hidden" name="id" value={e.id} /><SubmitButton size="sm" variant="ghost">{invite ? "New link" : "Create link"}</SubmitButton></ActionForm>
              </div>
              {!e.phone && <span className="small">Add their phone number below to send it on WhatsApp.</span>}
            </div></div>
          )}

          {canManage ? (
            <ActionForm action={updateEmployeeAction} className="stack">
              <input type="hidden" name="id" value={e.id} />
              <RecordFields salary={salary} email={false} v={{
                firstName: u.firstName, lastName: u.lastName, phone: e.phone, gender: e.gender, dateOfBirth: day(e.dateOfBirth), section: e.section, position: e.position,
                isTeacher: e.isTeacher, hireDate: day(e.hireDate), employmentType: e.employmentType, monthlyGross: e.monthlyGrossKobo / 100,
                tin: e.tin, pfaName: e.pfaName, rsaPin: e.rsaPin, nhfNumber: e.nhfNumber, nhisNumber: e.nhisNumber, annualRent: Number(e.annualRentKobo) / 100,
              }} />
              <div className="row"><SubmitButton icon="check">Save record</SubmitButton></div>
            </ActionForm>
          ) : (
            <section className="card stack">
              <h3>Record</h3>
              <dl className="facts">
                <div><dt>Phone</dt><dd>{e.phone ?? "—"}</dd></div>
                <div><dt>Hire date</dt><dd>{fmtDate(e.hireDate)}</dd></div>
                <div><dt>Employment</dt><dd>{e.employmentType === "FULL_TIME" ? "Full-time" : "Part-time"}</dd></div>
                {salary && <div><dt>Monthly gross</dt><dd>{naira(e.monthlyGrossKobo / 100)}</dd></div>}
              </dl>
            </section>
          )}

          <Documents e={e} as={canManage ? "hr" : "view"} viewerId={v.user.id} />
        </div>

        <aside className="stack">
          <Checklist e={e} />
          {(salary || v.permissions.has("hr.bank.approve")) && <Bank e={e} canEdit={canManage} canApprove={v.permissions.has("hr.bank.approve")} viewerId={v.user.id} />}
          <section className="card stack">
            <h3>Account</h3>
            <dl className="facts small">
              <div><dt>Sign-in email</dt><dd>{u.email}</dd></div>
              <div><dt>Status</dt><dd>{u.status === "ACTIVE" ? "Active" : u.status === "INVITED" ? "Invited" : "Disabled"}</dd></div>
              <div><dt>Roles</dt><dd>{u.roles.map((r) => roleName(r.roleId)).join(", ")}</dd></div>
              <div><dt>Registered</dt><dd>{fmtDate(e.createdAt)}</dd></div>
            </dl>
            {canManage && e.userId !== v.user.id && (
              <ActionForm action={setEmployeeStatusAction}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value={e.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                <SubmitButton size="sm" variant={e.status === "ACTIVE" ? "ghost" : "default"} confirmText={e.status === "ACTIVE" ? `Mark ${u.firstName} as having left? They can no longer sign in; their record and pay history are kept.` : undefined}>
                  {e.status === "ACTIVE" ? "Mark as left" : "Reactivate"}
                </SubmitButton>
              </ActionForm>
            )}
          </section>
          {e.status === "INACTIVE" && <Note tone="warn">This person has left. They are not included in payroll.</Note>}
        </aside>
      </div>
    </div>
  );
}
