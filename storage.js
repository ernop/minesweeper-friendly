'use strict';

//-------PERSISTENT STORAGE (one IndexedDB database: userdata + traces)-------

// Moved out of minesweeper.js on 2026-08-23 so settings.html opens the
// same database through the same code (upgrade path included) instead of
// duplicating it. All storage moved from localStorage into IndexedDB on
// 2026-08-20. One database holds two stores: 'userdata' (play history,
// settings, rankavg sorts, player states — one entry per kind) and
// 'traces' (see the trace section in minesweeper.js). Userdata is
// RAM-first: each page reads the kinds it needs into RAM once at startup,
// all reads and mutations work on RAM synchronously, and each mutation
// calls persistUserdata — an async fire-and-forget write of that kind's
// whole RAM object. IndexedDB structured-clones the value at put() time,
// so RAM mutations after the call cannot race the write.
//
// Each page defines two globals that this file calls late-bound:
//   userdataReady()      — the database is open; read what you need.
//   storageFailure(what) — announce the failure where the player can see
//                          it, and throw.

const DB_NAME = 'minesweeper-friendly';
const TRACE_STORE = 'traces';
const USERDATA_STORE = 'userdata';
const USERDATA_KINDS = ['history', 'settings', 'rankavgSort', 'states', 'trial'];

let db = null;

// Where each userdata kind lived before 2026-08-20. The version-2 upgrade
// below carries the data over exactly once (the upgrade only ever runs
// once per origin); deletable once every player's origin has upgraded.
const LEGACY_LOCALSTORAGE_KEYS = {
  history: 'minesweeper-friendly.history',
  settings: 'minesweeper-friendly.settings',
  rankavgSort: 'minesweeper-friendly.rankavgSort',
  states: 'minesweeper-friendly.states',
};

const dbRequest = indexedDB.open(DB_NAME, 2);
dbRequest.onupgradeneeded = (event) => {
  const upgraded = event.target.result;
  if (event.oldVersion < 1) upgraded.createObjectStore(TRACE_STORE, { keyPath: 'endedAt' });
  if (event.oldVersion < 2) {
    const store = upgraded.createObjectStore(USERDATA_STORE);
    const moved = [];
    for (const [kind, storageKey] of Object.entries(LEGACY_LOCALSTORAGE_KEYS)) {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) continue;
      store.put(JSON.parse(raw), kind);
      moved.push(storageKey);
    }
    // The old keys disappear only after the carried-over data is committed.
    event.target.transaction.addEventListener('complete', () => {
      for (const storageKey of moved) localStorage.removeItem(storageKey);
    });
  }
};
// The open can complete between this script and the page's own script
// (the open races the network fetch of the later <script> tags), so the
// ready call waits for whichever finishes last: the database or the
// document's scripts.
let readyAnnounced = false;
function maybeAnnounceReady() {
  if (readyAnnounced || db === null || document.readyState === 'loading') return;
  readyAnnounced = true;
  userdataReady();
}

dbRequest.onsuccess = (event) => {
  db = event.target.result;
  maybeAnnounceReady();
};
dbRequest.onerror = () => storageFailure('database failed to open: ' + dbRequest.error);

document.addEventListener('DOMContentLoaded', maybeAnnounceReady);

// Reads every userdata kind and hands them over as one object. An absent
// kind arrives as undefined — a player who never stored it, not an error.
function readAllUserdata(onLoaded) {
  const tx = db.transaction(USERDATA_STORE);
  tx.onerror = () => storageFailure('userdata load failed: ' + tx.error);
  const store = tx.objectStore(USERDATA_STORE);
  const got = {};
  for (const kind of USERDATA_KINDS) {
    const request = store.get(kind);
    request.onsuccess = () => { got[kind] = request.result; };
  }
  tx.oncomplete = () => onLoaded(got);
}

// Persists one userdata kind's RAM object. Fire-and-forget: RAM is already
// current, so nothing waits on the disk write.
function persistUserdata(kind, value) {
  if (db === null) storageFailure(kind + ' not saved: database is not open');
  const tx = db.transaction(USERDATA_STORE, 'readwrite');
  tx.objectStore(USERDATA_STORE).put(value, kind);
  tx.onerror = () => storageFailure(kind + ' save failed: ' + tx.error);
}
