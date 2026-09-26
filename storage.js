'use strict';

//-------PERSISTENT STORAGE (one IndexedDB database: userdata, records, traces, self-checks)-------

// Moved out of minesweeper.js on 2026-08-23 so settings.html opens the
// same database through the same code (upgrade path included) instead of
// duplicating it. All storage moved from localStorage into IndexedDB on
// 2026-08-20. One database holds four stores: 'userdata' (settings,
// rankavg sorts, player states, trial — one entry per kind), 'records'
// (one entry per finished game, keyed [history key, endedAt]; since
// 2026-09-26), 'traces' (see game/input-trace.js), and 'selfChecks' (one
// record per self-check, see self-check-page.js; since 2026-09-26).
// Userdata and records are RAM-first: each page reads what it needs into
// RAM once at startup,
// all reads and mutations work on RAM synchronously, and each mutation
// calls persistUserdata or persistGameRecord — an async fire-and-forget
// write of that kind's RAM object or of that one game record. IndexedDB
// structured-clones the value at put() time, so RAM mutations after the
// call cannot race the write.
//
// Each page defines two globals that this file calls late-bound:
//   userdataReady()      — the database is open; read what you need.
//   storageFailure(what) — announce the failure where the player can see
//                          it, and throw.

const DB_NAME = 'minesweeper-friendly';
const TRACE_STORE = 'traces';
const TRACE_BOARD_INDEX = 'boardsByModeAndSize';
const USERDATA_STORE = 'userdata';
const USERDATA_KINDS = ['settings', 'rankavgSort', 'states', 'trial'];
const RECORD_STORE = 'records';
// Self-checks accumulate for decades, so each is its own record rather than
// part of one userdata value rewritten on every save.
const SELF_CHECK_STORE = 'selfChecks';

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

const dbRequest = indexedDB.open(DB_NAME, 5);
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
  // Version 4 shipped twice on 2026-09-26 with different contents: the public
  // build moved history into 'records', and the local player origin's build
  // added 'selfChecks'. Version 5 completes whichever of the two a database
  // lacks, so every database ends with both, whichever path it took.
  if (event.oldVersion < 5) {
    if (!upgraded.objectStoreNames.contains(RECORD_STORE)) {
      // The whole history was one userdata value, so every finished game
      // rewrote all of it (160 MB of structured clone for 6,400 games). Each
      // record moves to its own key, in stored order; the first of two
      // records sharing a key is kept, as history normalization always did.
      const records = upgraded.createObjectStore(RECORD_STORE);
      const userdata = event.target.transaction.objectStore(USERDATA_STORE);
      const stored = userdata.get('history');
      stored.onsuccess = () => {
        if (stored.result === undefined) return;
        for (const [historyKey, list] of Object.entries(stored.result)) {
          const seen = new Set();
          for (const record of list) {
            if (seen.has(record.endedAt)) continue;
            seen.add(record.endedAt);
            records.add(record, [historyKey, record.endedAt]);
          }
        }
        userdata.delete('history');
      };
    }
    if (!upgraded.objectStoreNames.contains(SELF_CHECK_STORE)) {
      upgraded.createObjectStore(SELF_CHECK_STORE, { keyPath: 'startedAt' });
    }
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
  // Browsers may evict a site's storage under disk pressure unless it is
  // persistent. The browser decides (Chrome from site engagement, Firefox by
  // asking); the settings page shows the answer.
  navigator.storage.persist().catch((error) => storageFailure('persistent storage request failed: ' + error.message));
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

// Reads every saved game record into the RAM history shape: history key to
// records in play order. Keys sort by history key and then endedAt, so each
// list arrives chronological.
function readGameRecords(onLoaded) {
  const tx = db.transaction(RECORD_STORE);
  tx.onerror = () => storageFailure('game history load failed: ' + tx.error);
  const store = tx.objectStore(RECORD_STORE);
  const keys = store.getAllKeys();
  const records = store.getAll();
  tx.oncomplete = () => {
    const history = {};
    keys.result.forEach(([historyKey], i) => {
      if (!Object.hasOwn(history, historyKey)) history[historyKey] = [];
      history[historyKey].push(records.result[i]);
    });
    onLoaded(history);
  };
}

// Persists finished-game records, each [history key, record]; a later call
// for the same game replaces its stored copy. Fire-and-forget like
// persistUserdata, and only these records are cloned.
function persistGameRecords(entries) {
  if (db === null) storageFailure('game record not saved: database is not open');
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  const store = tx.objectStore(RECORD_STORE);
  for (const [historyKey, record] of entries) store.put(record, [historyKey, record.endedAt]);
  tx.onerror = () => storageFailure('game record save failed: ' + tx.error);
  tx.commit();
}

function persistGameRecord(historyKey, record) {
  persistGameRecords([[historyKey, record]]);
}

// Applies load-time normalization in one transaction: deletes entries it
// moved off legacy keys ([history key, endedAt]) and puts the records it
// changed. Clearing and rewriting the whole store instead would erase any
// game another open tab saved between this page's read and its rewrite.
function persistGameRecordChanges(writes, deletions) {
  if (db === null) storageFailure('game history not saved: database is not open');
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  const store = tx.objectStore(RECORD_STORE);
  for (const [historyKey, endedAt] of deletions) store.delete([historyKey, endedAt]);
  for (const [historyKey, record] of writes) store.put(record, [historyKey, record.endedAt]);
  tx.onerror = () => storageFailure('game history save failed: ' + tx.error);
  tx.commit();
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
