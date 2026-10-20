/* Faelights — topics (headless core; no DOM, no IPC)
   Splits a document into topics so extracts can be grouped: the PDF's bookmarks (outline) first; without them,
   headings found by font size; then by wording ("3.2 Results", "ABSTRACT"); as a last resort one topic per page.
   Works on the text stream built by extract.js. Loaded by a <script> tag in the renderer (global `Topics`)
   and by require() in Node. */
"use strict";

const Topics = (() => {
  // Section headings recognised by their wording when font size gives nothing to go on
  const SECTION_NAMES = /^(?:abstract|summary|introduction|background|overview|related work|literature review|methods?|methodology|materials and methods|approach|experiments?|experimental (?:setup|results)|results?(?: and discussion)?|discussion|evaluation|analysis|findings|conclusions?(?: and future work)?|future work|limitations|recommendations|references|bibliography|acknowledge?ments?|appendix(?: [a-z0-9]+)?|preface|foreword|prologue|epilogue|chapter [0-9ivxlc]+)$/i;
  const NUMBERED = /^((?:\d{1,2}\.){0,3}\d{1,2}\.?|[IVX]{1,5}\.|[A-H]\.)\s+(.+)$/;
  const RUN_IN = /^(abstract|keywords|index terms)\s*[—–:.-]/i;
  const CAPTION = /^(?:fig(?:ure)?|table|eq(?:uation)?|source|note)\b/i;

  async function resolveOutline(pdf) {
    let outline;
    try { outline = await pdf.getOutline(); } catch (e) { return []; }
    if (!outline || !outline.length) return [];
    const flat = [];
    async function walk(items, path) {
      for (const it of items) {
        const title = (it.title || "").trim();
        let pos = null;
        try {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0] != null) {
            const ref = dest[0];
            const pageIndex = typeof ref === "number" ? ref : await pdf.getPageIndex(ref);
            let top = null;
            const kind = dest[1] && dest[1].name;
            if (kind === "XYZ") top = dest[3];
            else if (kind === "FitH" || kind === "FitBH") top = dest[2];
            else if (kind === "FitR") top = dest[5];
            pos = { page: pageIndex + 1, y: typeof top === "number" ? top : Infinity };
          }
        } catch (e) { /* unresolved destination */ }
        const p = [...path, title];
        if (pos && title) flat.push({ title, path: p, page: pos.page, y: pos.y, level: p.length });
        if (it.items && it.items.length) await walk(it.items, p);
      }
    }
    await walk(outline, []);
    return flat;
  }

  // Topics for a document. lines: [{start, end, size, page, y}] in stream order; text: the joined stream;
  // sizeHist: Map(rounded font size → glyph count). → {topics: [{title, path, level, page, at}] sorted by at, topicSource}
  async function buildTopics(pdf, lines, text, sizeHist) {
    let body = 10, best = -1;
    for (const [s, c] of sizeHist) if (c > best) { best = c; body = s; }
    let topics = await resolveOutline(pdf);
    let topicSource = "outline";
    if (topics.length) {
      // map outline positions into stream order
      topics = topics.map(t => {
        const ln = lines.find(l => l.page === t.page && l.y <= t.y + 2) || lines.find(l => l.page === t.page) || lines.find(l => l.page > t.page);
        return { ...t, at: ln ? ln.start : text.length };
      });
    } else {
      topicSource = "headings";
      topics = headingTopics(lines, text, body);
      // a lone large line is usually just the document title; try wording-based detection
      if (topics.length < 2) {
        const found = patternTopics(lines, text);
        if (found.length) { topics = found; topicSource = "patterns"; }
      }
      if (!topics.length) { topics = pageTopics(lines); topicSource = "pages"; }
    }
    topics.sort((a, b) => a.at - b.at);
    return { topics, topicSource };
  }

  // Headings found by font size: lines at least 12% bigger than the body text, up to 4 size levels
  function headingTopics(lines, text, body) {
    const cand = [];
    for (const l of lines) {
      const s = text.slice(l.start, l.end).replace(/\s+/g, " ").trim();
      if (!s || s.length > 110 || s.length < 2 || /^\d+$/.test(s)) continue;
      if (l.size >= body * 1.12 && /[A-Za-z]/.test(s)) cand.push({ ...l, title: s });
    }
    // merge consecutive heading lines of same size (wrapped headings)
    const merged = [];
    for (const c of cand) {
      const m = merged[merged.length - 1];
      if (m && m.page === c.page && Math.abs(m.size - c.size) < 0.6 && m.lastY - c.y < c.size * 1.6 && m.end <= c.start + 3) {
        m.title += " " + c.title; m.end = c.end; m.lastY = c.y;
      } else merged.push({ ...c, lastY: c.y });
    }
    const sizes = [...new Set(merged.map(m => Math.round(m.size * 2) / 2))].sort((a, b) => b - a).slice(0, 4);
    const stack = [];
    return merged.map(m => {
      const level = Math.max(1, sizes.indexOf(Math.round(m.size * 2) / 2) + 1 || sizes.length);
      stack.length = level - 1;
      while (stack.length < level - 1) stack.push(null);
      stack[level - 1] = m.title;
      return { title: m.title, path: stack.filter(Boolean), level, page: m.page, at: m.start };
    });
  }

  // Headings found by wording: "3.2 Results", "IV. DISCUSSION", "Conclusion", "Abstract—…", short ALL-CAPS lines
  function patternTopics(lines, text) {
    const cand = [];
    for (const l of lines) {
      const s = text.slice(l.start, l.end).replace(/\s+/g, " ").trim();
      if (!s || CAPTION.test(s)) continue;
      let title = null, level = 1;
      const run = s.match(RUN_IN);
      if (run) title = run[1][0].toUpperCase() + run[1].slice(1).toLowerCase();
      else if (s.length <= 80 && !/[,;]$/.test(s)) {
        const bare = s.replace(/\s*:$/, "");
        const num = bare.match(NUMBERED);
        if (SECTION_NAMES.test(bare)) title = bare;
        else if (num && headingText(num[2])) {
          title = bare;
          level = /^[A-H]\.$/.test(num[1]) ? 2 : /^[IVX]+\.$/.test(num[1]) ? 1 : num[1].replace(/\.$/, "").split(".").length;
        } else if (capsHeading(bare)) title = bare;
      }
      if (title) cand.push({ title, level: Math.min(level, 3), page: l.page, at: l.start });
    }
    // running headers and footers repeat on many pages
    const pagesOf = new Map();
    const norm = t => t.toLowerCase().replace(/[\d\s]+/g, " ").trim();
    for (const c of cand) { const k = norm(c.title); if (!pagesOf.has(k)) pagesOf.set(k, new Set()); pagesOf.get(k).add(c.page); }
    const kept = cand.filter(c => pagesOf.get(norm(c.title)).size < 3);
    const stack = [];
    return kept.map(c => {
      stack.length = c.level - 1;
      stack[c.level - 1] = c.title;
      return { title: c.title, path: stack.filter(Boolean), level: c.level, page: c.page, at: c.at };
    });
  }
  function headingText(t) {
    const words = t.split(" ");
    return /^[A-Z]/.test(t) && words.length <= 10 && !/[.!?,;]$/.test(t) && /[a-z]{3}|[A-Z]{3}/.test(t);
  }
  function capsHeading(t) {
    return t.length >= 4 && t.length <= 60 && t === t.toUpperCase() && /[A-Z]{4}/.test(t)
      && /^[A-Z0-9][A-Z0-9 &,:'’()\-–]+$/.test(t) && t.split(" ").length <= 8;
  }

  // Last resort: one topic per page so long documents are still navigable
  function pageTopics(lines) {
    const out = [], seen = new Set();
    for (const l of lines) {
      if (seen.has(l.page)) continue;
      seen.add(l.page);
      const title = "Page " + l.page;
      out.push({ title, path: [title], level: 1, page: l.page, at: l.start });
    }
    return out;
  }

  // The topic a stream position falls under (topics sorted by at), or null before the first one
  function topicAt(topics, at) {
    let t = null;
    for (const tp of topics) { if (tp.at <= at + 1) t = tp; else break; }
    return t;
  }

  return { buildTopics, resolveOutline, headingTopics, patternTopics, pageTopics, topicAt };
})();

if (typeof module !== "undefined") module.exports = Topics;
