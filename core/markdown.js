/* Faelights — a small Markdown renderer for the user's notes (headless core; no DOM, no dependencies)
   Headings (ATX; "#Title" counts too), paragraphs (line breaks kept), **bold**, *italic*, ~~strike~~, `code`,
   [links](https://…), - / 1. lists (one level), > blockquotes, ``` fences and --- rules.
   Everything is escaped: raw HTML in a note shows as text; only http(s) and mailto links become links.
   Loaded by a <script> tag in the renderer (global `Markdown`, before export.js) and by require() in Node. */
"use strict";

const Markdown = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const HEAD = /^ {0,3}(#{1,6})(?!#)[ \t]*(.*?)(?:[ \t]+#+)?[ \t]*$/;
  const FENCE = /^ {0,3}(```|~~~)/;
  const RULE = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
  const QUOTE = /^ {0,3}> ?/;
  const ITEM = /^[ \t]*([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
  const heading = line => { const m = HEAD.exec(line); return m && m[2] ? { level: m[1].length, text: m[2] } : null; };
  const safeUrl = u => /^(https?:\/\/|mailto:)/i.test(u);
  // A note whose text starts with "#" is a section heading
  const isHeading = src => !!heading(String(src || "").trimStart().split("\n")[0]);

  // emphasis on already-escaped text
  const emph = s => s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>")
    .replace(/\*(?=\S)([^*]*?\S)\*/g, "<em>$1</em>").replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  // one line or paragraph of inline Markdown → HTML. Code spans and links are set aside first so emphasis can't reach inside.
  function inline(s) {
    const keep = [];
    const hold = h => "\u0000" + (keep.push(h) - 1) + "\u0000";
    s = String(s).replace(/\u0000/g, "").replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
    s = esc(s).replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t, u) => safeUrl(u) ? hold(`<a href="${u}" target="_blank" rel="noreferrer">${emph(t)}</a>`) : m);
    s = emph(s);
    for (let k = 0; k < 3 && s.includes("\u0000"); k++) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
    return s;
  }

  // → HTML. o.shift: levels to add to every heading (a note under an h3 topic gets shift 3, so "#" → h4); capped at h6
  function html(src, o = {}) {
    const shift = o.shift || 0, lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n"), out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const f = FENCE.exec(line);
      if (f) {
        const code = [];
        for (i++; i < lines.length && !lines[i].trimStart().startsWith(f[1]); i++) code.push(lines[i]);
        i++; out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); continue;
      }
      const h = heading(line);
      if (h) { const n = Math.min(h.level + shift, 6); out.push(`<h${n}>${inline(h.text)}</h${n}>`); i++; continue; }
      if (RULE.test(line)) { out.push("<hr>"); i++; continue; }
      if (QUOTE.test(line)) {
        const q = [];
        for (; i < lines.length && lines[i].trim() && QUOTE.test(lines[i]); i++) q.push(lines[i].replace(QUOTE, ""));
        out.push(`<blockquote>${html(q.join("\n"), o)}</blockquote>`); continue;
      }
      const it = ITEM.exec(line);
      if (it) {
        const ol = /\d/.test(it[1]), items = [];
        for (; i < lines.length && lines[i].trim(); i++) {
          const m = ITEM.exec(lines[i]);
          if (m && /\d/.test(m[1]) === ol) items.push(m[2]);
          else if (!m && /^[ \t]/.test(lines[i])) items[items.length - 1] += "\n" + lines[i].trim();
          else break;
        }
        out.push(`<${ol ? "ol" : "ul"}>${items.map(t => `<li>${inline(t).replace(/\n/g, "<br>")}</li>`).join("")}</${ol ? "ol" : "ul"}>`); continue;
      }
      const p = [];
      for (; i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !heading(lines[i]) && !RULE.test(lines[i]) && !QUOTE.test(lines[i]) && !ITEM.test(lines[i]); i++) p.push(lines[i].trim());
      out.push(`<p>${p.map(inline).join("<br>")}</p>`);
    }
    return out.join("\n");
  }

  // Markdown with every heading moved down `n` levels (capped at 6) and written "### Title"; fenced code is left alone
  function shift(src, n) {
    let fence = null;
    return String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n").map(line => {
      const f = FENCE.exec(line);
      if (f) { fence = fence ? (f[1] === fence ? null : fence) : f[1]; return line; }
      const h = !fence && heading(line);
      return h ? "#".repeat(Math.min(h.level + n, 6)) + " " + h.text : line;
    }).join("\n").trim();
  }

  // → plain text: Markdown syntax dropped, links as "text (url)", list markers kept
  function plain(src) {
    let fence = null;
    const inl = s => s.replace(/`([^`\n]+)`/g, "$1").replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2").replace(/\*(?=\S)([^*]*?\S)\*/g, "$1")
      .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1$2").replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
    const out = [];
    for (let line of String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n")) {
      const f = FENCE.exec(line);
      if (f) { fence = fence ? (f[1] === fence ? null : fence) : f[1]; continue; }
      if (fence) { out.push(line); continue; }
      while (QUOTE.test(line)) line = line.replace(QUOTE, "");
      const h = heading(line);
      out.push(h ? inl(h.text) : RULE.test(line) ? "" : inl(line));
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return { esc, inline, html, shift, plain, isHeading };
})();

if (typeof module !== "undefined") module.exports = Markdown;
