"use strict";
// Builds test/fixtures/marks.pdf: a 3-page document covering what sample.pdf and images.pdf don't:
// Underline / StrikeOut / Squiggly marks, a nested bookmark (outline) tree, numbered body-size headings
// ("2.1 Sampling") for wording-based topics once the outline is stripped, and highlights with no text under them.
// Used by test/core/marks.test.js.
//
// Regenerate (from the repo root):   node test/fixtures/make-marks-pdf.js
// The output is committed and byte-stable (fixed dates); update test/core/marks.test.js if positions change.
//
// Layout (Letter, 612x792; body Helvetica 11pt; headings Helvetica-Bold 11pt, so font size finds only the title):
//   page 1  "Field Notes on Marking" (16pt title)
//           "1. Introduction"  para I: Highlight (yellow) on S2, Underline (blue, comment) in S3
//           "2. Methods"       para M: StrikeOut (red) on S2
//           "2.1 Sampling"     para S: Squiggly (green) in S2
//           [figure F1]  loose Highlight (orange, comment), two quads (top and bottom half) covering the figure
//           para T: Highlight (yellow) on the end of its only sentence, right below F1
//   page 2  "3. Results"
//           "3.1 Counts"       para R1: Highlight (green) on S2
//           [figure F2]  loose Highlight (yellow), one quad over the figure (right half of the page), no comment
//           para R2 (no marks)
//           "3.2 Errors"       para E: Underline (purple) in S2
//   page 3  no text layer ("scanned"): [figure F3] loose Highlight (blue, comment "scanned table"), two quads,
//           and a Highlight whose /Rect and quad are all zeros (no usable position)
//   outline Introduction (p1) · Methods (p1) > Sampling (p1) · Results (p2) > Counts (p2), Errors (p2)
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts, PDFName, PDFString, PDFHexString, PDFNumber, rgb } = require("pdf-lib");

const W = 612, H = 792, BODY = 11, LEAD = 14;
const YELLOW = [1, 1, 0], GREEN = [0, 1, 0], RED = [1, 0, 0], BLUE = [0, 0, 1], ORANGE = [1, 0.5, 0], PURPLE = [0.5, 0, 1];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx = doc.context;
  const space = font.widthOfTextAtSize(" ", BODY);

  function annot(page, dict) {
    const ref = ctx.register(ctx.obj({ Type: "Annot", P: page.ref, F: 4, ...dict }));
    let arr = page.node.lookup(PDFName.of("Annots"));
    if (!arr) { arr = ctx.obj([]); page.node.set(PDFName.of("Annots"), arr); }
    arr.push(ref);
  }
  const quadsOf = boxes => boxes.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]);
  const bounds = boxes => [Math.min(...boxes.map(q => q[0])), Math.min(...boxes.map(q => q[1])),
    Math.max(...boxes.map(q => q[2])), Math.max(...boxes.map(q => q[3]))];
  // A markup annotation over the words [from, to] of `words` (one quad per line)
  function mark(page, subtype, words, [from, to], color, comment) {
    const byLine = new Map();
    for (let i = from; i <= to; i++) {
      const w = words[i], q = byLine.get(w.y);
      if (q) q[2] = w.x + w.w; else byLine.set(w.y, [w.x, w.y - 3, w.x + w.w, w.y + BODY]);
    }
    const boxes = [...byLine.values()];
    const d = { Subtype: subtype, Rect: bounds(boxes), QuadPoints: quadsOf(boxes), C: color };
    if (comment) d.Contents = PDFString.of(comment);
    annot(page, d);
  }
  // A Highlight over no text (pdf.js drops Highlights without /QuadPoints, so there are always quads)
  function looseMark(page, rect, boxes, color, comment) {
    const d = { Subtype: "Highlight", Rect: rect, QuadPoints: quadsOf(boxes), C: color };
    if (comment) d.Contents = PDFString.of(comment);
    annot(page, d);
  }
  // A stand-in figure: grey panel with a few shapes, no text
  function figure(page, [x1, y1, x2, y2]) {
    page.drawRectangle({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, color: rgb(0.9, 0.9, 0.9), borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
    const w = x2 - x1, h = y2 - y1;
    page.drawCircle({ x: x1 + w * 0.25, y: y1 + h * 0.5, size: h * 0.3, color: rgb(0.2, 0.5, 0.8) });
    page.drawRectangle({ x: x1 + w * 0.5, y: y1 + h * 0.2, width: w * 0.35, height: h * 0.6, color: rgb(0.85, 0.4, 0.2) });
  }
  function heading(page, t, y) { page.drawText(t, { x: 72, y, size: BODY, font: bold }); return y; }
  // Wrap and draw a paragraph; returns its words ({t, x, y, w}) and the baseline of its last line.
  function para(page, text, x, y, width) {
    const words = [];
    let line = [], lw = 0;
    const flush = () => {
      page.drawText(line.map(w => w.t).join(" "), { x, y, size: BODY, font });
      let cx = x;
      for (const w of line) { words.push({ ...w, x: cx, y }); cx += w.w + space; }
      line = []; lw = 0; y -= LEAD;
    };
    for (const t of text.split(" ")) {
      const w = font.widthOfTextAtSize(t, BODY);
      if (line.length && lw + space + w > width) flush();
      lw += (line.length ? space : 0) + w; line.push({ t, w });
    }
    if (line.length) flush();
    return { words, last: y + LEAD };
  }
  const find = (words, phrase) => {
    const ts = phrase.split(" ");
    for (let i = 0; i + ts.length <= words.length; i++)
      if (ts.every((t, k) => words[i + k].t === t)) return [i, i + ts.length - 1];
    throw new Error("phrase not found: " + phrase);
  };
  const tops = {};   // heading baselines, for the outline

  // ---- page 1 ----
  const p1 = doc.addPage([W, H]);
  p1.drawText("Field Notes on Marking", { x: 72, y: 730, size: 16, font: bold });
  tops.intro = heading(p1, "1. Introduction", 700);
  const i = para(p1, "Field notes record what an observer saw and when. A good note is short and dated. Readers often mark the lines they want to keep with a pen.", 72, 680, 468);
  mark(p1, "Highlight", i.words, find(i.words, "A good note is short and dated."), YELLOW);
  mark(p1, "Underline", i.words, find(i.words, "mark the lines they want to keep"), BLUE, "key idea");
  tops.methods = heading(p1, "2. Methods", i.last - 30);
  const m = para(p1, "We copied every note into a single notebook. Duplicate notes were removed by hand. Each page was checked twice by a second reader.", 72, tops.methods - 20, 468);
  mark(p1, "StrikeOut", m.words, find(m.words, "Duplicate notes were removed by hand."), RED);
  tops.sampling = heading(p1, "2.1 Sampling", m.last - 30);
  const s = para(p1, "Notes were sampled from three field seasons. The sample favours the summer months when most observers were active.", 72, tops.sampling - 20, 468);
  mark(p1, "Squiggly", s.words, find(s.words, "favours the summer months"), GREEN);
  const f1Top = s.last - 20, f1 = [72, f1Top - 120, 300, f1Top];
  figure(p1, f1);
  looseMark(p1, f1, [[72, f1Top - 60, 300, f1Top], [72, f1Top - 120, 300, f1Top - 60]], ORANGE, "sketch of the trap");
  const t = para(p1, "The trap shown above caught most of the moths in the study.", 72, f1Top - 140, 468);
  mark(p1, "Highlight", t.words, find(t.words, "caught most of the moths in the study."), YELLOW);

  // ---- page 2 ----
  const p2 = doc.addPage([W, H]);
  tops.results = heading(p2, "3. Results", 730);
  tops.counts = heading(p2, "3.1 Counts", 700);
  const r1 = para(p2, "Most notes were short. The median note had eleven words.", 72, 680, 468);
  mark(p2, "Highlight", r1.words, find(r1.words, "The median note had eleven words."), GREEN);
  const f2Top = r1.last - 20, f2 = [320, f2Top - 100, 540, f2Top];
  figure(p2, f2);
  looseMark(p2, f2, [f2], YELLOW);
  const r2 = para(p2, "Longer notes came from the second season.", 72, f2Top - 120, 468);
  tops.errors = heading(p2, "3.2 Errors", r2.last - 30);
  const e = para(p2, "Some notes were dated wrongly. These were corrected from the weather records.", 72, tops.errors - 20, 468);
  mark(p2, "Underline", e.words, find(e.words, "corrected from the weather records."), PURPLE);

  // ---- page 3: no text layer ----
  const p3 = doc.addPage([W, H]);
  const f3 = [100, 400, 500, 650];
  figure(p3, f3);
  looseMark(p3, f3, [[100, 560, 500, 650], [100, 400, 500, 470]], BLUE, "scanned table");
  looseMark(p3, [0, 0, 0, 0], [[0, 0, 0, 0]], RED, "no position");

  // ---- outline ----
  const outline = [
    { title: "Introduction", page: p1, y: tops.intro + 12 },
    { title: "Methods", page: p1, y: tops.methods + 12, items: [{ title: "Sampling", page: p1, y: tops.sampling + 12 }] },
    { title: "Results", page: p2, y: tops.results + 12, items: [
      { title: "Counts", page: p2, y: tops.counts + 12 }, { title: "Errors", page: p2, y: tops.errors + 12 }] }
  ];
  const rootRef = ctx.nextRef();
  const build = (items, parentRef) => {
    const refs = items.map(() => ctx.nextRef());
    items.forEach((it, k) => {
      const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: parentRef, Dest: [it.page.ref, PDFName.of("XYZ"), null, it.y, null] });
      if (k > 0) d.set(PDFName.of("Prev"), refs[k - 1]);
      if (k < items.length - 1) d.set(PDFName.of("Next"), refs[k + 1]);
      if (it.items) {
        const kids = build(it.items, refs[k]);
        d.set(PDFName.of("First"), kids[0]); d.set(PDFName.of("Last"), kids[kids.length - 1]); d.set(PDFName.of("Count"), PDFNumber.of(kids.length));
      }
      ctx.assign(refs[k], d);
    });
    return refs;
  };
  const top = build(outline, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: top[0], Last: top[top.length - 1], Count: top.length }));
  doc.catalog.set(PDFName.of("Outlines"), rootRef);

  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1))); doc.setModificationDate(new Date(Date.UTC(2026, 0, 1))); // stable bytes
  const out = path.join(__dirname, "marks.pdf");
  fs.writeFileSync(out, await doc.save({ useObjectStreams: false }));
  console.log("wrote", out);
}

main().catch(e => { console.error(e); process.exit(1); });
