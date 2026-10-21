/* Faelights — PDF metadata (headless core; no DOM, no IPC)
   Bibliographic + file metadata, Zotero-style: XMP (dc / prism) first, then the Info dictionary, then a DOI / arXiv
   scan of page 1. Moved from renderer/app.js so the app and scripts (cli/) fill d.meta and d.title the same way.
   Loaded by a <script> tag in the renderer (global `Meta`, after pdf.min.js) and by require() in Node. */
"use strict";

const Meta = (() => {
  // pdf.js for PDFDateString: the renderer's global, else the Node legacy build (through extract.js)
  const lib = () => typeof pdfjsLib !== "undefined" ? pdfjsLib : require("./extract.js").loadPdfjs();

  function cleanTitle(t) {
    t = (t || "").replace(/^Microsoft (Word|PowerPoint) - /i, "").replace(/\.(docx?|pptx?|pdf)$/i, "").trim();
    if (!t || /^untitled$/i.test(t) || t.length < 3) return "";
    return t;
  }
  // The title a doc gets (T-035), the same in the app, the CLI and the MCP server: one the user typed, else the source's
  // (what the resolver found: citation_title, PMC, Open Library), else the PDF's own, else the CrossRef / arXiv record's,
  // else the one it already has, else the file name. Pure.
  function pickTitle({ edited, source, embedded, found, current, fileName } = {}) {
    const c = t => cleanTitle(typeof t === "string" ? t.replace(/\s+/g, " ") : "");
    if (typeof edited === "string" && edited.trim()) return edited.trim();
    return c(source) || c(embedded) || c(found) || (current || "").trim() || (fileName || "").replace(/\.pdf$/i, "");
  }
  // pickTitle for a doc: d.sourceTitle (kept from adding), d.meta (the last scan), d.lookup (T-001 details)
  const docTitle = d => pickTitle({ edited: d.titleEdited && d.title, source: d.sourceTitle, embedded: d.meta && d.meta.title,
    found: d.lookup && d.lookup.meta && d.lookup.meta.title, current: d.title, fileName: d.fileName });
  const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;:)\]])/i;
  const ARXIV_RE = /\barXiv:\s?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i;
  const pdfDate = s => { try { const d = s && lib().PDFDateString.toDateObject(s); return d ? d.getTime() : null; } catch (_) { return null; } };

  async function readMeta(pdf) {
    let info = {}, xmp = null;
    try { const md = await pdf.getMetadata(); info = md.info || {}; xmp = md.metadata; } catch (_) {}
    const x = (...keys) => { for (const k of keys) { const v = xmp && xmp.get(k); if (v && (!Array.isArray(v) || v.length)) return v; } return null; };
    const str = v => (Array.isArray(v) ? v.join("; ") : typeof v === "string" ? v : "").replace(/\s+/g, " ").trim();
    const list = v => (Array.isArray(v) ? v : String(v || "").split(/\s*[;,]\s*/)).map(s => s.trim()).filter(Boolean);
    const authors = list(x("dc:creator") || (info.Author ? String(info.Author).split(/\s*(?:;|\band\b|&)\s*/) : []));
    let doi = str(x("prism:doi", "pdfx:doi", "crossmark:doi")).replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "");
    // only page 1: later pages start citing other papers' DOIs
    let arxiv = "";
    try {
      const text = (await (await pdf.getPage(1)).getTextContent()).items.map(t => t.str).join(" ");
      if (!doi) doi = (text.match(DOI_RE) || [])[1] || "";
      arxiv = (text.match(ARXIV_RE) || [])[1] || "";
    } catch (_) {}
    const start = str(x("prism:startingpage")), end = str(x("prism:endingpage"));
    const meta = {
      title: str(x("dc:title")) || str(info.Title),
      authors,
      abstract: str(x("dc:description")) || str(info.Subject),
      publication: str(x("prism:publicationname")),
      volume: str(x("prism:volume")),
      issue: str(x("prism:number")),
      pages: str(x("prism:pagerange")) || (start ? start + (end ? "–" + end : "") : ""),
      date: str(x("prism:coverdate", "prism:publicationdate")).slice(0, 10),
      doi,
      arxiv,
      issn: str(x("prism:issn", "prism:eissn")),
      isbn: str(x("prism:isbn")),
      publisher: str(x("dc:publisher")),
      url: str(x("prism:url")),
      rights: str(x("dc:rights")),
      keywords: list(x("dc:subject") || info.Keywords),
      creator: str(x("xmp:creatortool")) || str(info.Creator),
      producer: str(x("pdf:producer")) || str(info.Producer),
      created: pdfDate(info.CreationDate),
      modified: pdfDate(info.ModDate),
      pdfVersion: str(info.PDFFormatVersion)
    };
    for (const k of Object.keys(meta)) if (meta[k] === "" || meta[k] == null || (Array.isArray(meta[k]) && !meta[k].length)) delete meta[k];
    return meta;
  }

  return { cleanTitle, pickTitle, docTitle, readMeta, DOI_RE, ARXIV_RE };
})();

if (typeof module !== "undefined") module.exports = Meta;
