"use strict";
// Search scopes (renderer/app.js searchDocs / validScope / entryScope): which PDFs "All libraries",
// "This PDF" and a library cover, and the fall back to all when a scope's target is gone.
// app.js is a browser script, so its pure helpers are lifted out of its source.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Library = require("../core/library.js");

const src = fs.readFileSync(path.join(__dirname, "../renderer/app.js"), "utf8").replace(/\r\n/g, "\n");
const lift = name => {
  const m = src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n}\\n`));
  assert.ok(m, "missing " + name);
  return new Function(`${m[0]}; return ${name};`)();
};
const searchDocs = lift("searchDocs"), validScope = lift("validScope"), entryScope = lift("entryScope");

const entry = (n, text) => ({ n, page: 1, sentence: text, spans: [{ text, comment: "" }] });
const db = {
  libraries: [{ id: "inbox", name: "Inbox" }, { id: "l1", name: "Thesis" }],
  docs: [
    { id: "a", libraryId: "inbox", result: { entries: [entry(0, "the mitochondria is the powerhouse")] } },
    { id: "b", libraryId: "l1", result: { entries: [entry(0, "mitochondria divide by fission")] } },
    { id: "c", libraryId: "l1", result: { entries: [entry(0, "ribosomes make protein")] } },
    { id: "d", libraryId: "l1" }   // not scanned yet
  ]
};
const ids = docs => docs.map(d => d.id);
const hits = (scope, docId, q) => searchDocs(db, scope, docId).filter(d => d.result.entries.some(e => Library.entryMatches(e, [q]))).map(d => d.id);

test("all covers every scanned PDF; a library only its own", () => {
  assert.deepEqual(ids(searchDocs(db, "all", null)), ["a", "b", "c"]);
  assert.deepEqual(ids(searchDocs(db, "l1", null)), ["b", "c"]);
  assert.deepEqual(ids(searchDocs(db, "inbox", "b")), ["a"]);
});

test("This PDF covers just the PDF open when search began", () => {
  assert.deepEqual(ids(searchDocs(db, "doc", "b")), ["b"]);
  assert.deepEqual(ids(searchDocs(db, "doc", "d")), []);   // unscanned: nothing to search
});

test("a word in two PDFs matches only the open one under This PDF", () => {
  assert.deepEqual(hits("all", "a", "mitochondria"), ["a", "b"]);
  assert.deepEqual(hits("doc", "a", "mitochondria"), ["a"]);
  assert.deepEqual(hits("l1", "a", "mitochondria"), ["b"]);
});

test("a scope whose PDF or library is gone falls back to all", () => {
  assert.equal(validScope(db, "all", null), "all");
  assert.equal(validScope(db, "doc", "b"), "doc");
  assert.equal(validScope(db, "doc", "zz"), "all");
  assert.equal(validScope(db, "doc", null), "all");
  assert.equal(validScope(db, "l1", null), "l1");
  assert.equal(validScope(db, "gone", null), "all");
});

test("entering search from a library view scopes to it until the user picks a scope", () => {
  const thesis = { kind: "library", id: "l1" };
  assert.equal(entryScope(thesis, undefined, false), "l1");
  assert.equal(entryScope(thesis, undefined, true), null);            // keep the scope they picked
  assert.equal(entryScope(thesis, "doc", false), "doc");              // Ctrl+F with a PDF open
  assert.equal(entryScope({ kind: "starred" }, undefined, false), null);
  assert.equal(entryScope({ kind: "all" }, "inbox", true), "inbox");  // "Search this library"
});

test("Search this library shows only its PDFs' hits", () => {
  const sc = entryScope({ kind: "all" }, "l1", true);
  assert.deepEqual(hits(sc, null, "mitochondria"), ["b"]);
  assert.deepEqual(hits(sc, null, "protein"), ["c"]);
  assert.deepEqual(hits("inbox", null, "protein"), []);
});
