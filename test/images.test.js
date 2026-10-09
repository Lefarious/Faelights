"use strict";
// Image boxes (Square annotations) -> result.images, on test/fixtures/images.pdf
// (built by test/fixtures/make-images-pdf.js; see that script for the layout).
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const { withPdf, repoPath } = require("./helpers/pdf");
const { analyzePdf, imgStreamAt, imgSnapToFacts } = require("../renderer/core.js");

const RED = [255, 0, 0];
const BLUE = [0, 0, 255];

describe("images.pdf", () => {
  let r;
  before(async () => { r = await withPdf(repoPath("test", "fixtures", "images.pdf"), (pdf) => analyzePdf(pdf)); });

  test("image boxes are collected and do not count as marks", () => {
    assert.equal(r.images.length, 6);
    assert.equal(r.count, 4, "only the 4 highlights are marks");
    assert.equal(r.loose.length, 0);
    assert.equal(r.entries.length, 3);
    assert.equal(r.entries.reduce((n, e) => n + e.spans.length, 0), 4);
  });

  test("ids, numbering, pages, rects, colours and comments", () => {
    r.images.forEach((im, i) => {
      assert.equal(im.n, i + 1);
      assert.equal(typeof im.id, "string");
      assert.ok(im.id.length > 0);
      assert.ok(im.rect[0] < im.rect[2] && im.rect[1] < im.rect[3], "rect is normalised");
    });
    assert.equal(new Set(r.images.map((im) => im.id)).size, 6, "ids are unique");
    assert.deepEqual(
      r.images.map(({ page, rect, color, comment }) => ({ page, rect, color, comment })),
      [
        { page: 1, rect: [72, 562, 300, 642], color: RED, comment: "" },                               // A: between paragraphs
        { page: 1, rect: [470, 472, 540, 512], color: BLUE, comment: "" },                             // B: inside a fact
        { page: 1, rect: [200, 316, 412, 436], color: BLUE, comment: "Wing scales under the microscope" }, // D: trimmed
        { page: 2, rect: [340, 620, 520, 628], color: RED, comment: "" },                              // C: right column
        { page: 2, rect: [72, 508, 290, 598], color: RED, comment: "" },                               // L: /Rect was corner-swapped
        { page: 2, rect: [322, 508, 540, 598], color: BLUE, comment: "" },                             // R: same top as L
      ],
    );
  });

  test("sorted by stream position, then left-to-right for side-by-side boxes", () => {
    const ats = r.images.map((im) => im.at);
    assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
    for (const im of r.images) assert.ok(Number.isInteger(im.at) && im.at >= 0);
    const [, , , , L, R] = r.images;
    assert.equal(L.at, R.at, "side-by-side boxes share an anchor");
    assert.ok(L.rect[0] < R.rect[0], "left box first");
  });

  test("placement relative to facts (image goes before entry e when img.at <= e.at)", () => {
    const [A, B, D, C, L] = r.images;
    const [e1, e2, e3] = r.entries;
    const firstAfter = (im) => r.entries.find((e) => im.at <= e.at) || null;
    // A sits after fact 1's paragraph and before paragraph B (which opens with an unmarked sentence)
    assert.ok(e1.at < A.at && A.at < e2.at);
    // B's top edge is inside the second sentence of the merged two-sentence fact 2: it moves to the fact's start
    assert.equal(B.at, e2.at);
    assert.equal(firstAfter(B), e2);
    // D is below all text on page 1: after fact 2, before page 2's fact 3
    assert.ok(e2.at < D.at && D.at < e3.at);
    assert.equal(firstAfter(D), e3);
    // C (right column) and the side-by-side pair come after page 2's only fact
    for (const im of [C, L]) { assert.ok(im.at > e3.at); assert.equal(firstAfter(im), null); }
    // C anchors to the right column (drawn after the left column), so it precedes the pair below the columns
    assert.ok(C.at < L.at);
  });

  test("topics use the adjusted position", () => {
    assert.equal(r.topicSource, "headings");
    assert.deepEqual(r.images.map((im) => im.topic && im.topic.title), [
      "Moths at Night", "Moths at Night", "Moths at Night",
      "Navigation by Moonlight", "Navigation by Moonlight", "Navigation by Moonlight",
    ]);
    assert.deepEqual(r.images[1].topic, r.entries[1].topic);
  });
});

test("sample.pdf has no image boxes", async () => {
  const r = await withPdf(repoPath("renderer", "sample.pdf"), (pdf) => analyzePdf(pdf));
  assert.deepEqual(r.images, []);
});

describe("imgStreamAt (placement on the page)", () => {
  // two-column page 1: left lines are earlier in the stream than right lines at the same height
  const lines = [
    { page: 1, y: 700, start: 0, end: 40, x0: 72, xa: 72, xb: 540 },   // full-width line
    { page: 1, y: 650, start: 42, end: 60, x0: 72, xa: 72, xb: 290 },  // left col
    { page: 1, y: 636, start: 61, end: 80, x0: 72, xa: 72, xb: 290 },  // left col
    { page: 1, y: 650, start: 82, end: 100, x0: 322, xa: 322, xb: 540 }, // right col
    { page: 1, y: 636, start: 101, end: 120, x0: 322, xa: 322, xb: 540 }, // right col
    { page: 3, y: 700, start: 122, end: 150, x0: 72, xa: 72, xb: 540 },
  ];
  const at = (page, rect) => imgStreamAt({ page, rect }, lines, 151);

  test("first line below the top edge that overlaps horizontally", () => {
    assert.equal(at(1, [340, 600, 520, 645]), 101, "right column box skips the left column line");
    assert.equal(at(1, [80, 600, 280, 645]), 61);
    assert.equal(at(1, [72, 600, 540, 710]), 0, "box above everything anchors at the first line");
  });
  test("falls back to the first line below the top regardless of x", () => {
    assert.equal(at(1, [545, 600, 600, 645]), 61);
  });
  test("falls back to just after the page's last char", () => {
    assert.equal(at(1, [72, 100, 540, 200]), 120);
  });
  test("page without text uses the next page with text, or the text length", () => {
    assert.equal(at(2, [72, 100, 540, 200]), 122);
    assert.equal(at(4, [72, 100, 540, 200]), 151);
  });
});

describe("imgSnapToFacts (an image inside a fact goes before it)", () => {
  const groups = [{ start: 10, end: 50 }, { start: 60, end: 200 }]; // second is a merged multi-sentence group
  const snap = (a) => imgSnapToFacts([{ at: a }], groups)[0].at;
  test("inside, at either edge, and outside a fact", () => {
    assert.equal(snap(30), 10);
    assert.equal(snap(10), 10);
    assert.equal(snap(50), 10);
    assert.equal(snap(55), 55, "between facts: unchanged");
    assert.equal(snap(150), 60, "inside a later sentence of a merged group: start of the whole group");
    assert.equal(snap(201), 201);
    assert.equal(snap(0), 0);
  });
});
