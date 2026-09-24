'use strict';

//-------PERSISTENT STORAGE (one IndexedDB database: userdata + traces)-------

// Moved out of minesweeper.js on 2026-08-23 so settings.html opens the
// same database through the same code (upgrade path included) instead of
// duplicating it. All storage moved from localStorage into IndexedDB on
// 2026-08-20. One database holds two stores: 'userdata' (play history,
// settings, rankavg sorts, player states — one entry per kind) and
// 'traces' (see game/input-trace.js). Userdata is
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
const TRACE_BOARD_INDEX = 'boardsByModeAndSize';
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

const dbRequest = indexedDB.open(DB_NAME, 3);
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
  if (event.oldVersion < 3) {
    // Index the source itself: absent final boards have no index entry, and
    // restored/replaced traces update it atomically without skip markers.
    event.target.transaction.objectStore(TRACE_STORE)
      .createIndex(TRACE_BOARD_INDEX, ['mode', 'finalBoard.cells.length']);
  }
};
// The open can complete between this script and the page's own script
// (the open races the network fetch of the later deferred scripts). During
// deferred execution readyState is already "interactive", so the callback's
// existence — not readyState — is the exact signal that the page client has
// finished declaring its startup path. DOMContentLoaded supplies the second
// check when the database wins that race.
let readyAnnounced = false;
let pendingStorageOpenFailure = null;
function maybeAnnounceReady() {
  if (pendingStorageOpenFailure !== null && typeof storageFailure === 'function') {
    const failure = pendingStorageOpenFailure;
    pendingStorageOpenFailure = null;
    storageFailure(failure);
  }
  if (readyAnnounced || db === null || typeof userdataReady !== 'function') return;
  readyAnnounced = true;
  userdataReady();
}

function reportStorageOpenFailure(what) {
  // Open/blocked events can beat the deferred script that owns the visible
  // error surface, just as a successful open can beat userdataReady.
  pendingStorageOpenFailure = what;
  maybeAnnounceReady();
}

dbRequest.onsuccess = (event) => {
  db = event.target.result;
  pendingStorageOpenFailure = null;
  db.onversionchange = () => {
    db.close();
    storageFailure('database changed in another tab; reload this page');
  };
  maybeAnnounceReady();
};
dbRequest.onerror = () => reportStorageOpenFailure('database failed to open: ' + dbRequest.error);
dbRequest.onblocked = () => reportStorageOpenFailure('database update blocked; close other game/settings tabs and reload this page');

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
  // Start committing immediately, including edits followed by navigation.
  tx.commit();
}

// Move the tag preference into the settings record atomically. Historical
// game tags stay on their original game records.
function consolidatePlayerStates(preferences) {
  const tx = db.transaction(USERDATA_STORE, 'readwrite');
  const store = tx.objectStore(USERDATA_STORE);
  store.put(preferences, 'settings');
  store.delete('states');
  tx.onerror = () => storageFailure('player-state preferences move failed: ' + tx.error);
}
