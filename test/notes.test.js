"use strict";
// T-025: the user's Markdown notes between extracts. Where a note sits (core/order.js), how it exports in every format
// (core/export.js), the small Markdown renderer (core/markdown.js), and the CLI export of a library doc with notes.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { repoPath } = require("./helpers/pdf");
const { withImages, groupItems } = require("../core/order.js");
const X = require("../core/extract.js");
const F = require("../core/export.js");
const MD = require("../core/markdown.js");
const L = require("../core/library.js");

const YELLOW = [255, 219, 51];
const T1 = { at: 0, title: "Intro", level: 1, path: ["Intro"] };
const T2 = { at: 50, title: "Methods", level: 1, path: ["Methods"] };
const entry = (n, at, topic = null) => ({ n, at, page: 1, topic, spans: [{ id: n, color: YELLOW, text: "t" + n }] });
const image = (n, at, topic = null) => ({ id: "img" + n, n, page: 1, rect: [0, 0, 100, 50], color: YELLOW, comment: "", at, topic });
const note = (id, at, text = id) => ({ id, at, text });
const shape = list => list.map(it => it.kind === "image" ? "i" + it.image.n : it.kind === "note" ? it.note.id : "e" + it.entry.n).join(" ");

/* ---- order ---- */
test("a note added after an extract sits right after it, before the next entry or image", () => {
  const es = [entry(1, 10), entry(2, 20), entry(3, 30), entry(4, 40)];
  assert.equal(shape(withImages(es, [], [note("n", 30.5)])), "e1 e2 e3 n e4");
  assert.equal(shape(withImages(es, [image(1, 31)], [note("n", 30.5)])), "e1 e2 e3 n i1 e4");
  // several notes after the same extract keep the order they were given (Library.notesOf: order added)
  assert.equal(shape(withImages(es, [], [note("a", 30.5), note("b", 30.5), note("c", 10.5)])), "e1 c e2 e3 a b e4");
  // after the last entry, and at the top
  assert.equal(shape(withImages(es, [image(1, 99)], [note("end", 40.5), note("top", -1)])), "top e1 e2 e3 e4 end i1");
  assert.equal(shape(withImages(es)), "e1 e2 e3 e4", "existing callers: no notes argument");
  assert.equal(shape(withImages([], [], [note("only", -1)])), "only");
});

test("a note takes the topic of the extract before it; a top note the first one's; groups count notes apart", () => {
  const es = [entry(1, 10, T1), entry(2, 20, T1), entry(3, 60, T2)];
  const items = withImages(es, [], [note("top", -1), note("n1", 20.5), note("n2", 60.5)]);
  assert.deepEqual(items.filter(x => x.kind === "note").map(x => x.topic.title), ["Intro", "Intro", "Methods"]);
  const gs = groupItems(items);
  assert.deepEqual(gs.map(g => [g.topic.title, g.entries, g.notes]), [["Intro", 2, 2], ["Methods", 1, 1]]);
  // the extract it follows filtered out (colour filter): the note keeps that extract's topic via `all`
  const shown = [entry(1, 10, T1), entry(3, 60, T2)];
  const its = withImages(shown, [], [note("n", 55.5)], [...shown.slice(0, 1), { ...entry(2, 55, T2) }, shown[1]]);
  assert.equal(shape(its), "e1 n e3");
  assert.deepEqual(groupItems(its).map(g => g.topic.title + ":" + g.items.length), ["Intro:1", "Methods:2"]);
});

/* ---- export ---- */
let d;
before(async () => {
  const result = await X.extractPdf(repoPath("renderer", "sample.pdf"));
  d = { title: "Light", fileName: "sample.pdf", pages: result.pages, count: result.count, tags: [], result, notes: [] };
  const e3 = result.entries[2];
  L.addNote(d, e3.at + 0.5, "# My section\n\nA **bold** thought, see [the paper](https://example.org/a?b=1&c=2).");
  L.addNote(d, -1, "Read for the essay.");
  L.addNote(d, e3.at + 0.5, "   ");   // blank: left out
});
const out = (fmt, o = {}) => F.docText(d, { fmt, mode: "only", date: "2026-10-21", ...o });
const E3 = "the delay between signals carries as much meaning as the light itself";
const E4 = "femme fatale fireflies";

test("md and obsidian: the note's Markdown right after extract 3, its heading under the topic heading", () => {
  for (const fmt of ["md", "obsidian"]) {
    const md = out(fmt);
    const i3 = md.indexOf(E3), iN = md.indexOf("#### My section"), i4 = md.indexOf(E4);
    assert.ok(i3 > 0 && iN > i3 && i4 > iN, fmt);
    assert.ok(md.includes("(p. 1)\n\n#### My section\n\nA **bold** thought, see [the paper](https://example.org/a?b=1&c=2).\n\n- "), fmt);
    // top note: first thing under the first topic heading
    assert.ok(md.includes("### 1. How the light is made\n\nRead for the essay.\n\n- "), fmt);
    assert.ok(!md.includes("\n\n\n"));
  }
});

test("plain text: the note without Markdown syntax, after extract 3", () => {
  const t = out("plain");
  assert.ok(t.includes("(p. 1)\n\nMy section\n\nA bold thought, see the paper (https://example.org/a?b=1&c=2).\n\n- "));
  assert.ok(t.indexOf("My section") > t.indexOf(E3) && t.indexOf("My section") < t.indexOf(E4));
  assert.ok(!t.includes("**") && !t.includes("#"));
});

test("html: the note rendered after extract 3's list item, escaped", () => {
  const h = F.docHtml(d, { mode: "only", date: "2026-10-21" });
  const iN = h.indexOf('<div class="unote"><h4>My section</h4>');
  assert.ok(iN > h.indexOf(E3) && iN < h.indexOf(E4));
  assert.ok(h.includes('<p>A <strong>bold</strong> thought, see <a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noreferrer">the paper</a>.</p></div>'));
  assert.ok(h.includes("</ul>\n<div class=\"unote\">"), "the list is closed before the note");
  const evil = { ...d, notes: [{ id: "x", at: -1, text: '<img src=x onerror=alert(1)> [x](javascript:alert(1))' }] };
  const he = F.docHtml(evil, { mode: "only" });
  assert.ok(!he.includes("<img src=x") && !he.includes('href="javascript'));
  assert.ok(he.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("a doc without notes exports exactly as before", () => {
  const plainDoc = { ...d, notes: [] };
  assert.equal(F.docText(plainDoc, { fmt: "md", mode: "full" }), F.docText({ ...d, notes: undefined }, { fmt: "md", mode: "full" }));
  assert.ok(!F.docHtml(plainDoc, { mode: "full" }).includes('class="unote"'));
});

/* ---- markdown ---- */
test("markdown: headings (shifted, capped), paragraphs, emphasis, code, lists, quotes, fences, rules", () => {
  assert.equal(MD.html("# A\n## B", { shift: 2 }), "<h3>A</h3>\n<h4>B</h4>");
  assert.equal(MD.html("###### deep", { shift: 3 }), "<h6>deep</h6>");
  assert.equal(MD.html("#Tight"), "<h1>Tight</h1>");
  assert.equal(MD.html("one\ntwo\n\nthree"), "<p>one<br>two</p>\n<p>three</p>");
  assert.equal(MD.html("**b** *i* _i_ ~~s~~ `a*b*<c>` snake_case_name"),
    "<p><strong>b</strong> <em>i</em> <em>i</em> <del>s</del> <code>a*b*&lt;c&gt;</code> snake_case_name</p>");
  assert.equal(MD.html("- a\n- **b**\n  more\n\n1. x\n2. y"), "<ul><li>a</li><li><strong>b</strong><br>more</li></ul>\n<ol><li>x</li><li>y</li></ol>");
  assert.equal(MD.html("> quoted\n> # head"), "<blockquote><p>quoted</p>\n<h1>head</h1></blockquote>");
  assert.equal(MD.html("```\n<b>x</b>\n# not a heading\n```"), "<pre><code>&lt;b&gt;x&lt;/b&gt;\n# not a heading</code></pre>");
  assert.equal(MD.html("---"), "<hr>");
  assert.equal(MD.html("[a](mailto:x@y.z)"), '<p><a href="mailto:x@y.z" target="_blank" rel="noreferrer">a</a></p>');
});

test("markdown: raw HTML and unsafe links are escaped, never injected", () => {
  assert.equal(MD.html("<script>alert('x')</script>"), "<p>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</p>");
  assert.equal(MD.html("[a](javascript:alert(1))"), "<p>[a](javascript:alert(1))</p>");
  assert.equal(MD.html('[a](https://x.org/"onmouseover="y)'), '<p><a href="https://x.org/&quot;onmouseover=&quot;y" target="_blank" rel="noreferrer">a</a></p>');
  assert.equal(MD.html("`<i>` **<b>**"), "<p><code>&lt;i&gt;</code> <strong>&lt;b&gt;</strong></p>");
  assert.equal(MD.html("a\u0000 0 \u0000b"), "<p>a 0 b</p>");
});

test("markdown: shift, plain and isHeading", () => {
  assert.equal(MD.shift("#Title\ntext\n```\n# code\n```\n## Sub", 2), "### Title\ntext\n```\n# code\n```\n#### Sub");
  assert.equal(MD.plain("# Title\n> **quoted** `x`\n- [l](https://a.b)\n\n---"), "Title\nquoted x\n- l (https://a.b)");
  assert.equal(MD.isHeading("  ## Part two\nbody"), true);
  assert.equal(MD.isHeading("Just a note # not heading"), false);
  assert.equal(MD.isHeading(""), false);
});

/* ---- CLI: export reads the notes saved in the library; a rescan keeps them ---- */
let dir;
const CLI = repoPath("cli", "faelights.js");
const cli = (...args) => execFileSync(process.execPath, [CLI, "--data-dir", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
after(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

test("CLI export includes notes after the right extract, in every format, and they survive a rescan", () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "faelights-notes-"));
  cli("add", repoPath("renderer", "sample.pdf"));
  const file = path.join(dir, "library", "faelights.json");
  const db = JSON.parse(fs.readFileSync(file, "utf8"));
  const doc = db.docs[0];
  L.addNote(doc, doc.result.entries[2].at + 0.5, "# CLI note\nwith *style*");
  fs.writeFileSync(file, JSON.stringify(db));
  cli("rescan", doc.id, "--all");
  const check = (fmt, needle) => {
    const t = cli("export", doc.id, "-f", fmt, "--mode", "only");
    const i = t.indexOf(needle);
    assert.ok(i > t.indexOf(E3) && i < t.indexOf(E4), fmt);
  };
  check("md", "#### CLI note\nwith *style*");
  check("obsidian", "#### CLI note");
  check("plain", "CLI note\nwith style");
  check("html", "<h4>CLI note</h4>");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).docs[0].notes.length, 1);
});
