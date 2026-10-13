"use client";

/** Header checkbox: ticks or clears every "ids" checkbox that belongs to the given form. */
export function SelectAll({ form }: { form: string }) {
  return (
    <input type="checkbox" aria-label="Select all" defaultChecked={form === "enrol-form"}
      onChange={(e) => document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${form}"], #${form} input[name="ids"]`).forEach((c) => { c.checked = e.target.checked; })} />
  );
}
