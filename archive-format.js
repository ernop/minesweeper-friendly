'use strict';

// The archive folder's layout and file formats, pure
// (docs/product/storage-and-history.md "Archive folder"). Shared by
// archive-worker.js and tests/archive-format-test.js; no DOM, no storage.

const ARCHIVE_FORMAT_VERSION = 1;
const ARCHIVE_README_NAME = 'README.txt';

// UTC year and month, so an item's path never depends on the reader's zone.
function archiveMonthDirectories(epochMs) {
  const iso = new Date(epochMs).toISOString();
  return [iso.slice(0, 4), iso.slice(5, 7)];
}

// Board keys contain / @ + ( ) , = and file names keep [A-Za-z0-9._-]. Every
// other character, the underscore included, becomes _ plus four hex digits,
// so distinct keys can never share a file name.
function archiveNameSlug(text) {
  return text.replace(/[^A-Za-z0-9.-]/g,
    (character) => '_' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

// History allows one game per mode per millisecond; the mode in the name keeps
// records of different modes apart. A trace is keyed by endedAt alone, like
// its store.
function archiveRecordPath(mode, record) {
  return ['games', ...archiveMonthDirectories(record.endedAt),
    record.endedAt + '-' + archiveNameSlug(mode) + '.json.gz'];
}

function archiveTracePath(endedAt) {
  return ['traces', ...archiveMonthDirectories(endedAt), endedAt + '.json.gz'];
}

function archiveSelfCheckPath(startedAt) {
  return ['self-checks', ...archiveMonthDirectories(startedAt), startedAt + '.json.gz'];
}

function archiveRecordDocument(mode, record) {
  return { format: 'minesweeper-friendly-game-record', formatVersion: ARCHIVE_FORMAT_VERSION, mode, record };
}

// JSON has no typed arrays; plain numbers keep every sample value exactly.
function archiveTraceDocument(trace) {
  const plain = {};
  for (const [key, value] of Object.entries(trace)) {
    plain[key] = ArrayBuffer.isView(value) ? Array.from(value) : value;
  }
  return { format: 'minesweeper-friendly-trace', formatVersion: ARCHIVE_FORMAT_VERSION, trace: plain };
}

function archiveSelfCheckDocument(selfCheck) {
  return { format: 'minesweeper-friendly-self-check', formatVersion: ARCHIVE_FORMAT_VERSION, selfCheck };
}

const ARCHIVE_README_TEXT = [
  'minesweeper-friendly archive, format version ' + ARCHIVE_FORMAT_VERSION,
  '',
  'The minesweeper-friendly game (https://github.com/ernop/minesweeper-friendly)',
  'writes this folder automatically, into a folder its player chose. Every item',
  'file is gzip-compressed UTF-8 JSON; read one with',
  '  zcat FILE | python3 -m json.tool',
  'The game writes each file once and never changes or deletes it.',
  '',
  'Layout (YYYY/MM is the UTC year and month of the item):',
  '  games/YYYY/MM/<endedAt>-<mode>.json.gz   one finished game\'s record',
  '  traces/YYYY/MM/<endedAt>.json.gz         that game\'s raw input trace',
  '  self-checks/YYYY/MM/<startedAt>.json.gz  one self-check',
  '<endedAt> and <startedAt> are Unix epoch milliseconds; a record and its trace',
  'share endedAt. In a file name, every character of the board key <mode> outside',
  'A-Z a-z 0-9 . - is written as _ plus its four-digit hexadecimal code; the exact',
  'key is inside the file.',
  '',
  'Each file holds an object with "format", "formatVersion", and the item:',
  '  minesweeper-friendly-game-record  { mode, record }',
  '  minesweeper-friendly-trace        { trace }  typed arrays as plain number arrays',
  '  minesweeper-friendly-self-check   { selfCheck }',
  '',
  'Field meanings are specified in the repository: docs/product/per-game-stats.md',
  'and docs/product/storage-and-history.md for records and traces, and',
  'docs/product/self-check.md for self-checks. Values the game derives when it',
  'displays them (rates, ranks, charts) are not stored; recompute them from these',
  'files. A record is archived as it was first written; measurements the game adds',
  'to it later are recomputable from the trace and the board seed.',
  '',
].join('\n');
