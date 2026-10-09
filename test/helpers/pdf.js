"use strict";
// Shared test helper: load a PDF from disk with the pdf.js legacy (Node) build.
//   const { withPdf, repoPath } = require("./helpers/pdf");
//   await withPdf(repoPath("renderer", "sample.pdf"), async (pdf) => { ... });
// loadPdf() returns the document proxy; call pdf.destroy() when done.
const fs = require("node:fs");
const path = require("node:path");

// The legacy build tries to polyfill DOMMatrix/Path2D from the optional
// `canvas` package (not installed; only needed for rendering) and logs a
// warning at load time. Text and annotation extraction work without it, so
// silence just those lines while requiring.
const pdfjs = (() => {
  const log = console.log;
  console.log = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("Cannot polyfill")) return;
    log(...args);
  };
  try {
    return require("pdfjs-dist/legacy/build/pdf.js");
  } finally {
    console.log = log;
  }
})();

const ROOT = path.resolve(__dirname, "..", "..");

/** Resolve a path relative to the repository root. */
function repoPath(...parts) {
  return path.join(ROOT, ...parts);
}

/** Load a PDF file (path) or bytes and return the pdf.js document proxy. */
async function loadPdf(fileOrBytes) {
  const data =
    typeof fileOrBytes === "string"
      ? new Uint8Array(fs.readFileSync(fileOrBytes))
      : new Uint8Array(fileOrBytes);
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  return task.promise;
}

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
