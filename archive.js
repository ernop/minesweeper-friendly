'use strict';

// The archive folder, page side (docs/product/storage-and-history.md
// "Archive folder"): the chosen folder's handle, stored as userdata kind
// 'archive', its write permission, and syncs run by archive-worker.js, which
// does all reading and writing. Shared by the game, settings, and self-check
// pages; each page renders the status its own way.

const ARCHIVE_USERDATA_KIND = 'archive';

const archiveState = {
  folder: null,       // { handle, chosenAt } once chosen
  status: 'loading',  // loading | not-chosen | needs-permission | syncing | up-to-date | error
  detail: '',         // progress, the last counts, or the error message
  worker: null,
  running: false,
  syncAgain: false,
  suspended: false,
  render: null,
};

function archiveCanChooseFolder() {
  return typeof window.showDirectoryPicker === 'function';
}

function setArchiveStatus(status, detail) {
  archiveState.status = status;
  archiveState.detail = detail;
  archiveState.render();
}

function archiveFolderName() {
  const name = archiveState.folder.handle.name;
  return name === '' ? 'the chosen folder' : '"' + name + '"';
}

// Full-sentence status for any page. Counts cover everything the folder
// holds after the last sync, new files included.
function archiveStatusText() {
  const detail = archiveState.detail;
  switch (archiveState.status) {
    case 'loading': return 'Checking the archive folder.';
    case 'not-chosen': return archiveCanChooseFolder()
      ? 'No archive folder chosen.'
      : 'No archive folder chosen, and this browser cannot write to folders.';
    case 'needs-permission': return 'Paused: the browser needs your permission to write to '
      + archiveFolderName() + (detail === '' ? '.' : ' (' + detail + ').');
    case 'syncing': return 'Writing to ' + archiveFolderName() + (detail === '' ? '.' : ': ' + detail + '.');
    case 'up-to-date': return 'Up to date in ' + archiveFolderName() + ': ' + detail + '.';
    case 'error': return 'Archive failed: ' + detail;
  }
  throw new Error('unknown archive status ' + archiveState.status);
}

function describeArchiveCounts(counts) {
  const amount = (entry, singular, plural) => {
    const total = entry.written + entry.present;
    return total + ' ' + (total === 1 ? singular : plural);
  };
  const written = counts.records.written + counts.traces.written + counts.selfChecks.written;
  return amount(counts.records, 'game record', 'game records') + ', '
    + amount(counts.traces, 'trace', 'traces') + ', '
    + amount(counts.selfChecks, 'self-check', 'self-checks') + ' (' + written + ' newly archived)';
}

// render(state) is called on every status change. The page must have opened
// the database: the stored folder is read from userdata.
function loadArchive(render) {
  archiveState.render = render;
  const request = db.transaction(USERDATA_STORE).objectStore(USERDATA_STORE).get(ARCHIVE_USERDATA_KIND);
  request.onerror = () => storageFailure('archive folder failed to load: ' + request.error);
  request.onsuccess = () => {
    archiveState.folder = request.result === undefined ? null : request.result;
    if (archiveState.folder === null) {
      setArchiveStatus('not-chosen', '');
      return;
    }
    archiveState.folder.handle.queryPermission({ mode: 'readwrite' }).then((permission) => {
      if (permission === 'granted') runArchiveSync();
      else setArchiveStatus('needs-permission', '');
    }, showArchiveError);
  };
}

function showArchiveError(error) {
  setArchiveStatus('error', error.name + ': ' + error.message);
}

// New data was saved: archive it if writing is allowed now. A paused archive
// keeps everything in the database and catches up when resumed.
function requestArchiveSync() {
  const status = archiveState.status;
  if (status === 'syncing' || status === 'up-to-date' || status === 'error') runArchiveSync();
}

// A request during a running sync queues exactly one more, which picks up
// anything saved meanwhile. A suspended archive (a timed test is running)
// starts nothing until released.
function runArchiveSync() {
  if (archiveState.running || archiveState.suspended) {
    archiveState.syncAgain = true;
    return;
  }
  archiveState.running = true;
  setArchiveStatus('syncing', '');
  if (archiveState.worker === null) {
    archiveState.worker = new Worker('archive-worker.js?v=20260926-lifelong');
    archiveState.worker.onmessage = onArchiveWorkerMessage;
    archiveState.worker.onerror = (event) => {
      event.preventDefault();
      archiveState.worker.terminate();
      archiveState.worker = null;
      archiveState.running = false;
      setArchiveStatus('error', 'archive worker: ' + event.message);
    };
  }
  archiveState.worker.postMessage({
    type: 'sync',
    handle: archiveState.folder.handle,
    database: { name: DB_NAME, recordStore: RECORD_STORE, traceStore: TRACE_STORE,
      selfCheckStore: SELF_CHECK_STORE },
  });
}

function onArchiveWorkerMessage({ data }) {
  if (data.type === 'progress') {
    setArchiveStatus('syncing', data.written + ' of ' + data.total + ' new files written');
    return;
  }
  archiveState.running = false;
  if (data.type === 'done') setArchiveStatus('up-to-date', describeArchiveCounts(data.counts));
  else if (data.name === 'NotAllowedError') setArchiveStatus('needs-permission', '');
  else showArchiveError(data);
  if (archiveState.syncAgain) {
    archiveState.syncAgain = false;
    requestArchiveSync();
  }
}

// Called from a click: the picker needs a user gesture. Cancelling the picker
// leaves the archive as it was.
function chooseArchiveFolder() {
  window.showDirectoryPicker({ id: 'minesweeper-friendly-archive', mode: 'readwrite' }).then(
    useArchiveFolder,
    (error) => {
      if (error.name !== 'AbortError') showArchiveError(error);
    });
}

function useArchiveFolder(handle) {
  archiveState.folder = { handle, chosenAt: Date.now() };
  persistUserdata(ARCHIVE_USERDATA_KIND, archiveState.folder);
  runArchiveSync();
}

// While a frozen timed test runs, no archive work may share the machine: a
// running sync stops (each file is written atomically, so nothing is left
// half-written) and restarts on release, listing the folder afresh.
function suspendArchiveSync() {
  archiveState.suspended = true;
  if (!archiveState.running) return;
  archiveState.worker.terminate();
  archiveState.worker = null;
  archiveState.running = false;
  archiveState.syncAgain = true;
}

function releaseArchiveSync() {
  archiveState.suspended = false;
  if (!archiveState.syncAgain) return;
  archiveState.syncAgain = false;
  runArchiveSync();
}

// Called from a click: a permission request needs a user gesture.
function resumeArchive() {
  archiveState.folder.handle.requestPermission({ mode: 'readwrite' }).then((permission) => {
    if (permission === 'granted') runArchiveSync();
    else setArchiveStatus('needs-permission', 'permission was not granted');
  }, showArchiveError);
}
