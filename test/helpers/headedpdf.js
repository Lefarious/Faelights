"use strict";
// Test helper: a PDF of headings and body text at chosen font sizes, one pdf.js text item per row, saved to a temp
// file so annotate() can mark it up. Returns the file and each row's baseline y (for outline destinations).
//   const { file, ys } = await headedPdf([[["Title", 22], ["Body text.", 11]], [["Page two", 16]]]);
// pages: [[[text, size, gap?], ...], ...]; gap: space above the row (default: more above headings than body lines)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument, StandardFonts } = require("pdf-lib");

async function headedPdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ys = [];
  for (const rows of pages) {
    const page = doc.addPage([600, 800]);
    let y = 740;
    const py = [];
    for (const [t, size, gap] of rows) {
      y -= gap != null ? gap : size > 12 ? size * 2.2 : size * 1.4;
      page.drawText(t, { x: 50, y, size, font });
      py.push(y + size);
    }
    ys.push(py);
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fl-head-")), "headed.pdf");
  fs.writeFileSync(file, await doc.save());
  return { file, ys };
}

// A numbered report: same-size "1" and "1.1", a number on its own line ("12" / "Results"), "3" and "3.1" with no text
// between them, highlights under 1.1, 1.1.2, 2, 3.1 and 12.1.12 only. outline: "none" | "plain" (flat bookmarks without
// the numbers) | "numbered" (flat bookmarks with them). → PDF bytes
const H = 16, S = 13, B = 11;
const NUMBERED_PAGES = [[
  ["Numbered Report", 22],
  ["1 Introduction", H], ["Plain words open the report here.", B],
  ["1.1 Scope", H], ["The scope covers alpha cases only.", B],
  ["1.1.2 Detail", S], ["Detail matters for beta runs.", B],
  ["2 Methods", H], ["We measured gamma twice.", B],
  ["3 Discussion", H], ["3.1 Limits", H, H * 1.3], ["Limits are epsilon bound.", B]
], [
  ["12", H], ["Results", H, H * 1.2], ["Results come next in order.", B],
  ["12.1 Data", H], ["Data were kept.", B],
  ["12.1.12 Section A", S], ["Section A reports delta values.", B]
]];
const NUMBERED_HEADS = [[1, 1, "1", "Introduction"], [1, 3, "1.1", "Scope"], [1, 5, "1.1.2", "Detail"], [1, 7, "2", "Methods"],
  [1, 9, "3", "Discussion"], [1, 10, "3.1", "Limits"], [2, 0, "12", "Results"], [2, 3, "12.1", "Data"], [2, 5, "12.1.12", "Section A"]];
async function numberedPdf(outline = "none") {
  const { annotate } = require("./annotate");
  const { file, ys } = await headedPdf(NUMBERED_PAGES);
  const marks = [[1, "alpha cases"], [1, "beta runs"], [1, "gamma twice"], [1, "epsilon bound"], [2, "delta values"]]
    .map(([page, find]) => ({ page, find, subtype: "Highlight" }));
  const bookmarks = outline === "none" ? [] : NUMBERED_HEADS.map(([page, row, num, title]) =>
    ({ title: outline === "numbered" ? num + " " + title : title, page, y: ys[page - 1][row] }));
  return annotate(file, { marks, outline: bookmarks });
}

module.exports = { headedPdf, numberedPdf };
