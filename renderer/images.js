/* Faelights — image captures
   Cuts the region of an image box (a Square annotation, see core.js `result.images`) out of the stored PDF as a PNG.
   Shared by the reader ("With images") and export. Renders without annotations so the box outline and nearby
   highlights don't end up in the picture. Results are cached per doc version; renders run one at a time. */
"use strict";

const Images = (() => {
  const MAX_SIDE = 2400;            // px cap for one crop, whatever the scale
  const IDLE_MS = 30000;            // close a doc's pdf.js handle after this long unused
  const crops = new Map();          // key → Promise<{url, width, height}>
  const docs = new Map();           // docId → {ver, pdf: Promise, timer}
  let queue = Promise.resolve();

  // Changes whenever the stored copy's content can have changed
  const verOf = d => [d.hash, d.annotatedAt || 0, d.scannedMtime || 0].join(":");

  function pdfOf(d) {
    const ver = verOf(d);
    let h = docs.get(d.id);
    if (h && h.ver !== ver) { forget(d.id); h = null; }
    if (!h) {
      h = { ver, timer: 0, pdf: fl.readPdf({ ...d, sourcePath: null })
        .then(({ bytes }) => pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise) };
      h.pdf.catch(() => docs.get(d.id) === h && docs.delete(d.id));
      docs.set(d.id, h);
    }
    clearTimeout(h.timer); h.timer = setTimeout(() => forget(d.id), IDLE_MS);
    return h.pdf;
  }

  async function render(d, img, scale) {
    const pdf = await pdfOf(d);
    const page = await pdf.getPage(img.page);
    let vp = page.getViewport({ scale });
    let [l, t, r, b] = pdfjsLib.Util.normalizeRect(vp.convertToViewportRectangle(img.rect));
    const big = Math.max(r - l, b - t);
    if (big > MAX_SIDE) {           // too large at this scale: shrink to the cap
      vp = page.getViewport({ scale: scale * MAX_SIDE / big });
      [l, t, r, b] = pdfjsLib.Util.normalizeRect(vp.convertToViewportRectangle(img.rect));
    }
    const width = Math.max(1, Math.round(r - l)), height = Math.max(1, Math.round(b - t));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -l, -t],
      annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    return { url: canvas.toDataURL("image/png"), width, height };
  }

  // → Promise<{url: "data:image/png;base64,…", width, height}>. scale 2 ≈ 144 dpi.
  function crop(d, img, scale = 2) {
    const key = [d.id, verOf(d), img.id, img.page, img.rect.join(","), scale].join("|");
    if (!crops.has(key)) {
      const p = queue.then(() => render(d, img, scale));
      queue = p.catch(() => {});
      p.catch(() => crops.delete(key));
      crops.set(key, p);
    }
    return crops.get(key);
  }

  // → Promise<Uint8Array> of the PNG file, for export
  async function png(d, img, scale = 2) {
    const { url } = await crop(d, img, scale);
    const bin = atob(url.slice(url.indexOf(",") + 1)), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Drop a doc's pdf.js handle and cached crops (after removal, rescan or annotation edits)
  function forget(docId) {
    const h = docs.get(docId);
    if (h) { clearTimeout(h.timer); docs.delete(docId); h.pdf.then(p => p.destroy(), () => {}); }
    for (const k of crops.keys()) if (k.startsWith(docId + "|")) crops.delete(k);
  }

  return { crop, png, forget };
})();
