import { test } from "node:test";
import assert from "node:assert/strict";
import { numbersIn } from "@openlens/config";
import { beatCandidates, numberBeat, pickBeat, quoteBeat, timelineBeat, type BeatContext } from "./beats.js";

const ctx = (over: Partial<BeatContext> = {}): BeatContext => ({ lang: "en", index: 1, total: 6, ...over });
const line = (text: string, claimIds: string[]) => ({ label: "L", text, claimIds });

test("number card only shows a figure whose digits are in the line's own claim text", () => {
  const claims = { c1: { text: "The board voted to raise fares by 20 percent from 1 January 2027.", state: "supported" } };
  const b = numberBeat(line("Fares rise 20 percent from January 1 2027.", ["c1"]), ctx({ claims }));
  assert.deepEqual(b && { kind: b.kind, value: (b as any).value, unit: (b as any).unit }, { kind: "number", value: "20", unit: "%" });
  // The line says 25, the claim says 20: no card (never an invented or mismatched figure).
  assert.equal(numberBeat(line("Fares rise 25 percent.", ["c1"]), ctx({ claims })), undefined);
  // A figure from a claim the line does not cite does not count.
  assert.equal(numberBeat(line("Fares rise 20 percent.", ["c9"]), ctx({ claims })), undefined);
  // No ledger claims supplied: no number card at all.
  assert.equal(numberBeat(line("Fares rise 20 percent.", ["c1"]), ctx()), undefined);
});

test("number card skips unverified/contested claims, years, dates and small bare counts", () => {
  const claims = {
    u: { text: "Prices fell 5.2% in September.", state: "unverified" },
    k: { text: "On 29 September 2026 the board met; 7 members voted.", state: "supported" },
  };
  assert.equal(numberBeat(line("Prices fell 5.2 per cent.", ["u"]), ctx({ claims })), undefined);
  assert.equal(numberBeat(line("On September 29 2026, 7 members voted.", ["k"]), ctx({ claims })), undefined);
});

test("number card keeps an English qualifier and reads 'per cent'", () => {
  const claims = { c45: { text: "Less than 1 per cent of Australian mortgage borrowers are estimated to be in negative equity.", state: "supported" } };
  const b = numberBeat(line("Still, less than 1 per cent of mortgage holders are in negative equity.", ["c45"]), ctx({ claims }));
  assert.equal(b?.kind, "number");
  assert.equal((b as any).value, "1");
  assert.equal((b as any).unit, "%");
  assert.equal((b as any).qualifier, "less than");
});

test("number card works for Hindi and Japanese lines (digits only from the claim)", () => {
  const claims = { c1: { text: "Fares rise by 20 percent from 1 January 2027.", state: "supported" } };
  const hi = numberBeat(line("मेट्रो ने किराए में 20 प्रतिशत बढ़ोतरी का फ़ैसला लिया है।", ["c1"]), ctx({ claims, lang: "hi" }));
  assert.equal((hi as any)?.value, "20");
  assert.equal((hi as any)?.unit, "%");
  const ja = numberBeat(line("2027年1月1日から運賃を20％引き上げます。", ["c1"]), ctx({ claims, lang: "ja" }));
  assert.equal((ja as any)?.value, "20");
});

test("every number card on a real script uses digits present in a cited claim", () => {
  const claims: Record<string, { text: string; state: string; attributedTo?: string }> = {
    c1: { text: "The Monetary Policy Board decided to increase the cash rate target by 25 basis points to 4.60 per cent.", state: "supported" },
    c25: { text: "The policy decision made today was unanimous.", state: "supported" },
    c69: { text: "The Reserve Bank of Australia raised the cash rate from 4.35% to 4.6%, reaching its highest level since late 2011.", state: "supported" },
    c45: { text: "Less than 1 per cent of Australian mortgage borrowers are estimated to be in negative equity.", state: "supported" },
    c12: { text: "Housing prices have fallen in most capital cities and new housing loans have declined noticeably.", state: "supported" },
    c50: { text: "National property values in Australia fell by 5.2% in September from their March peak.", state: "unverified" },
  };
  const lines = [
    line("Australia's central bank unanimously raised the cash rate by 25 basis points to 4.60 per cent. This decision pushes borrowing costs to their highest level since late 2011.", ["c1", "c25", "c69"]),
    line("Housing prices have fallen across most capital cities. Still, less than 1 per cent of mortgage holders are currently in negative equity.", ["c12", "c45"]),
    line("Key private reports, including claims that national property values plunged over 5 per cent, remain unverified.", ["c50"]),
  ];
  const kinds = lines.map((l, i) => {
    const b = pickBeat(l, ctx({ claims, index: i, total: 4 }));
    if (b.kind === "number") assert.ok(l.claimIds.some((id) => numbersIn(claims[id]!.text).includes(b.value.replace(/,/g, ""))));
    return b.kind === "number" ? `${b.value}${b.unit ?? ""}` : b.kind;
  });
  assert.deepEqual(kinds, ["4.60%", "1%", "hero"]);
});

test("attributed statement uses the name as spoken and skips unverified claims", () => {
  const claims = {
    c6: { text: "The fare increase is needed.", attributedTo: "Chairperson Anil Rao", state: "attributed" },
    c9: { text: "It will hurt commuters.", attributedTo: "Meera Das", state: "unverified" },
  };
  const q = quoteBeat(line("పెంపు అవసరమని చైర్‌పర్సన్ Anil Rao తెలిపారు.", ["c6"]), ctx({ claims, lang: "te" }));
  assert.equal(q?.kind, "quote");
  assert.equal((q as any).by, "Anil Rao");
  assert.equal(quoteBeat(line("Meera Das says it will hurt commuters.", ["c9"]), ctx({ claims })), undefined);
});

test("timeline needs two safe events backed by the line and drops events resting on unverified claims", () => {
  const claims = { a: { text: "x", state: "supported" }, b: { text: "y", state: "supported" }, u: { text: "z", state: "unverified" } };
  const timeline = [
    { date: "2026-09-29", text: "Vote", claimIds: ["b"] },
    { date: "2020", text: "Last revision", claimIds: ["a"] },
    { date: "2026-10-01", text: "Rumour", claimIds: ["b", "u"] },
  ];
  const t = timelineBeat(line("Fares were last revised in 2020. The board voted.", ["a", "b"]), ctx({ claims, timeline }));
  assert.equal(t?.kind, "timeline");
  assert.deepEqual((t as any).events.map((e: any) => e.text), ["Last revision", "Vote"]);
  assert.equal((t as any).showText, true);
  assert.equal((timelineBeat(line("x", ["a", "b"]), ctx({ claims, timeline, lang: "hi" })) as any).showText, false);
  assert.equal(timelineBeat(line("x", ["b", "u"]), ctx({ claims, timeline })), undefined);
});

test("picker: CTA on the last line, illustration wins, hints only among allowed beats, no repeats", () => {
  const claims = { c1: { text: "Fares rise by 20 percent.", state: "supported" } };
  assert.equal(pickBeat(line("Open the research in the OpenLens app.", ["c1"]), ctx({ index: 5, total: 6, ctaUrl: "https://x/story/s" })).kind, "cta");
  assert.equal(pickBeat(line("Fares rise 20 percent.", ["c1"]), ctx({ claims, illustration: true })).kind, "illustration");
  // Hint for a beat the rules do not allow (no attribution) is ignored.
  assert.equal(pickBeat(line("Fares rise 20 percent.", ["c1"]), ctx({ claims }), { kind: "quote" }).kind, "number");
  assert.equal(pickBeat(line("Fares rise 20 percent.", ["c1"]), ctx({ claims }), { kind: "hero" }).kind, "hero");
  // Previous line was a number card: alternate if anything else is allowed.
  assert.equal(pickBeat(line("Fares rise 20 percent.", ["c1"]), ctx({ claims, prev: "number" })).kind, "hero");
  assert.ok(beatCandidates(line("x", []), ctx()).some((b) => b.kind === "hero"));
});

test("a figure from an attributed claim needs the attribution spoken in the line, and the card names it", () => {
  const claims = {
    c8: { text: "Metro ridership grew 8 percent last year.", attributedTo: "the Authority's annual report", state: "attributed" },
    c11: { text: "The new fares could add 600 rupees to daily riders' monthly costs.", attributedTo: "Daily riders", state: "attributed" },
  };
  assert.equal(numberBeat(line("Observers have not confirmed the agency's reported 8 percent ridership growth.", ["c8"]), ctx({ claims })), undefined);
  const b = numberBeat(line("Daily riders say the change could add 600 rupees each month.", ["c11"]), ctx({ claims }));
  assert.equal((b as any)?.value, "600");
  assert.equal((b as any)?.by, "Daily riders");
});

test("a timeline whose events all share one date is not shown", () => {
  const claims = { a: { text: "x", state: "supported" }, b: { text: "y", state: "supported" } };
  const timeline = [{ date: "2026-10-15", text: "Students evacuated", claimIds: ["a"] }, { date: "2026-10-15", text: "Reunification site opened", claimIds: ["b"] }];
  assert.equal(timelineBeat(line("Students were evacuated and a site opened.", ["a", "b"]), ctx({ claims, timeline })), undefined);
  const spread = [{ date: "2026-10-14", text: "Tension rose", claimIds: ["a"] }, { date: "2026-10-15", text: "Students evacuated", claimIds: ["b"] }];
  assert.equal(timelineBeat(line("Tension rose and students were evacuated.", ["a", "b"]), ctx({ claims, timeline: spread }))?.kind, "timeline");
});
