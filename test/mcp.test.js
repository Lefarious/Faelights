"use strict";
// mcp/server.js run the way Claude Code runs it: a child process spoken to over stdio by the SDK's client.
// Every read tool against renderer/sample.pdf in a throwaway library (filled by the CLI), the write tools on another
// throwaway library, and the refusals: app open, lock held, unknown id, missing file, no text layer.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync, spawn } = require("node:child_process");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { PDFDocument } = require("pdf-lib");
const { repoPath } = require("./helpers/pdf");
const Extract = require("../core/extract.js");
const ExportFmt = require("../core/export.js");

const SERVER = repoPath("mcp", "server.js");
const CLI = repoPath("cli", "faelights.js");
const SAMPLE = repoPath("renderer", "sample.pdf");
const tmp = name => fs.mkdtempSync(path.join(os.tmpdir(), `faelights-mcp-${name}-`));
const run = (dir, ...args) => execFileSync(process.execPath, [CLI, "--data-dir", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cli = (dir, ...args) => JSON.parse(run(dir, ...args, "--json"));

async function connect(dir) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, FAELIGHTS_DATA_DIR: dir }, stderr: "pipe" });
  const client = new Client({ name: "faelights-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}
async function call(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const body = JSON.parse(r.content[0].text);
  if (r.isError) { const e = new Error(body.error.message); e.code = body.error.code; throw e; }
  return body;
}
const rejects = (p, code) => assert.rejects(p, e => { assert.equal(e.code, code, e.message); return true; });

let work, readDir, writeDir, reader, writer, doc, scannedPdf, web, base;
before(async () => {
  // stands in for a publisher: the sample PDF at two links, a 404, a paywall and an HTML page with no PDF
  web = http.createServer((req, res) => {
    const send = (code, type, body) => { res.writeHead(code, type ? { "Content-Type": type } : {}); res.end(body); };
    if (req.url === "/paper.pdf" || req.url === "/mirror.pdf") return send(200, "application/pdf", fs.readFileSync(SAMPLE));
    if (req.url === "/paywall") return send(403);
    if (req.url === "/page") return send(200, "text/html", "<html><body>No PDF here</body></html>");
    send(404);
  });
  await new Promise(r => web.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${web.address().port}`;
  work = tmp("work");
  readDir = tmp("read");
  writeDir = tmp("write");
  // a library like the app's: the sample in a "Biology" library, tagged and starred, via the CLI
  run(readDir, "library", "new", "Biology");
  [doc] = cli(readDir, "add", SAMPLE, "--library", "Biology", "--tag", "light");
  run(readDir, "star", doc.id);
  // a scanned PDF: pages with no text layer
  const blank = await PDFDocument.create();
  blank.addPage(); blank.addPage();
  scannedPdf = path.join(work, "scanned.pdf");
  fs.writeFileSync(scannedPdf, await blank.save());
  reader = await connect(readDir);
  writer = await connect(writeDir);
});
after(async () => {
  await reader?.close();
  await writer?.close();
  web?.close();
  for (const d of [work, readDir, writeDir]) fs.rmSync(d, { recursive: true, force: true });
});

test("lists every tool and the pdf resource template", async () => {
  const names = (await reader.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(names, ["add_by_identifier", "add_pdf", "export_library", "export_pdf", "get_extracts", "list_libraries", "list_pdfs", "search", "star_pdf", "tag_pdf"]);
  const { tools } = await reader.listTools();
  for (const n of ["add_pdf", "add_by_identifier", "tag_pdf", "star_pdf"]) assert.match(tools.find(t => t.name === n).description, /only four tools that change/);
  assert.equal(tools.find(t => t.name === "add_by_identifier").annotations.openWorldHint, true);
  const { resourceTemplates } = await reader.listResourceTemplates();
  assert.equal(resourceTemplates[0].uriTemplate, "faelights://pdf/{id}");
});

test("list_libraries", async () => {
  const { libraries } = await call(reader, "list_libraries");
  assert.deepEqual(libraries.map(l => [l.name, l.pdfs]), [["Inbox", 0], ["Biology", 1]]);
});

test("list_pdfs filters by library, tag and starred", async () => {
  const all = (await call(reader, "list_pdfs")).pdfs;
  assert.equal(all.length, 1);
  assert.equal(all[0].title, "Notes on Bioluminescence");
  assert.deepEqual([all[0].library, all[0].tags, all[0].starred, all[0].pages, all[0].highlights], ["Biology", ["light"], true, 2, 8]);
  assert.equal((await call(reader, "list_pdfs", { library: "biology", tag: "#light", starred: true })).pdfs.length, 1);
  assert.equal((await call(reader, "list_pdfs", { library: "Inbox" })).pdfs.length, 0);
  assert.equal((await call(reader, "list_pdfs", { tag: "nope" })).pdfs.length, 0);
  assert.equal((await call(reader, "list_pdfs", { starred: false })).pdfs.length, 0);
  await rejects(call(reader, "list_pdfs", { library: "Nowhere" }), "unknown_library");
});

test("get_extracts groups by topic with pages and comments, in both modes", async () => {
  const full = await call(reader, "get_extracts", { pdf_id: doc.id });
  assert.equal(full.mode, "full");
  assert.deepEqual(full.topics.map(g => g.topic.at(-1)), ["1. How the light is made", "2. Why fireflies flash", "3. Light in the deep sea", "4. Uses in the lab"]);
  const first = full.topics[0].extracts[0];
  assert.equal(first.page, 1);
  assert.match(first.text, /^In fireflies the reaction joins a molecule called luciferin with oxygen/);
  assert.deepEqual(first.highlights[0], { text: "joins a molecule called luciferin with oxygen", colour: "#ffdb33", type: "Highlight", comment: null });
  const comments = full.topics.flatMap(g => g.extracts.flatMap(e => e.highlights.map(h => h.comment))).filter(Boolean);
  assert.deepEqual(comments, ["Good term for the essay intro", "Look up Photuris"]);
  assert.deepEqual(full.textless_pages, []);

  const only = await call(reader, "get_extracts", { pdf_id: doc.id, mode: "highlights" });
  assert.equal(only.topics[0].extracts[0].text, "joins a molecule called luciferin with oxygen");
});

test("get_extracts filters by colour and topic", async () => {
  const yellow = await call(reader, "get_extracts", { pdf_id: doc.id, colours: ["#ffd640"] });   // near the sample's #ffdb33
  assert.equal(yellow.extracts, 3);
  assert.ok(yellow.topics.every(g => g.extracts.every(e => e.highlights.every(h => h.colour === "#ffdb33"))));
  const deep = await call(reader, "get_extracts", { pdf_id: doc.id, topic: "deep sea" });
  assert.deepEqual(deep.topics.map(g => g.topic.at(-1)), ["3. Light in the deep sea"]);
  assert.equal(deep.topics[0].extracts.every(e => e.page === 2), true);
});

test("search looks in the scope asked for", async () => {
  const note = await call(reader, "search", { query: "photuris", scope: "note" });
  assert.equal(note.total, 1);
  assert.equal(note.matches[0].pdf_id, doc.id);
  assert.equal(note.matches[0].highlights[0].comment, "Look up Photuris");
  assert.equal((await call(reader, "search", { query: "photuris", scope: "highlight" })).total, 0);
  assert.equal((await call(reader, "search", { query: "luciferin oxygen", scope: "highlight" })).total, 1);
  assert.equal((await call(reader, "search", { query: "fireflies", scope: "sentence" })).total > 0, true);
  const all = await call(reader, "search", { query: "deep sea" });   // "all" also matches the topic
  assert.equal(all.scope, "all");
  assert.ok(all.total >= 2);
  assert.equal((await call(reader, "search", { query: "fireflies", limit: 1 })).matches.length, 1);
});

test("export_pdf returns the app's export text", async () => {
  const result = await Extract.extractPdf(SAMPLE);
  const md = await call(reader, "export_pdf", { pdf_id: doc.id, format: "markdown", mode: "full" });
  assert.equal(md.text, ExportFmt.docText({ title: "Notes on Bioluminescence", result, tags: [] }, { fmt: "md", mode: "full" }));
  assert.match((await call(reader, "export_pdf", { pdf_id: doc.id, format: "obsidian" })).text, /==joins a molecule called luciferin with oxygen==/);
  const plain = (await call(reader, "export_pdf", { pdf_id: doc.id, format: "plain", mode: "highlights" })).text;
  assert.doesNotMatch(plain, /\*\*|==/);
  assert.match((await call(reader, "export_pdf", { pdf_id: doc.id, frontmatter: true })).text, /^---\ntitle: "Notes on Bioluminescence"\n[\s\S]*library: "Biology"\n[\s\S]*tags: \["light"\]/);
});

test("export_library writes a folder named after the library, one file per PDF", async () => {
  const out = path.join(work, "vault");
  const r = await call(reader, "export_library", { library: "Biology", out_dir: out, format: "obsidian" });
  assert.equal(r.dir, path.join(out, "Biology"));
  assert.deepEqual(fs.readdirSync(r.dir), ["Notes on Bioluminescence.md"]);
  assert.match(fs.readFileSync(r.files[0].path, "utf8"), /^---\n[\s\S]*==joins a molecule/);
  await rejects(call(reader, "export_library", { library: "Biology", out_dir: "relative/dir", format: "plain" }), "invalid_input");
});

test("the faelights://pdf/{id} resource is the PDF's extracts as Markdown", async () => {
  const { resources } = await reader.listResources();
  assert.deepEqual(resources.map(r => r.uri), [`faelights://pdf/${doc.id}`]);
  const r = await reader.readResource({ uri: `faelights://pdf/${doc.id}` });
  assert.equal(r.contents[0].mimeType, "text/markdown");
  assert.match(r.contents[0].text, /^# Notes on Bioluminescence\n\n## Notes on Bioluminescence\n\n### 1\. How the light is made/);
});

test("clear errors: unknown pdf_id, missing file, no text layer", async () => {
  await rejects(call(reader, "get_extracts", { pdf_id: "nope" }), "unknown_pdf");
  await rejects(call(reader, "export_pdf", { pdf_id: "nope" }), "unknown_pdf");
  await rejects(call(writer, "add_pdf", { path: path.join(work, "missing.pdf") }), "file_missing");

  // a doc whose files are gone and was never scanned
  const gone = path.join(work, "gone.pdf");
  fs.copyFileSync(SAMPLE, gone);
  const dir = tmp("gone");
  try {
    const [g] = cli(dir, "add", gone);
    const dbPath = path.join(dir, "library", "faelights.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const d = db.docs.find(x => x.id === g.id);
    delete d.result;
    fs.writeFileSync(dbPath, JSON.stringify(db));
    fs.rmSync(gone); fs.rmSync(d.storedPath);
    const c = await connect(dir);
    try { await rejects(call(c, "get_extracts", { pdf_id: g.id }), "file_missing"); } finally { await c.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // a scanned PDF can be added (the app allows it) but its extracts can't be read
  const added = await call(writer, "add_pdf", { path: scannedPdf });
  assert.match(added.warnings.join(" "), /no text layer/);
  await rejects(call(writer, "get_extracts", { pdf_id: added.pdf.id }), "no_text_layer");
});

test("write tools: add_pdf, tag_pdf, star_pdf on a temp library", async () => {
  const r = await call(writer, "add_pdf", { path: SAMPLE, tags: ["#firefly"] });
  assert.equal(r.action, "added");
  assert.deepEqual([r.pdf.library, r.pdf.tags, r.pdf.highlights], ["Inbox", ["firefly"], 8]);
  const id = r.pdf.id;
  assert.equal((await call(writer, "add_pdf", { path: SAMPLE })).action, "rescanned");

  const t = await call(writer, "tag_pdf", { pdf_id: id, tags: ["essay", "firefly"] });
  assert.deepEqual([t.added, t.tags], [["essay"], ["firefly", "essay"]]);
  assert.deepEqual(await call(writer, "star_pdf", { pdf_id: id, starred: true }), { pdf_id: id, title: "Notes on Bioluminescence", starred: true, changed: true });
  await rejects(call(writer, "star_pdf", { pdf_id: "nope", starred: true }), "unknown_pdf");

  // the change is on disk, where the app reads it
  const db = JSON.parse(fs.readFileSync(path.join(writeDir, "library", "faelights.json"), "utf8"));
  const d = db.docs.find(x => x.id === id);
  assert.deepEqual([d.tags, d.starred, d.libraryId], [["firefly", "essay"], true, "inbox"]);
  assert.ok(fs.existsSync(d.storedPath));
  assert.deepEqual(fs.readdirSync(path.join(writeDir, "library")).filter(f => /\.tmp$|\.lock$/.test(f)), []);
});

test("writes refuse with library_in_use while the app is open or the lock is held", async () => {
  const { pdfs: [p] } = await call(writer, "list_pdfs");

  // the desktop app's session marker, held by a live process
  const app = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const marker = path.join(writeDir, "library", "faelights.app");
  fs.writeFileSync(marker, JSON.stringify({ pid: app.pid, at: Date.now() }));
  try {
    await rejects(call(writer, "star_pdf", { pdf_id: p.id, starred: false }), "library_in_use");
    await rejects(call(writer, "tag_pdf", { pdf_id: p.id, tags: ["x"] }), "library_in_use");
    await rejects(call(writer, "add_pdf", { path: SAMPLE }), "library_in_use");
    assert.equal((await call(writer, "list_pdfs")).pdfs.length, 2, "reads still work while the app is open");
  } finally { app.kill(); }
  await new Promise(r => app.once("exit", r));
  // a marker left by a crashed app doesn't block writes
  assert.equal((await call(writer, "star_pdf", { pdf_id: p.id, starred: true })).starred, true);
  fs.rmSync(marker);

  // another process mid-write
  const lock = path.join(writeDir, "library", "faelights.json.lock");
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, at: Date.now() }));
  try {
    const after = fs.readFileSync(path.join(writeDir, "library", "faelights.json"), "utf8");
    await rejects(call(writer, "tag_pdf", { pdf_id: p.id, tags: ["locked"] }), "library_in_use");
    assert.equal(fs.readFileSync(path.join(writeDir, "library", "faelights.json"), "utf8"), after);
  } finally { fs.rmSync(lock); }
});

test("add_by_identifier downloads a paper by link, skips duplicates and reports download failures", async () => {
  const dir = tmp("ident");
  const c = await connect(dir);
  try {
    const seen = [];
    const raw = await c.callTool({ name: "add_by_identifier", arguments: { identifier: base + "/paper.pdf", tags: ["web"], lookup: false } }, undefined,
      { onprogress: p => seen.push(p), resetTimeoutOnProgress: true });
    const r = JSON.parse(raw.content[0].text);
    assert.equal(r.action, "added");
    assert.ok(seen.length >= 1, "progress notifications while downloading");
    assert.ok(seen.every((p, i) => i === 0 || p.progress > seen[i - 1].progress));
    assert.ok(seen.every(p => /^(Finding the PDF|Downloading)/.test(p.message)), JSON.stringify(seen));
    assert.deepEqual([r.pdf.title, r.pdf.library, r.pdf.tags, r.pdf.highlights], ["Notes on Bioluminescence", "Inbox", ["web"], 8]);
    assert.deepEqual([r.origin.kind, r.origin.url], ["url", base + "/paper.pdf"]);
    // no original on disk: only the library's copy, which the read tools use
    const db = JSON.parse(fs.readFileSync(path.join(dir, "library", "faelights.json"), "utf8"));
    const d = db.docs.find(x => x.id === r.pdf.id);
    assert.equal(d.sourcePath, null);
    assert.ok(fs.existsSync(d.storedPath));
    assert.equal((await call(c, "get_extracts", { pdf_id: r.pdf.id })).extracts, 7);

    // same link → its identifier is already there; another link to the same file → same contents
    assert.deepEqual([(await call(c, "add_by_identifier", { identifier: base + "/paper.pdf" })).action, (await call(c, "add_by_identifier", { identifier: base + "/mirror.pdf" })).action], ["exists", "exists"]);
    assert.equal((await call(c, "list_pdfs")).pdfs.length, 1);
    assert.equal(fs.readdirSync(path.join(dir, "library", "files")).length, 1, "the duplicate download was removed");

    await rejects(call(c, "add_by_identifier", { identifier: "not an identifier" }), "invalid_input");
    await rejects(call(c, "add_by_identifier", { identifier: base + "/missing.pdf" }), "not_found");
    await rejects(call(c, "add_by_identifier", { identifier: base + "/paywall" }), "paywalled");
    await rejects(call(c, "add_by_identifier", { identifier: base + "/page" }), "not_pdf");

    // refused before downloading while the app is open
    const app = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    fs.writeFileSync(path.join(dir, "library", "faelights.app"), JSON.stringify({ pid: app.pid, at: Date.now() }));
    try { await rejects(call(c, "add_by_identifier", { identifier: base + "/other.pdf" }), "library_in_use"); } finally { app.kill(); }
  } finally { await c.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
