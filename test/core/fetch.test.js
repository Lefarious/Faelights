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

// PMC: NCBI's open-access bucket first, then Europe PMC, then PMC's own page (now a JavaScript bot check)
const OA = "https://pmc-oa-opendata.s3.amazonaws.com/";
const BOT = { html: "<html><title>Preparing to download ...</title><script>/* proof of work */</script></html>" };
const pmcRoutes = (v, extra = {}) => ({
  [`${OA}?list-type=2&prefix=metadata%2F${v}.`]: { html: "<ListBucketResult></ListBucketResult>" },   // not in the OA subset
  [`https://europepmc.org/articles/${v}?pdf=render`]: { fail: "paywalled" },   // Cloudflare's 403
  [`https://pmc.ncbi.nlm.nih.gov/articles/${v}/`]: { html: `<meta name="citation_pdf_url" content="https://pmc.ncbi.nlm.nih.gov/articles/${v}/pdf/x.pdf">` },
  [`https://pmc.ncbi.nlm.nih.gov/articles/${v}/pdf/x.pdf`]: BOT,
  ...extra
});
const pmcid = v => ({ kind: "pmcid", value: v, url: `https://pmc.ncbi.nlm.nih.gov/articles/${v}/` });

test("PMCID: the newest version in NCBI's open-access bucket, with its title", async () => {
  const seen = [];
  const get = fake(pmcRoutes("PMC1", {
    [`${OA}?list-type=2&prefix=metadata%2FPMC1.`]: { html: "<Contents><Key>metadata/PMC1.1.json</Key></Contents><Contents><Key>metadata/PMC1.2.json</Key></Contents>" },
    [`${OA}PMC1.2/PMC1.2.json`]: { json: { title: "GenBank", pdf_url: "s3://pmc-oa-opendata/PMC1.2/PMC1.2.pdf?md5=abc" } },
    [`${OA}PMC1.2/PMC1.2.pdf`]: { pdf: true }
  }), seen);
  const r = await F.resolver(get).resolvePdf(pmcid("PMC1"));
  assert.equal(r.url, `${OA}PMC1.2/PMC1.2.pdf`);
  assert.equal(r.title, "GenBank");
  assert.equal(seen.length, 3);   // PMC's bot-walled page never asked
});

test("PMCID: PMC's bot-check page instead of the PDF falls back to Europe PMC", async () => {
  const get = fake(pmcRoutes("PMC2", { "https://europepmc.org/articles/PMC2?pdf=render": { pdf: true } }));
  const r = await F.resolver(get).resolvePdf(pmcid("PMC2"));
  assert.equal(r.url, "https://europepmc.org/articles/PMC2?pdf=render");
  // and PMC itself is still used when it does hand over the PDF
  const pmc = fake(pmcRoutes("PMC3", { "https://pmc.ncbi.nlm.nih.gov/articles/PMC3/pdf/x.pdf": { pdf: true } }));
  assert.equal((await F.resolver(pmc).resolvePdf(pmcid("PMC3"))).url, "https://pmc.ncbi.nlm.nih.gov/articles/PMC3/pdf/x.pdf");
});

test("PMCID: nothing gives a PDF → 'no-free-copy' (not a paywall); an unknown PMCID → 'not-found'", async () => {
  const seen = [];
  assert.equal(await reason(F.resolver(fake(pmcRoutes("PMC4"), seen)).resolvePdf(pmcid("PMC4"))), "no-free-copy");
  assert.equal(seen.length, 4);   // bucket listing, Europe PMC, PMC page, PMC's bot check
  const gone = pmcRoutes("PMC5", { "https://pmc.ncbi.nlm.nih.gov/articles/PMC5/": { fail: "not-found" } });
  assert.equal(await reason(F.resolver(fake(gone)).resolvePdf(pmcid("PMC5"))), "not-found");
});

test("PMCID: offline stops at once, with no further sources tried", async () => {
  const seen = [];
  const get = fake(pmcRoutes("PMC6", { [`${OA}?list-type=2&prefix=metadata%2FPMC6.`]: { fail: "offline" } }), seen);
  assert.equal(await reason(F.resolver(get).resolvePdf(pmcid("PMC6"))), "offline");
  assert.equal(seen.length, 1);
});

test("PMID: the ID converter's PMCID goes through the PMC fallbacks; its DOI is the last resort", async () => {
  const conv = n => `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${n}&format=json&tool=faelights`;
  const seen = [];
  const get = fake(pmcRoutes("PMC0007", {
    [conv("7")]: { json: { records: [{ pmcid: "PMC0007", doi: "10.1000/p7" }] } },
    "https://europepmc.org/articles/PMC0007?pdf=render": { pdf: true }
  }), seen);
  assert.equal((await F.resolver(get).resolvePdf({ kind: "pmid", value: "7" })).url, "https://europepmc.org/articles/PMC0007?pdf=render");
  assert.ok(!seen.some(u => u.includes("doi.org")));
  // every PMC source fails → the DOI route, which ends as it always has
  const all = fake(pmcRoutes("PMC0008", {
    [conv("8")]: { json: { records: [{ pmcid: "PMC0008", doi: "10.1000/p8" }] } },
    "https://doi.org/10.1000/p8": { html: "<html>sign in</html>" },
    "https://api.crossref.org/works/10.1000%2Fp8": { json: { message: {} } }
  }));
  assert.equal(await reason(F.resolver(all).resolvePdf({ kind: "pmid", value: "8" })), "paywalled");
  // offline on the way stops there too
  const off = [], o = fake(pmcRoutes("PMC0009", {
    [conv("9")]: { json: { records: [{ pmcid: "PMC0009", doi: "10.1000/p9" }] } },
    "https://europepmc.org/articles/PMC0009?pdf=render": { fail: "offline" }
  }), off);
  assert.equal(await reason(F.resolver(o).resolvePdf({ kind: "pmid", value: "9" })), "offline");
  assert.equal(off.length, 3);
});
