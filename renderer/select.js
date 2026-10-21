"use strict";
/* Multi-select in the PDF list (T-021): pure set maths over the visible doc ids, in list order.
   Global `Select` in the renderer; module.exports for tests. */
const Select = (() => {
  // ids from a to b inclusive, in list order; an anchor not in the list → just b
  function range(ids, a, b) {
    const i = ids.indexOf(a), j = ids.indexOf(b);
    if (j < 0) return [];
    if (i < 0) return [b];
    return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
  }
  // A click on id. st = {sel: Set, anchor}; mods = {toggle (Ctrl/⌘), range (Shift)}; cur = the PDF in the
  // reader, which counts as selected while nothing else is. → {sel, anchor, open}; open = a plain click,
  // which opens the PDF and drops the selection.
  function click(st, ids, id, mods, cur) {
    const base = st.sel.size ? st.sel : new Set(ids.includes(cur) ? [cur] : []);
    if (mods.range) {
      const a = ids.includes(st.anchor) ? st.anchor : ids.includes(cur) ? cur : id;
      const r = range(ids, a, id);
      return { sel: new Set(mods.toggle ? [...base, ...r] : r), anchor: a, open: false };
    }
    if (mods.toggle) {
      const sel = new Set(base);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      return { sel, anchor: id, open: false };
    }
    return { sel: new Set(), anchor: id, open: true };
  }
  // keep only ids still listed; the same Set back when nothing dropped
  function prune(sel, ids) {
    const keep = new Set(ids), out = new Set([...sel].filter(id => keep.has(id)));
    return out.size === sel.size ? sel : out;
  }
  return { range, click, prune };
})();

if (typeof module !== "undefined") module.exports = Select;
