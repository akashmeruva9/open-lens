import { test } from "node:test";
import assert from "node:assert/strict";
import { languagesFor, marketOf, regionLabel, CHANNEL_PLAN, LANG_CODES, PRESENTERS, AI_DISCLOSURE } from "./japac.js";
import { numbersIn, wrapText, xTruncate, xWeightedLength } from "./text.js";

const byChars = (s: string) => [...s].length;

test("Japanese and Thai wrap between words, never mid-word, and lose no text", () => {
  for (const [lang, text] of [
    ["ja", "東京都は来年一月から地下鉄の運賃を二十パーセント引き上げると発表しました。"],
    ["th", "รถไฟฟ้าจะปรับขึ้นค่าโดยสารร้อยละยี่สิบตั้งแต่วันที่หนึ่งมกราคม"],
    ["en", "Metro fares will rise by twenty percent from the first of January next year."],
  ] as const) {
    const lines = wrapText(text, lang, 12, byChars);
    assert.ok(lines.length > 1, `${lang} should wrap`);
    assert.equal(lines.join(lang === "en" ? " " : ""), text, `${lang} text preserved`);
  }
});

test("X weighting counts CJK and Thai as 2 and URLs as 23", () => {
  assert.equal(xWeightedLength("abc"), 3);
  assert.equal(xWeightedLength("日本語"), 6);
  assert.equal(xWeightedLength("see https://openlens.app/story/very-long-slug-here"), 4 + 23);
  assert.ok(xWeightedLength(xTruncate("日".repeat(200), 280)) <= 280);
});

test("full-width digits are normalised", () => {
  assert.deepEqual(numbersIn("運賃を２０％引き上げ、1,200円"), ["20", "1200"]);
});

test("markets map to languages; every language has a channel, presenter and disclosure", () => {
  assert.equal(marketOf("IN-TG"), "IN");
  assert.equal(regionLabel("JP"), "Japan");
  assert.deepEqual(languagesFor(["JP"]), ["en", "ja"]);
  assert.deepEqual(languagesFor(["SG"]), ["en", "zh-Hans", "ms"]);
  assert.equal(languagesFor(["APAC"]).length, LANG_CODES.length);
  for (const l of LANG_CODES) {
    assert.ok(CHANNEL_PLAN[l], l);
    assert.equal(PRESENTERS[CHANNEL_PLAN[l].presenter].lang, l);
    assert.match(AI_DISCLOSURE[l]!, /AI/);
  }
});
