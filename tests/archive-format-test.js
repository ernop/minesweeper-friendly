'use strict';

// Archive folder layout and file formats (archive-format.js): UTC month paths,
// collision-free safe file names, exact trace values, and the README.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'archive-format.js'), 'utf8'));

let checks = 0;
function check(name, fn) {
  try {
    fn();
  } catch (error) {
    error.message = name + ': ' + error.message;
    throw error;
  }
  checks++;
}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

check('months come from UTC, not the local zone', () => {
  assert.deepEqual(archiveMonthDirectories(Date.UTC(2026, 8, 30, 23, 59, 59, 999)), ['2026', '09']);
  assert.deepEqual(archiveMonthDirectories(Date.UTC(2026, 9, 1)), ['2026', '10']);
});

check('board keys become safe, distinct file names', () => {
  assert.equal(archiveNameSlug('9x9/10@standard'), '9x9_002f10_0040standard');
  const keys = ['a/b', 'a@b', 'a_b', 'a_002fb', '30x16/99@standard+pink-noise(alpha=1,scale=8,contrast=2)'];
  const slugs = keys.map(archiveNameSlug);
  assert.equal(new Set(slugs).size, keys.length);
  for (const slug of slugs) assert.match(slug, SAFE_NAME);
});

check('paths', () => {
  const endedAt = Date.UTC(2026, 8, 26, 20, 5);
  assert.deepEqual(archiveRecordPath('9x9/10@standard', { endedAt }),
    ['games', '2026', '09', endedAt + '-9x9_002f10_0040standard.json.gz']);
  assert.deepEqual(archiveTracePath(endedAt), ['traces', '2026', '09', endedAt + '.json.gz']);
  assert.deepEqual(archiveSelfCheckPath(endedAt), ['self-checks', '2026', '09', endedAt + '.json.gz']);
  for (const part of archiveRecordPath('30x16/99@angelic+pink-noise(alpha=1)', { endedAt })) {
    assert.match(part, SAFE_NAME);
  }
  assert.deepEqual(archiveProblemItemPath('problemAttempts', endedAt), ['problem-attempts', '2026', '09', endedAt + '.json.gz']);
  assert.deepEqual(archiveProblemItemPath('pointingRuns', endedAt), ['pointing-runs', '2026', '09', endedAt + '.json.gz']);
  assert.deepEqual(archiveProblemItemPath('drillAttempts', endedAt), ['drill-attempts', '2026', '09', endedAt + '.json.gz']);
});

check('trace samples survive JSON exactly', () => {
  const trace = {
    endedAt: 5,
    sampleT: Float64Array.from([0.1, 16.7000001, 33.4]),
    sampleX: Float32Array.from([0.1, 101.3, -2.75]),
    sampleTrusted: Uint8Array.from([1, 0, 1]),
    events: [{ kind: 'ldown', t: 1 }],
  };
  const document = JSON.parse(JSON.stringify(archiveTraceDocument(trace)));
  assert.equal(document.format, 'minesweeper-friendly-trace');
  assert.equal(document.formatVersion, 1);
  assert.deepEqual(document.trace.events, trace.events);
  assert.deepEqual(Float64Array.from(document.trace.sampleT), trace.sampleT);
  assert.deepEqual(Float32Array.from(document.trace.sampleX), trace.sampleX);
  assert.deepEqual(document.trace.sampleTrusted, [1, 0, 1]);
});

check('documents name their format', () => {
  assert.deepEqual(archiveRecordDocument('9x9/10@standard', { endedAt: 1 }), {
    format: 'minesweeper-friendly-game-record', formatVersion: 1,
    mode: '9x9/10@standard', record: { endedAt: 1 } });
  assert.deepEqual(archiveSelfCheckDocument({ startedAt: 2 }), {
    format: 'minesweeper-friendly-self-check', formatVersion: 1, selfCheck: { startedAt: 2 } });
  assert.deepEqual(archiveProblemItemDocument('problemAttempts', { startedAt: 3 }), {
    format: 'minesweeper-problems-attempt', formatVersion: 1, attempt: { startedAt: 3 } });
  assert.deepEqual(archiveProblemItemDocument('pointingRuns', { startedAt: 4 }), {
    format: 'minesweeper-problems-pointing-run', formatVersion: 1, run: { startedAt: 4 } });
  assert.deepEqual(archiveProblemItemDocument('drillAttempts', { startedAt: 5 }), {
    format: 'minesweeper-problems-drill-attempt', formatVersion: 1, attempt: { startedAt: 5 } });
});

check('README documents every directory and format', () => {
  for (const text of ['games/YYYY/MM/', 'traces/YYYY/MM/', 'self-checks/YYYY/MM/',
    'minesweeper-friendly-game-record', 'minesweeper-friendly-trace', 'minesweeper-friendly-self-check',
    ...Object.values(ARCHIVE_PROBLEM_KINDS).flatMap((kind) => [kind.directory + '/YYYY/MM/', kind.format]),
    'UTC', 'zcat', 'bankId']) {
    assert.equal(ARCHIVE_README_TEXT.includes(text), true, text);
  }
  assert.equal(ARCHIVE_README_NAME, 'README.txt');
});

console.log('archive-format: all ' + checks + ' checks passed');
