#!/usr/bin/env node
/* Faelights — command line (T-015)
   A thin shell over core/: extract highlights from any PDF, and list / add / export PDFs in the desktop app's
   library (the same <userData>/library folder, through Library.at() and its lock file). No Electron needed. */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseArgs } = require("util");
const Extract = require("../core/extract.js");
const Meta = require("../core/meta.js");
const Order = require("../core/order.js");
const ExportFmt = require("../core/export.js");
const Library = require("../core/library.js");
const { version } = require("../package.json");

const HELP = `Faelights ${version} — pull highlights out of annotated PDFs

Usage: faelights <command> [options]

Commands
  extract <file.pdf>      Print a PDF's highlights, grouped by topic (no library needed)
  libraries               List your libraries
  list [library]          List the PDFs in your library, or in one library
  add <file.pdf>...       Add PDFs to your library (Inbox unless --library); a PDF already
                          added from the same path is rescanned instead
  export <pdf>            Print the highlights of a PDF in your library (id, or part of its title)

Options
  -f, --format <fmt>      md (default), obsidian, html, plain, or json (one row per highlight)
  -m, --mode <mode>       full: whole sentences with the highlights marked (default)
                          only: just the highlighted words
  -o, --out <file>        Write to a file instead of the screen
  -l, --library <name>    Library name or id (add, list)
      --frontmatter       Start md/obsidian exports with YAML frontmatter
      --json              Machine-readable output for libraries, list and add
      --data-dir <dir>    The app's data folder (default: where Faelights keeps it, or FAELIGHTS_DATA_DIR)
  -h, --help              Show this help
  -v, --version           Show the version

Captured images aren't included: rendering them needs the app. Close Faelights before "add":
the open app saves its own copy of the library and would overwrite what the command added.`;

const FORMATS = ["md", "obsidian", "html", "plain", "json"];
const MODES = ["full", "only"];
const plural = (n, a, b) => n + " " + (n === 1 ? a : (b || a + "s"));

// A message for the user, not a stack trace. code 2 = usage error.
class Fail extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }

function parse(argv) {
  try {
    return parseArgs({
      args: argv, allowPositionals: true, options: {
        format: { type: "string", short: "f" }, mode: { type: "string", short: "m" }, out: { type: "string", short: "o" },
        library: { type: "string", short: "l" }, frontmatter: { type: "boolean" }, json: { type: "boolean" },
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

// Open a PDF once for both metadata and highlights → {title, meta, result} (what the app's analyzeBytes returns)
async function scan(bytes) {
  const pdf = await Extract.openPdf(bytes);
  try {
    const meta = await Meta.readMeta(pdf);
    const result = await Extract.analyzePdf(pdf);
    return { title: Meta.cleanTitle(meta.title), meta, result };
  } catch (e) {
    throw new Fail("Couldn't read the PDF. It may be damaged or password-protected.");
  } finally { await pdf.destroy(); }
}

function render(d, o) {
  if (o.format === "json") {
    const rows = Extract.highlights(d.result);
    return JSON.stringify({ id: d.id, title: d.title, pages: d.pages, count: d.count, highlights: rows }, null, 2) + "\n";
  }
  const opts = { fmt: o.format, mode: o.mode, frontmatter: !!o.frontmatter, libraryName: o.libraryName };
  return o.format === "html" ? ExportFmt.docHtml(d, opts) : ExportFmt.docText(d, opts);
}

/* ---- library lookups ---- */
function findLibrary(db, q) {
  const l = Library.findLibrary(db, q) || db.libraries.find(l => l.name.toLowerCase() === q.toLowerCase());
  if (!l) throw new Fail(`No library called "${q}". Libraries: ${db.libraries.map(l => l.name).join(", ")}.`);
  return l;
}
function findDoc(db, q) {
  const exact = Library.findDoc(db, q);
  if (exact) return exact;
  const s = q.toLowerCase();
  const hits = db.docs.filter(d => (d.title || "").toLowerCase().includes(s) || (d.fileName || "").toLowerCase().includes(s));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Fail(`No PDF in your library matches "${q}". Run faelights list to see them.`);
  throw new Fail(`"${q}" matches ${hits.length} PDFs. Use the id:\n` + hits.map(d => `  ${d.id}  ${d.title}`).join("\n"));
}

/* ---- commands ---- */
async function cmdExtract(args, o) {
  if (args.length !== 1) throw new Fail("Usage: faelights extract <file.pdf> [--format md|obsidian|html|plain|json]", 2);
  const file = path.resolve(args[0]);
  if (!fs.existsSync(file)) throw new Fail("File not found: " + file);
  const { title, result } = await scan(fs.readFileSync(file));
  const d = { title: title || path.basename(file).replace(/\.pdf$/i, ""), fileName: path.basename(file), sourcePath: file,
    pages: result.pages, tags: [], result, ...Order.summary(result) };
  emit(render(d, { ...o, mode: o.mode || "full" }), o.out);
}

async function cmdLibraries(store, args, o) {
  const db = await store.loadDb();
  const rows = db.libraries.map(l => ({ id: l.id, name: l.name, pdfs: Library.docsIn(db, l.id).length }));
  if (o.json) return emit(JSON.stringify(rows, null, 2) + "\n");
  const w = Math.max(...rows.map(r => r.id.length));
  emit(rows.map(r => `${r.id.padEnd(w)}  ${r.name} (${plural(r.pdfs, "PDF")})`).join("\n") + "\n");
}

async function cmdList(store, args, o) {
  const db = await store.checkSources(await store.loadDb());
  const q = args[0] || o.library;
  const docs = q ? Library.docsIn(db, findLibrary(db, q).id) : db.docs;
  const libName = id => (Library.findLibrary(db, id) || {}).name || "?";
  const rows = docs.map(d => ({ id: d.id, title: d.title, library: libName(d.libraryId), pages: d.pages, highlights: d.count,
    tags: d.tags || [], starred: !!d.starred, stale: !!d.stale, sourceMissing: !!d.sourceMissing, sourcePath: d.sourcePath || null }));
  if (o.json) return emit(JSON.stringify(rows, null, 2) + "\n");
  if (!rows.length) return emit("No PDFs yet. Add one with: faelights add <file.pdf>\n");
  const w = Math.max(...rows.map(r => r.id.length));
  emit(rows.map(r => `${r.id.padEnd(w)}  ${String(r.highlights ?? 0).padStart(4)} hl  ${r.starred ? "★ " : ""}${r.title}` +
    `  [${r.library}]${r.stale ? "  (changed since scan)" : ""}${r.sourceMissing ? "  (original moved)" : ""}`).join("\n") + "\n");
}

async function cmdAdd(store, args, o) {
  if (!args.length) throw new Fail("Usage: faelights add <file.pdf>... [--library <name>]", 2);
  const files = args.map(a => path.resolve(a));
  for (const f of files) {
    if (!/\.pdf$/i.test(f)) throw new Fail("Only PDF files can be added: " + f, 2);
    if (!fs.existsSync(f)) throw new Fail("File not found: " + f);
  }
  const before = await store.loadDb();
  const target = o.library ? findLibrary(before, o.library) : Library.findLibrary(before, Library.INBOX);
  const done = [];
  let failed = 0;
  for (const f of files) {
    const existing = before.docs.find(d => d.sourcePath === f);
    try {
      if (existing) {
        // same as the app: adding a file that's already there rescans it
        const { bytes, mtime } = await store.readPdf(existing);
        const { meta, result } = await scan(bytes);
        const d = await store.update(db => {
          const d = Library.findDoc(db, existing.id);
          if (d) Object.assign(d, { meta, result, pages: result.pages, scannedAt: Date.now(), scannedMtime: mtime, stale: false, ...Order.summary(result) });
          return d;
        });
        if (d) done.push({ action: "rescanned", id: d.id, title: d.title, highlights: d.count, library: (Library.findLibrary(before, d.libraryId) || {}).name });
        continue;
      }
      const info = await store.importPdf(f);
      try {
        const { title, meta, result } = await scan(fs.readFileSync(info.storedPath));
        const d = { id: info.id, libraryId: target.id, title: title || info.fileName.replace(/\.pdf$/i, ""), fileName: info.fileName,
          sourcePath: info.sourcePath, storedPath: info.storedPath, hash: info.hash, addedAt: Date.now(), tags: [], starred: false,
          scannedMtime: info.mtime, meta, result, pages: result.pages, scannedAt: Date.now(), ...Order.summary(result) };
        await store.update(db => { db.docs.push(d); });
        done.push({ action: "added", id: d.id, title: d.title, highlights: d.count, library: target.name });
      } catch (e) { await store.removeStored(info.storedPath); throw e; }
    } catch (e) {
      failed++;
      console.error(`${path.basename(f)}: ${e instanceof Fail ? e.message : e.message || e}`);
    }
  }
  if (o.json) emit(JSON.stringify(done, null, 2) + "\n");
  else for (const r of done) console.log(`${r.action === "added" ? "Added" : "Rescanned"} ${r.title} (${plural(r.highlights, "highlight")}) → ${r.library}  [${r.id}]`);
  if (done.length) console.error("If Faelights is open, restart it before changing anything there, or it will overwrite this.");
  if (failed) throw new Fail(`${plural(failed, "file")} couldn't be added.`);
}

async function cmdExport(store, args, o) {
  if (args.length !== 1) throw new Fail("Usage: faelights export <id or part of the title> [--format md|obsidian|html|plain|json]", 2);
  const db = await store.loadDb();
  const d = findDoc(db, args[0]);
  if (!d.result) throw new Fail(`"${d.title}" hasn't been scanned yet. Open it in Faelights first.`);
  if ((d.result.v || 1) < Extract.ANALYZER_VERSION) console.error(`"${d.title}" was scanned by an older version. Run faelights add on the original, or open it in the app, to rescan.`);
  const libraryName = (Library.findLibrary(db, d.libraryId) || {}).name;
  emit(render({ tags: [], ...d }, { ...o, mode: o.mode || db.settings.mode, libraryName }), o.out);
}

async function main(argv) {
  const { values: o, positionals } = parse(argv);
  if (o.version) return console.log(version);
  const [cmd, ...args] = positionals;
  if (o.help || !cmd || cmd === "help") return console.log(HELP);
  check(o.format, FORMATS, "format");
  check(o.mode, MODES, "mode");
  o.format = o.format || "md";
  if (cmd === "extract") return cmdExtract(args, o);
  const store = Library.at(o["data-dir"] || Library.userDataDir());
  const run = { libraries: cmdLibraries, list: cmdList, ls: cmdList, add: cmdAdd, export: cmdExport }[cmd];
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

module.exports = { main, Fail };
