'use strict';
// Known-answer tests for the recent-placements summary: ordinal and
// run formatting, chart-set dedupe, the strictly-longer-window rule,
// membership charts (no startMs), the top-tenth cutoff, tie-breaking,
// row order, current-game marking, and lifetime's near-miss rule.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------RECENT PLACEMENTS: COMPUTATION');
const endIdx = source.indexOf('//-------RECENT PLACEMENTS: DISPLAY');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

// Ordinals, including the 11th/12th/13th rule and its 111th recurrence.
for (const [n, want] of [
  [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [10, '10th'],
  [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'],
  [23, '23rd'], [100, '100th'], [101, '101st'], [111, '111th'], [112, '112th'],
]) {
  assertEq(`ordinal ${n}`, ordinal(n), want);
}

// Run compression: consecutive ranks join, the suffix closes each run.
assertEq('single rank', formatRankRuns([1]), '1st');
assertEq('two apart', formatRankRuns([1, 3]), '1st, 3rd');
assertEq('adjacent pair', formatRankRuns([1, 2]), '1\u20132nd');
assertEq('example from the request',
  formatRankRuns([1, 3, 8, 9, 10, 11, 12]), '1st, 3rd, 8\u201312th');
assertEq('run then single', formatRankRuns([2, 3, 4, 7]), '2\u20134th, 7th');

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const NOW = 1000 * DAY;
const win = (endedAt, timeMs) => ({ endedAt, timeMs });
// A time-window candidate the way buildRecentPlacements makes them: the
// window's own member wins plus its start for the strictly-longer rule.
const windowCandidate = (label, specificity, startMs, wins) =>
  ({ label, specificity, startMs, wins: wins.filter((s) => s.endedAt >= startMs) });

// Tablechart progressive disclosure: pinned lifetime and past week both
// survive even when identical, claim their member set from ordinary charts,
// and each remaining duplicate set keeps its most specific candidate.
{
  const a = win(NOW - 2 * HOUR, 20000);
  const b = win(NOW - HOUR, 10000);
  const kept = dedupeRankCandidates([
    { label: 'lifetime', specificity: 12, wins: [a, b] },
    { label: 'past week', specificity: 8, wins: [a, b] },
    { label: 'this month', specificity: 9, wins: [b, a] },
    { label: 'today', specificity: 4, wins: [b] },
    { label: 'past hour', specificity: 3, wins: [b] },
  ], ['lifetime', 'past week']);
  assertEq('pinned charts claim duplicate sets',
    kept.map((candidate) => candidate.label).join(','),
    'lifetime,past week,past hour');

  const shapeKept = dedupeRankCandidates([
    { label: 'max 4', specificity: 4, wins: [a] },
    { label: 'max 2', specificity: 2, wins: [a] },
  ]);
  assertEq('shape duplicate keeps most specific',
    shapeKept.map((candidate) => candidate.label).join(','), 'max 2');
}

// 20 old wins at 20s..39s spread over past weeks, plus recent wins placed
// among them by solve time. Source window: the last hour.
{
  const old = [];
  for (let i = 0; i < 20; i++) old.push(win(NOW - 10 * DAY - i * HOUR, 20000 + i * 1000));
  const sourceStart = NOW - HOUR;
  // A recent win fastest of all: rank 1 lifetime (22 wins -> top tenth is
  // ranks 1-2). "past week" and "today" hold only the 2 recent wins — too
  // short a list for any top-tenth rank. Windows not strictly longer than
  // the source ("past hour" itself, "past 5 min") never report.
  const fast = win(NOW - 600e3, 10000);
  const mid = win(NOW - 120e3, 25500); // rank 8 of 22 lifetime: past the tenth
  const wins = [...old, fast, mid];
  const candidates = [
    { label: 'lifetime', specificity: 12, startMs: -Infinity, wins, alwaysShowBest: true },
    windowCandidate('past week', 8, NOW - 7 * DAY, wins),
    windowCandidate('today', 4, NOW - 5 * HOUR, wins),
    windowCandidate('past hour', 3, sourceStart, wins),
    windowCandidate('past 5 min', 1, NOW - 300e3, wins),
  ];
  const rows = recentPlacementsSummary(candidates, sourceStart);
  assertEq('one window reports', rows.length, 1);
  assertEq('lifetime label', rows[0].label, 'lifetime');
  assertEq('lifetime ranks', rows[0].ranks.join(','), '1');
  assertEq('lifetime total', rows[0].total, 22);
  assertEq('lifetime not a near miss', rows[0].nearMiss, false);
}

// Cutoff boundary: rank r qualifies only when r * 10 <= list length.
{
  const sourceStart = NOW - HOUR;
  const nine = [];
  for (let i = 0; i < 9; i++) nine.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  const recent = win(NOW - 60e3, 10000);
  const candidate = (wins) =>
    [windowCandidate('this month', 9, NOW - 20 * DAY, wins)];
  // 9 old + 1 recent fastest = 10 wins: rank 1 qualifies exactly.
  assertEq('rank 1 of 10 reported',
    recentPlacementsSummary(candidate([...nine, recent]), sourceStart)[0].ranks.join(','), '1');
  // 8 old + 1 recent fastest = 9 wins: nothing is within the top tenth.
  assertEq('9-win list reports nothing',
    recentPlacementsSummary(candidate([...nine.slice(0, 8), recent]), sourceStart).length, 0);
  // A recent win at rank 2 of 10 does not qualify (2 * 10 > 10).
  const second = win(NOW - 60e3, 20500);
  assertEq('rank 2 of 10 not reported',
    recentPlacementsSummary(candidate([...nine, second]), sourceStart).length, 0);
}

// A membership chart (weekend/weekday, same-3BV) has no startMs: it spans
// lifetime rather than an interval, so it reports regardless of the
// strictly-longer rule.
{
  const sourceStart = NOW - HOUR;
  const wins = [];
  for (let i = 0; i < 9; i++) wins.push(win(NOW - 3 * DAY - i * HOUR, 20000 + i * 1000));
  wins.push(win(NOW - 60e3, 10000));
  const rows = recentPlacementsSummary(
    [{ label: '3BV 25', specificity: 13, wins }], sourceStart);
  assertEq('membership chart reports without a startMs', rows.length, 1);
  assertEq('membership ranks', rows[0].ranks.join(','), '1');
}

// Membership and ordering: only source-window wins report, ties break by
// earlier finish, and rows come back with the largest competitor pool first.
{
  const sourceStart = NOW - HOUR;
  const wins = [];
  // 38 older wins this month at 30s+; the old rank-1 win predates the month.
  wins.push(win(NOW - 25 * DAY, 5000));
  for (let i = 0; i < 38; i++) wins.push(win(NOW - 15 * DAY + i * HOUR, 30000 + i * 1000));
  // Two recent wins: 6s (rank 2 lifetime, rank 1 month) and a 30s tie that
  // the older 30s win beats on earlier finish — the recent one takes rank
  // 3 of the month and rank 4 lifetime, both within their lists' top tenth
  // (40 and 41 wins reach ranks 4).
  wins.push(win(NOW - 30 * 60e3, 6000));
  wins.push(win(NOW - 10 * 60e3, 30000));
  const candidates = [
    { label: 'lifetime', specificity: 12, startMs: -Infinity, wins, alwaysShowBest: true },
    windowCandidate('this month', 9, NOW - 20 * DAY, wins),
  ];
  const rows = recentPlacementsSummary(candidates, sourceStart);
  assertEq('two windows report', rows.length, 2);
  assertEq('largest pool first', rows[0].label, 'lifetime');
  assertEq('lifetime ranks', rows[0].ranks.join(','), '2,4');
  assertEq('lifetime total', rows[0].total, 41);
  assertEq('month second', rows[1].label, 'this month');
  assertEq('month ranks', rows[1].ranks.join(','), '1,3');
  assertEq('month total', rows[1].total, 40);
}

// Equal-sized pools put the broader, more significant chart first.
{
  const sourceStart = NOW - HOUR;
  const wins = [];
  for (let i = 0; i < 9; i++) wins.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  wins.push(win(NOW - 60e3, 10000));
  const rows = recentPlacementsSummary([
    { label: 'this month', specificity: 9, wins },
    { label: 'lifetime', specificity: 12, wins, alwaysShowBest: true },
  ], sourceStart);
  assertEq('broader chart wins equal-total tie', rows[0].label, 'lifetime');
  assertEq('equal-total narrower chart second', rows[1].label, 'this month');
}

// The summary identifies the rank belonging to the exact current record,
// including lifetime's near-miss path.
{
  const sourceStart = NOW - HOUR;
  const old = [];
  for (let i = 0; i < 19; i++) old.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  const current = win(NOW, 10000);
  const rows = recentPlacementsSummary([
    { label: 'lifetime', specificity: 12, wins: [...old, current], alwaysShowBest: true },
  ], sourceStart, current);
  assertEq('current top rank identified', rows[0].currentRank, 1);

  const nearCurrent = win(NOW, 21500);
  const nearRows = recentPlacementsSummary([
    { label: 'lifetime', specificity: 12, wins: [...old, nearCurrent], alwaysShowBest: true },
  ], sourceStart, nearCurrent);
  assertEq('current near-miss rank identified', nearRows[0].currentRank, 3);
}

// Lifetime's near-miss rule: with alwaysShowBest, a source-window win
// outside the top tenth still reports its single best rank, marked; with
// no source-window win at all, nothing reports.
{
  const sourceStart = NOW - HOUR;
  const old = [];
  for (let i = 0; i < 19; i++) old.push(win(NOW - 2 * DAY - i * HOUR, 20000 + i * 1000));
  const recent = win(NOW - 60e3, 21500); // rank 3 of 20; the tenth reaches rank 2
  const lifetime = (list) =>
    [{ label: 'lifetime', specificity: 12, startMs: -Infinity, wins: list, alwaysShowBest: true }];
  const rows = recentPlacementsSummary(lifetime([...old, recent]), sourceStart);
  assertEq('near miss reports', rows.length, 1);
  assertEq('near miss flag', rows[0].nearMiss, true);
  assertEq('near miss rank', rows[0].ranks.join(','), '3');
  assertEq('near miss total', rows[0].total, 20);
  assertEq('no source win reports nothing',
    recentPlacementsSummary(lifetime(old), sourceStart).length, 0);
}

console.log(`recent-placements: all ${checks} checks passed`);
