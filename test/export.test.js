"use strict";
// Export: path validation (src/exportPaths.js) and text/HTML builders (renderer/exportfmt.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const X = require("../src/exportPaths.js");
const F = require("../renderer/exportfmt.js");

/* ---------------- path validation ---------------- */
test("asset paths: safe relative paths are accepted", () => {
  for (const p of ["a.png", "My Doc images/p3-1.png", "sub\\dir\\x.png", "Notes (draft) images/p10-2.png"]) assert.equal(X.pathProblem(p), "", p);
  const dir = path.resolve("export-root");
  assert.equal(X.resolveInside(dir, "My Doc images/p3-1.png"), path.join(dir, "My Doc images", "p3-1.png"));
});
test("asset paths: traversal is rejected", () => {
  for (const p of ["../x.png", "a/../../x.png", "a/..", "./a.png", "a//b.png", "..\\x.png"]) assert.notEqual(X.pathProblem(p), "", p);
  assert.throws(() => X.resolveInside(path.resolve("root"), "../evil.png"));
});
test("asset paths: absolute and drive paths are rejected", () => {
  for (const p of ["/etc/passwd", "\\\\server\\share\\x.png", "\\x.png", "C:\\x.png", "C:x.png", "c:/x.png"]) assert.notEqual(X.pathProblem(p), "", p);
});
test("asset paths: reserved characters and names are rejected", () => {
  for (const p of ["a<b.png", "a>b.png", "a|b.png", "a?.png", "a*.png", 'a".png', "a\u0001b.png", "a\u0000.png",
    "CON", "con.png", "dir/NUL.txt", "lpt1", "COM9.md", "trailing.", "trailing ", "dir./x.png", "", null, 5]) assert.notEqual(X.pathProblem(p), "", String(p));
});
test("planAssets: rejects the whole set on one bad path, duplicates or size", () => {
  const dir = path.resolve("root"), b = new Uint8Array(4);
  assert.equal(X.planAssets(dir, [{ path: "i/a.png", bytes: b }, { path: "i/b.png", bytes: b }]).length, 2);
  assert.deepEqual(X.planAssets(dir, undefined), []);
  assert.throws(() => X.planAssets(dir, [{ path: "i/a.png", bytes: b }, { path: "../b.png", bytes: b }]));
  assert.throws(() => X.planAssets(dir, [{ path: "i/a.png", bytes: b }, { path: "I/A.png", bytes: b }]));
  assert.throws(() => X.planAssets(dir, [{ path: "i/a.png", bytes: "nope" }]));
  assert.throws(() => X.planAssets(dir, [{ path: "i/a.png", bytes: new Uint8Array(10) }], 5));
});
test("bundle token: images folder follows the chosen file name", () => {
  assert.equal(X.imagesDirFor(path.join("x", "My notes.md")), "My notes images");
  assert.equal(X.fillToken("a TOK/p1-1.png b TOK", "TOK", "D d"), "a D d/p1-1.png b D d");
  assert.equal(X.mdSeg("My notes (v2) images"), "My%20notes%20%28v2%29%20images");
  assert.ok(X.isToken("FLIMG0123456789abcdef")); assert.ok(!X.isToken("../x")); assert.ok(!X.isToken("short"));
});

/* ---------------- fixtures ---------------- */
const T1 = { title: "Intro", path: ["Intro"], at: 0 };
const T2 = { title: "Methods", path: ["Methods"], at: 100 };
const T3 = { title: "Results", path: ["Results"], at: 300 };
const YEL = [255, 219, 51];
const ent = (n, at, topic, text, comment = "") => ({
  n, page: Math.ceil(at / 100) || 1, at, topic,
  segs: [{ t: "Before ", hl: -1 }, { t: text, hl: n }, { t: " after.", hl: -1 }],
  spans: [{ id: n, color: YEL, text, comment }],
  sentence: `Before ${text} after.`
});
const E = [ent(1, 10, T1, "alpha", "a note"), ent(2, 120, T2, "beta"), ent(3, 150, T2, "gamma")];
const doc = (entries, extra = {}) => ({
  title: "My Paper", sourcePath: "C:\\docs\\paper.pdf", fileName: "paper.pdf", pages: 3, count: entries.length, tags: ["x"],
  result: { entries, loose: [{ page: 3 }], ...extra }
});
const img = (n, page, at, topic, comment = "") => ({ id: "i" + n, n, page, rect: [0, 0, 10, 10], color: [255, 0, 0], comment, at, topic });

/* ---------------- placement ---------------- */
const kinds = items => items.map(it => F.isImage(it) ? "I" + it.n : "E" + it.n);
test("placement: image before entry when at is equal, between entries, after the last", () => {
  assert.deepEqual(kinds(F.exportItems(E, [img(1, 2, 120, T2)])), ["E1", "I1", "E2", "E3"]);
  assert.deepEqual(kinds(F.exportItems(E, [img(1, 2, 130, T2)])), ["E1", "E2", "I1", "E3"]);
  assert.deepEqual(kinds(F.exportItems(E, [img(1, 2, 900, T2)])), ["E1", "E2", "E3", "I1"]);
  assert.deepEqual(kinds(F.exportItems(E, [img(2, 1, 5, T1), img(1, 1, 0, T1)])), ["I1", "I2", "E1", "E2", "E3"]);
  assert.equal(F.exportItems(E, []), E);
});
test("placement: images join their topic group; an image-only topic gets its own group", () => {
  const gs = F.groupsOf(F.exportItems(E, [img(1, 1, 50, T1), img(2, 4, 350, T3)]));
  assert.deepEqual(gs.map(g => g.topic.title), ["Intro", "Methods", "Results"]);
  assert.deepEqual(gs.map(g => kinds(g.items)), [["E1", "I1"], ["E2", "E3"], ["I2"]]);
});

/* ---------------- line builders ---------------- */
test("image lines: md link encoding, obsidian embed, plain, placeholder, failed", () => {
  const r = { page: 3, n: 1, comment: "see chart", path: "My Paper images/p3-1.png" };
  assert.deepEqual(F.imageLines(r, "md"), ["- ![Image from p. 3](My%20Paper%20images/p3-1.png) (p. 3)", "  - Note: see chart"]);
  assert.deepEqual(F.imageLines(r, "obsidian"), ["- ![[My Paper images/p3-1.png]] (p. 3)", "  - Note: see chart"]);
  assert.deepEqual(F.imageLines(r, "plain"), ["- [Image p. 3: My Paper images/p3-1.png]", "  - Note: see chart"]);
  assert.deepEqual(F.imageLines({ page: 2, comment: "" }, "md"), ["- [Image, p. 2]"]);
  assert.deepEqual(F.imageLines({ page: 2, comment: "", failed: true, path: "x/p2-1.png" }, "md"), ["- (image on p. 2 couldn't be rendered)"]);
  assert.equal(F.mdLink("A (b) #c images/p1-1.png"), "A%20%28b%29%20%23c%20images/p1-1.png");
  assert.equal(F.imageFile({ page: 7, n: 3 }), "p7-3.png");
});
test("docText: images interleaved within topic groups", () => {
  const images = [img(1, 2, 120, T2, "fig"), img(2, 4, 350, T3)].map(i => ({ ...i, path: "My Paper images/" + F.imageFile(i) }));
  const t = F.docText(doc(E), { fmt: "md", mode: "full", images });
  assert.match(t, /## Methods\n\n- !\[Image from p\. 2\]\(My%20Paper%20images\/p2-1\.png\) \(p\. 2\)\n  - Note: fig\n- Before \*\*beta\*\* after\. \(p\. 2\)/);
  assert.match(t, /## Results\n\n- \[Image p\. 4|## Results\n\n- !\[Image from p\. 4\]/);
  const c = F.docText(doc(E), { fmt: "plain", mode: "only", images: [img(1, 2, 120, T2, "fig")] });
  assert.match(c, /METHODS\n\n- \[Image, p\. 2\]\n  - Note: fig\n- beta \(p\. 2\)/);
});

/* ---------------- unchanged output without images ---------------- */
// Verbatim copy of the pre-image docText/entryLines/groupsOf from renderer/app.js (lib name and date injected).
function oldDocText(d, fmt, frontmatter, entries, mode, libName, date) {
  const plural = (n, a, b) => n + " " + (n === 1 ? a : (b || a + "s"));
  function wrapHl(t, fmt) { t = t.trim(); if (!t) return ""; return fmt === "md" ? `**${t}**` : fmt === "obsidian" ? `==${t}==` : t; }
  function entryLines(e, fmt, mode) {
    const ids = new Set(e.spans.map(s => s.id));
    let body;
    if (mode === "full") {
      body = e.segs.map(s => {
        if (s.hl === -1 || !ids.has(s.hl) || fmt === "plain") return s.t;
        return s.t.match(/^\s*/)[0] + wrapHl(s.t, fmt) + s.t.match(/\s*$/)[0];
      }).join("").replace(/\s{2,}/g, " ").trim();
    } else body = e.spans.map(s => s.text).join(" … ");
    const lines = [`- ${body} (p. ${e.page})`];
    for (const s of e.spans) if (s.comment && s.comment !== s.text) lines.push(`  - Note: ${s.comment}`);
    return lines;
  }
  function groupsOf(entries) {
    const gs = [];
    for (const e of entries) {
      const key = e.topic ? e.topic.at + "|" + e.topic.title : "none";
      let g = gs[gs.length - 1];
      if (!g || g.key !== key) { g = { key, topic: e.topic, items: [] }; gs.push(g); }
      g.items.push(e);
    }
    return gs;
  }
  entries = entries || d.result.entries;
  const out = [];
  if (frontmatter) {
    out.push("---", `title: "${d.title.replace(/"/g, '\\"')}"`, `source: "${(d.sourcePath || d.fileName).replace(/\\/g, "/").replace(/"/g, '\\"')}"`,
      `library: "${libName}"`, `pages: ${d.pages}`, `highlights: ${d.count}`,
      `tags: [${d.tags.map(t => JSON.stringify(t)).join(", ")}]`, `exported: ${date}`, "---", "");
  }
  out.push(fmt === "plain" ? d.title : `# ${d.title}`, "");
  const done = new Set();
  for (const g of groupsOf(entries)) {
    const path = g.topic ? g.topic.path : ["Abstract"];
    path.forEach((t, i) => {
      const key = path.slice(0, i + 1).join("\u0001");
      if (i < path.length - 1 && done.has(key)) return;
      done.add(key);
      out.push(fmt === "plain" ? t.toUpperCase() : "#".repeat(Math.min(i + 2, 6)) + " " + t, "");
    });
    for (const e of g.items) out.push(...entryLines(e, fmt, mode));
    out.push("");
  }
  if (d.result.loose.length) out.push(`(${plural(d.result.loose.length, "mark")} on pages without text: ${[...new Set(d.result.loose.map(l => l.page))].join(", ")})`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
test("docText without images is byte-identical to the old exporter", () => {
  const nested = { title: "Sub", path: ["Methods", "Sub"], at: 200 };
  const entries = [{ ...ent(9, 2, null, "pre") }, ...E, ent(4, 210, nested, "delta", "delta")];
  for (const fmt of ["md", "obsidian", "plain"]) for (const mode of ["full", "only"]) for (const fm of [true, false]) {
    const d = doc(entries, { images: [img(1, 1, 5, T1)] });   // images present on the doc but not passed
    const want = oldDocText(d, fmt, fm, null, mode, "Lib \"A\"", "2026-01-02");
    assert.equal(F.docText(d, { fmt, frontmatter: fm, mode, libraryName: "Lib \"A\"", date: "2026-01-02" }), want, `${fmt}/${mode}/${fm}`);
    assert.equal(F.docText(d, { fmt, frontmatter: fm, mode, libraryName: "Lib \"A\"", date: "2026-01-02", images: [] }), want);
    const sub = entries.slice(1, 3);
    assert.equal(F.docText(d, { fmt, frontmatter: fm, mode, entries: sub, libraryName: "Lib \"A\"", date: "2026-01-02" }),
      oldDocText(d, fmt, fm, sub, mode, "Lib \"A\"", "2026-01-02"));
  }
});

/* ---------------- HTML ---------------- */
test("html: escapes text, marks highlights in their colour, embeds images", () => {
  const evil = ent(1, 10, { title: "<T&1>", path: ["<T&1>"], at: 0 }, "<b>x</b> & \"y\"", "it's <i>");
  const d = { ...doc([evil]), title: "A <script>alert(1)</script> & co" };
  const images = [{ ...img(1, 1, 50, evil.topic, "c<1>"), url: "data:image/png;base64,iVBORw0KGgo=", width: 200, height: 100 },
    { ...img(2, 1, 60, evil.topic), failed: true }, { ...img(3, 1, 70, evil.topic), url: "javascript:alert(1)" }];
  const h = F.docHtml(d, { mode: "full", images, libraryName: "L<1>", date: "2026-01-02" });
  assert.ok(h.startsWith("<!doctype html>"));
  assert.match(h, /<meta charset="utf-8">/);
  assert.match(h, /<title>A &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; co<\/title>/);
  assert.ok(!h.includes("<script>") && !h.includes("<b>x") && !h.includes("<T&1>") && !h.includes("javascript:"));
  assert.match(h, /<h2>&lt;T&amp;1&gt;<\/h2>/);
  assert.match(h, /<mark style="background:rgba\(255, 219, 51, 0\.35\)">&lt;b&gt;x&lt;\/b&gt; &amp; &quot;y&quot;<\/mark>/);
  assert.match(h, /<p class="note">Note: it&#39;s &lt;i&gt;<\/p>/);
  assert.match(h, /<figure><img src="data:image\/png;base64,iVBORw0KGgo=" alt="Image from p\. 1" width="100" height="50"><figcaption>p\. 1 · c&lt;1&gt;<\/figcaption><\/figure>/);
  assert.equal((h.match(/couldn't be rendered/g) || []).length, 2);
  assert.match(h, /prefers-color-scheme:\s*dark/);
  assert.equal(F.esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
test("html: figures sit between lists, in placement order", () => {
  const h = F.docHtml(doc(E), { mode: "only", images: [{ ...img(1, 2, 130, T2), url: "data:image/png;base64,AA==" }] });
  assert.match(h, /<h2>Methods<\/h2>\n<ul>\n<li>.*beta.*<\/li>\n<\/ul>\n<figure>.*<\/figure>\n<ul>\n<li>.*gamma.*<\/li>\n<\/ul>/);
  assert.equal(F.extOf("html"), ".html"); assert.equal(F.extOf("plain"), ".txt"); assert.equal(F.extOf("obsidian"), ".md");
});
