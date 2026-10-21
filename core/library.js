/* Faelights — libraries on disk (headless core)
   The library file (<userData>/library/faelights.json) holds libraries, docs (with their extraction results), tags,
   stars and settings; stored PDF copies live in <userData>/library/files/.
   Two halves:
   - pure operations on a loaded db (libraries, tags, stars): no I/O, shared with the renderer (global `Library`);
   - Node only (`Library.at(userData)`): load/save with atomic writes and a lock file, and the stored PDF copies.
     The desktop app's main process uses it with app.getPath("userData"); scripts get the same folder from
     userDataDir() (or FAELIGHTS_DATA_DIR). The lock means a script and the open app never interleave writes. */
"use strict";

const Library = (() => {
  const APP_NAME = "Faelights";   // Electron names the userData folder after package.json productName
  const INBOX = "inbox";

  /* ---------------- pure: the db object ---------------- */
  const EMPTY_DB = () => ({
    version: 1,
    libraries: [{ id: INBOX, name: "Inbox", createdAt: Date.now(), system: true }],
    docs: [],
    tagColours: {},
    settings: { mode: "full", fmt: "md", sort: "added" }
  });

  // Fill in what older or hand-edited files may lack: the Inbox, default settings, a docs list, tag colours,
  // and per doc the read flag and the viewer's last page (0 = never opened)
  function normalize(db) {
    if (!db.libraries?.some(l => l.id === INBOX)) db.libraries.unshift(EMPTY_DB().libraries[0]);
    db.settings = { ...EMPTY_DB().settings, ...(db.settings || {}) };
    db.docs = db.docs || [];
    db.tagColours = db.tagColours || {};
    for (const d of db.docs) {
      if (typeof d.read !== "boolean") d.read = false;
      if (!Number.isInteger(d.lastPage) || d.lastPage < 0) d.lastPage = 0;
    }
    return db;
  }

  const findDoc = (db, id) => db.docs.find(d => d.id === id);
  const findLibrary = (db, id) => db.libraries.find(l => l.id === id);
  const docsIn = (db, libId) => db.docs.filter(d => d.libraryId === libId);

  function addLibrary(db, name = "New library") {
    const l = { id: "l" + Date.now().toString(36), name, createdAt: Date.now() };
    db.libraries.push(l);
    return l;
  }
  function renameLibrary(db, id, name) {
    const l = findLibrary(db, id);
    if (l) l.name = name;
    return l || null;
  }
  // Its PDFs move to the Inbox; nothing is lost. The Inbox (system) can't be removed. → removed?
  function removeLibrary(db, id) {
    const l = findLibrary(db, id);
    if (!l || l.system) return false;
    db.docs.forEach(d => { if (d.libraryId === id) d.libraryId = INBOX; });
    db.libraries = db.libraries.filter(x => x.id !== id);
    return true;
  }
  // → changed?
  function moveDoc(d, libId) {
    if (d.libraryId === libId) return false;
    d.libraryId = libId;
    return true;
  }

  // Tags are trimmed, lose a leading "#", and appear once per doc. → the tag added, or "" if nothing changed
  const cleanTag = t => String(t || "").trim().replace(/^#/, "");
  function addTag(d, tag) {
    const v = cleanTag(tag);
    if (!v || d.tags.includes(v)) return "";
    d.tags.push(v);
    return v;
  }
  function removeTag(d, tag) {
    const n = d.tags.length;
    d.tags = d.tags.filter(z => z !== tag);
    return d.tags.length !== n;
  }
  // tag → number of docs with it
  function tagCounts(db) {
    const tags = new Map();
    for (const d of db.docs) for (const t of d.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
    return tags;
  }
  // on omitted → toggle. → the new state
  function setStar(d, on) {
    d.starred = on === undefined ? !d.starred : !!on;
    return d.starred;
  }

  // on omitted → toggle. → the new state
  function setRead(d, on) {
    d.read = on === undefined ? !d.read : !!on;
    return d.read;
  }
  // The page (1-based) the viewer was last on; anything else resets it to 0. → changed?
  function setLastPage(d, page) {
    const p = Number.isInteger(page) && page > 0 ? page : 0;
    if (d.lastPage === p) return false;
    d.lastPage = p;
    return true;
  }
  // Tag colours are "#rrggbb", keyed by tag; an empty or invalid colour clears it. → the colour kept, or ""
  function setTagColour(db, tag, colour) {
    const t = cleanTag(tag);
    db.tagColours = db.tagColours || {};
    const c = /^#[0-9a-f]{6}$/i.test(colour || "") ? colour.toLowerCase() : "";
    if (!t) return "";
    if (c) db.tagColours[t] = c; else delete db.tagColours[t];
    return c;
  }
  const tagColour = (db, tag) => (db.tagColours && db.tagColours[tag]) || "";

  // Search highlights: every word must appear in the sentence, a highlight, its note or the topic path
  const searchTerms = q => String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  function entryMatches(e, terms) {
    const hay = (e.sentence + " " + e.spans.map(s => s.text + " " + s.comment).join(" ") + " " + (e.topic ? e.topic.path.join(" ") : "")).toLowerCase();
    return terms.every(t => hay.includes(t));
  }

  /* ---------------- Node: files ---------------- */
  const LOCK_WAIT_MS = 10000;     // give up waiting for the other process after this long
  const LOCK_STALE_MS = 30000;    // a lock older than this was left by a crashed process
  const RENAME_TRIES = 8;         // Windows can briefly refuse a rename while a scanner has the file open

  const node = () => ({ fs: require("fs"), fsp: require("fs").promises, path: require("path"), os: require("os"), crypto: require("crypto") });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // The folder Electron's app.getPath("userData") gives the desktop app, unless FAELIGHTS_DATA_DIR is set
  function userDataDir(env = process.env, platform = process.platform, home) {
    const { path, os } = node();
    if (env.FAELIGHTS_DATA_DIR) return path.resolve(env.FAELIGHTS_DATA_DIR);
    const P = platform === "win32" ? path.win32 : path.posix;
    home = home || os.homedir();
    if (platform === "win32") return P.join(env.APPDATA || P.join(home, "AppData", "Roaming"), APP_NAME);
    if (platform === "darwin") return P.join(home, "Library", "Application Support", APP_NAME);
    return P.join(env.XDG_CONFIG_HOME || P.join(home, ".config"), APP_NAME);
  }

  // A library rooted at a userData folder (default: userDataDir()). One per folder per process, so writes queue up.
  const stores = new Map();
  function at(userData) {
    const { path } = node();
    userData = path.resolve(userData || userDataDir());
    if (!stores.has(userData)) stores.set(userData, makeStore(userData));
    return stores.get(userData);
  }

  function makeStore(userData) {
    const { fs, fsp, path, crypto } = node();
    const dir = path.join(userData, "library");
    const paths = { userData, dir, db: path.join(dir, "faelights.json"), files: path.join(dir, "files"), lock: path.join(dir, "faelights.json.lock"),
      session: path.join(dir, "faelights.app") };
    const statOrNull = async p => { try { return await fsp.stat(p); } catch (_) { return null; } };

    // strict: throw on an unreadable file instead of starting empty (used before writing back)
    async function readDb(strict) {
      try {
        return normalize(JSON.parse(await fsp.readFile(paths.db, "utf8")));
      } catch (e) {
        if (e.code === "ENOENT") return EMPTY_DB();
        // keep a copy of an unreadable file instead of overwriting it
        try { await fsp.copyFile(paths.db, paths.db + ".broken-" + Date.now()); } catch (_) {}
        if (strict) throw e;
        return EMPTY_DB();
      }
    }
    const loadDb = () => readDb(false);

    // Exclusive lock file next to the library (created with O_EXCL). Waits while another process holds it,
    // up to opts.wait ms (0: fail at once with ELOCKED).
    async function withLock(fn, opts = {}) {
      await fsp.mkdir(dir, { recursive: true });
      const deadline = Date.now() + (opts.wait ?? LOCK_WAIT_MS);
      for (;;) {
        try {
          const h = await fsp.open(paths.lock, "wx");
          try { await h.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() })); } finally { await h.close(); }
          break;
        } catch (e) {
          // Windows answers EPERM while the other process's lock file is still being deleted
          if (!["EEXIST", "EPERM", "EACCES"].includes(e.code)) throw e;
          const st = await statOrNull(paths.lock);
          if (st && Date.now() - st.mtimeMs > LOCK_STALE_MS) { await fsp.unlink(paths.lock).catch(() => {}); continue; }
          if (Date.now() > deadline) throw Object.assign(new Error("The library is locked by another process: " + paths.lock), { code: "ELOCKED" });
          await sleep(20 + Math.random() * 30);
        }
      }
      try { return await fn(); } finally { await fsp.unlink(paths.lock).catch(() => {}); }
    }

    // Write a file atomically: a temp file beside it, then rename over it
    async function writeAtomic(file, data) {
      const tmp = file + "." + process.pid + "-" + crypto.randomBytes(4).toString("hex") + ".tmp";
      await fsp.writeFile(tmp, data);
      for (let i = 0; ; i++) {
        try { await fsp.rename(tmp, file); return; } catch (e) {
          if (i >= RENAME_TRIES || !["EPERM", "EACCES", "EBUSY"].includes(e.code)) { await fsp.unlink(tmp).catch(() => {}); throw e; }
          await sleep(15 * (i + 1));
        }
      }
    }

    // Saves and updates from this process run one at a time
    let queue = Promise.resolve();
    const enqueue = job => { const run = queue.then(job); queue = run.catch(() => {}); return run; };
    const write = db => writeAtomic(paths.db, JSON.stringify(db));

    // Replace the library file with db (what the desktop app does with its in-memory copy)
    const saveDb = db => enqueue(() => withLock(() => write(db)));
    // Read, change and write back under one lock (for scripts): fn(db) may be async; its return value is passed on
    const update = (fn, opts) => enqueue(() => withLock(async () => {
      const db = await readDb(true);
      const out = await fn(db);
      await write(db);
      return out;
    }, opts));

    /* ---- the desktop app's session marker ----
       The app keeps the library in memory and writes all of it back on every save, so a change another process makes
       while it is open is lost at its next save. The app marks the folder while it runs; scripts can refuse to write. */
    const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
    function openSession() {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(paths.session, JSON.stringify({ pid: process.pid, at: Date.now() }));
    }
    function closeSession() {
      try { if (JSON.parse(fs.readFileSync(paths.session, "utf8")).pid === process.pid) fs.unlinkSync(paths.session); } catch (_) {}
    }
    // → {pid, at} while the app is running on this folder, else null (a marker left by a crash is ignored)
    function appSession() {
      let s;
      try { s = JSON.parse(fs.readFileSync(paths.session, "utf8")); } catch (_) { return null; }
      return s && Number.isInteger(s.pid) && s.pid !== process.pid && alive(s.pid) ? s : null;
    }

    // Flag docs whose source PDF changed or went missing since the last scan
    async function checkSources(db) {
      await Promise.all(db.docs.map(async d => {
        const st = d.sourcePath ? await statOrNull(d.sourcePath) : null;
        d.sourceMissing = !!d.sourcePath && !st;
        // annotated docs live on in the library copy, so edits to the original no longer apply
        d.stale = !d.annotated && !!st && st.mtimeMs > (d.scannedMtime || 0) + 1000;
      }));
      return db;
    }

    /* ---- stored PDF copies ---- */
    const isStored = p => !!p && path.dirname(p) === paths.files;

    // Copy a PDF into the library folder → {id, hash, fileName, sourcePath, storedPath, mtime, size}
    async function importPdf(srcPath) {
      const st = await fsp.stat(srcPath);
      const buf = await fsp.readFile(srcPath);
      const hash = crypto.createHash("sha1").update(buf).digest("hex");
      const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await fsp.mkdir(paths.files, { recursive: true });
      const stored = path.join(paths.files, id + ".pdf");
      await fsp.writeFile(stored, buf);
      return { id, hash, fileName: path.basename(srcPath), sourcePath: srcPath, storedPath: stored, mtime: st.mtimeMs, size: st.size };
    }

    // Read the freshest copy: the original if it still exists, otherwise the stored copy.
    // When the original is newer, refresh the stored copy too. Docs annotated in the app always read the stored copy.
    async function readPdf(doc) {
      const src = doc.sourcePath && !doc.annotated ? await statOrNull(doc.sourcePath) : null;
      if (src) {
        const buf = await fsp.readFile(doc.sourcePath);
        if (src.mtimeMs > (doc.scannedMtime || 0) + 1000 && doc.storedPath) { try { await fsp.writeFile(doc.storedPath, buf); } catch (_) {} }
        return { bytes: new Uint8Array(buf), mtime: src.mtimeMs, from: "source" };
      }
      const buf = await fsp.readFile(doc.storedPath);
      return { bytes: new Uint8Array(buf), mtime: doc.scannedMtime || 0, from: "copy" };
    }

    // The original if it's still there, else the library's copy (for opening / revealing)
    const pdfPath = doc => doc.sourcePath && fs.existsSync(doc.sourcePath) ? doc.sourcePath : doc.storedPath;

    // Annotated bytes only ever replace the library's copy, never the user's original. → written?
    let pdfWrites = Promise.resolve();
    function writeStored(storedPath, bytes) {
      if (!isStored(storedPath) || !(bytes instanceof Uint8Array)) return Promise.resolve(false);
      const job = pdfWrites.then(async () => { await writeAtomic(storedPath, bytes); return true; });
      pdfWrites = job.catch(err => { console.error("pdf write failed", err); return false; });
      return pdfWrites;
    }
    async function removeStored(storedPath) {
      if (isStored(storedPath)) { try { await fsp.unlink(storedPath); } catch (_) {} }
      return true;
    }

    return { paths, loadDb, saveDb, update, withLock, openSession, closeSession, appSession, checkSources, isStored, importPdf, readPdf, pdfPath, writeStored, removeStored };
  }

  return { APP_NAME, INBOX, EMPTY_DB, normalize, findDoc, findLibrary, docsIn, addLibrary, renameLibrary, removeLibrary, moveDoc,
    cleanTag, addTag, removeTag, tagCounts, setStar, setRead, setLastPage, setTagColour, tagColour, searchTerms, entryMatches, userDataDir, at };
})();

if (typeof module !== "undefined") module.exports = Library;
