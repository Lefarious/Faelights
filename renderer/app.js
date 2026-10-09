/* Faelights desktop — renderer */
"use strict";
pdfjsLib.GlobalWorkerOptions.workerSrc = "../node_modules/pdfjs-dist/build/pdf.worker.min.js";

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const svg = d => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.classList.add("ico"); s.innerHTML = d; return s; };
const ICON = {
  lib: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h12"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  all: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  open: '<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  add: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  pub: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><circle cx="12" cy="13" r="2"/><path d="M8.5 18.5a3.5 3.5 0 0 1 7 0"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  paneClose: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M16 15l-3-3 3-3"/>',
  paneOpen: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M14 9l3 3-3 3"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  move: '<path d="M2 9V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10M9 16l3-3-3-3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>'
};
// Brand artwork with light/dark variants (renderer/assets/brand/<name>-light|dark.svg)
function brandImg(name, cls) {
  const p = el("picture", cls), src = el("source"), img = el("img");
  src.srcset = `assets/brand/${name}-dark.svg`; src.media = "(prefers-color-scheme: dark)";
  img.src = `assets/brand/${name}-light.svg`; img.alt = "";
  p.append(src, img); return p;
}
const btn = (cls, label, icon, title) => { const b = el("button", "btn " + (cls || "")); if (icon) b.append(svg(ICON[icon])); if (label) b.append(document.createTextNode(label)); if (title) { b.title = title; b.setAttribute("aria-label", title); } return b; };

/* ---------------- state ---------------- */
const S = {
  db: null,
  view: { kind: "library", id: "inbox" },
  docId: null,
  docQuery: "",
  searchQuery: "",
  searchLib: "all",
  off: new Set(),          // colour keys hidden in the reader
  busy: null,              // {label, done, total}
  renaming: null,          // library id being renamed
  editingTitle: false,
  jumpTo: null,            // entry index to scroll to after opening a doc
  theme: "system"          // system | light | dark (owned by the main process)
};
const THEMES = [["system", "Match system", "monitor"], ["light", "Light", "sun"], ["dark", "Dark", "moon"]];
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => fl.saveDb(S.db), 250); }
const doc = id => S.db.docs.find(d => d.id === id);
const lib = id => S.db.libraries.find(l => l.id === id);
const rgb = c => `${c[0]} ${c[1]} ${c[2]}`;
const ckey = c => c.map(v => Math.round(v / 24) * 24).join(",");
const plural = (n, a, b) => n + " " + (n === 1 ? a : (b || a + "s"));
// extracts that come before the first topic (title page, abstract) are grouped under this label
const PRE_TOPIC = "Abstract";
const outdated = d => !d.result || (d.result.v || 1) < ANALYZER_VERSION;

function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2200); }
async function copyText(text, what) { await fl.copy(text); toast(what + " copied"); }
async function copyImage(d, img) {
  try { if (!await fl.copyImage(await Images.png(d, img))) throw new Error("empty image"); toast("Image copied"); }
  catch (err) { console.error(err); toast("Couldn't copy the image"); }
}

/* ---------------- PDF analysis ---------------- */
function cleanTitle(t) {
  t = (t || "").replace(/^Microsoft (Word|PowerPoint) - /i, "").replace(/\.(docx?|pptx?|pdf)$/i, "").trim();
  if (!t || /^untitled$/i.test(t) || t.length < 3) return "";
  return t;
}
const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;:)\]])/i;
const ARXIV_RE = /\barXiv:\s?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i;
const pdfDate = s => { try { const d = s && pdfjsLib.PDFDateString.toDateObject(s); return d ? d.getTime() : null; } catch (_) { return null; } };
// Bibliographic + file metadata, Zotero-style: XMP (dc / prism) first, then the Info dictionary, then a DOI / arXiv scan of page 1.
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
async function analyzeBytes(bytes, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const meta = await readMeta(pdf);
  const result = await analyzePdf(pdf, onProgress);
  pdf.destroy();
  return { title: cleanTitle(meta.title), meta, result };
}
// Docs scanned before metadata existed: read it from the stored copy without a full rescan.
async function loadMeta(d) {
  if (loadMeta.busy.has(d.id)) return; loadMeta.busy.add(d.id);
  try {
    const { bytes } = await fl.readPdf({ ...d, sourcePath: null });
    const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    d.meta = await readMeta(pdf); pdf.destroy(); save();
  } catch (err) { console.error(err); d.meta = {}; }
  loadMeta.busy.delete(d.id);
  if (S.docId === d.id) renderReader();
}
loadMeta.busy = new Set();

/* Online details (T-001): CrossRef for a DOI, the arXiv API for an arXiv id. Network only on user action: right after
   adding a paper by DOI/arXiv link, or "Look up details" on the Info card. Kept in d.lookup (not d.meta, which a
   rescan rebuilds from the PDF), so they survive rescans and show offline. Never blocks adding or opening a PDF. */
const LOOKUP_SOURCE = { crossref: "CrossRef", arxiv: "arXiv" };
const metaOf = d => d.lookup ? { ...d.meta, ...d.lookup.meta } : d.meta;
function lookupQuery(d) {
  const m = d.meta || {}, o = d.origin && /^(doi|arxiv)$/.test(d.origin.kind) ? { kind: d.origin.kind, value: d.origin.value } : null;
  return m.doi || m.arxiv || o ? { doi: m.doi || "", arxiv: m.arxiv || "", origin: o } : null;
}
async function lookUp(d, quiet) {
  const q = lookupQuery(d);
  if (!q || lookUp.busy.has(d.id)) return;
  if (!navigator.onLine) { if (!quiet) toast("You're offline. Looking up details needs a connection."); return; }
  lookUp.busy.add(d.id); if (S.docId === d.id) renderReader();
  let r;
  try { r = await fl.lookupMeta(q); } catch (err) { console.error(err); r = { ok: false, reason: "network" }; }
  lookUp.busy.delete(d.id);
  if (!doc(d.id)) return;                                     // removed meanwhile
  if (r.ok) {
    d.lookup = { source: r.source, id: r.id, at: Date.now(), meta: r.meta };
    // a title from the record beats a file name, but never one the user typed
    if (!d.titleEdited && !cleanTitle(d.meta && d.meta.title) && cleanTitle(r.meta.title)) d.title = cleanTitle(r.meta.title);
    save(); renderAll();
    if (!quiet) toast("Details updated from " + LOOKUP_SOURCE[r.source]);
    return;
  }
  if (S.docId === d.id) renderReader();
  if (quiet) return;
  toast(r.reason === "offline" ? "You're offline. Looking up details needs a connection."
    : r.reason === "not-found" ? "CrossRef and arXiv have no record of this paper"
    : "Couldn't reach the metadata service. Try again later.");
}
lookUp.busy = new Set();
function summary(result) {
  const colours = new Map();
  for (const e of result.entries) for (const s of e.spans) colours.set(ckey(s.color), s.color);
  for (const img of Order.imagesOf(result)) if (!colours.has(ckey(img.color))) colours.set(ckey(img.color), img.color);
  return { count: result.entries.reduce((n, e) => n + e.spans.length, 0) + result.loose.length, colours: [...colours.values()].slice(0, 6) };
}

// Analyse a PDF already copied into the library (fl.importPdf / fl.fetchPdf) and add it as a doc.
// opts.origin: where a downloaded paper came from ({kind, value, url}); such docs have no original on disk.
// opts.title: the landing page's title, used when the PDF has none of its own.
async function addImported(info, target, opts = {}) {
  const d = { id: info.id, libraryId: target, title: "", fileName: info.fileName, sourcePath: opts.sample ? null : info.sourcePath,
    storedPath: info.storedPath, hash: info.hash, addedAt: Date.now(), tags: [], starred: false, scannedMtime: info.mtime };
  if (opts.origin) d.origin = opts.origin;
  const { bytes } = await fl.readPdf({ ...d, sourcePath: null });
  const { title, meta, result } = await analyzeBytes(bytes, (pg, n) => { if (S.busy) { S.busy.page = `page ${pg} of ${n}`; renderProgress(); } });
  Object.assign(d, { title: title || opts.title || info.fileName.replace(/\.pdf$/i, ""), meta, result, pages: result.pages, scannedAt: Date.now(), ...summary(result) });
  S.db.docs.push(d);
  if (opts.origin) lookUp(d, true);                           // added by DOI / arXiv link: fill in details in the background
  return d;
}

async function addPaths(paths, opts = {}) {
  paths = paths.filter(p => /\.pdf$/i.test(p));
  if (!paths.length) { toast("Only PDF files can be added"); return; }
  const target = opts.libraryId || (S.view.kind === "library" ? S.view.id : "inbox");
  S.busy = { label: `Adding ${plural(paths.length, "PDF")}`, done: 0, total: paths.length, page: "" };
  renderList();
  let lastId = null, failed = 0;
  for (const p of paths) {
    try {
      const existing = !opts.sample && S.db.docs.find(d => d.sourcePath === p);
      if (existing) { await rescan(existing, true); lastId = existing.id; }
      else lastId = (await addImported(await fl.importPdf(p), target, opts)).id;
    } catch (err) { console.error(err); failed++; }
    S.busy.done++; renderProgress();
  }
  S.busy = null;
  save();
  if (lastId) { if (S.view.kind !== "library" || S.view.id !== target) S.view = { kind: "library", id: target }; S.docId = lastId; S.off = new Set(); }
  renderAll();
  if (failed) toast(`${plural(failed, "file")} couldn't be read. They may be damaged or password-protected.`);
  else if (paths.length > 1) toast(`Added ${plural(paths.length, "PDF")} to ${lib(target).name}`);
}

async function rescan(d, quiet) {
  try {
    const { bytes, mtime } = await fl.readPdf(d);
    const { meta, result } = await analyzeBytes(bytes);
    Object.assign(d, { meta, result, pages: result.pages, scannedAt: Date.now(), scannedMtime: mtime, stale: false, ...summary(result) });
    Images.forget(d.id);
    save();
    if (!quiet) toast("Highlights refreshed from the PDF");
    return true;
  } catch (err) {
    console.error(err);
    if (!quiet) toast("Couldn't read the PDF. Use “Find original file” if it moved.");
    return false;
  }
}

async function rescanAll() {
  const list = S.db.docs.filter(d => d.stale || outdated(d));
  const all = list.length ? list : S.db.docs;
  if (!all.length) return;
  S.busy = { label: `Rescanning ${plural(all.length, "PDF")}`, done: 0, total: all.length, page: "" }; renderList();
  for (const d of all) { await rescan(d, true); S.busy.done++; renderProgress(); }
  S.busy = null; renderAll(); toast(`Rescanned ${plural(all.length, "PDF")}`);
}

/* ---------------- libraries ---------------- */
function newLibrary() {
  const id = "l" + Date.now().toString(36);
  S.db.libraries.push({ id, name: "New library", createdAt: Date.now() });
  S.renaming = id; S.view = { kind: "library", id }; S.docId = null; save(); renderAll();
}
async function deleteLibrary(id) {
  const l = lib(id); if (!l || l.system) return;
  const n = S.db.docs.filter(d => d.libraryId === id).length;
  const ok = await fl.confirm(`Delete the library “${l.name}”?`, n ? `Its ${plural(n, "PDF")} will move to Inbox. No highlights are lost.` : "It's empty.", "Delete library");
  if (!ok) return;
  S.db.docs.forEach(d => { if (d.libraryId === id) d.libraryId = "inbox"; });
  S.db.libraries = S.db.libraries.filter(x => x.id !== id);
  if (S.view.kind === "library" && S.view.id === id) S.view = { kind: "library", id: "inbox" };
  save(); renderAll();
}
// at / opts: see openMenu()
async function libraryMenu(id, at, opts) {
  const l = lib(id), cur = S.view.kind === "library" && S.view.id === id;
  const items = [{ id: "rename", label: "Rename", icon: "pen" }, { id: "export", label: "Export to folder…", icon: "export", hint: cur ? keyHint("E", true) : "" }];
  if (!l.system) items.push({ type: "separator" }, { id: "delete", label: "Delete library…", icon: "trash", danger: true });
  const r = await openMenu(at || document.activeElement, items, { label: l.name, ...opts });
  if (r === "rename") { S.renaming = id; renderSide(); }
  if (r === "export") exportLibrary(id);
  if (r === "delete") deleteLibrary(id);
}

/* ---------------- action menu ---------------- */
// Themed in-app popover menu (the native fl.popup is no longer used). Items:
//   { id, label, icon, hint, danger, disabled, checked, submenu: [items] } | { type: "separator" } | { type: "heading", label }
// at: an element (menu opens below it) or { x, y } (opens at the pointer).
// opts: { trigger: element focus returns to, keyboard: focus the first item, label: aria-label }.
// Resolves with the chosen item's id, or null when dismissed.
let MENU = null, kbdNav = false;
addEventListener("keydown", () => { kbdNav = true; }, true);
addEventListener("pointerdown", () => { kbdNav = false; }, true);
const keyHint = (k, shift) => process_platform() === "darwin" ? (shift ? "⇧" : "") + "⌘" + k : "Ctrl+" + (shift ? "Shift+" : "") + k;
function closeMenu() { if (MENU) MENU.close(null); }
function openMenu(at, items, opts = {}) {
  const isEl = at instanceof Element;
  // a press on the open menu's own trigger closes it; swallow the click that follows
  const sk = openMenu.skip; openMenu.skip = null;
  if (isEl && sk && sk.at === at && performance.now() - sk.t < 600) return Promise.resolve(null);
  closeMenu();
  const trigger = opts.trigger || (isEl ? at : document.activeElement);
  const kb = opts.keyboard ?? kbdNav;
  return new Promise(resolve => {
    const panels = []; let hoverT = 0, hoverFrom = 0, hoverItem = null;
    const m = {};
    const inside = t => panels.some(p => p.contains(t));
    const live = p => [...p.querySelectorAll(".amenu-item:not([aria-disabled='true'])")];
    const focusItem = r => r && r.focus({ preventScroll: true });
    const onDown = e => { if (inside(e.target)) return; if (isEl && at.contains(e.target)) openMenu.skip = { at, t: performance.now() }; done(null); };
    const onScroll = e => { if (!inside(e.target)) done(null); };
    const onBlur = e => { if (e.type === "resize" || e.target === window) done(null); };
    function done(id) {
      if (MENU !== m) return;
      MENU = null; clearTimeout(hoverT);
      panels.forEach(p => p.remove());
      removeEventListener("pointerdown", onDown, true); removeEventListener("scroll", onScroll, true);
      removeEventListener("blur", onBlur); removeEventListener("resize", onBlur);
      if (isEl) at.setAttribute("aria-expanded", "false");
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
      resolve(id);
    }
    m.close = done;
    const place = (p, r, mode) => {
      const w = p.offsetWidth, h = p.offsetHeight, W = innerWidth, H = innerHeight, M = 6;
      let x, y;
      if (mode === "point") { x = r.x; y = r.y; if (x + w > W - M) x = r.x - w; if (y + h > H - M) y = r.y - h; }
      else if (mode === "below") { x = r.left; y = r.bottom + 4; if (x + w > W - M) x = r.right - w; if (y + h > H - M) y = r.top - h - 4; }
      else { x = r.right - 2; y = r.top - 5; if (x + w > W - M) x = r.left - w + 2; }
      p.style.left = Math.max(M, Math.min(x, W - M - w)) + "px";
      p.style.top = Math.max(M, Math.min(y, H - M - h)) + "px";
    };
    const closeFrom = level => {
      while (panels.length > level) { const p = panels.pop(); p._parent?.setAttribute("aria-expanded", "false"); p.remove(); }
    };
    const openSub = (r, focusFirst) => {
      const level = r.parentNode._level + 1;
      if (panels[level]?._parent !== r) {
        closeFrom(level);
        const p = build(r._it.submenu, level, r);
        r.setAttribute("aria-expanded", "true");
        place(p, r.getBoundingClientRect(), "side");
      }
      if (focusFirst) focusItem(live(panels[level])[0]);
    };
    const activate = r => {
      if (!r || r.getAttribute("aria-disabled") === "true") return;
      if (r._it.submenu) openSub(r, true); else done(r._it.id ?? null);
    };
    const onKey = (e, p) => {
      const its = live(p), i = its.indexOf(document.activeElement), cur = its[i], k = e.key;
      e.stopPropagation(); hoverItem = null;
      if (k === "ArrowDown") focusItem(its[(i + 1) % its.length]);
      else if (k === "ArrowUp") focusItem(its[i <= 0 ? its.length - 1 : i - 1]);
      else if (k === "Home") focusItem(its[0]);
      else if (k === "End") focusItem(its[its.length - 1]);
      else if (k === "Enter" || k === " ") activate(cur);
      else if (k === "ArrowRight") { if (cur?._it.submenu) openSub(cur, true); }
      else if (k === "ArrowLeft" || k === "Escape") { if (p._level) { closeFrom(p._level); focusItem(p._parent); } else if (k === "Escape") done(null); }
      else if (k === "Tab") done(null);
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // type-ahead: next item whose label starts with the letter
        const lk = k.toLowerCase(), n = its.length;
        for (let j = 1; j <= n; j++) { const r = its[(i + j + n) % n]; if (r._it.label.toLowerCase().startsWith(lk)) { focusItem(r); break; } }
      } else return;
      e.preventDefault();
    };
    function build(list, level, parent) {
      const p = el("div", "amenu"); p.setAttribute("role", "menu"); p.tabIndex = -1; p._level = level; p._parent = parent;
      if (level) p.setAttribute("aria-label", parent._it.label); else if (opts.label) p.setAttribute("aria-label", opts.label);
      const lead = list.some(it => it.icon || "checked" in it);
      for (const it of list) {
        if (it.type === "separator") { const s = el("div", "amenu-sep"); s.setAttribute("role", "separator"); p.append(s); continue; }
        if (it.type === "heading") { const h = el("div", "amenu-head", it.label); h.setAttribute("role", "presentation"); p.append(h); continue; }
        const r = el("div", "amenu-item" + (it.danger ? " danger" : "")); r.tabIndex = -1; r._it = it;
        r.setAttribute("role", "checked" in it ? "menuitemcheckbox" : "menuitem");
        if ("checked" in it) r.setAttribute("aria-checked", !!it.checked);
        if (it.disabled) r.setAttribute("aria-disabled", "true");
        if (lead) { const ic = el("span", "ai-ico"); if (it.checked) ic.append(svg(ICON.check)); else if (it.icon && !("checked" in it)) ic.append(svg(ICON[it.icon])); r.append(ic); }
        r.append(el("span", "ai-label", it.label));
        if (it.hint) r.append(el("span", "ai-hint", it.hint));
        if (it.submenu) { r.setAttribute("aria-haspopup", "menu"); r.setAttribute("aria-expanded", "false"); const c = svg(ICON.chevron); c.classList.add("ai-sub"); r.append(c); }
        // real pointer movement only: a panel opening under a resting pointer must not steal keyboard focus
        r.onmousemove = e => {
          if ((!e.movementX && !e.movementY) || hoverItem === r) return;
          hoverItem = r; if (!it.disabled) focusItem(r);
          clearTimeout(hoverT);
          hoverFrom = level; hoverT = setTimeout(() => { if (MENU !== m) return; if (it.submenu && !it.disabled) openSub(r, false); else closeFrom(level + 1); }, 140);
        };
        r.onclick = e => { e.stopPropagation(); activate(r); };
        p.append(r);
      }
      p.onkeydown = e => onKey(e, p);
      // reaching a submenu cancels a pending close queued by its parent panel
      p.onmouseenter = () => { if (hoverFrom < level) clearTimeout(hoverT); };
      p.oncontextmenu = e => e.preventDefault();
      document.body.append(p); panels[level] = p;
      return p;
    }
    MENU = m;
    const root = build(items, 0);
    if (isEl) { at.setAttribute("aria-haspopup", "menu"); at.setAttribute("aria-expanded", "true"); place(root, at.getBoundingClientRect(), "below"); }
    else place(root, at, "point");
    addEventListener("pointerdown", onDown, true); addEventListener("scroll", onScroll, true);
    addEventListener("blur", onBlur); addEventListener("resize", onBlur);
    if (kb) focusItem(live(root)[0]); else root.focus({ preventScroll: true });
  });
}
// ⋯ trigger shown on hover / focus-within / current rows
function moreBtn(label) {
  const b = el("button", "row-more"); b.append(svg(ICON.more)); b.title = label;
  b.setAttribute("aria-label", label); b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-expanded", "false");
  return b;
}
// Shift+F10 / ContextMenu key on a focused row
function menuKey(e, open) {
  if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
  e.preventDefault(); e.stopPropagation(); open();
}

/* ---------------- doc actions ---------------- */
async function removeDoc(d) {
  const ok = await fl.confirm(`Remove “${d.title}” from Faelights?`, "Its highlights and the library's copy are removed. Your original PDF is not touched.", "Remove");
  if (!ok) return;
  if (Annot.docId() === d.id) await Annot.close({ discard: true });
  await fl.removeStored(d.storedPath);
  Images.forget(d.id);
  S.db.docs = S.db.docs.filter(x => x.id !== d.id);
  if (S.docId === d.id) S.docId = null;
  save(); renderAll();
}
// at / opts: see openMenu(); with no anchor it opens below the focused element (the reader's ⋯ button)
async function docMenu(d, at, opts) {
  const cur = d.id === S.docId && S.view.kind !== "search";
  const libs = S.db.libraries.map(l => ({ id: "move:" + l.id, label: l.name, checked: l.id === d.libraryId }));
  const items = [
    { id: "annotate", label: "Annotate", icon: "pen" },
    { id: "open", label: "Open PDF", icon: "open" },
    { id: "reveal", label: process_platform() === "darwin" ? "Show in Finder" : "Show in folder", icon: "folder" },
    { id: "rescan", label: "Rescan highlights", icon: "refresh" },
    ...(d.sourceMissing || !d.sourcePath ? [{ id: "relink", label: "Find original file…", icon: "link" }] : []),
    { type: "separator" },
    { id: "star", label: d.starred ? "Remove star" : "Star", icon: "star" },
    { id: "mine", label: d.mine ? "Remove from My publications" : "Mark as my publication", icon: "pub" },
    { label: "Move to", icon: "move", submenu: libs },
    { type: "separator" },
    { id: "export", label: "Export as Markdown…", icon: "export", hint: cur ? keyHint("E") : "" },
    { id: "pdf", label: d.annotated ? "Save annotated PDF…" : "Save PDF copy…", icon: "download" },
    { id: "copy", label: "Copy all extracts", icon: "copy" },
    { type: "separator" },
    ...(d.annotated && d.sourcePath && !d.sourceMissing ? [{ id: "original", label: "Discard annotations made here…", icon: "undo", danger: true }] : []),
    { id: "remove", label: "Remove from Faelights…", icon: "trash", danger: true, hint: cur ? "Del" : "" }
  ];
  const r = await openMenu(at || document.activeElement, items, { label: d.title, ...opts });
  if (!r) return;
  if (r === "annotate") annotate(d);
  if (r === "pdf") savePdfCopy(d);
  if (r === "original") useOriginal(d);
  if (r === "open") { const e = await fl.openPdf(d); if (e !== true) toast("Couldn't open the PDF"); }
  if (r === "reveal") fl.revealPdf(d);
  if (r === "rescan") { await rescan(d); renderAll(); }
  if (r === "relink") relink(d);
  if (r === "star") { d.starred = !d.starred; save(); renderAll(); }
  if (r === "mine") setMine(d, !d.mine);
  if (r.startsWith("move:")) moveDoc(d, r.slice(5));
  if (r === "export") exportDoc(d);
  if (r === "copy") copyText(docText(d, S.db.settings.fmt, false), "All extracts");
  if (r === "remove") removeDoc(d);
}
// "My publications": PDFs the user wrote, flagged on the doc like a star
function setMine(d, on) {
  if (!!d.mine === on) return;
  d.mine = on; save(); renderAll();
  toast(on ? "Added to My publications" : "Removed from My publications");
}
function process_platform() { return navigator.userAgent.includes("Mac") ? "darwin" : "other"; }
function moveDoc(d, libId) {
  if (d.libraryId === libId) return;
  d.libraryId = libId; save();
  toast(`Moved to ${lib(libId).name}`);
  renderAll();
}
function annotate(d, page) {
  if (S.docId !== d.id) { S.docId = d.id; S.off = new Set(); renderAll(); }
  Annot.open(d, page); tourSoon();
}
async function savePdfCopy(d) {
  try {
    const { bytes } = await fl.readPdf(d);
    const p = await fl.savePdfAs(safeName(d.title) + ".pdf", bytes);
    if (p) toast("Saved " + p.split(/[\\/]/).pop());
  } catch (err) { console.error(err); toast("Couldn't read the PDF"); }
}
// Throw away in-app annotations: the library copy is refreshed from the original file
async function useOriginal(d) {
  const ok = await fl.confirm("Discard the annotations made in Faelights?", "The library's copy is replaced by your original PDF and its highlights are read again. Save the annotated PDF first if you want to keep it.", "Discard annotations");
  if (!ok) return;
  if (Annot.docId() === d.id) await Annot.close({ discard: true });
  d.annotated = false; d.scannedMtime = 0;
  await rescan(d); renderAll();
}
async function relink(d) {
  const p = await fl.relinkPdf(d); if (!p) return;
  d.sourcePath = p; d.sourceMissing = false; d.scannedMtime = 0;
  await rescan(d); renderAll();
}

/* ---------------- export ---------------- */
// Text builders live in exportfmt.js (pure, unit-tested); these names stay for the rest of app.js
const wrapHl = ExportFmt.wrapHl, entryLines = ExportFmt.entryLines, groupsOf = ExportFmt.groupsOf;
const exportOpts = d => ({ mode: S.db.settings.mode, libraryName: (lib(d.libraryId) || {}).name || "", preTopic: PRE_TOPIC });
// images (optional): image boxes to interleave — with `path` they link to a file, without it they become "[Image, p. N]"
function docText(d, fmt, frontmatter, entries, images) {
  return ExportFmt.docText(d, { ...exportOpts(d), fmt, frontmatter, entries, images });
}
const docHtml = (d, images) => ExportFmt.docHtml(d, { ...exportOpts(d), images });
const safeName = s => s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
// safeName that Windows also accepts as a file/folder name (exports with assets are path-checked in main.js)
const exportFileBase = s => {
  const n = safeName(s).replace(/[\u0000-\u001f]/g, "").replace(/[. ]+$/, "") || "Untitled";
  return /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n) ? "_" + n : n;
};
const exportImageList = d => (d.result && d.result.images) || [];
const exportWithImages = d => !!S.db.settings.images && exportImageList(d).length > 0;
// Render a doc's image boxes for export. html → embedded data URLs; others → PNG assets under `dir`.
// A crop that fails becomes a placeholder line instead of failing the export.
async function exportImages(d, fmt, dir, tick) {
  const refs = [], assets = [];
  for (const img of exportImageList(d)) {
    tick();
    try {
      if (fmt === "html") { const c = await Images.crop(d, img); refs.push({ ...img, url: c.url, width: c.width, height: c.height }); }
      else { const path = dir + "/" + ExportFmt.imageFile(img); assets.push({ path, bytes: await Images.png(d, img) }); refs.push({ ...img, path }); }
    } catch (err) { console.error("image export failed", err); refs.push({ ...img, failed: true }); }
  }
  return { refs, assets };
}
const exportProgress = total => { let k = 0; return () => toast(`Preparing images… ${++k}/${total}`); };
async function exportDoc(d, fmt = S.db.settings.fmt) {
  const imgs = exportWithImages(d);
  if (fmt !== "html" && !imgs) {   // text only: unchanged path
    const p = await fl.exportFile(safeName(d.title) + (fmt === "plain" ? ".txt" : ".md"), docText(d, fmt, fmt !== "plain"));
    if (p) toast("Exported to " + p.split(/[\\/]/).pop());
    return;
  }
  try {
    const name = exportFileBase(d.title) + ExportFmt.extOf(fmt), tick = exportProgress(exportImageList(d).length);
    let p;
    if (fmt === "html") p = await fl.exportBundle(name, docHtml(d, imgs ? (await exportImages(d, fmt, null, tick)).refs : []));
    else {
      // the images folder is named after the file picked in the save dialog; main.js swaps the token for it
      const token = "FLIMG" + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");
      const { refs, assets } = await exportImages(d, fmt, token, tick);
      p = await fl.exportBundle(name, docText(d, fmt, fmt !== "plain", null, refs), assets, { dirToken: token, encode: fmt === "md" ? "url" : "raw" });
    }
    if (p) toast("Exported to " + p.split(/[\\/]/).pop());
  } catch (err) { console.error(err); toast("Couldn't export: " + (err.message || err).toString().replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); }
}
// Reader "Export" button: pick a format (remembered as settings.fmt) and whether to include images
async function exportMenu(d, at) {
  for (;;) {
    const fmt = S.db.settings.fmt, rect = at instanceof Element ? at.getBoundingClientRect() : null;
    const items = [{ type: "heading", label: "Export as" }, ...ExportFmt.FORMATS.map(([v, t]) => ({ id: "fmt:" + v, label: t, checked: fmt === v }))];
    if (exportImageList(d).length) items.push({ type: "separator" }, { id: "images", label: "Include images", checked: !!S.db.settings.images });
    const r = await openMenu(at, items, { label: "Export" });
    if (!r) return;
    if (r === "images") {   // toggle, then reopen where the menu was (the reader re-renders its toolbar)
      S.db.settings.images = !S.db.settings.images; save(); renderReader();
      if (rect) at = { x: rect.left, y: rect.bottom + 4 };
      continue;
    }
    S.db.settings.fmt = r.slice(4); save(); renderReader();
    return exportDoc(d, S.db.settings.fmt);
  }
}
async function exportLibrary(id) {
  const docs = S.db.docs.filter(d => d.libraryId === id);
  if (!docs.length) { toast("This library has no PDFs to export"); return; }
  const fmt = S.db.settings.fmt, used = new Set(), files = [], assets = [];
  const tick = exportProgress(docs.reduce((n, d) => n + (exportWithImages(d) ? exportImageList(d).length : 0), 0));
  try {
    for (const d of docs) {
      let n = exportFileBase(d.title), k = 2; while (used.has(n.toLowerCase())) n = exportFileBase(d.title) + " " + k++; used.add(n.toLowerCase());
      const name = n + ExportFmt.extOf(fmt);
      if (fmt === "html") files.push({ name, text: docHtml(d, exportWithImages(d) ? (await exportImages(d, fmt, null, tick)).refs : []) });
      else if (exportWithImages(d)) {
        const r = await exportImages(d, fmt, n + " images", tick);
        assets.push(...r.assets); files.push({ name, text: docText(d, fmt, fmt !== "plain", null, r.refs) });
      } else files.push({ name, text: docText(d, fmt, fmt !== "plain") });
    }
    const dir = await fl.exportFolder(exportFileBase(lib(id).name), files, assets.length ? assets : undefined);
    if (dir) { toast(`Exported ${plural(files.length, "file")}`); fl.openFolder(dir); }
  } catch (err) { console.error(err); toast("Couldn't export the library"); }
}

/* ---------------- layout: resizable, collapsible columns ---------------- */
// Widths are px and persist in settings.layout. A closed pane shrinks to a STRIP-wide tab that reopens it.
const PANES = {
  side: { name: "sidebar", label: "Libraries", def: 236, min: 180, max: 380, key: "B" },
  list: { name: "PDF list", label: "PDFs", def: 330, min: 240, max: 560, key: "⇧ B" },
  rail: { name: "topics", label: "Topics", def: 248, min: 190, max: 420, key: "Alt B" }
};
const STRIP = 34, READER_MIN = 420;
function layout() {
  const L = S.db.settings.layout = S.db.settings.layout || {};
  for (const k in PANES) {   // fill gaps in place: callers hold on to these objects while dragging
    const p = L[k] = L[k] || {};
    if (typeof p.w !== "number") p.w = PANES[k].def;
    p.closed = !!p.closed;
  }
  return L;
}
const paneEl = k => k === "rail" ? document.querySelector(".rail-pane") : $(k);
function applyLayout() {
  const L = layout(), app = $("app");
  const eff = k => L[k].closed ? STRIP : L[k].w;
  let side = eff("side"), list = app.classList.contains("wide") ? 0 : eff("list");
  // narrow window: borrow from the list, then the sidebar, so the reader keeps READER_MIN
  let over = side + list + READER_MIN - innerWidth;
  if (over > 0 && list && !L.list.closed) { const d = Math.min(over, list - PANES.list.min); list -= d; over -= d; }
  if (over > 0 && !L.side.closed) side -= Math.min(over, side - PANES.side.min);
  app.style.setProperty("--side-w", side + "px");
  app.style.setProperty("--list-w", list + "px");
  app.style.setProperty("--rail-w", eff("rail") + "px");
  for (const k in PANES) app.classList.toggle(k + "-closed", L[k].closed);
  document.querySelectorAll(".resizer").forEach(syncResizer);
}
function togglePane(k, open) {
  const p = layout()[k]; p.closed = open == null ? !p.closed : !open;
  // the clicked strip / hide button vanishes, so hand focus to its counterpart
  const hadFocus = paneEl(k)?.contains(document.activeElement) && document.activeElement.matches(".strip, .pane-btn");
  applyLayout(); save();
  if (hadFocus) paneEl(k).querySelector(p.closed ? ".strip" : ".pane-btn")?.focus({ preventScroll: true });
}
function resetLayout() { S.db.settings.layout = null; applyLayout(); save(); }
const shortcut = k => (process_platform() === "darwin" ? "⌘ " : "Ctrl ") + PANES[k].key;
function paneBtn(k) {
  const b = el("button", "pane-btn"); b.append(svg(ICON.paneClose));
  b.title = `Hide ${PANES[k].name} (${shortcut(k)})`; b.setAttribute("aria-label", "Hide " + PANES[k].name);
  b.onclick = () => togglePane(k, false); return b;
}
function strip(k, label) {
  const b = el("button", "strip"); b.append(svg(ICON.paneOpen), el("span", null, label || PANES[k].label));
  b.title = `Show ${PANES[k].name} (${shortcut(k)})`; b.setAttribute("aria-label", "Show " + PANES[k].name);
  b.onclick = () => togglePane(k, true); return b;
}
function resizer(k) {
  const h = el("div", "resizer"); h.dataset.pane = k; h.tabIndex = 0;
  h.setAttribute("role", "separator"); h.setAttribute("aria-orientation", "vertical"); h.setAttribute("aria-label", "Resize " + PANES[k].name);
  h.setAttribute("aria-valuemin", 0); h.setAttribute("aria-valuemax", PANES[k].max);
  h.title = "Drag to resize · double-click to reset"; syncResizer(h); return h;
}
function syncResizer(h) {
  const p = layout()[h.dataset.pane];
  h.setAttribute("aria-valuenow", p.closed ? 0 : p.w); h.setAttribute("aria-valuetext", p.closed ? "Hidden" : p.w + " pixels");
}
// Drag a handle: every pane grows rightwards; dropping below about half its minimum snaps it closed
addEventListener("pointerdown", e => {
  const h = e.target.closest?.(".resizer"); if (!h || e.button !== 0) return;
  e.preventDefault(); h.setPointerCapture(e.pointerId);
  const k = h.dataset.pane, P = PANES[k], p = layout()[k];
  const x0 = e.clientX, w0 = paneEl(k).getBoundingClientRect().width, keepW = p.w;
  document.body.classList.add("resizing"); h.classList.add("active");
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const raw = w0 + ev.clientX - x0;
    if (raw < (STRIP + P.min) / 2) Object.assign(p, { closed: true, w: keepW });   // reopens at its old width
    else { p.closed = false; p.w = Math.round(Math.min(P.max, Math.max(P.min, raw))); }
    applyLayout();
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    document.body.classList.remove("resizing"); h.classList.remove("active"); save();
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
});
addEventListener("dblclick", e => {
  const h = e.target.closest?.(".resizer"); if (!h) return;
  Object.assign(layout()[h.dataset.pane], { w: PANES[h.dataset.pane].def, closed: false }); applyLayout(); save();
});
function resizerKey(e, h) {
  const k = h.dataset.pane, P = PANES[k], p = layout()[k], step = e.shiftKey ? 48 : 16;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePane(k); return; }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  if (p.closed) { if (e.key === "ArrowRight") togglePane(k, true); return; }
  const w = p.w + (e.key === "ArrowRight" ? step : -step);
  if (w < P.min) togglePane(k, false); else { p.w = Math.min(P.max, w); applyLayout(); save(); }
}
addEventListener("resize", () => { if (S.db) applyLayout(); });

/* ---------------- rendering: sidebar ---------------- */
// onMenu(at, opts): row actions — adds a ⋯ trigger, right-click and Shift+F10 / ContextMenu.
// The <li> wraps the main button and the ⋯ sibling (buttons can't nest) and is the drop target.
function navItem({ icon, name, count, current, onClick, onMenu, onDrop, editing, onRename, tour }) {
  const li = el("li", onMenu ? "has-more" + (current ? " is-current" : "") : null);
  if (tour) li.dataset.tour = tour;
  if (editing) {
    const inp = el("input"); inp.value = name; inp.setAttribute("aria-label", "Library name");
    const done = commit => { if (inp.dataset.done) return; inp.dataset.done = 1; onRename(commit ? inp.value.trim() : null); };
    inp.onkeydown = e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
    inp.onblur = () => done(true);
    li.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    return li;
  }
  const b = el("button"); b.setAttribute("aria-current", !!current);
  b.append(icon, el("span", "name", name)); if (count != null) b.append(el("span", "n", String(count)));
  b.onclick = onClick;
  li.append(b);
  if (onMenu) {
    const mb = moreBtn("Actions for " + name); mb.onclick = () => onMenu(mb);
    li.oncontextmenu = e => { e.preventDefault(); if (!MENU) onMenu({ x: e.clientX, y: e.clientY }, { trigger: b }); };
    li.onkeydown = e => menuKey(e, () => onMenu(mb, { trigger: e.target === mb ? mb : b, keyboard: true }));
    li.append(mb);
  }
  if (onDrop) {
    li.ondragover = e => { if (e.dataTransfer.types.includes("application/x-faelights-doc") || e.dataTransfer.types.includes("Files")) { e.preventDefault(); b.classList.add("dropping"); } };
    li.ondragleave = () => b.classList.remove("dropping");
    li.ondrop = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove("dropping"); onDrop(e); hideDrop(); };
  }
  return li;
}
function renderSide() {
  const side = $("side"); side.replaceChildren();
  const brand = el("div", "brand"); brand.append(brandImg("mark", "brand-mark"), el("h1", null, "faelights"), paneBtn("side")); brand.lastChild.dataset.tour = "pane"; brand.setAttribute("aria-label", "Faelights");
  const add = btn("primary add", "Add PDFs", "add"); add.onclick = chooseAndAdd; add.dataset.tour = "add";
  const addRow = el("div", "add-row"); addRow.append(add, addIdBtn(true)); addRow.lastChild.dataset.tour = "add-id";
  side.append(brand, addRow);
  const sc = el("div", "side-scroll");

  const top = el("ul", "nav");
  const total = S.db.docs.reduce((n, d) => n + (d.count || 0), 0);
  top.append(navItem({ icon: svg(ICON.search), name: "Search highlights", count: total, current: S.view.kind === "search", tour: "search", onClick: () => go({ kind: "search" }) }));
  top.append(navItem({ icon: svg(ICON.all), name: "All PDFs", count: S.db.docs.length, current: S.view.kind === "all", tour: "all", onClick: () => go({ kind: "all" }) }));
  const starred = S.db.docs.filter(d => d.starred).length;
  top.append(navItem({ icon: svg(ICON.star), name: "Starred", count: starred, current: S.view.kind === "starred", tour: "starred", onClick: () => go({ kind: "starred" }) }));
  top.append(navItem({ icon: svg(ICON.pub), name: "My publications", count: S.db.docs.filter(d => d.mine).length, current: S.view.kind === "mine", onClick: () => go({ kind: "mine" }), tour: "mine",
    onDrop: e => { const d = doc(e.dataTransfer.getData("application/x-faelights-doc")); if (d) setMine(d, true); } }));
  sc.append(top);

  const h = el("h3"); h.dataset.tour = "libraries"; h.append(el("span", null, "Libraries"));
  const nb = el("button", null, "+"); nb.title = "New library"; nb.setAttribute("aria-label", "New library"); nb.onclick = newLibrary; h.append(nb);
  sc.append(h);
  const ul = el("ul", "nav"); ul.dataset.tour = "libraries";
  for (const l of S.db.libraries) {
    const n = S.db.docs.filter(d => d.libraryId === l.id).length;
    ul.append(navItem({
      icon: svg(l.system ? ICON.inbox : ICON.lib), name: l.name, count: n,
      current: S.view.kind === "library" && S.view.id === l.id,
      editing: S.renaming === l.id,
      onRename: v => { if (v) l.name = v; S.renaming = null; save(); renderAll(); },
      onClick: () => go({ kind: "library", id: l.id }),
      onMenu: (at, o) => libraryMenu(l.id, at, o),
      onDrop: e => {
        const did = e.dataTransfer.getData("application/x-faelights-doc");
        if (did) { const d = doc(did); if (d) moveDoc(d, l.id); }
        else if (e.dataTransfer.files.length) addPaths([...e.dataTransfer.files].map(f => fl.pathFor(f)), { libraryId: l.id });
      }
    }));
    ul.lastChild.querySelector("button")?.addEventListener("dblclick", () => { S.renaming = l.id; renderSide(); });
  }
  sc.append(ul);

  const tags = new Map();
  for (const d of S.db.docs) for (const t of d.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  if (tags.size) {
    sc.append(Object.assign(el("h3"), { textContent: "Tags" }));
    const tl = el("ul", "nav");
    for (const [t, n] of [...tags].sort((a, b) => a[0].localeCompare(b[0])))
      tl.append(navItem({ icon: el("i", "tagdot"), name: t, count: n, current: S.view.kind === "tag" && S.view.tag === t, onClick: () => go({ kind: "tag", tag: t }) }));
    sc.append(tl);
  }
  side.append(sc);

  const stale = S.db.docs.filter(d => d.stale).length;
  const foot = el("div", "side-foot"), status = el("div", "foot-row"); foot.dataset.tour = "foot";
  status.append(el("span", null, stale ? plural(stale, "PDF") + " changed" : plural(S.db.docs.length, "PDF")));
  const rb = el("button", "linkbtn", stale ? "Rescan" : "Rescan all"); rb.onclick = rescanAll; if (S.db.docs.length) status.append(rb);
  foot.append(status, themeSwitch());
  side.append(foot, strip("side"));
}

// One icon per theme; clicking an icon applies it straight away
function themeSwitch() {
  const seg = el("div", "theme-seg"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Theme");
  for (const [id, label, icon] of THEMES) {
    const b = el("button"); b.append(svg(ICON[icon])); b.title = label;
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", label); b.setAttribute("aria-checked", id === S.theme);
    b.onclick = async () => { if (id !== S.theme) { S.theme = await fl.setTheme(id); renderSide(); } };
    seg.append(b);
  }
  return seg;
}

function go(view) {
  S.view = view; S.renaming = null;
  if (view.kind !== "search") {
    const docs = visibleDocs();
    if (!docs.some(d => d.id === S.docId)) { S.docId = docs[0] ? docs[0].id : null; S.off = new Set(); }
  }
  renderAll();
  if (view.kind === "search") setTimeout(() => $("sq")?.focus(), 0);
}

/* ---------------- rendering: list ---------------- */
function viewTitle() {
  const v = S.view;
  if (v.kind === "library") return lib(v.id)?.name || "Library";
  if (v.kind === "starred") return "Starred";
  if (v.kind === "mine") return "My publications";
  if (v.kind === "tag") return "#" + v.tag;
  return "All PDFs";
}
function visibleDocs() {
  const v = S.view; let docs = S.db.docs;
  if (v.kind === "library") docs = docs.filter(d => d.libraryId === v.id);
  if (v.kind === "starred") docs = docs.filter(d => d.starred);
  if (v.kind === "mine") docs = docs.filter(d => d.mine);
  if (v.kind === "tag") docs = docs.filter(d => (d.tags || []).includes(v.tag));
  const q = S.docQuery.trim().toLowerCase();
  if (q) docs = docs.filter(d => (d.title + " " + d.fileName + " " + (d.tags || []).join(" ")).toLowerCase().includes(q));
  const sort = S.db.settings.sort;
  docs = [...docs].sort(sort === "title" ? (a, b) => a.title.localeCompare(b.title)
    : sort === "count" ? (a, b) => (b.count || 0) - (a.count || 0)
    : (a, b) => b.addedAt - a.addedAt);
  return docs;
}
function renderProgress() {
  const p = $("progress"); if (!p || !S.busy) return;
  p.querySelector("span").textContent = `${S.busy.label} · ${S.busy.done} of ${S.busy.total}${S.busy.page ? " · " + S.busy.page : ""}`;
  p.querySelector("i").style.width = (S.busy.done / S.busy.total * 100) + "%";
}
function renderList() {
  const list = $("list"); list.replaceChildren();
  $("app").classList.toggle("wide", S.view.kind === "search");
  applyLayout();
  if (S.view.kind === "search") return;
  const head = el("div", "list-head");
  const h = el("h2", null, viewTitle());
  if (S.view.kind === "library") { h.ondblclick = () => { S.renaming = S.view.id; renderSide(); }; h.title = "Double-click to rename in the sidebar"; }
  const docsAll = visibleDocs();
  const hl = docsAll.reduce((n, d) => n + (d.count || 0), 0);
  const add = btn("icon", null, "add", "Add PDFs"); add.onclick = chooseAndAdd;
  const acts = el("div", "head-acts"); acts.append(add, addIdBtn(true), paneBtn("list"));
  const hr = el("div", "head-row"); hr.append(h, acts);
  head.append(hr, el("div", "sub", `${plural(docsAll.length, "PDF")} · ${plural(hl, "highlight")}`));
  const tools = el("div", "list-tools"); tools.dataset.tour = "list-tools";
  const q = el("input", "search"); q.id = "dq"; q.placeholder = "Filter by title or tag"; q.value = S.docQuery; q.setAttribute("aria-label", "Filter PDFs");
  q.oninput = () => { S.docQuery = q.value; renderDocs(); };
  const sort = el("select"); sort.id = "sort"; sort.setAttribute("aria-label", "Sort PDFs");
  for (const [v, t] of [["added", "Newest"], ["title", "Title"], ["count", "Most marks"]]) { const o = el("option", null, t); o.value = v; sort.append(o); }
  sort.value = S.db.settings.sort; sort.onchange = () => { S.db.settings.sort = sort.value; save(); renderDocs(); };
  tools.append(q, sort); head.append(tools);
  list.append(head);
  if (S.busy) {
    const p = el("div", "progress"); p.id = "progress"; p.append(el("span")); const m = el("div", "meter"); m.append(el("i")); p.append(m); list.append(p); renderProgress();
  }
  const docs = el("div", "docs"); docs.id = "docs"; list.append(docs, strip("list", viewTitle()));
  renderDocs();
}
function renderDocs() {
  const box = $("docs"); if (!box) return; box.replaceChildren();
  const docs = visibleDocs();
  if (!docs.length) {
    const e = el("div", "list-empty");
    if (S.docQuery) e.append(el("b", null, "No matches"), el("span", null, "No PDF titles or tags here contain that text."));
    else if (S.view.kind === "library") {
      e.append(el("b", null, "Nothing here yet"), el("span", null, "Drag PDFs onto this window, or add them from your computer. Highlights are read straight away."));
      const a = btn("primary", "Add PDFs", "add"); a.onclick = chooseAndAdd; e.append(a, addIdBtn());
      if (!S.db.docs.length) { const s = btn("", "Try a sample PDF"); s.onclick = addSample; e.append(s); }
    } else if (S.view.kind === "starred") e.append(el("b", null, "No starred PDFs"), el("span", null, "Star a PDF from its ⋯ menu to keep it here."));
    else if (S.view.kind === "mine") e.append(el("b", null, "No publications yet"), el("span", null, "Mark a PDF you wrote with “Mark as mine” in the reader or its ⋯ menu, or drag it onto My publications."));
    else e.append(el("b", null, "No PDFs"), el("span", null, "Add PDFs to start a library."));
    box.append(e); return;
  }
  for (const d of docs) {
    // wrapper holds the card button and its ⋯ sibling (buttons can't nest)
    const row = el("div", "doc-row" + (d.id === S.docId ? " is-current" : ""));
    const b = el("button", "doc"); b.setAttribute("aria-current", d.id === S.docId); b.draggable = true;
    const t = el("div", "t"); t.append(el("span", null, d.title)); if (d.starred) { const s = svg(ICON.star); s.classList.add("star"); s.style.width = "13px"; s.setAttribute("fill", "currentColor"); t.append(s); }
    const m = el("div", "m");
    m.append(el("span", null, plural(d.count || 0, "mark")), el("span", null, plural(d.pages || 0, "page")));
    if (d.colours && d.colours.length) { const sw = el("span", "swatches"); for (const c of d.colours) { const i = el("i"); i.style.background = `rgb(${c.join(",")})`; sw.append(i); } m.append(sw); }
    if (S.view.kind !== "library") m.append(el("span", null, lib(d.libraryId)?.name || ""));
    if (d.sourceMissing) m.append(el("span", "pill warn", "Original moved"));
    else if (d.stale) m.append(el("span", "pill", "Changed"));
    if (d.annotated) m.append(el("span", "pill", "Annotated"));
    b.append(t, m);
    if (d.tags && d.tags.length) { const tg = el("div", "tags-inline"); for (const x of d.tags) tg.append(el("span", null, x)); b.append(tg); }
    b.onclick = () => openDoc(d.id);
    b.ondragstart = e => { e.dataTransfer.setData("application/x-faelights-doc", d.id); e.dataTransfer.effectAllowed = "move"; };
    const mb = moreBtn("Actions for " + d.title); mb.onclick = () => docMenu(d, mb);
    row.oncontextmenu = e => { e.preventDefault(); if (!MENU) docMenu(d, { x: e.clientX, y: e.clientY }, { trigger: b }); };
    row.onkeydown = e => menuKey(e, () => docMenu(d, mb, { trigger: e.target === mb ? mb : b, keyboard: true }));
    row.append(b, mb); box.append(row);
  }
}

async function openDoc(id, entryIdx) {
  if (Annot.isOpen() && Annot.docId() !== id) Annot.close();
  S.docId = id; S.off = new Set(); S.editingTitle = false; S.jumpTo = entryIdx ?? null;
  const d = doc(id);
  if (S.view.kind === "search") S.view = { kind: "library", id: d.libraryId };
  renderAll();
  const changed = d.stale && d.sourcePath;
  if (changed || outdated(d)) { const ok = await rescan(d, true); if (ok) { toast(changed ? "Updated from the changed PDF" : "Topics refreshed"); renderAll(); } }
}

/* ---------------- rendering: reader ---------------- */
function markEl(span, txt, q) {
  const m = el("mark", span.type === "Underline" || span.type === "Squiggly" ? "u" : span.type === "Strike" ? "s" : "");
  appendHits(m, txt, q); m.style.setProperty("--mc", rgb(span.color)); return m;
}
function termsOf(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
function appendHits(parent, text, q) {
  const terms = q ? termsOf(q) : [];
  if (!terms.length) { parent.append(document.createTextNode(text)); return; }
  const re = new RegExp("(" + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index))); parent.append(el("b", "hit", m[0])); last = re.lastIndex; }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}
function quoteEl(e, mode, q) {
  const p = el("p", "quote"); const ids = new Set(e.spans.map(s => s.id));
  if (mode === "full") {
    for (const s of e.segs) {
      if (s.hl !== -1 && ids.has(s.hl)) p.append(markEl(e.spans.find(x => x.id === s.hl), s.t, q));
      else appendHits(p, s.t, q);
    }
  } else for (const s of e.spans) { const ln = el("span", "ln"); ln.style.setProperty("--mc", rgb(s.color)); ln.append(markEl(s, s.text, q)); p.append(ln); }
  return p;
}

// Zotero-style info card shown above the extracts
const fmtDate = t => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function infoRows(rows) {
  const dl = el("dl", "info-grid");
  for (const [label, value, opts = {}] of rows) {
    if (!value) continue;
    const dd = el("dd", opts.cls || null);
    if (opts.href) { const a = el("a", null, value); a.href = opts.href; a.target = "_blank"; a.rel = "noreferrer"; dd.append(a); }
    else dd.textContent = value;
    dd.title = "Double-click to copy"; dd.ondblclick = () => copyText(value, label);
    dl.append(el("dt", null, label), dd);
  }
  return dl;
}
function infoEl(d) {
  const sec = el("section", "group info");
  const head = el("div", "group-head info-head"); head.append(el("h3", null, "Info")); sec.append(head);
  if (!d.meta) { loadMeta(d); sec.append(el("p", "loose", "Reading metadata…")); return sec; }
  if (lookupQuery(d)) {
    const busy = lookUp.busy.has(d.id), L = d.lookup;
    const src = el("p", "info-src", busy ? "Looking up details…" : L ? `Details from ${LOOKUP_SOURCE[L.source]} · ${fmtDate(L.at)}` : "Only what the PDF itself says.");
    const lb = btn("", busy ? "Looking up…" : L ? "Refresh details" : "Look up details", "refresh", L ? "Fetch the details again from " + LOOKUP_SOURCE[L.source] : "Fill in title, authors, journal and more from CrossRef or arXiv");
    lb.disabled = busy; lb.onclick = () => lookUp(d);
    head.append(src, lb);
  }
  const m = metaOf(d);
  sec.append(infoRows([
    ["Item Type", m.itemType || (m.isbn ? "Book" : m.publication || m.volume || m.issn ? "Journal Article" : m.arxiv ? "Preprint" : "Document")],
    ["Title", cleanTitle(m.title) || d.title],
    ...(m.authors || []).map(a => ["Author", a]),
    ["Abstract", m.abstract, { cls: "abstract" }],
    ["Publication", m.publication],
    ["Volume", m.volume],
    ["Issue", m.issue],
    ["Pages", m.pages],
    ["Date", m.date],
    ["DOI", m.doi, { href: m.doi && "https://doi.org/" + m.doi }],
    ["arXiv", m.arxiv, { href: m.arxiv && "https://arxiv.org/abs/" + m.arxiv }],
    ["ISSN", m.issn],
    ["ISBN", m.isbn],
    ["Publisher", m.publisher],
    ["URL", m.url, { href: /^https?:/.test(m.url || "") && m.url }],
    ["Rights", m.rights],
    ["Keywords", (m.keywords || []).join(", ")]
  ]), el("p", "label", "File"), infoRows([
    ["Filename", d.fileName],
    ["# of Pages", d.pages && String(d.pages)],
    ["PDF version", m.pdfVersion],
    ["Created", m.created && fmtDate(m.created)],
    ["Modified", m.modified && fmtDate(m.modified)],
    ["Application", m.creator],
    ["Producer", m.producer],
    ["Added", fmtDate(d.addedAt)]
  ]));
  return sec;
}

function renderReader() {
  const r = $("reader");
  const d = S.view.kind !== "search" && S.docId && doc(S.docId);
  const shown = d && visibleDocs().some(x => x.id === d.id);
  // the viewer keeps its canvases across re-renders; it closes once its doc is no longer on screen
  if (Annot.isOpen()) { if (shown && Annot.docId() === d.id) return Annot.mount(r); Annot.close(); }
  r.replaceChildren();
  if (S.view.kind === "search") return renderSearch(r);
  if (!shown) return renderBlank(r);
  r.classList.toggle("only", S.db.settings.mode === "only");

  // header
  const head = el("div", "r-head");
  const tt = el("div", "r-title");
  if (S.editingTitle) {
    const inp = el("input"); inp.value = d.title; inp.setAttribute("aria-label", "Title");
    const done = ok => { if (inp.dataset.done) return; inp.dataset.done = 1; if (ok && inp.value.trim()) { d.title = inp.value.trim(); d.titleEdited = true; } S.editingTitle = false; save(); renderAll(); };
    inp.onkeydown = e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }; inp.onblur = () => done(true);
    tt.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
  } else { const h = el("h2", null, d.title); h.title = "Click to rename"; h.onclick = () => { S.editingTitle = true; renderReader(); }; tt.append(h); }
  const acts = el("div", "r-actions");
  const ob = btn("icon", null, "open", "Open PDF in your PDF app"); ob.onclick = async () => { const e = await fl.openPdf(d); if (e !== true) toast("Couldn't open the PDF"); };
  const mb = btn("icon", null, "more", "More actions"); mb.onclick = () => docMenu(d);
  acts.append(ob, mb); tt.append(acts); head.append(tt);

  const meta = el("div", "r-meta");
  const lb = el("button", "lib"); lb.append(svg(lib(d.libraryId)?.system ? ICON.inbox : ICON.lib), document.createTextNode(lib(d.libraryId)?.name || "Inbox"));
  lb.querySelector("svg").style.width = "13px"; lb.title = "Move to another library";
  lb.setAttribute("aria-haspopup", "menu"); lb.setAttribute("aria-expanded", "false");
  lb.onclick = async () => {
    const r = await openMenu(lb, [{ type: "heading", label: "Move to" }, ...S.db.libraries.map(l => ({ id: l.id, label: l.name, checked: l.id === d.libraryId }))], { label: "Move to library" });
    if (r) moveDoc(d, r);
  };
  const allImgs = Order.imagesOf(d.result);
  meta.append(lb, el("span", null, d.fileName), el("span", null, plural(d.pages, "page")), el("span", null, plural(d.count, "highlight")));
  if (allImgs.length) meta.append(el("span", null, plural(allImgs.length, "image")));
  meta.append(el("span", null, "Added " + new Date(d.addedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })));
  const star = el("button", "lib", d.starred ? "★ Starred" : "☆ Star"); star.onclick = () => { d.starred = !d.starred; save(); renderAll(); }; meta.append(star);
  const mine = el("button", "lib"); mine.append(svg(ICON.pub), document.createTextNode(d.mine ? "My publication" : "Mark as mine"));
  mine.querySelector("svg").style.width = "13px"; mine.setAttribute("aria-pressed", !!d.mine);
  mine.title = d.mine ? "Remove from My publications" : "Mark as my publication"; mine.onclick = () => setMine(d, !d.mine); meta.append(mine);
  const tools = el("div", "r-tools");
  const tagedit = el("div", "tagedit");
  for (const t of d.tags) { const g = el("span", "tg", t); const x = el("button", null, "×"); x.title = "Remove tag"; x.setAttribute("aria-label", "Remove tag " + t); x.onclick = () => { d.tags = d.tags.filter(z => z !== t); save(); renderAll(); }; g.append(x); tagedit.append(g); }
  const ti = el("input"); ti.id = "tagin"; ti.placeholder = "+ tag"; ti.setAttribute("aria-label", "Add tag");
  const known = [...new Set(S.db.docs.flatMap(x => x.tags))]; if (known.length) { const dl = el("datalist"); dl.id = "tagsdl"; for (const k of known) { const o = el("option"); o.value = k; dl.append(o); } tagedit.append(dl); ti.setAttribute("list", "tagsdl"); }
  ti.onkeydown = e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const v = ti.value.trim().replace(/^#/, ""); if (v && !d.tags.includes(v)) { d.tags.push(v); save(); renderAll(); setTimeout(() => $("tagin")?.focus(), 0); } } };
  tagedit.append(ti); meta.append(tagedit);

  const ib = btn("info-btn", "Metadata", "info", "Show the PDF's metadata"); ib.setAttribute("aria-pressed", !!S.db.settings.info);
  ib.onclick = () => { S.db.settings.info = !S.db.settings.info; save(); renderReader(); };
  const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "What to show");
  for (const [m, label] of [["full", "Full sentence"], ["only", "Highlights only"]]) {
    const b = el("button", null, label); b.setAttribute("aria-pressed", S.db.settings.mode === m);
    b.onclick = () => { S.db.settings.mode = m; save(); renderReader(); }; seg.append(b);
  }
  // "With images": interleave captured image boxes with the extracts (only offered when the doc has any)
  let imgb = null;
  if (allImgs.length) {
    imgb = el("button", "btn img-btn"); imgb.append(svg(IMG_ICON), document.createTextNode("With images"));
    imgb.title = "Show captured images among the extracts"; imgb.setAttribute("aria-pressed", !!S.db.settings.images);
    imgb.onclick = () => { S.db.settings.images = !S.db.settings.images; save(); renderReader(); };
  }
  const fmt = el("select", "btn"); fmt.id = "fmt"; fmt.title = "Format used when copying or exporting"; fmt.setAttribute("aria-label", "Copy format");
  for (const [v, t] of ExportFmt.FORMATS) { const o = el("option", null, t); o.value = v; fmt.append(o); }
  fmt.value = S.db.settings.fmt; fmt.onchange = () => { S.db.settings.fmt = fmt.value; save(); };
  const cb = btn("", "Copy", "copy"); cb.dataset.tour = "copy"; cb.onclick = () => copyText(docText(d, S.db.settings.fmt, false, filtered(d), exportWithImages(d) ? filteredImages(d) : undefined), "Extracts");
  const eb = btn("", "Export", "export"); eb.dataset.tour = "export"; eb.onclick = () => exportMenu(d, eb);
  const vb = btn("", "View", "view", "View and annotate the PDF"); vb.dataset.tour = "view"; vb.onclick = () => annotate(d);
  tools.append(vb, ib, seg); if (imgb) tools.append(imgb); tools.append(fmt, cb, eb); head.append(meta, tools);
  r.append(head);

  if (d.sourceMissing) {
    const bn = el("div", "banner"); bn.append(el("span", null, "The original PDF has moved or been deleted. Showing the copy saved in your library."));
    const f = el("button", "linkbtn", "Find original file"); f.onclick = () => relink(d); bn.append(f); r.append(bn);
  }

  // body
  const body = el("div", "r-body"); body.id = "rbody";
  const rail = el("aside", "rail");
  const main = el("div", "r-main");
  const entries = filtered(d);
  // images join the stream only while "With images" is on; off, the list is entries alone (same DOM as before)
  const showImg = !!S.db.settings.images && allImgs.length > 0;
  const groups = Order.groupItems(withImages(entries, showImg ? filteredImages(d) : []));
  const colours = new Map();
  for (const e of d.result.entries) for (const s of e.spans) { const k = ckey(s.color); const c = colours.get(k) || { color: s.color, n: 0 }; c.n++; colours.set(k, c); }
  if (showImg) for (const img of allImgs) { const k = ckey(img.color); const c = colours.get(k) || { color: img.color, n: 0 }; c.n++; colours.set(k, c); }
  if (colours.size > 1) {
    const sec = el("section"); sec.append(el("p", "label", "Filter by colour"));
    const chips = el("div", "chips");
    for (const [k, c] of colours) {
      const b = el("button", "chip"); b.setAttribute("aria-pressed", !S.off.has(k)); b.title = "Show or hide this colour";
      const i = el("i"); i.style.background = `rgb(${c.color.join(",")})`; b.append(i, document.createTextNode(c.n));
      b.onclick = () => { S.off.has(k) ? S.off.delete(k) : S.off.add(k); renderReader(); }; chips.append(b);
    }
    sec.append(chips); rail.append(sec);
  }
  if (groups.length) {
    const sec = el("section"); sec.append(el("p", "label", "Topics"));
    const ul = el("ul", "toc");
    groups.forEach((g, gi) => {
      const li = el("li", g.topic && g.topic.level > 1 ? "sub" : ""); const a = el("a"); a.href = "#";
      a.append(el("span", "t", g.topic ? g.topic.title : PRE_TOPIC), el("span", "c", String(spanCount(g))));
      if (g.images) { const ci = el("span", "c ci", String(g.images)); ci.prepend(svg(IMG_ICON)); ci.title = plural(g.images, "image"); a.append(ci); }
      a.onclick = ev => { ev.preventDefault(); $("g" + gi)?.scrollIntoView({ behavior: "smooth" }); };
      li.append(a); ul.append(li);
    });
    sec.append(ul, el("p", "source", TOPIC_SOURCE[d.result.topicSource] || "No headings found; in page order."));
    rail.append(sec);
  }
  if (S.db.settings.info) main.append(infoEl(d));
  if (!d.result.entries.length && !d.result.loose.length && !showImg) {
    const b = el("div", "blank"); b.style.margin = "0";
    b.append(el("h2", null, "No highlights in this PDF"), el("p", null, "Faelights reads highlight, underline and strike-through marks saved in the file. If your reader flattened them into the page, or the PDF was exported without annotations, there's nothing to read. Highlight it again and use Rescan."));
    main.append(b);
  }
  groups.forEach((g, gi) => {
    const sec = el("section", "group"); sec.id = "g" + gi;
    const gh = el("div", "group-head");
    if (g.topic && g.topic.path.length > 1) gh.append(el("p", "crumb", g.topic.path.slice(0, -1).join("  ›  ")));
    const h = el("h3"); h.append(document.createTextNode(g.topic ? g.topic.title : PRE_TOPIC));
    const n = spanCount(g);
    h.append(el("small", null, !g.images ? plural(n, "extract") : !g.entries ? plural(g.images, "image") : plural(n, "extract") + " · " + plural(g.images, "image")));
    gh.append(h); sec.append(gh);
    for (const it of g.items) {
      if (it.kind === "image") { sec.append(figureEl(d, it.image)); continue; }
      const e = it.entry;
      const row = el("article", "ex"); row.id = "e" + e.n;
      const pg = el("button", "pg", "p. " + e.page); pg.title = "Show page " + e.page + " in the viewer"; pg.onclick = () => annotate(d, e.page);
      row.append(pg, quoteEl(e, S.db.settings.mode, ""));
      const c = el("button", "copy1"); c.append(svg(ICON.copy)); c.title = "Copy this extract"; c.setAttribute("aria-label", "Copy this extract");
      c.onclick = () => copyText(entryLines(e, S.db.settings.fmt, S.db.settings.mode).join("\n"), "Extract"); row.append(c);
      for (const s of e.spans) if (s.comment && s.comment !== s.text) { const p = el("p", "note"); p.append(el("b", null, "Note"), document.createTextNode(s.comment)); row.append(p); }
      sec.append(row);
    }
    main.append(sec);
  });
  if (d.result.loose.length) {
    const sec = el("section", "group"); const gh = el("div", "group-head"); gh.append(el("h3", null, "Marks without text")); sec.append(gh);
    sec.append(el("p", "loose", `${plural(d.result.loose.length, "mark")} sit over images or scanned pages (p. ${[...new Set(d.result.loose.map(l => l.page))].join(", ")}). Run OCR on the PDF, then rescan, to read them.`));
    for (const l of d.result.loose.filter(l => l.comment)) { const p = el("p", "note"); p.append(el("b", null, "Note p." + l.page), document.createTextNode(l.comment)); sec.append(p); }
    main.append(sec);
  }
  if (rail.childElementCount) {
    const lbl = rail.querySelector(".label"); lbl.classList.add("with-btn"); lbl.append(paneBtn("rail"));
    const pane = el("div", "rail-pane"); pane.append(rail, strip("rail"));
    body.append(pane, resizer("rail"));
  }
  body.append(main); r.append(body);
  if (S.jumpTo != null) {
    const target = $("e" + S.jumpTo); S.jumpTo = null;
    if (target) setTimeout(() => { target.scrollIntoView({ block: "center" }); target.classList.add("flash"); }, 30);
  }
  tourSoon();
}
const TOPIC_SOURCE = {
  outline: "From the PDF's bookmarks.",
  headings: "From headings detected by font size.",
  patterns: "From section headings found in the text.",
  pages: "No headings found, so grouped by page."
};
function filtered(d) {
  return d.result.entries.map(e => ({ ...e, spans: e.spans.filter(s => !S.off.has(ckey(s.color))) })).filter(e => e.spans.length);
}
// Captured images whose colour isn't hidden (renderer/order.js; [] for results without images)
const filteredImages = d => Order.filterImages(Order.imagesOf(d.result), S.off);
// entries + images → [{kind: "entry", entry, topic} | {kind: "image", image, topic}] in reading order
const withImages = (entries, images) => Order.withImages(entries, images);
// extracts in a group of the combined list (images don't count)
const spanCount = g => g.items.reduce((n, it) => n + (it.kind === "entry" ? it.entry.spans.length : 0), 0);
const IMG_ICON = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>';
// One captured image, centred in the reading column; a fixed-aspect placeholder holds its place while it renders
function figureEl(d, img) {
  const f = el("figure", "fig"); f.id = "i" + img.n; f.style.setProperty("--mc", rgb(img.color));
  const w = Math.abs(img.rect[2] - img.rect[0]) || 1, h = Math.abs(img.rect[3] - img.rect[1]) || 1;
  const box = el("div", "fig-img loading");
  box.style.aspectRatio = `${w} / ${h}`;
  // natural size (1pt = 4/3 px), never wider than the column or taller than 60vh
  box.style.width = `min(100%, ${Math.round(w * 4 / 3)}px, calc(60vh * ${(w / h).toFixed(4)}))`;
  const alt = "Image from page " + img.page + (img.comment ? ": " + img.comment : "");
  box.setAttribute("role", "img"); box.setAttribute("aria-label", alt);
  Images.crop(d, img).then(({ url }) => {
    const im = el("img"); im.src = url; im.alt = alt;
    box.removeAttribute("role"); box.removeAttribute("aria-label"); box.classList.remove("loading"); box.replaceChildren(im);
  }, err => { console.error(err); box.replaceWith(el("p", "fig-fail", "Couldn't render this image")); });
  const cap = el("figcaption");
  const pg = el("button", "pg", "p. " + img.page); pg.title = "Show page " + img.page + " in the viewer"; pg.onclick = () => annotate(d, img.page);
  cap.append(pg);
  if (img.comment) { const p = el("p", "note"); p.append(el("b", null, "Note"), document.createTextNode(img.comment)); cap.append(p); }
  const c = el("button", "copy1"); c.append(svg(ICON.copy)); c.title = "Copy image"; c.setAttribute("aria-label", "Copy image from page " + img.page);
  c.onclick = () => copyImage(d, img); cap.append(c);
  f.oncontextmenu = async ev => {
    ev.preventDefault();
    const r = await openMenu({ x: ev.clientX, y: ev.clientY }, [{ id: "copy", label: "Copy image", icon: "copy" }, { id: "page", label: "Show page " + img.page, icon: "open" }], { label: "Image" });
    if (r === "copy") copyImage(d, img);
    if (r === "page") annotate(d, img.page);
  };
  f.append(box, cap);
  return f;
}
function renderBlank(r) {
  const b = el("div", "blank");
  b.append(brandImg("mote", "blank-mote"));
  if (!S.db.docs.length) {
    b.append(el("h2", null, "Your highlights, organised"), el("p", null, "Add annotated PDFs and Faelights lists every highlight in reading order, grouped by the topic it sits under. Sort PDFs into libraries, tag them, and search across all of them."));
    const row = el("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.flexWrap = "wrap";
    const a = btn("primary", "Add PDFs", "add"); a.onclick = chooseAndAdd; const s = btn("", "Try a sample PDF"); s.onclick = addSample; row.append(a, addIdBtn(), s); b.append(row);
  } else b.append(el("h2", null, "Pick a PDF"), el("p", null, "Choose a PDF from the list to read its highlights."));
  const k = el("div", "keys"); const mod = process_platform() === "darwin" ? "⌘" : "Ctrl";
  for (const [key, what] of [[`${mod} O`, "Add PDFs"], [`${mod} ⇧ O`, "Add by identifier"],[`${mod} F`, "Search all highlights"], [`${mod} T`, "Full sentence / highlights only"], [`${mod} E`, "Export current PDF"], [`${mod} ⇧ N`, "New library"], [`${mod} B`, "Show / hide sidebar"]]) {
    const kk = el("span"); for (const part of key.split(" ")) { kk.append(el("kbd", null, part), document.createTextNode(" ")); } k.append(kk, el("span", null, what));
  }
  b.append(k); r.append(b);
}

/* ---------------- rendering: search ---------------- */
function renderSearch(r) {
  r.classList.toggle("only", S.db.settings.mode === "only");
  const head = el("div", "s-head");
  head.append(el("h2", null, "Search highlights"));
  const row = el("div", "s-row");
  const q = el("input", "search"); q.id = "sq"; q.placeholder = "Words in a highlight, sentence or note"; q.value = S.searchQuery; q.setAttribute("aria-label", "Search highlights");
  q.oninput = () => { S.searchQuery = q.value; renderResults(); };
  const scope = el("select", "btn"); scope.id = "sscope"; scope.setAttribute("aria-label", "Library to search");
  const o = el("option", null, "All libraries"); o.value = "all"; scope.append(o);
  for (const l of S.db.libraries) { const x = el("option", null, l.name); x.value = l.id; scope.append(x); }
  scope.value = S.searchLib; scope.onchange = () => { S.searchLib = scope.value; renderResults(); };
  const seg = el("div", "seg");
  for (const [m, label] of [["full", "Full sentence"], ["only", "Highlights only"]]) { const b = el("button", null, label); b.setAttribute("aria-pressed", S.db.settings.mode === m); b.onclick = () => { S.db.settings.mode = m; save(); renderReader(); }; seg.append(b); }
  row.append(q, scope, seg); head.append(row);
  const body = el("div", "s-body"); body.id = "sbody";
  r.append(head, body); renderResults();
}
function renderResults() {
  const body = $("sbody"); if (!body) return; body.replaceChildren();
  const terms = termsOf(S.searchQuery);
  const docs = S.db.docs.filter(d => d.result && (S.searchLib === "all" || d.libraryId === S.searchLib));
  if (!terms.length) {
    const total = docs.reduce((n, d) => n + (d.count || 0), 0);
    const b = el("div", "blank"); b.style.margin = "0"; b.append(el("p", null, `Type to search ${plural(total, "highlight")} across ${plural(docs.length, "PDF")}. Every word must appear in the sentence, the highlight or its note.`)); body.append(b); return;
  }
  let hits = 0;
  for (const d of docs) {
    const matches = d.result.entries.filter(e => { const hay = (e.sentence + " " + e.spans.map(s => s.text + " " + s.comment).join(" ") + " " + (e.topic ? e.topic.path.join(" ") : "")).toLowerCase(); return terms.every(t => hay.includes(t)); });
    if (!matches.length) continue;
    hits += matches.length;
    const sec = el("section", "s-doc");
    const h = el("h3"); const hb = el("button", null, d.title); hb.onclick = () => openDoc(d.id); h.append(hb); sec.append(h);
    sec.append(el("p", "crumb", `${lib(d.libraryId)?.name || ""} · ${plural(matches.length, "match", "matches")}`));
    for (const e of matches.slice(0, 50)) {
      const row = el("div", "s-hit"); row.tabIndex = 0;
      row.append(el("div", "pg", "p. " + e.page), quoteEl(e, S.db.settings.mode, S.searchQuery));
      if (e.topic) row.append(el("div", "topic", e.topic.path.join("  ›  ")));
      const go = () => openDoc(d.id, e.n); row.onclick = go; row.onkeydown = ev => { if (ev.key === "Enter") go(); };
      sec.append(row);
    }
    body.append(sec);
  }
  if (!hits) { const b = el("div", "blank"); b.style.margin = "0"; b.append(el("p", null, "No highlights contain all of those words.")); body.append(b); }
}

function renderAll() { renderSide(); renderList(); renderReader(); }

/* ---------------- input ---------------- */
async function chooseAndAdd() { const p = await fl.choosePdfs(); if (p.length) addPaths(p); }
function addSample() {
  const u = new URL("sample.pdf", location.href);
  let p = decodeURIComponent(u.pathname); if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  addPaths([p], { sample: true });
}

/* ---------------- add by identifier ---------------- */
// The only feature that uses the network, and only when the user submits. Everything else works offline.
const ADD_FAIL = {
  invalid: "That doesn't look like an ISBN, DOI, PMID, arXiv ID, ADS bibcode or web link.",
  offline: "You're offline. Connect to the internet to fetch this paper, or add a PDF from your computer.",
  paywalled: "The publisher didn't hand over the PDF. It may need a subscription or sign-in. Open the page in your browser, download it there, then add the file.",
  "not-pdf": "Couldn't find a PDF there. Open the page in your browser to download it, then add the file.",
  "not-found": "Nothing was found for that. Check it for typos.",
  "no-free-copy": "No free PDF was found for this. Open it in your browser, or add a PDF you already have.",
  network: "Couldn't reach the server, or it took too long. Try again in a moment.",
  "too-large": "That PDF is over 150 MB, so it wasn't downloaded."
};
const ADD_OPEN = ["paywalled", "not-pdf", "no-free-copy"];   // failures where the landing page is worth opening
let addDlg = null;  // {back, box, input, hint, off, msg, list, ok, cancel, items, ids, busy, batch, stop, cur, seq, opener}
function addIdBtn(compact) {
  const b = compact ? btn("icon add-id", "", "link", "Add by identifier") : btn("", "Add by identifier", "link");
  b.onclick = () => openAddId(); return b;
}
// pasted / dropped / clipboard text worth prefilling: mostly identifiers, not a paragraph that happens to hold a link
const looksLikeIds = xs => xs.length > 0 && xs.filter(x => x.id).length * 2 >= xs.length;
function sameOrigin(id) { const v = id.value.toLowerCase(); return S.db.docs.find(d => d.origin && d.origin.kind === id.kind && String(d.origin.value).toLowerCase() === v); }
function showExisting(d) {
  S.view = { kind: "library", id: d.libraryId }; openDoc(d.id);
  toast(`Already in ${lib(d.libraryId)?.name || "your library"}: “${d.title}”`);
}
async function openAddId(prefill) {
  if (addDlg) { if (prefill && !addDlg.busy) { addDlg.input.value = prefill; addDlg.list.hidden = true; addDlg.grow(); addIdHint(); } addDlg.input.focus(); return; }
  const D = addDlg = { seq: 0, busy: false, items: [], ids: 0, opener: document.activeElement };
  D.back = el("div", "addid-back");
  D.box = el("div", "addid"); D.box.setAttribute("role", "dialog"); D.box.setAttribute("aria-modal", "true");
  D.box.setAttribute("aria-labelledby", "addid-h"); D.box.setAttribute("aria-describedby", "addid-p");
  const h = el("h2", null, "Add by identifier"); h.id = "addid-h";
  const p = el("p", null, "Enter ISBNs, DOIs, PMIDs, arXiv IDs, ADS Bibcodes or links to add to your library."); p.id = "addid-p";
  D.input = el("textarea", "search addid-in"); D.input.rows = 2; D.input.placeholder = "e.g. 10.1038/nature12373, 2101.00001, PMID 31452104";
  D.input.setAttribute("aria-label", "Identifiers or links, one or more"); D.input.spellcheck = false; D.input.autocomplete = "off";
  D.grow = () => { D.input.style.height = "auto"; D.input.style.height = D.input.scrollHeight + 2 + "px"; };   // CSS caps it at 6 rows
  D.input.oninput = () => { D.grow(); D.list.hidden = true; addIdCancelLabel("Cancel"); addIdHint(); };
  const line = el("div", "addid-line"); D.hint = el("span", "addid-hint"); D.hint.setAttribute("aria-live", "polite");
  D.off = el("span", "addid-off", "Offline"); D.off.title = "No internet connection. Fetching needs one; adding PDFs from your computer works offline.";
  line.append(D.hint, D.off);
  D.msg = el("div", "addid-msg"); D.msg.setAttribute("role", "alert"); D.msg.hidden = true;
  D.list = el("ul", "addid-list"); D.list.hidden = true; D.list.setAttribute("aria-label", "Items");
  const row = el("div", "addid-row"); D.cancel = btn("", "Cancel"); D.ok = btn("primary", "Add");
  D.cancel.onclick = () => D.batch ? stopAddBatch() : closeAddId(); D.ok.onclick = submitAddId; row.append(D.cancel, D.ok);
  D.box.append(h, p, D.input, line, D.msg, D.list, row); D.back.append(D.box); document.body.append(D.back);
  D.back.onmousedown = e => { if (e.target === D.back && !D.busy) closeAddId(); };
  D.box.onkeydown = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAddId(); }
    else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target === D.input) { e.preventDefault(); submitAddId(); }   // Shift+Enter: new line
    else if (e.key === "Tab") {   // keep focus inside the dialog
      const f = [...D.box.querySelectorAll("textarea, input, button")].filter(x => !x.disabled && x.offsetParent);
      const i = f.indexOf(document.activeElement), n = e.shiftKey ? i - 1 : i + 1;
      e.preventDefault(); f[(n + f.length) % f.length]?.focus();
    }
  };
  D.net = () => { D.off.hidden = navigator.onLine; };
  addEventListener("online", D.net); addEventListener("offline", D.net); D.net();
  // reading the clipboard is local; it only prefills when it holds something recognisable
  if (prefill == null) { const clip = await fl.readClipboardText().catch(() => ""); if (addDlg === D && !D.input.value && looksLikeIds(await fl.parseIds(clip))) prefill = clip.trim(); }
  if (addDlg !== D) return;
  if (prefill) D.input.value = prefill;
  D.grow(); addIdHint(); D.input.focus(); D.input.select();
}
function closeAddId() {
  const D = addDlg; if (!D) return;
  if (D.busy) { D.stop = true; fl.cancelFetch(); }
  removeEventListener("online", D.net); removeEventListener("offline", D.net);
  D.back.remove(); addDlg = null;
  if (D.opener && D.opener.isConnected && D.opener.focus) D.opener.focus();
}
function addIdCancelLabel(t) { const D = addDlg; if (D && D.cancel.lastChild) D.cancel.lastChild.textContent = t; }
async function addIdHint() {
  const D = addDlg; if (!D) return;
  const v = D.input.value, s = ++D.seq;
  const items = v.trim() ? await fl.parseIds(v) : [];
  if (addDlg !== D || s !== D.seq) return;
  const ids = items.filter(x => x.id).length, bad = items.length - ids;
  Object.assign(D, { items, ids }); D.msg.hidden = true;
  D.hint.textContent = !items.length ? "" : items.length === 1 ? (ids ? items[0].id.label : "Not recognised") : `${ids} recognised${bad ? ` · ${bad} not recognised` : ""}`;
  D.hint.classList.toggle("bad", items.length > 0 && !ids);
  D.ok.disabled = !ids || D.busy;
}
function addIdBusy(label) {
  const D = addDlg; if (!D) return;
  D.busy = !!label; D.input.readOnly = D.busy; D.ok.disabled = D.busy || !D.ids;
  D.box.classList.toggle("busy", D.busy); D.box.setAttribute("aria-busy", D.busy);
  if (label) { D.msg.hidden = false; D.msg.className = "addid-msg progress"; D.msg.replaceChildren(el("span", "spin"), el("span", null, label)); }
}
// "Open in browser" / "Add PDFs from file…" for a failure reason; null when neither applies
function addIdActs(reason, landingUrl, file = true) {
  const acts = el("div", "addid-acts");
  if (landingUrl && ADD_OPEN.includes(reason)) { const o = btn("", "Open in browser", "open"); o.onclick = () => fl.openExternal(landingUrl); acts.append(o); }
  if (file && (reason === "offline" || ADD_OPEN.includes(reason))) { const f = btn("", "Add PDFs from file…", "add"); f.onclick = () => { closeAddId(); chooseAndAdd(); }; acts.append(f); }
  return acts.childNodes.length ? acts : null;
}
function addIdFail(reason, landingUrl) {
  const D = addDlg; if (!D) return;
  D.msg.hidden = false; D.msg.className = "addid-msg err"; D.msg.replaceChildren(el("span", null, ADD_FAIL[reason] || ADD_FAIL.network));
  const a = addIdActs(reason, landingUrl); if (a) D.msg.append(a);
  D.input.focus();
}
// One row of the batch list. state: wait | run | ok | dup | err | bad | skip
function addIdRow(it, state, label, reason, landingUrl) {
  it.li = it.li || el("li", "addid-item");
  const top = el("div", "addid-item-top"), t = el("span", "addid-item-t", it.text), st = el("span", "addid-item-s " + state, label);
  t.title = it.text; if (state === "run") st.prepend(el("span", "spin"));
  top.append(t, st); it.li.replaceChildren(top);
  if (reason) { it.li.append(el("div", "addid-item-why", ADD_FAIL[reason] || ADD_FAIL.network)); const a = addIdActs(reason, landingUrl, false); if (a) it.li.append(a); }
}
fl.onFetchProgress(p => {
  const D = addDlg; if (!D || !D.busy) return;
  const mb = n => (n / 1048576).toFixed(1) + " MB";
  const label = p.stage === "find" ? "Finding PDF…" : p.stage === "import" ? "Saving to your library…"
    : p.got ? `Downloading… ${mb(p.got)}${p.total ? " of " + mb(p.total) : ""}` : "Downloading…";
  if (D.cur) addIdRow(D.cur, "run", label); else if (!D.batch) addIdBusy(label);
});
async function submitAddId() {
  const D = addDlg; if (!D || D.busy) return;
  await addIdHint(); if (addDlg !== D || !D.ids) return;
  if (D.items.length > 1) return addIdBatch(D);
  const { text, id } = D.items[0], dup = sameOrigin(id);
  if (dup) { closeAddId(); showExisting(dup); return; }
  if (!navigator.onLine) { addIdFail("offline"); return; }
  addIdBusy("Finding PDF…");
  const r = await fl.fetchPdf(text);
  if (addDlg !== D) { if (r.ok) fl.removeStored(r.info.storedPath); return; }   // cancelled meanwhile
  addIdBusy(null);
  if (!r.ok) { addIdFail(r.reason, r.landingUrl); return; }
  closeAddId();
  const same = S.db.docs.find(d => d.hash === r.info.hash);
  if (same) { await fl.removeStored(r.info.storedPath); showExisting(same); return; }
  const target = S.view.kind === "library" ? S.view.id : "inbox";
  S.busy = { label: "Adding " + id.label, done: 0, total: 1, page: "" }; renderList();
  let d = null;
  try { d = await addImported(r.info, target, { origin: r.origin, title: r.title }); } catch (err) { console.error(err); await fl.removeStored(r.info.storedPath); }
  S.busy = null; save();
  if (d) { if (S.view.kind !== "library" || S.view.id !== target) S.view = { kind: "library", id: target }; S.docId = d.id; S.off = new Set(); }
  renderAll();
  toast(d ? `Added “${d.title}”` : "The downloaded PDF couldn't be read. It may be damaged or password-protected.");
}
// Several items: one at a time (the main process runs a single fetch), with a status row each.
// The dialog stays open on any failure, stop or unrecognised item; otherwise it closes with a toast.
async function addIdBatch(D) {
  const items = D.items.map(x => ({ ...x })), n = D.ids;
  if (!navigator.onLine && items.some(x => x.id && !sameOrigin(x.id))) { addIdFail("offline"); return; }
  D.batch = items; D.stop = false; D.list.replaceChildren(); D.list.hidden = false; addIdCancelLabel("Cancel");
  for (const it of items) { addIdRow(it, it.id ? "wait" : "bad", it.id ? "Waiting" : "Not recognised"); D.list.append(it.li); }
  const target = S.view.kind === "library" ? S.view.id : "inbox", why = new Set();
  let added = 0, failed = 0, dups = 0, k = 0, stopped = false, lastId = null;
  for (const it of items) {
    if (!it.id) continue;
    if (addDlg !== D || D.stop) { stopped = true; addIdRow(it, "skip", "Skipped"); continue; }
    addIdBusy(`Adding ${++k} of ${n}…`);
    if (sameOrigin(it.id)) { dups++; addIdRow(it, "dup", "Already in library"); continue; }
    addIdRow(it, "run", "Finding PDF…"); it.li.scrollIntoView({ block: "nearest" }); D.cur = it;
    const r = await fl.fetchPdf(it.text);
    D.cur = null;
    if (addDlg !== D || D.stop || r.reason === "cancelled") { stopped = true; if (r.ok) fl.removeStored(r.info.storedPath); addIdRow(it, "skip", "Cancelled"); continue; }
    if (!r.ok) {
      failed++; why.add(r.reason); addIdRow(it, "err", "Couldn't add", r.reason, r.landingUrl);
      if (r.reason === "offline") D.stop = true;   // the rest would fail the same way
      continue;
    }
    const same = S.db.docs.find(d => d.hash === r.info.hash);
    if (same) { await fl.removeStored(r.info.storedPath); dups++; addIdRow(it, "dup", "Already in library"); continue; }
    addIdRow(it, "run", "Reading PDF…");
    let d = null;
    try { d = await addImported(r.info, target, { origin: r.origin, title: r.title }); } catch (err) { console.error(err); await fl.removeStored(r.info.storedPath); }
    if (d) { added++; lastId = d.id; save(); addIdRow(it, "ok", "Added"); }
    else { failed++; addIdRow(it, "err", "Couldn't read the PDF (damaged or password-protected)"); }
  }
  D.batch = null;
  if (lastId) { if (S.view.kind !== "library" || S.view.id !== target) S.view = { kind: "library", id: target }; S.docId = lastId; S.off = new Set(); renderAll(); }
  const bad = items.length - n, summary = `Added ${plural(added, "PDF")}` + (dups ? ` · ${dups} already in your library` : "");
  if (addDlg !== D) { if (added) toast(summary); return; }   // closed mid-batch
  addIdBusy(null);
  if (!failed && !stopped && !bad) { closeAddId(); toast(added ? summary : "Already in your library"); return; }
  D.msg.hidden = false; D.msg.className = "addid-msg" + (failed ? " err" : "");
  D.msg.replaceChildren(el("span", null, summary + (failed ? ` · ${failed} couldn't be added` : "") + (bad ? ` · ${bad} not recognised` : "") + (stopped ? " · stopped" : "")));
  const a = [...why].map(r => addIdActs(r, null)).find(Boolean); if (a) D.msg.append(a);
  addIdCancelLabel("Close"); D.input.focus();
}
function stopAddBatch() { const D = addDlg; if (D && D.batch) { D.stop = true; fl.cancelFetch(); } }


/* ---------------- guided tour (renderer/tour.js) ---------------- */
function startTour(name) {
  const st = S.db.settings;
  const extra = name === "app" && !S.db.docs.length ? { label: "Try a sample PDF", run: addSample } : null;
  Tour.start(name, { steps: Tour.pending(st, name), extra,
    onShow: step => { Tour.markShown(st, name, step); save(); },
    onEnd: (ch, skipped) => {
      if (skipped) { Tour.skipAll(st); save(); }
      else if (ch === "app") tourSoon();   // a PDF already open carries straight on into the reader chapter
    } });
}
// Each chapter runs the first time its part of the app is on screen: app → reader → viewer.
// Steps skipped because their button wasn't there (no highlights yet…) show once it appears.
function maybeTour() {
  if (Tour.isOpen() || addDlg || MENU || S.editingTitle) return;
  const ready = n => Tour.ready(Tour.pending(S.db.settings, n));
  const name = ready("app") ? "app"
    : Annot.isOpen() ? (ready("viewer") ? "viewer" : null)
    : S.view.kind !== "search" && ready("reader") ? "reader" : null;
  if (name) startTour(name);
}
function tourSoon() { clearTimeout(tourSoon.t); tourSoon.t = setTimeout(maybeTour, 500); }

let dragDepth = 0;
function hideDrop() { dragDepth = 0; $("drop").hidden = true; }
addEventListener("dragenter", e => { if (e.dataTransfer.types.includes("Files")) { dragDepth++; $("drop").hidden = false; $("drop-target").textContent = "into " + (S.view.kind === "library" ? lib(S.view.id).name : "Inbox"); } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) hideDrop(); });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => {
  e.preventDefault(); hideDrop(); const files = [...e.dataTransfer.files]; if (files.length) return addPaths(files.map(f => fl.pathFor(f)));
  // dropped links (e.g. dragged from a browser) open "Add by identifier" prefilled
  if (e.dataTransfer.types.includes("application/x-faelights-doc")) return;
  const t = (e.dataTransfer.getData("text/uri-list") || "").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#")).join("\n") || e.dataTransfer.getData("text/plain");
  if (t) fl.parseIds(t).then(xs => { if (looksLikeIds(xs)) openAddId(t.trim()); });
});
// Ctrl/⌘+V outside a text field with identifiers or links (one or a list) opens the dialog prefilled
addEventListener("paste", e => {
  if (addDlg || Tour.isOpen() || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const t = e.clipboardData?.getData("text/plain"); if (!t) return;
  fl.parseIds(t).then(xs => { if (looksLikeIds(xs)) openAddId(t.trim()); });
});

addEventListener("keydown", e => {
  if (addDlg) return;   // the add-from-link dialog handles its own keys
  if (e.target.matches("input, select, textarea")) return;
  if (e.target.matches(".resizer")) return resizerKey(e, e.target);
  if (Annot.key(e)) return;
  const docs = S.view.kind === "search" ? [] : visibleDocs();
  const i = docs.findIndex(d => d.id === S.docId);
  if ((e.key === "ArrowDown" || e.key === "j") && docs.length) { e.preventDefault(); openDoc(docs[Math.min(docs.length - 1, i + 1)].id); }
  if ((e.key === "ArrowUp" || e.key === "k") && docs.length) { e.preventDefault(); openDoc(docs[Math.max(0, i - 1)].id); }
  if (e.key === "Delete" && S.docId && S.view.kind !== "search") removeDoc(doc(S.docId));
});

fl.onMenu(ch => {
  const d = S.docId && doc(S.docId);
  if (ch === "add") chooseAndAdd();
  if (ch === "add-id") openAddId();
  if (ch === "new-library") newLibrary();
  if (ch === "export-doc") { if (d) exportDoc(d); else toast("Open a PDF first"); }
  if (ch === "export-library") exportLibrary(S.view.kind === "library" ? S.view.id : (d ? d.libraryId : "inbox"));
  if (ch === "rescan-all") rescanAll();
  if (ch === "search") go({ kind: "search" });
  if (ch === "toggle-mode") { S.db.settings.mode = S.db.settings.mode === "full" ? "only" : "full"; save(); renderReader(); }
  if (ch.startsWith("pane:")) togglePane(ch.slice(5));
  if (ch === "layout-reset") resetLayout();
  if (ch === "tour") { S.db.settings.tour = {}; save(); startTour("app"); }
});
fl.onOpenFiles(files => addPaths(files));
fl.onTheme(t => { S.theme = t; renderSide(); });

(async function boot() {
  [S.db, S.theme] = await Promise.all([fl.loadDb(), fl.getTheme()]);
  const inbox = S.db.docs.filter(d => d.libraryId === "inbox").sort((a, b) => b.addedAt - a.addedAt);
  S.docId = inbox[0] ? inbox[0].id : null;
  $("app").append(resizer("side"), resizer("list"));
  renderAll();
  fl.ready();
  setTimeout(maybeTour, 900);   // after the splash hands over
  const pending = await fl.pendingFiles();
  if (pending.length) addPaths(pending);
})();
