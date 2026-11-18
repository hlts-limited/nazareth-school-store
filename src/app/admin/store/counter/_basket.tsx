"use client";

import { useMemo, useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Pill } from "@/shared/ui/primitives";

type Action = (p: ActionResult, f: FormData) => Promise<ActionResult>;
type Item = { id: string; name: string; price: number; required: boolean; bought: boolean; pile: boolean; pileNote?: string; variants: { id: string; label: string; available: number }[] };
type Child = { id: string; name: string; regNumber: string; className: string; items: Item[]; more: boolean };
type Pick = { on: boolean; variantId: string; qty: number };

const n = (v: number) => `₦${Math.round(v).toLocaleString("en-NG")}`;
const key = (pupilId: string, itemId: string) => `${pupilId}:${itemId}`;

/**
 * The counter basket: each child's items, with what the booklist still needs ticked to start with.
 * Sizes, quantities and ticks can be changed; prices are the shop's. The parent's wallet credit comes off first.
 */
export function CounterBasket({ action, parentId, kids: children, wallet }: { action: Action; parentId: string; kids: Child[]; wallet: number }) {
  const [picks, setPicks] = useState<Record<string, Pick>>(() => {
    const start: Record<string, Pick> = {};
    for (const c of children) for (const it of c.items) {
      const firstInStock = it.variants.find((v) => v.available > 0) ?? it.variants[0];
      // Booklist items not yet bought start ticked (a single size only; sized items need the size chosen)
      const on = it.required && !it.bought && (it.pile || (it.variants.length === 1 && (firstInStock?.available ?? 0) > 0));
      start[key(c.id, it.id)] = { on, variantId: it.variants.length === 1 ? it.variants[0].id : "", qty: 1 };
    }
    return start;
  });
  const set = (k: string, p: Partial<Pick>) => setPicks((x) => ({ ...x, [k]: { ...x[k], ...p } }));

  const chosen = useMemo(() => children.flatMap((c) => c.items.flatMap((it) => {
    const p = picks[key(c.id, it.id)];
    return p?.on && p.variantId ? [{ pupilId: c.id, variantId: p.variantId, qty: p.qty, price: it.price, name: it.name, child: c.name }] : [];
  })), [children, picks]);
  const needSize = children.some((c) => c.items.some((it) => { const p = picks[key(c.id, it.id)]; return p?.on && !p.variantId; }));
  const total = chosen.reduce((a, e) => a + e.price * e.qty, 0);
  const fromWallet = Math.min(wallet, total);

  return (
    <ActionForm action={action} className="stack">
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="entries" value={JSON.stringify(chosen.map(({ pupilId, variantId, qty }) => ({ pupilId, variantId, qty })))} />
      {children.map((c) => (
        <section key={c.id} className="card pad-0">
          <div className="card-h"><h3>{c.name}</h3><span className="small muted">{c.className} · <span className="mono">{c.regNumber}</span></span></div>
          {c.items.length === 0 ? <p className="pad small muted">No items match.</p> : (
            <div className="tbl-wrap"><table className="t rt counter-t">
              <thead><tr><th /><th>Item</th><th>Size</th><th className="r">Qty</th><th className="r">Price</th></tr></thead>
              <tbody>
                {c.items.map((it) => {
                  const k = key(c.id, it.id), p = picks[k];
                  const v = it.variants.find((x) => x.id === p?.variantId);
                  const out = !it.pile && v ? v.available < (p?.qty ?? 1) : false;
                  return (
                    <tr key={it.id} className={p?.on ? "sel" : undefined}>
                      <td data-label=""><input type="checkbox" checked={!!p?.on} onChange={(e) => set(k, { on: e.target.checked })} aria-label={`Buy ${it.name} for ${c.name}`} /></td>
                      <td data-label="Item">
                        <b>{it.name}</b>{" "}
                        {it.required && <Pill tone="ok" dot={false}>Booklist</Pill>}{" "}
                        {it.bought && <Pill tone="plain" dot={false}>Already bought</Pill>}{" "}
                        {it.pile && <Pill tone="violet" dot={false}>Pile</Pill>}
                        {it.pileNote && <div className="small muted">{it.pileNote}</div>}
                        {out && <div className="small c-err">Only {v?.available} in stock</div>}
                      </td>
                      <td data-label="Size">{it.variants.length > 1 ? (
                        <select className="input sm" value={p?.variantId ?? ""} onChange={(e) => set(k, { variantId: e.target.value, on: true })} aria-label={`Size of ${it.name}`}>
                          <option value="">Choose…</option>
                          {it.variants.map((x) => <option key={x.id} value={x.id} disabled={x.available <= 0}>{x.label}{x.available <= 0 ? " (out)" : ""}</option>)}
                        </select>
                      ) : <span className="muted">—</span>}</td>
                      <td data-label="Qty" className="r">{it.pile ? 1 : <input className="input sm w-70 text-right" type="number" min={1} max={50} value={p?.qty ?? 1} onChange={(e) => set(k, { qty: Math.max(1, Number(e.target.value) || 1) })} aria-label={`How many ${it.name}`} />}</td>
                      <td data-label="Price" className="r tnum">{n(it.price * (p?.qty ?? 1))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
          {c.more && <p className="pad small muted">More items exist for this class: use “Find an item” above.</p>}
        </section>
      ))}
      <section className="card stack counter-sum">
        <div className="sum-row"><span className="muted">{chosen.length} item{chosen.length === 1 ? "" : "s"}</span><span className="tnum">{n(total)}</span></div>
        {fromWallet > 0 && <div className="sum-row"><span className="muted">From the parent&apos;s wallet</span><span className="tnum c-ok">−{n(fromWallet)}</span></div>}
        <div className="sum-row total"><span>To pay on Paystack</span><span className="tnum">{n(total - fromWallet)}</span></div>
        {needSize && <p className="small c-err">Choose a size for every ticked item that has sizes.</p>}
        <SubmitButton size="lg" icon="check" disabled={!chosen.length || needSize} confirmText={`Place this order for ${n(total)}? Stock is held for 72 hours while it's paid.`}>Place order</SubmitButton>
        <p className="tiny muted">After placing it you&apos;ll take the payment on Paystack on this computer: card, bank transfer or USSD from the parent&apos;s phone.</p>
      </section>
    </ActionForm>
  );
}
