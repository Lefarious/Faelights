#!/usr/bin/env node
/* Faelights — MCP server over stdio (T-016)
   Exposes the desktop app's library to MCP clients (Claude Code, Claude Desktop): read highlights grouped by topic,
   search, export, and the write tools (WRITE_TOOLS). Handlers live in tools.js; this file declares the zod schemas and the
   faelights://pdf/{id} resource. Data folder: --data-dir, else FAELIGHTS_DATA_DIR, else the app's own (userData).
   stdout carries only protocol messages: anything logged goes to stderr. */
"use strict";

// Before anything else is loaded: a stray console.log would corrupt the protocol stream
console.log = console.info = console.debug = (...args) => console.error(...args);

const { McpServer, ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { tools, ToolError } = require("./tools.js");
const { version } = require("../package.json");

const WRITE_TOOLS = ["add_pdf", "add_by_identifier", "tag_pdf", "star_pdf", "mark_read", "set_tag_colour"];
const WRITE_NOTE = `This is one of the only ${WRITE_TOOLS.length} tools that change your Faelights library (${WRITE_TOOLS.join(", ")}). ` +
  "It refuses with library_in_use while the Faelights desktop app is open, because the app would overwrite the change.";

const pdfId = z.string().min(1).describe("The PDF's id, from list_pdfs or search");
const format = z.enum(["markdown", "obsidian", "plain"]).default("markdown")
  .describe("markdown: **highlights**; obsidian: ==highlights==; plain: no marks");
const mode = z.enum(["full", "highlights"]).optional()
  .describe("full: whole sentences with the highlights marked; highlights: just the highlighted words. Default: the app's setting");
const library = z.string().min(1).describe("Library name or id (see list_libraries)");

// Map the handler's {code, message} failures to tool errors; anything else is logged and reported as internal
const wrap = fn => async (args, extra) => {
  try {
    const out = await fn(args, extra);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
  } catch (e) {
    const error = e instanceof ToolError ? { code: e.code, message: e.message } : { code: "internal", message: e && e.message || String(e) };
    if (!(e instanceof ToolError)) console.error(e && e.stack || e);
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error }, null, 2) }] };
  }
};

// notifications/progress for a request that carries a progressToken (clients may reset their timeout on each one);
// progress only ever increases: bytes downloaded once known, otherwise one step per stage
const STAGES = { find: "Finding the PDF", download: "Downloading", details: "Looking up the paper's details" };
function progressFor(extra) {
  const token = extra && extra._meta && extra._meta.progressToken;
  if (token === undefined) return undefined;
  let last = 0;
  return p => {
    last = Math.max(last + 1, p.got || 0);
    const message = p.got ? `Downloading: ${Math.round(p.got / 1024)} KB` + (p.total ? ` of ${Math.round(p.total / 1024)} KB` : "") : STAGES[p.stage] || p.stage;
    extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: last, message } }).catch(() => {});
  };
}

function createServer(dataDir) {
  const t = tools(dataDir);
  const server = new McpServer({ name: "faelights", version }, {
    instructions: "Faelights pulls highlights out of annotated PDFs, grouped by the PDF's topics (headings). " +
      "Start with list_pdfs or search to find a PDF id, then get_extracts or export_pdf. " +
      `Only ${WRITE_TOOLS.join(", ")} change the library, and they fail with library_in_use while the desktop app is open. ` +
      "add_by_identifier is the only tool that uses the internet."
  });
  const read = { readOnlyHint: true, openWorldHint: false };

  server.registerTool("list_libraries", {
    title: "List libraries", description: "The libraries in Faelights (the Inbox plus any you made), with how many PDFs each holds.",
    inputSchema: {}, annotations: read
  }, wrap(() => t.list_libraries()));

  server.registerTool("list_pdfs", {
    title: "List PDFs", description: "PDFs in the library with their ids, titles, tags, star, read state, last page viewed and highlight counts. " +
      "Filter by library, tag, starred or read.",
    inputSchema: {
      library: library.optional(),
      tag: z.string().min(1).optional().describe("Only PDFs with this tag"),
      starred: z.boolean().optional().describe("true: only starred; false: only unstarred"),
      read: z.boolean().optional().describe("true: only read; false: only unread")
    },
    annotations: read
  }, wrap(a => t.list_pdfs(a)));

  server.registerTool("list_tags", {
    title: "List tags", description: "Every tag, how many PDFs have it, and its colour in the app (#rrggbb, or null).",
    inputSchema: {}, annotations: read
  }, wrap(() => t.list_tags()));

  server.registerTool("get_extracts", {
    title: "Get extracts", description: "A PDF's highlights grouped by topic (its headings or outline), with page numbers, colours and comments. " +
      "mode full gives each highlight's whole sentence; highlights gives only the marked words. Filter by colours (hex) or a topic name.",
    inputSchema: {
      pdf_id: pdfId,
      mode: z.enum(["full", "highlights"]).default("full").describe("full: whole sentences; highlights: just the marked words"),
      colours: z.array(z.string().regex(/^#?[0-9a-fA-F]{6}$/, "hex colour like #ffdb33")).optional()
        .describe("Only highlights near these colours, e.g. [\"#ffdb33\"] for yellow"),
      topic: z.string().min(1).optional().describe("Only topics whose heading path contains this text (case-insensitive)")
    },
    annotations: read
  }, wrap(a => t.get_extracts(a)));

  server.registerTool("search", {
    title: "Search highlights", description: "Highlights across the library that contain every word of the query. scope picks where to look: " +
      "the whole sentence, the highlighted words, the notes (comments), or all of them plus the topic.",
    inputSchema: {
      query: z.string().min(1).describe("Words to find; all must appear"),
      scope: z.enum(["sentence", "highlight", "note", "all"]).default("all"),
      library: library.optional(),
      limit: z.number().int().min(1).max(500).default(50).describe("Most matches to return")
    },
    annotations: read
  }, wrap(a => t.search(a)));

  server.registerTool("export_pdf", {
    title: "Export a PDF", description: "One PDF's highlights as Markdown, Obsidian or plain text, the same text the app's Export writes. Returns the text; writes nothing.",
    inputSchema: { pdf_id: pdfId, format, mode, frontmatter: z.boolean().default(false).describe("Start with YAML frontmatter (title, tags, …)") },
    annotations: read
  }, wrap(a => t.export_pdf(a)));

  server.registerTool("export_library", {
    title: "Export a library", description: "Write every PDF in a library to a folder (named after the library) inside out_dir, one file per PDF, " +
      "like the app's Export library (captured images aren't included). Writes only export files; the library itself is not changed.",
    inputSchema: { library, out_dir: z.string().min(1).describe("Absolute path of the folder to export into"), format, mode },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, wrap(a => t.export_library(a)));

  const writeHints = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool("add_pdf", {
    title: "Add a PDF", description: "Add a PDF file from disk to the library (the Inbox unless library is given) and read its highlights. " +
      "A file already added from the same path is rescanned instead. " + WRITE_NOTE,
    inputSchema: {
      path: z.string().min(1).describe("Path of the PDF file"),
      library: library.optional(),
      tags: z.array(z.string().min(1)).optional().describe("Tags to give it")
    },
    annotations: writeHints
  }, wrap(a => t.add_pdf(a)));

  server.registerTool("add_by_identifier", {
    title: "Add a paper by identifier", description: "Download a paper by DOI, arXiv id, PMID, PMCID, ISBN, ADS bibcode or web link, add it to the " +
      "library (the Inbox unless library is given) and read its highlights. This is the only tool that uses the internet: it contacts the publisher " +
      "or repository and, unless lookup is false, CrossRef or arXiv for the paper's details. It can take up to a minute. A paper already in the " +
      "library (same identifier or same file) is returned as \"exists\" and not downloaded again. A large PDF from a slow server can take " +
      "several minutes; progress notifications are sent while it downloads. Download failures come back as offline, " +
      "paywalled, not_pdf, not_found, no_free_copy, too_large or network. " + WRITE_NOTE,
    inputSchema: {
      identifier: z.string().min(1).describe("e.g. 10.1371/journal.pone.0185809, arXiv:1706.03762, PMID 31452104, PMC6482211, an ISBN, or a link"),
      library: library.optional(),
      tags: z.array(z.string().min(1)).optional().describe("Tags to give it"),
      lookup: z.boolean().default(true).describe("Fill in title, authors, journal… from CrossRef / arXiv after downloading")
    },
    annotations: { ...writeHints, openWorldHint: true }
  }, wrap((a, extra) => t.add_by_identifier(a, progressFor(extra))));

  server.registerTool("tag_pdf", {
    title: "Tag a PDF", description: "Add tags to a PDF (a leading # is dropped; tags it already has are kept once). " + WRITE_NOTE,
    inputSchema: { pdf_id: pdfId, tags: z.array(z.string().min(1)).min(1) },
    annotations: { ...writeHints, idempotentHint: true }
  }, wrap(a => t.tag_pdf(a)));

  server.registerTool("star_pdf", {
    title: "Star a PDF", description: "Star or unstar a PDF. " + WRITE_NOTE,
    inputSchema: { pdf_id: pdfId, starred: z.boolean() },
    annotations: { ...writeHints, idempotentHint: true }
  }, wrap(a => t.star_pdf(a)));

  server.registerTool("mark_read", {
    title: "Mark a PDF read", description: "Mark a PDF as read or unread. " + WRITE_NOTE,
    inputSchema: { pdf_id: pdfId, read: z.boolean() },
    annotations: { ...writeHints, idempotentHint: true }
  }, wrap(a => t.mark_read(a)));

  server.registerTool("set_tag_colour", {
    title: "Set a tag's colour", description: "Give a tag a colour, as the app's tag menu does (a leading # on the tag is dropped), or remove it with null. " +
      "The tag must be on at least one PDF (see list_tags); an unknown tag fails with unknown_tag. " + WRITE_NOTE,
    inputSchema: {
      tag: z.string().min(1),
      colour: z.string().regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "hex colour like #3a7 or #33aa77").nullable().describe("#rgb or #rrggbb; null removes the colour")
    },
    annotations: { ...writeHints, idempotentHint: true }
  }, wrap(a => t.set_tag_colour(a)));

  server.registerResource("pdf", new ResourceTemplate("faelights://pdf/{id}", {
    list: async () => ({ resources: (await t.pdf_resources()).map(p => ({ uri: `faelights://pdf/${p.id}`, name: p.title, description: `In ${p.library}`, mimeType: "text/markdown" })) })
  }), { title: "PDF extracts", description: "A PDF's highlights grouped by topic, as Markdown", mimeType: "text/markdown" }, async (uri, { id }) => {
    try {
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: await t.pdf_markdown(decodeURIComponent(id)) }] };
    } catch (e) {
      if (e instanceof ToolError) throw new Error(`${e.code}: ${e.message}`);
      throw e;
    }
  });

  return { server, tools: t };
}

async function main(argv) {
  const i = argv.indexOf("--data-dir");
  const dataDir = i >= 0 ? argv[i + 1] : undefined;
  const { server, tools: t } = createServer(dataDir);
  await server.connect(new StdioServerTransport());
  console.error(`Faelights MCP server ${version} ready · library: ${t.store.paths.dir}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => { console.error(e && e.stack || e); process.exit(1); });
}

module.exports = { createServer };
