import { PageHeader } from "@/shared/ui/primitives";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { getSettings } from "@/modules/settings";
import { saveSchoolSettingsAction } from "@/modules/settings-admin";
import { paystackMock } from "@/modules/payments";
import { Note } from "@/shared/ui/primitives";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaff("settings.manage");
  const s = await getSettings();
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Settings" sub="School details used at checkout, on invoices and in messages." />
      <div className="stack">
        {paystackMock() && <Note tone="warn">Paystack is in simulated mode because PAYSTACK_SECRET_KEY is not set. Add your keys to .env before going live.</Note>}
        <ActionForm action={saveSchoolSettingsAction} className="card stack">
          <h3>Bank account for transfers</h3>
          <div className="grid g3">
            <div className="field"><label htmlFor="st-an">Account name</label><input className="input" id="st-an" name="accountName" defaultValue={s.bank.accountName} /><FieldError name="accountName" /></div>
            <div className="field"><label htmlFor="st-bk">Bank</label><input className="input" id="st-bk" name="bankName" defaultValue={s.bank.bankName} /><FieldError name="bankName" /></div>
            <div className="field"><label htmlFor="st-no">Account number</label><input className="input mono" id="st-no" name="accountNumber" defaultValue={s.bank.accountNumber} maxLength={10} inputMode="numeric" /><FieldError name="accountNumber" /></div>
          </div>
          <div className="divider" />
          <h3>Orders and payments</h3>
          <div className="grid g3">
            <div className="field"><label htmlFor="st-ac">Cancel unpaid orders after</label><select className="input" id="st-ac" name="autoCancelHours" defaultValue={String(s.autoCancelHours)}>{[24, 48, 72, 96].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></div>
            <div className="field"><label htmlFor="st-fee">Paystack fees paid by</label><select className="input" id="st-fee" name="feeBearer" defaultValue={s.feeBearer}><option value="school">School</option><option value="parent">Parent (set this in your Paystack dashboard too)</option></select></div>
            <div className="field"><label htmlFor="st-term">Current term</label><input className="input" id="st-term" name="currentTerm" defaultValue={s.currentTerm} /><FieldError name="currentTerm" /></div>
          </div>
          <div className="row"><SubmitButton>Save settings</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
