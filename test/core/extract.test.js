"use strict";
// core/extract.js in plain Node: opening a PDF with the legacy build, reading order, mark types, the flat
// highlights() list (full sentence + highlight-only text), loose marks.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { repoPath } = require("../helpers/pdf");
const { annotate } = require("../helpers/annotate");
const X = require("../../core/extract.js");

const SAMPLE = repoPath("renderer", "sample.pdf");
const EXTRA = {
  marks: [
    { page: 2, find: "anglerfish hosts glowing bacteria", subtype: "Underline", color: [0, 0, 1], contents: "check species" },
    { page: 2, find: "earned the Nobel Prize", subtype: "StrikeOut", color: [1, 0, 0] },
    { page: 2, find: "sunlight fades", subtype: "Squiggly", color: [0, 0.5, 0] },
    { page: 2, rect: [100, 300, 200, 320], subtype: "Highlight", contents: "figure note" }   // blank area: no text under it
  ]
};

let sample, marked;
before(async () => {
  sample = await X.extractPdf(SAMPLE);
  marked = await X.extractPdf(await annotate(SAMPLE, EXTRA));
});

test("runs without a DOM or canvas", () => {
  assert.equal(typeof document, "undefined");
  assert.equal(typeof window, "undefined");
  assert.equal(sample.pages, 2);
  assert.equal(sample.v, X.ANALYZER_VERSION);
});

test("a path and the same bytes give the same result", async () => {
  const fromBytes = await X.extractPdf(fs.readFileSync(SAMPLE));
  assert.deepEqual(fromBytes, sample);
});

test("extractPdf reports progress per page", async () => {
  const calls = [];
  await X.extractPdf(SAMPLE, { onProgress: (p, n) => calls.push([p, n]) });
  assert.deepEqual(calls, [[1, 2], [2, 2]]);
});

test("highlights come out in reading order", () => {
  assert.deepEqual(X.highlights(sample).map(h => [h.page, h.text]), [
    [1, "joins a molecule called luciferin with oxygen"],
    [1, "called cold light"],
    [1, "the delay between signals carries as much meaning as the light itself"],
    [1, "femme fatale fireflies"],
    [2, "three quarters of deep-sea animals"],
    [2, "counter-illumination,"],
    [2, "so their outline disappears against the dim water above."],
    [2, "Green fluorescent protein from a jellyfish"]
  ]);
  const at = sample.entries.map(e => e.at);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.deepEqual(sample.entries.map(e => e.n), [1, 2, 3, 4, 5, 6, 7]);
});

test("each highlight has page, colour, comment, full sentence and highlight-only text", () => {
  const hs = X.highlights(sample);
  assert.deepEqual(hs.map(h => h.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(hs[1], {
    n: 2, page: 1, type: "Highlight", color: [255, 219, 51], comment: "Good term for the essay intro",
    text: "called cold light",
    sentence: "Almost all of the energy leaves as visible light rather than heat, which is why the glow is often called cold light.",
    topic: ["Notes on Bioluminescence", "1. How the light is made"]
  });
  for (const h of hs) assert.ok(h.sentence.includes(h.text), h.text);
  // two marks in one sentence share it
  assert.equal(hs[5].sentence, hs[6].sentence);
});

test("underlines, squiggles and strike-throughs are extracted in reading order among highlights", () => {
  const hs = X.highlights(marked);
  assert.equal(marked.count, 12);
  assert.deepEqual(hs.filter(h => h.page === 2).map(h => [h.type, h.text]), [
    ["Squiggly", "sunlight fades"],
    ["Highlight", "three quarters of deep-sea animals"],
    ["Highlight", "counter-illumination,"],
    ["Highlight", "so their outline disappears against the dim water above."],
    ["Underline", "anglerfish hosts glowing bacteria"],
    ["Highlight", "Green fluorescent protein from a jellyfish"],
    ["Strike", "earned the Nobel Prize"]
  ]);
  const u = hs.find(h => h.type === "Underline");
  assert.deepEqual(u.color, [0, 0, 255]);
  assert.equal(u.comment, "check species");
  assert.equal(u.sentence, "The anglerfish hosts glowing bacteria in a lure that dangles in front of its mouth.");
  assert.equal(hs.find(h => h.type === "Strike").sentence, "Its discovery and development earned the Nobel Prize in Chemistry in 2008.");
});

test("a mark over no text is reported as loose, not as an entry", () => {
  assert.deepEqual(marked.loose, [{ page: 2, color: [255, 217, 51], type: "Highlight", comment: "figure note" }]);
  assert.ok(!X.highlights(marked).some(h => h.comment === "figure note"));
  assert.deepEqual(sample.loose, []);
});

test("normQuads handles flat and point-list quads and falls back to rect", () => {
  assert.deepEqual(X.normQuads({ quadPoints: [1, 9, 5, 9, 1, 2, 5, 2] }), [[1, 2, 5, 9]]);
  assert.deepEqual(X.normQuads({ quadPoints: [[{ x: 1, y: 9 }, { x: 5, y: 9 }, { x: 1, y: 2 }, { x: 5, y: 2 }]] }), [[1, 2, 5, 9]]);
  assert.deepEqual(X.normQuads({ rect: [5, 9, 1, 2] }), [[1, 2, 5, 9]]);
});
