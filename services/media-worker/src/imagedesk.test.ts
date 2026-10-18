import { test } from "node:test";
import assert from "node:assert/strict";
import { creditLine, licenseOk, verdictOk } from "./imagedesk.js";

test("licenseOk keeps reusable licences and rejects NC / ND / fair use", () => {
  for (const ok of ["CC BY 4.0", "CC BY-SA 3.0", "CC BY 2.0", "Public domain", "CC0", "GODL-India", "PD-USGov-NASA"]) assert.equal(licenseOk(ok), true, ok);
  for (const bad of ["CC BY-NC 4.0", "CC BY-ND 2.0", "CC BY-NC-SA 3.0", "Fair use", "All rights reserved", "", "Non-commercial"]) assert.equal(licenseOk(bad), false, bad);
});

test("creditLine names author and licence, strips html and urls", () => {
  assert.equal(creditLine({ author: '<a href="x">Steve Jurvetson</a>', license: "CC BY 2.0" }), "Steve Jurvetson, CC BY 2.0, Wikimedia Commons");
  assert.equal(creditLine({ author: "https://www.president.gov.ua/", license: "CC BY 4.0" }), "president.gov.ua, CC BY 4.0, Wikimedia Commons");
  assert.equal(creditLine({ author: "U.S. Air Force / Trevor Cokley", license: "Public domain" }), "U.S. Air Force, Public domain, Wikimedia Commons");
});

test("verdictOk accepts only a clear real photo of the subject", () => {
  const good = { depicts_subject: true, is_illustration_or_cartoon: false, quality: 4 };
  assert.equal(verdictOk(good, "person"), true);
  assert.equal(verdictOk({ ...good, depicts_subject: false }, "person"), false);
  assert.equal(verdictOk({ ...good, is_illustration_or_cartoon: true }, "person"), false);
  assert.equal(verdictOk({ ...good, quality: 2 }, "object"), false);
  assert.equal(verdictOk({ ...good, other_identifiable_people: true }, "object"), false);
  assert.equal(verdictOk({ ...good, readable_text_or_logos: true }, "object"), false);
});

import { titleNamesPerson } from "./imagedesk.js";

test("a person's photo is accepted only if the file title names every word of the name (no face checking)", () => {
  assert.equal(titleNamesPerson("File:Volodymyr Zelenskyy in 2024.jpg", "Volodymyr Zelenskyy"), true);
  assert.equal(titleNamesPerson("File:Zelensky_and_Biden.jpg", "Volodymyr Zelensky"), false, "first name missing");
  assert.equal(titleNamesPerson("File:Elon Musk Royal Society (crop).jpg", "Elon Musk"), true);
  assert.equal(titleNamesPerson("File:Kyiv skyline.jpg", "Elon Musk"), false);
  assert.equal(titleNamesPerson("File:Anything.jpg", "  "), false);
});
