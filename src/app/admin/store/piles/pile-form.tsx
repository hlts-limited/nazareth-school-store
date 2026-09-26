"use client";

import { useMemo, useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
type Book = { id: string; name: string; sku: string; price: number; available: number; otherPile: string | null };
type Cat = { id: string; name: string; children: { id: string; name: string }[] };

const naira = (v: number) => `₦${Math.round(v).toLocaleString("en-NG")}`;

/** Add / edit a core-textbook pile: details, classes and the books inside it (price = sum of books) */
export function PileForm({ action, cats, classes, books, pile }: {
  action: Action; cats: Cat[]; classes: { id: string; name: string }[]; books: Book[];
  pile?: { id: string; name: string; description: string | null; categoryId: string; isActive: boolean; classIds: string[]; compulsory: boolean; parts: { bookId: string; qty: number }[] };
}) {
  const [picked, setPicked] = useState<Record<string, number>>(() => Object.fromEntries((pile?.parts ?? []).map((p) => [p.bookId, p.qty])));
  const [q, setQ] = useState("");
  const chosenClasses = new Set(pile?.classIds ?? []);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    // Picked books first, then the rest; search filters both
    return books.filter((b) => !t || b.name.toLowerCase().includes(t) || b.sku.toLowerCase().includes(t))
      .sort((a, b) => Number(b.id in picked) - Number(a.id in picked) || a.name.localeCompare(b.name));
  }, [books, q, picked]);
  const total = books.reduce((a, b) => a + (picked[b.id] ? b.price * picked[b.id] : 0), 0);
  const count = Object.keys(picked).length;
  const toggle = (id: string, on: boolean) => setPicked((p) => { const x = { ...p }; if (on) x[id] = x[id] ?? 1; else delete x[id]; return x; });

  return (
    <ActionForm action={action} className="card stack">
      {pile && <input type="hidden" name="id" value={pile.id} />}
      <div className="grid g2">
        <div className="field"><label htmlFor="pl-n">Pile name</label><input className="input" id="pl-n" name="name" defaultValue={pile?.name} placeholder="e.g. Primary 3 core textbooks" /><FieldError name="name" /></div>
        <div className="field"><label htmlFor="pl-c">Category</label>
          <select className="input" id="pl-c" name="categoryId" defaultValue={pile?.categoryId ?? ""}>
            <option value="" disabled>Choose a category</option>
            {cats.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {c.children.map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
              </optgroup>
            ))}
          </select><FieldError name="categoryId" /></div>
      </div>
      <div className="field"><label htmlFor="pl-d">Description (optional)</label><input className="input" id="pl-d" name="description" defaultValue={pile?.description ?? ""} placeholder="Shown to parents under the pile name" /></div>
      <div className="field">
        <span className="lbl">Classes it&apos;s for</span>
        <div className="row tight">
          {classes.map((c) => <label key={c.id} className="chip"><input type="checkbox" name="classIds" value={c.id} defaultChecked={chosenClasses.has(c.id)} style={{ accentColor: "var(--red)" }} /> {c.name}</label>)}
        </div>
        <FieldError name="classIds" />
      </div>
      <label className="check"><input type="checkbox" name="compulsory" defaultChecked={pile ? pile.compulsory : true} /> Required on the booklist for these classes</label>

      <div className="field">
        <div className="row between"><span className="lbl">Books in this pile</span><span className="small"><b>{count}</b> book{count === 1 ? "" : "s"} · <b className="tnum">{naira(total)}</b></span></div>
        <input className="input" type="search" placeholder="Search books by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search books" />
        <div className="tbl-wrap" style={{ maxHeight: 420, overflow: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
          <table className="t">
            <thead><tr><th style={{ width: 44 }} /><th>Book</th><th className="r">Price</th><th className="r">In stock</th><th className="r" style={{ width: 90 }}>Qty</th></tr></thead>
            <tbody>
              {shown.map((b) => {
                const on = b.id in picked;
                return (
                  <tr key={b.id} className={on ? "sel" : ""} style={b.otherPile ? { opacity: 0.5 } : undefined}>
                    <td><input type="checkbox" name="bookId" value={b.id} checked={on} disabled={!!b.otherPile} onChange={(e) => toggle(b.id, e.target.checked)} aria-label={`Include ${b.name}`} style={{ width: 18, height: 18, accentColor: "var(--red)" }} /></td>
                    <td><b>{b.name}</b> <span className="mono tiny muted">{b.sku}</span>{b.otherPile && <div className="tiny muted">Already in &quot;{b.otherPile}&quot;</div>}</td>
                    <td className="r tnum">{naira(b.price)}</td>
                    <td className="r tnum">{b.available}</td>
                    <td className="r">{on && <input className="input sm tnum" name={`qty_${b.id}`} inputMode="numeric" value={picked[b.id]} onChange={(e) => setPicked((p) => ({ ...p, [b.id]: Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, "")) || 1)) }))} aria-label={`Copies of ${b.name}`} style={{ width: 64 }} />}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={5} className="empty">No books match. Add books under <b>Items</b> first (without sizes).</td></tr>}
            </tbody>
          </table>
        </div>
        <span className="hint">Parents only see the pile, never these books on their own. The pile&apos;s price is always the sum of its books. A book can be in only one pile.</span>
        <FieldError name="parts" />
      </div>
      {pile && <label className="check"><input type="checkbox" name="isActive" defaultChecked={pile.isActive} /> Show in the store</label>}
      {!pile && <input type="hidden" name="isActive" value="on" />}
      <div className="row"><SubmitButton>{pile ? "Save pile" : "Add pile"}</SubmitButton></div>
    </ActionForm>
  );
}
