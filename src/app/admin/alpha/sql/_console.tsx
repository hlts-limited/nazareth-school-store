"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, SubmitButton } from "@/shared/ui/client";

type Result = { columns: string[]; rows: string[][]; total: number; ms: number };

const EXAMPLES = [
  `SELECT status, COUNT(*) FROM "Order" GROUP BY status`,
  `SELECT "firstName", "lastName", email, status FROM "User" WHERE type = 'STAFF'`,
  `SELECT number, surname, status FROM "Application" ORDER BY "createdAt" DESC LIMIT 20`,
];

export function SqlConsole({ action, limit }: { action: (s: ActionResult, f: FormData) => Promise<ActionResult>; limit: number }) {
  const [result, setResult] = useState<Result | null>(null);
  const [sql, setSql] = useState("");
  return (
    <div className="stack">
      <ActionForm action={action} className="stack" onDone={(r) => setResult(r.ok ? (r.data as Result) : null)}>
        <textarea className="input" name="sql" rows={6} value={sql} onChange={(e) => setSql(e.target.value)} placeholder={EXAMPLES[0]} aria-label="SQL query" spellCheck={false}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit(); }} />
        <div className="row between">
          <div className="row tight">
            {EXAMPLES.map((x, i) => <button key={i} type="button" className="btn sm" onClick={() => setSql(x)}>Example {i + 1}</button>)}
          </div>
          <SubmitButton icon="search">Run query</SubmitButton>
        </div>
      </ActionForm>
      {result && (
        <div className="stack tight">
          <p className="small muted">{result.total.toLocaleString()} row{result.total === 1 ? "" : "s"} in {result.ms} ms{result.total > limit ? ` · showing the first ${limit}` : ""}</p>
          {result.columns.length > 0 && (
            <div className="tbl-wrap card" style={{ padding: 0 }}><table className="t">
              <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{result.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="small mono" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>{v}</td>)}</tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
