// Faelights — online metadata (CrossRef for DOIs, the arXiv API for arXiv ids)
// Pure mapping from API responses to the doc `meta` shape that renderer/app.js readMeta() produces.
// No network here: src/main.js fetches, this module only parses. Used by the `meta:lookup` IPC and the tests.
"use strict";

const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i;
const CROSSREF_TYPE = {
  "journal-article": "Journal Article", "proceedings-article": "Conference Paper", "posted-content": "Preprint",
  "book": "Book", "monograph": "Book", "edited-book": "Book", "reference-book": "Book",
  "book-chapter": "Book Section", "book-section": "Book Section", "report": "Report", "dissertation": "Thesis", "dataset": "Dataset"
};

const text = v => String(v ?? "").replace(/\s+/g, " ").trim();
const first = v => text(Array.isArray(v) ? v[0] : v);
const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
// JATS / HTML markup out: block tags become spaces, inline ones (<i>, <sub>, <jats:italic>…) vanish so words stay whole
const stripTags = s => decode(String(s || "").replace(/<\/?(?:[\w-]+:)?(?:p|sec|title|br|div|list-item)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, ""));
const pad = n => String(n).padStart(2, "0");
function compact(meta) {
  for (const k of Object.keys(meta)) if (meta[k] === "" || meta[k] == null || (Array.isArray(meta[k]) && !meta[k].length)) delete meta[k];
  return meta;
}

// Which service to ask, from the PDF's own fields and where the paper was downloaded from.
// → {source: "crossref", id: doi} | {source: "arxiv", id} | null. arXiv's own DOIs (10.48550/arXiv.*) go to arXiv.
function lookupTarget(meta = {}, origin = null) {
  const doi = text(origin && origin.kind === "doi" ? origin.value : meta.doi);
  const arxiv = text(origin && origin.kind === "arxiv" ? origin.value : meta.arxiv) || (ARXIV_DOI.exec(doi) || [])[1] || "";
  if (doi && !ARXIV_DOI.test(doi)) return { source: "crossref", id: doi };
  if (arxiv) return { source: "arxiv", id: arxiv.replace(/^arxiv:\s*/i, "") };
  return null;
}

// CrossRef /works/{doi} response (or its `message`) → meta
function fromCrossref(json) {
  const m = (json && json.message) || json || {};
  const parts = ((m.published || m.issued || m["published-print"] || m["published-online"] || {})["date-parts"] || [[]])[0] || [];
  const date = parts[0] ? [parts[0], parts[1] && pad(parts[1]), parts[2] && pad(parts[2])].filter(Boolean).join("-") : "";
  const authors = (m.author || []).map(a => text(a.name || [a.given, a.family].filter(Boolean).join(" "))).filter(Boolean);
  const title = first(m.title) + (first(m.subtitle) ? ": " + first(m.subtitle) : "");
  return compact({
    itemType: CROSSREF_TYPE[m.type] || "",
    title: text(stripTags(title)),
    authors,
    abstract: text(stripTags(m.abstract).replace(/^\s*abstract\b[:.]?\s*/i, "")),
    publication: first(m["container-title"]),
    volume: text(m.volume),
    issue: text(m.issue),
    pages: text(m.page).replace(/-/g, "–"),
    date,
    doi: text(m.DOI),
    issn: (m.ISSN || []).join(", "),
    isbn: (m.ISBN || []).join(", "),
    publisher: text(m.publisher),
    url: text(m.URL),
    keywords: (m.subject || []).map(text).filter(Boolean)
  });
}

// arXiv API Atom feed (export.arxiv.org/api/query?id_list=…) → meta, or null when it has no real entry
function fromArxivAtom(xml) {
  const entry = (/<entry\b[^>]*>([\s\S]*?)<\/entry>/i.exec(String(xml || "")) || [])[1];
  if (!entry) return null;
  const tag = name => decode(((new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i")).exec(entry) || [])[1] || "");
  const id = text(tag("id"));
  if (!/arxiv\.org\/abs\//i.test(id)) return null;            // the API answers bad ids with an "Error" entry
  const authors = [...entry.matchAll(/<author\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/gi)].map(x => text(decode(x[1]))).filter(Boolean);
  const cats = [...entry.matchAll(/<category\b[^>]*\bterm="([^"]+)"/gi)].map(x => x[1]);
  return compact({
    itemType: "Preprint",
    title: text(tag("title")),
    authors,
    abstract: text(tag("summary")),
    publication: text(tag("arxiv:journal_ref")),
    date: text(tag("published")).slice(0, 10),
    doi: text(tag("arxiv:doi")),
    arxiv: id.replace(/^.*arxiv\.org\/abs\//i, "").replace(/v\d+$/, ""),
    url: id.replace(/^http:/, "https:"),
    keywords: [...new Set(cats)]
  });
}

module.exports = { lookupTarget, fromCrossref, fromArxivAtom };
