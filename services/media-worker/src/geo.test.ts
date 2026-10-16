import { test } from "node:test";
import assert from "node:assert/strict";
import { countryAt, viewBox } from "./geo.js";
import { figuresBeat } from "./beats.js";

test("countryAt finds the country for known coordinates and near-coast points", () => {
  assert.equal(countryAt(71.58, 34.01)?.country.n, "Pakistan"); // Peshawar
  assert.equal(countryAt(139.69, 35.69)?.country.n, "Japan"); // Tokyo
  assert.equal(countryAt(-0.12, 51.5)?.country.n, "United Kingdom"); // London
  assert.equal(countryAt(0, -60), undefined); // open ocean far from land
});

test("viewBox always contains the pin and has a minimum span for tiny countries", () => {
  const sg = countryAt(103.82, 1.35)!; // Singapore
  const vb = viewBox(sg.part, { lon: 103.82, lat: 1.35 });
  assert.ok(vb.x0 < 103.82 && vb.x1 > 103.82 && vb.y0 < 1.35 && vb.y1 > 1.35);
  assert.ok(vb.x1 - vb.x0 >= 6 && vb.y1 - vb.y0 >= 6);
});

const claims = { c1: { text: "At least 33 children and a teacher died when the roof collapsed.", state: "supported" }, c2: { text: "More than 100 students were inside the building.", state: "supported" }, c3: { text: "The owner said 5 classrooms were affected.", state: "attributed", attributedTo: "Khan" } };
const ctx = (lang = "en") => ({ claims, lang, index: 1, total: 6 });

test("figuresBeat needs 2+ verified figures with labels and ignores dates and attributed figures", () => {
  const b = figuresBeat({ label: "X", text: "At least 33 children and a teacher died. Over 100 students were inside during morning classes on 15 October 2026.", claimIds: ["c1", "c2"] }, ctx());
  assert.equal(b?.kind, "figures");
  if (b?.kind === "figures") assert.deepEqual(b.items.map((i) => [i.value, i.label]), [["33", "children"], ["100", "students"]]);
  assert.equal(figuresBeat({ label: "X", text: "At least 33 children and a teacher died.", claimIds: ["c1"] }, ctx()), undefined); // only one figure
  assert.equal(figuresBeat({ label: "X", text: "33 children died and 100 students were inside.", claimIds: ["c1"] }, ctx()), undefined); // 100 is not in c1
  assert.equal(figuresBeat({ label: "X", text: "33 children died and 5 classrooms were hit.", claimIds: ["c1", "c3"] }, ctx()), undefined); // attributed figure
  assert.equal(figuresBeat({ label: "X", text: "33 children died and 100 students were inside.", claimIds: ["c1", "c2"] }, ctx("hi")), undefined); // English only
});

import { beatCandidates } from "./beats.js";
import { unknownsFromAssessment } from "./media.js";

test("unknowns panel: assessment open questions only, English 'what we know' line, never the end card", () => {
  const unk = unknownsFromAssessment([
    { kind: "established", text: "Fires broke out in the city centre. More text." },
    { kind: "unknown", text: "Official claims of outside political plots remain unproven. Reports conflict on timing." },
    { kind: "contested", text: "Reports conflict on whether the rallies started days ago or have continued for four months." },
  ]);
  assert.deepEqual(unk, ["Official claims of outside political plots remain unproven.", "Reports conflict on whether the rallies started days ago or have continued for four months."]);
  assert.deepEqual(unknownsFromAssessment(undefined), []);
  const claims: any = { b: { text: "Officials say 12 were rescued.", state: "supported" } };
  const base = { claims, lang: "en", index: 3, total: 6, unknowns: unk };
  assert.equal(beatCandidates({ label: "WHAT WE KNOW", text: "Here is what we know.", claimIds: ["b"] }, base)[0]!.kind, "unknowns");
  assert.ok(!beatCandidates({ label: "WHAT HAPPENED", text: "Something happened.", claimIds: ["b"] }, base).some((b) => b.kind === "unknowns"));
  assert.ok(!beatCandidates({ label: "WHAT WE KNOW", text: "Here is what we know.", claimIds: ["b"] }, { ...base, lang: "hi" }).some((b) => b.kind === "unknowns"));
  assert.ok(!beatCandidates({ label: "WHAT WE KNOW", text: "x", claimIds: ["b"] }, { ...base, index: 5 }).some((b) => b.kind === "unknowns"));
  assert.ok(!beatCandidates({ label: "WHAT WE KNOW", text: "x", claimIds: ["b"] }, { ...base, unknowns: [] }).some((b) => b.kind === "unknowns"));
});
