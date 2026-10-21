/* Faelights — MCP tool handlers (T-016)
   Plain async functions over core/ that return JSON-able objects; server.js wires them to the protocol.
   Reads use the library the desktop app keeps (<userData>/library, Library.at) and re-read a PDF only when its saved
   scan is missing, outdated or older than the file. The write tools (add_pdf, add_by_identifier, tag_pdf, star_pdf, mark_read,
   set_tag_colour) refuse while the app is open (its session marker) or another process holds the lock, instead of
   writing something the app would overwrite. Failures are ToolError {code, message}. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Library = require("../core/library.js");
const Extract = require("../core/extract.js");
const Order = require("../core/order.js");
const ExportFmt = require("../core/export.js");
const Identify = require("../core/identify.js");
const Fetch = require("../core/fetch.js");
const Meta = require("../core/meta.js");
const exportPaths = require("../src/exportPaths.js");
const { scan, scanned, ADD_FAIL, sameOrigin, fetchDetails, applyDetails } = require("../cli/faelights.js");
const { version } = require("../package.json");

class ToolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const FORMATS = { markdown: "md", obsidian: "obsidian", plain: "plain" };
const hex = c => "#" + c.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(+v) || 0)).toString(16).padStart(2, "0")).join("");
const rgb = s => { const n = parseInt(String(s).replace(/^#/, ""), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
// Highlighter colours vary a little between apps, so "#ffdb33" also matches a yellow of [255, 214, 64]
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 48;
const topicPath = t => t ? t.path : null;

function tools(dataDir) {
  const store = Library.at(dataDir || Library.userDataDir());
  const load = async () => store.checkSources(await store.loadDb());

  /* ---- lookups ---- */
  function libraryOf(db, q) {
    const l = Library.findLibrary(db, q) || db.libraries.find(l => l.name.toLowerCase() === String(q).toLowerCase());
    if (!l) throw new ToolError("unknown_library", `No library called "${q}". Libraries: ${db.libraries.map(l => l.name).join(", ")}.`);
    return l;
  }
  function docOf(db, id) {
    const d = Library.findDoc(db, id);
    if (!d) throw new ToolError("unknown_pdf", `No PDF with id "${id}" in the library. list_pdfs shows the ids.`);
    return d;
  }
  const libName = (db, id) => (Library.findLibrary(db, id) || {}).name || "?";
  const summary = (db, d) => ({
    id: d.id, title: d.title, library: libName(db, d.libraryId), library_id: d.libraryId, tags: d.tags || [], starred: !!d.starred,
    read: !!d.read, last_page: d.lastPage || null, pages: d.pages ?? null, highlights: d.count ?? null, file: d.sourcePath || d.fileName,
    added: d.addedAt ? new Date(d.addedAt).toISOString() : null, source_missing: !!d.sourceMissing
  });

  async function readBytes(bytes) {
    try { return await scan(bytes); } catch (e) { throw new ToolError("bad_pdf", e.message); }
  }

  // The doc's extraction result: the saved scan, or a fresh read of the file when that's missing or out of date
  // (nothing is written back). → {result, warnings}
  async function resultOf(d) {
    const warnings = [];
    const fresh = d.result && (d.result.v || 1) >= Extract.ANALYZER_VERSION && !d.stale;
    if (!fresh) {
      let bytes = null;
      try { bytes = (await store.readPdf(d)).bytes; } catch (_) {}
      if (bytes) return { result: (await readBytes(bytes)).result, warnings };
      if (!d.result) throw new ToolError("file_missing", `The PDF file for "${d.title}" is missing (${d.sourcePath || d.storedPath}) and it was never scanned.`);
      warnings.push(`The PDF file is missing (${d.sourcePath || d.storedPath}); these are the highlights from its last scan.`);
    } else if (d.sourceMissing) warnings.push(`The original file has moved or been deleted (${d.sourcePath}); reading the library's copy.`);
    return { result: d.result, warnings };
  }

  // Pages without a text layer. Every page → no_text_layer; some → a warning. Older scans only know the pages
  // that have marks but no text (result.loose).
  function checkText(d, result, warnings) {
    const pages = result.textless || [...new Set((result.loose || []).map(l => l.page))];
    if (result.pages && pages.length >= result.pages) {
      throw new ToolError("no_text_layer", `"${d.title}" has no text layer: its pages are scanned images, so highlights can't be matched to words. Run OCR on it, then add it again.`);
    }
    if (pages.length) warnings.push(`Pages ${pages.join(", ")} have no text layer (scanned), so marks there can't be read.`);
    return pages;
  }

  async function readable(pdfId) {
    const db = await load();
    const d = docOf(db, pdfId);
    const { result, warnings } = await resultOf(d);
    const textless = checkText(d, result, warnings);
    return { db, d, result, warnings, textless };
  }

  /* ---- writes ---- */
  function writable() {
    const s = store.appSession();
    if (s) {
      throw new ToolError("library_in_use", `The library is in use: the Faelights app is open (pid ${s.pid}). It keeps its own copy and ` +
        "would overwrite this change the next time it saves. Close the app and try again.");
    }
  }
  async function write(fn) {
    writable();
    try { return await store.update(fn, { wait: 0 }); } catch (e) {
      if (e.code === "ELOCKED") throw new ToolError("library_in_use", "The library is in use: another program is writing to it right now. Try again in a moment.");
      throw e;
    }
  }

  /* ---- tools ---- */
  async function list_libraries() {
    const db = await store.loadDb();
    return { libraries: db.libraries.map(l => ({ id: l.id, name: l.name, system: !!l.system, pdfs: Library.docsIn(db, l.id).length })) };
  }

  async function list_pdfs({ library, tag, starred, read } = {}) {
    const db = await load();
    const lid = library ? libraryOf(db, library).id : null;
    const t = tag ? Library.cleanTag(tag) : null;
    const docs = db.docs.filter(d => (!lid || d.libraryId === lid) && (!t || (d.tags || []).includes(t)) &&
      (starred === undefined || !!d.starred === starred) && (read === undefined || !!d.read === read));
    return { pdfs: docs.map(d => summary(db, d)) };
  }

  async function list_tags() {
    const db = await store.loadDb();
    const tags = [...Library.tagCounts(db)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { tags: tags.map(([tag, pdfs]) => ({ tag, pdfs, colour: Library.tagColour(db, tag) || null })) };
  }

  async function get_extracts({ pdf_id, mode = "full", colours, topic }) {
    const { d, result, warnings, textless } = await readable(pdf_id);
    const want = colours && colours.length ? colours.map(rgb) : null;
    const q = topic ? topic.toLowerCase() : null;
    const entries = result.entries
      .map(e => want ? { ...e, spans: e.spans.filter(s => want.some(c => near(c, s.color))) } : e)
      .filter(e => e.spans.length && (!q || (e.topic && e.topic.path.join(" › ").toLowerCase().includes(q))));
    const groups = ExportFmt.groupsOf(entries).map(g => ({
      topic: topicPath(g.topic), topic_page: g.topic ? g.topic.page : null,
      extracts: g.items.map(e => ({
        n: e.n, page: e.page,
        text: mode === "full" ? e.sentence : e.spans.map(s => s.text).join(" … "),
        highlights: e.spans.map(s => ({ text: s.text, colour: hex(s.color), type: s.type, comment: s.comment || null }))
      }))
    }));
    return {
      pdf_id: d.id, title: d.title, mode, pages: result.pages, topic_source: result.topicSource || null,
      extracts: entries.length, topics: groups,
      unreadable_marks: (result.loose || []).map(l => ({ page: l.page, colour: hex(l.color), type: l.type, comment: l.comment || null })),
      textless_pages: textless, warnings
    };
  }

  async function search({ query, scope = "all", library, limit = 50 }) {
    const terms = Library.searchTerms(query);
    if (!terms.length) throw new ToolError("invalid_input", "The query is empty.");
    const db = await store.loadDb();
    const lid = library ? libraryOf(db, library).id : null;
    const field = {
      sentence: e => e.sentence,
      highlight: e => e.spans.map(s => s.text).join(" "),
      note: e => e.spans.map(s => s.comment || "").join(" ")
    }[scope];
    const matches = field ? e => { const h = field(e).toLowerCase(); return terms.every(t => h.includes(t)); } : e => Library.entryMatches(e, terms);
    const docs = db.docs.filter(d => d.result && (!lid || d.libraryId === lid));
    const hits = [];
    for (const d of docs) {
      for (const e of d.result.entries) {
        if (!matches(e)) continue;
        hits.push({ pdf_id: d.id, title: d.title, library: libName(db, d.libraryId), page: e.page, topic: topicPath(e.topic), sentence: e.sentence,
          highlights: e.spans.map(s => ({ text: s.text, colour: hex(s.color), type: s.type, comment: s.comment || null })) });
      }
    }
    return { query, scope, searched_pdfs: docs.length, total: hits.length, truncated: hits.length > limit, matches: hits.slice(0, limit) };
  }

  const exportDoc = (db, d, result) => ({ tags: [], ...d, result, pages: result.pages, ...Order.summary(result) });
  const exportText = (db, d, result, fmt, mode, frontmatter) =>
    ExportFmt.docText(exportDoc(db, d, result), { fmt, mode: mode || db.settings.mode, frontmatter, libraryName: libName(db, d.libraryId) });

  async function export_pdf({ pdf_id, format = "markdown", mode, frontmatter = false }) {
    const { db, d, result, warnings } = await readable(pdf_id);
    return { pdf_id: d.id, title: d.title, format, text: exportText(db, d, result, FORMATS[format], mode, frontmatter), warnings };
  }

  // What the app's "Export library" writes, minus captured images: a folder named after the library inside out_dir,
  // one file per PDF (frontmatter on md/obsidian). PDFs that can't be read are listed in `skipped`.
  async function export_library({ library, out_dir, format = "markdown", mode }) {
    if (!path.isAbsolute(out_dir)) throw new ToolError("invalid_input", `out_dir must be an absolute path, not "${out_dir}".`);
    const db = await load();
    const l = libraryOf(db, library), fmt = FORMATS[format];
    const dir = path.join(out_dir, ExportFmt.fileBase(l.name));
    const used = new Set(), files = [], skipped = [];
    for (const d of Library.docsIn(db, l.id)) {
      let text;
      try {
        const { result, warnings } = await resultOf(d);
        checkText(d, result, warnings);
        text = exportText(db, d, result, fmt, mode, fmt !== "plain");
      } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        skipped.push({ pdf_id: d.id, title: d.title, code: e.code, reason: e.message });
        continue;
      }
      let n = ExportFmt.fileBase(d.title), k = 2;
      while (used.has(n.toLowerCase())) n = ExportFmt.fileBase(d.title) + " " + k++;
      used.add(n.toLowerCase());
      files.push({ pdf_id: d.id, file: n + ExportFmt.extOf(fmt), text });
    }
    if (!files.length) return { library: l.name, dir: null, files: [], skipped };
    const plan = files.map(f => ({ ...f, abs: exportPaths.resolveInside(dir, f.file) }));
    fs.mkdirSync(dir, { recursive: true });
    for (const f of plan) {
      const tmp = f.abs + "." + process.pid + "-" + crypto.randomBytes(4).toString("hex") + ".tmp";
      fs.writeFileSync(tmp, f.text);
      fs.renameSync(tmp, f.abs);
    }
    return { library: l.name, dir, files: plan.map(f => ({ pdf_id: f.pdf_id, path: f.abs })), skipped };
  }

  // Same as the app and `faelights add`: a file already added from the same path is rescanned instead (tags still apply)
  async function add_pdf({ path: p, library, tags = [] }) {
    const file = path.resolve(p);
    let st = null;
    try { st = fs.statSync(file); } catch (_) {}
    if (!st || !st.isFile()) throw new ToolError("file_missing", "File not found: " + file);
    if (!/\.pdf$/i.test(file)) throw new ToolError("invalid_input", "Only PDF files can be added: " + file);
    writable();
    const before = await store.loadDb();
    const target = library ? libraryOf(before, library) : Library.findLibrary(before, Library.INBOX);
    const clean = tags.map(Library.cleanTag).filter(Boolean);
    const warnings = [];
    const textWarn = result => { try { checkText({ title: path.basename(file) }, result, warnings); } catch (e) { warnings.push(e.message); } };

    const existing = before.docs.find(d => d.sourcePath === file);
    if (existing) {
      const { bytes, mtime } = await store.readPdf(existing);
      const { meta, result } = await readBytes(bytes);
      textWarn(result);
      const d = await write(db => {
        const d = docOf(db, existing.id);
        Object.assign(d, { meta, ...scanned(result, mtime) });
        d.title = Meta.docTitle(d);
        d.tags = d.tags || [];
        for (const t of clean) Library.addTag(d, t);
        return d;
      });
      return { action: "rescanned", pdf: summary(before, d), warnings };
    }

    const info = await store.importPdf(file);
    try {
      const { meta, result } = await readBytes(fs.readFileSync(info.storedPath));
      textWarn(result);
      const d = { id: info.id, libraryId: target.id, title: "", fileName: info.fileName,
        sourcePath: info.sourcePath, storedPath: info.storedPath, hash: info.hash, addedAt: Date.now(), tags: [...new Set(clean)], starred: false, read: false, lastPage: 0, shelfId: null, notes: [],
        scannedMtime: info.mtime, meta, ...scanned(result) };
      d.title = Meta.docTitle(d);
      await write(db => { db.docs.push(d); });
      return { action: "added", pdf: summary(before, d), warnings };
    } catch (e) { await store.removeStored(info.storedPath); throw e; }
  }

  // Download a paper by DOI, arXiv id, PMID, PMCID, ISBN, ADS bibcode or link, as `faelights add <id>` does: skip papers
  // already there (same identifier, or same file contents), keep no original on disk, fill in details from CrossRef /
  // arXiv. The only tool that uses the network. Download failures → codes named after core/fetch.js reasons.
  // progress({stage: "find" | "download" | "details", got?, total?}) is called as it goes (optional).
  async function add_by_identifier({ identifier, library, tags = [], lookup = true }, progress = () => {}) {
    const id = Identify.parseIdentifier(identifier);
    if (!id) throw new ToolError("invalid_input", `"${identifier}": ${ADD_FAIL.invalid}`);
    writable();
    const before = await store.loadDb();
    const target = library ? libraryOf(before, library) : Library.findLibrary(before, Library.INBOX);
    const clean = tags.map(Library.cleanTag).filter(Boolean);
    const exists = d => ({ action: "exists", pdf: summary(before, d), warnings: [] });
    const dup = sameOrigin(before, id);
    if (dup) return exists(dup);

    const get = Fetch.nodeGet({ userAgent: `Faelights/${version} (PDF highlights MCP server)`, onProgress: progress });
    let r;
    try { r = await Fetch.resolver(get, progress).resolvePdf(id); } catch (e) {
      const reason = e instanceof Fetch.FetchFail ? e.reason : "network";
      throw new ToolError(reason.replace(/-/g, "_"), (ADD_FAIL[reason] || ADD_FAIL.network) + (id.url ? ` (${id.url})` : ""));
    }
    const tmp = path.join(os.tmpdir(), `faelights-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.pdf`);
    let info;
    try { fs.writeFileSync(tmp, r.buf); info = await store.importPdf(tmp); } finally { fs.rmSync(tmp, { force: true }); }
    Object.assign(info, { sourcePath: null, fileName: Identify.fileNameFor(id, r.url) });
    const same = (await store.loadDb()).docs.find(d => d.hash === info.hash);
    if (same) { await store.removeStored(info.storedPath); return exists(same); }

    try {
      const { meta, result } = await readBytes(fs.readFileSync(info.storedPath));
      const warnings = [];
      try { checkText({ title: info.fileName }, result, warnings); } catch (e) { warnings.push(e.message); }
      const d = { id: info.id, libraryId: target.id, title: "", fileName: info.fileName,
        sourcePath: null, storedPath: info.storedPath, hash: info.hash, addedAt: Date.now(), tags: [...new Set(clean)], starred: false, read: false, lastPage: 0, shelfId: null, notes: [],
        scannedMtime: info.mtime, meta, ...scanned(result), origin: { kind: id.kind, value: id.value, url: r.url } };
      const source = Meta.pickTitle({ source: r.title });   // the resolver's title beats the PDF's own (T-035)
      if (source) d.sourceTitle = source;
      d.title = Meta.docTitle(d);
      let details = null;
      if (lookup) {
        progress({ stage: "details" });
        const got = await fetchDetails(d, get);
        if (got.ok) { applyDetails(d, got); details = got.source; }
      }
      await write(db => { db.docs.push(d); });
      return { action: "added", pdf: summary(before, d), origin: d.origin, details, warnings };
    } catch (e) { await store.removeStored(info.storedPath); throw e; }
  }

  async function tag_pdf({ pdf_id, tags }) {
    const [db, d, added] = await write(db => {
      const d = docOf(db, pdf_id);
      d.tags = d.tags || [];
      return [db, d, tags.map(t => Library.addTag(d, t)).filter(Boolean)];
    });
    return { pdf_id: d.id, title: d.title, added, tags: d.tags, changed: added.length > 0, pdf: summary(db, d) };
  }

  async function star_pdf({ pdf_id, starred }) {
    const [db, d, was] = await write(db => { const d = docOf(db, pdf_id); const was = !!d.starred; Library.setStar(d, starred); return [db, d, was]; });
    return { pdf_id: d.id, title: d.title, starred: !!d.starred, changed: was !== !!d.starred };
  }

  async function mark_read({ pdf_id, read }) {
    const [d, was] = await write(db => { const d = docOf(db, pdf_id); const was = !!d.read; Library.setRead(d, read); return [d, was]; });
    return { pdf_id: d.id, title: d.title, read: !!d.read, changed: was !== !!d.read };
  }

  // colour: "#rgb" / "#rrggbb", or null to remove it. Only tags some PDF has (or one still coloured, to clear it).
  async function set_tag_colour({ tag, colour }) {
    let c = "";
    if (colour) {
      const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
      if (!m) throw new ToolError("invalid_input", `"${colour}" isn't a colour. Use #rgb or #rrggbb, e.g. #3a7 or #33aa77.`);
      const h = m[1].toLowerCase();
      c = "#" + (h.length === 3 ? [...h].map(x => x + x).join("") : h);
    }
    const t = Library.cleanTag(tag);
    const was = await write(db => {
      const tags = [...Library.tagCounts(db).keys()];
      if (!tags.includes(t) && !Library.tagColour(db, t)) throw new ToolError("unknown_tag", `No PDF has the tag "${t}". Tags: ${tags.join(", ") || "none yet"}.`);
      const was = Library.tagColour(db, t);
      Library.setTagColour(db, t, c);
      return was;
    });
    return { tag: t, colour: c || null, changed: was !== c };
  }

  /* ---- resource: faelights://pdf/{id} ---- */
  async function pdf_markdown(id) {
    const { db, d, result } = await readable(id);
    return exportText(db, d, result, "md", null, false);
  }
  async function pdf_resources() {
    const db = await store.loadDb();
    return db.docs.map(d => ({ id: d.id, title: d.title, library: libName(db, d.libraryId) }));
  }

  return { store, list_libraries, list_pdfs, list_tags, get_extracts, search, export_pdf, export_library, add_pdf, add_by_identifier, tag_pdf, star_pdf,
    mark_read, set_tag_colour, pdf_markdown, pdf_resources };
}

module.exports = { tools, ToolError, FORMATS };
