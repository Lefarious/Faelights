/* Faelights — guided tour (first-run onboarding)
   Tooltips that walk through the main buttons in order, one chapter per part of the app:
   "app" (sidebar + PDF list) on first launch, "reader" the first time a PDF is open,
   "viewer" the first time the annotator opens. Seen chapters are kept in settings.tour.
   Steps point at a CSS selector; a step whose target isn't on screen is skipped.
   The step data and the seen/skip helpers are pure (tested); the overlay needs a DOM. */
"use strict";

const Tour = (() => {
  const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  // {sel, first?, title, body, keys?}; no sel = centred card; first: spotlight only the first match (one extract, not all)
  const CHAPTERS = {
    app: [
      { title: "Welcome to Faelights", body: "Faelights pulls the highlights, underlines and notes out of your annotated PDFs and lists them in reading order, grouped by topic. This short tour shows what each button does. You can replay it any time from Help › Show Tour." },
      { sel: "[data-tour=add]", title: "Add PDFs", body: "Pick annotated PDFs from your computer, or drag them onto the window. Faelights keeps its own copy and reads every mark straight away.", keys: `${MOD} O` },
      { sel: "[data-tour=add-id]", title: "Add by identifier", body: "Paste a DOI, arXiv ID, ISBN, PMID or a link and Faelights downloads the paper for you. This is the only button that goes online, and only when you use it.", keys: `${MOD} ⇧ O` },
      { sel: "[data-tour=search]", title: "Search highlights", body: "Search every highlight, sentence and note across all your PDFs. Every word you type must appear.", keys: `${MOD} F` },
      { sel: "[data-tour=all], [data-tour=starred], [data-tour=mine]", title: "All PDFs, Starred, My publications", body: "Quick lists across every library: everything, the PDFs you starred, and the papers you marked as your own." },
      { sel: "[data-tour=libraries]", title: "Libraries", body: "New PDFs land in the Inbox. Use + to make a library, drag PDFs onto one to move them, and right-click a library (or its ⋯) to rename, export or delete it." },
      { sel: "[data-tour=foot]", title: "Rescan and theme", body: "Rescan re-reads PDFs that changed on disk since you added them. The icons switch between your system's theme, light and dark." },
      { sel: "[data-tour=list-tools]", title: "Filter and sort", body: "Narrow the list by title or tag, and sort by newest, title or number of marks." },
      { sel: "#docs", title: "Your PDFs", body: "Each card shows its marks, pages and highlight colours. Click a card to read its extracts. Right-click it (or ⋯) to star, tag, move, export or remove it." },
      { sel: "[data-tour=pane]", title: "Make room", body: "Hide a column with this button and bring it back from its slim strip. Drag a column's edge to resize it.", keys: `${MOD} B` },
      { title: "That's the library", body: "Open a PDF and the tour carries on in the reader, where your extracts are. No PDFs yet? Try the sample." }
    ],
    reader: [
      { sel: ".r-title", title: "The PDF you're reading", body: "Click the title to rename it. The arrow opens the PDF in your usual PDF app; ⋯ has every other action for this PDF." },
      { sel: ".r-meta", title: "Organise it", body: "Move it to another library, star it, mark it as your own publication, and add tags (type one and press Enter)." },
      { sel: "[data-tour=view]", title: "View and annotate", body: "Opens the PDF inside Faelights, where you can highlight, underline, add notes, draw and capture images. Your original file is never changed." },
      { sel: ".info-btn", title: "Metadata", body: "Shows the paper's details: title, authors, journal, DOI and abstract. Look up details fills them in from CrossRef or arXiv." },
      { sel: ".r-tools .seg", title: "Full sentence or highlights only", body: "Show each highlight inside its whole sentence, or just the words you marked.", keys: `${MOD} T` },
      { sel: ".img-btn", title: "With images", body: "Shows the figures you captured in the viewer among the extracts, in the order they appear in the PDF." },
      { sel: "#fmt, [data-tour=copy], [data-tour=export]", title: "Copy and export", body: "Choose a format (Markdown, Obsidian, HTML or plain text). Copy puts the extracts on the clipboard; Export saves them to a file, with images if you like.", keys: `${MOD} E` },
      { sel: ".rail .chips", title: "Colour filter", body: "Click a colour to hide or show the marks made in it." },
      { sel: ".rail .toc", title: "Topics", body: "The PDF's headings. Click one to jump to its extracts." },
      { sel: ".r-main .ex", first: true, title: "An extract", body: "Each highlight in its sentence, under the topic it sits in. Click the page number to open that page in the viewer." },
      { sel: ".r-main .ex .copy1", first: true, title: "Copy one extract", body: "Copies just this extract, in the format you picked above. It appears when you point at an extract." }
    ],
    viewer: [
      { sel: ".pv-seg", title: "Annotation tools", body: "Select, Highlight, Underline, Strike through, Note, Draw and Capture image. Pick a tool, then select text or drag on the page. Each tool has a one-letter key." },
      { sel: ".pv-swatches", title: "Colours", body: "The colour for new marks. Click a mark you already made to recolour it, add a note or delete it." },
      { sel: ".pv-page-box, .pv-zoom", title: "Page and zoom", body: "Type a page number to jump there. Zoom with − and +, or fit the page to the width.", keys: "+ − 0" },
      { sel: "[data-tour=pv-dl]", title: "Download PDF", body: "Every change is saved in Faelights' copy as you go. Download saves a copy with your annotations wherever you like." },
      { sel: "[data-tour=pv-back]", title: "Back to your highlights", body: "Returns to the extracts. New marks and notes show up there straight away.", keys: "Esc" }
    ]
  };
  const NAMES = Object.keys(CHAPTERS);

  /* ---------- pure helpers ---------- */
  const seen = (settings, ch) => !!(settings && settings.tour && settings.tour[ch]);
  // Finishing a chapter marks it seen; skipping marks every chapter seen (the user wants no more tour)
  function markSeen(settings, ch, skipped) {
    const t = settings.tour = { ...(settings.tour || {}) };
    for (const n of skipped ? NAMES : [ch]) t[n] = true;
    return settings;
  }
  // Next step index from `from` in direction dir (+1/-1) whose target is available, or -1
  function nextIndex(steps, from, dir, has) {
    for (let i = from + dir; i >= 0 && i < steps.length; i += dir) if (!steps[i].sel || has(steps[i].sel)) return i;
    return -1;
  }
  // 1-based position of step i among the available steps, and their total
  function progress(steps, i, has) {
    const ok = steps.map((s, j) => j).filter(j => !steps[j].sel || has(steps[j].sel));
    return { n: ok.indexOf(i) + 1, total: ok.length };
  }

  /* ---------- overlay ---------- */
  let T = null;   // {name, steps, i, onEnd, extra, shield, back, ring, pop, timer, keys, last}
  // opts.extra: {label, run} — an extra button on the chapter's last step (e.g. "Try a sample PDF")
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const targets = sel => [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const has = sel => targets(sel).length > 0;
  const stepEls = s => { const els = targets(s.sel); return s.first ? els.slice(0, 1) : els; };
  // the spotlit elements get .tour-target, so buttons that only show on hover (.copy1) are visible
  function mark(els) {
    for (const e of document.querySelectorAll(".tour-target")) if (!els.includes(e)) e.classList.remove("tour-target");
    for (const e of els) e.classList.add("tour-target");
  }
  function rectOf(els) {
    if (!els.length) return null;
    const rs = els.map(e => e.getBoundingClientRect());
    const left = Math.min(...rs.map(r => r.left)), top = Math.min(...rs.map(r => r.top));
    const right = Math.max(...rs.map(r => r.right)), bottom = Math.max(...rs.map(r => r.bottom));
    // clip to the window: a long list (#docs) can run past the bottom
    const r = { left: Math.max(left, 4), top: Math.max(top, 4), right: Math.min(right, innerWidth - 4), bottom: Math.min(bottom, innerHeight - 4) };
    return { ...r, width: r.right - r.left, height: r.bottom - r.top };
  }

  function start(name, opts = {}) {
    if (T) end(false, true);
    const steps = CHAPTERS[name]; if (!steps) return;
    const shield = mk("div", "tour-shield"), back = mk("div", "tour-back"), ring = mk("div", "tour-ring"), pop = mk("div", "tour-pop");
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-labelledby", "tour-h"); pop.setAttribute("aria-describedby", "tour-p");
    document.body.append(shield, back, ring, pop);
    T = { name, steps, i: -1, onEnd: opts.onEnd, extra: opts.extra, shield, back, ring, pop, last: document.activeElement };
    // the tour owns the keyboard while open, so list shortcuts (Delete, J/K) and viewer keys don't fire behind it
    T.keys = e => {
      if (!T) return;
      if (e.key === "Escape") { e.preventDefault(); end(true); }
      else if (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest?.(".tour-pop button"))) { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Tab") { const f = [...pop.querySelectorAll("button")]; const k = f.indexOf(document.activeElement); e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus(); }
      // app-menu accelerators are handled by the main process, so they still work; nothing in the page sees the key.
      // No preventDefault for other keys, so Enter/Space still press the focused tour button.
      e.stopPropagation();
    };
    addEventListener("keydown", T.keys, true);
    T.timer = setInterval(place, 250);   // the app re-renders under the tour; keep the spotlight on its target
    addEventListener("resize", place);
    // the first step's target may still be rendering (viewer shell, reader after open)
    const first = nextIndex(steps, -1, 1, has);
    if (first >= 0) return show(first);
    let tries = 0; const wait = setInterval(() => {
      const i = nextIndex(steps, -1, 1, has);
      if (i >= 0 || ++tries > 12) { clearInterval(wait); if (!T) return; if (i >= 0) show(i); else end(false, true); }
    }, 250);
  }

  function go(dir) {
    const i = nextIndex(T.steps, T.i, dir, has);
    if (i >= 0) show(i); else if (dir > 0) end(false);
  }

  function show(i) {
    T.i = i; const s = T.steps[i], pop = T.pop, { n, total } = progress(T.steps, i, has);
    pop.replaceChildren();
    const p = mk("p", "tour-step", total > 1 ? `${n} of ${total}` : "");
    const h = mk("h3", null, s.title); h.id = "tour-h";
    const b = mk("p", "tour-body", s.body); b.id = "tour-p";
    pop.append(p, h, b);
    if (s.keys) { const k = mk("p", "tour-keys"); for (const part of s.keys.split(" ")) k.append(mk("kbd", null, part), " "); pop.append(k); }
    const row = mk("div", "tour-acts");
    const skip = mk("button", "linkbtn", "Skip tour"); skip.onclick = () => end(true);
    row.append(skip, mk("span", "sp"));
    if (nextIndex(T.steps, i, -1, has) >= 0) { const bk = mk("button", "btn", "Back"); bk.onclick = () => go(-1); row.append(bk); }
    const last = nextIndex(T.steps, i, 1, has) < 0;
    if (last && T.extra) { const x = T.extra, t = mk("button", "btn", x.label); t.onclick = () => { end(false); x.run(); }; row.append(t); }
    const nx = mk("button", "btn primary", last ? "Done" : "Next"); nx.onclick = () => go(1); row.append(nx);
    if (last) skip.hidden = true;
    pop.append(row);
    if (s.sel) stepEls(s)[0]?.scrollIntoView({ block: "nearest" });
    place(); nx.focus();
  }

  function place() {
    if (!T || T.i < 0) return;
    const s = T.steps[T.i], { ring, pop, back } = T;
    if (s.sel && !has(s.sel)) return go(1);   // target vanished (re-render, pane hidden): move on
    const els = s.sel ? stepEls(s) : [];
    mark(els);
    const r = rectOf(els);
    ring.hidden = !r; back.style.clipPath = "none";
    const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 14, pad = 6, M = 8;
    let x, y;
    if (!r) { x = (innerWidth - pw) / 2; y = (innerHeight - ph) / 2; }
    else {
      // padded outline, kept 2px inside the window so it isn't cut off at the edges
      const L = Math.max(2, r.left - pad), Tp = Math.max(2, r.top - pad), R = Math.min(innerWidth - 2, r.right + pad), B = Math.min(innerHeight - 2, r.bottom + pad);
      Object.assign(ring.style, { left: L + "px", top: Tp + "px", width: R - L + "px", height: B - Tp + "px" });
      // dim everything except the target: the backdrop with a hole cut out (even-odd)
      back.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${L}px ${Tp}px, ${L}px ${B}px, ${R}px ${B}px, ${R}px ${Tp}px, ${L}px ${Tp}px)`;
      // right of the target, else below, else above, else left; then kept inside the window
      if (r.right + pad + gap + pw <= innerWidth - M) { x = r.right + pad + gap; y = r.top + r.height / 2 - ph / 2; }
      else if (r.bottom + pad + gap + ph <= innerHeight - M) { x = r.left + r.width / 2 - pw / 2; y = r.bottom + pad + gap; }
      else if (r.top - pad - gap - ph >= M) { x = r.left + r.width / 2 - pw / 2; y = r.top - pad - gap - ph; }
      else { x = r.left - pad - gap - pw; y = r.top + r.height / 2 - ph / 2; }
    }
    pop.style.left = Math.round(Math.max(M, Math.min(x, innerWidth - pw - M))) + "px";
    pop.style.top = Math.round(Math.max(M, Math.min(y, innerHeight - ph - M))) + "px";
  }

  // skipped: the user left early (Skip / Esc). quiet: replaced or nothing to show, don't report.
  function end(skipped, quiet) {
    if (!T) return;
    const t = T; T = null;
    clearInterval(t.timer); removeEventListener("keydown", t.keys, true); removeEventListener("resize", place);
    mark([]); t.shield.remove(); t.back.remove(); t.ring.remove(); t.pop.remove();
    if (t.last && document.contains(t.last)) t.last.focus?.();
    if (!quiet && t.onEnd) t.onEnd(t.name, !!skipped);
  }

  return { CHAPTERS, NAMES, seen, markSeen, nextIndex, progress, start, end, isOpen: () => !!T, chapter: () => T && T.name };
})();

if (typeof module !== "undefined") module.exports = Tour;
