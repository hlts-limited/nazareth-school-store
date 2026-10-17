import { fmtDate } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { myEmployee, sectionName, updateOwnProfileAction } from "@/modules/hr";
import { Bank, Checklist, Documents } from "../hr/_parts";

export const metadata = { title: "My profile" };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** A staff member's own page: what's still needed, their details, documents and bank details. */
export default async function MyProfilePage() {
  const v = await requireStaff("self.service");
  const e = await myEmployee(v.user.id);
  if (!e) return (
    <>
      <PageHeader title="My profile" />
      <div className="card"><Empty title="No staff record yet">HR hasn&apos;t registered you as a member of staff. Ask the school office.</Empty></div>
    </>
  );
  return (
    <div style={{ maxWidth: 1080 }}>
      <PageHeader title={`${v.user.firstName} ${v.user.lastName}`} sub={<><span className="mono">{e.staffCode}</span> · {e.position} · {sectionName(e.section)} · since {fmtDate(e.hireDate)}</>} />
      <div className="detail-grid">
        <div className="stack">
          {!e.onboarding.complete && <Note tone="warn" icon="alert">Please finish the steps on the right: upload your documents and enter your bank details. HR and the Bursar then check them.</Note>}
          <ActionForm action={updateOwnProfileAction} className="card stack">
            <h3>My details</h3>
            <div className="grid g3">
              <div className="field"><label htmlFor="me-phone">Phone (WhatsApp)</label><input className="input" id="me-phone" name="phone" inputMode="tel" defaultValue={e.phone ?? ""} /><FieldError name="phone" /></div>
              <div className="field"><label htmlFor="me-g">Gender</label><select className="input" id="me-g" name="gender" defaultValue={e.gender ?? ""}><option value="">—</option><option>Female</option><option>Male</option></select></div>
              <div className="field"><label htmlFor="me-dob">Date of birth</label><input className="input" id="me-dob" type="date" name="dateOfBirth" defaultValue={day(e.dateOfBirth)} /></div>
              <div className="field"><label htmlFor="me-tin">Tax ID (TIN)</label><input className="input mono" id="me-tin" name="tin" defaultValue={e.tin ?? ""} /></div>
              <div className="field"><label htmlFor="me-pfa">Pension fund administrator</label><input className="input" id="me-pfa" name="pfaName" defaultValue={e.pfaName ?? ""} /></div>
              <div className="field"><label htmlFor="me-rsa">RSA PIN</label><input className="input mono" id="me-rsa" name="rsaPin" defaultValue={e.rsaPin ?? ""} /></div>
              <div className="field"><label htmlFor="me-nhf">NHF number</label><input className="input mono" id="me-nhf" name="nhfNumber" defaultValue={e.nhfNumber ?? ""} /></div>
              <div className="field"><label htmlFor="me-nhis">NHIS / NHIA number</label><input className="input mono" id="me-nhis" name="nhisNumber" defaultValue={e.nhisNumber ?? ""} /></div>
              <div className="field"><label htmlFor="me-rent">Annual rent paid (₦)</label><input className="input" id="me-rent" name="annualRent" inputMode="decimal" defaultValue={e.annualRentNaira || ""} /><span className="hint">For rent relief on tax, if any.</span></div>
            </div>
            <div><SubmitButton size="sm" icon="check">Save my details</SubmitButton></div>
          </ActionForm>
          <Documents e={e} as="self" viewerId={v.user.id} />
        </div>
        <aside className="stack">
          <Checklist e={e} />
          <Bank e={e} canEdit canApprove={false} viewerId={v.user.id} />
        </aside>
      </div>
    </div>
  );
}
