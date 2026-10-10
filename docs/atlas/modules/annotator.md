# Module: annotator
> Path: renderer/annotator.js · Last synced commit: 43721ca · Related features: F-007, F-015, F-022

## Purpose
The in-app PDF viewer and annotator. It renders a doc's pages with pdf.js (canvas + selectable text layer), and writes real PDF annotations (Highlight, Underline, StrikeOut, Text notes, Ink, Square image boxes) into the bytes with pdf-lib. Each edit is saved straight to the library's stored copy. It does not extract highlights itself: when it closes after changes, it calls `rescan()` from renderer-ui, which runs extraction-core.

## Public interface
The global `Annot` (an IIFE that returns these):
- `open(d, page?)` opens the viewer for doc `d`, optionally at a 1-based page. If `d` is already open it jumps to that page.
- `close({discard?}) → Promise` tears down the UI and resolves once queued edits and disk writes have finished. Unless `discard` is set and the session changed anything, it then runs `rescan(d)` + `renderAll()`.
- `mount(r)` re-attaches the live viewer root into `#reader`, restoring its scroll position.
- `key(e) → boolean` handles keys while open; `true` means app.js must skip its own shortcuts.
- `isOpen()`, `docId()`

## Dependencies
- **Uses:** pdf-lib (`PDFLib` global: `PDFDocument`, `PDFName`, `PDFString`, `PDFHexString`, `PDFArray`, `PDFDict`, `PDFRef`, `PDFNumber`); pdfjs-dist (`getDocument`, `renderTextLayer`, `AnnotationMode`, `Util`); extraction-core `normQuads` (hit-testing); renderer-ui globals `el`, `svg`, `btn`, `toast`, `copyText`, `plural`, `safeName`, `save`, `S`, `rescan`, `renderAll`, `renderReader`; preload-bridge `fl.readPdf`, `fl.writeStored`, `fl.savePdfAs`
- **Used by:** renderer-ui (`renderReader`, `annotate`, `openDoc`, `removeDoc`, `useOriginal`, window keydown)

## Data & state owned
- `A` (in memory, one session): `d`, `bytes` (current PDF bytes), `pdf` (pdf.js doc for those bytes), `libP` (promise of the pdf-lib doc, `null` after undo/redo), `readOnly` (reason string), `scale`, `fit`, `slots[]` (per page: `vp1` scale-1 viewport, `el`, `canvas`, `text`, `over`, `annots` cache, `drawn` key), `pageVer[]`, `undo[]`/`redo[]` (`{bytes, pages}`, max 40), `tool`, `sel`, `queue` (serial edit chain), `writing` (serial disk-write chain), `changed`, `wasAnnotated`
- Writes doc fields `annotated` (boolean) and `annotatedAt`, and the setting `S.db.settings.annotColor` (`[r,g,b]` in 0–1)
- Writes `userData/library/files/<docId>.pdf` through `fl.writeStored`

## Files

### `renderer/annotator.js`
- **Role:** viewer UI, page rendering, selection → quads, pdf-lib writing, undo/redo, popovers
- **Exports:** global `Annot`
- **Key internals:** `appearance(sub, geo)` / `setAppearance` (builds `/AP /N` form XObjects; Highlight uses `/BM /Multiply`), `addAnnot`, `deleteAnnot` (also drops `/Popup` and the AP stream), `recolorAnnot` (rewrites `/C` and regenerates the AP), `setNote` (sets `/Contents`, drops `/RC`), `refOf(id)` (pdf.js id `"12R"` → `PDFRef`), `edit(pages, fn)` → `swap(a, bytes, pages)` → `persist(a)`, `history()`, `drawPage`/`undraw` (IntersectionObserver, ±900 px), `loadAnnots`, `drawOverlay`, `selectionByPage` + `quadsFor` (text-node rects → merged lines → PDF quads in Acrobat order TL,TR,BL,BR), `markSelection`, `startInk`, `startBox` (Capture image tool `I`: drag → border-only `Square` with `/C`, `/BS /W 1.5` (`BOX_W`), `/CA 1`, `/Subj (Image)`, no `/IC`; AP is a stroked rect inset by half the border), `pickAt` (a Square is picked only within 6 CSS px of its border, or anywhere inside while the Capture tool is active), `selectionPop`/`annotPop`/`noteEditor`
- **Side effects:** a window capture `pointerdown` listener that closes `.pv-pop`; a `ResizeObserver` on the scroller (fit-width); `pointermove/up` listeners while drawing
- **Change impact:** quad geometry must keep covering `baseline + 0.35·size`, the point extraction-core hit-tests, or new marks won't be extracted. `SUBTYPE` names must stay inside core.js `MARK_TYPES` to become extracts (Ink and Text aren't extracted). Class names are string-coupled to `styles.css` (`.pv*`, and to `tour.js` viewer steps: `.pv-seg`, `.pv-swatches`, `.pv-page-box`, `.pv-zoom`, plus `data-tour` hooks `pv-back` (← Highlights) and `pv-dl` (Download PDF); `.textLayer`, `.pv-boxdraw`, `.pv-selbox.box`). Squares become `result.images` in core.js; their `/Rect` is what `images.js` crops.

## Gotchas
- It must load **before** `app.js` (`index.html`): `boot()` can resume between script tags and call `renderReader`, which references `Annot`. It only touches app.js globals at call time.
- Every edit re-serialises the whole PDF with pdf-lib and reloads it into pdf.js. Only pages listed in the edit are redrawn; the other canvases stay valid because only annotations changed. The text layer is rebuilt only when the scale changes.
- A render that fails because `swap()` destroyed the old pdf.js doc restarts on the new one (`drawPage` catch).
- Renders use `AnnotationMode.ENABLE` with no `annotationCanvasMap`, so own-canvas annotations (Text, Ink) paint on the main canvas. Text notes with no appearance get a `.pv-noteicon` overlay instead.
- Annotations that are inline dicts (pdf.js ids not of the form `<num>R`) can be selected but not edited.
- If pdf-lib can't load the file (encrypted or malformed), the session is read-only: viewing and copying still work, and editing tools are disabled.
- The popover's `mousedown` is `preventDefault`ed (except in its textarea) so clicking its buttons keeps the text selection.
- `persist()` resets `d.annotated` to its value at open time once the undo stack is empty again.
- `RECOLOR` includes `Square`; `recolorAnnot` regenerates its outline using the stored `/BS /W` (default `BOX_W`).
- Among overlapping annotations the smallest area wins a pick, so a highlight inside a box beats the box border.
