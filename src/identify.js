// Faelights — recognise a paper identifier or link typed / pasted by the user.
// Pure (no electron, no network) so it can be unit tested with node:test.
"use strict";

const ARXIV_NEW = /^\d{4}\.\d{4,5}(?:v\d+)?$/;
const ARXIV_OLD = /^[a-z][a-z-]*(?:\.[a-z]{2})?\/\d{7}(?:v\d+)?$/i;
const DOI = /^10\.\d{4,9}\/\S+$/;
const PMCID = /^PMC\d{4,9}$/i;

// Strip surrounding quotes / brackets and trailing sentence punctuation.
// A closing ) or ] is only dropped when it is unbalanced: DOIs such as 10.1016/S0140-6736(20)30183-5 contain parens.
function tidy(text) {
  let s = String(text).trim().replace(/^[\s<"'“‘(\[{]+/, "");
  for (;;) {
    const t = s.replace(/[\s>"'”’.,;:!?}]+$/, "");
    const last = t.slice(-1);
    const unbalanced = (o, c) => last === c && t.split(o).length < t.split(c).length;
    s = unbalanced("(", ")") || unbalanced("[", "]") ? t.slice(0, -1) : t;
    if (s === t) return s;
  }
}

const arxiv = id => ({ kind: "arxiv", value: id, url: "https://arxiv.org/abs/" + id });
const doi = d => { d = d.trim(); return DOI.test(d) ? { kind: "doi", value: d, url: "https://doi.org/" + d } : null; };
const dec = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };

// text → {kind: "doi"|"arxiv"|"pmcid"|"url", value, url} or null.
// `url` is the human landing page (what "Open in browser" shows), not necessarily the PDF.
function parseIdentifier(text) {
  if (typeof text !== "string" || text.length > 2048) return null;
  let s = tidy(text);
  if (!s || /\s/.test(s.replace(/^(doi|arxiv):\s+/i, ""))) return null;

  let m;
  if ((m = /^doi:\s*(.+)$/i.exec(s))) return doi(m[1]);
  if ((m = /^arxiv:\s*(.+)$/i.exec(s))) return ARXIV_NEW.test(m[1]) || ARXIV_OLD.test(m[1]) ? arxiv(m[1]) : null;
  if (DOI.test(s)) return doi(s);
  if (ARXIV_NEW.test(s)) return arxiv(s);
  if (ARXIV_OLD.test(s) && !/^www\./i.test(s)) return arxiv(s);
  if (PMCID.test(s)) { const v = s.toUpperCase(); return { kind: "pmcid", value: v, url: `https://pmc.ncbi.nlm.nih.gov/articles/${v}/` }; }

  // links: a scheme-less "doi.org/…", "arxiv.org/…" or "www.…" is treated as https
  if (/^(?:(?:dx\.)?doi\.org\/|(?:www\.|export\.)?arxiv\.org\/|www\.[^/\s]+\.)/i.test(s)) s = "https://" + s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null; // file:, javascript:, data:, ftp: …
  let u;
  try { u = new URL(s); } catch (_) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".") || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "doi.org" || host === "dx.doi.org") return doi(dec(u.pathname.slice(1)) + u.search);
  if (host === "arxiv.org" || host === "export.arxiv.org") {
    m = /^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?$/i.exec(u.pathname);
    if (m && (ARXIV_NEW.test(m[1]) || ARXIV_OLD.test(m[1]))) return arxiv(m[1]);
  }
  if ((m = /\/articles\/(PMC\d{4,9})\/?$/i.exec(u.pathname)) && /(^|\.)ncbi\.nlm\.nih\.gov$/.test(host)) {
    const v = m[1].toUpperCase(); return { kind: "pmcid", value: v, url: u.href };
  }
  return { kind: "url", value: u.href, url: u.href };
}

// Short human label for the dialog hint
function describe(id) {
  if (!id) return "";
  if (id.kind === "doi") return "DOI " + id.value;
  if (id.kind === "arxiv") return "arXiv " + id.value;
  if (id.kind === "pmcid") return "PubMed Central " + id.value;
  try { return "Link · " + new URL(id.url).hostname.replace(/^www\./, ""); } catch (_) { return "Link"; }
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x2F": "/", "#47": "/" };
const unescape = s => s.replace(/&(amp|lt|gt|quot|apos|#39|#x2F|#47);/gi, (_, k) => ENT[k] ?? ENT[k.toLowerCase()] ?? _);
function attrs(tag) {
  const out = {}, re = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m; while ((m = re.exec(tag))) out[m[1].toLowerCase()] = unescape(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}
const absHttp = (href, base) => { try { const u = new URL(href.trim(), base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (_) { return null; } };

// Scan a landing page for its PDF: the Highwire `citation_pdf_url` meta tag most publishers, arXiv and
// repositories emit. Also reports a <meta http-equiv="refresh"> target (DOI resolvers sometimes bounce through one)
// and citation_title, a fallback title for PDFs without one in their metadata.
function findPdfLink(html, baseUrl) {
  const head = String(html).slice(0, 2_000_000);
  let pdf = null, refresh = null, title = null;
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag), name = (a.name || a.property || "").toLowerCase();
    if (!pdf && name === "citation_pdf_url" && a.content) pdf = absHttp(a.content, baseUrl);
    if (!title && name === "citation_title" && a.content.trim()) title = a.content.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!refresh && (a["http-equiv"] || "").toLowerCase() === "refresh" && a.content) {
      const m = /url\s*=\s*['"]?([^'"]+)/i.exec(a.content); if (m) refresh = absHttp(m[1], baseUrl);
    }
  }
  return { pdf, refresh, title };
}

// %PDF- within the first KiB (what PDF readers accept), not the server's content-type
function isPdf(buf) {
  if (!buf || !buf.length) return false;
  return Buffer.from(buf.subarray ? buf.subarray(0, 1024) : String(buf).slice(0, 1024)).includes("%PDF-");
}

// A readable file name for a downloaded PDF
function fileNameFor(id, pdfUrl) {
  const clean = s => s.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
  if (id.kind === "url") {
    try {
      const last = dec(new URL(pdfUrl || id.url).pathname.split("/").filter(Boolean).pop() || "");
      const base = clean(last.replace(/\.pdf$/i, ""));
      if (base) return base + ".pdf";
    } catch (_) {}
    try { return clean(new URL(id.url).hostname) + ".pdf"; } catch (_) { return "download.pdf"; }
  }
  return (clean((id.kind === "arxiv" ? "arXiv_" : "") + id.value) || "download") + ".pdf";
}

// Map a thrown fetch error (Chromium net::ERR_* from Electron's net.fetch, or a Node errno) to a failure reason.
// No connection at all → "offline" so the UI can suggest adding from disk; anything else → "network".
const OFFLINE_CODES = /\b(ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_ACCESS_DENIED|ERR_PROXY_CONNECTION_FAILED|ERR_CONNECTION_REFUSED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENETDOWN)\b/;
function fetchFailureReason(err) {
  if (!err) return "network";
  const text = [err.code, err.cause && err.cause.code, err.message, err.cause && err.cause.message].filter(Boolean).join(" ");
  return OFFLINE_CODES.test(text) ? "offline" : "network";
}

module.exports = { parseIdentifier, describe, findPdfLink, isPdf, fileNameFor, fetchFailureReason };
