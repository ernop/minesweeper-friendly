'use strict';

// History backup: export and import of history and traces, and the
// data-format reference card.

//-------BACKUP (export / import of the play history)-------

const importPanel = document.getElementById('import-panel');
const importText = document.getElementById('import-text');
const importFileInput = document.getElementById('import-file-input');
const exportFileLink = document.getElementById('export-file');

document.getElementById('export-btn').addEventListener('click', () => {
  const games = cleanTransferredHistory(history);
  const json = JSON.stringify(games.history);
  const cleanup = [];
  if (games.skippedRecords > 0) cleanup.push('omitted ' + games.skippedRecords + ' malformed games');
  if (games.skippedLists > 0) cleanup.push('omitted ' + games.skippedLists + ' malformed lists');
  if (games.repairedFields > 0) {
    cleanup.push('discarded ' + games.repairedFields
      + ' invalid fields');
  }
  const status = 'export copied to clipboard (' + games.gameCount + ' games)'
    + (cleanup.length > 0 ? '; ' + cleanup.join(', ') : '');
  navigator.clipboard.writeText(json).then(
    () => { backupStatus.textContent = status; },
    (err) => { backupStatus.textContent = 'clipboard copy failed: ' + err.message; },
  );
  if (exportFileLink.href) URL.revokeObjectURL(exportFileLink.href);
  exportFileLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  exportFileLink.download = 'minesweeper-friendly-history-' + new Date().toISOString().slice(0, 10) + '.json';
  exportFileLink.hidden = false;
});

// Traces export as a JSON array of per-game trace objects (typed arrays
// converted back to plain arrays), download-only — traces are far too
// large for the clipboard. Consumed by the offline analysis pipelines
// (see analysis/ and docs/implementation/offline-analysis.md).
const exportTracesLink = document.getElementById('export-traces-file');

document.getElementById('export-traces-btn').addEventListener('click', () => {
  if (db === null) storageFailure('trace export failed: database is not open');
  const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).getAll();
  request.onerror = () => storageFailure('trace export failed: ' + request.error);
  request.onsuccess = () => {
    const games = request.result.map((s) => ({
      ...s,
      sampleT: Array.from(s.sampleT),
      sampleX: Array.from(s.sampleX),
      sampleY: Array.from(s.sampleY),
    }));
    const json = JSON.stringify(games);
    if (exportTracesLink.href) URL.revokeObjectURL(exportTracesLink.href);
    exportTracesLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    exportTracesLink.download = 'minesweeper-friendly-traces-' + new Date().toISOString().slice(0, 10) + '.json';
    exportTracesLink.hidden = false;
    backupStatus.textContent = games.length + ' traces ready (' + (json.length / 1048576).toFixed(1) + ' MB)';
  };
});

// Merges an exported history into the stored one. endedAt identifies a
// record within a mode (one player cannot finish two games of the same mode
// in the same millisecond), so re-importing the same blob is a no-op. The
// reserved "settings" key in older combined exports is ignored; importing
// game history never changes personal preferences. Malformed optional fields are discarded and malformed
// records or lists are skipped, so one damaged item never prevents the rest
// of a backup from being recovered.
function importHistory(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    backupStatus.textContent = 'import failed: ' + err.message;
    return;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    backupStatus.textContent = 'import failed: the export is not an object';
    return;
  }
  const transfer = cleanTransferredHistory(parsed);
  const incoming = transfer.history;
  let added = 0;
  let dups = 0;
  for (const [mode, list] of Object.entries(incoming)) {
    if (!(mode in history)) history[mode] = [];
    const seen = new Set(history[mode].map((r) => r.endedAt));
    for (const r of list) {
      if (seen.has(r.endedAt)) {
        dups += 1;
        continue;
      }
      seen.add(r.endedAt);
      history[mode].push(r);
      added += 1;
    }
    // Merged-in records restore the chronological-order invariant.
    history[mode].sort((a, b) => a.endedAt - b.endedAt);
  }
  persistUserdata('history', history);
  const skipped = [];
  if (transfer.skippedRecords > 0) skipped.push(transfer.skippedRecords + ' malformed games');
  if (transfer.skippedLists > 0) skipped.push(transfer.skippedLists + ' malformed lists');
  if (transfer.repairedFields > 0) {
    skipped.push(transfer.repairedFields + ' invalid fields');
  }
  backupStatus.textContent = 'imported ' + added + ' new games, skipped ' + dups + ' duplicates'
    + (skipped.length > 0 ? ', ' + skipped.join(', ') : '');
  importPanel.hidden = true;
  importText.value = '';
  rememberPanel('importHistory', false);
  rememberPreference('drafts', { ...settings.drafts, historyImport: '' });
}

document.getElementById('import-btn').addEventListener('click', () => {
  importPanel.hidden = !importPanel.hidden;
  rememberPanel('importHistory', !importPanel.hidden);
});

document.getElementById('import-apply').addEventListener('click', () => importHistory(importText.value));

document.getElementById('import-open').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (file) file.text().then(importHistory);
  importFileInput.value = '';
});

const formatPanel = document.getElementById('format-panel');

document.getElementById('format-btn').addEventListener('click', () => {
  formatPanel.hidden = !formatPanel.hidden;
  rememberPanel('dataFormat', !formatPanel.hidden);
});

//-------DATA FORMAT CARD (the record and preference schemas as a reference)-------

// The data-format reference card, generated from both schemas and
// DIFFICULTIES so it always matches what the code writes and accepts.
function buildFormatPanel() {
  const block = (headingText) => {
    const div = document.createElement('div');
    div.className = 'format-block';
    const heading = document.createElement('h4');
    heading.textContent = headingText;
    div.appendChild(heading);
    formatPanel.appendChild(div);
    return div;
  };

  const exportBlock = block('the whole export');
  const beginnerKey = modeKeyOf(DIFFICULTIES.beginner, 'standard');
  const intermediateKey = modeKeyOf(DIFFICULTIES.intermediate, 'standard');
  const keyColumn = (key) => ('"' + key + '":').padEnd(intermediateKey.length + 4);
  const pre = document.createElement('pre');
  pre.textContent = '{\n  ' + keyColumn(beginnerKey) + '[ \u2026one record per finished game\u2026 ],\n  '
    + keyColumn(intermediateKey) + '[ \u2026 ]\n}';
  const namedModes = Object.entries(DIFFICULTIES)
    .map(([name, d]) => boardKeyOf(d) + ' = ' + difficultyDisplayName(name))
    .join(', ');
  const exportNote = document.createElement('p');
  exportNote.textContent = 'One list per board and play mode, keyed by width\u00d7height/mines@mode ('
    + namedModes + '; modes: ' + PLAY_MODES.map((m) => m.id).join(', ')
    + '). Keys without @ are Standard. Records sit in play order, wins and losses alike. '
    + 'Personal preferences have separate export and import controls on the Settings page.';
  exportBlock.append(pre, exportNote);

  const settingsBlock = block('separate preferences file: field, default, meaning');
  settingsBlock.classList.add('settings-format-block');
  const settingsTable = document.createElement('table');
  for (const setting of SETTINGS_SCHEMA) {
    const row = document.createElement('tr');
    for (const text of [setting.field, JSON.stringify(setting.default, null, 2), setting.describe]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    settingsTable.appendChild(row);
  }
  settingsBlock.appendChild(settingsTable);

  const recordBlock = block('each game record');
  const table = document.createElement('table');
  const storedFields = GAME_RECORD_SCHEMA.filter((field) => !field.legacy);
  for (const f of storedFields) {
    const row = document.createElement('tr');
    for (const text of [f.field, f.example, f.describe]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  const recordNote = document.createElement('p');
  recordNote.textContent = 'Only these ' + storedFields.length + ' measurements are stored. '
    + 'Everything else on the win screen (3BV/s, clicks over 3BV, efficiency, correctness, '
    + 'throughput, IOS, mouse speed, path per click, path per 3BV, every rank and chart) is '
    + 'recomputed from them at display time.';
  recordBlock.append(table, recordNote);
}
