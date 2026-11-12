"use client";

import { useState } from "react";
import { Icon } from "@/shared/ui/icon";

export type RowColumn = { key: string; label: string; type: "text" | "number" | "check"; width?: string; suffix?: string; hint?: string };
type Value = string | number | boolean;
type Row = { id: string; values: Record<string, Value> };

/**
 * An editable list for the rates form (salary components, penalty categories, bonus types): every box can be
 * changed, rows can be added, and new rows can be removed before saving. Saved rows are switched off, not deleted,
 * so past payslips keep their names. Each field is posted as `${name}.${key}` (one value per row, in order).
 */
export function EditableRows({ name, columns, rows: initial, addLabel, total, disabled }: {
  name: string; columns: RowColumn[]; rows: Row[]; addLabel: string;
  /** Show a live total of this number column, and the figure it must reach */
  total?: { key: string; mustBe: number; label: string };
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<(Row & { isNew?: boolean })[]>(initial);
  const set = (i: number, key: string, v: Value) => setRows((r) => r.map((x, j) => (j === i ? { ...x, values: { ...x.values, [key]: v } } : x)));
  const sum = total ? rows.filter((r) => r.values.active !== false).reduce((a, r) => a + (Number(r.values[total.key]) || 0), 0) : 0;
  const rounded = Math.round(sum * 100) / 100;
  return (
    <div className="stack tight">
      <div className="tbl-wrap"><table className="t edit-rows">
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.type === "check" ? "c" : undefined} title={c.hint}>{c.label}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.values.active === false ? "off" : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.type === "check" ? "c" : undefined}>
                  {c.type === "check" ? (
                    <>
                      <input type="checkbox" checked={!!r.values[c.key]} onChange={(e) => set(i, c.key, e.target.checked)} aria-label={`${c.label} for row ${i + 1}`} disabled={disabled} />
                      <input type="hidden" name={`${name}.${c.key}`} value={r.values[c.key] ? "1" : "0"} />
                    </>
                  ) : (
                    <span className="row tight nowrap">
                      <input className={`input sm ${c.width ?? ""}`} name={`${name}.${c.key}`} value={String(r.values[c.key] ?? "")} inputMode={c.type === "number" ? "decimal" : undefined}
                        onChange={(e) => set(i, c.key, e.target.value)} aria-label={`${c.label} for row ${i + 1}`} disabled={disabled} />
                      {c.suffix && <span className="small muted">{c.suffix}</span>}
                    </span>
                  )}
                </td>
              ))}
              <td className="r"><input type="hidden" name={`${name}.id`} value={r.id} />{r.isNew && !disabled && <button type="button" className="icon-btn" aria-label="Remove this new row" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Icon name="x" size="sm" /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="row between">
        {!disabled && <button type="button" className="btn sm" onClick={() => setRows((x) => [...x, { id: `new-${Date.now()}-${x.length}`, isNew: true, values: Object.fromEntries(columns.map((c) => [c.key, c.type === "check" ? c.key === "active" : c.type === "number" ? 0 : ""])) }])}>
          <Icon name="plus" size="sm" /> {addLabel}
        </button>}
        {total && <span className={`small ${rounded === total.mustBe ? "c-ok" : "c-err"}`}><b>{total.label}: {rounded}%</b>{rounded === total.mustBe ? "" : ` (must be ${total.mustBe}%)`}</span>}
      </div>
    </div>
  );
}
