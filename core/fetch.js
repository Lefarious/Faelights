/* Faelights — finding and downloading papers (headless core, Node only)
   From a parsed identifier (identify.js) to PDF bytes: arXiv, DOI (+ CrossRef's full-text links), PMID / PMCID (+ NCBI's open-access bucket),
   ADS bibcodes, ISBN (public scans only) and plain links; plus paper details from CrossRef / arXiv (metadata.js).
   The HTTP transport is passed in, so the desktop app keeps Electron's net stack (system proxy, session cookies)
   and scripts use nodeGet() below. A transport is get(url, accept, maxBytes, opts) → {url, type, html, buf}
   and throws FetchFail(reason). */
"use strict";

const { parseIdentifier, findPdfLink, isPdf, fetchFailureReason } = require("./identify.js");
const { lookupTarget, fromCrossref, fromArxivAtom } = require("./metadata.js");

const FETCH_HEAD_MS = 15000, FETCH_STALL_MS = 30000, MAX_PDF = 150 * 1024 * 1024, MAX_HTML = 5 * 1024 * 1024;
const ACCEPT_ANY = "application/pdf,text/html;q=0.9,*/*;q=0.8";
// reasons: invalid, offline, unreachable, network, not-found, paywalled, not-pdf, too-large, no-free-copy, cancelled
class FetchFail extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const hardFail = e => e.reason === "cancelled" || e.reason === "offline";   // stop trying alternatives

// What a status code means for a download (shared by both transports) → a reason, or null when it's a success
function statusFail(status) {
  if (status === 404 || status === 410) return "not-found";
  if ([401, 402, 403, 451].includes(status)) return "paywalled";
  if (status < 200 || status > 299) return "network";
  return null;
}

/* ---- the resolver ----
   get: the transport; progress({stage, got?, total?}): "find" / "download" for the UI (optional) */
function resolver(get, progress = () => {}) {
  // Fetch a URL; if it is a landing page, follow its citation_pdf_url (or a meta refresh) once
  async function pdfFrom(url, hops = 2) {
    const r = await get(url, ACCEPT_ANY, MAX_PDF);
    if (isPdf(r.buf)) return r;
    if (!r.html || !hops) throw new FetchFail(r.html ? "paywalled" : "not-pdf");  // a PDF link that serves a page is usually a login wall
    const { pdf, refresh, title } = findPdfLink(r.buf.toString("utf8"), r.url);
    if (pdf) { progress({ stage: "download" }); return { ...(await pdfFrom(pdf, 0)), title }; }
    if (refresh && refresh !== r.url) return pdfFrom(refresh, hops - 1);
    throw new FetchFail("not-pdf");
  }

  async function fetchJson(url) {
    const r = await get(url, "application/json", MAX_HTML);
    try { return JSON.parse(r.buf.toString("utf8")) || {}; } catch (_) { throw new FetchFail("network"); }
  }

  /* PMC's article PDFs now sit behind a JavaScript proof-of-work page no plain HTTP client passes (europepmc.org is
     behind a similar Cloudflare check), so the open-access copy comes first: NCBI's PMC Open Access bucket on AWS, no
     bot wall. Then Europe PMC's mirror and PMC itself, in case either lets us through. A source that answers with a
     page instead of %PDF (the bot check) just moves on to the next. */
  async function pmcPdf(id) {
    const v = id.value, OA = "https://pmc-oa-opendata.s3.amazonaws.com/";
    let big = null, gone = false;
    const attempt = async (f, pmc) => {
      try { return await f(); }
      catch (e) { if (hardFail(e)) throw e; if (e.reason === "too-large") big = e; if (pmc && e.reason === "not-found") gone = true; return null; }
    };
    const oa = await attempt(async () => {   // list the article's versions, read the newest one's record, fetch its PDF
      const ls = (await get(`${OA}?list-type=2&prefix=metadata%2F${v}.`, "application/xml", MAX_HTML)).buf.toString("utf8");
      const n = Math.max(0, ...[...ls.matchAll(new RegExp(`<Key>metadata/${v}\\.(\\d+)\\.json</Key>`, "g"))].map(m => +m[1]));
      if (!n) return null;   // not in the open-access subset
      const rec = await fetchJson(`${OA}${v}.${n}/${v}.${n}.json`);
      const key = /^s3:\/\/pmc-oa-opendata\/([\w./-]+\.pdf)(\?|$)/.exec(rec.pdf_url || "");
      if (!key) return null;
      progress({ stage: "download" });
      const r = await get(OA + key[1], "application/pdf", MAX_PDF);
      return isPdf(r.buf) ? { ...r, title: typeof rec.title === "string" ? rec.title.slice(0, 500) : null } : null;
    });
    const r = oa || await attempt(() => pdfFrom(`https://europepmc.org/articles/${v}?pdf=render`, 0))
      || await attempt(() => pdfFrom(id.url), true);
    if (r) return r;
    // PMC copies are free to read, so this isn't a paywall: a browser gets past the bot check
    throw big || new FetchFail(gone ? "not-found" : "no-free-copy");
  }

  async function findPdf(id) {
    progress({ stage: "find" });
    const ax = id.kind === "doi" && /^10\.48550\/arxiv\.(.+)$/i.exec(id.value);  // arXiv's own DOIs
    if (id.kind === "arxiv" || ax) {   // the abs page gives the title too; fall back to the PDF URL if it has no citation link
      const aid = ax ? ax[1] : id.value;
      try { return await pdfFrom("https://arxiv.org/abs/" + aid, 1); }
      catch (err) { if (err.reason !== "not-pdf") throw err; return pdfFrom("https://arxiv.org/pdf/" + aid, 0); }
    }
    if (id.kind === "pmid") {   // PubMed itself has no PDFs: NCBI's ID converter maps to a PMC copy or a DOI
      const soft = e => { if (hardFail(e)) throw e; return {}; };
      const rec = (await fetchJson(`https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${id.value}&format=json&tool=faelights`).catch(soft)).records?.[0] || {};
      if (!rec.pmcid && !rec.doi) {   // the converter only knows PMC articles; PubMed's own summary lists the DOI of the rest
        const sum = (await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${id.value}&retmode=json&tool=faelights`)).result?.[id.value];
        rec.doi = (sum?.articleids || []).find(a => a.idtype === "doi")?.value;
      }
      const pmc = rec.pmcid && parseIdentifier(rec.pmcid), viaDoi = rec.doi && parseIdentifier("doi:" + rec.doi);
      if (pmc && pmc.kind === "pmcid") {
        try { return await findPdf(pmc); } catch (e) { if (!viaDoi || hardFail(e)) throw e; }
      }
      if (viaDoi && viaDoi.kind === "doi") return findPdf(viaDoi);
      throw new FetchFail("no-free-copy");
    }
    if (id.kind === "ads") {
      const ax = /^\d{4}arXiv(\d{4})\.?(\d{4,5})[A-Z.]$/.exec(id.value);   // e.g. 2020arXiv200112345A → 2001.12345
      if (ax) return findPdf({ kind: "arxiv", value: ax[1] + "." + ax[2] });
      // ADS's link gateway redirects to the e-print, the publisher's PDF or ADS's own scan; no API token needed
      let big = null;
      for (const t of ["EPRINT_PDF", "PUB_PDF", "ADS_PDF"]) {
        try { return await pdfFrom(`https://ui.adsabs.harvard.edu/link_gateway/${encodeURIComponent(id.value)}/${t}`, 1); }
        catch (e) { if (hardFail(e)) throw e; if (e.reason === "too-large") big = e; }
      }
      throw big || new FetchFail("paywalled");
    }
    if (id.kind === "isbn") {   // only public-domain scans on Open Library / Internet Archive are free to download
      const str = v => typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
      // the ISBN's own edition: its scan (ocaid) is that exact edition; the work's other scans may be other editions
      const ed = await fetchJson(`https://openlibrary.org/isbn/${id.value}.json`).catch(e => { if (hardFail(e)) throw e; return {}; });
      const docs = (await fetchJson(`https://openlibrary.org/search.json?isbn=${id.value}&fields=key,title,ia,ebook_access`)).docs || [];
      const book = docs.find(d => d.ebook_access === "public" && Array.isArray(d.ia) && d.ia.length);
      const own = str(ed.ocaid), edTitle = str(ed.title) && [str(ed.title), str(ed.subtitle)].filter(Boolean).join(": ");
      const scans = [...new Set([own, ...(book ? book.ia : [])])].filter(x => typeof x === "string" && /^[\w.-]+$/.test(x)).slice(0, 6);
      // a work lists every scan, some lending-only: try a few until one serves its PDF
      for (const ia of scans) {
        try {
          progress({ stage: "download" });
          const r = await get(`https://archive.org/download/${ia}/${ia}.pdf`, "application/pdf", MAX_PDF);
          if (!isPdf(r.buf)) continue;
          // edition: what the add dialog shows next to the title, so a scan of another edition is noticed
          if (ia === own) return { ...r, title: edTitle || str(book && book.title), edition: [str(ed.edition_name), str(ed.publish_date)].filter(Boolean).join(", ") || null };
          return { ...r, title: str(book && book.title) || edTitle, edition: "scan of another edition" };
        } catch (e) { if (hardFail(e) || e.reason === "too-large") throw e; }
      }
      throw new FetchFail("no-free-copy");
    }
    if (id.kind === "pmcid") return pmcPdf(id);
    if (id.kind !== "doi") return pdfFrom(id.url);
    try { return await pdfFrom("https://doi.org/" + id.value.split("/").map(encodeURIComponent).join("/").replace(/%2F/g, "/")); }
    catch (err) {
      if (!["paywalled", "not-pdf", "unreachable"].includes(err.reason)) throw err;   // unreachable: the publisher's host is down or gone
      // CrossRef sometimes lists a full-text PDF link the landing page doesn't expose
      try {
        const cr = await get("https://api.crossref.org/works/" + encodeURIComponent(id.value), "application/json", MAX_HTML);
        const links = (JSON.parse(cr.buf.toString("utf8")).message?.link || []).filter(l => /application\/pdf/i.test(l["content-type"] || "") && /^https?:/i.test(l.URL || ""));
        for (const l of links) { try { return await pdfFrom(l.URL, 0); } catch (e) { if (hardFail(e)) throw e; } }
      } catch (e) { if (hardFail(e)) throw e; }
      // a publisher page with no reachable PDF is access-controlled (or bot-walled) far more often than PDF-less
      throw new FetchFail(err.reason === "unreachable" ? "unreachable" : "paywalled");
    }
  }

  // On Wi-Fi with no internet DNS fails for every host, so before blaming the link, check a service the app uses answers
  const offline = () => get("https://doi.org/", "text/html", MAX_HTML, { quiet: true }).then(() => false, e => e.reason === "offline");
  async function resolvePdf(id) {
    try { return await findPdf(id); }
    catch (e) { if (e.reason === "unreachable" && await offline()) throw new FetchFail("offline"); throw e; }
  }

  return { pdfFrom, fetchJson, resolvePdf };
}

// Bibliographic details for one paper, from {doi, arxiv} and where it was downloaded from (origin)
// → {ok, meta, source, id} | {ok: false, reason}. opts go to the transport (signal, quiet).
async function lookupMeta(get, q, origin, opts) {
  const t = lookupTarget(q, origin);
  if (!t) return { ok: false, reason: "invalid" };
  const id = t.id;
  try {
    let meta;
    if (t.source === "crossref") {
      const r = await get("https://api.crossref.org/works/" + encodeURIComponent(id), "application/json", MAX_HTML, opts);
      try { meta = fromCrossref(JSON.parse(r.buf.toString("utf8"))); } catch (_) { throw new FetchFail("network"); }
    } else {
      const r = await get("https://export.arxiv.org/api/query?id_list=" + encodeURIComponent(id), "application/atom+xml", MAX_HTML, opts);
      meta = fromArxivAtom(r.buf.toString("utf8"));
    }
    if (!meta || !meta.title) return { ok: false, reason: "not-found" };
    return { ok: true, meta, source: t.source, id };
  } catch (err) {
    if (!(err instanceof FetchFail)) console.error("metadata lookup failed", err);
    const reason = err instanceof FetchFail ? err.reason : "network";
    return { ok: false, reason: reason === "cancelled" ? "network" : reason };   // a caller's own timeout
  }
}

/* ---- a transport on Node's fetch ----
   Manual redirects, so every hop is checked to be http(s) and cookies set along the way are sent on (some
   publishers bounce through a cookie check); a size cap and a no-progress timeout, like the app's net.request one.
   One cookie jar per transport: make a new one per command. */
function nodeGet({ userAgent = "Faelights (PDF highlights)", signal: outerSignal, onProgress } = {}) {
  // domain → Map(name → value). A cookie with Domain=x.org goes to x.org and every *.x.org host (publishers' sign-in
  // hosts such as idp.nature.com set cookies for the whole site); without it, only to the host that set it.
  const jar = new Map();
  const cookieFor = u => {
    const host = new URL(u).hostname, out = [];
    for (const [dom, m] of jar) if (host === dom || host.endsWith("." + dom)) for (const [k, v] of m) out.push(k + "=" + v);
    return out.join("; ");
  };
  const keep = (u, res) => {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const host = new URL(u).hostname;
    for (const c of list) {
      const [pair, ...attrs] = c.split(";"), i = pair.indexOf("=");
      if (i <= 0) continue;
      const da = attrs.map(a => a.trim()).find(a => /^domain=/i.test(a));
      let dom = da ? da.slice(7).trim().replace(/^\./, "").toLowerCase() : host;
      if (host !== dom && !host.endsWith("." + dom)) dom = host;   // a cookie for some other site: keep it to this host
      if (!jar.has(dom)) jar.set(dom, new Map());
      jar.get(dom).set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };

  return async function get(url, accept, maxBytes, opts = {}) {
    if (!/^https?:\/\//i.test(url)) throw new FetchFail("invalid");
    const ctl = new AbortController();
    const outer = opts.signal || outerSignal;
    let timer = null, why = "network";
    const arm = ms => { clearTimeout(timer); timer = setTimeout(() => { why = "network"; ctl.abort(); }, ms); };
    const onAbort = () => { why = "cancelled"; ctl.abort(); };
    if (outer) { if (outer.aborted) throw new FetchFail("cancelled"); outer.addEventListener("abort", onAbort); }
    try {
      let at = url, res;
      arm(FETCH_HEAD_MS);
      for (let hops = 0; ; hops++) {
        const headers = { "User-Agent": userAgent, Accept: accept };
        const ck = cookieFor(at); if (ck) headers.Cookie = ck;
        try { res = await fetch(at, { headers, redirect: "manual", signal: ctl.signal }); }
        catch (e) { throw ctl.signal.aborted ? new FetchFail(why) : new FetchFail(fetchFailureReason(e, at)); }
        keep(at, res);
        if (res.status < 300 || res.status > 399 || !res.headers.get("location")) break;
        const next = new URL(res.headers.get("location"), at).href;
        await res.body?.cancel().catch(() => {});
        if (hops >= 10 || !/^https?:\/\//i.test(next)) throw new FetchFail(hops >= 10 ? "network" : "not-pdf");
        at = next;
      }
      const type = (res.headers.get("content-type") || "").toLowerCase(), len = +res.headers.get("content-length") || 0;
      const html = /html|xml/.test(type), cap = html ? MAX_HTML : maxBytes;
      const bad = statusFail(res.status);
      if (bad) { await res.body?.cancel().catch(() => {}); throw new FetchFail(bad); }
      if (len > cap) { await res.body?.cancel().catch(() => {}); throw new FetchFail(html ? "not-pdf" : "too-large"); }
      const chunks = []; let got = 0;
      arm(FETCH_STALL_MS);
      try {
        for await (const c of res.body || []) {
          arm(FETCH_STALL_MS); got += c.length; chunks.push(c);
          if (got > cap) { ctl.abort(); throw new FetchFail(html ? "not-pdf" : "too-large"); }
          if (!html && !opts.quiet && onProgress && got > 65536) onProgress({ stage: "download", got, total: len });
        }
      } catch (e) { if (e instanceof FetchFail) throw e; throw ctl.signal.aborted ? new FetchFail(why) : new FetchFail(fetchFailureReason(e, at)); }
      return { url: at, type, html, buf: Buffer.concat(chunks) };
    } finally {
      clearTimeout(timer);
      if (outer) outer.removeEventListener("abort", onAbort);
    }
  };
}

module.exports = { FetchFail, resolver, lookupMeta, nodeGet, statusFail, hardFail, ACCEPT_ANY, MAX_PDF, MAX_HTML, FETCH_HEAD_MS, FETCH_STALL_MS };
