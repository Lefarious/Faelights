"use strict";
// core/library.js: the data folder, atomic saves under a lock file (also across processes), read-modify-write,
// tags/stars/libraries, and stored PDF copies. Every test uses its own temp folder, never the real library.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { repoPath } = require("../helpers/pdf");
const L = require("../../core/library.js");

const tmps = [];
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "faelights-lib-")); tmps.push(d); return d; };
after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const doc = (id, extra = {}) => ({ id, libraryId: "inbox", title: id, tags: [], starred: false, ...extra });

test("userDataDir matches Electron's userData folder on each platform", () => {
  assert.equal(L.userDataDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32", "C:\\Users\\a"), "C:\\Users\\a\\AppData\\Roaming\\Faelights");
  assert.equal(L.userDataDir({}, "darwin", "/Users/a"), "/Users/a/Library/Application Support/Faelights");
  assert.equal(L.userDataDir({}, "linux", "/home/a"), "/home/a/.config/Faelights");
  assert.equal(L.userDataDir({ XDG_CONFIG_HOME: "/xdg" }, "linux", "/home/a"), "/xdg/Faelights");
});

test("FAELIGHTS_DATA_DIR overrides it, and at() uses it by default", () => {
  const dir = tmpDir();
  assert.equal(L.userDataDir({ FAELIGHTS_DATA_DIR: dir, APPDATA: "C:\\x" }, "win32"), path.resolve(dir));
  const old = process.env.FAELIGHTS_DATA_DIR;
  process.env.FAELIGHTS_DATA_DIR = dir;
  try { assert.equal(L.at().paths.db, path.join(dir, "library", "faelights.json")); }
  finally { if (old === undefined) delete process.env.FAELIGHTS_DATA_DIR; else process.env.FAELIGHTS_DATA_DIR = old; }
});

test("a missing library loads as an empty one with the Inbox", async () => {
  const db = await L.at(tmpDir()).loadDb();
  assert.deepEqual(db.libraries.map(l => [l.id, l.system]), [["inbox", true]]);
  assert.deepEqual(db.docs, []);
  assert.deepEqual(db.settings, { mode: "full", fmt: "md", sort: "added" });
});

test("save is atomic: the file is replaced whole, no temp or lock file is left", async () => {
  const s = L.at(tmpDir());
  const db = await s.loadDb(); db.docs.push(doc("d1"));
  await s.saveDb(db);
  assert.deepEqual(JSON.parse(fs.readFileSync(s.paths.db, "utf8")).docs.map(d => d.id), ["d1"]);
  assert.deepEqual(fs.readdirSync(s.paths.dir), ["faelights.json"]);
  // older files get the Inbox and default settings back on load
  fs.writeFileSync(s.paths.db, JSON.stringify({ libraries: [], settings: { fmt: "plain" } }));
  const again = await s.loadDb();
  assert.equal(again.libraries[0].id, "inbox");
  assert.deepEqual(again.settings, { mode: "full", fmt: "plain", sort: "added" });
  assert.deepEqual(again.docs, []);
});

test("a save waits while another process holds the lock", async () => {
  const s = L.at(tmpDir());
  fs.mkdirSync(s.paths.dir, { recursive: true });
  fs.writeFileSync(s.paths.lock, JSON.stringify({ pid: 1 }));
  let done = false;
  const p = s.saveDb({ ...L.EMPTY_DB(), docs: [doc("x")] }).then(() => { done = true; });
  await sleep(150);
  assert.equal(done, false);
  assert.equal(fs.existsSync(s.paths.db), false);
  fs.unlinkSync(s.paths.lock);
  await p;
  assert.equal(JSON.parse(fs.readFileSync(s.paths.db, "utf8")).docs[0].id, "x");
});

test("a stale lock left by a crashed process is cleared", async () => {
  const s = L.at(tmpDir());
  fs.mkdirSync(s.paths.dir, { recursive: true });
  fs.writeFileSync(s.paths.lock, "{}");
  const old = (Date.now() - 120000) / 1000;
  fs.utimesSync(s.paths.lock, old, old);
  await s.saveDb(L.EMPTY_DB());
  assert.ok(fs.existsSync(s.paths.db));
  assert.equal(fs.existsSync(s.paths.lock), false);
});

test("update() is read-modify-write; concurrent updates in one process all land", async () => {
  const s = L.at(tmpDir());
  await s.saveDb({ ...L.EMPTY_DB(), docs: [doc("d1")] });
  await Promise.all(Array.from({ length: 10 }, (_, i) => s.update(db => { L.addTag(L.findDoc(db, "d1"), "t" + i); })));
  const tags = (await s.loadDb()).docs[0].tags;
  assert.equal(tags.length, 10);
  assert.equal(await s.update(db => db.docs.length), 1);
});

test("updates from two processes at once don't lose writes", async () => {
  const dir = tmpDir(), s = L.at(dir);
  await s.saveDb({ ...L.EMPTY_DB(), docs: [doc("d1")] });
  const script = `const L = require(${JSON.stringify(repoPath("core", "library.js"))});
    (async () => { const s = L.at(); for (let i = 0; i < 15; i++) await s.update(db => { db.docs[0].tags.push(process.argv[1] + i); }); })()
      .catch(e => { console.error(e); process.exit(1); });`;
  const run = who => new Promise((res, rej) => execFile(process.execPath, ["-e", script, who],
    { env: { ...process.env, FAELIGHTS_DATA_DIR: dir } }, err => err ? rej(err) : res()));
  await Promise.all([run("a"), run("b")]);
  const tags = (await s.loadDb()).docs[0].tags;
  assert.equal(tags.length, 30);
  assert.equal(new Set(tags).size, 30);
});

test("update() refuses to overwrite an unreadable library and keeps a copy of it", async () => {
  const s = L.at(tmpDir());
  fs.mkdirSync(s.paths.dir, { recursive: true });
  fs.writeFileSync(s.paths.db, "{ not json");
  await assert.rejects(s.update(() => {}));
  assert.equal(fs.readFileSync(s.paths.db, "utf8"), "{ not json");
  assert.ok(fs.readdirSync(s.paths.dir).some(f => f.startsWith("faelights.json.broken-")));
  assert.deepEqual((await s.loadDb()).docs, []);      // the app starts empty instead
});

test("tags: trimmed, leading # dropped, no duplicates; counted across docs", () => {
  const db = { ...L.EMPTY_DB(), docs: [doc("a"), doc("b")] };
  const a = db.docs[0];
  assert.equal(L.addTag(a, "  #biology "), "biology");
  assert.equal(L.addTag(a, "biology"), "");
  assert.equal(L.addTag(a, "  "), "");
  L.addTag(a, "light"); L.addTag(db.docs[1], "light");
  assert.deepEqual(a.tags, ["biology", "light"]);
  assert.deepEqual([...L.tagCounts(db)], [["biology", 1], ["light", 2]]);
  assert.equal(L.removeTag(a, "biology"), true);
  assert.equal(L.removeTag(a, "biology"), false);
  assert.deepEqual(a.tags, ["light"]);
});

test("stars toggle or set", () => {
  const d = doc("a");
  assert.equal(L.setStar(d), true);
  assert.equal(L.setStar(d), false);
  assert.equal(L.setStar(d, true), true);
  assert.equal(L.setStar(d, true), true);
});

test("libraries: add, rename, move, remove (PDFs go back to the Inbox; the Inbox stays)", () => {
  const db = { ...L.EMPTY_DB(), docs: [doc("a"), doc("b")] };
  const l = L.addLibrary(db);
  assert.equal(l.name, "New library");
  assert.ok(L.findLibrary(db, l.id));
  L.renameLibrary(db, l.id, "Thesis");
  assert.equal(L.findLibrary(db, l.id).name, "Thesis");
  assert.equal(L.moveDoc(db.docs[0], l.id), true);
  assert.equal(L.moveDoc(db.docs[0], l.id), false);
  assert.deepEqual(L.docsIn(db, l.id).map(d => d.id), ["a"]);
  assert.equal(L.removeLibrary(db, "inbox"), false);
  assert.equal(L.removeLibrary(db, l.id), true);
  assert.deepEqual(db.libraries.map(x => x.id), ["inbox"]);
  assert.deepEqual(db.docs.map(d => d.libraryId), ["inbox", "inbox"]);
});

test("stored PDF copies: import, read freshest, write only inside files/, remove", async () => {
  const s = L.at(tmpDir()), src = path.join(tmpDir(), "paper.pdf");
  fs.copyFileSync(repoPath("renderer", "sample.pdf"), src);
  const info = await s.importPdf(src);
  assert.equal(path.dirname(info.storedPath), s.paths.files);
  assert.equal(info.fileName, "paper.pdf");
  assert.match(info.hash, /^[0-9a-f]{40}$/);
  assert.deepEqual(fs.readFileSync(info.storedPath), fs.readFileSync(src));
  assert.ok(s.isStored(info.storedPath) && !s.isStored(src));

  const d = { ...info, scannedMtime: info.mtime };
  assert.equal((await s.readPdf(d)).from, "source");
  assert.equal((await s.readPdf({ ...d, annotated: true })).from, "copy");
  assert.equal((await s.readPdf({ ...d, sourcePath: path.join(path.dirname(src), "gone.pdf") })).from, "copy");
  assert.equal(s.pdfPath(d), src);

  assert.equal(await s.writeStored(src, new Uint8Array([1])), false);       // never the user's original
  assert.equal(await s.writeStored(info.storedPath, new Uint8Array([1, 2, 3])), true);
  assert.deepEqual([...fs.readFileSync(info.storedPath)], [1, 2, 3]);
  assert.deepEqual(fs.readdirSync(s.paths.files), [path.basename(info.storedPath)]);

  await s.removeStored(src);
  assert.ok(fs.existsSync(src));
  await s.removeStored(info.storedPath);
  assert.equal(fs.existsSync(info.storedPath), false);
});

test("checkSources flags missing and changed originals", async () => {
  const s = L.at(tmpDir()), src = path.join(tmpDir(), "p.pdf");
  fs.writeFileSync(src, "x");
  const mtime = fs.statSync(src).mtimeMs;
  const db = { docs: [{ sourcePath: src, scannedMtime: mtime }, { sourcePath: src, scannedMtime: mtime - 5000 },
    { sourcePath: src, scannedMtime: mtime - 5000, annotated: true }, { sourcePath: src + ".gone" }, { sourcePath: null }] };
  await s.checkSources(db);
  assert.deepEqual(db.docs.map(d => [d.stale, d.sourceMissing]), [[false, false], [true, false], [false, false], [false, true], [false, false]]);
});
