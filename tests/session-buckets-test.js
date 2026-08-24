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
if (verdictStart === -1 || verdictEnd === -1
    || startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(verdictStart, verdictEnd));
vm.runInThisContext(source.slice(startIdx, endIdx));

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
// loss files under its fine fatal-action kind.
{
  const games = [
    { kind: 'game', from: NOW - 2 * MIN, to: NOW - MIN, end: 'win', winUnmarked: 0.2 },
    { kind: 'game', from: NOW - 30 * 1000, to: NOW, end: 'guess-safe' },
  ];
  const s = sessionBucketSeries(games, opts);
  const i = last(s);
  assertClose('backfilled unmarked share', s.winUnmarkedFraction[i], 0.2);
  assertClose('backfilled fine loss line', s.endFractions['guess-safe'][i], 0.5);
  assertClose('backfilled win line beside it', s.endFractions.win[i], 0.5);
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

// Rates-chart scale ladder: the ceiling sits on 1/2/5×10^k, grows
// immediately, and shrinks only when max fits 80% of a lower step.
{
  assertEq('ladder floor', rateScaleStep(0), 1);
  assertEq('ladder sub-1', rateScaleStep(0.3), 1);
  assertEq('ladder exact', rateScaleStep(2), 2);
  assertEq('ladder 3.2', rateScaleStep(3.2), 5);
  assertEq('ladder 18.8', rateScaleStep(18.8), 20);
  assertEq('ladder 60', rateScaleStep(60), 100);

  assertEq('scale fresh', rateScaleCeiling(3.2, undefined), 5);
  assertEq('scale grow', rateScaleCeiling(5.5, 5), 10);
  // A climb inside the step holds the scale it grew to.
  assertEq('scale hold climb', rateScaleCeiling(9.4, 10), 10);
  // 9 is over 80% of 10, so 20 does not shrink; 7.8 fits and does.
  assertEq('scale hold near boundary', rateScaleCeiling(9, 20), 20);
  assertEq('scale shrink with room', rateScaleCeiling(7.8, 20), 10);
  // A collapse skips intermediate steps but keeps the 80% margin:
  // 3.8 fits 80% of 5; 4.5 does not and lands on 10.
  assertEq('scale shrink deep', rateScaleCeiling(3.8, 20), 5);
  assertEq('scale shrink margin', rateScaleCeiling(4.5, 20), 10);
  // All-zero lines settle back to the unit floor.
  assertEq('scale zero floor', rateScaleCeiling(0, 20), 1);
}

console.log(`session-series: all ${checks} checks passed (buckets + running averages + scale ladder)`);
