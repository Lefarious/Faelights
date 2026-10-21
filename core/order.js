/* Faelights — reading order of extracts and captured images (headless core)
   Pure helpers (no DOM, no state): the reader's "With images" view and export both use them.
   An image goes before entry `e` when `img.at <= e.at`, otherwise after (extract.js `result.images`).
   Clips (highlights over no text, extract.js `result.loose` with a rect) travel the same way as images, tagged `clip: true`. */
"use strict";

const Order = (() => {
  // Colour bucket: the reader's S.off keys (app.js uses this one), shared by extracts and images
  const ckey = c => c.map(v => Math.round(v / 24) * 24).join(",");

  // result.images, or [] for results scanned before images existed
  const imagesOf = result => (result && Array.isArray(result.images) ? result.images : []);

  // Loose marks with a usable rect, as image clips; loose marks without one (or from scans before clips) are only
  // mentioned by page (looseOf)
  const looseList = result => (result && Array.isArray(result.loose) ? result.loose : []);
  const clipsOf = result => looseList(result).filter(l => Array.isArray(l.rect)).map(l => ({ ...l, clip: true }));
  const looseOf = result => looseList(result).filter(l => !Array.isArray(l.rect));
  // What sits among the extracts: clips always (they are highlights), image boxes when `boxes` is set
  const figuresOf = (result, boxes) => (boxes ? imagesOf(result) : []).concat(clipsOf(result));

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

  // Combined list → topic groups (consecutive items with the same topic); export.js `groupsOf` is this.
  // A group may hold only images. clips are counted apart from images. → [{key, topic, items, entries: n, images: n, clips: n}]
  function groupItems(items) {
    const gs = [];
    for (const it of items || []) {
      const key = it.topic ? it.topic.at + "|" + it.topic.title : "none";
      let g = gs[gs.length - 1];
      if (!g || g.key !== key) { g = { key, topic: it.topic, items: [], entries: 0, images: 0, clips: 0 }; gs.push(g); }
      g.items.push(it);
      // reader items wrap the image ({kind, image}); export items are the image itself, tagged kind: "image"
      if (it.kind !== "image") g.entries++; else if ((it.image || it).clip) g.clips++; else g.images++;
    }
    return gs;
  }

  // The doc fields the list shows: count (marks incl. loose) and up to 6 colours (extracts first, then clips, then images)
  function summary(result) {
    const colours = new Map();
    for (const e of result.entries) for (const s of e.spans) colours.set(ckey(s.color), s.color);
    for (const img of [...clipsOf(result), ...imagesOf(result)]) if (!colours.has(ckey(img.color))) colours.set(ckey(img.color), img.color);
    return { count: result.entries.reduce((n, e) => n + e.spans.length, 0) + result.loose.length, colours: [...colours.values()].slice(0, 6) };
  }

  return { ckey, imagesOf, clipsOf, looseOf, figuresOf, filterImages, withImages, groupItems, summary };
})();

if (typeof module !== "undefined") module.exports = Order;
