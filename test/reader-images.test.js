"use strict";
// Pure helpers behind the reader's "With images" view (renderer/order.js):
// merging captured images into the extract stream, topic grouping and colour filtering.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ckey, imagesOf, filterImages, withImages, groupItems } = require("../renderer/order.js");

const YELLOW = [255, 219, 51];
const BLUE = [128, 191, 255];
const T1 = { at: 0, title: "Intro", level: 1, path: ["Intro"] };
const T2 = { at: 50, title: "Methods", level: 1, path: ["Methods"] };

const entry = (n, at, topic = null) => ({ n, at, page: 1, topic, spans: [{ id: n, color: YELLOW, text: "t" + n }] });
const image = (n, at, topic = null, color = BLUE) => ({ id: "img" + n, n, page: 1, rect: [0, 0, 100, 50], color, comment: "", at, topic });
const shape = list => list.map(it => (it.kind === "image" ? "i" + it.image.n : "e" + it.entry.n)).join(" ");

test("an image with the same `at` as a fact goes before it", () => {
  assert.equal(shape(withImages([entry(1, 10), entry(2, 20)], [image(1, 20)])), "e1 i1 e2");
  assert.equal(shape(withImages([entry(1, 10)], [image(1, 10)])), "i1 e1");
});

test("images fall between facts, before the first and after the last", () => {
  const es = [entry(1, 10), entry(2, 20), entry(3, 30)];
  assert.equal(shape(withImages(es, [image(1, 5), image(2, 15), image(3, 25), image(4, 99)])), "i1 e1 i2 e2 i3 e3 i4");
  assert.equal(shape(withImages(es, [image(1, 31)])), "e1 e2 e3 i1");
});

test("images are ordered by `at` even if given out of order; entries keep their order", () => {
  assert.equal(shape(withImages([entry(1, 10), entry(2, 40)], [image(2, 30), image(1, 20)])), "e1 i1 i2 e2");
});

test("no images → entries only, wrapped; no entries → images only", () => {
  const es = [entry(1, 10), entry(2, 20)];
  const out = withImages(es, []);
  assert.equal(shape(out), "e1 e2");
  assert.equal(out[0].entry, es[0], "entries are passed through, not copied");
  assert.equal(shape(withImages([], [image(2, 9), image(1, 3)])), "i1 i2");
  assert.deepEqual(withImages([], []), []);
  assert.deepEqual(withImages(undefined, undefined), []);
});

test("groupItems groups by topic like groupsOf, counting entries and images separately", () => {
  const es = [entry(1, 10, T1), entry(2, 60, T2), entry(3, 70, T2)];
  const gs = groupItems(withImages(es, [image(1, 55, T2), image(2, 80, T2)]));
  assert.equal(gs.length, 2);
  assert.equal(gs[0].topic, T1);
  assert.equal(shape(gs[0].items), "e1");
  assert.deepEqual([gs[0].entries, gs[0].images], [1, 0]);
  assert.equal(shape(gs[1].items), "i1 e2 e3 i2");
  assert.deepEqual([gs[1].entries, gs[1].images], [2, 2]);
});

test("a group can hold only images, and untitled items fall in a 'none' group", () => {
  const es = [entry(1, 10, null), entry(2, 90, T2)];
  const gs = groupItems(withImages(es, [image(1, 40, T1), image(2, 45, T1)]));
  assert.deepEqual(gs.map(g => g.key), ["none", "0|Intro", "50|Methods"]);
  assert.equal(gs[0].topic, null);
  assert.equal(shape(gs[1].items), "i1 i2");
  assert.deepEqual([gs[1].entries, gs[1].images], [0, 2]);
});

test("without images, groupItems has the same groups and items as groupsOf would", () => {
  const es = [entry(1, 10), entry(2, 20, T1), entry(3, 30, T1), entry(4, 60, T2), entry(5, 70, T1)];
  const gs = groupItems(withImages(es, []));
  assert.deepEqual(gs.map(g => g.key), ["none", "0|Intro", "50|Methods", "0|Intro"]);
  assert.deepEqual(gs.map(g => g.items.map(it => it.entry)), [[es[0]], [es[1], es[2]], [es[3]], [es[4]]]);
  assert.ok(gs.every(g => g.images === 0));
});

test("filterImages hides images whose colour key is off", () => {
  const imgs = [image(1, 1, null, YELLOW), image(2, 2, null, BLUE), image(3, 3, null, [253, 222, 55])];
  assert.equal(filterImages(imgs, new Set()).length, 3);
  assert.equal(filterImages(imgs, undefined).length, 3);
  // near-identical yellows share a key, like extracts do
  assert.deepEqual(filterImages(imgs, new Set([ckey(YELLOW)])).map(i => i.n), [2]);
  assert.deepEqual(filterImages(imgs, new Set([ckey(BLUE)])).map(i => i.n), [1, 3]);
  assert.deepEqual(filterImages(null, new Set()), []);
});

test("ckey matches the reader's colour buckets", () => {
  assert.equal(ckey([255, 219, 51]), "264,216,48");
  assert.equal(ckey([0, 0, 0]), "0,0,0");
});

test("imagesOf treats results from older scans as having no images", () => {
  assert.deepEqual(imagesOf({ entries: [] }), []);
  assert.deepEqual(imagesOf(null), []);
  const imgs = [image(1, 1)];
  assert.equal(imagesOf({ images: imgs }), imgs);
});
