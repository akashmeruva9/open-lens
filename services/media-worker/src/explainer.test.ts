import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { AI_DISCLOSURE } from "@openlens/config";
import type { Beat } from "./beats.js";
import { setTextTrace, type TracedText } from "./draw.js";
import { explainerLayout, renderHookFrame } from "./explainer.js";
import { fontFor, registerDefaultFonts } from "./fonts.js";
import { renderSceneFrame, type Aspect, type Branding, type Scene } from "./scenes.js";

registerDefaultFonts();

const LINES: Record<string, string> = {
  en: "Australia's central bank unanimously raised the cash rate by 25 basis points to 4.60 per cent. This decision pushes borrowing costs to their highest level since late 2011.",
  hi: "मेट्रो अथॉरिटी ने यात्री किराए में 20 प्रतिशत बढ़ोतरी का फ़ैसला लिया है। यह नया किराया 1 जनवरी 2027 से लागू होगा। चेयरपर्सन अनिल राव के मुताबिक, बिजली की बढ़ती लागत के कारण यह ज़रूरी था।",
  te: "మెట్రో అథారిటీ ప్రయాణికుల ఛార్జీలను 20 శాతం పెంచేందుకు ఆమోదం తెలిపింది. ఈ పెంపు January 1 2027 నుంచి అమలులోకి వస్తుంది. పెరుగుతున్న కరెంట్ ఖర్చుల కోసమే ఈ పెంపు అని చైర్‌పర్సన్ Anil Rao తెలిపారు.",
  ja: "地下鉄公社は、2027年1月1日から運賃を20％引き上げることを決めました。アニル・ラオ会長は、高騰する電気代を賄うために不可欠だと説明しています。",
};

const BEATS: Beat[] = [
  { kind: "number", value: "4.60", unit: "%", qualifier: "less than", sentence: "x", claimId: "c1" },
  { kind: "quote", text: "Treasurer Jim Chalmers warned overseas conflict is turbocharging inflation.", by: "Jim Chalmers", claimId: "c78" },
  { kind: "timeline", showText: true, events: [
    { date: "Oct 2025", text: "The Australian Government expands the 5% Deposit Scheme to improve access to residential home loans.", active: false },
    { date: "14 Oct 2026", text: "The RBA confirms a unanimous 25-basis-point increase to 4.60%.", active: true },
    { date: "14 Oct 2026", text: "The RBA releases its October 2026 Financial Stability Review.", active: true },
  ] },
  { kind: "sources", outlets: ["Reserve Bank of Australia", "The Conversation"], count: 2, headline: "" },
  { kind: "hero", headline: "" },
  { kind: "illustration" },
  { kind: "cta", text: "Open the research in the OpenLens app.", url: "https://openlens.example/story/rba-fsr-2026-10" },
  { kind: "cta", text: "Open the research in the OpenLens app." },
];

const strip = (s: string) => s.replace(/\s+/g, "");

function check(aspect: Aspect, lang: string, draw: () => void, what: string) {
  const L = explainerLayout(aspect);
  const seen: TracedText[] = [];
  setTextTrace((t) => seen.push(t));
  try {
    draw();
  } finally {
    setTextTrace(undefined);
  }
  const disclosure = seen.filter((t) => t.role === "disclosure");
  assert.equal(strip(disclosure.map((t) => t.text).join("")), strip(AI_DISCLOSURE[lang]!), `${what}: full disclosure on the frame`);
  for (const t of seen) {
    assert.ok(t.y <= L.safe.bottom, `${what}: "${t.text}" (${t.role}) below the safe bottom (${t.y})`);
    assert.ok(t.y - t.size >= L.safe.top - 1, `${what}: "${t.text}" (${t.role}) above the safe top`);
    const right = t.x + t.w;
    const limit = t.y >= L.safe.rightFrom ? L.safe.right : L.W - L.pad;
    assert.ok(right <= limit + 1, `${what}: "${t.text}" (${t.role}) runs into the right edge (${Math.round(right)} > ${limit})`);
    assert.ok(t.x >= L.pad - 1 || t.role === "nametag", `${what}: "${t.text}" starts left of the margin`);
  }
  // Captions and beat text must be big enough to read on a phone.
  for (const t of seen.filter((t) => t.role === "caption")) assert.ok(t.size >= (aspect === "9:16" ? 40 : 34), `${what}: caption ${t.size}px`);
}

test("disclosure on every explainer frame, every beat, both shapes, four scripts; text stays in safe zones", () => {
  const img = createCanvas(800, 600);
  for (const lang of Object.keys(LINES)) {
    const brand: Branding = { title: "RBA lifts the cash rate to 4.60%", disclosure: AI_DISCLOSURE[lang]!, fontFamily: fontFor(lang), lang, presenterName: "Maya" };
    for (const aspect of ["9:16", "16:9"] as Aspect[]) {
      for (const [i, beat] of BEATS.entries()) {
        const scene: Scene = { text: LINES[lang]!, label: "WHAT HAPPENED", seconds: 5, claimIds: ["c1"], sources: ["Reserve Bank of Australia", "The Conversation"], beat, layout: "beat",
          image: beat.kind === "illustration" ? (img as any) : undefined };
        for (const overlay of [false, true]) {
          check(aspect, lang, () => renderSceneFrame(scene, brand, i, BEATS.length, aspect, overlay), `${lang} ${aspect} ${beat.kind}${overlay ? " overlay" : ""}`);
        }
      }
      for (const overlay of [false, true]) {
        check(aspect, lang, () => renderHookFrame({ text: LINES[lang], title: brand.title }, brand, aspect, overlay), `${lang} ${aspect} hook`);
      }
    }
  }
});

test("illustration frames carry the AI image label", () => {
  const seen: TracedText[] = [];
  setTextTrace((t) => seen.push(t));
  try {
    const brand: Branding = { title: "T", disclosure: AI_DISCLOSURE.ja!, fontFamily: fontFor("ja"), lang: "ja" };
    renderSceneFrame({ text: LINES.ja!, seconds: 3, claimIds: [], beat: { kind: "illustration" }, image: createCanvas(400, 300) as any }, brand, 0, 3, "9:16");
  } finally {
    setTextTrace(undefined);
  }
  assert.ok(seen.some((t) => t.role === "illustration-label" && t.text.includes("AI image")));
});

test("older anchor/split layouts still render", () => {
  const brand: Branding = { title: "T", disclosure: AI_DISCLOSURE.en!, fontFamily: fontFor("en"), lang: "en" };
  for (const layout of ["anchor", "split"] as const) {
    const png = renderSceneFrame({ text: LINES.en!, seconds: 3, claimIds: ["c1"], layout }, brand, 0, 3, "16:9");
    assert.equal(png.readUInt32BE(16), 1920);
  }
});
