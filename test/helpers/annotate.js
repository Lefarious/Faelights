"use strict";
// Test helper: add markup annotations and bookmarks to a PDF in memory with pdf-lib.
//   const bytes = await annotate(repoPath("renderer", "sample.pdf"), { marks: [...], outline: [...] });
// marks:   [{ page, find: "words on one text line", subtype: "Underline" | "StrikeOut" | "Squiggly" | "Highlight",
//             color: [r, g, b] (0–1), contents }]  — or { page, rect: [x1, y1, x2, y2], ... } for a mark over no text
// outline: [{ title, page, y, items: [...] }]  (XYZ destinations)
// Word positions come from pdf.js text items, spread evenly over the item's width like extract.js does.
const fs = require("node:fs");
const { PDFDocument, PDFName, PDFString, PDFHexString, PDFNumber } = require("pdf-lib");
const { openPdf } = require("../../core/extract.js");

async function locate(bytes, page, find) {
  const pdf = await openPdf(bytes);
  try {
    const tc = await (await pdf.getPage(page)).getTextContent();
    const it = tc.items.find(i => i.str && i.str.includes(find));
    if (!it) throw new Error(`"${find}" not found on page ${page}`);
    const i = it.str.indexOf(find), n = it.str.length, size = Math.hypot(it.transform[2], it.transform[3]);
    const x1 = it.transform[4] + (it.width * i) / n, x2 = x1 + (it.width * find.length) / n, y = it.transform[5];
    return [x1, y - size * 0.25, x2, y + size * 0.9];
  } finally { await pdf.destroy(); }
}

async function annotate(file, { marks = [], outline = [] } = {}) {
  const src = new Uint8Array(fs.readFileSync(file));
  const doc = await PDFDocument.load(src);
  const ctx = doc.context;
  for (const m of marks) {
    const [x1, y1, x2, y2] = m.rect || await locate(src, m.page, m.find);
    const annot = ctx.obj({
      Type: "Annot", Subtype: m.subtype, F: 4,
      Rect: [x1 - 1, y1 - 1, x2 + 1, y2 + 1],
      QuadPoints: [x1, y2, x2, y2, x1, y1, x2, y1],
      C: m.color || [1, 0.85, 0.2],
      Contents: PDFString.of(m.contents || "")
    });
    doc.getPage(m.page - 1).node.addAnnot(ctx.register(annot));
  }
  if (outline.length) {
    const rootRef = ctx.nextRef();
    const build = (items, parentRef) => {
      const refs = items.map(() => ctx.nextRef());
      items.forEach((it, k) => {
        const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: parentRef,
          Dest: [doc.getPage(it.page - 1).ref, PDFName.of("XYZ"), null, it.y, null] });
        if (k > 0) d.set(PDFName.of("Prev"), refs[k - 1]);
        if (k < items.length - 1) d.set(PDFName.of("Next"), refs[k + 1]);
        if (it.items && it.items.length) {
          const kids = build(it.items, refs[k]);
          d.set(PDFName.of("First"), kids[0]); d.set(PDFName.of("Last"), kids[kids.length - 1]);
          d.set(PDFName.of("Count"), PDFNumber.of(kids.length));
        }
        ctx.assign(refs[k], d);
      });
      return refs;
    };
    const top = build(outline, rootRef);
    ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: top[0], Last: top[top.length - 1], Count: top.length }));
    doc.catalog.set(PDFName.of("Outlines"), rootRef);
  }
  return doc.save({ useObjectStreams: false });
}

module.exports = { annotate };
