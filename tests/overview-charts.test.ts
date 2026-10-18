import { test } from "node:test";
import assert from "node:assert/strict";
import { morningCurve } from "../src/modules/reports/trends";

const at = (t: string) => new Date(`2026-10-16T${t}:00+01:00`);
const rows = [
  { section: "school-a", sectionName: "School A", name: "Ada Obi", clockInAt: at("07:12") },
  { section: "school-a", sectionName: "School A", name: "Bayo Ade", clockInAt: at("07:40") },
  { section: "school-b", sectionName: "School B", name: "Chi Eze", clockInAt: at("07:05") },
  { section: "school-b", sectionName: "School B", name: "Dan Musa", clockInAt: at("08:02") },
  { section: "admin", sectionName: "Admin", name: "Efe Ola", clockInAt: null },
];

test("morning curve: running count per section in 10-minute steps, sections nobody clocked in for are left out", () => {
  const c = morningCurve(rows, "07:45");
  assert.equal(c.labels[0], "06:00");
  assert.deepEqual(c.series.map((s) => s.name), ["School A", "School B"]);
  const a = c.series[0].values, b = c.series[1].values;
  assert.equal(a[c.labels.indexOf("07:10")], 0);
  assert.equal(a[c.labels.indexOf("07:20")], 1);
  assert.equal(a[a.length - 1], 2);
  assert.equal(b[c.labels.indexOf("08:00")], 1);
  assert.equal(b[b.length - 1], 2);
});

test("morning curve: amber after the late time, markers for first in, the late time and last in", () => {
  const c = morningCurve(rows, "07:45");
  assert.equal(c.labels[c.warn![0]], "07:50");
  assert.deepEqual(c.markers.map((m) => [m.title, m.sub]), [["First in", "07:05"], ["Late after", "07:45"], ["Last in", "08:02"]]);
});

test("morning curve: nobody in yet still gives a time axis and the late marker", () => {
  const c = morningCurve(rows.map((r) => ({ ...r, clockInAt: null })), "07:45");
  assert.equal(c.series.length, 0);
  assert.ok(c.labels.includes("07:50"));
  assert.deepEqual(c.markers.map((m) => m.title), ["Late after"]);
});
