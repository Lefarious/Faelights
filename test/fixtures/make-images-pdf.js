"use strict";
// Builds test/fixtures/images.pdf: a 2-page document with headings, paragraphs,
// Highlight marks and Square "image capture" boxes, used by test/images.test.js.
//
// Regenerate (from the repo root):   node test/fixtures/make-images-pdf.js
// The output is committed; regenerate only when you change this script, and
// update the expectations in test/images.test.js if positions change.
//
// Layout (Letter, 612x792; body Helvetica 11pt, headings Helvetica-Bold 18pt):
//   page 1  "Moths at Night"           para A (yellow highlight on one sentence)
//           [image A, red]              between para A and para B
//           para B: S0 S1 S2 S3; one highlight runs from S1 into S2, a second sits in S2,
//           so S1+S2 form one merged multi-sentence fact
//           [image B, blue]             top edge falls between two lines of S2 (inside the fact)
//           [image D, blue, comment]    below all text on the page
//   page 2  "Navigation by Moonlight"   para C (green highlight)
//           two-column block (left column drawn first, then right column)
//           [image C, red]              in the right column, between its 2nd and 3rd lines
//           [image L, red] [image R, blue]  side by side, same top, above para E
//           para E (full width)
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts, PDFName, PDFString, rgb } = require("pdf-lib");

const W = 612, H = 792, BODY = 11, LEAD = 14, HEAD = 18;
const YELLOW = [1, 1, 0], GREEN = [0, 1, 0], RED = [1, 0, 0], BLUE = [0, 0, 1];

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
  function square(page, rect, color, comment) {
    const d = { Subtype: "Square", Rect: rect, C: color, BS: { W: 1 }, Subj: PDFString.of("Image") };
    if (comment) d.Contents = PDFString.of(comment);
    annot(page, d);
    const [x1, y1, x2, y2] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
    page.drawRectangle({ x: x1, y: y1, width: x2 - x1, height: y2 - y1,
      color: rgb(0.92, 0.92, 0.92) }); // a stand-in "figure" under the box
  }
  // Highlight the words of `words` whose index is in [from, to] (one quad per line).
  function highlight(page, words, from, to, color) {
    const byLine = new Map();
    for (let i = from; i <= to; i++) {
      const w = words[i], q = byLine.get(w.y);
      if (q) q[2] = w.x + w.w; else byLine.set(w.y, [w.x, w.y - 3, w.x + w.w, w.y + BODY]);
    }
    const quads = [], all = [...byLine.values()];
    for (const [x1, y1, x2, y2] of all) quads.push(x1, y2, x2, y2, x1, y1, x2, y1);
    const rect = [Math.min(...all.map(q => q[0])), Math.min(...all.map(q => q[1])),
      Math.max(...all.map(q => q[2])), Math.max(...all.map(q => q[3]))];
    annot(page, { Subtype: "Highlight", Rect: rect, QuadPoints: quads, C: color });
  }
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

  // ---- page 1 ----
  const p1 = doc.addPage([W, H]);
  p1.drawText("Moths at Night", { x: 72, y: 730, size: HEAD, font: bold });
  const a = para(p1, "Moths are the quiet relatives of butterflies and far outnumber them. Most species fly after dark and rest by day on bark or leaves. Their wings are covered in tiny overlapping scales that rub off like dust when touched. Many moths are drawn to artificial lights for reasons that are still debated.", 72, 700, 468);
  highlight(p1, a.words, ...find(a.words, "Their wings are covered in tiny overlapping scales that rub off like dust when touched."), YELLOW);
  const imgATop = a.last - 16;
  square(p1, [72, imgATop - 80, 300, imgATop], RED); // image A, between para A and para B

  const b = para(p1, "Moths have many enemies. Some moths hear the calls of hunting bats and dive away from them in mid air. This defence works because a tympanal organ on the body picks up ultrasonic clicks and triggers a sudden evasive turn that the bat cannot easily follow through the dark summer sky above the fields and hedges. Other species answer with clicks of their own that jam the sonar of their predators.", 72, imgATop - 110, 468);
  const [h1a] = find(b.words, "dive away from them");
  const [, h1b] = find(b.words, "This defence works");
  highlight(p1, b.words, h1a, h1b, GREEN);
  highlight(p1, b.words, ...find(b.words, "triggers a sudden evasive turn"), GREEN);
  // image B: its top edge sits between the 2nd and 3rd lines of para B, both inside S2
  const ys = [...new Set(b.words.map(w => w.y))];
  const imgBTop = ys[1] - 6;
  // drawn as a slim box at the right margin so the text stays readable
  annot(p1, { Subtype: "Square", Rect: [470, imgBTop - 40, 540, imgBTop], C: BLUE, BS: { W: 1 }, Subj: PDFString.of("Image") });
  square(p1, [200, b.last - 160, 412, b.last - 40], BLUE, "  Wing scales under the microscope  "); // image D

  // ---- page 2 ----
  const p2 = doc.addPage([W, H]);
  p2.drawText("Navigation by Moonlight", { x: 72, y: 730, size: HEAD, font: bold });
  const c = para(p2, "Night flying insects may steer by keeping a bright light source at a fixed angle. With the distant moon this gives a straight path, but a nearby lamp turns the same rule into a spiral.", 72, 700, 468);
  highlight(p2, c.words, ...find(c.words, "a nearby lamp turns the same rule into a spiral."), GREEN);
  const colTop = c.last - 40;
  const left = para(p2, "In the left column we describe field traps that use a white sheet and a mercury vapour lamp to count moths through the season.", 72, colTop, 218);
  const right = para(p2, "In the right column we compare those counts with radar records of moths migrating high above the ground on warm nights.", 322, colTop, 218);
  const rys = [...new Set(right.words.map(w => w.y))];
  square(p2, [340, rys[2] + 2, 520, rys[1] - 4], RED); // image C: box is thin, top edge between right lines 2 and 3
  const pairTop = Math.min(left.last, right.last) - 20;
  square(p2, [322, pairTop - 90, 540, pairTop], BLUE); // image R (added first so order comes from layout, not insertion)
  square(p2, [290, pairTop, 72, pairTop - 90], RED);   // image L, /Rect written corner-swapped (must come out normalised)
  para(p2, "Below the two figures the text runs across the full width of the page again and closes the section.", 72, pairTop - 115, 468);

  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1))); doc.setModificationDate(new Date(Date.UTC(2026, 0, 1))); // stable bytes
  const out = path.join(__dirname, "images.pdf");
  fs.writeFileSync(out, await doc.save({ useObjectStreams: false }));
  console.log("wrote", out);
}

main().catch(e => { console.error(e); process.exit(1); });
