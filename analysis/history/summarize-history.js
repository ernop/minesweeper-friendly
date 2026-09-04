#!/usr/bin/env node
'use strict';
// Reproducible history summary: everything the "history findings" review
// canvases quoted, recomputed from a history export so the numbers can be
// regenerated as the history grows instead of living as hand-copied
// constants. Stdlib only; loads the game's own pure verdict section so the
// loss taxonomy is the report's wording, never a re-implementation.
//
//   node analysis/history/summarize-history.js <history-export.json>
//        [--gap-minutes 30] [--out analysis/history/out/summary.json]
//
// Prints a short readable digest to stderr and the full JSON to --out (or
// stdout). Every grouping keeps the exact board/mode key (`9x9/10@standard`)
// and reports sample sizes; nothing here infers causes (PRODUCT.md
// "Measurement purpose").

const fs = require('fs');
const path = require('path');
const vm = require('vm');

//-------ARGUMENTS-------

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  process.stderr.write(
    'usage: node analysis/history/summarize-history.js <history-export.json> '
    + '[--gap-minutes N] [--out file.json]\n');
  process.exit(args.length === 0 ? 2 : 0);
}
function option(name, fallback) {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  if (at + 1 >= args.length) throw new Error(name + ' needs a value');
  return args[at + 1];
}
const inputPath = args.find((arg, i) => !arg.startsWith('--')
  && (i === 0 || !args[i - 1].startsWith('--')));
if (!inputPath) throw new Error('no history export path given');
const gapMinutes = Number(option('--gap-minutes', '30'));
if (!Number.isFinite(gapMinutes) || gapMinutes <= 0) {
  throw new Error('--gap-minutes must be a positive number');
}
const outPath = option('--out', null);

//-------THE GAME'S OWN VERDICT CODE-------

const repo = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------GAME-END EVALUATION: VERDICT');
const endIdx = source.indexOf('//-------GAME-END EVALUATION: CAPTURE');
if (startIdx === -1 || endIdx === -1) throw new Error('verdict section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));
/* global FATAL_STATUS_LABELS, DEATH_KIND_LABELS, fatalActionStatusKind,
   fatalEvaluationOf, ACTION_EVALUATION_VERSION */

//-------STATISTICS (stdlib)-------

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function robust(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { n: 0, median: null, q1: null, q3: null };
  return {
    n: finite.length,
    median: median(finite),
    q1: quantile(finite, 0.25),
    q3: quantile(finite, 0.75),
  };
}

// Wilson score interval for a binomial proportion (95%).
function wilson(successes, n) {
  if (n === 0) return { rate: null, low: null, high: null };
  const z = 1.959964;
  const p = successes / n;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { rate: p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

// Theil–Sen slope: median of pairwise slopes; robust to outlier days.
function theilSen(xs, ys) {
  const slopes = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    }
  }
  return slopes.length === 0 ? null : median(slopes);
}

function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
}

function spearman(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const rx = ranks(pairs.map((p) => p[0]));
  const ry = ranks(pairs.map((p) => p[1]));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

//-------LOAD-------

const exported = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (typeof exported !== 'object' || exported === null) throw new Error('export is not an object');
const games = [];
for (const [key, list] of Object.entries(exported)) {
  if (!Array.isArray(list)) continue; // `settings` rides along in the export
  for (const record of list) {
    if (!Number.isFinite(record.endedAt) || !Number.isFinite(record.timeMs)
        || (record.outcome !== 'win' && record.outcome !== 'loss')) {
      throw new Error('malformed record under ' + key + ': ' + JSON.stringify(record).slice(0, 120));
    }
    games.push({ key, ...record, startedAt: record.endedAt - record.timeMs });
  }
}
if (games.length === 0) throw new Error('no game records in ' + inputPath);
games.sort((a, b) => a.startedAt - b.startedAt);

const localDay = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};
const isWin = (g) => g.outcome === 'win';
const mouseSpeed = (g) => Number.isFinite(g.mousePathPx) && g.timeMs > 0
  ? g.mousePathPx / (g.timeMs / 1000) : NaN;
const clickRate = (g) => Number.isFinite(g.clicks) && g.timeMs > 0
  ? g.clicks / (g.timeMs / 1000) : NaN;
const groupBy = (list, keyOf) => {
  const map = new Map();
  for (const item of list) {
    const k = keyOf(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};

// Robust center/spread for the physical-state aggregates every grouping
// reports (PRODUCT.md "Behavioral signatures": games, wins, win rate,
// accumulated play time, mouse speed, click rate, fastclick gap).
function groupSummary(list) {
  const wins = list.filter(isWin);
  return {
    games: list.length,
    wins: wins.length,
    winRate: wilson(wins.length, list.length),
    playedMs: list.reduce((s, g) => s + g.timeMs, 0),
    winTimeMs: robust(wins.map((g) => g.timeMs)),
    mouseSpeedPxPerS: robust(list.map(mouseSpeed)),
    clickRatePerS: robust(list.map(clickRate)),
    fastclickGapMs: robust(list.map((g) => g.fastclickGapMs)),
    misclicksPerGame: robust(list.map((g) => g.misclicks)),
    wastedClicksPerGame: robust(list.map((g) => g.wastedClicks)),
  };
}

//-------TOTALS AND STRATA-------

const byKey = groupBy(games, (g) => g.key);
const summary = {
  source: path.basename(inputPath),
  generatedAt: new Date().toISOString(),
  sessionGapMinutes: gapMinutes,
  totals: {
    ...groupSummary(games),
    firstGame: new Date(games[0].startedAt).toISOString(),
    lastGame: new Date(games[games.length - 1].endedAt).toISOString(),
    days: new Set(games.map((g) => localDay(g.startedAt))).size,
  },
  byKey: Object.fromEntries([...byKey].map(([key, list]) => [key, groupSummary(list)])),
};

//-------PER DAY PER KEY, WITH TRENDS-------

summary.daily = {};
summary.trends = {};
for (const [key, list] of byKey) {
  const byDay = groupBy(list, (g) => localDay(g.startedAt));
  const days = [...byDay.keys()].sort();
  summary.daily[key] = Object.fromEntries(days.map((day) => {
    const dayGames = byDay.get(day);
    const wins = dayGames.filter(isWin);
    return [day, {
      games: dayGames.length,
      wins: wins.length,
      winRate: wilson(wins.length, dayGames.length),
      medianWinTimeMs: median(wins.map((g) => g.timeMs)),
      medianMouseSpeedPxPerS: median(dayGames.map(mouseSpeed)),
    }];
  }));
  const dayIndex = days.map((day) => Math.round(new Date(day + 'T12:00:00').getTime() / 86400000));
  const daysWithWins = days.filter((day) => summary.daily[key][day].medianWinTimeMs !== null);
  summary.trends[key] = {
    daysObserved: days.length,
    winRateSlopePerDay: days.length >= 3
      ? theilSen(dayIndex, days.map((day) => summary.daily[key][day].winRate.rate)) : null,
    medianWinTimeSlopeMsPerDay: daysWithWins.length >= 3
      ? theilSen(
        daysWithWins.map((day) => Math.round(new Date(day + 'T12:00:00').getTime() / 86400000)),
        daysWithWins.map((day) => summary.daily[key][day].medianWinTimeMs))
      : null,
    // Rank correlation of game order with win time, wins only: negative
    // means later wins were faster.
    winTimeVsOrderSpearman: spearman(
      list.filter(isWin).map((g) => g.startedAt),
      list.filter(isWin).map((g) => g.timeMs)),
  };
}

//-------SESSIONS-------

const sessions = [];
let current = null;
for (const game of games) {
  if (current === null || game.startedAt - current.endedAt > gapMinutes * 60000) {
    current = { games: [], startedAt: game.startedAt, endedAt: game.endedAt };
    sessions.push(current);
  }
  current.games.push(game);
  current.endedAt = Math.max(current.endedAt, game.endedAt);
}
summary.sessions = sessions.map((session, index) => {
  const half = Math.floor(session.games.length / 2);
  const early = session.games.slice(0, half);
  const late = session.games.slice(half);
  return {
    index: index + 1,
    day: localDay(session.startedAt),
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    wallMs: session.endedAt - session.startedAt,
    ...groupSummary(session.games),
    keys: Object.fromEntries([...groupBy(session.games, (g) => g.key)]
      .map(([key, list]) => [key, groupSummary(list)])),
    states: [...new Set(session.games.flatMap((g) => g.states || []))].sort(),
    // Warm-up / fatigue signal within one sitting: first half versus second
    // half, same session, so day and equipment are held fixed.
    earlyLate: session.games.length >= 6 ? {
      earlyWinRate: wilson(early.filter(isWin).length, early.length),
      lateWinRate: wilson(late.filter(isWin).length, late.length),
      earlyMedianWinTimeMs: median(early.filter(isWin).map((g) => g.timeMs)),
      lateMedianWinTimeMs: median(late.filter(isWin).map((g) => g.timeMs)),
    } : null,
  };
});

//-------LOSS TAXONOMY (the report's own wording)-------

const lossKinds = {};
const legacyKinds = {};
let unjudged = 0;
for (const game of games) {
  if (isWin(game)) continue;
  const fatal = fatalEvaluationOf(game);
  if (!fatal || fatal.version !== ACTION_EVALUATION_VERSION) {
    unjudged++;
    continue;
  }
  if (fatal.legacy) {
    const label = fatal.legacy.deathKind && DEATH_KIND_LABELS[fatal.legacy.deathKind]
      ? DEATH_KIND_LABELS[fatal.legacy.deathKind]
      : 'legacy: ' + (fatal.legacy.source || 'unknown provenance');
    legacyKinds[label] = (legacyKinds[label] || 0) + 1;
    continue;
  }
  const kind = fatalActionStatusKind(fatal);
  const label = kind === undefined ? 'unjudged death' : FATAL_STATUS_LABELS[kind];
  lossKinds[label] = (lossKinds[label] || 0) + 1;
}
const modernLosses = Object.values(lossKinds).reduce((s, n) => s + n, 0);
summary.losses = {
  total: games.filter((g) => !isWin(g)).length,
  modernClassified: modernLosses,
  byStatus: Object.fromEntries(Object.entries(lossKinds)
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => [label, { losses: n, share: n / modernLosses }])),
  legacyProvenance: legacyKinds,
  withoutFatalEvaluation: unjudged,
};

//-------GUESS LEDGER: POLICY BY KEY, LUCK CALIBRATION-------

summary.guessPolicy = {};
for (const [key, list] of byKey) {
  const measured = list.filter((g) => Number.isFinite(g.guesses));
  if (measured.length === 0) continue;
  const guessed = measured.filter((g) => g.guesses > 0);
  summary.guessPolicy[key] = {
    gamesWithLedger: measured.length,
    gamesWithAnyGuess: guessed.length,
    guessesPerGame: robust(measured.map((g) => g.guesses)),
    shareOfGuessesOffIdealRisk: guessed.length > 0
      ? guessed.reduce((s, g) => s + g.guessNonideal, 0)
        / guessed.reduce((s, g) => s + g.guesses, 0) : null,
    shareOfGuessesPerfect: guessed.length > 0
      ? guessed.reduce((s, g) => s + g.guessPerfect, 0)
        / guessed.reduce((s, g) => s + g.guesses, 0) : null,
    lifeLostPerGame: robust(measured.map((g) => g.lifeLost)),
    lifeNeedlessPerGame: robust(measured.map((g) => g.lifeNeedless)),
  };
}

// Realized guess deaths against summed modeled risk, Justice-free games
// only (a certified pocket rewrites the outcome). `1 - exp(-lifeLost)` is
// the survival-model approximation for the summed per-guess probabilities;
// exact per-guess products need the trace export.
const guessDeathLabels = new Set(['guess-safe', 'guess-higher', 'guess-min', 'guess-unmeasured']
  .map((kind) => FATAL_STATUS_LABELS[kind]));
const calibration = [
  { label: 'no modeled risk', low: -Infinity, high: 0 },
  { label: '0 – 0.10', low: 0, high: 0.10 },
  { label: '0.10 – 0.25', low: 0.10, high: 0.25 },
  { label: '0.25 – 0.50', low: 0.25, high: 0.50 },
  { label: 'over 0.50', low: 0.50, high: Infinity },
].map((bucket) => ({ ...bucket, games: 0, guessDeaths: 0, expectedDeaths: 0 }));
for (const game of games) {
  if (!Number.isFinite(game.lifeLost) || game.justice !== 0) continue;
  const bucket = calibration.find((b) => game.lifeLost > b.low && game.lifeLost <= b.high)
    || calibration[0];
  bucket.games++;
  bucket.expectedDeaths += 1 - Math.exp(-game.lifeLost);
  if (!isWin(game)) {
    const fatal = fatalEvaluationOf(game);
    const kind = fatal && !fatal.legacy ? fatalActionStatusKind(fatal) : undefined;
    if (kind !== undefined && guessDeathLabels.has(FATAL_STATUS_LABELS[kind])) bucket.guessDeaths++;
  }
}
summary.luckCalibration = calibration.map((b) => ({
  lifeLost: b.label,
  games: b.games,
  realizedGuessDeathRate: wilson(b.guessDeaths, b.games),
  modeledDeathRate: b.games > 0 ? b.expectedDeaths / b.games : null,
}));

//-------STATE TAGS AND MUSIC: PAIRED CONTRASTS WITHIN A KEY-------

summary.stateContrasts = {};
const allStates = [...new Set(games.flatMap((g) => g.states || []))].sort();
for (const state of allStates) {
  summary.stateContrasts[state] = {};
  for (const [key, list] of byKey) {
    const tagged = list.filter((g) => Array.isArray(g.states));
    const withState = tagged.filter((g) => g.states.includes(state));
    const without = tagged.filter((g) => !g.states.includes(state));
    if (withState.length < 10 || without.length < 10) continue;
    summary.stateContrasts[state][key] = {
      with: groupSummary(withState),
      without: groupSummary(without),
    };
  }
}
summary.musicContrasts = {};
for (const [key, list] of byKey) {
  const known = list.filter((g) => typeof g.musicPlaying === 'boolean');
  const on = known.filter((g) => g.musicPlaying);
  const off = known.filter((g) => !g.musicPlaying);
  if (on.length < 10 || off.length < 10) continue;
  summary.musicContrasts[key] = { on: groupSummary(on), off: groupSummary(off) };
}

//-------BOARD SHAPE VS TIME (wins)-------

summary.shapeCorrelations = {};
for (const [key, list] of byKey) {
  const wins = list.filter(isWin);
  if (wins.length < 20) continue;
  summary.shapeCorrelations[key] = {
    wins: wins.length,
    timeVs3bv: spearman(wins.map((g) => g.bv3), wins.map((g) => g.timeMs)),
    timeVsZeros: spearman(wins.map((g) => g.zeroCount), wins.map((g) => g.timeMs)),
    timeVsIslands: spearman(wins.map((g) => g.islandCount), wins.map((g) => g.timeMs)),
    timeVsMousePath: spearman(wins.map((g) => g.mousePathPx), wins.map((g) => g.timeMs)),
    timeVsClicks: spearman(wins.map((g) => g.clicks), wins.map((g) => g.timeMs)),
  };
}

//-------OUTPUT-------

const json = JSON.stringify(summary, null, 2);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json);
} else {
  process.stdout.write(json + '\n');
}

const pct = (r) => r && r.rate !== null ? (r.rate * 100).toFixed(1) + '%' : 'n/a';
const lines = [
  `${summary.totals.games} games, ${summary.totals.wins} wins (${pct(summary.totals.winRate)}) over `
  + `${summary.totals.days} days, ${summary.sessions.length} sessions (gap ${gapMinutes} min)`,
  ...[...byKey].map(([key, list]) => `  ${key}: ${list.length} games, `
    + `win ${pct(summary.byKey[key].winRate)}, median win `
    + (summary.byKey[key].winTimeMs.median === null ? 'n/a'
      : (summary.byKey[key].winTimeMs.median / 1000).toFixed(1) + 's')),
  `losses: ${summary.losses.total} total, ${summary.losses.modernClassified} with complete fatal status, `
  + `${Object.values(summary.losses.legacyProvenance).reduce((s, n) => s + n, 0)} legacy, `
  + `${summary.losses.withoutFatalEvaluation} without evaluation`,
  ...Object.entries(summary.losses.byStatus).map(([label, v]) =>
    `  ${String(v.losses).padStart(5)}  ${(v.share * 100).toFixed(1).padStart(5)}%  ${label}`),
  outPath ? `full summary written to ${outPath}` : '',
];
process.stderr.write(lines.filter((l) => l !== '').join('\n') + '\n');
