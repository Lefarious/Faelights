"use strict";
// core/topics.js: bookmarks take precedence, font-size headings are the fallback, then wording, then pages;
// extracts are grouped under the topic they fall in.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { repoPath } = require("../helpers/pdf");
const { annotate } = require("../helpers/annotate");
const X = require("../../core/extract.js");
const T = require("../../core/topics.js");

const SAMPLE = repoPath("renderer", "sample.pdf");
const OUTLINE = [
  { title: "Intro", page: 1, y: 800, items: [{ title: "Signals", page: 1, y: 640 }] },
  { title: "Deep sea", page: 2, y: 790 }
];
const byTopic = r => {
  const m = new Map();
  for (const h of X.highlights(r)) { const k = h.topic ? h.topic.join(" > ") : "(none)"; m.set(k, (m.get(k) || 0) + 1); }
  return [...m];
};

let headings, bookmarked;
before(async () => {
  headings = await X.extractPdf(SAMPLE);
  bookmarked = await X.extractPdf(await annotate(SAMPLE, { outline: OUTLINE }));
});

test("without bookmarks, headings come from font size", () => {
  assert.equal(headings.topicSource, "headings");
  assert.deepEqual(headings.topics.map(t => [t.title, t.level, t.page]), [
    ["Notes on Bioluminescence", 1, 1],
    ["1. How the light is made", 2, 1],
    ["2. Why fireflies flash", 2, 1],
    ["3. Light in the deep sea", 2, 2],
    ["4. Uses in the lab", 2, 2]
  ]);
  assert.deepEqual(headings.topics[2].path, ["Notes on Bioluminescence", "2. Why fireflies flash"]);
});

test("extracts are grouped under their heading", () => {
  assert.deepEqual(byTopic(headings), [
    ["Notes on Bioluminescence > 1. How the light is made", 2],
    ["Notes on Bioluminescence > 2. Why fireflies flash", 2],
    ["Notes on Bioluminescence > 3. Light in the deep sea", 3],
    ["Notes on Bioluminescence > 4. Uses in the lab", 1]
  ]);
});

test("bookmarks win over headings, with nesting kept", () => {
  assert.equal(bookmarked.topicSource, "outline");
  assert.deepEqual(bookmarked.topics.map(t => [t.path, t.level, t.page]), [
    [["Intro"], 1, 1],
    [["Intro", "Signals"], 2, 1],
    [["Deep sea"], 1, 2]
  ]);
  // positions map into the text stream at the heading line the destination points at
  assert.deepEqual(bookmarked.topics.map(t => t.at), [0, headings.topics[2].at, headings.topics[3].at]);
  assert.deepEqual(byTopic(bookmarked), [["Intro", 2], ["Intro > Signals", 2], ["Deep sea", 4]]);
});

test("topicAt picks the last topic at or before a position", () => {
  const ts = [{ title: "a", at: 10 }, { title: "b", at: 50 }];
  assert.equal(T.topicAt(ts, 5), null);
  assert.equal(T.topicAt(ts, 9).title, "a");     // one char of slack
  assert.equal(T.topicAt(ts, 49).title, "b");
  assert.equal(T.topicAt(ts, 999).title, "b");
});

// lines + text as extract.js builds them
function stream(rows) {
  let text = "";
  const lines = rows.map(([page, s, size = 10]) => {
    const start = text.length; text += s + "\n\n";
    return { start, end: start + s.length, page, size, y: 700 };
  });
  return { lines, text };
}

test("wording fallback finds numbered and named sections and drops captions and running headers", () => {
  const { lines, text } = stream([
    [1, "Running Header"], [1, "Abstract— we study things"], [1, "1 Introduction"], [1, "Figure 2 Results"],
    [2, "Running Header"], [2, "2.1 Field Methods"], [2, "Conclusion"],
    [3, "Running Header"]
  ]);
  assert.deepEqual(T.patternTopics(lines, text).map(t => [t.title, t.level, t.path]), [
    ["Abstract", 1, ["Abstract"]],
    ["1 Introduction", 1, ["1 Introduction"]],
    ["2.1 Field Methods", 2, ["1 Introduction", "2.1 Field Methods"]],
    ["Conclusion", 1, ["Conclusion"]]
  ]);
});

test("buildTopics falls back to wording, then to one topic per page", async () => {
  const noOutline = { getOutline: async () => null };
  const sizes = n => new Map([[10, n]]);
  const a = stream([[1, "plain text line one"], [1, "METHODS"], [2, "more plain text"], [2, "RESULTS"]]);
  const w = await T.buildTopics(noOutline, a.lines, a.text, sizes(100));
  assert.equal(w.topicSource, "patterns");
  assert.deepEqual(w.topics.map(t => t.title), ["METHODS", "RESULTS"]);
  const b = stream([[1, "plain text"], [2, "more plain text"]]);
  const p = await T.buildTopics(noOutline, b.lines, b.text, sizes(100));
  assert.equal(p.topicSource, "pages");
  assert.deepEqual(p.topics.map(t => t.title), ["Page 1", "Page 2"]);
});
