"use strict";
// Shelves in the app's "Move to" menus (renderer/app.js moveItems / moveTarget): each library, and one with shelves
// opens a submenu of "No shelf" plus its shelves. app.js is a browser script, so its pure helpers are lifted out of its source.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Library = require("../core/library.js");

const src = fs.readFileSync(path.join(__dirname, "../renderer/app.js"), "utf8").replace(/\r\n/g, "\n");
const lift = name => {
  const m = src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n}\\n`));
  assert.ok(m, "missing " + name);
  return new Function("Library", `${m[0]}; return ${name};`)(Library);
};
const moveItems = lift("moveItems"), moveTarget = lift("moveTarget");

function fixture() {
  const db = Library.normalize({ libraries: [], docs: [{ id: "a", libraryId: "inbox", tags: [] }] });
  const l = Library.addLibrary(db, "Thesis");
  const s1 = Library.addShelf(db, l.id, "Methods"), s2 = Library.addShelf(db, l.id, "Background");
  return { db, l, s1, s2, d: db.docs[0] };
}

test("Move to: a library without shelves is one item; one with shelves opens No shelf + its shelves", () => {
  const { db, l, s1, s2, d } = fixture();
  Library.moveToShelf(db, d, s2.id);
  const items = moveItems(db, (lib, sh) => d.libraryId === lib && (d.shelfId || null) === sh);
  assert.deepEqual(items[0], { id: "move:inbox", label: "Inbox", checked: false });
  assert.equal(items[1].label, "Thesis");
  assert.deepEqual(items[1].submenu.map(x => [x.type || x.id, x.label, x.checked]),
    [["move:" + l.id, "No shelf", false], ["separator", undefined, undefined], ["shelf:" + s1.id, "Methods", false], ["shelf:" + s2.id, "Background", true]]);
});

test("moveTarget turns a menu id into [library, shelf]; anything else is no move", () => {
  const { db, l, s1 } = fixture();
  assert.deepEqual(moveTarget(db, "move:" + l.id), [l.id, null]);
  assert.deepEqual(moveTarget(db, "shelf:" + s1.id), [l.id, s1.id]);
  assert.equal(moveTarget(db, "shelf:gone"), null);
  assert.equal(moveTarget(db, "star"), null);
});

test("the app's shelf view keeps only the shelf's PDFs; the library view keeps them all", () => {
  // the same filter visibleDocs() applies for {kind: "library", id, shelf}
  const src2 = src.match(/if \(v\.kind === "library"\) docs = docs\.filter\((d => [^;]+)\);/);
  assert.ok(src2, "visibleDocs library filter");
  const { db, l, s1 } = fixture();
  const b = { id: "b", libraryId: l.id, tags: [], shelfId: null }, c = { id: "c", libraryId: l.id, tags: [], shelfId: null };
  db.docs.push(b, c);
  Library.moveToShelf(db, b, s1.id);
  const keep = v => db.docs.filter(new Function("v", `return ${src2[1]};`)(v)).map(d => d.id);
  assert.deepEqual(keep({ kind: "library", id: l.id }), ["b", "c"]);
  assert.deepEqual(keep({ kind: "library", id: l.id, shelf: s1.id }), ["b"]);
});
