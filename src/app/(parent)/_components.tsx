"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton, useToast } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Size picker + "Add for <child>" button on a product card */
export function AddToCart({ action, pupilId, childName, variants, inCart, readOnly, pile = false }: {
  action: Action; pupilId: string; childName: string; inCart: number; readOnly: boolean; pile?: boolean;
  variants: { id: string; label: string; available: number }[];
}) {
  // A pile is bought once per child and is never blocked by stock (missing books follow later)
  if (pile) {
    return (
      <ActionForm action={action} className="foot">
        <input type="hidden" name="pupilId" value={pupilId} />
        <input type="hidden" name="variantId" value={variants[0]?.id ?? ""} />
        {inCart > 0
          ? <span className="in-cart"><Icon name="check" size="sm" /> Pile in cart for {childName}</span>
          : <SubmitButton size="sm" block variant="primary" icon="plus" disabled={readOnly}>Add pile for {childName}</SubmitButton>}
      </ActionForm>
    );
  }
  const sized = variants.length > 1 || (variants[0] && variants[0].label !== "Standard");
  const totalAvail = variants.reduce((a, v) => a + v.available, 0);
  const out = totalAvail <= 0;
  return (
    <ActionForm action={action} className="foot">
      <input type="hidden" name="pupilId" value={pupilId} />
      {sized ? (
        <select className="input sm" name="variantId" aria-label="Size" defaultValue="">
          <option value="" disabled>Choose size</option>
          {variants.map((v) => <option key={v.id} value={v.id} disabled={v.available <= 0}>{v.label}{v.available <= 0 ? " — out of stock" : ""}</option>)}
        </select>
      ) : (
        <input type="hidden" name="variantId" value={variants[0]?.id ?? ""} />
      )}
      {inCart > 0 && <span className="in-cart"><Icon name="check" size="sm" /> {inCart} in cart for {childName}</span>}
      <SubmitButton size="sm" block variant={inCart ? "default" : "primary"} icon="plus" disabled={out || readOnly}>Add for {childName}</SubmitButton>
    </ActionForm>
  );
}

export function QtyControl({ action, id, qty, readOnly, removeOnly = false }: { action: Action; id: string; qty: number; readOnly: boolean; removeOnly?: boolean }) {
  return (
    <div className="row tight nowrap">
      {!removeOnly && <div className="qty">
        <ActionForm action={action} className="inline-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="qty" value={qty - 1} /><button type="submit" aria-label="Decrease" disabled={readOnly}>−</button></ActionForm>
        <span>{qty}</span>
        <ActionForm action={action} className="inline-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="qty" value={qty + 1} /><button type="submit" aria-label="Increase" disabled={readOnly}>+</button></ActionForm>
      </div>}
      <ActionForm action={action} className="inline-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="qty" value={0} /><button type="submit" className="icon-btn" aria-label="Remove" disabled={readOnly}><Icon name="x" size="sm" /></button></ActionForm>
    </div>
  );
}

/** Payment method, wallet use and the totals box on the cart page */
/** Payment box on the cart: the wallet is always used first, then Paystack for the rest */
export function CheckoutBox({ action, subtotal, wallet, autoCancelHours, readOnly, paystack = true }: {
  action: Action; subtotal: number; wallet: number; autoCancelHours: number; readOnly: boolean; paystack?: boolean;
}) {
  const fromWallet = Math.min(wallet, subtotal);
  const toPay = subtotal - fromWallet;
  const n = (v: number) => `₦${Math.round(v).toLocaleString("en-NG")}`;
  return (
    <ActionForm action={action} className="card stack">
      <h3>Payment</h3>
      <input type="hidden" name="method" value="PAYSTACK" />
      <div className="stack tight">
        <div className="sum-row"><span className="muted">Items</span><span>{n(subtotal)}</span></div>
        {fromWallet > 0 && <div className="sum-row"><span className="muted">From your wallet</span><span className="c-ok">−{n(fromWallet)}</span></div>}
        <div className="sum-row total"><span>{toPay === 0 ? "Nothing more to pay" : "To pay on Paystack"}</span><span>{n(toPay)}</span></div>
      </div>
      {fromWallet > 0 && (
        <p className="small muted">Your wallet is used first{wallet > fromWallet ? `; ${n(wallet - fromWallet)} stays in it for next time` : ""}.</p>
      )}
      {toPay > 0 && (
        <div className="pay-opt on">
          <Icon name="card" size="sm" />
          <span><b>Pay online with Paystack</b><br /><span className="small muted">Card, bank app, transfer or USSD. Approved instantly.</span></span>
        </div>
      )}
      {!paystack && toPay > 0 && <p className="small c-err">Online payment isn&apos;t switched on yet. Please try again later.</p>}
      <SubmitButton size="lg" block disabled={readOnly || (!paystack && toPay > 0)}>
        {toPay === 0 ? "Pay from wallet" : `Pay ${n(toPay)} with Paystack`}
      </SubmitButton>
      <p className="tiny muted">Items are reserved for {autoCancelHours} hours while you pay.</p>
    </ActionForm>
  );
}

const BANKS = ["GTBank", "Access Bank", "First Bank", "UBA", "Zenith Bank", "Fidelity Bank", "Union Bank", "Sterling Bank", "Wema Bank", "Stanbic IBTC", "FCMB", "Opay", "Moniepoint", "Kuda", "PalmPay", "Other"];

/** Upload a transfer receipt (photo or PDF) with a preview */
export function UploadReceipt({ action, orderId, due, readOnly, today, label = "Upload transfer receipt" }: { action: Action; orderId: string; due: number; readOnly: boolean; today: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn primary lg" onClick={() => (readOnly ? toast("Read-only while viewing as a parent.", false) : setOpen(true))}><Icon name="upload" size="sm" /> {label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Upload your receipt">
        <ActionForm action={action} className="stack" onDone={(r) => { if (r.ok) setOpen(false); }}>
          <input type="hidden" name="orderId" value={orderId} />
          <label className="drop" htmlFor="rc-file">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              preview.startsWith("data:image") ? <img src={preview} alt="Receipt preview" /> : <><Icon name="file" /><b>{fileName}</b></>
            ) : (<><Icon name="upload" /><b>Choose receipt photo or PDF</b><span className="small muted">JPG, PNG, WebP or PDF, up to 4 MB</span></>)}
          </label>
          <input ref={fileRef} id="rc-file" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hide" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 4 * 1024 * 1024) { toast("That file is over 4 MB. Please choose a smaller photo.", false); e.target.value = ""; return; }
            setFileName(f.name);
            const r = new FileReader(); r.onload = () => setPreview(String(r.result)); r.readAsDataURL(f);
          }} />
          <FieldError name="receipt" />
          <div className="grid g3">
            <div className="field"><label htmlFor="rc-amt">Amount sent (₦)</label><input className="input tnum" id="rc-amt" name="amount" inputMode="numeric" defaultValue={due} /><FieldError name="amount" /></div>
            <div className="field"><label htmlFor="rc-bank">Your bank</label><select className="input" id="rc-bank" name="bankName">{BANKS.map((b) => <option key={b}>{b}</option>)}</select></div>
            <div className="field"><label htmlFor="rc-date">Transfer date</label><input className="input" id="rc-date" name="transferDate" type="date" defaultValue={today} max={today} /></div>
          </div>
          <p className="hint">If you sent more than {`₦${due.toLocaleString("en-NG")}`}, the extra goes to your wallet. If you sent less, you&apos;ll be asked to pay the balance.</p>
          <div className="modal-f" style={{ margin: "0 -20px -18px" }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton>Submit for review</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}

