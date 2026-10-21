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

test("shelves: new, list, shelve / move --shelf / unshelve, rename, delete (PDFs stay in the library)", () => {
  const dbFile = () => JSON.parse(fs.readFileSync(path.join(dir, "library", "faelights.json"), "utf8"));
  lib("library", "new", "Thesis");
  assert.match(lib("shelves"), /No shelves yet/);
  const s = JSON.parse(lib("shelf", "new", "Thesis", "Methods", "--json"));
  assert.deepEqual([s.name, s.library], ["Methods", "Thesis"]);
  assert.match(run("--data-dir", dir, "shelf", "new", "thesis", "methods").stderr, /Thesis already has a shelf called "methods"/);
  lib("shelf", "new", "Inbox", "Methods");   // the same name in another library is fine…
  const amb = run("--data-dir", dir, "shelve", "biolum", "methods");
  assert.equal(amb.status, 1);
  assert.match(amb.stderr, /is a shelf in 2 libraries/);   // …but then needs --library or the id
  assert.match(lib("shelve", "biolum", "methods", "-l", "Thesis"), /Shelved Notes on Bioluminescence → Thesis › Methods/);
  assert.match(lib("move", "images", "Thesis", "--shelf", "Methods"), /Moved images → Thesis › Methods/);
  assert.match(lib("move", "images", "Thesis", "--shelf", s.id), /already in Thesis › Methods/);
  const d = dbFile().docs.find(x => x.title === "images");
  assert.deepEqual([d.libraryId, d.shelfId], [s.libraryId, s.id]);

  assert.deepEqual(JSON.parse(lib("list", "--shelf", s.id, "--json")).map(r => [r.title, r.library, r.shelf]),
    [["Notes on Bioluminescence", "Thesis", "Methods"], ["images", "Thesis", "Methods"]]);
  assert.match(lib("list", "Thesis"), /images  \[Thesis › Methods\]/);
  assert.equal(JSON.parse(lib("info", "images", "--json")).shelf, "Methods");
  assert.deepEqual(JSON.parse(lib("shelves", "Thesis", "--json")).map(r => [r.name, r.pdfs]), [["Methods", 2]]);
  assert.match(lib("shelves"), /Thesis › Methods \(2 PDFs\)/);
  assert.match(run("--data-dir", dir, "list", "--shelf", "Nope").stderr, /No shelf called "Nope"/);

  assert.match(lib("unshelve", "images"), /Took images off Methods \(still in Thesis\)/);
  assert.match(lib("unshelve", "images"), /isn't on a shelf/);
  assert.match(lib("move", "biolum", "Thesis"), /Moved Notes on Bioluminescence → Thesis$/m);   // to the library's root
  lib("shelve", "biolum", s.id);
  assert.match(lib("shelf", "rename", s.id, "Background"), /Renamed shelf Methods → Background/);
  assert.match(lib("shelf", "delete", "Background"), /Deleted shelf Thesis › Background; 1 PDF taken off it \(still in Thesis\)/);
  assert.deepEqual(dbFile().docs.map(x => [x.libraryId, x.shelfId]), [[s.libraryId, null], [s.libraryId, null]]);
  assert.equal(run("--data-dir", dir, "shelf", "frob").status, 2);
  // put things back as the later tests expect them
  lib("shelf", "delete", "Methods");
  lib("library", "delete", "Thesis");
});

test("tags and stars, and filtering the list by them", () => {
  assert.match(lib("tag", "biolum", "#light", "essay", "light"), /#light #essay$/m);
  assert.match(lib("untag", "biolum", "essay"), /: #light$/m);
  lib("tag", "images", "light", "moths");
  assert.deepEqual(JSON.parse(lib("tags", "--json")), [{ tag: "light", pdfs: 2, colour: null }, { tag: "moths", pdfs: 1, colour: null }]);
  lib("star", "images");
  assert.match(lib("star", "images"), /no change/);
  assert.deepEqual(JSON.parse(lib("list", "--starred", "--json")).map(r => r.title), ["images"]);
  assert.deepEqual(JSON.parse(lib("list", "-t", "light", "-t", "moths", "--json")).map(r => r.title), ["images"]);
  lib("unstar", "images");
  assert.equal(JSON.parse(lib("list", "--starred", "--json")).length, 0);
});

test("read / unread and filtering the list by read state", () => {
  assert.deepEqual(JSON.parse(lib("list", "--unread", "--json")).map(r => [r.title, r.read, r.lastPage]), [["Notes on Bioluminescence", false, 0], ["images", false, 0]]);
  assert.match(lib("read", "biolum"), /^Marked Notes on Bioluminescence as read$/m);
  assert.match(lib("read", "biolum"), /\(no change\)/);
  assert.deepEqual(JSON.parse(lib("list", "--unread", "--json")).map(r => r.title), ["images"]);
  assert.deepEqual(JSON.parse(lib("list", "--read", "--json")).map(r => r.title), ["Notes on Bioluminescence"]);
  assert.match(lib("list"), /Notes on Bioluminescence .*\(read\)/);
  const both = JSON.parse(lib("read", "biolum", "images", "--json"));
  assert.deepEqual(both.map(r => [r.title, r.read, r.changed]), [["Notes on Bioluminescence", true, false], ["images", true, true]]);
  // an unknown doc aborts the whole command
  assert.equal(run("--data-dir", dir, "unread", "images", "zzz").status, 1);
  assert.equal(JSON.parse(lib("list", "--unread", "--json")).length, 0);
  lib("unread", "biolum", "images");
  assert.equal(JSON.parse(lib("list", "--read", "--json")).length, 0);
  assert.equal(run("--data-dir", dir, "read").status, 2);
});

test("tag colour sets, shows and clears a tag's colour as the app's tag menu does", () => {
  assert.equal(lib("tag", "colour", "light").trim(), "light has no colour");
  assert.match(lib("tag", "colour", "#light", "#3a7"), /^light: #33aa77$/m);
  assert.match(lib("tag", "color", "light", "33AA77"), /no change/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "library", "faelights.json"), "utf8")).tagColours.light, "#33aa77");
  assert.match(lib("tags"), /^light \(2 PDFs\)  #33aa77$/m);
  assert.deepEqual(JSON.parse(lib("tags", "--json"))[0], { tag: "light", pdfs: 2, colour: "#33aa77" });
  assert.deepEqual(JSON.parse(lib("tag", "colour", "light", "--json")), { tag: "light", colour: "#33aa77" });
  const bad = run("--data-dir", dir, "tag", "colour", "light", "#12345");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /isn't a colour/);
  const unknown = run("--data-dir", dir, "tag", "colour", "nope", "#3a7");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /No PDF has the tag "nope"\. Tags: light, moths\./);
  assert.match(lib("tag", "colour", "light", "--clear"), /^light: no colour$/m);
  lib("tag", "colour", "moths", "#d64550");
  assert.match(lib("tag", "colour", "moths", "none"), /no colour/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "library", "faelights.json"), "utf8")).tagColours, {});
});

test("info, text and rescan", () => {
  const info = JSON.parse(lib("info", "biolum", "--json"));
  assert.equal(info.title, "Notes on Bioluminescence");
  assert.equal(info.highlights, 8);
  assert.deepEqual(info.tags, ["light"]);
  assert.deepEqual([info.read, info.lastPage], [false, 0]);
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
test("add <link>: the landing page's title beats the PDF's own (T-035)", async () => {
  const http = require("node:http"), { promisify } = require("node:util"), execFile = promisify(require("node:child_process").execFile);
  const own = fs.mkdtempSync(path.join(os.tmpdir(), "faelights-cli-src-"));
  const site = http.createServer((req, res) => {
    if (req.url === "/paper.pdf") { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(fs.readFileSync(SAMPLE)); }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><head><meta name="citation_title" content="The Real Title"><meta name="citation_pdf_url" content="/paper.pdf"></head></html>`);
  });
  await new Promise(r => site.listen(0, "127.0.0.1", r));
  try {
    // async: the server above answers from this process
    const { stdout } = await execFile(process.execPath, [CLI, "--data-dir", own, "add", `http://127.0.0.1:${site.address().port}/landing`, "--no-lookup", "--json"]);
    const [r] = JSON.parse(stdout);
    assert.deepEqual([r.action, r.title], ["added", "The Real Title"]);
    const d = JSON.parse(fs.readFileSync(path.join(own, "library", "faelights.json"), "utf8")).docs[0];
    assert.deepEqual([d.sourceTitle, d.meta.title], ["The Real Title", "Notes on Bioluminescence"]);
  } finally { site.close(); fs.rmSync(own, { recursive: true, force: true }); }
});
