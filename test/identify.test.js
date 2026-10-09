"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseIdentifier: parse, describe, findPdfLink, isPdf, fileNameFor, fetchFailureReason } = require("../src/identify.js");

const kv = t => { const r = parse(t); return r && [r.kind, r.value]; };

test("bare DOIs", () => {
  assert.deepEqual(kv("10.1145/3292500.3330701"), ["doi", "10.1145/3292500.3330701"]);
  assert.deepEqual(kv("10.48550/arXiv.1706.03762"), ["doi", "10.48550/arXiv.1706.03762"]);
  assert.deepEqual(kv("10.1016/S0140-6736(20)30183-5"), ["doi", "10.1016/S0140-6736(20)30183-5"]);
  assert.deepEqual(kv("10.1002/(SICI)1097-4636(199706)35:4<419::AID-JBM2>3.0.CO;2-I"), ["doi", "10.1002/(SICI)1097-4636(199706)35:4<419::AID-JBM2>3.0.CO;2-I"]);
  assert.equal(parse("10.1038/nature14539").url, "https://doi.org/10.1038/nature14539");
});

test("doi: prefix", () => {
  assert.deepEqual(kv("doi:10.1038/nature14539"), ["doi", "10.1038/nature14539"]);
  assert.deepEqual(kv("DOI: 10.1038/nature14539"), ["doi", "10.1038/nature14539"]);
  assert.equal(parse("doi:not-a-doi"), null);
});

test("doi.org and dx.doi.org links", () => {
  assert.deepEqual(kv("https://doi.org/10.1038/nature14539"), ["doi", "10.1038/nature14539"]);
  assert.deepEqual(kv("http://dx.doi.org/10.1038/nature14539"), ["doi", "10.1038/nature14539"]);
  assert.deepEqual(kv("doi.org/10.1038/nature14539"), ["doi", "10.1038/nature14539"]);
  assert.deepEqual(kv("https://doi.org/10.1016/S0140-6736%2820%2930183-5"), ["doi", "10.1016/S0140-6736(20)30183-5"]);
  assert.equal(parse("https://doi.org/"), null);
});

test("arXiv new-style ids", () => {
  assert.deepEqual(kv("2401.01234"), ["arxiv", "2401.01234"]);
  assert.deepEqual(kv("2401.01234v2"), ["arxiv", "2401.01234v2"]);
  assert.deepEqual(kv("1706.03762"), ["arxiv", "1706.03762"]);
  assert.deepEqual(kv("0704.0001"), ["arxiv", "0704.0001"]);
  assert.equal(parse("1706.03762").url, "https://arxiv.org/abs/1706.03762");
});

test("arXiv old-style ids", () => {
  assert.deepEqual(kv("hep-th/9901001"), ["arxiv", "hep-th/9901001"]);
  assert.deepEqual(kv("math.GT/0309136"), ["arxiv", "math.GT/0309136"]);
  assert.deepEqual(kv("hep-th/9901001v3"), ["arxiv", "hep-th/9901001v3"]);
});

test("arXiv: prefix", () => {
  assert.deepEqual(kv("arXiv:1706.03762"), ["arxiv", "1706.03762"]);
  assert.deepEqual(kv("arxiv: 2401.01234v2"), ["arxiv", "2401.01234v2"]);
  assert.deepEqual(kv("arXiv:hep-th/9901001"), ["arxiv", "hep-th/9901001"]);
  assert.equal(parse("arXiv:banana"), null);
});

test("arxiv.org abs and pdf links", () => {
  assert.deepEqual(kv("https://arxiv.org/abs/1706.03762"), ["arxiv", "1706.03762"]);
  assert.deepEqual(kv("https://arxiv.org/abs/1706.03762v5"), ["arxiv", "1706.03762v5"]);
  assert.deepEqual(kv("https://arxiv.org/pdf/1706.03762"), ["arxiv", "1706.03762"]);
  assert.deepEqual(kv("https://arxiv.org/pdf/1706.03762v7.pdf"), ["arxiv", "1706.03762v7"]);
  assert.deepEqual(kv("http://www.arxiv.org/abs/hep-th/9901001"), ["arxiv", "hep-th/9901001"]);
  assert.deepEqual(kv("arxiv.org/abs/2401.01234"), ["arxiv", "2401.01234"]);
  assert.deepEqual(kv("https://export.arxiv.org/abs/2401.01234"), ["arxiv", "2401.01234"]);
  // other arxiv pages are plain links
  assert.deepEqual(kv("https://arxiv.org/list/cs.CL/recent"), ["url", "https://arxiv.org/list/cs.CL/recent"]);
});

test("PubMed Central ids", () => {
  assert.deepEqual(kv("PMC7096724"), ["pmcid", "PMC7096724"]);
  assert.deepEqual(kv("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7096724/"), ["pmcid", "PMC7096724"]);
});

test("other http(s) links", () => {
  assert.deepEqual(kv("https://example.com/papers/a.pdf"), ["url", "https://example.com/papers/a.pdf"]);
  assert.deepEqual(kv("http://example.org/x?id=1&y=2"), ["url", "http://example.org/x?id=1&y=2"]);
  assert.deepEqual(kv("www.example.com/paper.pdf"), ["url", "https://www.example.com/paper.pdf"]);
  assert.deepEqual(kv("HTTPS://Example.com/A.pdf"), ["url", "https://example.com/A.pdf"]);
  assert.equal(parse("https://example.com/a.pdf").url, "https://example.com/a.pdf");
});

test("trims whitespace, wrappers and trailing punctuation", () => {
  assert.deepEqual(kv("  10.1038/nature14539.\n"), ["doi", "10.1038/nature14539"]);
  assert.deepEqual(kv("(10.1038/nature14539),"), ["doi", "10.1038/nature14539"]);
  assert.deepEqual(kv("“arXiv:1706.03762”;"), ["arxiv", "1706.03762"]);
  assert.deepEqual(kv("<https://example.com/a.pdf>"), ["url", "https://example.com/a.pdf"]);
  assert.deepEqual(kv("https://example.com/a.pdf)."), ["url", "https://example.com/a.pdf"]);
  assert.deepEqual(kv("https://en.wikipedia.org/wiki/Foo_(bar)"), ["url", "https://en.wikipedia.org/wiki/Foo_(bar)"]);
  assert.deepEqual(kv("1706.03762!"), ["arxiv", "1706.03762"]);
});

test("rejects other schemes and garbage", () => {
  for (const t of ["file:///C:/papers/a.pdf", "javascript:alert(1)", "data:application/pdf;base64,JVBERi0=", "ftp://example.com/a.pdf",
    "mailto:a@b.com", "about:blank", "chrome://settings", "C:\\papers\\a.pdf", "vbscript:msgbox", "https://user:pw@example.com/a.pdf",
    "http://localhost/a.pdf", "", "   ", "hello world", "banana", "12345", "10.1038", "10.1/x", "1706.037", "1706.123456","see 10.1038/nature14539 here",
    null, undefined, 42, "x".repeat(3000)])
    assert.equal(parse(t), null, JSON.stringify(t));
});

test("describe", () => {
  assert.equal(describe(parse("10.1145/3292500.3330701")), "DOI 10.1145/3292500.3330701");
  assert.equal(describe(parse("2401.01234")), "arXiv 2401.01234");
  assert.equal(describe(parse("https://www.example.com/a.pdf")), "Link · example.com");
  assert.equal(describe(null), "");
});

test("findPdfLink: citation_pdf_url, attribute order, relative urls, entities", () => {
  const base = "https://pub.example.com/doi/abs/10.1/x";
  assert.equal(findPdfLink('<head><meta name="citation_pdf_url" content="https://pub.example.com/x.pdf"></head>', base).pdf, "https://pub.example.com/x.pdf");
  assert.equal(findPdfLink("<META CONTENT='/doi/pdf/10.1/x?a=1&amp;b=2' NAME='citation_pdf_url'/>", base).pdf, "https://pub.example.com/doi/pdf/10.1/x?a=1&b=2");
  assert.equal(findPdfLink('<meta name="citation_pdf_url" content="pdf/x.pdf">', base).pdf, "https://pub.example.com/doi/abs/10.1/pdf/x.pdf");
  assert.equal(findPdfLink('<meta name="citation_pdf_url" content="javascript:alert(1)">', base).pdf, null);
  assert.equal(findPdfLink('<meta name="citation_title" content="x">', base).pdf, null);
  assert.equal(findPdfLink('<meta name="citation_title" content="Attention Is  All &amp; You Need"><meta name="citation_pdf_url" content="/pdf/1">', base).title, "Attention Is All & You Need");
  assert.equal(findPdfLink('<meta http-equiv="refresh" content="0; url=\'/next\'">', base).refresh, "https://pub.example.com/next");
});

test("isPdf checks magic bytes", () => {
  assert.equal(isPdf(Buffer.from("%PDF-1.7\n...")), true);
  assert.equal(isPdf(new Uint8Array(Buffer.from("\n\n%PDF-1.4"))), true);
  assert.equal(isPdf(Buffer.from("<!doctype html><html>")), false);
  assert.equal(isPdf(Buffer.alloc(0)), false);
  assert.equal(isPdf(Buffer.concat([Buffer.alloc(2000), Buffer.from("%PDF-")])), false);
});

test("fileNameFor", () => {
  assert.equal(fileNameFor(parse("1706.03762")), "arXiv_1706.03762.pdf");
  assert.equal(fileNameFor(parse("hep-th/9901001")), "arXiv_hep-th_9901001.pdf");
  assert.equal(fileNameFor(parse("10.1038/nature14539")), "10.1038_nature14539.pdf");
  assert.equal(fileNameFor(parse("https://example.com/papers/My%20Paper.pdf")), "My_Paper.pdf");
  assert.equal(fileNameFor(parse("https://example.com/")), "example.com.pdf");
});

test("fetchFailureReason maps connection errors to offline", () => {
  for (const m of ["net::ERR_INTERNET_DISCONNECTED", "net::ERR_NAME_NOT_RESOLVED", "net::ERR_NAME_RESOLUTION_FAILED", "net::ERR_ADDRESS_UNREACHABLE",
    "net::ERR_CONNECTION_REFUSED", "net::ERR_PROXY_CONNECTION_FAILED", "getaddrinfo ENOTFOUND arxiv.org", "connect ECONNREFUSED 1.2.3.4:443"])
    assert.equal(fetchFailureReason(new Error(m)), "offline", m);
  assert.equal(fetchFailureReason(Object.assign(new Error("fetch failed"), { cause: { code: "EAI_AGAIN" } })), "offline");
  assert.equal(fetchFailureReason({ code: "ENETUNREACH" }), "offline");
  for (const m of ["net::ERR_CONNECTION_RESET", "net::ERR_TIMED_OUT", "net::ERR_CERT_AUTHORITY_INVALID", "This operation was aborted", "boom"])
    assert.equal(fetchFailureReason(new Error(m)), "network", m);
  assert.equal(fetchFailureReason(null), "network");
});

const { parseIdentifiers } = require("../src/identify.js");

test("ISBN-10 and ISBN-13, normalised to ISBN-13", () => {
  for (const t of ["9780141439518", "978-0-14-143951-8", "978 0 14 143951 8", "ISBN 978-0-14-143951-8", "ISBN-13: 9780141439518", "isbn:9780141439518", "0141439513", "0-14-143951-3", "ISBN-10: 0 14 143951 3"])
    assert.deepEqual(kv(t), ["isbn", "9780141439518"], t);
  assert.deepEqual(kv("080442957X"), ["isbn", "9780804429573"]);
  assert.deepEqual(kv("0-8044-2957-x"), ["isbn", "9780804429573"]);
  assert.deepEqual(kv("979-10-90636-07-1"), ["isbn", "9791090636071"]);
  assert.equal(parse("9780141439518").url, "https://openlibrary.org/isbn/9780141439518");
  for (const t of ["9780141439519", "0141439514", "030640615X", "ISBN 12345", "9771234567898", "ISBN 978-0-14-143951-9"])
    assert.equal(parse(t), null, t);
});

test("PMIDs", () => {
  assert.deepEqual(kv("PMID: 31452104"), ["pmid", "31452104"]);
  assert.deepEqual(kv("pmid:123"), ["pmid", "123"]);
  assert.deepEqual(kv("PMID 31452104"), ["pmid", "31452104"]);
  assert.deepEqual(kv("31452104"), ["pmid", "31452104"]);
  assert.deepEqual(kv("https://pubmed.ncbi.nlm.nih.gov/31452104/"), ["pmid", "31452104"]);
  assert.deepEqual(kv("pubmed.ncbi.nlm.nih.gov/31452104"), ["pmid", "31452104"]);
  assert.deepEqual(kv("https://www.ncbi.nlm.nih.gov/pubmed/31452104"), ["pmid", "31452104"]);
  assert.equal(parse("PMID: 31452104").url, "https://pubmed.ncbi.nlm.nih.gov/31452104/");
  for (const t of ["PMID: 123456789", "pmid:abc", "PMID: 0"]) assert.equal(parse(t), null, t);
});

test("bare digits: PMID unless a valid ISBN", () => {
  assert.equal(parse("31452104").kind, "pmid");
  assert.equal(parse("0141439513").kind, "isbn");   // 10 digits, valid ISBN-10
  assert.equal(parse("1234567890"), null);          // 10 digits, bad checksum, too long for a PMID
});

test("ADS bibcodes and links", () => {
  for (const b of ["2019ApJ...882L..12P", "2020arXiv200112345A", "1998AJ....116.1009R", "2016PhRvL.116f1102A", "2003A&A...397..913M"])
    assert.deepEqual(kv(b), ["ads", b], b);
  assert.deepEqual(kv("bibcode:2016PhRvL.116f1102A"), ["ads", "2016PhRvL.116f1102A"]);
  assert.deepEqual(kv("2019ApJ...882L..12P."), ["ads", "2019ApJ...882L..12P"]);   // sentence full stop
  assert.deepEqual(kv("2019AAS...23310701."), ["ads", "2019AAS...23310701."]);     // padding dot is part of it
  assert.deepEqual(kv("(2019AAS...23310701.)"), ["ads", "2019AAS...23310701."]);
  assert.deepEqual(kv("https://ui.adsabs.harvard.edu/abs/2019ApJ...882L..12P/abstract"), ["ads", "2019ApJ...882L..12P"]);
  assert.deepEqual(kv("https://ui.adsabs.harvard.edu/abs/2003A%26A...397..913M/abstract"), ["ads", "2003A&A...397..913M"]);
  assert.deepEqual(kv("http://adsabs.harvard.edu/abs/1998AJ....116.1009R"), ["ads", "1998AJ....116.1009R"]);
  assert.deepEqual(kv("ui.adsabs.harvard.edu/abs/2016PhRvL.116f1102A"), ["ads", "2016PhRvL.116f1102A"]);
  assert.equal(parse("2019ApJ...882L..12P").url, "https://ui.adsabs.harvard.edu/abs/2019ApJ...882L..12P/abstract");
  assert.equal(parse("bibcode:2019ApJ"), null);
  assert.deepEqual(kv("https://ui.adsabs.harvard.edu/search/q=x"), ["url", "https://ui.adsabs.harvard.edu/search/q=x"]);
});

test("describe and fileNameFor new kinds", () => {
  assert.equal(describe(parse("978-0-14-143951-8")), "ISBN 9780141439518");
  assert.equal(describe(parse("PMID: 123")), "PMID 123");
  assert.equal(describe(parse("2019ApJ...882L..12P")), "ADS 2019ApJ...882L..12P");
  assert.equal(fileNameFor(parse("PMID: 123")), "PMID_123.pdf");
  assert.equal(fileNameFor(parse("9780141439518")), "ISBN_9780141439518.pdf");
});

test("parseIdentifiers splits batch input", () => {
  const texts = t => parseIdentifiers(t).map(x => x.text);
  const kinds = t => parseIdentifiers(t).map(x => x.id && x.id.kind);
  assert.deepEqual(texts("10.1038/nature12373\n2101.00001\r\nPMID 31452104"), ["10.1038/nature12373", "2101.00001", "PMID 31452104"]);
  assert.deepEqual(texts("10.1038/nature12373, 2101.00001; PMC7096724,"), ["10.1038/nature12373", "2101.00001", "PMC7096724"]);
  assert.deepEqual(texts("10.1038/a 10.1038/b\t2101.00001"), ["10.1038/a", "10.1038/b", "2101.00001"]);
  // commas inside a DOI or URL are not separators
  assert.deepEqual(texts("10.1002/(SICI)1097-4636(199706)35:4<419::AID-JBM2>3.0.CO;2-I, 10.1/x"), ["10.1002/(SICI)1097-4636(199706)35:4<419::AID-JBM2>3.0.CO;2-I", "10.1/x"]);
  assert.deepEqual(texts("https://example.com/a,b,c.pdf, https://example.com/d"), ["https://example.com/a,b,c.pdf", "https://example.com/d"]);
  // prefix pairs stay whole
  assert.deepEqual(texts("doi: 10.1038/nature12373 PMID: 1, arXiv: 1706.03762"), ["doi: 10.1038/nature12373", "PMID: 1", "arXiv: 1706.03762"]);
  assert.deepEqual(kinds("doi: 10.1038/nature12373 PMID: 1"), ["doi", "pmid"]);
  assert.deepEqual(texts("ISBN 978 0 14 143951 8"), ["ISBN 978 0 14 143951 8"]);
  // unrecognised items are kept with id null; exact duplicates dropped
  assert.deepEqual(parseIdentifiers("banana\n10.1038/x\n10.1038/x, banana").map(x => [x.text, !!x.id]), [["banana", false], ["10.1038/x", true]]);
  assert.deepEqual(parseIdentifiers("  \n\n"), []);
  assert.deepEqual(parseIdentifiers(null), []);
});
