/* Faelights — export formatting (pure; no DOM, no IPC)
   Builds the text of an export from a doc's result: Markdown, Obsidian, plain text and self-contained HTML,
   optionally with image boxes (core.js `result.images`) interleaved. Loaded before app.js; also required by tests. */
"use strict";

const ExportFmt = (() => {
  const PRE_TOPIC = "Abstract";
  const plural = (n, a, b) => n + " " + (n === 1 ? a : (b || a + "s"));

  // Highlight wrapper for md/obsidian. html copies as md (the clipboard is text).
  function wrapHl(t, fmt) { t = t.trim(); if (!t) return ""; return fmt === "md" || fmt === "html" ? `**${t}**` : fmt === "obsidian" ? `==${t}==` : t; }

  function entryBody(e, fmt, mode) {
    const ids = new Set(e.spans.map(s => s.id));
    if (mode === "full") {
      return e.segs.map(s => {
        if (s.hl === -1 || !ids.has(s.hl) || fmt === "plain") return s.t;
        return s.t.match(/^\s*/)[0] + wrapHl(s.t, fmt) + s.t.match(/\s*$/)[0];
      }).join("").replace(/\s{2,}/g, " ").trim();
    }
    return e.spans.map(s => s.text).join(" … ");
  }
  function entryLines(e, fmt, mode) {
    const lines = [`- ${entryBody(e, fmt, mode)} (p. ${e.page})`];
    for (const s of e.spans) if (s.comment && s.comment !== s.text) lines.push(`  - Note: ${s.comment}`);
    return lines;
  }

  // Consecutive items (entries and/or images) sharing a topic form one group
  const topicKey = t => t ? t.at + "|" + t.title : "none";
  function groupsOf(items) {
    const gs = [];
    for (const it of items) {
      const key = topicKey(it.topic);
      let g = gs[gs.length - 1];
      if (!g || g.key !== key) { g = { key, topic: it.topic, items: [] }; gs.push(g); }
      g.items.push(it);
    }
    return gs;
  }

  /* ---- images ----
     Ordering is shared with the reader (Order.withImages in order.js): an image goes before entry e when img.at <= e.at.
     Export items are the entries themselves plus images tagged kind: "image". */
  const Ord = typeof Order !== "undefined" ? Order : require("./order.js");
  const isImage = it => !!it && it.kind === "image";
  function exportItems(entries, images) {
    if (!images || !images.length) return entries;
    return Ord.withImages(entries, images).map(x => x.kind === "image" ? (isImage(x.image) ? x.image : { ...x.image, kind: "image" }) : x.entry);
  }

  // Images live in "<file base> images/p<page>-<n>.png" next to the exported file
  const imageFile = img => `p${img.page}-${img.n}.png`;
  // Markdown link destination: percent-encode each path segment (spaces → %20, brackets, #, …)
  const mdLink = p => p.split("/").map(s => encodeURIComponent(s).replace(/[()']/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

  // ref: an image with optional `path` (relative file), `failed` (couldn't be rendered). No path → text placeholder.
  function imageLines(ref, fmt) {
    const p = ref.page;
    let line;
    if (ref.failed) line = `- (image on p. ${p} couldn't be rendered)`;
    else if (!ref.path) line = `- [Image, p. ${p}]`;
    else if (fmt === "obsidian") line = `- ![[${ref.path}]] (p. ${p})`;
    else if (fmt === "plain") line = `- [Image p. ${p}: ${ref.path}]`;
    else line = `- ![Image from p. ${p}](${mdLink(ref.path)}) (p. ${p})`;
    const lines = [line];
    if (ref.comment) lines.push(`  - Note: ${ref.comment}`);
    return lines;
  }

  // Markdown / Obsidian / plain text. With no images the output is identical to the pre-image exporter.
  function docText(d, o) {
    const fmt = o.fmt === "html" ? "md" : o.fmt, mode = o.mode;
    const entries = o.entries || d.result.entries;
    const out = [];
    if (o.frontmatter) {
      out.push("---", `title: "${d.title.replace(/"/g, '\\"')}"`, `source: "${(d.sourcePath || d.fileName).replace(/\\/g, "/").replace(/"/g, '\\"')}"`,
        `library: "${o.libraryName || ""}"`, `pages: ${d.pages}`, `highlights: ${d.count}`,
        `tags: [${d.tags.map(t => JSON.stringify(t)).join(", ")}]`, `exported: ${o.date || new Date().toISOString().slice(0, 10)}`, "---", "");
    }
    out.push(fmt === "plain" ? d.title : `# ${d.title}`, "");
    const done = new Set();
    for (const g of groupsOf(exportItems(entries, o.images))) {
      const path = g.topic ? g.topic.path : [o.preTopic || PRE_TOPIC];
      path.forEach((t, i) => {
        const key = path.slice(0, i + 1).join("\u0001");
        if (i < path.length - 1 && done.has(key)) return;
        done.add(key);
        out.push(fmt === "plain" ? t.toUpperCase() : "#".repeat(Math.min(i + 2, 6)) + " " + t, "");
      });
      for (const it of g.items) out.push(...(isImage(it) ? imageLines(it, fmt) : entryLines(it, fmt, mode)));
      out.push("");
    }
    const loose = d.result.loose || [];
    if (loose.length) out.push(`(${plural(loose.length, "mark")} on pages without text: ${[...new Set(loose.map(l => l.page))].join(", ")})`);
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /* ---- HTML: one self-contained file ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rgba = (c, a) => Array.isArray(c) && c.length >= 3 ? `rgba(${c.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(+v) || 0))).join(", ")}, ${a})` : `rgba(255, 219, 51, ${a})`;
  const mark = (t, color) => `<mark style="background:${rgba(color, 0.35)}">${esc(t)}</mark>`;
  // only data:image URIs are embedded; anything else is dropped
  const safeSrc = u => typeof u === "string" && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]*$/.test(u) ? u : "";

  function entryHtml(e, mode) {
    const byId = new Map(e.spans.map(s => [s.id, s]));
    let body;
    if (mode === "full") {
      body = e.segs.map(s => {
        const sp = s.hl !== -1 && byId.get(s.hl);
        if (!sp) return esc(s.t);
        return esc(s.t.match(/^\s*/)[0]) + (s.t.trim() ? mark(s.t.trim(), sp.color) : "") + esc(s.t.match(/\s*$/)[0]);
      }).join("").replace(/\s{2,}/g, " ").trim();
    } else body = e.spans.map(s => mark(s.text, s.color)).join(" … ");
    const notes = e.spans.filter(s => s.comment && s.comment !== s.text).map(s => `<p class="note">Note: ${esc(s.comment)}</p>`).join("");
    return `<li><p>${body} <span class="pg">(p. ${esc(e.page)})</span></p>${notes}</li>`;
  }
  function figureHtml(ref) {
    const cap = `p. ${esc(ref.page)}` + (ref.comment ? ` · ${esc(ref.comment)}` : "");
    const src = safeSrc(ref.url);
    if (ref.failed || !src) return `<p class="missing">(image on p. ${esc(ref.page)} couldn't be rendered)</p>`;
    const dim = ref.width && ref.height ? ` width="${Math.round(ref.width / 2)}" height="${Math.round(ref.height / 2)}"` : "";
    return `<figure><img src="${src}" alt="Image from p. ${esc(ref.page)}"${dim}><figcaption>${cap}</figcaption></figure>`;
  }

  const CSS = `:root{color-scheme:light dark;--bg:#fbfaf7;--fg:#1f1d24;--muted:#6b6775;--rule:#e3e0e8}
@media (prefers-color-scheme:dark){:root{--bg:#16141b;--fg:#ebe8f0;--muted:#a19cab;--rule:#34303d}mark{color:inherit}}
body{background:var(--bg);color:var(--fg);font:18px/1.6 Georgia,"Iowan Old Style","Times New Roman",serif;max-width:46rem;margin:0 auto;padding:2.5rem 1rem 4rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:2rem 0 .75rem}h1{font-size:2rem;margin-top:0}
.meta{color:var(--muted);font-size:.85rem;border-bottom:1px solid var(--rule);padding-bottom:1rem}
ul{padding-left:1.2rem}li{margin:.6rem 0}li p{margin:0}mark{border-radius:2px;padding:0 .1em;color:inherit}
.pg,.loose,.missing{color:var(--muted);font-size:.85em}.note{margin:.25rem 0 0;color:var(--muted);font-style:italic}
figure{margin:1.5rem auto;text-align:center}figure img{max-width:100%;height:auto;border:1px solid var(--rule)}
figcaption{color:var(--muted);font-size:.85rem;margin-top:.4rem}`;

  function docHtml(d, o) {
    const mode = o.mode, entries = o.entries || d.result.entries;
    const out = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">', `<title>${esc(d.title)}</title>`, `<style>${CSS}</style>`, "</head>", "<body>",
      `<h1>${esc(d.title)}</h1>`];
    const meta = [o.libraryName && `Library: ${esc(o.libraryName)}`, d.pages && plural(d.pages, "page"), d.count != null && plural(d.count, "highlight"),
      d.tags && d.tags.length && `Tags: ${d.tags.map(esc).join(", ")}`, `Exported ${esc(o.date || new Date().toISOString().slice(0, 10))}`].filter(Boolean);
    out.push(`<p class="meta">${meta.join(" · ")}</p>`);
    const done = new Set();
    for (const g of groupsOf(exportItems(entries, o.images))) {
      const path = g.topic ? g.topic.path : [o.preTopic || PRE_TOPIC];
      path.forEach((t, i) => {
        const key = path.slice(0, i + 1).join("\u0001");
        if (i < path.length - 1 && done.has(key)) return;
        done.add(key);
        const h = Math.min(i + 2, 6);
        out.push(`<h${h}>${esc(t)}</h${h}>`);
      });
      let open = false;
      for (const it of g.items) {
        if (isImage(it)) { if (open) { out.push("</ul>"); open = false; } out.push(figureHtml(it)); continue; }
        if (!open) { out.push("<ul>"); open = true; }
        out.push(entryHtml(it, mode));
      }
      if (open) out.push("</ul>");
    }
    const loose = d.result.loose || [];
    if (loose.length) out.push(`<p class="loose">(${plural(loose.length, "mark")} on pages without text: ${[...new Set(loose.map(l => l.page))].join(", ")})</p>`);
    out.push("</body>", "</html>");
    return out.join("\n") + "\n";
  }

  const FORMATS = [["md", "Markdown"], ["obsidian", "Obsidian"], ["html", "HTML"], ["plain", "Plain text"]];
  const extOf = fmt => fmt === "plain" ? ".txt" : fmt === "html" ? ".html" : ".md";

  return { PRE_TOPIC, FORMATS, extOf, wrapHl, entryLines, groupsOf, exportItems, isImage, imageFile, mdLink, imageLines, docText, esc, docHtml };
})();

if (typeof module !== "undefined") module.exports = ExportFmt;
