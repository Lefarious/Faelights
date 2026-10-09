// ===== Faelights extraction core =====
const MARK_TYPES = { Highlight: "Highlight", Underline: "Underline", Squiggly: "Squiggly", StrikeOut: "Strike" };
const ABBR = /\b(?:e\.g|i\.e|et al|etc|vs|cf|Fig|Figs|Eq|Eqs|Dr|Mr|Mrs|Ms|Prof|St|No|Vol|pp|approx|Ch|Sec)\.$/i;
// Bump when the shape or quality of results changes so saved docs get rescanned.
const ANALYZER_VERSION = 3;

// Section headings recognised by their wording when font size gives nothing to go on
const SECTION_NAMES = /^(?:abstract|summary|introduction|background|overview|related work|literature review|methods?|methodology|materials and methods|approach|experiments?|experimental (?:setup|results)|results?(?: and discussion)?|discussion|evaluation|analysis|findings|conclusions?(?: and future work)?|future work|limitations|recommendations|references|bibliography|acknowledge?ments?|appendix(?: [a-z0-9]+)?|preface|foreword|prologue|epilogue|chapter [0-9ivxlc]+)$/i;
const NUMBERED = /^((?:\d{1,2}\.){0,3}\d{1,2}\.?|[IVX]{1,5}\.|[A-H]\.)\s+(.+)$/;
const RUN_IN = /^(abstract|keywords|index terms)\s*[—–:.-]/i;
const CAPTION = /^(?:fig(?:ure)?|table|eq(?:uation)?|source|note)\b/i;

function normQuads(a) {
  const q = a.quadPoints, out = [];
  if (q && q.length) {
    if (Array.isArray(q[0])) {
      for (const pts of q) {
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      }
    } else {
      for (let i = 0; i + 7 < q.length; i += 8) {
        const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]], ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
        out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      }
    }
  } else if (a.rect) {
    const r = a.rect; out.push([Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]);
  }
  return out;
}

function colorOf(a) {
  const c = a.color;
  if (c && c.length >= 3) return [c[0], c[1], c[2]];
  return [255, 214, 64];
}

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

async function analyzePdf(pdf, onProgress) {
  const chars = [];       // string pieces, one char each
  const meta = [];        // {page, hl, line}
  const lines = [];       // {start, end, size, page, y}
  const annots = [];      // collected markup annotations
  const imgs = [];        // image boxes (Square annotations)
  const sizeHist = new Map();

  let last = null;        // {page, y, size, endX, hasEOL}
  const push = (ch, page, hl, lineIdx) => { chars.push(ch); meta.push({ page, hl, line: lineIdx }); };

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [tc, rawAnn] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
    const pageAnn = [];
    let sq = 0;
    for (const a of rawAnn) {
      if (a.subtype === "Square" && a.rect) {
        const r = a.rect;
        imgs.push({ id: a.id || "p" + p + "-" + (++sq), page: p,
          rect: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])],
          color: colorOf(a), comment: ((a.contentsObj && a.contentsObj.str) || a.contents || "").trim() });
        continue;
      }
      if (!MARK_TYPES[a.subtype]) continue;
      const id = annots.length;
      const comment = ((a.contentsObj && a.contentsObj.str) || a.contents || "").trim();
      const rec = { id, page: p, type: MARK_TYPES[a.subtype], color: colorOf(a), quads: normQuads(a), comment,
        author: (a.titleObj && a.titleObj.str) || "", first: -1, lastIdx: -1, top: 0 };
      rec.top = rec.quads.length ? Math.max(...rec.quads.map(q => q[3])) : 0;
      annots.push(rec); pageAnn.push(rec);
    }

    let curLine = -1;
    for (const it of tc.items) {
      if (it.str === undefined) continue;
      const t = it.transform;
      const size = Math.hypot(t[2], t[3]) || it.height || 10;
      const x = t[4], y = t[5];
      const str = it.str;
      if (!str.length) { if (it.hasEOL && last) last.hasEOL = true; continue; }

      // separator logic
      const newPage = !last || last.page !== p;
      const sameLine = last && !newPage && !last.hasEOL && Math.abs(y - last.y) < Math.max(size, last.size) * 0.5;
      if (chars.length && !sameLine) {
        const gap = last && !newPage ? Math.abs(last.y - y) : Infinity;
        const sizeJump = last && Math.abs(size - last.size) > Math.min(size, last.size) * 0.12;
        const para = newPage || gap > Math.max(size, last.size) * 1.75 || sizeJump || x < (last.x0 ?? x) - size * 3;
        if (lines.length) lines[lines.length - 1].end = chars.length;
        if (para) { push("\n", p, -1, -1); push("\n", p, -1, -1); }
        else {
          // de-hyphenate "exam-\nple"
          const prev = chars[chars.length - 1], prev2 = chars[chars.length - 2] || "";
          if (prev === "-" && /[a-z]/i.test(prev2) && /^[a-z]/.test(str)) { chars.pop(); meta.pop(); }
          else push("\n", p, -1, -1);
        }
      } else if (sameLine) {
        const gapX = x - last.endX;
        const prev = chars[chars.length - 1];
        if (gapX > size * 0.15 && prev !== " " && str[0] !== " ") push(" ", p, last.hl === -2 ? -1 : -1, curLine);
      }
      if (!sameLine) {
        lines.push({ start: chars.length, end: chars.length, size, page: p, y, x0: x });
        curLine = lines.length - 1;
      }

      // per-char highlight hit test
      const n = str.length, w = it.width || size * 0.5 * n;
      const L = lines[curLine]; L.xa = Math.min(L.xa ?? x, x); L.xb = Math.max(L.xb ?? x + w, x + w);
      for (let i = 0; i < n; i++) {
        const cx = x + (w * (i + 0.5)) / n, cy = y + size * 0.35;
        let hl = -1;
        for (const a of pageAnn) {
          for (const q of a.quads) {
            if (cx >= q[0] - 0.5 && cx <= q[2] + 0.5 && cy >= q[1] - 1 && cy <= q[3] + 1) { hl = a.id; break; }
          }
          if (hl !== -1) break;
        }
        const ch = str[i] === " " ? " " : str[i];
        if (hl !== -1) {
          const a = annots[hl];
          if (a.first === -1) a.first = chars.length;
          a.lastIdx = chars.length;
        }
        push(ch, p, hl, curLine);
        if (/\S/.test(ch)) sizeHist.set(Math.round(size * 2) / 2, (sizeHist.get(Math.round(size * 2) / 2) || 0) + 1);
      }
      last = { page: p, y, size, endX: x + w, hasEOL: !!it.hasEOL, x0: sameLine ? last.x0 : x };
    }
    if (lines.length) lines[lines.length - 1].end = chars.length;
    if (onProgress) onProgress(p, pdf.numPages);
  }

  const text = chars.join("");

  // ---- topics ----
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
    topics = merged.map(m => {
      const level = Math.max(1, sizes.indexOf(Math.round(m.size * 2) / 2) + 1 || sizes.length);
      stack.length = level - 1;
      while (stack.length < level - 1) stack.push(null);
      stack[level - 1] = m.title;
      return { title: m.title, path: stack.filter(Boolean), level, page: m.page, at: m.start };
    });
    // a lone large line is usually just the document title; try wording-based detection
    if (topics.length < 2) {
      const found = patternTopics(lines, text);
      if (found.length) { topics = found; topicSource = "patterns"; }
    }
    if (!topics.length) { topics = pageTopics(lines); topicSource = "pages"; }
  }
  topics.sort((a, b) => a.at - b.at);

  // ---- sentences ----
  const isBreak = k => text[k] === "\n" && text[k + 1] === "\n";
  function sentenceBounds(a, b) {
    let s = a;
    while (s > 0) {
      const k = s - 1;
      if (text[k] === "\n" && text[k - 1] === "\n") break;
      if (/[.!?]/.test(text[k]) && /\s/.test(text[k + 1] || " ") && k < a) {
        const before = text.slice(Math.max(0, k - 8), k + 1);
        if (!ABBR.test(before) && !/\b[A-Z]\.$/.test(before)) break;
      }
      s--;
    }
    let e = b;
    while (e < text.length - 1) {
      if (isBreak(e + 1)) break;
      if (/[.!?]/.test(text[e]) && e >= b && /\s/.test(text[e + 1] || " ")) {
        const before = text.slice(Math.max(0, e - 8), e + 1);
        if (!ABBR.test(before) && !/\b[A-Z]\.$/.test(before)) break;
      }
      e++;
    }
    while (/["'”’)\]]/.test(text[e + 1] || "")) e++;
    while (s < a && /\s/.test(text[s])) s++;
    // keep very long "sentences" readable
    if (a - s > 320) s = text.lastIndexOf(" ", a - 240) + 1;
    if (e - b > 320) e = text.indexOf(" ", b + 240);
    return [s, e];
  }

  // snap highlight edges to whole words (glyph widths are approximated)
  const wc = c => /[\p{L}\p{N}'’-]/u.test(c || "");
  const hitIn = (a, i, j) => { let n = 0; for (let k = i; k <= j; k++) if (meta[k].hl === a.id) n++; return n; };
  for (const a of annots) {
    if (a.first === -1) continue;
    let f = a.first, l = a.lastIdx;
    while (f < l && /\s/.test(text[f])) f++;
    while (l > f && /\s/.test(text[l])) l--;
    if (wc(text[f]) && wc(text[f - 1])) {
      let ws = f, we = f; while (ws > 0 && wc(text[ws - 1])) ws--; while (we < text.length - 1 && wc(text[we + 1])) we++;
      if (hitIn(a, ws, we) * 2 >= we - ws + 1) f = ws; else { f = we + 1; while (f < l && /\s/.test(text[f])) f++; }
    }
    if (wc(text[l]) && wc(text[l + 1])) {
      let ws = l, we = l; while (ws > 0 && wc(text[ws - 1])) ws--; while (we < text.length - 1 && wc(text[we + 1])) we++;
      if (hitIn(a, ws, we) * 2 >= we - ws + 1) l = we; else { l = ws - 1; while (l > f && /\s/.test(text[l])) l--; }
    }
    if (f <= l) { a.first = f; a.lastIdx = l; }
  }

  const groups = new Map();
  const loose = [];
  for (const a of annots) {
    if (a.first === -1) { loose.push(a); continue; }
    const [s, e] = sentenceBounds(a.first, a.lastIdx);
    const key = s + ":" + e;
    if (!groups.has(key)) groups.set(key, { start: s, end: e, page: a.page, marks: [] });
    groups.get(key).marks.push(a);
  }
  // merge overlapping sentence groups
  const entries = [...groups.values()].sort((x, y) => x.start - y.start);
  const merged = [];
  for (const g of entries) {
    const m = merged[merged.length - 1];
    if (m && g.start <= m.end) { m.end = Math.max(m.end, g.end); m.marks.push(...g.marks); }
    else merged.push(g);
  }

  const clean = s => s.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ");
  const out = merged.map((g, i) => {
    // segments: [{t, hl: annotId|-1}]
    const segs = [];
    for (let k = g.start; k <= g.end && k < text.length; k++) {
      const own = g.marks.find(m => k >= m.first && k <= m.lastIdx);
      const inGroup = own ? own.id : -1;
      const ch = text[k] === "\n" ? " " : text[k];
      const lastSeg = segs[segs.length - 1];
      if (lastSeg && lastSeg.hl === inGroup) lastSeg.t += ch; else segs.push({ t: ch, hl: inGroup });
    }
    for (const sg of segs) sg.t = sg.t.replace(/\s{2,}/g, " ");
    g.marks.sort((x, y) => x.first - y.first);
    const spans = g.marks.map(m => ({ id: m.id, color: m.color, type: m.type, comment: m.comment,
      text: clean(text.slice(m.first, m.lastIdx + 1)).trim() }));
    const tp = topicAt(topics, g.start);
    return { n: i + 1, page: g.page, at: g.start, segs, spans, topic: tp, sentence: clean(text.slice(g.start, g.end + 1)).trim() };
  });

  // ---- images: anchor in the char stream, then pull any that land inside a fact to its start ----
  for (const im of imgs) im.at = imgStreamAt(im, lines, text.length);
  imgSnapToFacts(imgs, merged);
  imgs.sort((a, b) => a.at - b.at || a.page - b.page || b.rect[3] - a.rect[3] || b.rect[1] - a.rect[1] || a.rect[0] - b.rect[0]);
  const images = imgs.map((im, i) => ({ id: im.id, n: i + 1, page: im.page, rect: im.rect, color: im.color, comment: im.comment,
    at: im.at, topic: topicAt(topics, im.at) }));

  const looseOut = loose.map(a => ({ page: a.page, color: a.color, type: a.type, comment: a.comment }));
  return { v: ANALYZER_VERSION, entries: out, loose: looseOut, topics, topicSource, pages: pdf.numPages, count: annots.length, images };
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

// Where an image box sits in reading order: first line on its page below the box top that overlaps it
// horizontally; else first line below the top; else just after the page's text (or the next page's text).
function imgStreamAt(im, lines, textLen) {
  const [x1, , x2, top] = im.rect;
  const pl = lines.filter(l => l.page === im.page && l.end > l.start);
  const below = pl.filter(l => l.y < top);
  const hit = below.find(l => (l.xa ?? l.x0) < x2 && (l.xb ?? l.x0) > x1) || below[0];
  if (hit) return hit.start;
  if (pl.length) return Math.max(...pl.map(l => l.end));
  const nx = lines.find(l => l.page > im.page && l.end > l.start);
  return nx ? nx.start : textLen;
}
// An image inside a fact's (merged) sentence range [start, end] moves to the fact's start, so it shows before it
function imgSnapToFacts(imgs, groups) {
  for (const im of imgs) { const g = groups.find(g => g.start <= im.at && im.at <= g.end); if (g) im.at = g.start; }
  return imgs;
}

function topicAt(topics, at) {
  let t = null;
  for (const tp of topics) { if (tp.at <= at + 1) t = tp; else break; }
  return t;
}

if (typeof module !== "undefined") module.exports = { analyzePdf, ANALYZER_VERSION, imgStreamAt, imgSnapToFacts };
