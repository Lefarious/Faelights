"use strict";
// core/export.js on real extraction output: Markdown, Obsidian, plain text and HTML, full-sentence and
// highlight-only modes, YAML frontmatter, topic headings and notes.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { repoPath } = require("../helpers/pdf");
const X = require("../../core/extract.js");
const F = require("../../core/export.js");

let d;
before(async () => {
  const result = await X.extractPdf(repoPath("renderer", "sample.pdf"));
  d = { title: 'Notes "on" Light', fileName: "sample.pdf", sourcePath: "C:\\papers\\sample.pdf", pages: result.pages,
    count: result.count, tags: ["biology", "light"], result };
});
const out = (fmt, mode, extra = {}) => F.docText(d, { fmt, mode, date: "2026-10-20", libraryName: "Reading", ...extra });
const LINE = "Almost all of the energy leaves as visible light rather than heat, which is why the glow is often";

test("Markdown, full sentence: **highlight** inside the sentence, page and note", () => {
  const md = out("md", "full");
  assert.ok(md.startsWith('# Notes "on" Light\n\n## Notes on Bioluminescence\n\n### 1. How the light is made\n\n'));
  assert.ok(md.includes(`- ${LINE} **called cold light**. (p. 1)\n  - Note: Good term for the essay intro`));
  // the shared parent heading is written once
  assert.equal(md.match(/^## Notes on Bioluminescence$/gm).length, 1);
  assert.equal(md.match(/^### /gm).length, 4);
  assert.ok(md.endsWith("\n") && !md.includes("\n\n\n"));
});

test("Markdown, highlight only: just the marked words, joined with an ellipsis", () => {
  const md = out("md", "only");
  assert.ok(md.includes("- called cold light (p. 1)\n  - Note: Good term for the essay intro"));
  assert.ok(md.includes("- counter-illumination, … so their outline disappears against the dim water above. (p. 2)"));
  assert.ok(!md.includes("**"));
  assert.ok(!md.includes(LINE));
});

test("Obsidian uses ==highlight==", () => {
  const ob = out("obsidian", "full");
  assert.ok(ob.includes(`- ${LINE} ==called cold light==. (p. 1)`));
  assert.ok(!ob.includes("**"));
  assert.ok(ob.startsWith('# Notes "on" Light'));
  assert.ok(out("obsidian", "only").includes("- femme fatale fireflies (p. 1)\n  - Note: Look up Photuris"));
});

test("plain text: no markup, upper-case headings", () => {
  const pl = out("plain", "full");
  assert.ok(pl.startsWith('Notes "on" Light\n\nNOTES ON BIOLUMINESCENCE\n\n1. HOW THE LIGHT IS MADE\n\n'));
  assert.ok(pl.includes(`- ${LINE} called cold light. (p. 1)`));
  assert.ok(!/[#*=]{2}/.test(pl));
  assert.ok(out("plain", "only").includes("- called cold light (p. 1)"));
});

test("YAML frontmatter with quoted title, forward-slash source, tags and date", () => {
  const md = out("md", "full", { frontmatter: true });
  assert.ok(md.startsWith([
    "---",
    'title: "Notes \\"on\\" Light"',
    'source: "C:/papers/sample.pdf"',
    'library: "Reading"',
    "pages: 2",
    "highlights: 8",
    'tags: ["biology", "light"]',
    "exported: 2026-10-20",
    "---",
    "",
    '# Notes "on" Light'
  ].join("\n")));
  assert.ok(!out("md", "full").startsWith("---"));
  assert.ok(out("obsidian", "only", { frontmatter: true }).startsWith("---\ntitle:"));
});

test("every format lists all 7 facts in reading order", () => {
  const firsts = ["luciferin", "cold light", "delay between", "femme fatale", "three quarters", "counter-illumination", "Green fluorescent"];
  for (const fmt of ["md", "obsidian", "plain"]) for (const mode of ["full", "only"]) {
    const t = out(fmt, mode), pos = firsts.map(w => t.indexOf(w));
    assert.ok(pos.every(p => p > 0), `${fmt}/${mode}`);
    assert.deepEqual(pos, [...pos].sort((a, b) => a - b), `${fmt}/${mode}`);
    assert.equal(t.match(/^- /gm).length, 7, `${fmt}/${mode}`);
  }
});

test("HTML is self-contained, escaped, with coloured marks", () => {
  const h = F.docHtml(d, { mode: "full", date: "2026-10-20", libraryName: "Reading" });
  assert.ok(h.startsWith("<!doctype html>"));
  assert.ok(h.includes("<title>Notes &quot;on&quot; Light</title>"));
  assert.ok(h.includes('<mark style="background:rgba(255, 219, 51, 0.35)">called cold light</mark>'));
  assert.ok(h.includes('<p class="note">Note: Good term for the essay intro</p>'));
  assert.ok(!/<script|src="http/.test(h));
  const only = F.docHtml(d, { mode: "only", date: "2026-10-20" });
  assert.ok(only.includes('<li><p><mark style="background:rgba(255, 219, 51, 0.35)">called cold light</mark> <span class="pg">(p. 1)</span>'));
});

test("loose marks are summarised at the end", () => {
  const withLoose = { ...d, result: { ...d.result, loose: [{ page: 3 }, { page: 3 }, { page: 5 }] } };
  assert.ok(F.docText(withLoose, { fmt: "md", mode: "full" }).trim().endsWith("(3 marks on pages without text: 3, 5)"));
});

test("file extensions per format", () => {
  assert.deepEqual(F.FORMATS.map(([f]) => F.extOf(f)), [".md", ".md", ".html", ".txt"]);
});
