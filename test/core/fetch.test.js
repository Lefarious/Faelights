"use strict";
// core/fetch.js without the internet: nodeGet() against a local HTTP server (redirects, cookies, status codes,
// size caps, refused connections), and the resolver / lookupMeta with a fake transport.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const F = require("../../core/fetch.js");

const PDF = Buffer.from("%PDF-1.4\n% fake\n");
let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const go = (to, cookie) => { res.writeHead(302, { Location: to, ...(cookie ? { "Set-Cookie": cookie } : {}) }); res.end(); };
    switch (u.pathname) {
      case "/pdf": res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(PDF);
      case "/hop": return go("/pdf");
      // like a publisher's sign-in bounce: only lets you through once the cookie it set comes back
      case "/gate": return req.headers.cookie === "pass=1" ? go("/pdf") : go("/login");
      case "/login": return go("/gate", "pass=1; Domain=127.0.0.1; Path=/; HttpOnly");
      case "/loop": return go("/loop");
      case "/404": res.writeHead(404); return res.end();
      case "/403": res.writeHead(403); return res.end();
      case "/500": res.writeHead(500); return res.end();
      case "/big": res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(Buffer.alloc(2048));
      case "/page": res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html></html>");
      default: res.writeHead(404); res.end();
    }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const reason = async p => { try { await p; return "ok"; } catch (e) { assert.ok(e instanceof F.FetchFail, String(e)); return e.reason; } };

test("nodeGet follows redirects and reports the final URL", async () => {
  const r = await F.nodeGet()(base + "/hop", F.ACCEPT_ANY, F.MAX_PDF);
  assert.equal(r.url, base + "/pdf");
  assert.equal(r.html, false);
  assert.deepEqual(r.buf, PDF);
});

test("cookies set during redirects are sent back (publisher sign-in bounces)", async () => {
  const r = await F.nodeGet()(base + "/gate", F.ACCEPT_ANY, F.MAX_PDF);
  assert.equal(r.url, base + "/pdf");
});

test("status codes, caps and loops map to the app's failure reasons", async () => {
  const get = F.nodeGet();
  assert.equal(await reason(get(base + "/404", F.ACCEPT_ANY, F.MAX_PDF)), "not-found");
  assert.equal(await reason(get(base + "/403", F.ACCEPT_ANY, F.MAX_PDF)), "paywalled");
  assert.equal(await reason(get(base + "/500", F.ACCEPT_ANY, F.MAX_PDF)), "network");
  assert.equal(await reason(get(base + "/big", F.ACCEPT_ANY, 1024)), "too-large");
  assert.equal(await reason(get(base + "/loop", F.ACCEPT_ANY, F.MAX_PDF)), "network");
  assert.equal(await reason(get("ftp://example.org/x.pdf", F.ACCEPT_ANY, F.MAX_PDF)), "invalid");
});

test("a refused connection is 'offline'; an aborted signal is 'cancelled'", async () => {
  const dead = http.createServer();
  await new Promise(r => dead.listen(0, "127.0.0.1", r));
  const port = dead.address().port;
  await new Promise(r => dead.close(r));
  assert.equal(await reason(F.nodeGet()(`http://127.0.0.1:${port}/`, F.ACCEPT_ANY, F.MAX_PDF)), "offline");
  const ctl = new AbortController(); ctl.abort();
  assert.equal(await reason(F.nodeGet({ signal: ctl.signal })(base + "/pdf", F.ACCEPT_ANY, F.MAX_PDF)), "cancelled");
});

// A fake transport: url → {status-ish reason} | {html} | {pdf}
function fake(routes, seen = []) {
  return async (url) => {
    seen.push(url);
    const r = routes[url];
    if (!r) throw new F.FetchFail("not-found");
    if (r.fail) throw new F.FetchFail(r.fail);
    if (r.pdf) return { url, type: "application/pdf", html: false, buf: PDF };
    if (r.json) return { url, type: "application/json", html: false, buf: Buffer.from(JSON.stringify(r.json)) };
    return { url, type: "text/html", html: true, buf: Buffer.from(r.html) };
  };
}

test("arXiv: the abs page's citation_pdf_url gives the PDF and the title", async () => {
  const seen = [], stages = [];
  const get = fake({
    "https://arxiv.org/abs/1706.03762": { html: '<meta name="citation_title" content="Attention Is All You Need"><meta name="citation_pdf_url" content="https://arxiv.org/pdf/1706.03762">' },
    "https://arxiv.org/pdf/1706.03762": { pdf: true }
  }, seen);
  const r = await F.resolver(get, p => stages.push(p.stage)).resolvePdf({ kind: "arxiv", value: "1706.03762" });
  assert.equal(r.url, "https://arxiv.org/pdf/1706.03762");
  assert.deepEqual(stages, ["find", "download"]);
});

test("DOI: a paywalled landing page falls back to CrossRef's full-text PDF link", async () => {
  const get = fake({
    "https://doi.org/10.1/x": { fail: "paywalled" },
    "https://api.crossref.org/works/10.1%2Fx": { json: { message: { link: [{ URL: "https://pub.example/x.pdf", "content-type": "application/pdf" }] } } },
    "https://pub.example/x.pdf": { pdf: true }
  });
  const r = await F.resolver(get).resolvePdf({ kind: "doi", value: "10.1/x", url: "https://doi.org/10.1/x" });
  assert.equal(r.url, "https://pub.example/x.pdf");
});

test("DOI with no reachable PDF is 'paywalled'; offline stops at once", async () => {
  const get = fake({ "https://doi.org/10.1/y": { html: "<html>sign in</html>" }, "https://api.crossref.org/works/10.1%2Fy": { json: { message: {} } } });
  assert.equal(await reason(F.resolver(get).resolvePdf({ kind: "doi", value: "10.1/y" })), "paywalled");
  const seen = [];
  const off = fake({ "https://doi.org/10.1/z": { fail: "offline" } }, seen);
  assert.equal(await reason(F.resolver(off).resolvePdf({ kind: "doi", value: "10.1/z" })), "offline");
  assert.equal(seen.length, 1);
});

test("lookupMeta: CrossRef for a DOI, arXiv for an arXiv id, 'invalid' with neither", async () => {
  const get = fake({ "https://api.crossref.org/works/10.1%2Fx": { json: { message: { title: ["A paper"], author: [{ given: "Ada", family: "Lovelace" }] } } } });
  const r = await F.lookupMeta(get, { doi: "10.1/x" }, null);
  assert.equal(r.ok, true);
  assert.equal(r.source, "crossref");
  assert.equal(r.meta.title, "A paper");
  assert.deepEqual(await F.lookupMeta(get, {}, null), { ok: false, reason: "invalid" });
  assert.deepEqual(await F.lookupMeta(fake({}), { doi: "10.1/none" }, null), { ok: false, reason: "not-found" });
});
