"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lookupTarget, fromCrossref, fromArxivAtom } = require("../src/metadata.js");

test("lookupTarget: DOI → CrossRef, arXiv id or arXiv DOI → arXiv, nothing → null", () => {
  assert.deepEqual(lookupTarget({ doi: "10.1038/nature14539" }), { source: "crossref", id: "10.1038/nature14539" });
  assert.deepEqual(lookupTarget({ arxiv: "1706.03762v5" }), { source: "arxiv", id: "1706.03762v5" });
  assert.deepEqual(lookupTarget({ doi: "10.48550/arXiv.1706.03762" }), { source: "arxiv", id: "1706.03762" });
  assert.deepEqual(lookupTarget({ doi: "10.1038/x", arxiv: "1706.03762" }), { source: "crossref", id: "10.1038/x" });
  assert.equal(lookupTarget({}), null);
  assert.equal(lookupTarget(undefined, null), null);
});

test("lookupTarget: where the paper was downloaded from wins over the PDF's own fields", () => {
  assert.deepEqual(lookupTarget({ doi: "10.1/cited" }, { kind: "doi", value: "10.1/real" }), { source: "crossref", id: "10.1/real" });
  assert.deepEqual(lookupTarget({}, { kind: "arxiv", value: "2101.00001" }), { source: "arxiv", id: "2101.00001" });
  assert.deepEqual(lookupTarget({ doi: "10.1/x" }, { kind: "url", value: "https://example.org/a.pdf" }), { source: "crossref", id: "10.1/x" });
});

test("fromCrossref maps a works record", () => {
  const m = fromCrossref({ status: "ok", message: {
    type: "journal-article", title: ["Deep <i>learning</i>"], subtitle: [],
    author: [{ given: "Yann", family: "LeCun" }, { given: "Yoshua", family: "Bengio" }, { name: "Some Consortium" }],
    abstract: "<jats:p>Abstract Deep learning allows &amp; enables…</jats:p>",
    "container-title": ["Nature"], volume: "521", issue: "7553", page: "436-444",
    published: { "date-parts": [[2015, 5, 27]] }, DOI: "10.1038/nature14539",
    ISSN: ["0028-0836", "1476-4687"], publisher: "Springer Science and Business Media LLC",
    URL: "https://doi.org/10.1038/nature14539", subject: ["Multidisciplinary"]
  } });
  assert.deepEqual(m, {
    itemType: "Journal Article", title: "Deep learning", authors: ["Yann LeCun", "Yoshua Bengio", "Some Consortium"],
    abstract: "Deep learning allows & enables…", publication: "Nature", volume: "521", issue: "7553", pages: "436–444",
    date: "2015-05-27", doi: "10.1038/nature14539", issn: "0028-0836, 1476-4687",
    publisher: "Springer Science and Business Media LLC", url: "https://doi.org/10.1038/nature14539", keywords: ["Multidisciplinary"]
  });
});

test("fromCrossref: partial dates, subtitles, unknown types, empty fields dropped", () => {
  const m = fromCrossref({ type: "other", title: ["Main"], subtitle: ["A sub"], issued: { "date-parts": [[2019, 3]] } });
  assert.deepEqual(m, { title: "Main: A sub", date: "2019-03" });
  assert.deepEqual(fromCrossref({}), {});
});

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
  You Need</title>
    <summary>  The dominant sequence transduction models &amp; more.
</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name><arxiv:affiliation>Google</arxiv:affiliation></author>
    <arxiv:doi>10.5555/3295222.3295349</arxiv:doi>
    <arxiv:journal_ref>NeurIPS 2017</arxiv:journal_ref>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

test("fromArxivAtom maps an entry", () => {
  assert.deepEqual(fromArxivAtom(ATOM), {
    itemType: "Preprint", title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer"],
    abstract: "The dominant sequence transduction models & more.", publication: "NeurIPS 2017", date: "2017-06-12",
    doi: "10.5555/3295222.3295349", arxiv: "1706.03762", url: "https://arxiv.org/abs/1706.03762v7", keywords: ["cs.CL", "cs.LG"]
  });
});

test("fromArxivAtom: no entry or the API's error entry → null", () => {
  assert.equal(fromArxivAtom("<feed></feed>"), null);
  assert.equal(fromArxivAtom(`<feed><entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_x</id><title>Error</title></entry></feed>`), null);
  assert.equal(fromArxivAtom(""), null);
});
