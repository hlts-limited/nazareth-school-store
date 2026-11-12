"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";

type Action = (p: ActionResult, f: FormData) => Promise<ActionResult>;
type Staff = { id: string; name: string };

/**
 * Penalties panel: a category from the school's list fills in its default amount, which can still be changed.
 * "Waiver" reduces someone's penalties for the month instead.
 */
export function PenaltyEntry({ action, staff, period, categories }: { action: Action; staff: Staff[]; period: string; categories: { name: string; defaultNaira: number }[] }) {
  const [kind, setKind] = useState<"penalty" | "waiver">("penalty");
  const [amount, setAmount] = useState(String(categories[0]?.defaultNaira || ""));
  return (
    <ActionForm action={action} className="card stack" resetOnSuccess>
      <h3>Penalties</h3>
      <input type="hidden" name="period" value={period} />
      <div className="grid g4">
        <div className="field"><label htmlFor="pe-e">Staff</label><StaffSelect id="pe-e" staff={staff} /><FieldError name="employeeId" /></div>
        <div className="field"><label htmlFor="pe-k">Type</label>
          <select className="input" id="pe-k" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "penalty" | "waiver")}><option value="penalty">Penalty</option><option value="waiver">Waiver (reduces penalties)</option></select>
        </div>
        {kind === "penalty" && (
          <div className="field"><label htmlFor="pe-c">Category</label>
            <select className="input" id="pe-c" name="category" defaultValue={categories[0]?.name} onChange={(e) => { const c = categories.find((x) => x.name === e.target.value); if (c?.defaultNaira) setAmount(String(c.defaultNaira)); }}>
              {categories.map((c) => <option key={c.name} value={c.name}>{c.name}{c.defaultNaira ? ` (₦${c.defaultNaira.toLocaleString("en-NG")})` : ""}</option>)}
            </select><FieldError name="category" />
          </div>
        )}
        <div className="field"><label htmlFor="pe-a">Amount (₦)</label><input className="input" id="pe-a" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /><FieldError name="amount" /></div>
      </div>
      <div className="field"><label htmlFor="pe-r">Reason</label><input className="input" id="pe-r" name="reason" placeholder={kind === "penalty" ? "e.g. Lesson notes not submitted, week 3" : "e.g. Late because of a school errand"} /><FieldError name="reason" /></div>
      <div><SubmitButton size="sm" icon="plus">Add {kind}</SubmitButton></div>
    </ActionForm>
  );
}

/** Bonuses panel: added after tax and penalties, so not taxed. A reason is required. */
export function BonusEntry({ action, staff, period, types }: { action: Action; staff: Staff[]; period: string; types: string[] }) {
  return (
    <ActionForm action={action} className="card stack" resetOnSuccess>
      <h3>Bonuses</h3>
      <p className="small muted">Added to pay after tax and penalties: not taxed, and penalties can&apos;t take them.</p>
      <input type="hidden" name="period" value={period} /><input type="hidden" name="kind" value="bonus" />
      <div className="grid g3">
        <div className="field"><label htmlFor="bo-e">Staff</label><StaffSelect id="bo-e" staff={staff} /><FieldError name="employeeId" /></div>
        <div className="field"><label htmlFor="bo-t">Bonus type</label><select className="input" id="bo-t" name="category" defaultValue={types[0]}>{types.map((t) => <option key={t}>{t}</option>)}</select><FieldError name="category" /></div>
        <div className="field"><label htmlFor="bo-a">Amount (₦)</label><input className="input" id="bo-a" name="amount" inputMode="decimal" /><FieldError name="amount" /></div>
      </div>
      <div className="field"><label htmlFor="bo-r">Reason</label><input className="input" id="bo-r" name="reason" placeholder="e.g. Best class results, second term" /><FieldError name="reason" /></div>
      <div><SubmitButton size="sm" icon="plus">Add bonus</SubmitButton></div>
    </ActionForm>
  );
}

function StaffSelect({ id, staff }: { id: string; staff: Staff[] }) {
  return (
    <select className="input" id={id} name="employeeId" defaultValue="">
      <option value="" disabled>Choose…</option>
      {staff.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
}
