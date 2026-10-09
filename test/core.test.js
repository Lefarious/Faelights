"use strict";
// Smoke tests for the extraction engine (renderer/core.js) against the
// bundled annotated sample, renderer/sample.pdf.
//
// The numbers and strings below are a snapshot of the current analyzer output.
// If you change extraction on purpose, check the new output is better, update
// the snapshot here, and bump ANALYZER_VERSION in core.js.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { withPdf, repoPath } = require("./helpers/pdf");
const { analyzePdf, ANALYZER_VERSION } = require("../renderer/core.js");

const SAMPLE = repoPath("renderer", "sample.pdf");

const YELLOW = [255, 219, 51];
const GREEN = [140, 217, 115];
const PINK = [255, 140, 153];
const BLUE = [128, 191, 255];

// Expected entries in reading order: page, topic title, spans, sentence.
const EXPECTED_ENTRIES = [
  {
    page: 1,
    topic: "1. How the light is made",
    spans: [{ color: YELLOW, text: "joins a molecule called luciferin with oxygen", comment: "" }],
    sentence:
      "In fireflies the reaction joins a molecule called luciferin with oxygen, and an enzyme named luciferase speeds it up.",
  },
  {
    page: 1,
    topic: "1. How the light is made",
    spans: [{ color: YELLOW, text: "called cold light", comment: "Good term for the essay intro" }],
    sentence:
      "Almost all of the energy leaves as visible light rather than heat, which is why the glow is often called cold light.",
  },
  {
    page: 1,
    topic: "2. Why fireflies flash",
    spans: [{ color: GREEN, text: "the delay between signals carries as much meaning as the light itself", comment: "" }],
    sentence:
      "The female answers with a timed flash of her own, so the delay between signals carries as much meaning as the light itself.",
  },
  {
    page: 1,
    topic: "2. Why fireflies flash",
    spans: [{ color: PINK, text: "femme fatale fireflies", comment: "Look up Photuris" }],
    sentence: "Researchers call these mimics femme fatale fireflies.",
  },
  {
    page: 2,
    topic: "3. Light in the deep sea",
    spans: [{ color: YELLOW, text: "three quarters of deep-sea animals", comment: "" }],
    sentence: "Estimates suggest that roughly three quarters of deep-sea animals can produce light in some form.",
  },
  {
    page: 2,
    topic: "3. Light in the deep sea",
    // Two marks in one sentence merge into a single entry.
    spans: [
      { color: BLUE, text: "counter-illumination,", comment: "" },
      { color: BLUE, text: "so their outline disappears against the dim water above.", comment: "" },
    ],
    sentence:
      "Many fish use counter-illumination, glowing faintly on their bellies so their outline disappears against the dim water above.",
  },
  {
    page: 2,
    topic: "4. Uses in the lab",
    spans: [{ color: GREEN, text: "Green fluorescent protein from a jellyfish", comment: "" }],
    sentence: "Green fluorescent protein from a jellyfish became one of the most widely used tools in cell biology.",
  },
];

const EXPECTED_TOPICS = [
  { title: "Notes on Bioluminescence", level: 1, page: 1 },
  { title: "1. How the light is made", level: 2, page: 1 },
  { title: "2. Why fireflies flash", level: 2, page: 1 },
  { title: "3. Light in the deep sea", level: 2, page: 2 },
  { title: "4. Uses in the lab", level: 2, page: 2 },
];

let result;
let progress;

before(async () => {
  progress = [];
  result = await withPdf(SAMPLE, (pdf) => analyzePdf(pdf, (p, n) => progress.push([p, n])));
});

test("result has the documented top-level shape and current version", () => {
  for (const k of ["v", "entries", "loose", "topics", "topicSource", "pages", "count"]) {
    assert.ok(k in result, `missing key ${k}`);
  }
  assert.equal(typeof ANALYZER_VERSION, "number");
  assert.equal(result.v, ANALYZER_VERSION);
  assert.ok(Array.isArray(result.entries));
  assert.ok(Array.isArray(result.loose));
  assert.ok(Array.isArray(result.topics));
});

test("page count and progress callback", () => {
  assert.equal(result.pages, 2);
  assert.deepEqual(progress, [
    [1, 2],
    [2, 2],
  ]);
});

test("mark counts match the snapshot", () => {
  assert.ok(result.count > 0);
  assert.equal(result.count, 8, "total marks");
  assert.equal(result.entries.length, 7, "entries (two marks share one sentence)");
  assert.equal(result.loose.length, 0, "no text-less marks in the sample");
  const spanTotal = result.entries.reduce((n, e) => n + e.spans.length, 0);
  assert.equal(spanTotal + result.loose.length, result.count, "every mark is accounted for");
});

test("every entry has a page, coloured spans and a non-empty sentence", () => {
  result.entries.forEach((e, i) => {
    assert.equal(e.n, i + 1, "entries are numbered from 1 in order");
    assert.ok(Number.isInteger(e.page) && e.page >= 1 && e.page <= result.pages, `entry ${i} page`);
    assert.ok(Number.isInteger(e.at) && e.at >= 0, `entry ${i} at`);
    assert.equal(typeof e.sentence, "string");
    assert.ok(e.sentence.trim().length > 0, `entry ${i} sentence is empty`);
    assert.ok(Array.isArray(e.segs) && e.segs.length > 0, `entry ${i} segs`);
    assert.ok(e.spans.length > 0, `entry ${i} has no spans`);
    for (const s of e.spans) {
      assert.equal(s.type, "Highlight");
      assert.ok(Array.isArray(s.color) && s.color.length === 3, "colour is [r,g,b]");
      for (const c of s.color) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255, "colour channel 0-255");
      assert.ok(s.text.trim().length > 0, "span text non-empty");
      assert.ok(e.sentence.includes(s.text.trim()), `span "${s.text}" is inside its sentence`);
    }
  });
  const ats = result.entries.map((e) => e.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b), "entries are in reading order");
});

test("entries match the snapshot (pages, topics, spans, sentences)", () => {
  const actual = result.entries.map((e) => ({
    page: e.page,
    topic: e.topic && e.topic.title,
    spans: e.spans.map((s) => ({ color: s.color, text: s.text, comment: s.comment })),
    sentence: e.sentence,
  }));
  assert.deepEqual(actual, EXPECTED_ENTRIES);
});

test("known highlighted phrases are found", () => {
  const spanText = result.entries.flatMap((e) => e.spans.map((s) => s.text)).join("\n");
  const sentences = result.entries.map((e) => e.sentence).join("\n");
  for (const phrase of ["luciferin", "cold light", "femme fatale fireflies", "counter-illumination", "Green fluorescent protein"]) {
    assert.ok(spanText.includes(phrase), `span text should contain "${phrase}"`);
    assert.ok(sentences.includes(phrase), `sentences should contain "${phrase}"`);
  }
});

test("topics come from font-size headings and match the snapshot", () => {
  assert.equal(result.topicSource, "headings");
  assert.deepEqual(
    result.topics.map((t) => ({ title: t.title, level: t.level, page: t.page })),
    EXPECTED_TOPICS,
  );
  for (const t of result.topics) {
    assert.ok(Array.isArray(t.path) && t.path[t.path.length - 1] === t.title, "path ends with the title");
  }
});
