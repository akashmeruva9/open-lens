import { test } from "node:test";
import assert from "node:assert/strict";
import { pickIllustrationLines, safeSubject } from "./visuals.js";

test("safeSubject rejects people, symbols and violence, keeps plain object scenes", () => {
  assert.equal(safeSubject("a satellite dish terminal on a tripod in a muddy field at dusk"), "a satellite dish terminal on a tripod in a muddy field at dusk");
  for (const bad of ["a soldier holding a rifle in a field", "the president at a podium", "a flag on a government building", "a crowd outside a ministry", "a tank on a road", "short", 42]) {
    assert.equal(safeSubject(bad as never), undefined, String(bad));
  }
});

test("pickIllustrationLines uses only plain-card lines, never the end card, and spreads picks", () => {
  const kinds = ["hero", "number", "sources", "quote", "hero", "hero", "sources", "cta"] as const;
  assert.deepEqual(pickIllustrationLines([...kinds], 0), []);
  assert.deepEqual(pickIllustrationLines([...kinds], 10), [0, 2, 4, 5, 6]);
  const three = pickIllustrationLines([...kinds], 3);
  assert.equal(three.length, 3);
  assert.ok(three.every((i) => ["hero", "sources"].includes(kinds[i]!) && i < kinds.length - 1));
  assert.equal(three[0], 0);
});

import { shotPlan } from "./render.js";

test("shotPlan: shots add up to the scene, none under 2.5 s, and the first scene opens with a short shot", () => {
  for (const secs of [3, 6, 9.4, 12, 27.3]) {
    for (const first of [false, true]) {
      const plan = shotPlan(secs, first);
      assert.ok(Math.abs(plan.reduce((a, b) => a + b, 0) - secs) < 0.01, `${secs}/${first} sums`);
      assert.ok(plan.every((d) => d >= 2.4), `${secs}/${first} min shot: ${plan.join(",")}`);
    }
  }
  assert.equal(shotPlan(12, true)[0], 2.5);
  assert.equal(shotPlan(3, true).length, 1); // too short to split
});
