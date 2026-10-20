"use strict";
// cli/faelights.js run as a child process, the way a user runs it: extract formats, and add / list / export on a
// throwaway library folder (--data-dir), never the real one. Also core/meta.js, which the CLI and the app share.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { repoPath, withPdf } = require("./helpers/pdf");
const Extract = require("../core/extract.js");
const ExportFmt = require("../core/export.js");
const Meta = require("../core/meta.js");

const CLI = repoPath("cli", "faelights.js");
const SAMPLE = repoPath("renderer", "sample.pdf");
const IMAGES = repoPath("test", "fixtures", "images.pdf");
let dir;
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const ok = (...args) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const lib = (...args) => ok("--data-dir", dir, ...args);

before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "faelights-cli-")); });
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("extract prints the same Markdown as the app's exporter", async () => {
  const result = await Extract.extractPdf(SAMPLE);
  const want = ExportFmt.docText({ title: "Notes on Bioluminescence", result, tags: [] }, { fmt: "md", mode: "full" });
  assert.equal(ok("extract", SAMPLE), want);
});

test("extract --format json gives one row per highlight", async () => {
  const out = JSON.parse(ok("extract", SAMPLE, "-f", "json"));
  assert.equal(out.title, "Notes on Bioluminescence");
  assert.deepEqual(out.highlights, Extract.highlights(await Extract.extractPdf(SAMPLE)));
});

test("extract writes html and obsidian, and --out writes a file", () => {
  assert.match(ok("extract", SAMPLE, "-f", "html"), /^<!doctype html>/);
  assert.match(ok("extract", SAMPLE, "-f", "obsidian"), /==joins a molecule called luciferin with oxygen==/);
  assert.match(ok("extract", SAMPLE, "-m", "only"), /^- joins a molecule called luciferin with oxygen \(p\. 1\)$/m);
  const out = path.join(dir, "notes.txt");
  ok("extract", SAMPLE, "-f", "plain", "-o", out);
  assert.match(fs.readFileSync(out, "utf8"), /^Notes on Bioluminescence\n/);
});

test("bad input exits 2 with a message; a missing file exits 1", () => {
  for (const args of [["frob"], ["extract", SAMPLE, "-f", "docx"], ["extract", SAMPLE, "--nope"], ["extract"]]) {
    const r = run(...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.ok(r.stderr.trim(), args.join(" "));
  }
  assert.equal(run("extract", path.join(dir, "missing.pdf")).status, 1);
  assert.match(ok("--help"), /^Faelights .+\n\nUsage: faelights <command>/);
});

test("add, list, libraries and export work on a library folder", () => {
  assert.match(lib("list"), /No PDFs yet/);
  const added = JSON.parse(lib("add", SAMPLE, IMAGES, "--json"));
  assert.deepEqual(added.map(r => [r.action, r.title, r.highlights, r.library]),
    [["added", "Notes on Bioluminescence", 8, "Inbox"], ["added", "images", 4, "Inbox"]]);

  const db = JSON.parse(fs.readFileSync(path.join(dir, "library", "faelights.json"), "utf8"));
  const d = db.docs[0];
  assert.equal(d.libraryId, "inbox");
  assert.equal(d.sourcePath, SAMPLE);
  assert.ok(fs.existsSync(d.storedPath));
  assert.equal(d.result.v, Extract.ANALYZER_VERSION);
  assert.ok(d.colours.length && d.meta);

  assert.deepEqual(JSON.parse(lib("libraries", "--json")), [{ id: "inbox", name: "Inbox", pdfs: 2 }]);
  assert.deepEqual(JSON.parse(lib("list", "Inbox", "--json")).map(r => r.title), ["Notes on Bioluminescence", "images"]);
  assert.equal(lib("export", "biolum"), ok("extract", SAMPLE));
  assert.match(lib("export", d.id, "-f", "md", "--frontmatter"), /^---\ntitle: "Notes on Bioluminescence"\n[\s\S]*library: "Inbox"/);
});

test("adding the same file again rescans it instead of adding a copy", () => {
  const again = JSON.parse(lib("add", SAMPLE, "--json"));
  assert.equal(again[0].action, "rescanned");
  assert.equal(JSON.parse(lib("list", "--json")).length, 2);
});

test("unknown libraries and ambiguous or unknown PDFs fail with a message", () => {
  const r = spawnSync(process.execPath, [CLI, "--data-dir", dir, "add", SAMPLE, "-l", "Nope"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No library called "Nope"\. Libraries: Inbox\./);
  const none = spawnSync(process.execPath, [CLI, "--data-dir", dir, "export", "zzz"], { encoding: "utf8" });
  assert.match(none.stderr, /No PDF in your library matches "zzz"/);
  const many = spawnSync(process.execPath, [CLI, "--data-dir", dir, "export", "i"], { encoding: "utf8" });
  assert.match(many.stderr, /matches 2 PDFs/);
});

test("libraries: new, rename, delete (PDFs go to the Inbox); the Inbox stays", () => {
  assert.match(lib("library", "new", "Thesis"), /^Created library Thesis/);
  assert.match(run("--data-dir", dir, "library", "new", "thesis").stderr, /already a library called "thesis"/);
  lib("move", "biolum", "thesis");
  assert.match(lib("move", "biolum", "Thesis"), /already in Thesis/);
  assert.match(lib("library", "rename", "Thesis", "PhD"), /Renamed Thesis → PhD/);
  assert.deepEqual(JSON.parse(lib("list", "PhD", "--json")).map(r => r.title), ["Notes on Bioluminescence"]);
  assert.match(lib("library", "delete", "PhD"), /1 PDF moved to the Inbox/);
  assert.deepEqual(JSON.parse(lib("libraries", "--json")).map(l => [l.name, l.pdfs]), [["Inbox", 2]]);
  assert.equal(run("--data-dir", dir, "library", "delete", "inbox").status, 1);
});

test("tags and stars, and filtering the list by them", () => {
  assert.match(lib("tag", "biolum", "#light", "essay", "light"), /#light #essay$/m);
  assert.match(lib("untag", "biolum", "essay"), /: #light$/m);
  lib("tag", "images", "light", "moths");
  assert.deepEqual(JSON.parse(lib("tags", "--json")), [{ tag: "light", pdfs: 2 }, { tag: "moths", pdfs: 1 }]);
  lib("star", "images");
  assert.match(lib("star", "images"), /no change/);
  assert.deepEqual(JSON.parse(lib("list", "--starred", "--json")).map(r => r.title), ["images"]);
  assert.deepEqual(JSON.parse(lib("list", "-t", "light", "-t", "moths", "--json")).map(r => r.title), ["images"]);
  lib("unstar", "images");
  assert.equal(JSON.parse(lib("list", "--starred", "--json")).length, 0);
});

test("info, text and rescan", () => {
  const info = JSON.parse(lib("info", "biolum", "--json"));
  assert.equal(info.title, "Notes on Bioluminescence");
  assert.equal(info.highlights, 8);
  assert.deepEqual(info.tags, ["light"]);
  assert.match(lib("info", "biolum"), /^Title +Notes on Bioluminescence$/m);
  const text = JSON.parse(lib("text", "biolum", "--pages", "2", "-f", "json"));
  assert.deepEqual(text.pages.map(p => p.page), [2]);
  assert.match(text.pages[0].text, /deep-sea animals/);
  assert.match(ok("text", SAMPLE), /^\[Page 1\]\n\nNotes on Bioluminescence/);
  assert.match(lib("rescan"), /up to date/);
  assert.equal(JSON.parse(lib("rescan", "--all", "--json")).length, 2);
});

test("remove drops the doc and the library's copy, and refuses annotated docs without --force", () => {
  const file = path.join(dir, "library", "faelights.json");
  const db = JSON.parse(fs.readFileSync(file, "utf8"));
  const d = db.docs.find(x => x.title === "images");
  d.annotated = true;
  fs.writeFileSync(file, JSON.stringify(db));
  const r = run("--data-dir", dir, "remove", "images");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /annotated in Faelights/);
  assert.match(lib("remove", "images", "--force"), /^Removed images\. Your original is still at/);
  assert.equal(fs.existsSync(d.storedPath), false);
  assert.ok(fs.existsSync(IMAGES));
  assert.deepEqual(JSON.parse(lib("list", "--json")).map(r => r.title), ["Notes on Bioluminescence"]);
});

test("search finds highlights with every word, like the app's search", () => {
  const hits = JSON.parse(lib("search", "deep", "SEA", "--json"));
  assert.deepEqual(hits.map(d => [d.title, d.matches.map(m => m.page)]), [["Notes on Bioluminescence", [2, 2]]]);
  assert.match(lib("search", "cold", "light"), /^  - .*called cold light\. \(p\. 1\)\n    - Note: Good term for the essay intro\n      › Notes on Bioluminescence › 1\. How the light is made$/m);
  assert.match(lib("search", "deep", "sea", "-f", "md"), /\*\*three quarters of deep-sea animals\*\*/);
  assert.match(lib("search", "essay", "intro"), /1 match in 1 PDF/);        // notes count
  assert.match(lib("search", "fireflies", "flash"), /2\. Why fireflies flash/);  // so does the topic
  assert.match(lib("search", "zzz"), /^No highlights contain all of those words/);
  assert.equal(run("--data-dir", dir, "search").status, 2);
});

test("theme reads and writes the app's theme.json", () => {
  assert.equal(lib("theme").trim(), "system");
  assert.match(lib("theme", "Dark"), /Theme set to dark/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8")), { theme: "dark" });
  assert.equal(lib("theme").trim(), "dark");
  assert.equal(run("--data-dir", dir, "theme", "purple").status, 2);
});

test("tour skip and restart write settings.tour as the app's Skip and Help › Show Tour do", () => {
  const Tour = require("../renderer/tour.js");
  const settings = () => JSON.parse(fs.readFileSync(path.join(dir, "library", "faelights.json"), "utf8")).settings;
  assert.match(lib("tour"), /^app +not started/m);
  lib("tour", "skip");
  assert.deepEqual(settings().tour, Object.fromEntries(Tour.NAMES.map(n => [n, true])));
  assert.ok(JSON.parse(lib("tour", "--json")).every(r => r.skipped));
  lib("tour", "restart");
  assert.deepEqual(settings().tour, {});
  assert.ok(Tour.NAMES.every(ch => Tour.pending(settings(), ch).length === Tour.CHAPTERS[ch].length));
  assert.equal(run("--data-dir", dir, "tour", "later").status, 2);
});

test("add rejects text that is neither a file nor an identifier, before touching anything", () => {
  const r = run("--data-dir", dir, "add", "not an id");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /doesn't look like an ISBN, DOI/);
});

test("core/meta.js reads metadata in Node and cleans titles", async () => {
  const meta = await withPdf(SAMPLE, pdf => Meta.readMeta(pdf));
  assert.equal(meta.title, "Notes on Bioluminescence");
  assert.equal(Meta.cleanTitle("Microsoft Word - draft.docx"), "draft");
  assert.equal(Meta.cleanTitle("untitled"), "");
  assert.equal("see doi:10.1000/xyz123.".match(Meta.DOI_RE)[1], "10.1000/xyz123");
});
