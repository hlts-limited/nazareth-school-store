import { cloneElement, isValidElement, type ReactNode } from "react";

/** Gives each cell of a DataTable row a key (React needs one on every element passed in a list). Use on the server: `cells: keyed([...])`. */
export function keyed(cells: ReactNode[]): ReactNode[] {
  return cells.map((c, i) => (isValidElement(c) && c.key == null ? cloneElement(c, { key: `c${i}` }) : c));
}
