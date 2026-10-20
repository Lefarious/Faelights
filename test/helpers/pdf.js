"use strict";
// Shared test helper: load a PDF from disk with the pdf.js legacy (Node) build.
//   const { withPdf, repoPath } = require("./helpers/pdf");
//   await withPdf(repoPath("renderer", "sample.pdf"), async (pdf) => { ... });
// loadPdf() returns the document proxy; call pdf.destroy() when done.
// Opening is core/extract.js openPdf (no DOM, no canvas, font faces off), the same path scripts use.
const path = require("node:path");
const { openPdf, loadPdfjs } = require("../../core/extract.js");

const pdfjs = loadPdfjs();
const ROOT = path.resolve(__dirname, "..", "..");

/** Resolve a path relative to the repository root. */
function repoPath(...parts) {
  return path.join(ROOT, ...parts);
}

/** Load a PDF file (path) or bytes and return the pdf.js document proxy. */
const loadPdf = openPdf;

/** Load a PDF, run fn(pdf), and always destroy the document afterwards. */
async function withPdf(fileOrBytes, fn) {
  const pdf = await loadPdf(fileOrBytes);
  try {
    return await fn(pdf);
  } finally {
    await pdf.destroy();
  }
}

module.exports = { loadPdf, withPdf, repoPath, pdfjs };
