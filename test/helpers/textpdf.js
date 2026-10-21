"use strict";
// Test helper: a one-page PDF with the given lines of Helvetica text (one pdf.js text item per line), saved to a temp
// file so annotate() can mark it up.   const file = await textPdf(["First line.", "Second line."]);
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument, StandardFonts } = require("pdf-lib");

async function textPdf(lines, { size = 12 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([600, 800]);
  lines.forEach((t, i) => page.drawText(t, { x: 50, y: 700 - i * size * 1.3, size, font }));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fl-text-")), "text.pdf");
  fs.writeFileSync(file, await doc.save());
  return file;
}

module.exports = { textPdf };
