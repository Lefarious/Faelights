"use strict";
// core/meta.js title rule (T-035): typed > source (resolver) > the PDF's own > CrossRef / arXiv record > current > file name.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Meta = require("../../core/meta.js");

test("pickTitle: the source's title beats the PDF's embedded one", () => {
  assert.equal(Meta.pickTitle({ source: "Real Paper Title", embedded: "OP-NARE120883 36..42", fileName: "x.pdf" }), "Real Paper Title");
  assert.equal(Meta.pickTitle({ source: "  Spaced \n  out\ttitle ", embedded: "Embedded" }), "Spaced out title");
});

test("pickTitle: a title the user typed always wins", () => {
  assert.equal(Meta.pickTitle({ edited: " My name ", source: "Source", embedded: "Embedded", fileName: "f.pdf" }), "My name");
  assert.equal(Meta.pickTitle({ edited: "AI", source: "Source" }), "AI", "typed titles are not run through cleanTitle");
  assert.equal(Meta.pickTitle({ edited: false, source: "Source" }), "Source");
  assert.equal(Meta.pickTitle({ edited: "   ", source: "Source" }), "Source");
});

test("pickTitle: no source → embedded → record → current → file name", () => {
  assert.equal(Meta.pickTitle({ embedded: "Embedded", found: "Record", fileName: "f.pdf" }), "Embedded");
  assert.equal(Meta.pickTitle({ source: null, embedded: "Untitled", found: "Record", fileName: "f.pdf" }), "Record");
  assert.equal(Meta.pickTitle({ embedded: "", current: "Kept", fileName: "f.pdf" }), "Kept");
  assert.equal(Meta.pickTitle({ embedded: "Microsoft Word - ab", fileName: "paper.PDF" }), "paper");
  assert.equal(Meta.pickTitle({}), "");
  assert.equal(Meta.pickTitle(), "");
});

test("pickTitle: junk source titles are ignored", () => {
  for (const source of ["", "  ", "ab", "Untitled", "ab.pdf", null, undefined, 42])
    assert.equal(Meta.pickTitle({ source, embedded: "Embedded" }), "Embedded", String(source));
});

test("docTitle: a rescan keeps the source title and a typed one", () => {
  const d = { title: "", fileName: "pmc.pdf", sourceTitle: "Real Paper Title", meta: { title: "OP-NARE120883 36..42" } };
  d.title = Meta.docTitle(d);
  assert.equal(d.title, "Real Paper Title");
  d.meta = { title: "Another embedded title" };                     // rescanned
  assert.equal(Meta.docTitle(d), "Real Paper Title");
  Object.assign(d, { title: "Mine", titleEdited: true });
  assert.equal(Meta.docTitle(d), "Mine");
});

test("docTitle: without a source title nothing changes (embedded, then the record's, then what it has)", () => {
  assert.equal(Meta.docTitle({ title: "", fileName: "a.pdf", meta: { title: "Embedded" } }), "Embedded");
  assert.equal(Meta.docTitle({ title: "", fileName: "a.pdf", meta: {} }), "a");
  assert.equal(Meta.docTitle({ title: "a", fileName: "a.pdf", meta: {}, lookup: { meta: { title: "From CrossRef" } } }), "From CrossRef");
  assert.equal(Meta.docTitle({ title: "Embedded", fileName: "a.pdf", meta: { title: "Embedded" }, lookup: { meta: { title: "From CrossRef" } } }), "Embedded");
  assert.equal(Meta.docTitle({ title: "Old landing title", fileName: "a.pdf" }), "Old landing title", "docs added before T-035 keep theirs");
});
