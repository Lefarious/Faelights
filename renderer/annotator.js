/* Faelights — PDF viewer / annotator
   Renders a doc with pdf.js and writes real PDF annotations (Highlight, Underline, StrikeOut, Text notes, Ink, Square image boxes) with pdf-lib.
   Every edit produces new bytes that are saved straight into the library's copy (never the original) and re-rendered,
   so undo/redo is just a stack of byte snapshots. Leaving the viewer rescans the doc so new marks show up as extracts. */
"use strict";

const Annot = (() => {
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, PDFRef, PDFNumber } = PDFLib;
  const N = PDFName.of;
  const PT = 96 / 72;                       // 100 % zoom = PDF points at CSS pixel density
  const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  const UNDO_MAX = 40;
  const COLORS = [
    ["Yellow", [1, 0.84, 0.2]], ["Green", [0.45, 0.85, 0.36]], ["Blue", [0.36, 0.68, 1]],
    ["Pink", [1, 0.45, 0.68]], ["Orange", [1, 0.58, 0.2]]
  ];
  const TOOLS = [
    ["select", "Select", "cursor", "V"], ["highlight", "Highlight", "highlighter", "H"], ["underline", "Underline", "underline", "U"],
    ["strike", "Strike through", "strike", "S"], ["note", "Note", "note", "N"], ["draw", "Draw", "pen", "D"],
    ["image", "Capture image", "image", "I"]
  ];
  const SUBTYPE = { highlight: "Highlight", underline: "Underline", strike: "StrikeOut" };
  const RECOLOR = new Set(["Highlight", "Underline", "StrikeOut", "Squiggly", "Ink", "Text", "Square"]);
  const SKIP = new Set(["Link", "Widget", "Popup"]);
  const ICO = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    cursor: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
    highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>',
    strike: '<path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16"/>',
    note: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    fit: '<path d="M21 3H3v18h18zM8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'
  };

  let A = null;   // the open session

  /* ---------- small helpers ---------- */
  const num = n => String(Math.round(n * 100) / 100);
  const pdfNow = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  const uid = () => "fl-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const rgbCss = c => `rgb(${c.map(v => Math.round(v * 255)).join(" ")})`;
  const sameColor = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  const iconBtn = (name, label, cls) => { const b = el("button", "pv-ib " + (cls || "")); b.append(svg(ICO[name])); b.title = label; b.setAttribute("aria-label", label); return b; };
  const BOX_W = 1.5;                        // image-box border, in PDF points
  const color = () => S.db.settings.annotColor || COLORS[0][1];
  // pdf.js annotation ids are "<num>R" or "<num>R<gen>" for indirect objects
  function refOf(id) { const m = /^(\d+)R(\d*)$/.exec(id || ""); return m ? PDFRef.of(+m[1], +(m[2] || 0)) : null; }

  /* ---------- appearance streams (so every viewer, not just ours, draws the mark) ---------- */
  // Quads use Acrobat's order: [x1 y1 x2 y2 x3 y3 x4 y4] = top-left, top-right, bottom-left, bottom-right *as read*,
  // which keeps underline/strike lines on the right edge on rotated pages too.
  function quadGeom(q) {
    const [x1, y1, x2, y2, x3, y3, x4, y4] = q;
    const ux = x1 - x3, uy = y1 - y3, h = Math.hypot(ux, uy) || 1;
    return { x1, y1, x2, y2, x3, y3, x4, y4, h, ux: ux / h, uy: uy / h };
  }
  function bbox(pts, pad = 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
  function appearance(sub, { quads, ink, width, c, rect }) {
    const rgb = c.map(num).join(" ");
    let ops = "", multiply = false, box = rect;
    const qs = [];
    for (let i = 0; quads && i + 7 < quads.length; i += 8) qs.push(quadGeom(quads.slice(i, i + 8)));
    if (sub === "Highlight") {
      multiply = true; ops = `/GS0 gs ${rgb} rg\n`;
      for (const g of qs) ops += `${num(g.x1)} ${num(g.y1)} m ${num(g.x2)} ${num(g.y2)} l ${num(g.x4)} ${num(g.y4)} l ${num(g.x3)} ${num(g.y3)} l h f\n`;
      box = bbox(quads, 1);
    } else if (sub === "Underline" || sub === "StrikeOut") {
      ops = `${rgb} RG\n`;
      for (const g of qs) {
        const t = Math.max(0.6, g.h / 14), k = sub === "Underline" ? t : g.h * 0.42;
        ops += `${num(t)} w ${num(g.x3 + g.ux * k)} ${num(g.y3 + g.uy * k)} m ${num(g.x4 + g.ux * k)} ${num(g.y4 + g.uy * k)} l S\n`;
      }
      box = bbox(quads, 1);
    } else if (sub === "Squiggly") {
      ops = `${rgb} RG\n`;
      for (const g of qs) {
        const t = Math.max(0.5, g.h / 18), amp = g.h / 14, len = Math.hypot(g.x4 - g.x3, g.y4 - g.y3), dx = (g.x4 - g.x3) / len, dy = (g.y4 - g.y3) / len;
        const step = Math.max(1.5, g.h / 6);
        ops += `${num(t)} w ${num(g.x3 + g.ux * amp)} ${num(g.y3 + g.uy * amp)} m`;
        for (let s = step, up = false; s <= len; s += step, up = !up) { const a = up ? amp : amp * 2.4; ops += ` ${num(g.x3 + dx * s + g.ux * a)} ${num(g.y3 + dy * s + g.uy * a)} l`; }
        ops += " S\n";
      }
      box = bbox(quads, 1);
    } else if (sub === "Ink") {
      ops = `1 J 1 j ${num(width)} w ${rgb} RG\n`;
      for (const path of ink) {
        ops += `${num(path[0])} ${num(path[1])} m`;
        if (path.length === 2) ops += ` ${num(path[0] + 0.01)} ${num(path[1])} l`;
        for (let i = 2; i + 1 < path.length; i += 2) ops += ` ${num(path[i])} ${num(path[i + 1])} l`;
        ops += " S\n";
      }
      box = bbox(ink.flat(), width);
    } else if (sub === "Square") {
      // image box: an outline only (no /IC fill), inset by half the border so the stroke stays inside /Rect
      const [x0, y0, x1, y1] = pdfjsLib.Util.normalizeRect(rect), h = width / 2;
      ops = `${num(width)} w ${rgb} RG ${num(x0 + h)} ${num(y0 + h)} ${num(Math.max(0, x1 - x0 - width))} ${num(Math.max(0, y1 - y0 - width))} re S
`;
      box = [x0, y0, x1, y1];
    } else if (sub === "Text") {
      // a little speech-bubble icon in its own 20×20 box; the box is stretched over /Rect
      ops = `${rgb} rg 0.25 0.22 0.3 RG 0.8 w 2 6 m 2 18 l 18 18 l 18 6 l 8 6 l 4 2 l 5 6 l h B 0.25 0.22 0.3 RG 1 w 5.5 14 m 14.5 14 l 5.5 10.5 m 12 10.5 l S\n`;
      return { box: rect, bbox: [0, 0, 20, 20], ops, multiply };
    }
    return { box, bbox: box, ops, multiply };
  }
  function setAppearance(ctx, dict, ap) {
    const old = dict.lookupMaybe(N("AP"), PDFDict);
    const oldN = old && old.get(N("N"));
    if (oldN instanceof PDFRef) ctx.delete(oldN);
    const res = ap.multiply ? { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply" } } } : {};
    const stream = ctx.flateStream(ap.ops, { Type: "XObject", Subtype: "Form", FormType: 1, BBox: ap.bbox, Resources: res });
    dict.set(N("AP"), ctx.obj({ N: ctx.register(stream) }));
    dict.set(N("Rect"), ctx.obj(ap.box));
  }
  function numbers(arr) { return arr ? arr.asArray().map(n => n instanceof PDFNumber ? n.asNumber() : 0) : null; }

  /* ---------- writing annotations with pdf-lib ---------- */
  function addAnnot(lib, pageIdx, sub, geo, extra = {}) {
    const ctx = lib.context, page = lib.getPage(pageIdx), c = geo.c;
    const now = pdfNow();
    const dict = ctx.obj({
      Type: "Annot", Subtype: sub, F: 4, C: c, P: page.ref,
      NM: PDFString.of(uid()), M: PDFString.of(now), CreationDate: PDFString.of(now), ...extra
    });
    if (geo.quads) dict.set(N("QuadPoints"), ctx.obj(geo.quads));
    if (geo.ink) { dict.set(N("InkList"), ctx.obj(geo.ink)); dict.set(N("BS"), ctx.obj({ W: geo.width })); }
    if (geo.text) dict.set(N("Contents"), PDFHexString.fromText(geo.text));
    setAppearance(ctx, dict, appearance(sub, geo));
    page.node.addAnnot(ctx.register(dict));
  }
  function lookupAnnot(lib, id) {
    const ref = refOf(id); if (!ref) return null;
    const dict = lib.context.lookupMaybe(ref, PDFDict);
    return dict ? { ref, dict } : null;
  }
  function deleteAnnot(lib, pageIdx, id) {
    const hit = lookupAnnot(lib, id); if (!hit) throw new Error("annotation not found");
    const ctx = lib.context, node = lib.getPage(pageIdx).node;
    const pop = hit.dict.get(N("Popup"));
    if (pop instanceof PDFRef) { node.removeAnnot(pop); ctx.delete(pop); }
    const ap = hit.dict.lookupMaybe(N("AP"), PDFDict), apN = ap && ap.get(N("N"));
    if (apN instanceof PDFRef) ctx.delete(apN);
    node.removeAnnot(hit.ref); ctx.delete(hit.ref);
  }
  function recolorAnnot(lib, id, c) {
    const hit = lookupAnnot(lib, id); if (!hit) throw new Error("annotation not found");
    const d = hit.dict, sub = d.lookup(N("Subtype"), PDFName).decodeText();
    d.set(N("C"), lib.context.obj(c)); d.set(N("M"), PDFString.of(pdfNow()));
    const geo = { c, rect: numbers(d.lookupMaybe(N("Rect"), PDFArray)), quads: numbers(d.lookupMaybe(N("QuadPoints"), PDFArray)) };
    if (sub === "Ink" || sub === "Square") {
      const list = sub === "Ink" && d.lookupMaybe(N("InkList"), PDFArray);
      if (sub === "Ink") geo.ink = list ? list.asArray().map(p => numbers(lib.context.lookup(p, PDFArray))) : [];
      const bs = d.lookupMaybe(N("BS"), PDFDict), w = bs && bs.lookupMaybe(N("W"), PDFNumber);
      geo.width = w ? w.asNumber() : sub === "Square" ? BOX_W : 1;
    }
    if (!["Ink", "Text", "Square"].includes(sub) && !geo.quads) geo.quads = rectQuad(geo.rect);
    setAppearance(lib.context, d, appearance(sub, geo));
  }
  function setNote(lib, id, text) {
    const hit = lookupAnnot(lib, id); if (!hit) throw new Error("annotation not found");
    if (text) hit.dict.set(N("Contents"), PDFHexString.fromText(text)); else hit.dict.delete(N("Contents"));
    hit.dict.delete(N("RC"));   // rich-text contents win over /Contents in Acrobat, so drop the stale copy
    hit.dict.set(N("M"), PDFString.of(pdfNow()));
  }
  const rectQuad = r => [r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1]];

  /* ---------- session ---------- */
  async function open(d, page) {
    if (A && A.d.id === d.id) { if (page) goToPage(page - 1); return; }
    if (A) close();
    let bytes;
    try { ({ bytes } = await fl.readPdf(d)); }
    catch (err) { console.error(err); toast("Couldn't read the PDF. Use “Find original file” if it moved."); return; }
    const a = A = {
      d, bytes, pdf: null, libP: null, readOnly: "", ver: 0, scale: 1, fit: true,
      slots: [], undo: [], redo: [], tool: "select", sel: null, queue: Promise.resolve(), writing: Promise.resolve(),
      changed: false, wasAnnotated: !!d.annotated, status: "", startPage: (page || 1) - 1, scrollTop: 0
    };
    buildShell(a);
    renderReader();
    try {
      a.pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      for (let i = 0; i < a.pdf.numPages; i++) {
        const p = await a.pdf.getPage(i + 1);
        if (a !== A) return;
        a.slots.push({ i, vp1: p.getViewport({ scale: 1 }), pv: 0, drawn: null, annots: null });
      }
    } catch (err) {
      console.error(err); if (a === A) { close(); toast("Couldn't open this PDF in the viewer"); }
      return;
    }
    a.pageVer = a.slots.map(() => 0);
    a.libP = loadLib(a);
    buildPages(a);
    fitScale(a);
    layoutPages(a);
    goToPage(a.startPage, true);
    a.ro = new ResizeObserver(() => { clearTimeout(a.roT); a.roT = setTimeout(() => { if (a === A && a.fit) { const keep = anchor(a); fitScale(a); layoutPages(a); restore(a, keep); } }, 120); });
    a.ro.observe(a.scroller);
  }
  function loadLib(a) {
    return PDFDocument.load(a.bytes, { updateMetadata: false }).catch(err => {
      console.error(err);
      a.readOnly = /encrypt/i.test(err && err.message) ? "This PDF is encrypted, so annotations can't be added to it."
        : "Faelights can't edit this PDF's structure, so it opened read-only.";
      if (a === A) syncTools();
      return null;
    });
  }

  // Leave the viewer. Writes are already on disk; if anything changed, rescan so new marks become extracts.
  // Resolves once pending writes have landed; { discard } skips the rescan (doc being removed or reverted).
  function close(opts = {}) {
    const a = A; if (!a) return Promise.resolve();
    A = null; hidePop();
    if (a.ro) a.ro.disconnect();
    if (a.io) a.io.disconnect();
    for (const s of a.slots) if (s.task) s.task.cancel();
    if (a.pdf) a.pdf.destroy();
    a.root.remove();
    const flushed = a.queue.then(() => a.writing);
    if (a.changed && !opts.discard) {
      flushed.then(async () => {
        const ok = await rescan(a.d, true);
        renderAll();
        if (ok) toast(`Highlights updated · ${plural(a.d.count || 0, "mark")}`);
      });
    }
    return flushed;
  }

  /* ---------- DOM ---------- */
  function buildShell(a) {
    const root = a.root = el("div", "pv");
    const head = el("div", "pv-head");
    const row = el("div", "pv-row");
    const back = el("button", "btn"); back.dataset.tour = "pv-back"; back.append(svg(ICO.back), document.createTextNode("Highlights")); back.title = "Back to the extracted highlights (Esc)";
    back.onclick = () => { close(); renderReader(); };
    const title = el("h2", "pv-title", a.d.title); title.title = a.d.title;
    const pageBox = el("div", "pv-page-box");
    const pin = el("input"); pin.className = "pv-pin"; pin.setAttribute("aria-label", "Page number"); pin.inputMode = "numeric";
    pin.onkeydown = e => { if (e.key === "Enter") { const n = parseInt(pin.value, 10); if (n) goToPage(n - 1); pin.blur(); } if (e.key === "Escape") pin.blur(); };
    pin.onfocus = () => pin.select();
    const pcount = el("span", "pv-pcount");
    pageBox.append(pin, pcount);
    const zoom = el("div", "pv-zoom");
    const zo = iconBtn("minus", "Zoom out (−)"), zl = el("button", "pv-zl"), zi = iconBtn("plus", "Zoom in (+)"), zf = iconBtn("fit", "Fit width (0)");
    zo.onclick = () => zoomStep(-1); zi.onclick = () => zoomStep(1); zf.onclick = () => setFit(); zl.onclick = () => setFit(); zl.title = "Fit width";
    zoom.append(zo, zl, zi, zf);
    const ub = iconBtn("undo", "Undo (Ctrl Z)"), rb = iconBtn("redo", "Redo (Ctrl Shift Z)");
    ub.onclick = undo; rb.onclick = redo;
    const dl = btn("", "Download PDF"); dl.prepend(svg(ICO.download)); dl.title = "Save a copy of the PDF with its annotations"; dl.dataset.tour = "pv-dl"; dl.onclick = download;
    row.append(back, title, pageBox, zoom, ub, rb, dl);

    const tools = el("div", "pv-row pv-tools");
    const seg = el("div", "seg pv-seg"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Annotation tool");
    for (const [id, label, icon, key] of TOOLS) {
      const b = el("button"); b.dataset.tool = id; b.setAttribute("role", "radio"); b.title = `${label} (${key})`; b.setAttribute("aria-label", label);
      b.append(svg(ICO[icon]), el("span", null, label)); b.onclick = () => setTool(id); seg.append(b);
    }
    const sw = el("div", "pv-swatches"); sw.setAttribute("role", "radiogroup"); sw.setAttribute("aria-label", "Colour");
    for (const [name, c] of COLORS) {
      const b = el("button", "pv-sw"); b.style.setProperty("--sw", rgbCss(c)); b.title = name; b.setAttribute("aria-label", name); b.setAttribute("role", "radio");
      b.dataset.c = c.join(","); b.onclick = () => { S.db.settings.annotColor = c; save(); syncTools(); }; sw.append(b);
    }
    const status = el("span", "pv-status"); status.setAttribute("role", "status");
    status.title = "Annotations are saved in Faelights' copy of this PDF. Your original file is never changed.";
    tools.append(seg, sw, el("span", "sp"), status);
    head.append(row, tools);

    const scroller = a.scroller = el("div", "pv-scroll"); scroller.tabIndex = -1;
    const pages = a.pagesEl = el("div", "pv-pages");
    pages.append(el("p", "pv-loading", "Opening PDF…"));
    scroller.append(pages);
    scroller.addEventListener("scroll", () => { hidePop(); a.scrollTop = scroller.scrollTop; trackPage(); }, { passive: true });
    pages.addEventListener("pointerdown", onPointerDown);
    pages.addEventListener("mouseup", onMouseUp);
    root.append(head, scroller);
    a.ui = { pin, pcount, zl, ub, rb, seg, sw, status };
    syncTools();
  }
  function syncTools() {
    if (!A) return;
    const a = A, u = a.ui;
    for (const b of u.seg.children) { b.setAttribute("aria-checked", b.dataset.tool === a.tool); b.disabled = !!a.readOnly && b.dataset.tool !== "select"; }
    for (const b of u.sw.children) b.setAttribute("aria-checked", sameColor(b.dataset.c.split(",").map(Number), color()));
    u.ub.disabled = !a.undo.length; u.rb.disabled = !a.redo.length;
    u.zl.textContent = Math.round(a.scale / PT * 100) + "%";
    u.status.textContent = a.readOnly || a.status;
    a.root.dataset.tool = a.tool;
    a.pagesEl.classList.toggle("ro", !!a.readOnly);
  }
  function buildPages(a) {
    const box = a.pagesEl; box.replaceChildren();
    a.io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const s = a.slots[+e.target.dataset.i];
        s.visible = e.isIntersecting;
        if (s.visible) drawPage(a, s); else undraw(s);
      }
    }, { root: a.scroller, rootMargin: "900px 0px" });
    for (const s of a.slots) {
      const p = s.el = el("div", "pv-page"); p.dataset.i = s.i;
      p.setAttribute("aria-label", "Page " + (s.i + 1));
      s.over = el("div", "pv-over");
      p.append(s.over);
      box.append(p);
      a.io.observe(p);
    }
    a.ui.pcount.textContent = "/ " + a.slots.length;
  }
  function fitScale(a) {
    const w = Math.max(...a.slots.map(s => s.vp1.width));
    const avail = a.scroller.clientWidth - 48;
    a.scale = Math.max(0.25, Math.min(4 * PT, avail / w));
  }
  function layoutPages(a) {
    for (const s of a.slots) {
      const w = Math.floor(s.vp1.width * a.scale), h = Math.floor(s.vp1.height * a.scale);
      s.el.style.width = w + "px"; s.el.style.height = h + "px";
      s.el.style.setProperty("--scale-factor", a.scale);
      if (s.visible) drawPage(a, s);
    }
    syncTools();
  }
  const vpOf = (a, s) => s.vp1.clone({ scale: a.scale });

  /* ---------- rendering ---------- */
  async function drawPage(a, s) {
    const key = a.scale + ":" + a.pageVer[s.i];
    if (s.drawn === key || s.pending === key) return;
    s.pending = key;
    if (s.task) s.task.cancel();
    const pdf = a.pdf;
    try {
      const page = await pdf.getPage(s.i + 1);
      if (a !== A || s.pending !== key) return;
      const vp = vpOf(a, s), dpr = devicePixelRatio || 1;
      const canvas = el("canvas", "pv-canvas");
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      s.task = page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null, annotationMode: pdfjsLib.AnnotationMode.ENABLE });
      await s.task.promise;
      if (a !== A || s.pending !== key) return;
      if (s.canvas) s.canvas.replaceWith(canvas); else s.el.prepend(canvas);
      s.canvas = canvas;
      if (s.textScale !== a.scale) {   // annotation edits never change the text, so the layer survives them
        const tl = el("div", "textLayer");
        if (s.text) s.text.replaceWith(tl); else canvas.after(tl);
        s.text = tl; s.textScale = a.scale;
        await pdfjsLib.renderTextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp, textDivs: [] }).promise;
        const eoc = el("div", "endOfContent"); tl.append(eoc);
      }
      s.drawn = key;
      await loadAnnots(a, s, page);
      drawOverlay(a, s);
    } catch (err) {
      if (err && err.name === "RenderingCancelledException") return;
      // the doc was swapped for edited bytes mid-render: start again on the new one
      if (a === A && pdf !== a.pdf) { if (s.pending === key) s.pending = null; if (s.visible) drawPage(a, s); return; }
      if (a === A) console.error(err);
    } finally { if (s.pending === key) s.pending = null; }
  }
  function undraw(s) {
    if (s.task) s.task.cancel();
    s.pending = null; s.drawn = null; s.textScale = null;
    if (s.canvas) { s.canvas.width = 0; s.canvas.remove(); s.canvas = null; }
    if (s.text) { s.text.remove(); s.text = null; }
  }
  async function loadAnnots(a, s, page) {
    if (s.annots && s.annotsVer === a.pageVer[s.i]) return s.annots;
    const ver = a.pageVer[s.i];
    page = page || await a.pdf.getPage(s.i + 1);
    const list = (await page.getAnnotations({ intent: "display" })).filter(x => !SKIP.has(x.subtype));
    if (ver === a.pageVer[s.i]) { s.annots = list; s.annotsVer = ver; }
    return list;
  }
  // Selection outline, plus icons for notes that came without an appearance of their own
  function drawOverlay(a, s) {
    s.over.replaceChildren();
    if (!s.annots) return;
    const vp = vpOf(a, s);
    for (const x of s.annots) {
      const [l, t, r, b] = pdfjsLib.Util.normalizeRect(vp.convertToViewportRectangle(x.rect));
      if (x.subtype === "Text" && !x.hasAppearance) {
        const ic = el("div", "pv-noteicon"); ic.append(svg(ICO.note));
        Object.assign(ic.style, { left: l + "px", top: t + "px" });
        if (x.color) ic.style.color = `rgb(${[...x.color].join(" ")})`;
        s.over.append(ic);
      }
      if (a.sel && a.sel.page === s.i && a.sel.id === x.id) {
        const o = el("div", "pv-selbox" + (x.subtype === "Square" ? " box" : ""));
        Object.assign(o.style, { left: l - 3 + "px", top: t - 3 + "px", width: r - l + 6 + "px", height: b - t + 6 + "px" });
        s.over.append(o);
      }
    }
  }

  /* ---------- scrolling, paging, zoom ---------- */
  function anchor(a) {
    const top = a.scroller.scrollTop;
    const s = a.slots.find(s => s.el.offsetTop + s.el.offsetHeight > top) || a.slots[0];
    return s ? { i: s.i, f: (top - s.el.offsetTop) / s.el.offsetHeight } : null;
  }
  function restore(a, k) { if (k) a.scroller.scrollTop = a.slots[k.i].el.offsetTop + k.f * a.slots[k.i].el.offsetHeight; }
  function goToPage(i, instant) {
    const a = A; if (!a || !a.slots.length) return;
    i = Math.max(0, Math.min(a.slots.length - 1, i));
    a.scroller.scrollTo({ top: a.slots[i].el.offsetTop - 12, behavior: instant ? "auto" : "smooth" });
    a.ui.pin.value = i + 1;
  }
  function trackPage() {
    const a = A; if (!a || !a.slots.length) return;
    const mid = a.scroller.scrollTop + a.scroller.clientHeight * 0.35;
    const s = a.slots.find(s => s.el.offsetTop + s.el.offsetHeight > mid) || a.slots[a.slots.length - 1];
    if (document.activeElement !== a.ui.pin) a.ui.pin.value = s.i + 1;
  }
  function zoomStep(dir) {
    const a = A; if (!a || !a.slots.length) return;
    const z = a.scale / PT;
    const next = dir > 0 ? ZOOMS.find(v => v > z + 0.001) : [...ZOOMS].reverse().find(v => v < z - 0.001);
    if (!next) return;
    const k = anchor(a); a.fit = false; a.scale = next * PT; layoutPages(a); restore(a, k);
  }
  function setFit() { const a = A; if (!a || !a.slots.length) return; const k = anchor(a); a.fit = true; fitScale(a); layoutPages(a); restore(a, k); }

  /* ---------- editing ---------- */
  // Run fn(pdfLibDoc) on a serial queue, save the result as the new bytes and redraw the touched pages.
  function edit(pages, fn) {
    const a = A; if (!a) return Promise.resolve(false);
    if (a.readOnly) { toast(a.readOnly); return Promise.resolve(false); }
    const job = a.queue.then(async () => {
      if (a !== A) return false;
      a.status = "Saving…"; syncTools();
      let out;
      try {
        const lib = await (a.libP || (a.libP = loadLib(a)));
        if (!lib) { toast(a.readOnly); return false; }
        fn(lib);
        out = await lib.save();
      } catch (err) {
        console.error(err); a.libP = null; a.status = ""; syncTools();
        toast("Couldn't change the PDF"); return false;
      }
      a.undo.push({ bytes: a.bytes, pages }); if (a.undo.length > UNDO_MAX) a.undo.shift();
      a.redo = [];
      await swap(a, out, pages);
      return true;
    });
    a.queue = job.catch(() => false);
    return job;
  }
  async function swap(a, bytes, pages) {
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    if (a !== A) { pdf.destroy(); return; }
    const old = a.pdf;
    a.pdf = pdf; a.bytes = bytes;
    for (const i of pages) { a.pageVer[i]++; a.slots[i].annots = null; }
    if (old) old.destroy();
    for (const i of pages) { const s = a.slots[i]; if (s.visible) drawPage(a, s); }
    persist(a);
  }
  // Store the bytes as the library copy; the original file is never written.
  function persist(a) {
    const d = a.d, bytes = a.bytes;
    a.changed = true;
    d.annotated = a.undo.length ? true : a.wasAnnotated;
    d.annotatedAt = Date.now();
    a.writing = a.writing.then(() => fl.writeStored(d.storedPath, bytes)).then(ok => {
      if (a === A) { a.status = ok ? "Saved" : "Not saved"; syncTools(); }
      if (!ok) toast("Couldn't save the annotated PDF");
    }, err => { console.error(err); toast("Couldn't save the annotated PDF"); });
    save(); syncTools();
  }
  function undo() { history(A && A.undo, A && A.redo); }
  function redo() { history(A && A.redo, A && A.undo); }
  function history(from, to) {
    const a = A; if (!a || !from.length) return;
    hidePop(); a.sel = null;
    a.queue = a.queue.then(async () => {
      if (a !== A || !from.length) return;
      const step = from.pop();
      to.push({ bytes: a.bytes, pages: step.pages });
      a.libP = null;           // the live pdf-lib doc no longer matches; reload lazily on the next edit
      await swap(a, step.bytes, step.pages);
    }).catch(err => console.error(err));
  }

  /* ---------- text selection → markup ---------- */
  function pageOfNode(n) { const p = (n.nodeType === 3 ? n.parentElement : n).closest(".pv-page"); return p ? +p.dataset.i : -1; }
  // Client rects for the selected text only (one per line fragment), grouped by page
  function selectionByPage() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0), root = range.commonAncestorContainer;
    const host = root.nodeType === 3 ? root.parentElement : root;
    if (!A.pagesEl.contains(host)) return null;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const pages = new Map();
    for (let n = root.nodeType === 3 ? root : walker.nextNode(); n; n = walker.nextNode()) {
      if (!range.intersectsNode(n) || !n.parentElement.closest(".textLayer")) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      if (n === range.startContainer) r.setStart(n, range.startOffset);
      if (n === range.endContainer) r.setEnd(n, range.endOffset);
      const i = pageOfNode(n); if (i < 0) continue;
      for (const rc of r.getClientRects()) if (rc.width > 0.5 && rc.height > 0.5) (pages.get(i) || pages.set(i, []).get(i)).push(rc);
    }
    return pages.size ? { pages, text: sel.toString() } : null;
  }
  // Merge fragments on the same line, then map each box into PDF space as a quad
  function quadsFor(a, i, rects) {
    const s = a.slots[i], box = s.el.getBoundingClientRect(), vp = vpOf(a, s);
    const rs = rects.map(r => ({ l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top })).sort((x, y) => x.t - y.t || x.l - y.l);
    const lines = [];
    for (const r of rs) {
      const h = r.b - r.t;
      const ln = lines.find(L => Math.min(L.b, r.b) - Math.max(L.t, r.t) > 0.5 * Math.min(h, L.b - L.t) && r.l - L.r < h * 1.2 && L.l - r.r < h * 1.2);
      if (ln) { ln.l = Math.min(ln.l, r.l); ln.r = Math.max(ln.r, r.r); ln.t = Math.min(ln.t, r.t); ln.b = Math.max(ln.b, r.b); }
      else lines.push({ ...r });
    }
    const quads = [];
    for (const L of lines) {
      const tl = vp.convertToPdfPoint(L.l, L.t), tr = vp.convertToPdfPoint(L.r, L.t), bl = vp.convertToPdfPoint(L.l, L.b), br = vp.convertToPdfPoint(L.r, L.b);
      quads.push(...tl, ...tr, ...bl, ...br);
    }
    return quads;
  }
  async function markSelection(kind, c, note) {
    const a = A, got = a && selectionByPage(); if (!got) return;
    const geos = [...got.pages].map(([i, rects]) => [i, quadsFor(a, i, rects)]).filter(([, q]) => q.length);
    getSelection().removeAllRanges(); hidePop();
    if (!geos.length) return;
    await edit(geos.map(([i]) => i), lib => {
      geos.forEach(([i, quads], k) => addAnnot(lib, i, SUBTYPE[kind], { quads, c, text: k === 0 ? note : "" }));
    });
  }

  /* ---------- pointer handling ---------- */
  let down = null;
  function pointOn(e) {
    const p = e.target.closest && e.target.closest(".pv-page"); if (!p || !A) return null;
    const s = A.slots[+p.dataset.i], box = p.getBoundingClientRect();
    return { s, x: e.clientX - box.left, y: e.clientY - box.top };
  }
  function onPointerDown(e) {
    if (e.button !== 0 || !A) return;
    const pt = pointOn(e); if (!pt) return;
    down = { x: e.clientX, y: e.clientY };
    if (e.target.closest(".textLayer")) pt.s.text && pt.s.text.querySelector(".endOfContent")?.classList.add("active");
    if (A.tool === "draw" && !A.readOnly) { e.preventDefault(); startInk(e, pt); }
    else if (A.tool === "image" && !A.readOnly) { e.preventDefault(); startBox(e, pt); }
    else if (A.tool === "note" && !A.readOnly) {
      e.preventDefault();
      const [x, y] = vpOf(A, pt.s).convertToPdfPoint(pt.x, pt.y);
      noteEditor({ x: e.clientX, y: e.clientY }, "", text => {
        if (!text) return;
        const i = pt.s.i, c = color();
        edit([i], lib => addAnnot(lib, i, "Text", { c, rect: [x, y - 20, x + 20, y], text }, { Name: "Comment", Open: false }));
      });
    }
  }
  function onMouseUp(e) {
    if (!A || e.button !== 0) return;
    document.querySelectorAll(".pv .endOfContent.active").forEach(x => x.classList.remove("active"));
    if (A.tool === "draw" || A.tool === "note" || A.tool === "image") return;
    const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3;
    const at = { x: e.clientX, y: e.clientY };
    setTimeout(() => {
      if (!A) return;
      const got = selectionByPage();
      if (got) {
        if (A.tool !== "select" && !A.readOnly) markSelection(A.tool, color());
        else selectionPop(at, got.text);
      } else if (!moved) pickAt(e);
    }, 0);
  }
  function startInk(e, pt) {
    const a = A, s = pt.s, vp = vpOf(a, s), c = color(), width = 2;
    const ns = "http://www.w3.org/2000/svg";
    const svgEl = document.createElementNS(ns, "svg"); svgEl.classList.add("pv-ink");
    const path = document.createElementNS(ns, "polyline");
    path.setAttribute("stroke", rgbCss(c)); path.setAttribute("stroke-width", width * a.scale); path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
    svgEl.append(path); s.over.append(svgEl);
    const pts = [[pt.x, pt.y]];
    const box = s.el.getBoundingClientRect();
    const target = e.target; target.setPointerCapture?.(e.pointerId);
    const move = ev => {
      const x = ev.clientX - box.left, y = ev.clientY - box.top, last = pts[pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 1.5) return;
      pts.push([x, y]); path.setAttribute("points", pts.map(p => p.join(",")).join(" "));
    };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      const ink = [pts.flatMap(([x, y]) => vp.convertToPdfPoint(x, y))];
      edit([s.i], lib => addAnnot(lib, s.i, "Ink", { ink, width, c })).finally(() => svgEl.remove());
    };
    path.setAttribute("points", pts.map(p => p.join(",")).join(" "));
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  }
  // Capture image: drag a box over a figure → a border-only Square (/Subj Image) that extraction reads as an image region.
  // A drag under 8 px is a click (picks the box under it); Esc or pointercancel drops it.
  function startBox(e, pt) {
    const a = A, s = pt.s, x0 = pt.x, y0 = pt.y, W = s.el.clientWidth, H = s.el.clientHeight;
    const o = el("div", "pv-boxdraw"); o.style.setProperty("--c", rgbCss(color())); s.el.append(o);
    let x1 = x0, y1 = y0;
    const place = () => Object.assign(o.style, { left: Math.min(x0, x1) + "px", top: Math.min(y0, y1) + "px", width: Math.abs(x1 - x0) + "px", height: Math.abs(y1 - y0) + "px" });
    const move = ev => {
      const box = s.el.getBoundingClientRect();
      x1 = Math.max(0, Math.min(W, ev.clientX - box.left)); y1 = Math.max(0, Math.min(H, ev.clientY - box.top)); place();
    };
    const end = ok => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", no);
      o.remove(); if (a.drag === drag) a.drag = null;
      if (!ok || a !== A) return;
      if (Math.abs(x1 - x0) < 8 || Math.abs(y1 - y0) < 8) { pickAt(e); return; }
      const vp = vpOf(a, s), c = color(), i = s.i;
      const rect = pdfjsLib.Util.normalizeRect([...vp.convertToPdfPoint(x0, y0), ...vp.convertToPdfPoint(x1, y1)]);
      edit([i], lib => addAnnot(lib, i, "Square", { rect, c, width: BOX_W }, { BS: { W: BOX_W }, CA: 1, Subj: PDFString.of("Image") }));
    };
    const up = () => end(true), no = () => end(false), drag = a.drag = { cancel: no };
    place();
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", no);
  }
  // Click on an existing annotation: select it and offer colour / note / delete
  async function pickAt(e) {
    const a = A, pt = pointOn(e);
    if (!pt) { select(null); return; }
    const s = pt.s, list = await loadAnnots(a, s);
    if (a !== A) return;
    const [px, py] = vpOf(a, s).convertToPdfPoint(pt.x, pt.y), tol = 2 / a.scale + 1, edge = 6 / a.scale;
    const inBox = (q, pad) => px >= q[0] - pad && px <= q[2] + pad && py >= q[1] - pad && py <= q[3] + pad;
    let best = null, bestArea = Infinity;
    for (const x of list) {
      const quads = x.quadPoints && x.quadPoints.length ? normQuads(x) : null;
      const r = pdfjsLib.Util.normalizeRect(x.rect);
      // image boxes leave their inside to the text under them: only the border picks them (anywhere with the Capture tool)
      const hit = x.subtype === "Square" ? inBox(r, edge) && (a.tool === "image" || !inBox(r, -edge))
        : quads ? quads.some(q => inBox(q, tol)) : inBox(r, tol);
      if (!hit) continue;
      const area = (r[2] - r[0]) * (r[3] - r[1]);
      if (area <= bestArea) { best = x; bestArea = area; }
    }
    select(best ? { page: s.i, id: best.id, x: best } : null, { x: e.clientX, y: e.clientY });
  }
  function select(sel, at) {
    const a = A; if (!a) return;
    const prev = a.sel; a.sel = sel;
    for (const p of new Set([prev && prev.page, sel && sel.page])) if (p != null && a.slots[p]) drawOverlay(a, a.slots[p]);
    hidePop();
    if (sel && at) annotPop(at, sel);
  }

  /* ---------- popovers ---------- */
  function hidePop() { document.querySelector(".pv-pop")?.remove(); }
  function showPop(at, children, opts = {}) {
    hidePop();
    const p = el("div", "pv-pop" + (opts.cls ? " " + opts.cls : "")); p.append(...children);
    p.onpointerdown = e => e.stopPropagation(); p.onmouseup = e => e.stopPropagation();
    p.onmousedown = e => { if (!e.target.closest("textarea")) e.preventDefault(); };   // keep the text selection alive
    document.body.append(p);
    const w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(innerWidth - w - 8, at.x - w / 2)) + "px";
    p.style.top = (at.y - h - 14 > 8 ? at.y - h - 14 : at.y + 18) + "px";
    return p;
  }
  function colorDots(onPick, current) {
    const row = el("div", "pv-dots");
    for (const [name, c] of COLORS) {
      const b = el("button", "pv-sw"); b.style.setProperty("--sw", rgbCss(c)); b.title = name; b.setAttribute("aria-label", name);
      if (current) b.setAttribute("aria-checked", sameColor(c, current));
      b.onclick = () => onPick(c); row.append(b);
    }
    return row;
  }
  function selectionPop(at, text) {
    const a = A, kids = [];
    if (!a.readOnly) {
      kids.push(colorDots(c => { S.db.settings.annotColor = c; save(); syncTools(); markSelection("highlight", c); }));
      const u = iconBtn("underline", "Underline"); u.onclick = () => markSelection("underline", color());
      const st = iconBtn("strike", "Strike through"); st.onclick = () => markSelection("strike", color());
      const nb = iconBtn("note", "Highlight with a note");
      nb.onclick = () => {
        const got = selectionByPage(); if (!got) return;
        const keep = getSelection().getRangeAt(0).cloneRange();
        noteEditor(at, "", note => { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(keep); markSelection("highlight", color(), note); });
      };
      kids.push(el("i", "pv-div"), u, st, nb);
    }
    const cp = iconBtn("copy", "Copy text"); cp.onclick = () => { copyText(text.replace(/\s+/g, " ").trim(), "Text"); hidePop(); };
    kids.push(cp);
    showPop(at, kids);
  }
  function annotPop(at, sel) {
    const a = A, x = sel.x, kids = [];
    const comment = ((x.contentsObj && x.contentsObj.str) || x.contents || "").trim();
    const editable = !!refOf(x.id) && !a.readOnly;
    if (comment) { const q = el("p", "pv-comment", comment); kids.push(q); }
    const row = el("div", "pv-poprow");
    if (editable) {
      if (RECOLOR.has(x.subtype)) row.append(colorDots(c => { hidePop(); edit([sel.page], lib => recolorAnnot(lib, x.id, c)); }, x.color && [...x.color].map(v => v / 255)), el("i", "pv-div"));
      const nb = iconBtn("note", comment ? "Edit note" : "Add note");
      nb.onclick = () => noteEditor(at, comment, text => { if (text !== comment) edit([sel.page], lib => setNote(lib, x.id, text)); });
      const del = iconBtn("trash", "Delete (Del)", "danger"); del.onclick = () => removeSelected();
      row.append(nb, del);
    } else row.append(el("span", "pv-ro", a.readOnly ? "Read-only PDF" : "This mark can't be edited"));
    kids.push(row);
    showPop(at, kids);
  }
  function noteEditor(at, value, onSave) {
    const ta = el("textarea"); ta.value = value; ta.rows = 4; ta.placeholder = "Write a note…"; ta.setAttribute("aria-label", "Note");
    const ok = btn("primary", "Save"), no = btn("", "Cancel");
    const done = commit => { hidePop(); if (commit) onSave(ta.value.trim()); };
    ok.onclick = () => done(true); no.onclick = () => done(false);
    ta.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) done(true); if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    const acts = el("div", "pv-poprow end"); acts.append(no, ok);
    showPop(at, [ta, acts], { cls: "pv-noteed" });
    setTimeout(() => ta.focus(), 0);
  }
  function removeSelected() {
    const a = A, sel = a && a.sel; if (!sel || !refOf(sel.id) || a.readOnly) return;
    hidePop(); a.sel = null;
    edit([sel.page], lib => deleteAnnot(lib, sel.page, sel.id));
  }

  function setTool(t) {
    if (!A) return;
    if (A.readOnly && t !== "select") { toast(A.readOnly); return; }
    A.tool = t; hidePop(); select(null); syncTools();
    // with a markup tool picked, text that's already selected gets the mark straight away
    if (SUBTYPE[t] && selectionByPage()) markSelection(t, color());
  }

  async function download() {
    const a = A; if (!a) return;
    await a.queue;
    const p = await fl.savePdfAs(safeName(a.d.title) + ".pdf", a.bytes);
    if (p) toast("Saved " + p.split(/[\\/]/).pop());
  }

  // Keys while the viewer is open; returns true when handled so app.js skips its own shortcuts
  function key(e) {
    if (!A) return false;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return true; }
    if (mod && k === "y") { e.preventDefault(); redo(); return true; }
    if (mod) return false;
    if (e.key === "Escape") {
      if (A.drag) A.drag.cancel();
      else if (document.querySelector(".pv-pop")) hidePop();
      else if (A.sel) select(null);
      else if (A.tool !== "select") setTool("select");
      else { close(); renderReader(); }
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") { removeSelected(); return true; }
    const tool = TOOLS.find(t => t[3].toLowerCase() === k);
    if (tool && !e.altKey) { setTool(tool[0]); return true; }
    if (e.key === "+" || e.key === "=") { zoomStep(1); return true; }
    if (e.key === "-") { zoomStep(-1); return true; }
    if (e.key === "0") { setFit(); return true; }
    if (e.key === "PageDown" || e.key === "PageUp") return false;
    // swallow list navigation (↑↓ J K) so it scrolls the page instead of switching PDFs
    return ["ArrowUp", "ArrowDown", "j", "k"].includes(e.key);
  }

  // Re-attach the live viewer when the reader re-renders, keeping its scroll position
  function mount(r) {
    const a = A;
    if (a.root.parentNode !== r) { r.replaceChildren(a.root); a.scroller.scrollTop = a.scrollTop; }
  }

  // pointer-down anywhere outside a popover closes it
  addEventListener("pointerdown", e => { if (!e.target.closest?.(".pv-pop")) hidePop(); }, true);

  return { open, close, mount, key, isOpen: () => !!A, docId: () => A && A.d.id };
})();
