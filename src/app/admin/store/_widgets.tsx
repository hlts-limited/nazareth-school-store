"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton } from "@/shared/ui/client";

/* Store: stock changes, packing ticks and the pick-up code box. */

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
export function StockDialog({ action, item, variants, label = "Stock" }: { action: Action; item: string; variants: { id: string; label: string; onHand: number; reserved: number }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [vid, setVid] = useState(variants[0]?.id ?? "");
  const v = variants.find((x) => x.id === vid) ?? variants[0];
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Stock: ${item}`}>
        <ActionForm action={action} className="stack" onDone={(r) => r.ok && setOpen(false)}>
          {variants.length > 1 ? (
            <div className="field"><label htmlFor="sv">Size</label><select className="input" id="sv" name="variantId" value={vid} onChange={(e) => setVid(e.target.value)}>{variants.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          ) : <input type="hidden" name="variantId" value={vid} />}
          {v && <div className="cmp"><div><div className="small muted">On hand</div><div className="v">{v.onHand}</div></div><div><div className="small muted">Reserved</div><div className="v">{v.reserved}</div></div><div><div className="small muted">Available</div><div className="v">{Math.max(0, v.onHand - v.reserved)}</div></div></div>}
          <div className="grid g2">
            <div className="field"><label htmlFor="st-t">Movement</label><select className="input" id="st-t" name="type"><option value="restock">Restock (delivery received)</option><option value="damaged">Adjustment: damaged / lost</option><option value="found">Adjustment: found in stock-take</option><option value="return">Return from parent</option></select></div>
            <div className="field"><label htmlFor="st-q">Quantity</label><input className="input tnum" id="st-q" name="qty" inputMode="numeric" defaultValue={10} /><FieldError name="qty" /></div>
          </div>
          <div className="field"><label htmlFor="st-r">Reason / supplier reference</label><input className="input" id="st-r" name="reason" placeholder="e.g. Delivery note DN-2231" /></div>
          <div className="row justify-end"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Save movement</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
export function PackCheckbox({ action, lineId, checked, disabled, label }: { action: Action; lineId: string; checked: boolean; disabled: boolean; label: string }) {
  return (
    <ActionForm action={action} className="inline-form">
      <input type="hidden" name="lineId" value={lineId} />
      <label className="check small">
        <input type="checkbox" name="packed" defaultChecked={checked} disabled={disabled} onChange={(e) => e.currentTarget.form?.requestSubmit()} /> {label}
      </label>
    </ActionForm>
  );
}
export function PickupCodeInput({ initial }: { initial: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  return (
    <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); router.push(`/admin/store/pickup?code=${code}`); }}>
      <input className="input mono" id="pk" inputMode="numeric" maxLength={4} autoFocus value={code} placeholder="0000" aria-label="Pick-up code"
        style={{ fontSize: 22, letterSpacing: ".3em", maxWidth: 170 }}
        onChange={(e) => { const c = e.target.value.replace(/\D/g, "").slice(0, 4); setCode(c); if (c.length === 4) router.push(`/admin/store/pickup?code=${c}`); }} />
      <button className="btn primary" type="submit">Find order</button>
    </form>
  );
}

// ---------------- Secretary ----------------
