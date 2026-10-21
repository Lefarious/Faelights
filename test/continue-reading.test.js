"use strict";
// Continue reading (T-020): which page the PDF viewer opens at. annotator.js is a browser script, so it runs
// in a vm with just enough stubs (PDFLib, addEventListener) to build the Annot module.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "../renderer/annotator.js"), "utf8");
const ctx = { PDFLib: { PDFName: { of: n => n } }, addEventListener() {} };
vm.createContext(ctx);
vm.runInContext(src + "\nthis.Annot = Annot;", ctx);
const { startPage } = ctx.Annot;

test("an explicit page wins over lastPage", () => {
  assert.equal(startPage({ lastPage: 12 }, 3), 3);
  assert.equal(startPage({ lastPage: 0 }, 7), 7);
});

test("no page → where the reader left off", () => {
  assert.equal(startPage({ lastPage: 12 }), 12);
  assert.equal(startPage({ lastPage: 1 }, undefined), 1);
});

test("never opened (0 or undefined lastPage) → page 1", () => {
  assert.equal(startPage({ lastPage: 0 }), 1);
  assert.equal(startPage({}), 1);
  for (const bad of [-2, 2.5, "4", null]) assert.equal(startPage({ lastPage: bad }), 1);
  for (const bad of [0, -1, 1.5, "3"]) assert.equal(startPage({ lastPage: 5 }, bad), 5);
});
