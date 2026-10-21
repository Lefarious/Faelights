"use strict";
// test/fixtures/marks.pdf (built by make-marks-pdf.js): Underline / StrikeOut / Squiggly marks, a nested bookmark tree,
// numbered body-size headings for wording-based topics (outline stripped), and highlights with no text under them.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PDFDocument, PDFName } = require("pdf-lib");
const { repoPath } = require("../helpers/pdf");
const X = require("../../core/extract.js");

const MARKS = repoPath("test", "fixtures", "marks.pdf");
const noOutline = async file => {
  const doc = await PDFDocument.load(fs.readFileSync(file));
  doc.catalog.delete(PDFName.of("Outlines"));
  return doc.save({ useObjectStreams: false });
};

let r, plain;
before(async () => {
  r = await X.extractPdf(MARKS);
  plain = await X.extractPdf(await noOutline(MARKS));
});

test("marks.pdf: every mark type, in reading order, with colour, comment and topic", () => {
  assert.equal(r.pages, 3);
  assert.equal(r.count, 11);
  assert.deepEqual(X.highlights(r).map(h => [h.page, h.type, h.text, h.color, h.comment, h.topic]), [
    [1, "Highlight", "A good note is short and dated", [255, 255, 0], "", ["Introduction"]],
    [1, "Underline", "mark the lines they want to keep", [0, 0, 255], "key idea", ["Introduction"]],
    [1, "Strike", "Duplicate notes were removed by hand", [255, 0, 0], "", ["Methods"]],
    [1, "Squiggly", "favours the summer months", [0, 255, 0], "", ["Methods", "Sampling"]],
    [1, "Highlight", "caught most of the moths in the study.", [255, 255, 0], "", ["Methods", "Sampling"]],
    [2, "Highlight", "The median note had eleven words.", [0, 255, 0], "", ["Results", "Counts"]],
    [2, "Underline", "corrected from the weather records.", [128, 0, 255], "", ["Results", "Errors"]]
  ]);
  assert.deepEqual(X.highlights(r).map(h => h.sentence), [
    "A good note is short and dated.", "Readers often mark the lines they want to keep with a pen.",
    "Duplicate notes were removed by hand.", "The sample favours the summer months when most observers were active.",
    "The trap shown above caught most of the moths in the study.", "The median note had eleven words.",
    "These were corrected from the weather records."
  ]);
});

test("marks.pdf: the bookmark tree gives nested topics", () => {
  assert.equal(r.topicSource, "outline");
  assert.deepEqual(r.topics.map(t => [t.path, t.level, t.page]), [
    [["Introduction"], 1, 1], [["Methods"], 1, 1], [["Methods", "Sampling"], 2, 1],
    [["Results"], 1, 2], [["Results", "Counts"], 2, 2], [["Results", "Errors"], 2, 2]
  ]);
});

test("marks.pdf without its outline: topics come from the numbered headings' wording", () => {
  assert.equal(plain.topicSource, "patterns");
  assert.deepEqual(plain.topics.map(t => [t.path, t.level, t.page]), [
    [["1. Introduction"], 1, 1], [["2. Methods"], 1, 1], [["2. Methods", "2.1 Sampling"], 2, 1],
    [["3. Results"], 1, 2], [["3. Results", "3.1 Counts"], 2, 2], [["3. Results", "3.2 Errors"], 2, 2]
  ]);
  // same stream positions as the bookmarks: only the names differ
  assert.deepEqual(plain.topics.map(t => t.at), r.topics.map(t => t.at));
  assert.deepEqual(X.highlights(plain).map(h => h.topic), [["1. Introduction"], ["1. Introduction"], ["2. Methods"],
    ["2. Methods", "2.1 Sampling"], ["2. Methods", "2.1 Sampling"], ["3. Results", "3.1 Counts"], ["3. Results", "3.2 Errors"]]);
});

test("marks.pdf: highlights over a figure or a page without text are loose, and page 3 has no text layer", () => {
  assert.deepEqual(r.textless, [3]);
  assert.deepEqual(r.loose, [
    { page: 1, color: [255, 128, 0], type: "Highlight", comment: "sketch of the trap" },
    { page: 2, color: [255, 255, 0], type: "Highlight", comment: "" },
    { page: 3, color: [0, 0, 255], type: "Highlight", comment: "scanned table" },
    { page: 3, color: [255, 0, 0], type: "Highlight", comment: "no position" }
  ]);
  const spans = r.entries.reduce((n, e) => n + e.spans.length, 0);
  assert.equal(spans + r.loose.length, r.count, "every mark is accounted for");
  assert.deepEqual(r.images, []);
});
