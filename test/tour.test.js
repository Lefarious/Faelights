"use strict";
// Guided tour (renderer/tour.js): which chapters still need showing, how steps with
// missing targets are skipped, and that every hook the steps point at still exists.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Tour = require("../renderer/tour.js");

const steps = [{ title: "intro" }, { sel: ".a", title: "a" }, { sel: ".b", title: "b" }, { sel: ".c", title: "c" }];
const only = (...present) => sel => present.includes(sel);

test("a fresh install has seen no chapter; older DBs without settings.tour count as unseen", () => {
  for (const ch of Tour.NAMES) assert.equal(Tour.seen({}, ch), false);
  assert.equal(Tour.seen({ mode: "full" }, "app"), false);
  assert.equal(Tour.seen(undefined, "app"), false);
});

const ids = steps => steps.map(s => s.id);

test("a step counts as seen once shown; the rest of its chapter stays pending", () => {
  const st = {};
  const [first, second] = Tour.CHAPTERS.app;
  Tour.markShown(st, "app", first);
  Tour.markShown(st, "app", first);   // no duplicates
  assert.deepEqual(st.tour, { app: [first.id] });
  assert.deepEqual(ids(Tour.pending(st, "app")), ids(Tour.CHAPTERS.app.slice(1)));
  Tour.markShown(st, "app", second);
  assert.equal(Tour.pending(st, "app").length, Tour.CHAPTERS.app.length - 2);
  assert.equal(Tour.seen(st, "reader"), false);
});

test("a PDF with no extracts: extract tips are skipped, then show once highlights appear", () => {
  const st = {};
  const onScreenNoExtracts = sel => !/\.ex|\.chips|\.toc|\.img-btn/.test(sel);
  // first reader run: only the steps whose buttons are there get shown
  for (const s of Tour.CHAPTERS.reader) if (onScreenNoExtracts(s.sel)) Tour.markShown(st, "reader", s);
  const left = Tour.pending(st, "reader");
  assert.deepEqual(ids(left), ["with-images", "colour-filter", "topics", "an-extract", "copy-one-extract"]);
  assert.equal(Tour.ready(left, onScreenNoExtracts), false);   // nothing new on screen → no tour
  // after highlighting, the extracts (and colour chips, topics) appear → a follow-up with just those
  const withExtracts = sel => !/\.img-btn/.test(sel);
  assert.equal(Tour.ready(left, withExtracts), true);
  for (const s of left) if (withExtracts(s.sel)) Tour.markShown(st, "reader", s);
  assert.deepEqual(ids(Tour.pending(st, "reader")), ["with-images"]);
});

test("a chapter never opens on centred cards alone", () => {
  assert.equal(Tour.ready([{ title: "x", id: "x" }], () => true), false);
});

test("skipping marks every chapter seen, so no more tour pops up", () => {
  const st = Tour.skipAll({ tour: { app: ["welcome-to-faelights"] } });
  for (const ch of Tour.NAMES) { assert.equal(Tour.seen(st, ch), true); assert.deepEqual(Tour.pending(st, ch), []); }
  Tour.markShown(st, "reader", Tour.CHAPTERS.reader[0]);
  assert.equal(st.tour.reader, true);
});

test("Help › Show Tour clears the flags (settings.tour = {}) and the chapters run again", () => {
  const st = Tour.skipAll({});
  st.tour = {};
  assert.equal(Tour.pending(st, "app").length, Tour.CHAPTERS.app.length);
});

test("step ids are unique within a chapter", () => {
  for (const ch of Tour.NAMES) { const xs = ids(Tour.CHAPTERS[ch]); assert.equal(new Set(xs).size, xs.length, ch); }
});

test("nextIndex skips steps whose target isn't on screen; centred steps always show", () => {
  assert.equal(Tour.nextIndex(steps, -1, 1, only()), 0);
  assert.equal(Tour.nextIndex(steps, 0, 1, only(".c")), 3);
  assert.equal(Tour.nextIndex(steps, 0, 1, only()), -1);
  assert.equal(Tour.nextIndex(steps, 3, -1, only(".a")), 1);
  assert.equal(Tour.nextIndex(steps, 1, -1, only(".a")), 0);
});

test("progress counts only the steps that will show", () => {
  assert.deepEqual(Tour.progress(steps, 3, only(".c")), { n: 2, total: 2 });
  assert.deepEqual(Tour.progress(steps, 1, only(".a", ".b", ".c")), { n: 2, total: 4 });
});

test("every chapter has steps with a title and body", () => {
  assert.deepEqual(Tour.NAMES, ["app", "reader", "viewer"]);
  for (const ch of Tour.NAMES) {
    assert.ok(Tour.CHAPTERS[ch].length >= 3, ch);
    for (const s of Tour.CHAPTERS[ch]) { assert.ok(s.title, ch); assert.ok(s.body && s.body.length > 20, ch + ": " + s.title); }
  }
});

test("every [data-tour=…] hook the steps use is set somewhere in the renderer", () => {
  const src = ["app.js", "annotator.js"].map(f => fs.readFileSync(path.join(__dirname, "../renderer", f), "utf8")).join("\n");
  const hooks = new Set();
  for (const ch of Tour.NAMES) for (const s of Tour.CHAPTERS[ch]) for (const m of (s.sel || "").matchAll(/\[data-tour=([\w-]+)\]/g)) hooks.add(m[1]);
  assert.ok(hooks.size > 5);
  for (const h of hooks) assert.match(src, new RegExp(`(dataset\\.tour = "${h}"|tour: "${h}")`), "missing hook " + h);
});

test("class and id targets exist in the renderer source", () => {
  const src = ["app.js", "annotator.js"].map(f => fs.readFileSync(path.join(__dirname, "../renderer", f), "utf8")).join("\n");
  const names = new Set();
  for (const ch of Tour.NAMES) for (const s of Tour.CHAPTERS[ch]) for (const m of (s.sel || "").matchAll(/[.#]([a-z][\w-]*)/g)) names.add(m[1]);
  for (const n of names) assert.ok(src.includes(`"${n}"`) || src.includes(` ${n}"`) || src.includes(`"${n} `), "missing class/id " + n);
});
