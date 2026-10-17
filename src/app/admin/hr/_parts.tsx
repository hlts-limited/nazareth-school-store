import { fmtDate } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Note, Pill } from "@/shared/ui/primitives";
import { paystackReady, listBanks } from "@/modules/payments";
import {
  BankForm, bankInClear, deleteStaffDocAction, requiredDocKinds, reviewBankAction, reviewStaffDocAction, setBankAction, STAFF_DOC_KINDS, StaffDocUpload,
  uploadStaffDocAction,
} from "@/modules/hr";

type Doc = { id: string; kind: string; fileKey: string; fileName: string; mimeType: string; status: string; note: string | null; expiresAt: Date | null; uploadedAt: Date };
type Emp = {
  id: string; userId: string; isTeacher: boolean; documents: Doc[];
  bankStatus: string; bankName: string | null; accountLast4: string | null; accountNumberEnc: string | null; accountNameEnc: string | null; accountNameChecked: boolean; bankNote: string | null;
  onboarding: { steps: { id: string; label: string; done: boolean }[]; complete: boolean };
};

export function Checklist({ e }: { e: Emp }) {
  return (
    <section className="card stack">
      <div className="row between"><h3>Onboarding</h3>{e.onboarding.complete ? <Pill tone="ok">Complete</Pill> : <Pill tone="warn">Incomplete</Pill>}</div>
      <ul className="plain-list">
        {e.onboarding.steps.map((s) => (
          <li key={s.id} className="row tight nowrap">
            <span style={{ color: s.done ? "var(--ok)" : "var(--muted)" }}><Icon name={s.done ? "check" : "clock"} size="sm" /></span>
            <span className={s.done ? "" : "muted"}>{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DOC_TONE: Record<string, ["ok" | "warn" | "err", string]> = { APPROVED: ["ok", "Approved"], PENDING: ["warn", "To review"], REJECTED: ["err", "Rejected"] };

/** The staff member's documents. `as`: who is looking: HR (review, upload for them) or the staff member themselves. */
export function Documents({ e, as, viewerId }: { e: Emp; as: "hr" | "self" | "view"; viewerId: string }) {
  const required = requiredDocKinds(e.isTeacher);
  const own = e.userId === viewerId;
  return (
    <section className="card stack">
      <h3>Documents</h3>
      <ul className="doc-list">
        {STAFF_DOC_KINDS.filter((k) => required.includes(k.kind) || e.documents.some((d) => d.kind === k.kind) || k.required === false).map((k) => {
          const docs = e.documents.filter((d) => d.kind === k.kind);
          const isReq = required.includes(k.kind);
          return (
            <li key={k.kind} className="stack tight" style={{ alignItems: "stretch" }}>
              <div className="row between">
                <b>{k.label}{isReq ? "" : <span className="muted small"> (optional)</span>}</b>
                {!docs.length && <span className="small muted">{isReq ? "Not uploaded" : "—"}</span>}
              </div>
              {docs.map((d) => (
                <div key={d.id} className="row between" style={{ gap: 8 }}>
                  <span className="row tight nowrap">
                    <Icon name="file" size="sm" />
                    {as === "view" ? <span>{d.fileName}</span> : <a href={`/api/files/${d.fileKey}`} target="_blank" rel="noreferrer">{d.fileName}</a>}
                    <span className="small muted">· {fmtDate(d.uploadedAt)}{d.expiresAt ? ` · expires ${fmtDate(d.expiresAt)}` : ""}</span>
                  </span>
                  <span className="row tight">
                    <Pill tone={DOC_TONE[d.status][0]}>{DOC_TONE[d.status][1]}</Pill>
                    {as === "hr" && d.status === "PENDING" && !own && (
                      <>
                        <ActionForm action={reviewStaffDocAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton size="sm" variant="success" icon="check">Approve</SubmitButton></ActionForm>
                        <ActionForm action={reviewStaffDocAction} className="row tight">
                          <input type="hidden" name="id" value={d.id} /><input type="hidden" name="decision" value="reject" />
                          <input className="input sm" name="note" placeholder="What's wrong?" aria-label="Reason for rejecting" style={{ width: 150 }} />
                          <SubmitButton size="sm" variant="ghost">Reject</SubmitButton>
                        </ActionForm>
                      </>
                    )}
                    {(as === "hr" || (as === "self" && d.status !== "APPROVED")) && (
                      <ActionForm action={deleteStaffDocAction}><input type="hidden" name="id" value={d.id} /><SubmitButton size="sm" variant="ghost" icon="trash" confirmText="Remove this document?">Remove</SubmitButton></ActionForm>
                    )}
                  </span>
                  {d.status === "REJECTED" && d.note && <span className="small" style={{ color: "var(--err)", flexBasis: "100%" }}>Not accepted: {d.note}</span>}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {as !== "view" && (
        <div className="stack tight" style={{ borderTop: "1px solid var(--line-2)", paddingTop: 12 }}>
          <b className="small">{as === "self" ? "Upload a document" : "Upload for them"}</b>
          <StaffDocUpload action={uploadStaffDocAction} employeeId={e.id} hr={as === "hr"} />
        </div>
      )}
    </section>
  );
}

const BANK_TONE: Record<string, ["ok" | "warn" | "err" | "plain", string]> = {
  NONE: ["plain", "Not entered"], PENDING: ["warn", "Waiting for the Bursar"], VERIFIED: ["ok", "Verified"], REJECTED: ["err", "Rejected"],
};

/** Bank details. The Bursar sees the full account number to check it; others see the last 4 digits. */
export async function Bank({ e, canEdit, canApprove, viewerId }: { e: Emp; canEdit: boolean; canApprove: boolean; viewerId: string }) {
  const clear = e.accountNameEnc ? bankInClear(e) : null;
  const banks = canEdit ? await listBanks() : [];
  return (
    <section className="card stack">
      <div className="row between"><h3>Bank details</h3><Pill tone={BANK_TONE[e.bankStatus][0]}>{BANK_TONE[e.bankStatus][1]}</Pill></div>
      {e.bankName ? (
        <dl className="facts">
          <div><dt>Bank</dt><dd>{e.bankName}</dd></div>
          <div><dt>Account number</dt><dd className="mono">{canApprove && clear?.accountNumber ? clear.accountNumber : `•••••• ${e.accountLast4}`}</dd></div>
          <div><dt>Account name</dt><dd>{clear?.accountName}{e.accountNameChecked ? <span className="small muted"> (checked with Paystack)</span> : <span className="small muted"> (typed, not checked)</span>}</dd></div>
        </dl>
      ) : <p className="small muted">No bank details yet. Salaries can only be paid once they are entered and verified.</p>}
      {e.bankStatus === "REJECTED" && e.bankNote && <Note tone="err" icon="alert">Not accepted: {e.bankNote}</Note>}
      {canApprove && e.bankStatus === "PENDING" && e.userId !== viewerId && (
        <div className="row tight">
          <ActionForm action={reviewBankAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton size="sm" variant="success" icon="check">Verify for payment</SubmitButton></ActionForm>
          <ActionForm action={reviewBankAction} className="row tight">
            <input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="reject" />
            <input className="input sm" name="note" placeholder="What's wrong?" aria-label="Reason for rejecting" style={{ width: 160 }} />
            <SubmitButton size="sm" variant="ghost">Reject</SubmitButton>
            <FieldError name="note" />
          </ActionForm>
        </div>
      )}
      {canEdit && (
        <details className="fold" open={e.bankStatus === "NONE" || e.bankStatus === "REJECTED"}>
          <summary>{e.bankName ? "Change bank details" : "Enter bank details"}</summary>
          <p className="small muted">New details go back to the Bursar to verify before the next payment.</p>
          <BankForm action={setBankAction} employeeId={e.id} banks={banks} canCheck={paystackReady()} />
        </details>
      )}
    </section>
  );
}
