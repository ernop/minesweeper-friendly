'use strict';
// Known-answer tests for cumulative-play session series: the fine
// bucketing layer (sessionBucketSeries) and the trailing running-average
// layer over it (sessionRunningSeries). Wall-clock breaks must consume
// no chart time and no lookback; everything fills from actual play spans.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const verdictStart = source.indexOf('//-------GAME-END EVALUATION: VERDICT');
const verdictEnd = source.indexOf('//-------GAME-END EVALUATION: CAPTURE');
const startIdx = source.indexOf('//-------SESSION STATS: COMPUTATION');
const endIdx = source.indexOf('//-------SESSION STATS: RECORDING');
const labelLayoutStart = source.indexOf('function sessionRateLabelLayout(');
const labelLayoutEnd = source.indexOf('\nfunction buildSessionRatesChart(', labelLayoutStart);
const placementStart = source.indexOf('function sessionGamePlacement(');
const placementEnd = source.indexOf('\nfunction sessionGameTimeOfDay(', placementStart);
if (verdictStart === -1 || verdictEnd === -1
    || startIdx === -1 || endIdx === -1
    || labelLayoutStart === -1 || labelLayoutEnd === -1
    || placementStart === -1 || placementEnd === -1) {
  throw new Error('section markers not found');
}
vm.runInThisContext(source.slice(verdictStart, verdictEnd));
vm.runInThisContext(source.slice(startIdx, endIdx));
vm.runInThisContext(source.slice(labelLayoutStart, labelLayoutEnd));
vm.runInThisContext(source.slice(placementStart, placementEnd));

let checks = 0;
function assertClose(name, actual, want, tol = 1e-9) {
  checks++;
  if (actual === undefined || Math.abs(actual - want) > tol) {
    throw new Error(`${name}: got ${actual}, want ${want} (tol ${tol})`);
  }
}
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}
function assertUndefined(name, actual) {
  checks++;
  if (actual !== undefined) throw new Error(`${name}: got ${actual}, want undefined`);
}

const MIN = 60000;
const HOUR = 60 * MIN;
const NOW = 10 * HOUR;
const opts = { nowMs: NOW, bucketMs: MIN, windowMs: HOUR };
const last = (s) => s.centers.length - 1;
const press = (at, useful, flag, moving, gapMs, unflag, misclick) => ({
  kind: 'press', at, useful, flag, unflag: unflag === true,
  misclick: misclick === true, moving, gapMs,
});

// One full played minute with every live event kind.
{
  const from = NOW - MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    { kind: 'move', at: from + 1000, px: 700 },
    { kind: 'move', at: from + 30000, px: 500 },
    press(from + 2000, false, false, true),
    press(from + 3000, false, false, false),
    press(from + 4000, false, false, true),
    press(from + 5000, true, true, true),
    press(from + 5200, true, false, true, 200),
    press(from + 5500, true, false, true, 300),
    press(from + 5900, true, false, true, 400, false, true),
    press(from + 10900, true, true, true, 5000),
    press(from + 11150, true, false, false, 250),
    press(from + 15000, true, false, false, undefined, true),
    press(from + 16000, true, false, false, undefined, true),
    { kind: 'death', at: from + 20000, mistake: true },
    { kind: 'death', at: from + 40000, mistake: false },
    { kind: 'evaluation', at: from + 21000, category: 'gameLoss' },
    { kind: 'evaluation', at: from + 22000, category: 'gameRisk',
      excessRisk: 0.15, modeledLifeGap: 0.08 },
    { kind: 'evaluation', at: from + 23000, category: 'timeLoss' },
    { kind: 'evaluation', at: from + 24000, category: 'lifeMaximization',
      modeledLifeGap: 0.12 },
    { kind: 'unused-mark', at: from + 25000 },
  ];
  const s = sessionBucketSeries(events, opts);
  const i = last(s);
  assertEq('live bucket count', s.centers.length, 60);
  assertClose('live play', s.playMs[i], MIN);
  assertClose('live speed', s.speedPxPerSec[i], 20);
  assertClose('live useful clicks', s.clicksPerSec[i], 8 / 60);
  assertClose('live no-op clicks', s.wastedPerMin[i], 3);
  assertClose('live misclicks', s.misclicksPerMin[i], 1);
  assertClose('live flags', s.flagsPerSec[i], 2 / 60);
  assertClose('live unflags', s.mismarksPerMin[i], 2);
  assertClose('live unused mine marks', s.unusedMarksPerMin[i], 1);
  assertClose('live deaths with mistakes', s.avoidablePerMin[i], 1);
  assertClose('live game-loss category', s.categoryPerMin.gameLoss[i], 1);
  assertClose('live game-risk category', s.categoryPerMin.gameRisk[i], 1);
  assertClose('live time-loss category', s.categoryPerMin.timeLoss[i], 1);
  assertClose('live life category', s.categoryPerMin.lifeMaximization[i], 1);
  assertClose('live excess risk magnitude', s.excessRiskPctPerMin[i], 15);
  assertClose('live modeled-life magnitude', s.modeledLifeGapPerMin[i], 0.2);
  assertClose('live fastclick median', s.fastclickGapMs[i], 300);
  assertUndefined('empty earlier bucket', s.speedPxPerSec[i - 1]);
}

// Older games did not measure unused marks. They must not be treated as
// measured zeroes in either time-based or per-game rates.
{
  const from = NOW - MIN;
  const unmeasured = sessionBucketSeries([
    { kind: 'game', from, to: NOW, end: 'win' },
  ], opts);
  assertUndefined('legacy game has no unused-mark time rate',
    unmeasured.unusedMarksPerMin[last(unmeasured)]);
  assertUndefined('legacy game has no unused-mark per-game rate',
    unmeasured.unusedMarksPerGame[last(unmeasured)]);
  const measured = sessionBucketSeries([
    { kind: 'game', from, to: NOW, end: 'win', unusedMarks: 0 },
  ], opts);
  assertClose('measured zero unused-mark time rate',
    measured.unusedMarksPerMin[last(measured)], 0);
  assertClose('measured zero unused-mark per-game rate',
    measured.unusedMarksPerGame[last(measured)], 0);
}

// Two 30-second games five wall minutes apart fill one contiguous played
// minute. The break contributes neither an empty bucket nor denominator.
{
  const first = NOW - 6 * MIN;
  const second = NOW - 30 * 1000;
  const events = [
    { kind: 'play', from: first, to: first + 30000 },
    press(first + 10000, false, false, false),
    { kind: 'play', from: second, to: NOW },
    press(second + 10000, false, false, false),
  ];
  const s = sessionBucketSeries(events, opts);
  const i = last(s);
  assertClose('breaks compressed play', s.playMs[i], MIN);
  assertClose('breaks compressed rate', s.wastedPerMin[i], 2);
  assertUndefined('breaks do not make chart gaps', s.wastedPerMin[i - 1]);
}

// Wall time advancing during a break leaves every played-time coordinate
// and value unchanged.
{
  const events = [{ kind: 'play', from: NOW - 30000, to: NOW }];
  const s1 = sessionBucketSeries(events, opts);
  const s2 = sessionBucketSeries(events, { ...opts, nowMs: NOW + 5 * HOUR });
  assertEq('break leaves playNow fixed', s2.playNowMs, s1.playNowMs);
  assertEq('break leaves grid fixed', s2.startPlayMs, s1.startPlayMs);
  assertClose('break leaves partial value fixed',
    s2.speedPxPerSec[last(s2)], s1.speedPxPerSec[last(s1)]);
}

// An open play span advances cumulative time. Its first press may precede
// sessionPlayBegin slightly and is attached to that immediately following span.
{
  const events = [
    press(NOW - 90050, false, false, false),
    { kind: 'move', at: NOW - 20000, px: 600 },
  ];
  const s = sessionBucketSeries(events, { ...opts, openPlayFrom: NOW - 90000 });
  const i = last(s);
  assertClose('open newest half minute', s.playMs[i], 30000);
  assertClose('open previous full minute', s.playMs[i - 1], MIN);
  assertClose('open speed', s.speedPxPerSec[i], 20);
  assertClose('first press attached', s.wastedPerMin[i - 1], 1);
}

// A 90-second backfilled game crosses played-time buckets. Aggregates are
// distributed by played overlap and its death lands at its final instant.
{
  const game = {
    kind: 'game', from: NOW - 90 * 1000, to: NOW,
    px: 900, useful: 18, wasted: 3, misclicks: 2,
    flags: 6, unflags: 3, fatalMistake: true, fastGapMs: 240,
    categoryCounts: { gameLoss: 1, gameRisk: 3, timeLoss: 6 },
    excessRisk: 0.3, modeledLifeGap: 0.15,
  };
  const s = sessionBucketSeries([game], opts);
  const i = last(s);
  assertClose('game newest play', s.playMs[i], 30000);
  assertClose('game previous play', s.playMs[i - 1], MIN);
  assertClose('game speed newest', s.speedPxPerSec[i], 10);
  assertClose('game speed previous', s.speedPxPerSec[i - 1], 10);
  assertClose('game clicks newest', s.clicksPerSec[i], 0.2);
  assertClose('game no-ops previous', s.wastedPerMin[i - 1], 2);
  assertClose('game misclicks newest', s.misclicksPerMin[i], 4 / 3);
  assertClose('game flags previous', s.flagsPerSec[i - 1], 4 / 60);
  assertClose('game unflags newest', s.mismarksPerMin[i], 2);
  assertClose('game death newest', s.avoidablePerMin[i], 2);
  assertClose('game no death previous', s.avoidablePerMin[i - 1], 0);
  assertClose('game fastgap newest', s.fastclickGapMs[i], 240);
  assertClose('game fastgap previous', s.fastclickGapMs[i - 1], 240);
  assertClose('game category distributed newest',
    s.categoryPerMin.gameRisk[i], 2);
  assertClose('game category distributed previous',
    s.categoryPerMin.timeLoss[i - 1], 4);
  assertClose('game excess risk distributed', s.excessRiskPctPerMin[i], 20);
  assertClose('game modeled life distributed', s.modeledLifeGapPerMin[i - 1], 0.1);
}

// Old records without misclick coverage leave that series unmeasured while
// their other recorded fields remain valid.
{
  const game = {
    kind: 'game', from: NOW - MIN, to: NOW,
    px: 0, useful: 6, wasted: 0, flags: 0, fatalMistake: false,
  };
  const s = sessionBucketSeries([game], opts);
  const i = last(s);
  assertClose('old game clicks', s.clicksPerSec[i], 0.1);
  assertClose('old game unflags', s.mismarksPerMin[i], 0);
  assertUndefined('old game misclicks', s.misclicksPerMin[i]);
  assertUndefined('old game fastgap', s.fastclickGapMs[i]);
}

// Under one played second is deliberately not a rate.
{
  const from = NOW - 500;
  const s = sessionBucketSeries([
    { kind: 'play', from, to: NOW },
    { kind: 'death', at: from + 400, mistake: true },
  ], opts);
  const i = last(s);
  assertClose('sliver duration', s.playMs[i], 500);
  assertUndefined('sliver death rate', s.avoidablePerMin[i]);
  assertUndefined('sliver speed', s.speedPxPerSec[i]);
}

// Retained history can start at any cumulative-play coordinate. The offset
// preserves global bucket alignment after older spans are pruned.
{
  const s = sessionBucketSeries([
    { kind: 'play', from: NOW - 30000, to: NOW },
  ], { ...opts, playOffsetMs: 2 * MIN });
  assertEq('offset cumulative total', s.playNowMs, 2.5 * MIN);
  assertClose('offset partial bucket', s.playMs[last(s)], 30000);
}

// Startup scans backward until enough play is retained, regardless of how
// far apart the games are in wall time.
{
  const games = [0, 1, 2, 3].map((day) => ({
    kind: 'game',
    from: day * 24 * HOUR,
    to: day * 24 * HOUR + 20000,
  }));
  const retained = sessionHistorySlice(games, MIN);
  assertEq('history retains enough played games', retained.games.length, 3);
  assertEq('history reaches across multi-day breaks', retained.games[0].from, 24 * HOUR);
  assertEq('history offset is older played time', retained.playOffsetMs, 20000);
}

// Choice sizes retain the expected one-hour chart density.
{
  for (const [bucketMs, want] of [[10000, 360], [30000, 120], [MIN, 60], [5 * MIN, 12]]) {
    const s = sessionBucketSeries([], { nowMs: NOW, bucketMs, windowMs: HOUR });
    assertEq(`bucket count ${bucketMs}`, s.centers.length, want);
  }
}

// Game endings: cumulative fractions of the games finished so far in the
// window, one series per ending kind; undefined before the first ending.
{
  const from = NOW - 3 * MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    { kind: 'end', at: from + 30000, end: 'win' },
    { kind: 'end', at: from + 90000, end: 'angel' },
    { kind: 'end', at: from + 150000, end: 'win' },
    { kind: 'end', at: from + 170000, end: 'never-heard-of-it' },
  ];
  const s = sessionBucketSeries(events, opts);
  const i = last(s);
  assertUndefined('endings undefined before first game', s.endFractions.win[i - 3]);
  assertEq('endings games before first game', s.endGames[i - 3], 0);
  assertClose('endings first bucket win share', s.endFractions.win[i - 2], 1);
  assertClose('endings mid win share', s.endFractions.win[i - 1], 0.5);
  assertClose('endings mid angel share', s.endFractions.angel[i - 1], 0.5);
  assertClose('endings final win share', s.endFractions.win[i], 0.5);
  assertClose('endings final angel share', s.endFractions.angel[i], 0.25);
  assertClose('endings unknown kind files under other', s.endFractions.other[i], 0.25);
  assertClose('endings untouched kind stays zero', s.endFractions.chord[i], 0);
  assertEq('endings cumulative game count', s.endGames[i], 4);
}

// Modern fatal-action statuses are their own ending kinds, and the
// win-with-unmarked-mines average tracks measured wins only: losses and
// unmeasured wins change neither its numerator nor its denominator.
{
  const from = NOW - 3 * MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    { kind: 'end', at: from + 30000, end: 'win', winUnmarked: 0.5 },
    { kind: 'end', at: from + 90000, end: 'guess-min' },
    { kind: 'end', at: from + 150000, end: 'win' },
    { kind: 'end', at: from + 160000, end: 'win', winUnmarked: 1 },
  ];
  const s = sessionBucketSeries(events, opts);
  const i = last(s);
  assertClose('fine kind files under its own line', s.endFractions['guess-min'][i], 0.25);
  assertClose('win share counts measured and unmeasured wins', s.endFractions.win[i], 0.75);
  assertUndefined('unmarked undefined before first measured win',
    s.winUnmarkedFraction[i - 3]);
  assertClose('unmarked first measured win', s.winUnmarkedFraction[i - 2], 0.5);
  assertClose('unmarked unchanged by a loss', s.winUnmarkedFraction[i - 1], 0.5);
  assertClose('unmarked averages measured wins only', s.winUnmarkedFraction[i], 0.75);
}

// A backfilled win carries its derived unmarked-mine share; a backfilled
// loss files under its fine fatal-action kind. Both keep their exact
// played-time coordinate and tooltip details outside the bucket aggregates.
{
  const games = [
    { kind: 'game', modeKey: '9x9/10@standard',
      from: NOW - 2 * MIN, to: NOW - MIN, end: 'win',
      winUnmarked: 0.2, timeMs: MIN, boardKey: '9x9/10', endedAt: NOW - MIN },
    { kind: 'game', modeKey: '9x9/10@standard',
      from: NOW - 30 * 1000, to: NOW, end: 'guess-safe' },
  ];
  const s = sessionBucketSeries(games, opts);
  const i = last(s);
  assertClose('backfilled unmarked share', s.winUnmarkedFraction[i], 0.2);
  assertClose('backfilled fine loss line', s.endFractions['guess-safe'][i], 0.5);
  assertClose('backfilled win line beside it', s.endFractions.win[i], 0.5);
  assertEq('backfilled win marker count', s.wins.length, 1);
  assertClose('backfilled win marker position', s.wins[0].playAt, MIN);
  assertEq('backfilled win marker time', s.wins[0].timeMs, MIN);
  assertEq('backfilled win marker board', s.wins[0].boardKey, '9x9/10');
  assertEq('backfilled win marker date', s.wins[0].endedAt, NOW - MIN);
  assertEq('all finished games receive event markers', s.gameEnds.length, 2);
  assertEq('win marker keeps semantic outcome', s.gameEnds[0].end, 'win');
  assertEq('loss marker keeps semantic outcome', s.gameEnds[1].end, 'guess-safe');
  assertEq('markers retain exact mode for lifetime rank',
    s.gameEnds[0].modeKey, '9x9/10@standard');
}

{
  const records = Array.from({ length: 20 }, (_, i) => ({
    outcome: 'win',
    timeMs: (i + 1) * 1000,
    endedAt: 100 + i,
  }));
  const topTen = sessionGamePlacement({
    end: 'win', timeMs: 2000, endedAt: 101,
  }, records);
  assertEq('game marker reports current lifetime rank', topTen.rank, 2);
  assertEq('game marker reports lifetime comparison count', topTen.total, 20);
  assertEq('second of twenty is identified as top ten percent',
    topTen.accolade, 'top 10%');
  assertEq('fastest saved finish is identified as personal best',
    sessionGamePlacement({
      end: 'win', timeMs: 1000, endedAt: 100,
    }, records).accolade, 'PB');
  assertEq('losses have no time rank',
    sessionGamePlacement({ end: 'guess-safe', timeMs: 500 }, records), undefined);
}

// Derived win-with-unmarked-mines inputs: the mode key's mine count and
// a stored win's unmarked share reconstructed from its flag counters.
{
  assertEq('mode key mines', minesOfModeKey('30x16/99@standard'), 99);
  assertEq('legacy mode key mines', minesOfModeKey('9x9/10'), 10);
  assertUndefined('malformed mode key mines', minesOfModeKey('junk'));
  const win = { outcome: 'win', flagsPlaced: 4, flagsRemoved: 1 };
  assertClose('stored win unmarked share', recordWinUnmarkedShare(win, 10), 0.7);
  assertClose('markless win is fully unmarked',
    recordWinUnmarkedShare({ outcome: 'win', flagsPlaced: 0 }, 10), 1);
  assertUndefined('loss has no unmarked share',
    recordWinUnmarkedShare({ outcome: 'loss', flagsPlaced: 0, flagsRemoved: 0 }, 10));
  assertUndefined('pre-flag-counter win is unmeasured',
    recordWinUnmarkedShare({ outcome: 'win' }, 10));
  assertUndefined('nonzero flags without removal coverage is unmeasured',
    recordWinUnmarkedShare({ outcome: 'win', flagsPlaced: 3 }, 10));
  assertUndefined('unknown mine count is unmeasured',
    recordWinUnmarkedShare(win, undefined));
}

// A backfilled game's ending lands in the bucket containing its final
// instant, exactly like its classified death.
{
  const games = [
    { kind: 'game', from: NOW - 5 * MIN, to: NOW - 4 * MIN, end: 'mine' },
    { kind: 'game', from: NOW - 30 * 1000, to: NOW, end: 'win' },
  ];
  const s = sessionBucketSeries(games, opts);
  const i = last(s);
  assertClose('backfilled ending in its bucket', s.endFractions.mine[i - 1], 1);
  assertClose('backfilled later win share', s.endFractions.win[i], 0.5);
  assertClose('backfilled later mine share', s.endFractions.mine[i], 0.5);
  assertEq('backfilled endings game count', s.endGames[i], 2);
}

// A game event without an ending (a fixture or a legacy shape) adds no
// ending, and an ending that fell out of the played-time window is
// clipped: an hour-long game ending at played-minute 60 is outside a
// one-hour window whose newest edge sits at played-minute 130.
{
  const s = sessionBucketSeries([
    { kind: 'game', from: NOW - 3 * HOUR, to: NOW - 2 * HOUR, end: 'chord' },
    { kind: 'game', from: NOW - 70 * MIN, to: NOW },
  ], opts);
  assertEq('clipped + endless games add no ending', s.endGames[last(s)], 0);
  assertUndefined('pre-window ending fraction stays undefined',
    s.endFractions.chord[last(s)]);
}

assertUndefined('empty median', sessionMedian([]));
assertClose('odd median', sessionMedian([300, 100, 200]), 200);
assertClose('even median', sessionMedian([100, 400, 200, 300]), 250);

//-------running averages (sessionRunningSeries)-------

const runOpts = {
  nowMs: NOW, stepMs: 10000, lookbackMs: 30000, windowMs: MIN,
};

// A 30s lookback rolls over 10s steps: each sample averages exactly the
// trailing three fine buckets of play, entering and leaving as the
// window slides along played time.
{
  const from = NOW - MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    { kind: 'move', at: from + 5000, px: 300 },
    { kind: 'move', at: from + 15000, px: 600 },
    { kind: 'move', at: from + 25000, px: 900 },
  ];
  const s = sessionRunningSeries(events, runOpts);
  const at = (pos) => s.centers.indexOf(pos);
  assertEq('run sample positions', s.centers.join(','),
    '0,10000,20000,30000,40000,50000,60000');
  assertUndefined('run pre-play sample', s.speedPxPerSec[at(0)]);
  assertClose('run first play sample', s.speedPxPerSec[at(10000)], 30);
  assertClose('run partial lookback', s.speedPxPerSec[at(20000)], 45);
  assertClose('run full lookback', s.speedPxPerSec[at(30000)], 60);
  assertClose('run oldest move leaves', s.speedPxPerSec[at(40000)], 50);
  assertClose('run only newest move left', s.speedPxPerSec[at(50000)], 30);
  assertClose('run all moves left', s.speedPxPerSec[at(60000)], 0);
  assertClose('run covered play at full lookback', s.playMs[at(30000)], 30000);
}

// The newest sample rides the current play position instead of a step
// boundary, averaging whatever the lookback already covers.
{
  const s = sessionRunningSeries([], { ...runOpts, openPlayFrom: NOW - 15000 });
  const i = last(s);
  assertEq('run live sample at play position', s.centers[i], 15000);
  assertClose('run live covered play', s.playMs[i], 15000);
  assertClose('run penultimate at boundary', s.centers[i - 1], 10000);
  assertClose('run penultimate covered play', s.playMs[i - 1], 10000);
}

// "1m average" means one minute of played time: two 30s games an hour of
// wall time apart are adjacent on the play axis, so one lookback spans
// both games and both of their events.
{
  const first = NOW - HOUR;
  const events = [
    { kind: 'play', from: first, to: first + 30000 },
    press(first + 10000, false, false, false),
    { kind: 'death', at: first + 20000, mistake: true },
    { kind: 'play', from: NOW - 30000, to: NOW },
    press(NOW - 10000, false, false, false),
  ];
  const s = sessionRunningSeries(events, { ...runOpts, lookbackMs: MIN });
  const i = last(s);
  assertEq('run playtime lookback position', s.centers[i], MIN);
  assertClose('run lookback spans the break', s.wastedPerMin[i], 2);
  assertClose('run death within played lookback', s.avoidablePerMin[i], 1);
}

// Wall time advancing during a break changes no sample: positions and
// values are anchored to played time only.
{
  const events = [
    { kind: 'play', from: NOW - 30000, to: NOW },
    { kind: 'move', at: NOW - 20000, px: 450 },
  ];
  const s1 = sessionRunningSeries(events, runOpts);
  const s2 = sessionRunningSeries(events, { ...runOpts, nowMs: NOW + 5 * HOUR });
  assertEq('run break leaves positions fixed', s2.centers.join(','), s1.centers.join(','));
  assertClose('run break leaves values fixed',
    s2.speedPxPerSec[last(s2)], s1.speedPxPerSec[last(s1)]);
}

// The fastclick median pools every qualifying gap in the lookback.
{
  const from = NOW - MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    press(from + 41000, true, false, true, 100),
    press(from + 45000, true, false, true, 300),
    press(from + 55000, true, false, true, 500),
  ];
  const s = sessionRunningSeries(events, runOpts);
  assertClose('run fastclick pooled median', s.fastclickGapMs[last(s)], 300);
}

// Endings ignore the lookback entirely: still each kind's cumulative
// share of the games finished so far in the chart window.
{
  const from = NOW - 3 * MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    { kind: 'end', at: from + 30000, end: 'win' },
    { kind: 'end', at: from + 90000, end: 'angel' },
  ];
  const s = sessionRunningSeries(events, { ...runOpts, windowMs: 5 * MIN });
  const at = (pos) => s.centers.indexOf(pos);
  assertUndefined('run endings before first game', s.endFractions.win[at(20000)]);
  assertClose('run endings after first game', s.endFractions.win[at(40000)], 1);
  assertClose('run endings cumulative win', s.endFractions.win[last(s)], 0.5);
  assertClose('run endings cumulative angel', s.endFractions.angel[last(s)], 0.5);
  assertEq('run endings game count', s.endGames[last(s)], 2);
}

// The wins' unmarked-mine average also ignores the lookback: cumulative
// over the window's measured wins so far, resampled at the same positions.
{
  const from = NOW - 3 * MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    { kind: 'end', at: from + 30000, end: 'win', winUnmarked: 0.25 },
    { kind: 'end', at: from + 90000, end: 'win', winUnmarked: 0.75 },
  ];
  const s = sessionRunningSeries(events, { ...runOpts, windowMs: 5 * MIN });
  const at = (pos) => s.centers.indexOf(pos);
  assertUndefined('run unmarked before first measured win',
    s.winUnmarkedFraction[at(20000)]);
  assertClose('run unmarked after first win', s.winUnmarkedFraction[at(40000)], 0.25);
  assertClose('run unmarked cumulative average', s.winUnmarkedFraction[last(s)], 0.5);
}

// Under one covered second is still not a rate.
{
  const s = sessionRunningSeries([
    { kind: 'play', from: NOW - 500, to: NOW },
    { kind: 'death', at: NOW - 100, mistake: true },
  ], runOpts);
  assertUndefined('run sliver rate', s.avoidablePerMin[last(s)]);
}

// Raw grouping keeps disjoint played-time buckets: endings and per-game
// values describe only their own bucket rather than accumulating.
{
  const from = NOW - MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    press(from + 5000, false, false, false),
    { kind: 'end', at: from + 20000, end: 'win' },
    press(from + 35000, false, false, false),
    { kind: 'end', at: from + 50000, end: 'guess-higher' },
  ];
  const s = sessionRawSeries(events, {
    nowMs: NOW, bucketMs: 30000, windowMs: MIN,
  });
  assertEq('raw has two groups', s.centers.length, 2);
  assertClose('raw first ending is win', s.endFractions.win[0], 1);
  assertClose('raw second ending is higher-risk guess', s.endFractions['guess-higher'][1], 1);
  assertClose('raw first no-ops per game', s.wastedPerGame[0], 1);
  assertClose('raw second no-ops per game', s.wastedPerGame[1], 1);
}

// Per-game normalization divides the trailing group's totals by finished
// games, independently of its played-time /m and /s rates.
{
  const from = NOW - MIN;
  const events = [
    { kind: 'play', from, to: NOW },
    press(from + 35000, true, false, false),
    press(from + 45000, true, false, false),
    { kind: 'end', at: from + 55000, end: 'win' },
  ];
  const s = sessionRunningSeries(events, runOpts);
  assertClose('run useful actions per game', s.usefulPerGame[last(s)], 2);
  assertClose('run zero avoidable deaths per game', s.avoidablePerGame[last(s)], 0);
}

// Exact-mode scope uses the history key carried by every event.
{
  const a = '9x9/10@standard';
  const b = '16x16/40@standard';
  const events = [
    { kind: 'play', modeKey: a, from: NOW - 30000, to: NOW - 20000 },
    { kind: 'move', modeKey: a, at: NOW - 25000, px: 100 },
    { kind: 'play', modeKey: b, from: NOW - 10000, to: NOW },
    { kind: 'move', modeKey: b, at: NOW - 5000, px: 300 },
  ];
  const onlyA = sessionEventsForMode(events, a, 'current');
  const all = sessionEventsForMode(events, a, 'all');
  assertEq('current-mode event count', onlyA.length, 2);
  assertEq('all-mode event count', all.length, 4);
  const s = sessionBucketSeries(onlyA, opts);
  assertClose('current-mode speed excludes other modes', s.speedPxPerSec[last(s)], 10);
}

// Retention reserves a played-time tail for each exact mode, even when the
// global newest tail contains only another mode.
{
  const a = '9x9/10@standard';
  const b = '16x16/40@standard';
  const aGame = { kind: 'game', modeKey: a, from: 0, to: 15000 };
  const events = [
    aGame,
    { kind: 'end', modeKey: a, at: 14000, end: 'win' },
    { kind: 'game', modeKey: b, from: 20000, to: 35000 },
    { kind: 'game', modeKey: b, from: 40000, to: 55000 },
  ];
  const retained = sessionRetainedEvents(events, 20000);
  assertEq('retention keeps sparse mode game', retained.includes(aGame), true);
  assertEq('retention keeps sparse mode ending', retained.some((ev) =>
    ev.kind === 'end' && ev.modeKey === a), true);
  const openOnly = { kind: 'move', modeKey: 'new-mode', at: 60000, px: 12 };
  assertEq('retention keeps open-game events before their span closes',
    sessionRetainedEvents([...events, openOnly], 20000).includes(openOnly), true);
}

// Session chart y domains follow measured values instead of forcing zero.
{
  let domain = sessionYDomain([]);
  assertClose('empty domain floor', domain.min, 0);
  assertClose('empty domain ceiling', domain.max, 1);
  domain = sessionYDomain([undefined, 10, 20]);
  assertClose('positive varying domain excludes zero', domain.min, 9.2);
  assertClose('positive varying domain pads ceiling', domain.max, 20.8);
  domain = sessionYDomain([0, 20]);
  assertClose('measured zero remains the floor', domain.min, 0);
  assertClose('zero-based data still pads ceiling', domain.max, 21.6);
  domain = sessionYDomain([5, 5]);
  assertClose('flat positive domain pads below', domain.min, 4.6);
  assertClose('flat positive domain pads above', domain.max, 5.4);
  domain = sessionYDomain([-5, -3]);
  assertClose('negative domain pads below', domain.min, -5.16);
  assertClose('negative domain pads above', domain.max, -2.84);
}

// Crowded current-value labels occupy distinct open positions while staying
// inside the plot; leader endpoints retain their line association.
{
  const labels = Array.from({ length: 6 }, (_, i) => ({
    x: 320,
    y: 92 + i * 4,
    text: ['click rate 14.50/game', 'mine marking 5.25/game',
      'no-op clicks 2.00/game', 'deaths with mistakes 0.33/game',
      'flag removals 0.2/game', 'misclicks 0.1/game'][i],
    points: Array.from({ length: 12 }, (__, j) => ({
      x: 58 + j * 23,
      y: 25 + ((i * 19 + j * 11) % 105),
    })),
  }));
  const placed = sessionRateLabelLayout(labels, {
    left: 56, right: 328, top: 6, bottom: 146,
  });
  assertEq('every crowded rate label is placed', placed.length, labels.length);
  assertEq('rate labels stay inside the plot', placed.every((label) =>
    label.box.left >= 55.99 && label.box.right <= 328.01
      && label.box.top >= 6 && label.box.bottom <= 148), true);
  assertEq('rate labels do not overlap one another', placed.every((label, i) =>
    placed.slice(i + 1).every((other) =>
      Math.min(label.box.right, other.box.right)
        <= Math.max(label.box.left, other.box.left)
      || Math.min(label.box.bottom, other.box.bottom)
        <= Math.max(label.box.top, other.box.top))), true);
  assertEq('rate labels use varied horizontal positions',
    new Set(placed.map((label) => Math.round(label.center))).size >= 3, true);
}

console.log(`session-series: all ${checks} checks passed (buckets + running averages + y domains)`);
