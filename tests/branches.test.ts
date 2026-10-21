import { test } from "node:test";
import assert from "node:assert/strict";
import { clockInPlaces, DEFAULT_ATTENDANCE, nearestPlace } from "../src/modules/attendance/service";

const A = { id: "school-a", name: "School A", lat: 6.4659, lng: 3.2847, radiusM: 150 };
const B = { id: "school-b", name: "School B", lat: 6.4712, lng: 3.2790, radiusM: 150 };

test("branches: a clock-in is checked against the nearest branch", () => {
  const atB = { lat: 6.4713, lng: 3.2791 };
  const n = nearestPlace([A, B], atB);
  assert.equal(n.place.name, "School B");
  assert.ok(n.metres < n.place.radiusM);
  const far = nearestPlace([A, B], { lat: 6.5, lng: 3.3 });
  assert.ok(far.metres > far.place.radiusM, "far from every branch is refused");
});

test("branches: the older single location still works until branches are set", () => {
  const old = { ...DEFAULT_ATTENDANCE, gps: { lat: 6.46, lng: 3.28, radiusM: 200 } };
  assert.deepEqual(clockInPlaces(old).map((p) => p.name), ["the school"]);
  assert.deepEqual(clockInPlaces({ ...old, branches: [A, B] }).map((p) => p.name), ["School A", "School B"]);
  assert.equal(clockInPlaces(DEFAULT_ATTENDANCE).length, 0, "nothing set: location isn't checked");
});
