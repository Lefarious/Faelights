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
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'
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

/* ---------------- PDF analysis ---------------- */
function cleanTitle(t) {
  t = (t || "").replace(/^Microsoft (Word|PowerPoint) - /i, "").replace(/\.(docx?|pptx?|pdf)$/i, "").trim();
  if (!t || /^untitled$/i.test(t) || t.length < 3) return "";
  return t;
}
async function analyzeBytes(bytes, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  let title = "";
  try { const md = await pdf.getMetadata(); title = cleanTitle(md.info && md.info.Title); } catch (_) {}
  const result = await analyzePdf(pdf, onProgress);
  pdf.destroy();
  return { title, result };
}
function summary(result) {
  const colours = new Map();
  for (const e of result.entries) for (const s of e.spans) colours.set(ckey(s.color), s.color);
  return { count: result.entries.reduce((n, e) => n + e.spans.length, 0) + result.loose.length, colours: [...colours.values()].slice(0, 6) };
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
      else {
        const info = await fl.importPdf(p);
        const d = { id: info.id, libraryId: target, title: "", fileName: info.fileName, sourcePath: opts.sample ? null : info.sourcePath,
          storedPath: info.storedPath, hash: info.hash, addedAt: Date.now(), tags: [], starred: false, scannedMtime: info.mtime };
        const { bytes } = await fl.readPdf({ ...d, sourcePath: null });
        const { title, result } = await analyzeBytes(bytes, (pg, n) => { S.busy.page = `page ${pg} of ${n}`; renderProgress(); });
        Object.assign(d, { title: title || info.fileName.replace(/\.pdf$/i, ""), result, pages: result.pages, scannedAt: Date.now(), ...summary(result) });
        S.db.docs.push(d); lastId = d.id;
      }
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
    const { result } = await analyzeBytes(bytes);
    Object.assign(d, { result, pages: result.pages, scannedAt: Date.now(), scannedMtime: mtime, stale: false, ...summary(result) });
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
async function libraryMenu(id) {
  const l = lib(id);
  const items = [{ id: "rename", label: "Rename" }, { id: "export", label: "Export to folder…" }];
  if (!l.system) items.push({ type: "separator" }, { id: "delete", label: "Delete library…" });
  const r = await fl.popup(items);
  if (r === "rename") { S.renaming = id; renderSide(); }
  if (r === "export") exportLibrary(id);
  if (r === "delete") deleteLibrary(id);
}

/* ---------------- doc actions ---------------- */
async function removeDoc(d) {
  const ok = await fl.confirm(`Remove “${d.title}” from Faelights?`, "Its highlights and the library's copy are removed. Your original PDF is not touched.", "Remove");
  if (!ok) return;
  await fl.removeStored(d.storedPath);
  S.db.docs = S.db.docs.filter(x => x.id !== d.id);
  if (S.docId === d.id) S.docId = null;
  save(); renderAll();
}
async function docMenu(d) {
  const libs = S.db.libraries.map(l => ({ id: "move:" + l.id, label: l.name, checked: l.id === d.libraryId }));
  const items = [
    { id: "open", label: "Open PDF" },
    { id: "reveal", label: process_platform() === "darwin" ? "Show in Finder" : "Show in folder" },
    { id: "rescan", label: "Rescan highlights" },
    ...(d.sourceMissing || !d.sourcePath ? [{ id: "relink", label: "Find original file…" }] : []),
    { type: "separator" },
    { id: "star", label: d.starred ? "Remove star" : "Star" },
    { label: "Move to", submenu: libs },
    { id: "export", label: "Export as Markdown…" },
    { id: "copy", label: "Copy all extracts" },
    { type: "separator" },
    { id: "remove", label: "Remove from Faelights…" }
  ];
  const r = await fl.popup(items);
  if (!r) return;
  if (r === "open") { const e = await fl.openPdf(d); if (e !== true) toast("Couldn't open the PDF"); }
  if (r === "reveal") fl.revealPdf(d);
  if (r === "rescan") { await rescan(d); renderAll(); }
  if (r === "relink") relink(d);
  if (r === "star") { d.starred = !d.starred; save(); renderAll(); }
  if (r.startsWith("move:")) moveDoc(d, r.slice(5));
  if (r === "export") exportDoc(d);
  if (r === "copy") copyText(docText(d, S.db.settings.fmt, false), "All extracts");
  if (r === "remove") removeDoc(d);
}
function process_platform() { return navigator.userAgent.includes("Mac") ? "darwin" : "other"; }
function moveDoc(d, libId) {
  if (d.libraryId === libId) return;
  d.libraryId = libId; save();
  toast(`Moved to ${lib(libId).name}`);
  renderAll();
}
async function relink(d) {
  const p = await fl.relinkPdf(d); if (!p) return;
  d.sourcePath = p; d.sourceMissing = false; d.scannedMtime = 0;
  await rescan(d); renderAll();
}

/* ---------------- export ---------------- */
function wrapHl(t, fmt) { t = t.trim(); if (!t) return ""; return fmt === "md" ? `**${t}**` : fmt === "obsidian" ? `==${t}==` : t; }
function entryLines(e, fmt, mode) {
  const ids = new Set(e.spans.map(s => s.id));
  let body;
  if (mode === "full") {
    body = e.segs.map(s => {
      if (s.hl === -1 || !ids.has(s.hl) || fmt === "plain") return s.t;
      return s.t.match(/^\s*/)[0] + wrapHl(s.t, fmt) + s.t.match(/\s*$/)[0];
    }).join("").replace(/\s{2,}/g, " ").trim();
  } else body = e.spans.map(s => s.text).join(" … ");
  const lines = [`- ${body} (p. ${e.page})`];
  for (const s of e.spans) if (s.comment && s.comment !== s.text) lines.push(`  - Note: ${s.comment}`);
  return lines;
}
function groupsOf(entries) {
  const gs = [];
  for (const e of entries) {
    const key = e.topic ? e.topic.at + "|" + e.topic.title : "none";
    let g = gs[gs.length - 1];
    if (!g || g.key !== key) { g = { key, topic: e.topic, items: [] }; gs.push(g); }
    g.items.push(e);
  }
  return gs;
}
function docText(d, fmt, frontmatter, entries) {
  const mode = S.db.settings.mode;
  entries = entries || d.result.entries;
  const out = [];
  if (frontmatter) {
    out.push("---", `title: "${d.title.replace(/"/g, '\\"')}"`, `source: "${(d.sourcePath || d.fileName).replace(/\\/g, "/").replace(/"/g, '\\"')}"`,
      `library: "${(lib(d.libraryId) || {}).name || ""}"`, `pages: ${d.pages}`, `highlights: ${d.count}`,
      `tags: [${d.tags.map(t => JSON.stringify(t)).join(", ")}]`, `exported: ${new Date().toISOString().slice(0, 10)}`, "---", "");
  }
  out.push(fmt === "plain" ? d.title : `# ${d.title}`, "");
  const done = new Set();
  for (const g of groupsOf(entries)) {
    const path = g.topic ? g.topic.path : [PRE_TOPIC];
    path.forEach((t, i) => {
      const key = path.slice(0, i + 1).join("\u0001");
      if (i < path.length - 1 && done.has(key)) return;
      done.add(key);
      out.push(fmt === "plain" ? t.toUpperCase() : "#".repeat(Math.min(i + 2, 6)) + " " + t, "");
    });
    for (const e of g.items) out.push(...entryLines(e, fmt, mode));
    out.push("");
  }
  if (d.result.loose.length) out.push(`(${plural(d.result.loose.length, "mark")} on pages without text: ${[...new Set(d.result.loose.map(l => l.page))].join(", ")})`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
const safeName = s => s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
async function exportDoc(d) {
  const fmt = S.db.settings.fmt;
  const p = await fl.exportFile(safeName(d.title) + (fmt === "plain" ? ".txt" : ".md"), docText(d, fmt, fmt !== "plain"));
  if (p) toast("Exported to " + p.split(/[\\/]/).pop());
}
async function exportLibrary(id) {
  const docs = S.db.docs.filter(d => d.libraryId === id);
  if (!docs.length) { toast("This library has no PDFs to export"); return; }
  const fmt = S.db.settings.fmt, used = new Set();
  const files = docs.map(d => {
    let n = safeName(d.title), k = 2; while (used.has(n.toLowerCase())) n = safeName(d.title) + " " + k++; used.add(n.toLowerCase());
    return { name: n + (fmt === "plain" ? ".txt" : ".md"), text: docText(d, fmt, fmt !== "plain") };
  });
  const dir = await fl.exportFolder(safeName(lib(id).name), files);
  if (dir) { toast(`Exported ${plural(files.length, "file")}`); fl.openFolder(dir); }
}

/* ---------------- rendering: sidebar ---------------- */
function navItem({ icon, name, count, current, onClick, onContext, onDrop, editing, onRename }) {
  const li = el("li");
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
  if (onContext) b.oncontextmenu = e => { e.preventDefault(); onContext(); };
  if (onDrop) {
    b.ondragover = e => { if (e.dataTransfer.types.includes("application/x-faelights-doc") || e.dataTransfer.types.includes("Files")) { e.preventDefault(); b.classList.add("dropping"); } };
    b.ondragleave = () => b.classList.remove("dropping");
    b.ondrop = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove("dropping"); onDrop(e); hideDrop(); };
  }
  li.append(b); return li;
}
function renderSide() {
  const side = $("side"); side.replaceChildren();
  const brand = el("div", "brand"); brand.append(brandImg("mark", "brand-mark"), el("h1", null, "faelights")); brand.setAttribute("aria-label", "Faelights");
  const add = btn("primary add", "Add PDFs", "add"); add.onclick = chooseAndAdd;
  side.append(brand, add);
  const sc = el("div", "side-scroll");

  const top = el("ul", "nav");
  const total = S.db.docs.reduce((n, d) => n + (d.count || 0), 0);
  top.append(navItem({ icon: svg(ICON.search), name: "Search highlights", count: total, current: S.view.kind === "search", onClick: () => go({ kind: "search" }) }));
  top.append(navItem({ icon: svg(ICON.all), name: "All PDFs", count: S.db.docs.length, current: S.view.kind === "all", onClick: () => go({ kind: "all" }) }));
  const starred = S.db.docs.filter(d => d.starred).length;
  top.append(navItem({ icon: svg(ICON.star), name: "Starred", count: starred, current: S.view.kind === "starred", onClick: () => go({ kind: "starred" }) }));
  sc.append(top);

  const h = el("h3"); h.append(el("span", null, "Libraries"));
  const nb = el("button", null, "+"); nb.title = "New library"; nb.setAttribute("aria-label", "New library"); nb.onclick = newLibrary; h.append(nb);
  sc.append(h);
  const ul = el("ul", "nav");
  for (const l of S.db.libraries) {
    const n = S.db.docs.filter(d => d.libraryId === l.id).length;
    ul.append(navItem({
      icon: svg(l.system ? ICON.inbox : ICON.lib), name: l.name, count: n,
      current: S.view.kind === "library" && S.view.id === l.id,
      editing: S.renaming === l.id,
      onRename: v => { if (v) l.name = v; S.renaming = null; save(); renderAll(); },
      onClick: () => go({ kind: "library", id: l.id }),
      onContext: () => libraryMenu(l.id),
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
  const foot = el("div", "side-foot"), status = el("div", "foot-row");
  status.append(el("span", null, stale ? plural(stale, "PDF") + " changed" : plural(S.db.docs.length, "PDF")));
  const rb = el("button", "linkbtn", stale ? "Rescan" : "Rescan all"); rb.onclick = rescanAll; if (S.db.docs.length) status.append(rb);
  foot.append(status, themeSwitch());
  side.append(foot);
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
  if (v.kind === "tag") return "#" + v.tag;
  return "All PDFs";
}
function visibleDocs() {
  const v = S.view; let docs = S.db.docs;
  if (v.kind === "library") docs = docs.filter(d => d.libraryId === v.id);
  if (v.kind === "starred") docs = docs.filter(d => d.starred);
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
  if (S.view.kind === "search") return;
  const head = el("div", "list-head");
  const h = el("h2", null, viewTitle());
  if (S.view.kind === "library") { h.ondblclick = () => { S.renaming = S.view.id; renderSide(); }; h.title = "Double-click to rename in the sidebar"; }
  const docsAll = visibleDocs();
  const hl = docsAll.reduce((n, d) => n + (d.count || 0), 0);
  head.append(h, el("div", "sub", `${plural(docsAll.length, "PDF")} · ${plural(hl, "highlight")}`));
  const tools = el("div", "list-tools");
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
  const docs = el("div", "docs"); docs.id = "docs"; list.append(docs);
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
      const a = btn("primary", "Add PDFs", "add"); a.onclick = chooseAndAdd; e.append(a);
      if (!S.db.docs.length) { const s = btn("", "Try a sample PDF"); s.onclick = addSample; e.append(s); }
    } else if (S.view.kind === "starred") e.append(el("b", null, "No starred PDFs"), el("span", null, "Star a PDF from its ⋯ menu to keep it here."));
    else e.append(el("b", null, "No PDFs"), el("span", null, "Add PDFs to start a library."));
    box.append(e); return;
  }
  for (const d of docs) {
    const b = el("button", "doc"); b.setAttribute("aria-current", d.id === S.docId); b.draggable = true;
    const t = el("div", "t"); t.append(el("span", null, d.title)); if (d.starred) { const s = svg(ICON.star); s.classList.add("star"); s.style.width = "13px"; s.setAttribute("fill", "currentColor"); t.append(s); }
    const m = el("div", "m");
    m.append(el("span", null, plural(d.count || 0, "mark")), el("span", null, plural(d.pages || 0, "page")));
    if (d.colours && d.colours.length) { const sw = el("span", "swatches"); for (const c of d.colours) { const i = el("i"); i.style.background = `rgb(${c.join(",")})`; sw.append(i); } m.append(sw); }
    if (S.view.kind !== "library") m.append(el("span", null, lib(d.libraryId)?.name || ""));
    if (d.sourceMissing) m.append(el("span", "pill warn", "Original moved"));
    else if (d.stale) m.append(el("span", "pill", "Changed"));
    b.append(t, m);
    if (d.tags && d.tags.length) { const tg = el("div", "tags-inline"); for (const x of d.tags) tg.append(el("span", null, x)); b.append(tg); }
    b.onclick = () => openDoc(d.id);
    b.oncontextmenu = e => { e.preventDefault(); docMenu(d); };
    b.ondragstart = e => { e.dataTransfer.setData("application/x-faelights-doc", d.id); e.dataTransfer.effectAllowed = "move"; };
    box.append(b);
  }
}

async function openDoc(id, entryIdx) {
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

function renderReader() {
  const r = $("reader"); r.replaceChildren();
  if (S.view.kind === "search") return renderSearch(r);
  const d = S.docId && doc(S.docId);
  if (!d || !visibleDocs().some(x => x.id === d.id)) return renderBlank(r);
  r.classList.toggle("only", S.db.settings.mode === "only");

  // header
  const head = el("div", "r-head");
  const tt = el("div", "r-title");
  if (S.editingTitle) {
    const inp = el("input"); inp.value = d.title; inp.setAttribute("aria-label", "Title");
    const done = ok => { if (inp.dataset.done) return; inp.dataset.done = 1; if (ok && inp.value.trim()) d.title = inp.value.trim(); S.editingTitle = false; save(); renderAll(); };
    inp.onkeydown = e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }; inp.onblur = () => done(true);
    tt.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
  } else { const h = el("h2", null, d.title); h.title = "Click to rename"; h.onclick = () => { S.editingTitle = true; renderReader(); }; tt.append(h); }
  const acts = el("div", "r-actions");
  const ob = btn("icon", null, "open", "Open PDF"); ob.onclick = async () => { const e = await fl.openPdf(d); if (e !== true) toast("Couldn't open the PDF"); };
  const mb = btn("icon", null, "more", "More actions"); mb.onclick = () => docMenu(d);
  acts.append(ob, mb); tt.append(acts); head.append(tt);

  const meta = el("div", "r-meta");
  const lb = el("button", "lib"); lb.append(svg(lib(d.libraryId)?.system ? ICON.inbox : ICON.lib), document.createTextNode(lib(d.libraryId)?.name || "Inbox"));
  lb.querySelector("svg").style.width = "13px"; lb.title = "Move to another library";
  lb.onclick = async () => { const r = await fl.popup(S.db.libraries.map(l => ({ id: l.id, label: l.name, checked: l.id === d.libraryId }))); if (r) moveDoc(d, r); };
  meta.append(lb, el("span", null, d.fileName), el("span", null, plural(d.pages, "page")), el("span", null, plural(d.count, "highlight")),
    el("span", null, "Added " + new Date(d.addedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })));
  const star = el("button", "lib", d.starred ? "★ Starred" : "☆ Star"); star.onclick = () => { d.starred = !d.starred; save(); renderAll(); }; meta.append(star);
  const tools = el("div", "r-tools");
  const tagedit = el("div", "tagedit");
  for (const t of d.tags) { const g = el("span", "tg", t); const x = el("button", null, "×"); x.title = "Remove tag"; x.setAttribute("aria-label", "Remove tag " + t); x.onclick = () => { d.tags = d.tags.filter(z => z !== t); save(); renderAll(); }; g.append(x); tagedit.append(g); }
  const ti = el("input"); ti.id = "tagin"; ti.placeholder = "+ tag"; ti.setAttribute("aria-label", "Add tag");
  const known = [...new Set(S.db.docs.flatMap(x => x.tags))]; if (known.length) { const dl = el("datalist"); dl.id = "tagsdl"; for (const k of known) { const o = el("option"); o.value = k; dl.append(o); } tagedit.append(dl); ti.setAttribute("list", "tagsdl"); }
  ti.onkeydown = e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const v = ti.value.trim().replace(/^#/, ""); if (v && !d.tags.includes(v)) { d.tags.push(v); save(); renderAll(); setTimeout(() => $("tagin")?.focus(), 0); } } };
  tagedit.append(ti); meta.append(tagedit); tools.append(el("span", "sp"));

  const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "What to show");
  for (const [m, label] of [["full", "Full sentence"], ["only", "Highlights only"]]) {
    const b = el("button", null, label); b.setAttribute("aria-pressed", S.db.settings.mode === m);
    b.onclick = () => { S.db.settings.mode = m; save(); renderReader(); }; seg.append(b);
  }
  const fmt = el("select", "btn"); fmt.id = "fmt"; fmt.title = "Format used when copying or exporting"; fmt.setAttribute("aria-label", "Copy format");
  for (const [v, t] of [["md", "Markdown"], ["obsidian", "Obsidian"], ["plain", "Plain text"]]) { const o = el("option", null, t); o.value = v; fmt.append(o); }
  fmt.value = S.db.settings.fmt; fmt.onchange = () => { S.db.settings.fmt = fmt.value; save(); };
  const cb = btn("", "Copy", "copy"); cb.onclick = () => copyText(docText(d, S.db.settings.fmt, false, filtered(d)), "Extracts");
  const eb = btn("", "Export", "export"); eb.onclick = () => exportDoc(d);
  tools.append(seg, fmt, cb, eb); head.append(meta, tools);
  r.append(head);

  if (d.sourceMissing) {
    const bn = el("div", "banner"); bn.append(el("span", null, "The original PDF has moved or been deleted. Showing the copy saved in your library."));
    const f = el("button", "linkbtn", "Find original file"); f.onclick = () => relink(d); bn.append(f); r.append(bn);
  }

  // body
  const body = el("div", "r-body"); body.id = "rbody";
  const rail = el("aside", "rail");
  const main = el("div");
  const entries = filtered(d);
  const groups = groupsOf(entries);
  const colours = new Map();
  for (const e of d.result.entries) for (const s of e.spans) { const k = ckey(s.color); const c = colours.get(k) || { color: s.color, n: 0 }; c.n++; colours.set(k, c); }
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
      a.append(el("span", "t", g.topic ? g.topic.title : PRE_TOPIC), el("span", "c", String(g.items.reduce((n, e) => n + e.spans.length, 0))));
      a.onclick = ev => { ev.preventDefault(); $("g" + gi)?.scrollIntoView({ behavior: "smooth" }); };
      li.append(a); ul.append(li);
    });
    sec.append(ul, el("p", "source", TOPIC_SOURCE[d.result.topicSource] || "No headings found; in page order."));
    rail.append(sec);
  }
  if (!d.result.entries.length && !d.result.loose.length) {
    const b = el("div", "blank"); b.style.margin = "0";
    b.append(el("h2", null, "No highlights in this PDF"), el("p", null, "Faelights reads highlight, underline and strike-through marks saved in the file. If your reader flattened them into the page, or the PDF was exported without annotations, there's nothing to read. Highlight it again and use Rescan."));
    main.append(b);
  }
  groups.forEach((g, gi) => {
    const sec = el("section", "group"); sec.id = "g" + gi;
    const gh = el("div", "group-head");
    if (g.topic && g.topic.path.length > 1) gh.append(el("p", "crumb", g.topic.path.slice(0, -1).join("  ›  ")));
    const h = el("h3"); h.append(document.createTextNode(g.topic ? g.topic.title : PRE_TOPIC));
    const n = g.items.reduce((a, e) => a + e.spans.length, 0); h.append(el("small", null, plural(n, "extract"))); gh.append(h); sec.append(gh);
    for (const e of g.items) {
      const row = el("article", "ex"); row.id = "e" + e.n;
      row.append(el("div", "pg", "p. " + e.page), quoteEl(e, S.db.settings.mode, ""));
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
  body.append(rail, main); r.append(body);
  if (S.jumpTo != null) {
    const target = $("e" + S.jumpTo); S.jumpTo = null;
    if (target) setTimeout(() => { target.scrollIntoView({ block: "center" }); target.classList.add("flash"); }, 30);
  }
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
function renderBlank(r) {
  const b = el("div", "blank");
  b.append(brandImg("mote", "blank-mote"));
  if (!S.db.docs.length) {
    b.append(el("h2", null, "Your highlights, organised"), el("p", null, "Add annotated PDFs and Faelights lists every highlight in reading order, grouped by the topic it sits under. Sort PDFs into libraries, tag them, and search across all of them."));
    const row = el("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.flexWrap = "wrap";
    const a = btn("primary", "Add PDFs", "add"); a.onclick = chooseAndAdd; const s = btn("", "Try a sample PDF"); s.onclick = addSample; row.append(a, s); b.append(row);
  } else b.append(el("h2", null, "Pick a PDF"), el("p", null, "Choose a PDF from the list to read its highlights."));
  const k = el("div", "keys"); const mod = process_platform() === "darwin" ? "⌘" : "Ctrl";
  for (const [key, what] of [[`${mod} O`, "Add PDFs"], [`${mod} F`, "Search all highlights"], [`${mod} T`, "Full sentence / highlights only"], [`${mod} E`, "Export current PDF"], [`${mod} ⇧ N`, "New library"]]) {
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

let dragDepth = 0;
function hideDrop() { dragDepth = 0; $("drop").hidden = true; }
addEventListener("dragenter", e => { if (e.dataTransfer.types.includes("Files")) { dragDepth++; $("drop").hidden = false; $("drop-target").textContent = "into " + (S.view.kind === "library" ? lib(S.view.id).name : "Inbox"); } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) hideDrop(); });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => { e.preventDefault(); hideDrop(); const files = [...e.dataTransfer.files]; if (files.length) addPaths(files.map(f => fl.pathFor(f))); });

addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea")) return;
  const docs = S.view.kind === "search" ? [] : visibleDocs();
  const i = docs.findIndex(d => d.id === S.docId);
  if ((e.key === "ArrowDown" || e.key === "j") && docs.length) { e.preventDefault(); openDoc(docs[Math.min(docs.length - 1, i + 1)].id); }
  if ((e.key === "ArrowUp" || e.key === "k") && docs.length) { e.preventDefault(); openDoc(docs[Math.max(0, i - 1)].id); }
  if (e.key === "Delete" && S.docId && S.view.kind !== "search") removeDoc(doc(S.docId));
});

fl.onMenu(ch => {
  const d = S.docId && doc(S.docId);
  if (ch === "add") chooseAndAdd();
  if (ch === "new-library") newLibrary();
  if (ch === "export-doc") { if (d) exportDoc(d); else toast("Open a PDF first"); }
  if (ch === "export-library") exportLibrary(S.view.kind === "library" ? S.view.id : (d ? d.libraryId : "inbox"));
  if (ch === "rescan-all") rescanAll();
  if (ch === "search") go({ kind: "search" });
  if (ch === "toggle-mode") { S.db.settings.mode = S.db.settings.mode === "full" ? "only" : "full"; save(); renderReader(); }
});
fl.onOpenFiles(files => addPaths(files));
fl.onTheme(t => { S.theme = t; renderSide(); });

(async function boot() {
  [S.db, S.theme] = await Promise.all([fl.loadDb(), fl.getTheme()]);
  const inbox = S.db.docs.filter(d => d.libraryId === "inbox").sort((a, b) => b.addedAt - a.addedAt);
  S.docId = inbox[0] ? inbox[0].id : null;
  renderAll();
  fl.ready();
  const pending = await fl.pendingFiles();
  if (pending.length) addPaths(pending);
})();
