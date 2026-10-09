"use strict";
// Faelights — validation for files an export writes (pure; required by main.js and tests).
// The renderer names every exported file; nothing it sends may escape the folder the user picked.
const path = require("path");

const MAX_ASSET_BYTES = 500 * 1024 * 1024;   // total binary payload of one export
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const BAD_CHARS = /[<>:"|?*\u0000-\u001f]/;

// Why a relative export path is unsafe, or "" if it is fine. Accepts "/" or "\" as separators.
function pathProblem(rel) {
  if (typeof rel !== "string" || !rel) return "empty path";
  if (rel.length > 240) return "path too long";
  if (BAD_CHARS.test(rel)) return "invalid character";           // also catches drive letters ("C:")
  if (/^[\\/]/.test(rel) || path.isAbsolute(rel) || path.win32.isAbsolute(rel) || path.posix.isAbsolute(rel)) return "absolute path";
  for (const seg of rel.split(/[\\/]/)) {
    if (!seg) return "empty segment";
    if (seg === "." || seg === "..") return "relative segment";
    if (/[. ]$/.test(seg)) return "segment ends with a dot or space";
    if (RESERVED.test(seg)) return "reserved name";
  }
  return "";
}

// Absolute target for `rel` under `dir`, or throws if it is unsafe or would land outside `dir`
function resolveInside(dir, rel) {
  const why = pathProblem(rel);
  if (why) throw new Error(`Unsafe export path "${rel}": ${why}`);
  const root = path.resolve(dir), abs = path.resolve(root, rel);
  if (!abs.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) throw new Error(`Unsafe export path "${rel}": outside the export folder`);
  return abs;
}

// Validate a whole set of {path, bytes}; returns [{abs, bytes}] or throws (the export is rejected as a whole)
function planAssets(dir, assets, max = MAX_ASSET_BYTES) {
  if (assets == null) return [];
  if (!Array.isArray(assets)) throw new Error("Invalid export assets");
  let total = 0;
  const seen = new Set();
  return assets.map(a => {
    if (!a || !(a.bytes instanceof Uint8Array)) throw new Error("Invalid export asset");
    total += a.bytes.byteLength;
    if (total > max) throw new Error("Export is too large");
    const abs = resolveInside(dir, a.path);
    const k = abs.toLowerCase();
    if (seen.has(k)) throw new Error(`Duplicate export path "${a.path}"`);
    seen.add(k);
    return { abs, bytes: a.bytes };
  });
}

// Markdown link form of one path segment (matches renderer/exportfmt.js mdLink)
const mdSeg = s => encodeURIComponent(s).replace(/[()']/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// Single-file exports name their images folder after the file the user picked: "<base> images".
// The renderer writes `token` wherever that folder name goes; it is replaced here once the name is known.
function imagesDirFor(filePath) { return path.parse(filePath).name + " images"; }
function fillToken(s, token, value) { return token ? String(s).split(token).join(value) : String(s); }
function isToken(t) { return typeof t === "string" && /^[A-Za-z0-9]{12,64}$/.test(t); }

module.exports = { MAX_ASSET_BYTES, pathProblem, resolveInside, planAssets, mdSeg, imagesDirFor, fillToken, isToken };
