/* Faelights — reading order of extracts and captured images
   Pure helpers (no DOM, no state): the reader's "With images" view and export both use them.
   An image goes before entry `e` when `img.at <= e.at`, otherwise after (core.js `result.images`). */
"use strict";

const Order = (() => {
  // Same bucketing as app.js `ckey`, so S.off keys match for extracts and images
  const ckey = c => c.map(v => Math.round(v / 24) * 24).join(",");

  // result.images, or [] for results scanned before images existed
  const imagesOf = result => (result && Array.isArray(result.images) ? result.images : []);

  // Images whose colour is not hidden. off: Set of ckey strings (the reader's S.off).
  const filterImages = (images, off) => (images || []).filter(img => !(off && off.has(ckey(img.color))));

  // Entries + images → one list in PDF reading order:
  // [{kind: "entry", entry, topic} | {kind: "image", image, topic}]
  // Entries keep their given order; images are slotted in by `at` (ties go before the entry).
  function withImages(entries, images) {
    const imgs = (images || []).slice().sort((a, b) => a.at - b.at);
    const out = [];
    let i = 0;
    for (const e of entries || []) {
      while (i < imgs.length && imgs[i].at <= e.at) { out.push({ kind: "image", image: imgs[i], topic: imgs[i].topic || null }); i++; }
      out.push({ kind: "entry", entry: e, topic: e.topic || null });
    }
    for (; i < imgs.length; i++) out.push({ kind: "image", image: imgs[i], topic: imgs[i].topic || null });
    return out;
  }

  // Combined list → topic groups, same keys as app.js `groupsOf` (consecutive items with the same topic).
  // A group may hold only images. → [{key, topic, items, entries: n, images: n}]
  function groupItems(items) {
    const gs = [];
    for (const it of items || []) {
      const key = it.topic ? it.topic.at + "|" + it.topic.title : "none";
      let g = gs[gs.length - 1];
      if (!g || g.key !== key) { g = { key, topic: it.topic, items: [], entries: 0, images: 0 }; gs.push(g); }
      g.items.push(it);
      if (it.kind === "image") g.images++; else g.entries++;
    }
    return gs;
  }

  return { ckey, imagesOf, filterImages, withImages, groupItems };
})();

if (typeof module !== "undefined") module.exports = Order;
