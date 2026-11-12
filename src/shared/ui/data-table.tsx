"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Empty } from "./primitives";
import { Icon } from "./icon";

export type Column = {
  /** Header text; also the label shown beside each value on phones */
  label: string;
  /** Right-align (numbers, money, buttons) */
  right?: boolean;
  /** Clicking the header sorts by this column (needs a sort value in each row) */
  sortable?: boolean;
};

export type Row = {
  id: string;
  /** One cell per column, already rendered (server components can pass JSX here) */
  cells: ReactNode[];
  /** What each column sorts by (number or text); omit for columns that don't sort */
  sort?: (string | number | null)[];
  /** Words the quick filter looks in (names, codes, numbers) */
  search?: string;
};

/**
 * The back office's one table: sortable headers, an optional quick filter, pages of `pageSize` rows,
 * a friendly empty state, and on phones each row becomes a card with the column names beside the values.
 */
export function DataTable({ columns, rows, empty = "Nothing here yet", emptyText, filter, pageSize = 50, initialSort, toolbar }: {
  columns: Column[];
  rows: Row[];
  empty?: string;
  emptyText?: ReactNode;
  /** Placeholder for the quick filter box; leave out for no filter */
  filter?: string;
  pageSize?: number;
  initialSort?: { col: number; dir: "asc" | "desc" };
  /** Extra controls on the right of the toolbar (e.g. an export button) */
  toolbar?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = needle ? rows.filter((r) => (r.search ?? "").toLowerCase().includes(needle)) : rows;
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = a.sort?.at(sort.col) ?? null, y = b.sort?.at(sort.col) ?? null;
        if (x === y) return 0;
        if (x === null) return 1; // blanks last either way
        if (y === null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true })) * dir;
      });
    }
    return list;
  }, [rows, q, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const at = Math.min(page, pages);
  const slice = shown.slice((at - 1) * pageSize, at * pageSize);
  const toggle = (col: number) => { setSort((s) => (s?.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" })); setPage(1); };

  return (
    <div className="dt">
      {(filter || toolbar) && (
        <div className="dt-head">
          {filter && (
            <label className="top-search dt-filter">
              <Icon name="search" size="sm" />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={filter} aria-label={filter} />
            </label>
          )}
          <div className="grow" />
          {toolbar}
        </div>
      )}
      {rows.length === 0 ? <Empty title={empty}>{emptyText}</Empty> : shown.length === 0 ? <Empty title="No matches">Try fewer letters.</Empty> : (
        <div className="tbl-wrap"><table className="t rt">
          <thead><tr>
            {columns.map((c, i) => (
              <th key={i} className={c.right ? "r" : undefined} aria-sort={sort?.col === i ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.sortable ? <button type="button" className="dt-sort" onClick={() => toggle(i)}>{c.label}<span className="dir">{sort?.col === i ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button> : c.label}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id}>{r.cells.map((cell, i) => <td key={i} data-label={columns.at(i)?.label ?? ""} className={columns.at(i)?.right ? "r" : undefined}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table></div>
      )}
      {pages > 1 && (
        <div className="dt-foot">
          <span className="small muted">{(at - 1) * pageSize + 1}–{Math.min(at * pageSize, shown.length)} of {shown.length.toLocaleString()}</span>
          <div className="pager">
            <button type="button" className="btn sm" disabled={at <= 1} onClick={() => setPage(at - 1)}><Icon name="back" size="sm" /> Previous</button>
            <button type="button" className="btn sm" disabled={at >= pages} onClick={() => setPage(at + 1)}>Next <Icon name="chev" size="sm" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
