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

test("finishing a chapter marks only that chapter seen", () => {
  const st = Tour.markSeen({}, "app", false);
  assert.deepEqual(st.tour, { app: true });
  assert.equal(Tour.seen(st, "reader"), false);
  Tour.markSeen(st, "reader", false);
  assert.deepEqual(st.tour, { app: true, reader: true });
});

test("skipping marks every chapter seen, so no more tour pops up", () => {
  const st = Tour.markSeen({}, "app", true);
  for (const ch of Tour.NAMES) assert.equal(Tour.seen(st, ch), true);
});

test("Help › Show Tour clears the flags (settings.tour = {}) and the chapters run again", () => {
  const st = Tour.markSeen({}, "app", true);
  st.tour = {};
  assert.equal(Tour.seen(st, "app"), false);
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
