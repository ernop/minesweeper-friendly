'use strict';

// Archive sync off the page thread (docs/product/storage-and-history.md
// "Archive folder"): reads the database directly and writes every record,
// trace, and self-check the chosen folder does not hold yet. A Web Lock
// serializes syncs from every open tab, and each sync lists the folder after
// taking the lock, so a file another tab just wrote is seen.

importScripts('archive-format.js?v=20260926-lifelong');

const ARCHIVE_PROGRESS_EVERY = 25;

// Directory listings outlive a sync, so the sync after one game touches only
// that game's files instead of re-listing years of months. A listing made in
// an earlier sync may miss a file another tab wrote since, so a name absent
// from it is checked on disk. Any failure drops every listing.
let listedFolder = null;
const listings = new Map();  // directory path -> { directory, names, syncNumber }
let syncNumber = 0;

self.onmessage = ({ data }) => {
  if (data.type !== 'sync') throw new Error('archive worker: unknown message ' + data.type);
  navigator.locks.request('minesweeper-friendly-archive-sync', () => syncArchive(data)).then(
    (counts) => postMessage({ type: 'done', counts }),
    (error) => {
      listings.clear();
      postMessage({ type: 'error', name: error.name, message: error.message });
    });
};

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// The page opened the database before starting this worker, so the open
// needs no version. A later upgrade from another tab closes this connection.
async function openDatabase(name) {
  const db = await requestResult(indexedDB.open(name));
  db.onversionchange = () => db.close();
  return db;
}

function readAll(db, store, method, query) {
  return requestResult(db.transaction(store).objectStore(store)[method](query));
}

async function gzipJson(value) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function writeFile(directory, name, blob) {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function directoryNames(directory) {
  const names = new Set();
  for await (const name of directory.keys()) names.add(name);
  return names;
}

async function listingFor(handle, directoryKey) {
  const cached = listings.get(directoryKey);
  if (cached !== undefined) return cached;
  let directory = handle;
  for (const name of directoryKey.split('/')) {
    directory = await directory.getDirectoryHandle(name, { create: true });
  }
  const listing = { directory, names: await directoryNames(directory), syncNumber };
  listings.set(directoryKey, listing);
  return listing;
}

async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') return false;
    throw error;
  }
}

// Inside the lock, a listing made by this sync is complete; an older one is
// confirmed per missing name.
async function archived(listing, name) {
  if (listing.names.has(name)) return true;
  if (listing.syncNumber === syncNumber) return false;
  const exists = await fileExists(listing.directory, name);
  if (exists) listing.names.add(name);
  return exists;
}

async function syncArchive({ handle, database }) {
  syncNumber++;
  if (listedFolder === null || !(await handle.isSameEntry(listedFolder))) {
    listings.clear();
    listedFolder = handle;
  }
  const db = await openDatabase(database.name);
  try {
    // Record keys are [history key, endedAt], so the key names each record's mode.
    const recordKeys = await readAll(db, database.recordStore, 'getAllKeys');
    const records = await readAll(db, database.recordStore, 'getAll');
    const traceKeys = await readAll(db, database.traceStore, 'getAllKeys');
    const selfChecks = await readAll(db, database.selfCheckStore, 'getAll');

    const items = [];
    recordKeys.forEach(([mode], i) => {
      const record = records[i];
      items.push({ kind: 'records', path: archiveRecordPath(mode, record),
        document: async () => archiveRecordDocument(mode, record) });
    });
    for (const endedAt of traceKeys) {
      items.push({ kind: 'traces', path: archiveTracePath(endedAt),
        document: async () => archiveTraceDocument(
          await readAll(db, database.traceStore, 'get', endedAt)) });
    }
    for (const selfCheck of selfChecks) {
      items.push({ kind: 'selfChecks', path: archiveSelfCheckPath(selfCheck.startedAt),
        document: async () => archiveSelfCheckDocument(selfCheck) });
    }

    // A path claimed twice would overwrite one item with another.
    const claimed = new Set();
    for (const item of items) {
      const key = item.path.join('/');
      if (claimed.has(key)) throw new Error('archive: two items map to ' + key);
      claimed.add(key);
    }

    const counts = {
      records: { written: 0, present: 0 },
      traces: { written: 0, present: 0 },
      selfChecks: { written: 0, present: 0 },
    };
    const missing = [];
    for (const item of items) {
      const listing = await listingFor(handle, item.path.slice(0, -1).join('/'));
      if (await archived(listing, item.path.at(-1))) counts[item.kind].present++;
      else missing.push({ item, listing });
    }
    for (let i = 0; i < missing.length; i++) {
      const { item, listing } = missing[i];
      const name = item.path.at(-1);
      await writeFile(listing.directory, name, await gzipJson(await item.document()));
      listing.names.add(name);
      counts[item.kind].written++;
      if ((i + 1) % ARCHIVE_PROGRESS_EVERY === 0) {
        postMessage({ type: 'progress', written: i + 1, total: missing.length });
      }
    }
    if (!(await directoryNames(handle)).has(ARCHIVE_README_NAME)) {
      await writeFile(handle, ARCHIVE_README_NAME, new Blob([ARCHIVE_README_TEXT]));
    }
    return counts;
  } finally {
    db.close();
  }
}
