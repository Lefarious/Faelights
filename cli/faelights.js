#!/usr/bin/env node
/* Faelights — command line (T-015)
   A thin shell over core/: read highlights and text from any PDF, and manage the desktop app's library (the same
   <userData>/library folder, through Library.at() and its lock file): add files or papers by identifier, libraries,
   moving, tags and their colours, stars, read state, rescans, paper details, export. No Electron needed. Every change is one locked
   read-modify-write (Library update()), so two commands never interleave. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs } = require("util");
const Extract = require("../core/extract.js");
const Meta = require("../core/meta.js");
const Order = require("../core/order.js");
const ExportFmt = require("../core/export.js");
const Library = require("../core/library.js");
const Identify = require("../core/identify.js");
const Fetch = require("../core/fetch.js");
const Tour = require("../renderer/tour.js");   // pure helpers; the tour itself runs in the app
const { version } = require("../package.json");

const HELP = `Faelights ${version} — pull highlights out of annotated PDFs

Usage: faelights <command> [options]

<pdf> is a PDF in your library: its id, or part of its title or file name (see "list").

Reading
  extract <file.pdf>              Highlights of any PDF, grouped by topic (no library needed)
  export <pdf>                    Highlights of a PDF in your library
  text <pdf | file.pdf>           The PDF's full text, page by page (--pages 1-3,7)
  info <pdf>                      Paper details: title, authors, DOI, pages, tags, read, where it came from
  list [library]                  Your PDFs (all, or one library; --tag, --starred, --read, --unread to filter)
  libraries                       Your libraries
  tags                            Every tag, how many PDFs have it, and its colour
  search <words>...               Highlights containing every word (in the sentence, highlight,
                                  note or topic), across your library or one --library

Adding and scanning
  add <file.pdf | id>...          Add PDFs from disk, or download papers by DOI, arXiv id, PMID,
                                  PMCID, ISBN, ADS bibcode or link. Into the Inbox unless --library.
                                  A file already added from the same path is rescanned instead.
  rescan [pdf...]                 Re-read PDFs that changed or were scanned by an older version
                                  (--all: every PDF)
  lookup <pdf>                    Fill in paper details from CrossRef (DOI) or arXiv

Organising
  library new <name>              Create a library
  library rename <library> <name> Rename a library
  library delete <library>        Delete a library; its PDFs move to the Inbox
  move <pdf> <library>            Move a PDF to another library
  tag <pdf> <tag>...              Add tags
  untag <pdf> <tag>...            Remove tags
  star <pdf> / unstar <pdf>       Star or unstar
  read <pdf>... / unread <pdf>... Mark as read or unread
  tag colour <tag> [<#hex>]       Show or set a tag's colour: #rgb or #rrggbb (quote it, or leave out
                                  the #, since a shell reads # as a comment); none or --clear removes it
  remove <pdf>                    Remove a PDF and the library's copy (your original isn't touched;
                                  --force for one annotated in the app, since those marks live only there)

App
  theme [system|light|dark]       Show or set the app's theme (applies the next time it starts)
  tour [status|skip|restart]      The first-run guided tour: see what's been shown, turn it off,
                                  or have it run again the next time the app opens

Options
  -f, --format <fmt>      md (default), obsidian, html, plain, or json
  -m, --mode <mode>       full: whole sentences with the highlights marked (default); only: just the marks
  -o, --out <file>        Write to a file instead of the screen
  -l, --library <name>    Library name or id (add, list)
  -t, --tag <tag>         Tag new PDFs (add) or filter (list); repeatable
      --starred           Only starred PDFs (list)
      --read, --unread    Only read / unread PDFs (list)
      --clear             Remove a tag's colour (tag colour)
      --pages <list>      Pages for "text", e.g. 1-3,7
      --all               Every PDF (rescan)
      --force             Remove a PDF annotated in the app
      --no-lookup         Don't fetch paper details after adding by identifier
      --frontmatter       Start md/obsidian exports with YAML frontmatter
      --json              Machine-readable output for list, libraries, tags, search, info, add, rescan, tour,
                          read, unread, tag colour
      --data-dir <dir>    The app's data folder (default: where Faelights keeps it, or FAELIGHTS_DATA_DIR)
  -h, --help              Show this help
  -v, --version           Show the version

Captured images aren't included in exports: rendering them needs the app. Close Faelights before
changing the library: the open app saves its own copy and would overwrite the change.`;

const FORMATS = ["md", "obsidian", "html", "plain", "json"];
const MODES = ["full", "only"];
const plural = (n, a, b) => n + " " + (n === 1 ? a : (b || a + "s"));
// Same wording as the app's "Add by identifier" dialog
const ADD_FAIL = {
  invalid: "That doesn't look like an ISBN, DOI, PMID, arXiv ID, ADS bibcode or web link.",
  offline: "You're offline. Connect to the internet to fetch this paper, or add a PDF from your computer.",
  unreachable: "Couldn't find that site. Check the link for typos, or open it in your browser.",
  paywalled: "The publisher didn't hand over the PDF. It may need a subscription or sign-in. Open the page in your browser, download it there, then add the file.",
  "not-pdf": "Couldn't find a PDF there. Open the page in your browser to download it, then add the file.",
  "not-found": "Nothing was found for that. Check it for typos.",
  "no-free-copy": "No free PDF was found for this. Open it in your browser, or add a PDF you already have.",
  network: "Couldn't reach the server, or it took too long. Try again in a moment.",
  "too-large": "That PDF is over 150 MB, so it wasn't downloaded."
};
const LOOKUP_SOURCE = { crossref: "CrossRef", arxiv: "arXiv" };

// A message for the user, not a stack trace. code 2 = usage error.
class Fail extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }
const usage = line => new Fail("Usage: faelights " + line, 2);

function parse(argv) {
  try {
    return parseArgs({
      args: argv, allowPositionals: true, options: {
        format: { type: "string", short: "f" }, mode: { type: "string", short: "m" }, out: { type: "string", short: "o" },
        library: { type: "string", short: "l" }, tag: { type: "string", short: "t", multiple: true },
        starred: { type: "boolean" }, read: { type: "boolean" }, unread: { type: "boolean" }, clear: { type: "boolean" }, pages: { type: "string" }, all: { type: "boolean" }, force: { type: "boolean" },
        "no-lookup": { type: "boolean" }, frontmatter: { type: "boolean" }, json: { type: "boolean" },
        "data-dir": { type: "string" }, help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" }
      }
    });
  } catch (e) { throw new Fail(e.message + "\nRun faelights --help for usage.", 2); }
}

function check(value, allowed, what) {
  if (value !== undefined && !allowed.includes(value)) throw new Fail(`Unknown ${what} "${value}". Use one of: ${allowed.join(", ")}.`, 2);
  return value;
}

function emit(text, out) {
  if (out) { fs.writeFileSync(out, text); console.error("Wrote " + path.resolve(out)); }
  else process.stdout.write(text);
}
const json = v => JSON.stringify(v, null, 2) + "\n";
const note = msg => console.error(msg);
const changed = () => note("If Faelights is open, restart it before changing anything there, or it will overwrite this.");

// Open a PDF once for both metadata and highlights → {title, meta, result} (what the app's analyzeBytes returns)
async function scan(bytes) {
  let pdf;
  try { pdf = await Extract.openPdf(bytes); } catch (e) { throw new Fail("Couldn't read the PDF. It may be damaged or password-protected."); }
  try {
    const meta = await Meta.readMeta(pdf);
    const result = await Extract.analyzePdf(pdf);
    return { title: Meta.cleanTitle(meta.title), meta, result };
  } catch (e) {
    throw new Fail("Couldn't read the PDF. It may be damaged or password-protected.");
  } finally { await pdf.destroy(); }
}
const scanned = (result, mtime) => ({ result, pages: result.pages, scannedAt: Date.now(), ...(mtime != null ? { scannedMtime: mtime } : {}), stale: false, ...Order.summary(result) });

function render(d, o) {
  if (o.format === "json") return json({ id: d.id, title: d.title, pages: d.pages, count: d.count, highlights: Extract.highlights(d.result) });
  const opts = { fmt: o.format, mode: o.mode, frontmatter: !!o.frontmatter, libraryName: o.libraryName };
  return o.format === "html" ? ExportFmt.docHtml(d, opts) : ExportFmt.docText(d, opts);
}

/* ---- library lookups ---- */
function findLibrary(db, q) {
  const l = Library.findLibrary(db, q) || db.libraries.find(l => l.name.toLowerCase() === String(q).toLowerCase());
  if (!l) throw new Fail(`No library called "${q}". Libraries: ${db.libraries.map(l => l.name).join(", ")}.`);
  return l;
}
function findDoc(db, q) {
  const exact = Library.findDoc(db, q);
  if (exact) return exact;
  const s = String(q).toLowerCase();
  const hits = db.docs.filter(d => (d.title || "").toLowerCase().includes(s) || (d.fileName || "").toLowerCase().includes(s));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Fail(`No PDF in your library matches "${q}". Run faelights list to see them.`);
  throw new Fail(`"${q}" matches ${hits.length} PDFs. Use the id:\n` + hits.map(d => `  ${d.id}  ${d.title}`).join("\n"));
}
const libName = (db, id) => (Library.findLibrary(db, id) || {}).name || "?";
const metaOf = d => d.lookup ? { ...d.meta, ...d.lookup.meta } : (d.meta || {});
const sameOrigin = (db, id) => { const v = id.value.toLowerCase(); return db.docs.find(d => d.origin && d.origin.kind === id.kind && String(d.origin.value).toLowerCase() === v); };

// "1-3,7" → Set of page numbers within 1..n
function pageSet(spec, n) {
  if (!spec) return null;
  const out = new Set();
  for (const part of spec.split(",").map(s => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Fail(`Pages should look like 1-3,7, not "${spec}".`, 2);
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let p = Math.max(1, Math.min(a, b)); p <= Math.min(n, Math.max(a, b)); p++) out.add(p);
  }
  return out;
}

/* ---- reading ---- */
async function cmdExtract(args, o) {
  if (args.length !== 1) throw usage("extract <file.pdf> [--format md|obsidian|html|plain|json]");
  const file = path.resolve(args[0]);
  if (!fs.existsSync(file)) throw new Fail("File not found: " + file);
  const { title, result } = await scan(fs.readFileSync(file));
  const d = { title: title || path.basename(file).replace(/\.pdf$/i, ""), fileName: path.basename(file), sourcePath: file,
    pages: result.pages, tags: [], result, ...Order.summary(result) };
  emit(render(d, { ...o, mode: o.mode || "full" }), o.out);
}

async function cmdExport(store, args, o) {
  if (args.length !== 1) throw usage("export <pdf> [--format md|obsidian|html|plain|json]");
  const db = await store.loadDb();
  const d = findDoc(db, args[0]);
  if (!d.result) throw new Fail(`"${d.title}" hasn't been scanned yet. Run faelights rescan "${d.id}".`);
  if ((d.result.v || 1) < Extract.ANALYZER_VERSION) note(`"${d.title}" was scanned by an older version. Run faelights rescan to update it.`);
  emit(render({ tags: [], ...d }, { ...o, mode: o.mode || db.settings.mode, libraryName: libName(db, d.libraryId) }), o.out);
}

async function cmdText(store, args, o) {
  if (args.length !== 1) throw usage("text <pdf | file.pdf> [--pages 1-3,7] [--format plain|json]");
  const file = path.resolve(args[0]);
  let bytes, title;
  if (/\.pdf$/i.test(args[0]) && fs.existsSync(file)) { bytes = fs.readFileSync(file); title = path.basename(file); }
  else { const d = findDoc(await store.loadDb(), args[0]); bytes = (await store.readPdf(d)).bytes; title = d.title; }
  let pdf;
  try { pdf = await Extract.openPdf(bytes); } catch (e) { throw new Fail("Couldn't read the PDF. It may be damaged or password-protected."); }
  const pages = [];
  try {
    const want = pageSet(o.pages, pdf.numPages);
    for (let p = 1; p <= pdf.numPages; p++) {
      if (want && !want.has(p)) continue;
      const tc = await (await pdf.getPage(p)).getTextContent();
      const text = tc.items.map(t => t.str + (t.hasEOL ? "\n" : "")).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      pages.push({ page: p, text });
    }
  } finally { await pdf.destroy(); }
  if (o.format === "json") return emit(json({ title, pages }), o.out);
  emit(pages.map(p => `[Page ${p.page}]\n\n${p.text}\n`).join("\n"), o.out);
}

async function cmdInfo(store, args, o) {
  if (args.length !== 1) throw usage("info <pdf> [--json]");
  const db = await store.checkSources(await store.loadDb());
  const d = findDoc(db, args[0]);
  const m = metaOf(d);
  const info = { id: d.id, title: d.title, authors: m.authors || [], publication: m.publication, date: m.date, volume: m.volume,
    issue: m.issue, pages: m.pages, doi: m.doi, arxiv: m.arxiv, isbn: m.isbn, publisher: m.publisher, url: m.url, abstract: m.abstract,
    keywords: m.keywords || [], library: libName(db, d.libraryId), tags: d.tags || [], starred: !!d.starred,
    read: !!d.read, lastPage: d.lastPage || 0, pdfPages: d.pages, highlights: d.count, images: Order.imagesOf(d.result).length, fileName: d.fileName,
    sourcePath: d.sourcePath || null, sourceMissing: !!d.sourceMissing, stale: !!d.stale, annotated: !!d.annotated,
    origin: d.origin || null, addedAt: d.addedAt ? new Date(d.addedAt).toISOString() : null,
    details: d.lookup ? { source: LOOKUP_SOURCE[d.lookup.source] || d.lookup.source, at: new Date(d.lookup.at).toISOString() } : null };
  if (o.json) return emit(json(info));
  const rows = [
    ["Title", info.title], ["Authors", info.authors.join("; ")], ["Publication", info.publication],
    ["Volume", [info.volume, info.issue && "(" + info.issue + ")"].filter(Boolean).join(" ")], ["Pages", info.pages], ["Date", info.date],
    ["DOI", info.doi], ["arXiv", info.arxiv], ["ISBN", info.isbn], ["Publisher", info.publisher], ["URL", info.url],
    ["Keywords", info.keywords.join(", ")], ["Library", info.library], ["Tags", info.tags.join(", ")], ["Starred", info.starred ? "yes" : ""],
    ["Read", info.read ? "yes" : ""], ["Last page", info.lastPage ? String(info.lastPage) : ""],
    ["PDF", `${plural(info.pdfPages || 0, "page")}, ${plural(info.highlights || 0, "highlight")}` + (info.images ? `, ${plural(info.images, "image")}` : "")],
    ["File", info.sourcePath ? info.sourcePath + (info.sourceMissing ? " (moved or deleted)" : info.stale ? " (changed since scan)" : "") : info.fileName],
    ["From", info.origin ? `${info.origin.kind} ${info.origin.value}` : ""], ["Annotated", info.annotated ? "yes, in Faelights" : ""],
    ["Added", info.addedAt ? info.addedAt.slice(0, 10) : ""], ["Details", info.details ? `from ${info.details.source}, ${info.details.at.slice(0, 10)}` : ""],
    ["ID", info.id]
  ].filter(r => r[1]);
  const w = Math.max(...rows.map(r => r[0].length));
  let out = rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`).join("\n") + "\n";
  if (info.abstract) out += `\n${info.abstract}\n`;
  emit(out);
}

async function cmdLibraries(store, args, o) {
  const db = await store.loadDb();
  const rows = db.libraries.map(l => ({ id: l.id, name: l.name, pdfs: Library.docsIn(db, l.id).length }));
  if (o.json) return emit(json(rows));
  const w = Math.max(...rows.map(r => r.id.length));
  emit(rows.map(r => `${r.id.padEnd(w)}  ${r.name} (${plural(r.pdfs, "PDF")})`).join("\n") + "\n");
}

async function cmdTags(store, args, o) {
  const db = await store.loadDb();
  const tags = [...Library.tagCounts(db)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (o.json) return emit(json(tags.map(([tag, pdfs]) => ({ tag, pdfs, colour: Library.tagColour(db, tag) || null }))));
  if (!tags.length) return emit("No tags yet. Add one with: faelights tag <pdf> <tag>\n");
  emit(tags.map(([t, n]) => `${t} (${plural(n, "PDF")})` + (Library.tagColour(db, t) ? "  " + Library.tagColour(db, t) : "")).join("\n") + "\n");
}

async function cmdList(store, args, o) {
  const db = await store.checkSources(await store.loadDb());
  const q = args[0] || o.library;
  let docs = q ? Library.docsIn(db, findLibrary(db, q).id) : db.docs;
  for (const t of o.tag || []) docs = docs.filter(d => (d.tags || []).includes(Library.cleanTag(t)));
  if (o.starred) docs = docs.filter(d => d.starred);
  if (o.read) docs = docs.filter(d => d.read);
  if (o.unread) docs = docs.filter(d => !d.read);
  const rows = docs.map(d => ({ id: d.id, title: d.title, library: libName(db, d.libraryId), pages: d.pages, highlights: d.count,
    tags: d.tags || [], starred: !!d.starred, read: !!d.read, lastPage: d.lastPage || 0, stale: !!d.stale, sourceMissing: !!d.sourceMissing, sourcePath: d.sourcePath || null }));
  if (o.json) return emit(json(rows));
  if (!rows.length) return emit(db.docs.length ? "No PDFs match.\n" : "No PDFs yet. Add one with: faelights add <file.pdf>\n");
  const w = Math.max(...rows.map(r => r.id.length));
  emit(rows.map(r => `${r.id.padEnd(w)}  ${String(r.highlights ?? 0).padStart(4)} hl  ${r.starred ? "★ " : ""}${r.title}` +
    `  [${r.library}]${r.tags.length ? "  #" + r.tags.join(" #") : ""}${r.read ? "  (read)" : ""}${r.stale ? "  (changed since scan)" : ""}${r.sourceMissing ? "  (original moved)" : ""}`).join("\n") + "\n");
}

async function cmdSearch(store, args, o) {
  const terms = Library.searchTerms(args.join(" "));
  if (!terms.length) throw usage("search <words>... [--library <name>]");
  const db = await store.loadDb();
  const lid = o.library ? findLibrary(db, o.library).id : null;
  const docs = db.docs.filter(d => d.result && (!lid || d.libraryId === lid));
  const found = docs.map(d => ({ d, hits: d.result.entries.filter(e => Library.entryMatches(e, terms)) })).filter(x => x.hits.length);
  if (o.format === "json") o.json = true;
  if (o.json) {
    return emit(json(found.map(({ d, hits }) => ({ id: d.id, title: d.title, library: libName(db, d.libraryId),
      matches: hits.map(e => ({ n: e.n, page: e.page, topic: e.topic ? e.topic.path : null, sentence: e.sentence,
        highlights: e.spans.map(s => ({ text: s.text, comment: s.comment, color: s.color, type: s.type })) })) }))), o.out);
  }
  if (!found.length) return emit(`No highlights contain all of those words (searched ${plural(docs.length, "PDF")}).\n`);
  // plain text unless a format was asked for; md / obsidian mark the highlighted words
  const fmt = o.formatSet && o.format !== "html" ? o.format : "plain", mode = o.mode || db.settings.mode;
  const out = [];
  for (const { d, hits } of found) {
    out.push(`${d.title}  [${libName(db, d.libraryId)}] · ${plural(hits.length, "match", "matches")}  (${d.id})`);
    for (const e of hits) {
      out.push(...ExportFmt.entryLines(e, fmt, mode).map(l => "  " + l));
      if (e.topic) out.push("      › " + e.topic.path.join(" › "));
    }
    out.push("");
  }
  const total = found.reduce((n, x) => n + x.hits.length, 0);
  out.push(`${plural(total, "match", "matches")} in ${plural(found.length, "PDF")}`);
  emit(out.join("\n") + "\n", o.out);
}

/* ---- adding and scanning ---- */
// Paper details from CrossRef / arXiv, stored like the app does (d.lookup; title only if the PDF had none)
async function fetchDetails(d, get) {
  const m = d.meta || {}, origin = d.origin && /^(doi|arxiv)$/.test(d.origin.kind) ? { kind: d.origin.kind, value: d.origin.value } : null;
  if (!m.doi && !m.arxiv && !origin) return { ok: false, reason: "no-id" };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try { return await Fetch.lookupMeta(get, { doi: m.doi || "", arxiv: m.arxiv || "" }, origin, { signal: ctl.signal, quiet: true }); }
  finally { clearTimeout(timer); }
}
function applyDetails(d, r) {
  d.lookup = { source: r.source, id: r.id, at: Date.now(), meta: r.meta };
  if (!d.titleEdited && !Meta.cleanTitle(d.meta && d.meta.title) && Meta.cleanTitle(r.meta.title)) d.title = Meta.cleanTitle(r.meta.title);
}

const transport = () => Fetch.nodeGet({ userAgent: `Faelights/${version} (PDF highlights command line)` });

async function cmdAdd(store, args, o) {
  if (!args.length) throw usage("add <file.pdf | DOI | arXiv id | PMID | PMCID | ISBN | bibcode | link>... [--library <name>] [--tag <tag>]");
  // Each argument is a file on disk (a .pdf that exists) or an identifier
  const items = args.map(a => {
    const file = path.resolve(a);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      if (!/\.pdf$/i.test(file)) throw new Fail("Only PDF files can be added: " + file, 2);
      return { arg: a, file };
    }
    const id = Identify.parseIdentifier(a);
    if (!id) throw new Fail(/\.pdf$/i.test(a) ? "File not found: " + file : `"${a}": ${ADD_FAIL.invalid}`, /\.pdf$/i.test(a) ? 1 : 2);
    return { arg: a, id };
  });
  const before = await store.loadDb();
  const target = o.library ? findLibrary(before, o.library) : Library.findLibrary(before, Library.INBOX);
  const tags = (o.tag || []).map(Library.cleanTag).filter(Boolean);
  const get = transport();
  const { resolvePdf } = Fetch.resolver(get);
  const done = [];
  let failed = 0;

  // A new doc from a PDF already copied into the library folder
  async function addStored(info, extra) {
    try {
      const { title, meta, result } = await scan(fs.readFileSync(info.storedPath));
      const d = { id: info.id, libraryId: target.id, title: title || extra.title || info.fileName.replace(/\.pdf$/i, ""), fileName: info.fileName,
        sourcePath: info.sourcePath, storedPath: info.storedPath, hash: info.hash, addedAt: Date.now(), tags: [...tags], starred: false, read: false, lastPage: 0,
        scannedMtime: info.mtime, meta, ...scanned(result) };
      if (extra.origin) d.origin = extra.origin;
      if (extra.origin && !o["no-lookup"]) {   // added by identifier: fill in details, as the app does
        const r = await fetchDetails(d, get);
        if (r.ok) applyDetails(d, r);
      }
      await store.update(db => { db.docs.push(d); });
      return d;
    } catch (e) { await store.removeStored(info.storedPath); throw e; }
  }

  for (const it of items) {
    const label = it.file ? path.basename(it.file) : Identify.describe(it.id);
    try {
      if (it.file) {
        const existing = before.docs.find(d => d.sourcePath === it.file);
        if (existing) {
          // same as the app: adding a file that's already there rescans it (tags still apply)
          const { bytes, mtime } = await store.readPdf(existing);
          const { meta, result } = await scan(bytes);
          const d = await store.update(db => {
            const d = Library.findDoc(db, existing.id);
            if (d) { Object.assign(d, { meta, ...scanned(result, mtime) }); for (const t of tags) Library.addTag(d, t); }
            return d;
          });
          if (d) done.push({ action: "rescanned", id: d.id, title: d.title, highlights: d.count, library: libName(before, d.libraryId) });
          continue;
        }
        const d = await addStored(await store.importPdf(it.file), {});
        done.push({ action: "added", id: d.id, title: d.title, highlights: d.count, library: target.name });
        continue;
      }
      const dup = sameOrigin(await store.loadDb(), it.id);
      if (dup) { done.push({ action: "exists", id: dup.id, title: dup.title, highlights: dup.count, library: libName(before, dup.libraryId) }); continue; }
      note(`Downloading ${label}…`);
      const r = await resolvePdf(it.id);
      const tmp = path.join(os.tmpdir(), `faelights-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.pdf`);
      let info;
      try { fs.writeFileSync(tmp, r.buf); info = await store.importPdf(tmp); } finally { fs.rmSync(tmp, { force: true }); }
      // no original on disk to track, like the app's downloads
      Object.assign(info, { sourcePath: null, fileName: Identify.fileNameFor(it.id, r.url) });
      const same = (await store.loadDb()).docs.find(d => d.hash === info.hash);
      if (same) {
        await store.removeStored(info.storedPath);
        done.push({ action: "exists", id: same.id, title: same.title, highlights: same.count, library: libName(before, same.libraryId) });
        continue;
      }
      const d = await addStored(info, { origin: { kind: it.id.kind, value: it.id.value, url: r.url }, title: r.title || null });
      done.push({ action: "added", id: d.id, title: d.title, highlights: d.count, library: target.name, origin: d.origin });
    } catch (e) {
      failed++;
      const msg = e instanceof Fetch.FetchFail ? (ADD_FAIL[e.reason] || ADD_FAIL.network) + (it.id && it.id.url ? `\n  ${it.id.url}` : "") : e.message || String(e);
      note(`${label}: ${msg}`);
    }
  }
  if (o.json) emit(json(done));
  else for (const r of done) {
    const what = { added: "Added", rescanned: "Rescanned", exists: "Already in your library:" }[r.action];
    console.log(`${what} ${r.title} (${plural(r.highlights || 0, "highlight")}) → ${r.library}  [${r.id}]`);
  }
  if (done.some(r => r.action !== "exists")) changed();
  if (failed) throw new Fail(`${plural(failed, "item")} couldn't be added.`);
}

async function cmdRescan(store, args, o) {
  const db = await store.checkSources(await store.loadDb());
  const outdated = d => !d.result || (d.result.v || 1) < Extract.ANALYZER_VERSION;
  const docs = args.length ? args.map(a => findDoc(db, a)) : o.all ? db.docs : db.docs.filter(d => d.stale || outdated(d));
  if (!docs.length) return emit(o.json ? json([]) : "Everything is up to date. Use --all to rescan every PDF.\n");
  const done = [];
  let failed = 0;
  for (const d0 of docs) {
    try {
      let read;
      try { read = await store.readPdf(d0); } catch (_) { throw new Fail("The PDF is gone: neither the original nor the library's copy can be read."); }
      const { meta, result } = await scan(read.bytes);
      const d = await store.update(db => {
        const d = Library.findDoc(db, d0.id);
        if (d) Object.assign(d, { meta, ...scanned(result, read.mtime) });
        return d;
      });
      if (d) done.push({ id: d.id, title: d.title, highlights: d.count, from: read.from });
    } catch (e) { failed++; note(`${d0.title}: ${e.message}`); }
  }
  if (o.json) emit(json(done));
  else for (const r of done) console.log(`Rescanned ${r.title} (${plural(r.highlights, "highlight")})${r.from === "copy" ? " from the library's copy" : ""}  [${r.id}]`);
  if (done.length) changed();
  if (failed) throw new Fail(`${plural(failed, "PDF")} couldn't be rescanned.`);
}

async function cmdLookup(store, args, o) {
  if (args.length !== 1) throw usage("lookup <pdf>");
  const d0 = findDoc(await store.loadDb(), args[0]);
  const r = await fetchDetails(d0, transport());
  if (!r.ok) {
    throw new Fail(r.reason === "no-id" ? `"${d0.title}" has no DOI or arXiv id to look up.`
      : r.reason === "offline" ? "You're offline. Looking up details needs a connection."
      : r.reason === "not-found" ? "CrossRef and arXiv have no record of this paper."
      : "Couldn't reach the metadata service. Try again later.");
  }
  const d = await store.update(db => { const d = findDoc(db, d0.id); applyDetails(d, r); return d; });
  if (o.json) return emit(json({ id: d.id, title: d.title, source: r.source, meta: r.meta }));
  console.log(`Details updated from ${LOOKUP_SOURCE[r.source]}: ${d.title}`);
  changed();
}

/* ---- organising: every change is one locked read-modify-write ---- */
async function cmdLibrary(store, args, o) {
  const [sub, ...rest] = args;
  if (!sub || sub === "list") return cmdLibraries(store, rest, o);
  if (sub === "new") {
    if (rest.length !== 1 || !rest[0].trim()) throw usage("library new <name>");
    const name = rest[0].trim();
    const l = await store.update(db => {
      if (db.libraries.some(l => l.name.toLowerCase() === name.toLowerCase())) throw new Fail(`There's already a library called "${name}".`);
      return Library.addLibrary(db, name);
    });
    console.log(`Created library ${l.name}  [${l.id}]`);
  } else if (sub === "rename") {
    if (rest.length !== 2 || !rest[1].trim()) throw usage("library rename <library> <new name>");
    const name = rest[1].trim();
    const [from, l] = await store.update(db => {
      const l = findLibrary(db, rest[0]);
      if (db.libraries.some(x => x !== l && x.name.toLowerCase() === name.toLowerCase())) throw new Fail(`There's already a library called "${name}".`);
      const from = l.name;
      Library.renameLibrary(db, l.id, name);
      return [from, l];
    });
    console.log(`Renamed ${from} → ${l.name}`);
  } else if (sub === "delete") {
    if (rest.length !== 1) throw usage("library delete <library>");
    const [l, n] = await store.update(db => {
      const l = findLibrary(db, rest[0]);
      if (l.system) throw new Fail("The Inbox can't be deleted.");
      const n = Library.docsIn(db, l.id).length;
      Library.removeLibrary(db, l.id);
      return [l, n];
    });
    console.log(`Deleted library ${l.name}` + (n ? `; ${plural(n, "PDF")} moved to the Inbox` : ""));
  } else throw new Fail(`Unknown library command "${sub}". Use new, rename, delete or list.`, 2);
  changed();
}

async function cmdMove(store, args, o) {
  if (args.length !== 2) throw usage("move <pdf> <library>");
  const [d, l, moved] = await store.update(db => {
    const d = findDoc(db, args[0]), l = findLibrary(db, args[1]);
    return [d, l, Library.moveDoc(d, l.id)];
  });
  if (!moved) return console.log(`${d.title} is already in ${l.name}`);
  console.log(`Moved ${d.title} → ${l.name}`);
  changed();
}

async function cmdTag(store, args, o, remove) {
  if (!remove && /^colou?r$/i.test(args[0] || "")) return cmdTagColour(store, args.slice(1), o);
  if (args.length < 2) throw usage(`${remove ? "untag" : "tag"} <pdf> <tag>...`);
  const [d, did] = await store.update(db => {
    const d = findDoc(db, args[0]);
    d.tags = d.tags || [];
    const did = args.slice(1).filter(t => remove ? Library.removeTag(d, Library.cleanTag(t)) : Library.addTag(d, t));
    return [d, did];
  });
  console.log(`${d.title}: ${d.tags.length ? "#" + d.tags.join(" #") : "no tags"}` + (did.length ? "" : remove ? "  (it didn't have those tags)" : "  (it already had those tags)"));
  if (did.length) changed();
}

async function cmdStar(store, args, o, on) {
  if (args.length !== 1) throw usage(`${on ? "star" : "unstar"} <pdf>`);
  const [d, was] = await store.update(db => { const d = findDoc(db, args[0]); const was = !!d.starred; Library.setStar(d, on); return [d, was]; });
  console.log(`${on ? "Starred" : "Unstarred"} ${d.title}` + (was === on ? " (no change)" : ""));
  if (was !== on) changed();
}

// "#3a7", "3a7", "#33AA77" → "#33aa77"; anything else → null
function hexColour(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return "#" + (h.length === 3 ? [...h].map(c => c + c).join("") : h);
}

// tag colour <tag> [<#hex> | none | --clear]: the app's tag menu colour (db.tagColours). Only tags some PDF has
// (or one that still has a colour, so it can be cleared).
async function cmdTagColour(store, args, o) {
  const clear = !!o.clear || /^(none|clear)$/i.test(args[1] || "");
  if (!args.length || args.length > 2 || (o.clear && args.length > 1)) throw usage("tag colour <tag> [<#hex> | none | --clear]");
  const tag = Library.cleanTag(args[0]);
  const known = db => {
    const tags = [...Library.tagCounts(db).keys()];
    if (!tags.includes(tag) && !Library.tagColour(db, tag)) throw new Fail(`No PDF has the tag "${tag}". Tags: ${tags.join(", ") || "none yet"}.`);
  };
  if (args.length === 1 && !clear) {
    const db = await store.loadDb();
    known(db);
    const c = Library.tagColour(db, tag);
    if (o.json) return emit(json({ tag, colour: c || null }));
    return console.log(c || `${tag} has no colour`);
  }
  const colour = clear ? "" : hexColour(args[1]);
  if (colour === null) throw new Fail(`"${args[1]}" isn't a colour. Use #rgb or #rrggbb, e.g. #3a7 or #33aa77.`, 2);
  const was = await store.update(db => { known(db); const was = Library.tagColour(db, tag); Library.setTagColour(db, tag, colour); return was; });
  if (o.json) emit(json({ tag, colour: colour || null, changed: was !== colour }));
  else console.log(`${tag}: ${colour || "no colour"}` + (was === colour ? " (no change)" : ""));
  if (was !== colour) changed();
}

async function cmdRead(store, args, o, on) {
  if (!args.length) throw usage(`${on ? "read" : "unread"} <pdf>...`);
  const done = await store.update(db => [...new Set(args.map(a => findDoc(db, a)))].map(d => { const was = !!d.read; Library.setRead(d, on); return { d, was }; }));
  if (o.json) emit(json(done.map(({ d, was }) => ({ id: d.id, title: d.title, read: d.read, changed: was !== on }))));
  else for (const { d, was } of done) console.log(`Marked ${d.title} as ${on ? "read" : "unread"}` + (was === on ? " (no change)" : ""));
  if (done.some(x => x.was !== on)) changed();
}

async function cmdRemove(store, args, o) {
  if (args.length !== 1) throw usage("remove <pdf> [--force]");
  const d = await store.update(db => {
    const d = findDoc(db, args[0]);
    if (d.annotated && !o.force) throw new Fail(`"${d.title}" was annotated in Faelights; those marks live only in the library's copy and would be lost.\nUse --force to remove it anyway, or "Download PDF" in the app first.`);
    db.docs = db.docs.filter(x => x.id !== d.id);
    return d;
  });
  await store.removeStored(d.storedPath);
  console.log(`Removed ${d.title}` + (d.sourcePath ? `. Your original is still at ${d.sourcePath}` : ""));
  changed();
}

/* ---- app settings ---- */
// Same file and values as the app (main.js THEME_PATH / THEMES); read once at startup
const THEMES = ["system", "light", "dark"];
async function cmdTheme(store, args, o) {
  const file = path.join(store.paths.userData, "theme.json");
  let cur = "system";
  try { const t = JSON.parse(fs.readFileSync(file, "utf8")).theme; if (THEMES.includes(t)) cur = t; } catch (_) {}
  if (!args.length) return console.log(cur);
  const t = check(args[0].toLowerCase(), THEMES, "theme");
  if (args.length > 1) throw usage("theme [system|light|dark]");
  fs.mkdirSync(store.paths.userData, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ theme: t }), "utf8");
  console.log(t === cur ? `The theme is already ${t}` : `Theme set to ${t}. Faelights uses it the next time it starts.`);
}

// settings.tour, as the app keeps it: per chapter, true (skipped / all seen) or the ids of the steps shown
async function cmdTour(store, args, o) {
  const [sub = "status"] = args;
  if (args.length > 1) throw usage("tour [status|skip|restart]");
  if (sub === "status") {
    const settings = (await store.loadDb()).settings;
    const rows = Tour.NAMES.map(ch => {
      const all = Tour.CHAPTERS[ch].length, left = Tour.pending(settings, ch).length, v = settings.tour && settings.tour[ch];
      return { chapter: ch, steps: all, shown: all - left, skipped: v === true };
    });
    if (o.json) return emit(json(rows));
    const w = Math.max(...rows.map(r => r.chapter.length));
    return emit(rows.map(r => `${r.chapter.padEnd(w)}  ${r.skipped ? "done (skipped or finished)" : r.shown ? `${r.shown} of ${r.steps} steps shown` : `not started (${plural(r.steps, "step")})`}`).join("\n") + "\n");
  }
  if (sub === "skip") {
    await store.update(db => { Tour.skipAll(db.settings); });
    console.log("The tour won't show again. Bring it back with: faelights tour restart");
  } else if (sub === "restart") {
    await store.update(db => { db.settings.tour = {}; });   // what Help › Show Tour does
    console.log("The tour will run the next time Faelights opens (or now: Help › Show Tour in the app).");
  } else throw new Fail(`Unknown tour command "${sub}". Use status, skip or restart.`, 2);
  changed();
}

async function main(argv) {
  const { values: o, positionals } = parse(argv);
  if (o.version) return console.log(version);
  const [cmd, ...args] = positionals;
  if (o.help || !cmd || cmd === "help") return console.log(HELP);
  check(o.format, FORMATS, "format");
  check(o.mode, MODES, "mode");
  o.formatSet = o.format !== undefined;
  o.format = o.format || "md";
  if (cmd === "extract") return cmdExtract(args, o);
  const store = Library.at(o["data-dir"] || Library.userDataDir());
  const run = {
    export: cmdExport, text: cmdText, info: cmdInfo, list: cmdList, ls: cmdList, libraries: cmdLibraries, tags: cmdTags,
    add: cmdAdd, rescan: cmdRescan, lookup: cmdLookup, library: cmdLibrary, move: cmdMove, remove: cmdRemove, rm: cmdRemove,
    tag: (s, a, o) => cmdTag(s, a, o, false), untag: (s, a, o) => cmdTag(s, a, o, true),
    star: (s, a, o) => cmdStar(s, a, o, true), unstar: (s, a, o) => cmdStar(s, a, o, false),
    read: (s, a, o) => cmdRead(s, a, o, true), unread: (s, a, o) => cmdRead(s, a, o, false),
    search: cmdSearch, find: cmdSearch, theme: cmdTheme, tour: cmdTour
  }[cmd];
  if (!run) throw new Fail(`Unknown command "${cmd}". Run faelights --help for usage.`, 2);
  return run(store, args, o);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => {
    if (e instanceof Fail) { console.error(e.message); process.exit(e.code); }
    if (e && e.code === "ELOCKED") { console.error("The library is busy (another program is writing to it). Try again in a moment."); process.exit(1); }
    console.error(e && e.stack || e);
    process.exit(1);
  });
}

// scan … applyDetails: shared with the MCP server's add_pdf / add_by_identifier, so its docs match `faelights add`
module.exports = { main, Fail, scan, scanned, ADD_FAIL, sameOrigin, fetchDetails, applyDetails };
