"use strict";
// test/fixtures/marks.pdf (built by make-marks-pdf.js): Underline / StrikeOut / Squiggly marks, a nested bookmark tree,
// numbered body-size headings for wording-based topics (outline stripped), and highlights with no text under them.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PDFDocument, PDFName } = require("pdf-lib");
const { repoPath } = require("../helpers/pdf");
const X = require("../../core/extract.js");
const O = require("../../core/order.js");
const F = require("../../core/export.js");

const MARKS = repoPath("test", "fixtures", "marks.pdf");
const noOutline = async file => {
  const doc = await PDFDocument.load(fs.readFileSync(file));
  doc.catalog.delete(PDFName.of("Outlines"));
  return doc.save({ useObjectStreams: false });
};

let r, plain;
before(async () => {
  r = await X.extractPdf(MARKS);
  plain = await X.extractPdf(await noOutline(MARKS));
});

test("marks.pdf: every mark type, in reading order, with colour, comment and topic", () => {
  assert.equal(r.pages, 3);
  assert.equal(r.count, 11);
  assert.deepEqual(X.highlights(r).map(h => [h.page, h.type, h.text, h.color, h.comment, h.topic]), [
    [1, "Highlight", "A good note is short and dated", [255, 255, 0], "", ["1. Introduction"]],
    [1, "Underline", "mark the lines they want to keep", [0, 0, 255], "key idea", ["1. Introduction"]],
    [1, "Strike", "Duplicate notes were removed by hand", [255, 0, 0], "", ["2. Methods"]],
    [1, "Squiggly", "favours the summer months", [0, 255, 0], "", ["2. Methods", "2.1 Sampling"]],
    [1, "Highlight", "caught most of the moths in the study.", [255, 255, 0], "", ["2. Methods", "2.1 Sampling"]],
    [2, "Highlight", "The median note had eleven words.", [0, 255, 0], "", ["3. Results", "3.1 Counts"]],
    [2, "Underline", "corrected from the weather records.", [128, 0, 255], "", ["3. Results", "3.2 Errors"]]
  ]);
  assert.deepEqual(X.highlights(r).map(h => h.sentence), [
    "A good note is short and dated.", "Readers often mark the lines they want to keep with a pen.",
    "Duplicate notes were removed by hand.", "The sample favours the summer months when most observers were active.",
    "The trap shown above caught most of the moths in the study.", "The median note had eleven words.",
    "These were corrected from the weather records."
  ]);
});

test("marks.pdf: the bookmark tree gives nested topics", () => {
  assert.equal(r.topicSource, "outline");
  assert.deepEqual(r.topics.map(t => [t.path, t.level, t.page]), [
    [["1. Introduction"], 1, 1], [["2. Methods"], 1, 1], [["2. Methods", "2.1 Sampling"], 2, 1],
    [["3. Results"], 1, 2], [["3. Results", "3.1 Counts"], 2, 2], [["3. Results", "3.2 Errors"], 2, 2]
  ]);
});

test("marks.pdf without its outline: topics come from the numbered headings' wording", () => {
  assert.equal(plain.topicSource, "patterns");
  assert.deepEqual(plain.topics.map(t => [t.path, t.level, t.page]), [
    [["1. Introduction"], 1, 1], [["2. Methods"], 1, 1], [["2. Methods", "2.1 Sampling"], 2, 1],
    [["3. Results"], 1, 2], [["3. Results", "3.1 Counts"], 2, 2], [["3. Results", "3.2 Errors"], 2, 2]
  ]);
  // same stream positions and names as the bookmarks (T-027 gives bookmark titles the number on the page)
  assert.deepEqual(plain.topics.map(t => t.at), r.topics.map(t => t.at));
  assert.deepEqual(X.highlights(plain).map(h => h.topic), [["1. Introduction"], ["1. Introduction"], ["2. Methods"],
    ["2. Methods", "2.1 Sampling"], ["2. Methods", "2.1 Sampling"], ["3. Results", "3.1 Counts"], ["3. Results", "3.2 Errors"]]);
});

test("marks.pdf: highlights over a figure or a page without text are loose, and page 3 has no text layer", () => {
  assert.deepEqual(r.textless, [3]);
  assert.deepEqual(r.loose.map(l => [l.page, l.type, l.color, l.comment]), [
    [1, "Highlight", [255, 128, 0], "sketch of the trap"],
    [2, "Highlight", [255, 255, 0], ""],
    [3, "Highlight", [0, 0, 255], "scanned table"],
    [3, "Highlight", [255, 0, 0], "no position"]
  ]);
  const spans = r.entries.reduce((n, e) => n + e.spans.length, 0);
  assert.equal(spans + r.loose.length, r.count, "every mark is accounted for");
  assert.deepEqual(r.images, []);
});

/* ---- T-028: loose marks as image clips ---- */
test("loose marks carry the union of their quads as a rect, an id, n, reading-order position and topic", () => {
  assert.deepEqual(r.loose.map(l => [l.n, l.rect, l.topic && l.topic.path]), [
    [1, [72, 398, 300, 518], ["2. Methods", "2.1 Sampling"]],         // two quads (top and bottom half) → the whole figure
    [2, [320, 560, 540, 660], ["3. Results", "3.1 Counts"]],
    [3, [100, 400, 500, 650], ["3. Results", "3.2 Errors"]],          // page without text: after the last text, last topic
    [4, null, ["3. Results", "3.2 Errors"]]                            // all-zero quad: no usable area
  ]);
  assert.equal(new Set(r.loose.map(l => l.id)).size, 4);
  for (const l of r.loose) assert.equal(typeof l.id, "string");
  // F1 sits right above the sentence it is followed by; F2 between R1 and R2; page 3 after everything
  const fact = s => r.entries.find(e => e.sentence.startsWith(s)).at;
  assert.equal(r.loose[0].at, fact("The trap shown above"));
  assert.ok(r.loose[1].at > fact("The median note") && r.loose[1].at < fact("These were corrected"));
  assert.ok(r.loose[2].at > r.entries[r.entries.length - 1].at);
  assert.equal(r.loose[3].at, r.loose[2].at);
});

test("Order: clips slot in among the entries like images; rect-less loose marks stay out", () => {
  const clips = O.clipsOf(r);
  assert.deepEqual(clips.map(c => [c.n, c.clip]), [[1, true], [2, true], [3, true]]);
  assert.deepEqual(O.looseOf(r).map(l => l.comment), ["no position"]);
  assert.deepEqual(O.clipsOf({ loose: [{ page: 1, color: [0, 0, 0] }] }), [], "results from before clips have no rects");
  assert.deepEqual(O.looseOf({ entries: [] }), []);
  // figuresOf: clips always, image boxes only when asked for
  const box = { id: "b", n: 1, page: 2, rect: [0, 0, 10, 10], color: [0, 0, 255], comment: "", at: 0, topic: null };
  assert.equal(O.figuresOf(r, true).length, 3);
  assert.deepEqual(O.figuresOf({ ...r, images: [box] }, true).map(f => f.id), ["b", ...clips.map(c => c.id)]);
  assert.deepEqual(O.figuresOf({ ...r, images: [box] }, false).map(f => f.id), clips.map(c => c.id));
  const shape = O.withImages(r.entries, clips).map(it => it.kind === "image" ? "c" + it.image.n : "e" + it.entry.n).join(" ");
  assert.equal(shape, "e1 e2 e3 e4 c1 e5 e6 c2 e7 c3");
  const gs = O.groupItems(O.withImages(r.entries, clips));
  assert.deepEqual(gs.map(g => [g.topic.title, g.entries, g.clips, g.images]),
    [["1. Introduction", 2, 0, 0], ["2. Methods", 1, 0, 0], ["2.1 Sampling", 2, 1, 0], ["3.1 Counts", 1, 1, 0], ["3.2 Errors", 1, 1, 0]]);
  // colours: orange only appears on a clip; the count includes every loose mark
  const s = O.summary(r);
  assert.equal(s.count, 11);
  assert.ok(s.colours.some(c => c.join() === "255,128,0"));
  assert.deepEqual(O.filterImages(clips, new Set([O.ckey([255, 128, 0])])).map(c => c.n), [2, 3]);
});

const doc = () => ({ title: "Field Notes", fileName: "marks.pdf", pages: r.pages, count: r.count, tags: [], result: r });
test("export: clips become image lines in place of the 'pages without text' note", () => {
  const md = F.docText(doc(), { fmt: "md", mode: "only" });
  assert.ok(md.includes("- favours the summer months (p. 1)\n- [image clip, p. 1]\n  - Note: sketch of the trap\n- caught most of the moths"), md);
  assert.ok(md.includes("- The median note had eleven words. (p. 2)\n- [image clip, p. 2]\n\n#"), md);
  assert.ok(md.includes("- [image clip, p. 3]\n  - Note: scanned table"));
  // only the mark with no usable area is still summarised
  assert.ok(md.trim().endsWith("(1 mark on pages without text: 3)"), md);
  // rendered clips (the app passes them with a file path) link like images, under their own file names
  const refs = O.clipsOf(r).map(c => ({ ...c, path: "Field Notes images/" + F.imageFile(c) }));
  assert.deepEqual(refs.map(c => F.imageFile(c)), ["p1-clip1.png", "p2-clip2.png", "p3-clip3.png"]);
  const linked = F.docText(doc(), { fmt: "md", mode: "only", images: refs });
  assert.ok(linked.includes("- ![Highlighted area from p. 1](Field%20Notes%20images/p1-clip1.png) (p. 1)\n  - Note: sketch of the trap"));
  assert.ok(F.docText(doc(), { fmt: "obsidian", mode: "only", images: refs }).includes("- ![[Field Notes images/p2-clip2.png]] (p. 2)"));
  assert.ok(F.docText(doc(), { fmt: "plain", mode: "only", images: refs }).includes("- [Image clip p. 3: Field Notes images/p3-clip3.png]"));
  assert.ok(F.docText(doc(), { fmt: "plain", mode: "only" }).includes("- [image clip, p. 2]"));
  // the caller's list wins: an empty one (all clip colours hidden) leaves the clips out
  assert.ok(!F.docText(doc(), { fmt: "md", mode: "only", images: [] }).includes("image clip"));
});

test("export html: rendered clips are embedded figures in their colour; unrendered ones are placeholders", () => {
  const url = "data:image/png;base64,iVBORw0KGgo=";
  const refs = O.clipsOf(r).map(c => ({ ...c, url, width: 200, height: 100 }));
  const h = F.docHtml(doc(), { mode: "only", images: refs });
  assert.ok(h.includes(`<figure class="clip"><img src="${url}" alt="Highlighted area from p. 1" width="100" height="50" style="border-left:4px solid rgba(255, 128, 0, 1)"><figcaption>p. 1 · sketch of the trap</figcaption></figure>`), h);
  assert.equal(h.match(/<figure class="clip">/g).length, 3);
  assert.ok(h.includes('<p class="loose">(1 mark on pages without text: 3)</p>'));
  const plain = F.docHtml(doc(), { mode: "only" });
  assert.ok(plain.includes('<p class="missing">[image clip, p. 1 · sketch of the trap]</p>'));
  assert.ok(!plain.includes("<figure"));
  assert.ok(F.docHtml(doc(), { mode: "only", images: [{ ...refs[1], url: null, failed: true }] }).includes("(highlighted area on p. 2 couldn't be rendered)"));
});
