"use strict";
// Multi-select in the PDF list (renderer/select.js, T-021): ranges, Ctrl/Shift clicks and pruning.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Select = require("../renderer/select.js");

const ids = ["a", "b", "c", "d", "e"];
const st = (sel = [], anchor = null) => ({ sel: new Set(sel), anchor });
const ids_ = r => [...r.sel];

test("range: inclusive, in list order, either direction", () => {
  assert.deepEqual(Select.range(ids, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(Select.range(ids, "d", "b"), ["b", "c", "d"]);
  assert.deepEqual(Select.range(ids, "c", "c"), ["c"]);
  assert.deepEqual(Select.range(ids, "zz", "c"), ["c"], "an anchor that's gone → just the target");
  assert.deepEqual(Select.range(ids, "a", "zz"), [], "a target not in the list → nothing");
});

test("plain click opens the PDF and drops the selection", () => {
  const r = Select.click(st(["a", "b"], "a"), ids, "c", {}, "a");
  assert.equal(r.open, true); assert.equal(r.sel.size, 0); assert.equal(r.anchor, "c");
});

test("Ctrl-click starts from the reader's PDF and toggles", () => {
  let r = Select.click(st(), ids, "c", { toggle: true }, "a");
  assert.equal(r.open, false); assert.deepEqual(ids_(r), ["a", "c"]); assert.equal(r.anchor, "c");
  r = Select.click(r, ids, "a", { toggle: true }, "a");
  assert.deepEqual(ids_(r), ["c"], "Ctrl-click a selected PDF takes it out");
  r = Select.click(st(), ids, "c", { toggle: true }, "gone");
  assert.deepEqual(ids_(r), ["c"], "a reader PDF that isn't listed isn't added");
});

test("Shift-click selects the range from the last clicked PDF", () => {
  // click b (opens it), Shift-click d
  const r0 = Select.click(st(), ids, "b", {}, "a");
  const r = Select.click({ sel: r0.sel, anchor: r0.anchor }, ids, "d", { range: true }, "b");
  assert.deepEqual(ids_(r), ["b", "c", "d"]); assert.equal(r.anchor, "b"); assert.equal(r.open, false);
  // a second Shift-click re-ranges from the same anchor
  assert.deepEqual(ids_(Select.click(r, ids, "a", { range: true }, "b")), ["a", "b"]);
});

test("Shift-click with no anchor ranges from the reader's PDF; Ctrl+Shift adds the range", () => {
  assert.deepEqual(ids_(Select.click(st(), ids, "c", { range: true }, "a")), ["a", "b", "c"]);
  assert.deepEqual(ids_(Select.click(st(), ids, "c", { range: true }, null)), ["c"]);
  const r = Select.click(st(["e"], "a"), ids, "b", { range: true, toggle: true }, "e");
  assert.deepEqual(ids_(r).sort(), ["a", "b", "e"]);
});

test("prune drops ids that are no longer visible, keeps the Set when nothing changed", () => {
  const s = new Set(["a", "c"]);
  assert.equal(Select.prune(s, ids), s);
  assert.deepEqual([...Select.prune(s, ["c", "d"])], ["c"]);
  assert.equal(Select.prune(s, []).size, 0);
});

test("index.html loads select.js before app.js", () => {
  const html = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
  const i = html.indexOf('src="select.js"'), j = html.indexOf('src="app.js"');
  assert.ok(i > 0 && i < j);
});
