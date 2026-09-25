'use strict';

// Session stats, computation and recording: the cross-game series over the
// session window (pure), and the RAM-only capture of play, presses, deaths,
// endings, and the startup backfill from history.

//-------SESSION STATS: COMPUTATION (pure; cross-game running averages)-------

// The recent-observations section (docs/product/session-stats.md): running
// averages over recent actual play, across games, losses and abandoned
// boards included — but only over time a game was actually in progress
// (first reveal to game end), never travel to the restart button or
// between-game idling. Two layers: sessionBucketSeries chops the played
// timeline into fixed buckets and sums each; sessionRunningSeries rolls a
// trailing-lookback window over fine (SESSION_STEP_MS) buckets, so each
// charted point is "the average over the last N minutes of play" — N of
// played time, never wall time. These are observations only; this code
// does not infer mood, condition, play style, or any cause for a change.
//
// Everything here is pure over an event list so it is testable in Node
// (tests/session-buckets-test.js extracts this span). Events, all wall
// clock ms:
// - {kind:'play', from, to} — a finished span of in-progress play; the
//   currently running span is passed separately as opts.openPlayFrom.
// - {kind:'move', at, px} — cursor travel while playing, coalesced into
//   ~1s cells (the sample step is 10s, so cell granularity is invisible).
// - {kind:'press', at, useful, flag, misclick, moving, gapMs} — one board press.
//   useful = it changed the board; flag = it placed a flag; moving = a
//   cursor move landed within 100ms before it (the cadence definition);
//   misclick = the board-changing action contradicted a visible-board fact;
//   gapMs = time since the previous useful press of the same game
//   (undefined on each game's first useful press).
// - {kind:'death', at, mistake} — a lost game; mistake says whether the
//   fatal action carried at least one recorded mistake tag.
// - {kind:'end', at, end, winUnmarked} — a finished game's ending: 'win',
//   a fatal-action status kind (see FATAL_STATUS_LABELS), a legacy
//   verdict kind (see DEATH_KIND_LABELS), or 'other' for an unjudged
//   loss. On a measured win, winUnmarked is the share of the board's
//   mines carrying no flag at the winning instant (0..1); absent
//   otherwise. Feeds the game-endings fraction lines.
// - {kind:'game', modeKey, from, to, px, useful, wasted, misclicks, flags, fatalMistake, fastGapMs, cadenceSpread, end, winUnmarked}
//   — a whole finished game backfilled from its stored record (games
//   played before this page load; see sessionBackfillFromHistory). Its
//   totals spread across its span proportionally to each bucket's
//   overlap — a bucket-level approximation where live events are exact —
//   its play time counts like a 'play' interval, a mistake-tagged death and the
//   ending land in the bucket the game ended in, and the stored per-game
//   fastclick median contributes one gap sample to each bucket it overlaps.
// The running-average sample step: one charted point per this much
// accumulated play. Finer would redraw sub-pixel wiggles; coarser would
// visibly stairstep the shortest (30s) lookback.
const SESSION_STEP_MS = 10 * 1000;
// The game-count smoothing lookback is independent of the shared wall window.
const SESSION_GAME_LOOKBACK_MAX = 50;
const SESSION_MOVE_COALESCE_MS = 1000;
const SESSION_MOVING_PRESS_MS = 100; // press "on the move" (same as cadence)
// A useful-press gap this short qualifies for the fastclick median.
// This is a timing filter only; it assigns no cause to the interval.
const FASTCLICK_MAX_GAP_MS = 1000;
// A bucket needs at least this much in-progress play before its rates are
// measurable: dividing one death by the 50ms sliver of play at a bucket's
// edge prints a 1200/min absurdity that reads as data. Under a second of
// evidence is no evidence — the bucket shows an en dash instead.
const SESSION_MIN_PLAY_MS = 1000;

// Every game ending files into exactly one of these kinds: 'win', a
// modern fatal-action status (the FATAL_STATUS_LABELS keys — the exact
// categories the after-game report uses for its reasons for losing), a
// legacy-imported record's five-way verdict kept as provenance (the
// DEATH_KIND_LABELS keys), or 'other' — an unjudged loss. The endings
// chart draws one cumulative percent line per kind.
const SESSION_END_KINDS = [
  'win',
  'guess-early', 'guess-min', 'guess-higher', 'guess-unmeasured', 'guess-safe',
  'mine-safe', 'mine-forced', 'proof-safe', 'proof-forced',
  'angel', 'forced', 'needless', 'mine', 'chord',
  'other',
];

function sessionMedian(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Quartile spread over median (the same ratio the trace cadence system
// reports per game): 0 = metronomic, larger = burstier. Interpolated
// quartiles; undefined under two gaps or at a zero median.
function sessionGapSpread(gaps) {
  if (gaps.length < 2) return undefined;
  const sorted = [...gaps].sort((a, b) => a - b);
  const q = (p) => {
    const at = (sorted.length - 1) * p;
    const lo = Math.floor(at);
    return sorted[lo] + (at - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
  };
  const median = q(0.5);
  return median > 0 ? (q(0.75) - q(0.25)) / median : undefined;
}

// Selects the newest games by accumulated played duration. Their wall ages
// and the breaks between them are deliberately irrelevant.
function sessionHistorySlice(games, keepMs) {
  let keepFrom = games.length;
  let keptPlayMs = 0;
  while (keepFrom > 0 && keptPlayMs < keepMs) {
    keepFrom--;
    keptPlayMs += games[keepFrom].to - games[keepFrom].from;
  }
  let playOffsetMs = 0;
  for (let i = 0; i < keepFrom; i++) {
    playOffsetMs += games[i].to - games[i].from;
  }
  return { games: games.slice(keepFrom), playOffsetMs };
}

// Keep enough recent play for the all-modes view and independently for
// every exact mode. This prevents a frequently played mode from pushing a
// less frequent current mode out of its selectable played-time window.
function sessionRetainedEvents(events, keepMs) {
  const spans = events
    .filter((ev) => (ev.kind === 'play' || ev.kind === 'game') && ev.to > ev.from)
    .sort((a, b) => a.to - b.to);
  const retained = new Set(sessionHistorySlice(spans, keepMs).games);
  const byMode = new Map();
  for (const span of spans) {
    const key = span.modeKey || '';
    if (!byMode.has(key)) byMode.set(key, []);
    byMode.get(key).push(span);
  }
  for (const modeSpans of byMode.values()) {
    for (const span of sessionHistorySlice(modeSpans, keepMs).games) retained.add(span);
  }
  const completed = new Set(spans.filter((span) => span.kind === 'game'));
  for (const end of events.filter((ev) => ev.kind === 'end')) {
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      if (span.modeKey === end.modeKey && span.from <= end.at && span.to >= end.at) {
        completed.add(span);
        break;
      }
    }
  }
  // A game-count lookback at the earliest visible point needs N completed
  // games before the played-time window, not merely N games before "now".
  // Keep the intervening spans too so the compressed x coordinate remains
  // honest. Apply this globally and per exact mode.
  const retainGamePrefix = (ordered) => {
    const firstKept = ordered.findIndex((span) => retained.has(span));
    if (firstKept <= 0) return;
    let games = 0;
    for (let i = firstKept - 1; i >= 0 && games < SESSION_GAME_LOOKBACK_MAX; i--) {
      retained.add(ordered[i]);
      if (completed.has(ordered[i])) games++;
    }
  };
  retainGamePrefix(spans);
  for (const modeSpans of byMode.values()) retainGamePrefix(modeSpans);
  const modeCutoffs = new Map();
  for (const span of retained) {
    const key = span.modeKey || '';
    modeCutoffs.set(key, Math.min(modeCutoffs.get(key) ?? Infinity, span.from));
  }
  return events.filter((ev) => {
    if (ev.kind === 'play' || ev.kind === 'game') return retained.has(ev);
    const cutoff = modeCutoffs.get(ev.modeKey || '');
    // An active game's point events exist before its play span is closed.
    // With no finished span for that mode yet, they must all survive.
    return cutoff === undefined || ev.at >= cutoff;
  });
}

function sessionEventsForMode(events, exactModeKey, scope) {
  return scope === 'all'
    ? events
    : events.filter((ev) => ev.modeKey === exactModeKey);
}

// The mine count encoded in a mode key ("30x16/99" or "30x16/99@standard").
function minesOfModeKey(key) {
  const mines = Number(key.split('@')[0].split('/')[1]);
  return Number.isFinite(mines) && mines > 0 ? mines : undefined;
}

// The share of the board's mines carrying no flag when a stored win
// ended, derived (never stored) from the flag counters: a flagged cell
// cannot be revealed, so at a win every flag still on the board provably
// sits on a mine, and flags-on-board = flagsPlaced - flagsRemoved. Not
// measured when the counters predate their fields — a nonzero
// flagsPlaced without flagsRemoved coverage cannot give the net.
function recordWinUnmarkedShare(record, mines) {
  if (record.outcome !== 'win' || mines === undefined) return undefined;
  if (typeof record.flagsPlaced !== 'number') return undefined;
  if (record.flagsPlaced !== 0 && typeof record.flagsRemoved !== 'number') {
    return undefined;
  }
  const onBoard = record.flagsPlaced - (record.flagsRemoved || 0);
  return Math.min(1, Math.max(0, (mines - onBoard) / mines));
}

// The per-mark calibration of unused correct marks (decided 2026-08-30):
// among a won game's placed flags, the share never consumed by an accepted
// chord. Chosen as the primary reading because it is dimensionless — per
// game rises with board size and flagging volume, per minute rises with
// playing speed, while this fraction answers "of the marking work done,
// how much was pointless" directly. A markless win is unmeasured (0 of 0),
// never counted as perfect. Works on live 'end' events and backfilled
// 'game' events alike: both carry flags placed and win-only unusedMarks.
function sessionUnusedMarkShare(ev) {
  return ev.end === 'win' && typeof ev.unusedMarks === 'number'
    && typeof ev.flags === 'number' && ev.flags > 0
    ? ev.unusedMarks / ev.flags : undefined;
}

// Collapses all play spans onto one cumulative-play timeline, then buckets
// that timeline. Wall-clock gaps consume no x distance and no bucket time:
// ten played seconds, a five-minute break, and twenty more played seconds
// are one contiguous thirty-second run here. playOffsetMs is the cumulative
// duration of older spans pruned from RAM, preserving bucket alignment.
// Finished buckets are anchored to cumulative played-time multiples; only
// the current partial bucket changes while play continues.
function sessionBucketSeries(events, opts) {
  const spans = [];
  for (const ev of events) {
    if ((ev.kind === 'play' || ev.kind === 'game') && ev.to > ev.from
        && ev.to <= opts.nowMs && (opts.wallFromMs === undefined || ev.to >= opts.wallFromMs)) {
      spans.push({
        from: Math.max(ev.from, opts.wallFromMs === undefined ? ev.from : opts.wallFromMs),
        to: ev.to,
        fullDurationMs: ev.to - ev.from,
        game: ev.kind === 'game' ? ev : null,
        unusedMarks: ev.unusedMarks,
      });
    }
  }
  if (typeof opts.openPlayFrom === 'number' && opts.nowMs > opts.openPlayFrom) {
    spans.push({ from: Math.max(opts.openPlayFrom, opts.wallFromMs === undefined ? opts.openPlayFrom : opts.wallFromMs), to: opts.nowMs, game: null });
  }
  spans.sort((a, b) => a.from - b.from || a.to - b.to);

  let playCursor = opts.playOffsetMs || 0;
  for (const span of spans) {
    span.playFrom = playCursor;
    span.playTo = playCursor + span.to - span.from;
    playCursor = span.playTo;
  }
  const playNowMs = playCursor;
  const windowFrom = playNowMs - opts.windowMs;
  const markerWindowFrom = playNowMs
    - (opts.markerWindowMs === undefined ? opts.windowMs : opts.markerWindowMs);
  const startPlayMs = Math.floor(windowFrom / opts.bucketMs) * opts.bucketMs;
  const bucketCount = Math.max(1, Math.ceil((playNowMs - startPlayMs) / opts.bucketMs));
  const bucketAt = (playAt) => Math.floor((playAt - startPlayMs) / opts.bucketMs);

  const playMs = new Array(bucketCount).fill(0);
  const movePx = new Array(bucketCount).fill(0);
  const useful = new Array(bucketCount).fill(0);
  const wasted = new Array(bucketCount).fill(0);
  const misclickPlayMs = new Array(bucketCount).fill(0);
  const unusedMarkPlayMs = new Array(bucketCount).fill(0);
  const misclickCount = new Array(bucketCount).fill(0);
  const flags = new Array(bucketCount).fill(0);
  const unflags = new Array(bucketCount).fill(0);
  const unusedMarks = new Array(bucketCount).fill(0);
  const unusedMarkGames = new Array(bucketCount).fill(0);
  const avoidableDeaths = new Array(bucketCount).fill(0);
  const categoryCounts = Object.fromEntries(ACTION_CATEGORY_SPECS.map((spec) =>
    [spec.id, new Array(bucketCount).fill(0)]));
  const excessRisk = new Array(bucketCount).fill(0);
  const modeledLifeGap = new Array(bucketCount).fill(0);
  const fastGaps = Array.from({ length: bucketCount }, () => []);
  // Raw useful-press gaps (no fastclick qualification) for the cadence
  // spread. Live events only: a backfilled game's raw gaps are gone (its
  // stored per-game spread still feeds the per-game aggregation).
  const pressGaps = Array.from({ length: bucketCount }, () => []);
  const endCounts = SESSION_END_KINDS.map(() => new Array(bucketCount).fill(0));
  const likelyMisclickCounts = new Array(bucketCount).fill(0);
  // Exact game-end instants stay separate from the bucketed aggregates so
  // every session chart can mark wins and each kind of loss at the true
  // played-time coordinate with the endings chart's semantic color.
  const gameEnds = [];
  const wins = [];
  const addGameEnd = (playAt, ev) => {
    if (playAt < markerWindowFrom || playAt > playNowMs) return;
    const marker = {
      playAt,
      end: ev.end,
      modeKey: ev.modeKey,
      timeMs: ev.timeMs,
      boardKey: ev.boardKey,
      endedAt: ev.endedAt === undefined ? (ev.at === undefined ? ev.to : ev.at) : ev.endedAt,
      likelyMisclick: ev.likelyMisclick === true,
      source: ev,
    };
    gameEnds.push(marker);
    if (ev.end === 'win') wins.push(marker);
  };
  // The unmarked-mines-at-win inputs: per bucket, the sum of measured
  // wins' unmarked-mine shares and how many wins carried the measurement
  // (wins recorded before flag counting stay out of both).
  const winUnmarkedSum = new Array(bucketCount).fill(0);
  const winUnmarkedWins = new Array(bucketCount).fill(0);
  // The per-mark unused-share inputs, same shape: sum of measured wins'
  // unused-mark shares and how many wins carried the measurement
  // (markless wins have no share and stay out of both).
  const unusedShareSum = new Array(bucketCount).fill(0);
  const unusedShareWins = new Array(bucketCount).fill(0);
  const countEnd = (i, end, winUnmarked, unusedShare, likelyMisclick) => {
    if (i < 0 || i >= bucketCount) return;
    const k = SESSION_END_KINDS.indexOf(end);
    endCounts[k >= 0 ? k : SESSION_END_KINDS.indexOf('other')][i]++;
    if (end === 'win' && typeof winUnmarked === 'number') {
      winUnmarkedSum[i] += winUnmarked;
      winUnmarkedWins[i]++;
    }
    if (end === 'win' && typeof unusedShare === 'number') {
      unusedShareSum[i] += unusedShare;
      unusedShareWins[i]++;
    }
    if (likelyMisclick === true) likelyMisclickCounts[i]++;
  };

  const eachPlayOverlap = (from, to, take) => {
    from = Math.max(from, windowFrom);
    to = Math.min(to, playNowMs);
    for (let i = Math.max(0, bucketAt(from)); i < bucketCount; i++) {
      const bucketFrom = startPlayMs + i * opts.bucketMs;
      if (bucketFrom >= to) break;
      take(i, Math.min(to, bucketFrom + opts.bucketMs) - Math.max(from, bucketFrom));
    }
  };

  for (const span of spans) {
    const ev = span.game;
    const measuredUnusedMarks = ev === null
      ? span.unusedMarks
      : (ev.end === 'win' ? ev.unusedMarks : undefined);
    const spanMs = span.fullDurationMs === undefined ? span.playTo - span.playFrom : span.fullDurationMs;
    eachPlayOverlap(span.playFrom, span.playTo, (i, overlapMs) => {
      playMs[i] += overlapMs;
      if (ev === null || typeof ev.misclicks === 'number') {
        misclickPlayMs[i] += overlapMs;
      }
      if (typeof measuredUnusedMarks === 'number') {
        unusedMarkPlayMs[i] += overlapMs;
      }
      if (typeof measuredUnusedMarks === 'number') {
        unusedMarks[i] += measuredUnusedMarks * overlapMs / spanMs;
      }
      if (ev !== null) {
        const share = overlapMs / spanMs;
        movePx[i] += ev.px * share;
        useful[i] += ev.useful * share;
        wasted[i] += ev.wasted * share;
        if (typeof ev.misclicks === 'number') {
          misclickCount[i] += ev.misclicks * share;
        }
        flags[i] += ev.flags * share;
        unflags[i] += (ev.unflags || 0) * share;
        if (ev.categoryCounts) {
          for (const spec of ACTION_CATEGORY_SPECS) {
            categoryCounts[spec.id][i] += (ev.categoryCounts[spec.id] || 0) * share;
          }
          excessRisk[i] += (ev.excessRisk || 0) * share;
          modeledLifeGap[i] += (ev.modeledLifeGap || 0) * share;
        }
        if (typeof ev.fastGapMs === 'number') fastGaps[i].push(ev.fastGapMs);
      }
    });
    if (ev !== null && ev.fatalMistake === true) {
      const i = bucketAt(span.playTo - 1e-6);
      if (i >= 0 && i < bucketCount) avoidableDeaths[i]++;
    }
    // The ending lands in the bucket containing the game's final instant,
    // like the classified death above.
    if (ev !== null && typeof ev.end === 'string') {
      const endBucket = bucketAt(span.playTo - 1e-6);
      countEnd(endBucket, ev.end, ev.winUnmarked, sessionUnusedMarkShare(ev),
        ev.likelyMisclick);
      if (ev.end === 'win' && typeof ev.unusedMarks === 'number'
          && endBucket >= 0 && endBucket < bucketCount) unusedMarkGames[endBucket]++;
      addGameEnd(span.playTo, ev);
    }
  }

  // Maps a live wall-clock event into its containing compressed play span.
  // The first press can precede sessionPlayBegin by a few milliseconds;
  // attach that one to the immediately following span.
  const playAtWallTime = (at) => {
    for (const span of spans) {
      if (at >= span.from && at <= span.to) {
        return Math.min(span.playTo - 1e-6, span.playFrom + at - span.from);
      }
      if (at < span.from && span.from - at <= 100) return span.playFrom;
      if (at < span.from) break;
    }
    return null;
  };

  for (const ev of events) {
    if (ev.kind === 'play' || ev.kind === 'game') continue;
    if (opts.wallFromMs !== undefined && ev.at < opts.wallFromMs) continue;
    const playAt = playAtWallTime(ev.at);
    if (playAt !== null && ev.kind === 'end') addGameEnd(playAt, ev);
    if (playAt === null || playAt < windowFrom || playAt > playNowMs) continue;
    const i = bucketAt(playAt);
    if (i < 0 || i >= bucketCount) continue;
    if (ev.kind === 'move') {
      movePx[i] += ev.px;
    } else if (ev.kind === 'press') {
      if (ev.useful) useful[i]++;
      else wasted[i]++;
      if (ev.misclick) misclickCount[i]++;
      if (ev.flag) flags[i]++;
      if (ev.unflag) unflags[i]++;
      if (ev.useful && ev.gapMs !== undefined) {
        pressGaps[i].push(ev.gapMs);
        if (ev.moving && ev.gapMs <= FASTCLICK_MAX_GAP_MS) {
          fastGaps[i].push(ev.gapMs);
        }
      }
    } else if (ev.kind === 'death' && ev.mistake === true) {
      avoidableDeaths[i]++;
    } else if (ev.kind === 'evaluation') {
      if (categoryCounts[ev.category]) categoryCounts[ev.category][i]++;
      excessRisk[i] += ev.excessRisk || 0;
      modeledLifeGap[i] += ev.modeledLifeGap || 0;
    } else if (ev.kind === 'end') {
      countEnd(i, ev.end, ev.winUnmarked, sessionUnusedMarkShare(ev),
        ev.likelyMisclick);
      if (ev.end === 'win' && typeof ev.unusedMarks === 'number') {
        unusedMarkGames[i]++;
      }
    }
  }
  gameEnds.sort((a, b) => a.playAt - b.playAt);
  wins.sort((a, b) => a.playAt - b.playAt);

  // Game endings are exposed both as cumulative fractions (for running
  // averages) and independent per-bucket fractions (for raw grouping).
  // A fraction of no finished games is undefined, never zero.
  const endFractions = {};
  const rawEndFractions = {};
  for (const kind of SESSION_END_KINDS) {
    endFractions[kind] = new Array(bucketCount).fill(undefined);
    rawEndFractions[kind] = new Array(bucketCount).fill(undefined);
  }
  const endGames = new Array(bucketCount).fill(0);
  const rawEndGames = new Array(bucketCount).fill(0);
  const winUnmarkedFraction = new Array(bucketCount).fill(undefined);
  const rawWinUnmarkedFraction = new Array(bucketCount).fill(undefined);
  const unusedMarkShareFraction = new Array(bucketCount).fill(undefined);
  const rawUnusedMarkShareFraction = new Array(bucketCount).fill(undefined);
  const likelyMisclickFraction = new Array(bucketCount).fill(undefined);
  const rawLikelyMisclickFraction = new Array(bucketCount).fill(undefined);
  {
    const cumulative = new Array(SESSION_END_KINDS.length).fill(0);
    let total = 0;
    let unmarkedSum = 0;
    let unmarkedWins = 0;
    let shareSum = 0;
    let shareWins = 0;
    let likelyMisclicks = 0;
    for (let i = 0; i < bucketCount; i++) {
      const bucketGames = endCounts.reduce((sum, counts) => sum + counts[i], 0);
      rawEndGames[i] = bucketGames;
      if (bucketGames > 0) {
        for (let k = 0; k < SESSION_END_KINDS.length; k++) {
          rawEndFractions[SESSION_END_KINDS[k]][i] = endCounts[k][i] / bucketGames;
        }
        rawLikelyMisclickFraction[i] = likelyMisclickCounts[i] / bucketGames;
      }
      if (winUnmarkedWins[i] > 0) {
        rawWinUnmarkedFraction[i] = winUnmarkedSum[i] / winUnmarkedWins[i];
      }
      if (unusedShareWins[i] > 0) {
        rawUnusedMarkShareFraction[i] = unusedShareSum[i] / unusedShareWins[i];
      }
      for (let k = 0; k < SESSION_END_KINDS.length; k++) {
        cumulative[k] += endCounts[k][i];
        total += endCounts[k][i];
      }
      endGames[i] = total;
      if (total > 0) {
        for (let k = 0; k < SESSION_END_KINDS.length; k++) {
          endFractions[SESSION_END_KINDS[k]][i] = cumulative[k] / total;
        }
      }
      unmarkedSum += winUnmarkedSum[i];
      unmarkedWins += winUnmarkedWins[i];
      shareSum += unusedShareSum[i];
      shareWins += unusedShareWins[i];
      likelyMisclicks += likelyMisclickCounts[i];
      if (unmarkedWins > 0) winUnmarkedFraction[i] = unmarkedSum / unmarkedWins;
      if (shareWins > 0) unusedMarkShareFraction[i] = shareSum / shareWins;
      if (total > 0) likelyMisclickFraction[i] = likelyMisclicks / total;
    }
  }

  const centers = [];
  const speedPxPerSec = [];
  const clicksPerSec = [];
  const avoidablePerMin = [];
  const wastedPerMin = [];
  const misclicksPerMin = [];
  const flagsPerSec = [];
  const mismarksPerMin = [];
  const unusedMarksPerMin = [];
  const fastclickGapMs = [];
  const cadenceSpreadRatio = [];
  const categoryPerMin = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerMin = [];
  const modeledLifeGapPerMin = [];
  const usefulPerGame = [];
  const wastedPerGame = [];
  const misclicksPerGame = [];
  const flagsPerGame = [];
  const mismarksPerGame = [];
  const unusedMarksPerGame = [];
  const avoidablePerGame = [];
  const categoryPerGame = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerGame = [];
  const modeledLifeGapPerGame = [];
  for (let i = 0; i < bucketCount; i++) {
    centers.push(startPlayMs + (i + 0.5) * opts.bucketMs);
    const playedSec = playMs[i] / 1000;
    const enough = playMs[i] >= SESSION_MIN_PLAY_MS;
    speedPxPerSec.push(enough ? movePx[i] / playedSec : undefined);
    clicksPerSec.push(enough ? useful[i] / playedSec : undefined);
    avoidablePerMin.push(enough ? avoidableDeaths[i] / (playedSec / 60) : undefined);
    wastedPerMin.push(enough ? wasted[i] / (playedSec / 60) : undefined);
    const misclickPlayedSec = misclickPlayMs[i] / 1000;
    misclicksPerMin.push(misclickPlayMs[i] >= SESSION_MIN_PLAY_MS
      ? misclickCount[i] / (misclickPlayedSec / 60) : undefined);
    flagsPerSec.push(enough ? flags[i] / playedSec : undefined);
    mismarksPerMin.push(enough ? unflags[i] / (playedSec / 60) : undefined);
    const unusedPlayedSec = unusedMarkPlayMs[i] / 1000;
    unusedMarksPerMin.push(unusedMarkPlayMs[i] >= SESSION_MIN_PLAY_MS
      ? unusedMarks[i] / (unusedPlayedSec / 60) : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerMin[spec.id].push(enough
        ? categoryCounts[spec.id][i] / (playedSec / 60) : undefined);
    }
    excessRiskPctPerMin.push(enough
      ? 100 * excessRisk[i] / (playedSec / 60) : undefined);
    modeledLifeGapPerMin.push(enough
      ? modeledLifeGap[i] / (playedSec / 60) : undefined);
    const games = rawEndGames[i];
    usefulPerGame.push(games > 0 ? useful[i] / games : undefined);
    wastedPerGame.push(games > 0 ? wasted[i] / games : undefined);
    misclicksPerGame.push(games > 0 ? misclickCount[i] / games : undefined);
    flagsPerGame.push(games > 0 ? flags[i] / games : undefined);
    mismarksPerGame.push(games > 0 ? unflags[i] / games : undefined);
    unusedMarksPerGame.push(unusedMarkGames[i] > 0
      ? unusedMarks[i] / unusedMarkGames[i] : undefined);
    avoidablePerGame.push(games > 0 ? avoidableDeaths[i] / games : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerGame[spec.id].push(games > 0
        ? categoryCounts[spec.id][i] / games : undefined);
    }
    excessRiskPctPerGame.push(games > 0 ? 100 * excessRisk[i] / games : undefined);
    modeledLifeGapPerGame.push(games > 0 ? modeledLifeGap[i] / games : undefined);
    fastclickGapMs.push(sessionMedian(fastGaps[i]));
    cadenceSpreadRatio.push(sessionGapSpread(pressGaps[i]));
  }
  return {
    startPlayMs, bucketMs: opts.bucketMs, playNowMs,
    windowMs: opts.windowMs, centers, playMs,
    // The play↔wall mapping behind the compressed x axis, for the
    // "when was this played" provenance strip and day-boundary marks.
    playSpans: spans.map((span) => ({
      playFrom: span.playFrom,
      playTo: span.playTo,
      from: span.from,
      to: span.to,
    })),
    speedPxPerSec, clicksPerSec, avoidablePerMin, wastedPerMin, misclicksPerMin, flagsPerSec,
    mismarksPerMin, unusedMarksPerMin, fastclickGapMs, cadenceSpreadRatio,
    endFractions, endGames, winUnmarkedFraction, unusedMarkShareFraction,
    likelyMisclickFraction,
    rawEndFractions, rawEndGames, rawWinUnmarkedFraction,
    rawUnusedMarkShareFraction, rawLikelyMisclickFraction,
    wins, gameEnds,
    categoryPerMin, excessRiskPctPerMin, modeledLifeGapPerMin,
    usefulPerGame, wastedPerGame, misclicksPerGame, flagsPerGame,
    mismarksPerGame, unusedMarksPerGame, avoidablePerGame, categoryPerGame,
    excessRiskPctPerGame, modeledLifeGapPerGame,
    // The raw per-bucket accumulations behind the rates, for layers that
    // aggregate across buckets (sessionRunningSeries) — rates can't be
    // re-averaged without their weights.
    sums: { playMs, movePx, useful, wasted, misclickPlayMs, unusedMarkPlayMs,
      misclickCount, flags, unflags, unusedMarks, unusedMarkGames,
      avoidableDeaths, categoryCounts, excessRisk,
      modeledLifeGap, fastGaps, pressGaps, endCounts, likelyMisclickCounts,
      winUnmarkedSum, winUnmarkedWins, unusedShareSum, unusedShareWins },
  };
}

// Independent played-time buckets. Rates use only each bucket's own raw
// totals; ending percentages likewise describe that bucket rather than the
// cumulative window. The selected grouping length is still played time.
function sessionRawSeries(events, opts) {
  const raw = sessionBucketSeries(events, {
    nowMs: opts.nowMs,
    wallFromMs: opts.wallFromMs,
    bucketMs: opts.bucketMs,
    windowMs: opts.windowMs,
    openPlayFrom: opts.openPlayFrom,
    playOffsetMs: opts.playOffsetMs,
  });
  return {
    ...raw,
    stepMs: opts.bucketMs,
    lookbackMs: opts.bucketMs,
    endFractions: raw.rawEndFractions,
    endGames: raw.rawEndGames,
    winUnmarkedFraction: raw.rawWinUnmarkedFraction,
    unusedMarkShareFraction: raw.rawUnusedMarkShareFraction,
    likelyMisclickFraction: raw.rawLikelyMisclickFraction,
  };
}

// Per-game mode samples completed games rather than slicing them by time.
// The x axis remains compressed played time so the player can still locate
// changes within the selected session window. A running point averages the
// last N completed games; raw mode uses disjoint N-game groups.
function sessionGameSeries(events, opts) {
  const timeline = sessionBucketSeries(events, {
    nowMs: opts.nowMs,
    wallFromMs: opts.wallFromMs,
    bucketMs: SESSION_STEP_MS,
    windowMs: opts.windowMs,
    markerWindowMs: Infinity,
    openPlayFrom: opts.openPlayFrom,
    playOffsetMs: opts.playOffsetMs,
  });
  const visibleFrom = timeline.playNowMs - opts.windowMs;
  const finished = timeline.gameEnds
    .filter((game) => game.source !== undefined)
    .sort((a, b) => a.playAt - b.playAt);
  const grouped = [];
  if (opts.aggregation === 'raw') {
    for (let i = 0; i < finished.length; i += opts.lookbackGames) {
      const games = finished.slice(i, i + opts.lookbackGames);
      if (games[games.length - 1].playAt >= visibleFrom) grouped.push(games);
    }
  } else {
    for (let i = 0; i < finished.length; i++) {
      if (finished[i].playAt < visibleFrom) continue;
      grouped.push(finished.slice(Math.max(0, i - opts.lookbackGames + 1), i + 1));
    }
  }

  const centers = [];
  const playMs = [];
  const speedPxPerSec = [];
  const fastclickGapMs = [];
  const cadenceSpreadRatio = [];
  const usefulPerGame = [];
  const wastedPerGame = [];
  const misclicksPerGame = [];
  const flagsPerGame = [];
  const mismarksPerGame = [];
  const unusedMarksPerGame = [];
  const avoidablePerGame = [];
  const categoryPerGame = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerGame = [];
  const modeledLifeGapPerGame = [];
  const endFractions = Object.fromEntries(
    SESSION_END_KINDS.map((kind) => [kind, []]));
  const endGames = [];
  const winUnmarkedFraction = [];
  const unusedMarkShareFraction = [];
  const likelyMisclickFraction = [];
  const average = (games, of) => {
    const measured = games.map((game) => of(game.source))
      .filter((value) => typeof value === 'number');
    return measured.length === 0
      ? undefined : measured.reduce((sum, value) => sum + value, 0) / measured.length;
  };
  for (const games of grouped) {
    const sources = games.map((game) => game.source);
    const durationMs = sources.reduce((sum, source) =>
      sum + (typeof source.to === 'number' && typeof source.from === 'number'
        ? source.to - source.from : source.timeMs || 0), 0);
    const movePx = sources.reduce((sum, source) =>
      sum + (source.movePx === undefined ? source.px || 0 : source.movePx), 0);
    centers.push(games[games.length - 1].playAt);
    playMs.push(durationMs);
    speedPxPerSec.push(durationMs > 0 ? movePx / (durationMs / 1000) : undefined);
    fastclickGapMs.push(sessionMedian(sources
      .map((source) => source.fastGapMs)
      .filter((value) => typeof value === 'number')));
    cadenceSpreadRatio.push(sessionMedian(sources
      .map((source) => source.cadenceSpread)
      .filter((value) => typeof value === 'number')));
    usefulPerGame.push(average(games, (source) => source.useful));
    wastedPerGame.push(average(games, (source) => source.wasted));
    misclicksPerGame.push(average(games, (source) => source.misclicks));
    flagsPerGame.push(average(games, (source) => source.flags));
    mismarksPerGame.push(average(games, (source) => source.unflags));
    unusedMarksPerGame.push(average(games, (source) =>
      source.end === 'win' ? source.unusedMarks : undefined));
    avoidablePerGame.push(sources.filter((source) => source.fatalMistake === true).length
      / games.length);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerGame[spec.id].push(average(games, (source) =>
        source.categoryCounts && source.categoryCounts[spec.id]));
    }
    excessRiskPctPerGame.push(average(games, (source) =>
      typeof source.excessRisk === 'number' ? source.excessRisk * 100 : undefined));
    modeledLifeGapPerGame.push(average(games, (source) => source.modeledLifeGap));
    endGames.push(games.length);
    for (const kind of SESSION_END_KINDS) {
      endFractions[kind].push(
        games.filter((game) => game.end === kind).length / games.length);
    }
    const unmarked = sources.map((source) => source.winUnmarked)
      .filter((value) => typeof value === 'number');
    winUnmarkedFraction.push(unmarked.length === 0 ? undefined
      : unmarked.reduce((sum, value) => sum + value, 0) / unmarked.length);
    const unusedShares = sources.map((source) => sessionUnusedMarkShare(source))
      .filter((value) => typeof value === 'number');
    unusedMarkShareFraction.push(unusedShares.length === 0 ? undefined
      : unusedShares.reduce((sum, value) => sum + value, 0) / unusedShares.length);
    likelyMisclickFraction.push(
      sources.filter((source) => source.likelyMisclick === true).length / games.length);
  }
  const visibleEnds = timeline.gameEnds.filter((game) => game.playAt >= visibleFrom);
  return {
    stepMs: undefined,
    lookbackGames: opts.lookbackGames,
    playNowMs: timeline.playNowMs,
    windowMs: opts.windowMs,
    playSpans: timeline.playSpans,
    centers,
    playMs,
    speedPxPerSec,
    fastclickGapMs,
    cadenceSpreadRatio,
    usefulPerGame,
    wastedPerGame,
    misclicksPerGame,
    flagsPerGame,
    mismarksPerGame,
    unusedMarksPerGame,
    avoidablePerGame,
    categoryPerGame,
    excessRiskPctPerGame,
    modeledLifeGapPerGame,
    endFractions,
    endGames,
    winUnmarkedFraction,
    unusedMarkShareFraction,
    likelyMisclickFraction,
    gameEnds: visibleEnds,
    wins: visibleEnds.filter((game) => game.end === 'win'),
  };
}

// The trailing running average the charts actually show: one sample per
// SESSION_STEP_MS of accumulated play, each averaging the lookback of
// played time behind it ("5m" = five played minutes, never wall time).
// Built as rolling prefix-sum windows over sessionBucketSeries' fine
// buckets, so a finished sample never changes as play continues — only
// the newest, still-accumulating one does — and a young session simply
// averages the play that exists so far. Rates divide by the played time
// actually covered, and under SESSION_MIN_PLAY_MS of it stays undefined.
// The endings fractions ignore the lookback entirely: they remain each
// kind's cumulative share of the games finished so far in the chart
// window, resampled at the same positions.
// opts: {nowMs, stepMs, lookbackMs, windowMs, openPlayFrom, playOffsetMs}.
function sessionRunningSeries(events, opts) {
  const fine = sessionBucketSeries(events, {
    nowMs: opts.nowMs,
    wallFromMs: opts.wallFromMs,
    bucketMs: opts.stepMs,
    // Reach one lookback past the chart window so the earliest visible
    // sample still averages its full trailing lookback.
    windowMs: opts.windowMs + opts.lookbackMs,
    openPlayFrom: opts.openPlayFrom,
    playOffsetMs: opts.playOffsetMs,
  });
  const sums = fine.sums;
  const lookbackBuckets = Math.max(1, Math.round(opts.lookbackMs / opts.stepMs));
  const prefix = (arr) => {
    const p = new Array(arr.length + 1).fill(0);
    for (let i = 0; i < arr.length; i++) p[i + 1] = p[i] + arr[i];
    return p;
  };
  const pPlay = prefix(sums.playMs);
  const pMove = prefix(sums.movePx);
  const pUseful = prefix(sums.useful);
  const pWasted = prefix(sums.wasted);
  const pMisPlay = prefix(sums.misclickPlayMs);
  const pUnusedMarkPlay = prefix(sums.unusedMarkPlayMs);
  const pMis = prefix(sums.misclickCount);
  const pFlags = prefix(sums.flags);
  const pUnflags = prefix(sums.unflags);
  const pUnusedMarks = prefix(sums.unusedMarks);
  const pUnusedMarkGames = prefix(sums.unusedMarkGames);
  const pAvoidable = prefix(sums.avoidableDeaths);
  const pGames = prefix(sums.endCounts.reduce((totals, counts) =>
    totals.map((total, i) => total + counts[i]),
  new Array(sums.playMs.length).fill(0)));
  const pCategoryCounts = Object.fromEntries(ACTION_CATEGORY_SPECS.map((spec) =>
    [spec.id, prefix(sums.categoryCounts[spec.id])]));
  const pExcessRisk = prefix(sums.excessRisk);
  const pModeledLifeGap = prefix(sums.modeledLifeGap);
  const roll = (p, k) => p[k + 1] - p[Math.max(0, k - lookbackBuckets + 1)];

  const windowFrom = fine.playNowMs - opts.windowMs;
  const centers = [];
  const playMs = [];
  const speedPxPerSec = [];
  const clicksPerSec = [];
  const avoidablePerMin = [];
  const wastedPerMin = [];
  const misclicksPerMin = [];
  const flagsPerSec = [];
  const mismarksPerMin = [];
  const unusedMarksPerMin = [];
  const fastclickGapMs = [];
  const cadenceSpreadRatio = [];
  const categoryPerMin = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerMin = [];
  const modeledLifeGapPerMin = [];
  const usefulPerGame = [];
  const wastedPerGame = [];
  const misclicksPerGame = [];
  const flagsPerGame = [];
  const mismarksPerGame = [];
  const unusedMarksPerGame = [];
  const avoidablePerGame = [];
  const categoryPerGame = Object.fromEntries(
    ACTION_CATEGORY_SPECS.map((spec) => [spec.id, []]));
  const excessRiskPctPerGame = [];
  const modeledLifeGapPerGame = [];
  const endFractions = {};
  for (const kind of SESSION_END_KINDS) endFractions[kind] = [];
  const endGames = [];
  const winUnmarkedFraction = [];
  const unusedMarkShareFraction = [];
  const likelyMisclickFraction = [];
  const endCumulative = new Array(SESSION_END_KINDS.length).fill(0);
  let endTotal = 0;
  let unmarkedSum = 0;
  let unmarkedWins = 0;
  let shareSum = 0;
  let shareWins = 0;
  let likelyMisclicks = 0;
  for (let k = 0; k < sums.playMs.length; k++) {
    // The sample sits at its fine bucket's right edge; the newest one
    // rides the current play position instead.
    const pos = Math.min(fine.startPlayMs + (k + 1) * opts.stepMs, fine.playNowMs);
    if (pos < windowFrom) continue; // lookback-only reach, not charted
    for (let j = 0; j < SESSION_END_KINDS.length; j++) {
      endCumulative[j] += sums.endCounts[j][k];
      endTotal += sums.endCounts[j][k];
    }
    unmarkedSum += sums.winUnmarkedSum[k];
    unmarkedWins += sums.winUnmarkedWins[k];
    shareSum += sums.unusedShareSum[k];
    shareWins += sums.unusedShareWins[k];
    likelyMisclicks += sums.likelyMisclickCounts[k];
    centers.push(pos);
    const playedMs = roll(pPlay, k);
    const playedSec = playedMs / 1000;
    const enough = playedMs >= SESSION_MIN_PLAY_MS;
    playMs.push(playedMs);
    speedPxPerSec.push(enough ? roll(pMove, k) / playedSec : undefined);
    clicksPerSec.push(enough ? roll(pUseful, k) / playedSec : undefined);
    avoidablePerMin.push(enough ? roll(pAvoidable, k) / (playedSec / 60) : undefined);
    wastedPerMin.push(enough ? roll(pWasted, k) / (playedSec / 60) : undefined);
    const misPlayedMs = roll(pMisPlay, k);
    misclicksPerMin.push(misPlayedMs >= SESSION_MIN_PLAY_MS
      ? roll(pMis, k) / (misPlayedMs / 60000) : undefined);
    flagsPerSec.push(enough ? roll(pFlags, k) / playedSec : undefined);
    mismarksPerMin.push(enough ? roll(pUnflags, k) / (playedSec / 60) : undefined);
    const unusedPlayedMs = roll(pUnusedMarkPlay, k);
    unusedMarksPerMin.push(unusedPlayedMs >= SESSION_MIN_PLAY_MS
      ? roll(pUnusedMarks, k) / (unusedPlayedMs / 60000) : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerMin[spec.id].push(enough
        ? roll(pCategoryCounts[spec.id], k) / (playedSec / 60) : undefined);
    }
    excessRiskPctPerMin.push(enough
      ? 100 * roll(pExcessRisk, k) / (playedSec / 60) : undefined);
    modeledLifeGapPerMin.push(enough
      ? roll(pModeledLifeGap, k) / (playedSec / 60) : undefined);
    const games = roll(pGames, k);
    usefulPerGame.push(games > 0 ? roll(pUseful, k) / games : undefined);
    wastedPerGame.push(games > 0 ? roll(pWasted, k) / games : undefined);
    misclicksPerGame.push(games > 0 ? roll(pMis, k) / games : undefined);
    flagsPerGame.push(games > 0 ? roll(pFlags, k) / games : undefined);
    mismarksPerGame.push(games > 0 ? roll(pUnflags, k) / games : undefined);
    const measuredUnusedGames = roll(pUnusedMarkGames, k);
    unusedMarksPerGame.push(measuredUnusedGames > 0
      ? roll(pUnusedMarks, k) / measuredUnusedGames : undefined);
    avoidablePerGame.push(games > 0 ? roll(pAvoidable, k) / games : undefined);
    for (const spec of ACTION_CATEGORY_SPECS) {
      categoryPerGame[spec.id].push(games > 0
        ? roll(pCategoryCounts[spec.id], k) / games : undefined);
    }
    excessRiskPctPerGame.push(games > 0
      ? 100 * roll(pExcessRisk, k) / games : undefined);
    modeledLifeGapPerGame.push(games > 0
      ? roll(pModeledLifeGap, k) / games : undefined);
    const gaps = [];
    const rawGaps = [];
    for (let j = Math.max(0, k - lookbackBuckets + 1); j <= k; j++) {
      gaps.push(...sums.fastGaps[j]);
      rawGaps.push(...sums.pressGaps[j]);
    }
    fastclickGapMs.push(sessionMedian(gaps));
    cadenceSpreadRatio.push(sessionGapSpread(rawGaps));
    endGames.push(endTotal);
    for (let j = 0; j < SESSION_END_KINDS.length; j++) {
      endFractions[SESSION_END_KINDS[j]].push(
        endTotal > 0 ? endCumulative[j] / endTotal : undefined);
    }
    winUnmarkedFraction.push(
      unmarkedWins > 0 ? unmarkedSum / unmarkedWins : undefined);
    unusedMarkShareFraction.push(
      shareWins > 0 ? shareSum / shareWins : undefined);
    likelyMisclickFraction.push(
      endTotal > 0 ? likelyMisclicks / endTotal : undefined);
  }
  return {
    stepMs: opts.stepMs, lookbackMs: opts.lookbackMs,
    playNowMs: fine.playNowMs, windowMs: opts.windowMs,
    playSpans: fine.playSpans,
    centers, playMs,
    speedPxPerSec, clicksPerSec, avoidablePerMin, wastedPerMin,
    misclicksPerMin, flagsPerSec, mismarksPerMin, unusedMarksPerMin,
    fastclickGapMs, cadenceSpreadRatio,
    categoryPerMin, excessRiskPctPerMin, modeledLifeGapPerMin,
    usefulPerGame, wastedPerGame, misclicksPerGame, flagsPerGame,
    mismarksPerGame, unusedMarksPerGame, avoidablePerGame, categoryPerGame,
    excessRiskPctPerGame, modeledLifeGapPerGame,
    endFractions, endGames, winUnmarkedFraction, unusedMarkShareFraction,
    likelyMisclickFraction,
    gameEnds: fine.gameEnds.filter((game) =>
      game.playAt >= windowFrom && game.playAt <= fine.playNowMs),
    wins: fine.wins.filter((win) =>
      win.playAt >= windowFrom && win.playAt <= fine.playNowMs),
  };
}

// Auto-range a session chart around the values it actually shows. Zero is
// no longer a mandatory floor: a positive series can use the plot's height
// to expose its variation. A measured zero remains in range, nonnegative
// data never gets a meaningless negative floor, and a flat series receives
// enough symmetric room to remain visible.
function sessionYDomain(values) {
  const measured = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (measured.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...measured);
  const max = Math.max(...measured);
  if (min === max) {
    if (min === 0) return { min: 0, max: 1 };
    const pad = Math.max(Math.abs(min) * 0.08, 1e-6);
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  return {
    min: min >= 0 ? Math.max(0, min - pad) : min - pad,
    max: max + pad,
  };
}

// Real-world provenance of the visible played-time window (2026-08-30):
// the compressed play axis hides when the play actually happened, so the
// window is cut into wall-clock sections. A new section starts wherever
// play resumed after a real break of SESSION_SECTION_BREAK_MS or more,
// and always at local midnight, so "30m today + 30m yesterday" reads as
// exactly that. Each section maps a contiguous play-coordinate interval
// to the contiguous wall-clock interval it came from.
const SESSION_SECTION_BREAK_MS = 15 * 60 * 1000;

function sessionLocalDayStart(wallMs) {
  const d = new Date(wallMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sessionWallSections(playSpans, playFrom, playTo) {
  const pieces = [];
  for (const span of playSpans || []) {
    const clipFrom = Math.max(span.playFrom, playFrom);
    const clipTo = Math.min(span.playTo, playTo);
    if (clipTo <= clipFrom) continue;
    // Within a span, play time and wall time advance together.
    let pCursor = clipFrom;
    let wCursor = span.from + (clipFrom - span.playFrom);
    const wallEnd = span.from + (clipTo - span.playFrom);
    while (wCursor < wallEnd) {
      const day = new Date(wCursor);
      const nextMidnight = new Date(
        day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      const pieceWallTo = Math.min(wallEnd, nextMidnight);
      const length = pieceWallTo - wCursor;
      pieces.push({
        playFrom: pCursor,
        playTo: pCursor + length,
        wallFrom: wCursor,
        wallTo: pieceWallTo,
      });
      pCursor += length;
      wCursor = pieceWallTo;
    }
  }
  pieces.sort((a, b) => a.playFrom - b.playFrom);
  const sections = [];
  for (const piece of pieces) {
    const prev = sections[sections.length - 1];
    // Merge a continuation: same local day, resumed within the break
    // threshold. wallTo is exclusive, so the day a section belongs to is
    // read just inside its end.
    if (prev !== undefined
        && piece.wallFrom - prev.wallTo < SESSION_SECTION_BREAK_MS
        && sessionLocalDayStart(piece.wallFrom)
          === sessionLocalDayStart(Math.max(prev.wallFrom, prev.wallTo - 1))) {
      prev.playTo = piece.playTo;
      prev.wallTo = piece.wallTo;
    } else {
      sections.push({ ...piece });
    }
  }
  return sections;
}

//-------SESSION STATS: RECORDING (event capture into RAM)-------

// Live events are RAM-only, but the window survives reloads: on load,
// sessionBackfillFromHistory reconstructs the selectable wall window from stored game
// records (one coarse 'game' event per record), so a reload mid-session
// keeps the running averages. Stored traces and records remain the
// ground truth every value here could be recomputed from.
let sessionEvents = [];
let sessionPlayOffsetMs = 0;
let sessionPlayFrom = null;          // Date.now() when 'playing' began, or null
let sessionPlayModeKey = null;       // exact mode frozen when the span begins
let sessionLastMoveAt = 0;           // wall time of the last cursor move
let sessionLastUsefulPressAt = null; // live useful-press timing
let gameLastUsefulPressAt = null;    // per-game gaps never cross games
let gameSessionEndEvent = null;
let gameFastclickGaps = [];          // this game's qualifying gaps, for the
                                     // per-game fastclickGapMs record field

function sessionEventModeKey() {
  return sessionPlayModeKey === null ? modeKey() : sessionPlayModeKey;
}

function sessionPrune(nowMs) {
  const from = SessionScope.earliest(nowMs);
  sessionEvents = sessionEvents.filter((ev) => (ev.to === undefined ? ev.at : ev.to) >= from);
}

function sessionPlayBegin() {
  if (sessionPlayFrom !== null) return;
  sessionPlayFrom = Date.now();
  sessionPlayModeKey = modeKey();
  scheduleMetricsUpdate({ session: true });
}

function sessionPlayEnd() {
  if (sessionPlayFrom === null) return;
  const play = {
    kind: 'play',
    modeKey: sessionPlayModeKey,
    from: sessionPlayFrom,
    to: Date.now(),
  };
  for (let i = sessionEvents.length - 1; i >= 0; i--) {
    const event = sessionEvents[i];
    if (event.at < sessionPlayFrom) break;
    if (event.kind === 'end' && event.modeKey === sessionPlayModeKey
        && typeof event.unusedMarks === 'number') {
      play.unusedMarks = event.unusedMarks;
      break;
    }
  }
  sessionEvents.push(play);
  sessionPlayFrom = null;
  sessionPlayModeKey = null;
  scheduleMetricsUpdate({ session: true });
}

// Cursor travel while playing, coalesced: consecutive movement within the
// same ~1s cell mutates the latest event instead of pushing a new one, so
// an hour of play stays a few thousand events, not a million.
function sessionRecordMove(px) {
  const now = Date.now();
  const last = sessionEvents[sessionEvents.length - 1];
  if (last !== undefined && last.kind === 'move'
      && last.modeKey === sessionEventModeKey()
      && now - last.at < SESSION_MOVE_COALESCE_MS) {
    last.px += px;
    scheduleMetricsUpdate({ session: true });
    return;
  }
  sessionEvents.push({ kind: 'move', modeKey: sessionEventModeKey(), at: now, px: px });
  scheduleMetricsUpdate({ session: true });
}

function sessionRecordPress(useful, flagPlaced, flagRemoved, misclick) {
  const now = Date.now();
  const press = {
    kind: 'press',
    modeKey: sessionEventModeKey(),
    at: now,
    useful: useful,
    flag: flagPlaced,
    unflag: flagRemoved === true,
    misclick: misclick === true,
    moving: now - sessionLastMoveAt <= SESSION_MOVING_PRESS_MS,
    gapMs: undefined,
  };
  if (useful) {
    if (sessionLastUsefulPressAt !== null) press.gapMs = now - sessionLastUsefulPressAt;
    sessionLastUsefulPressAt = now;
    // The same qualification the bucketed series uses, collected per game
    // for the record's fastclickGapMs (its median).
    const gameGapMs = gameLastUsefulPressAt === null
      ? undefined : now - gameLastUsefulPressAt;
    gameLastUsefulPressAt = now;
    if (press.moving && gameGapMs !== undefined
        && gameGapMs <= FASTCLICK_MAX_GAP_MS) {
      gameFastclickGaps.push(gameGapMs);
    }
  }
  sessionEvents.push(press);
  scheduleMetricsUpdate({ session: true });
}

function sessionRecordDeath(mistake) {
  sessionEvents.push({
    kind: 'death', modeKey: sessionEventModeKey(), at: Date.now(), mistake: mistake,
  });
  scheduleMetricsUpdate({ session: true });
}

function sessionRecordEvaluation(evaluation) {
  const category = actionEvaluationCategory(evaluation);
  if (!category) return;
  sessionEvents.push({
    kind: 'evaluation',
    modeKey: sessionEventModeKey(),
    at: Date.now(),
    category,
    excessRisk: category === 'gameRisk'
      ? (evaluationRiskDelta(evaluation) || 0) : 0,
    modeledLifeGap: Array.isArray(evaluation.mistakes)
      && evaluation.mistakes.includes('chose-lower-modeled-life')
      ? (evaluationLifeGap(evaluation) || 0) : 0,
  });
  scheduleMetricsUpdate({ session: true });
}

// One ending per finished game ('win', a fatal-action status kind, a
// legacy verdict kind, or 'other'), recorded while the play span is
// still open so it lands inside it. On a win, winUnmarked carries the
// share of the board's mines that had no flag at the winning instant.
function sessionRecordEnd(end, winUnmarked) {
  const now = Date.now();
  finishOpenFlagEpisodes(end === 'win');
  const actionSummary = actionCategorySummary(actionEvaluations);
  const fatal = fatalEvaluationOf({ actionEvaluations });
  const event = {
    kind: 'end',
    modeKey: sessionEventModeKey(),
    at: now,
    end: end,
    timeMs: elapsedMs(),
    boardKey: boardKey(),
    endedAt: now,
    movePx: mousePathPx,
    useful: clickCount,
    wasted: wastedClicks,
    misclicks: misclicks,
    flags: flagsPlaced,
    unflags: flagsRemoved,
    fatalMistake: evaluationHasMistake(fatal),
    likelyMisclick: Array.isArray(fatal && fatal.mistakes)
      && fatal.mistakes.includes('likely-misclick-after-wrong-flag'),
    categoryCounts: actionSummary.counts,
    excessRisk: actionSummary.excessRisk,
    modeledLifeGap: actionSummary.modeledLifeGap,
    fastGapMs: sessionMedian(gameFastclickGaps),
  };
  if (end === 'win') event.unusedMarks = unusedCorrectFlags;
  if (typeof winUnmarked === 'number') event.winUnmarked = winUnmarked;
  sessionEvents.push(event);
  gameSessionEndEvent = event;
  scheduleMetricsUpdate({ session: true });
}

// Backfill the maximum selectable shared wall window from saved records.
// Called once from init(), before any live event can exist.
// Bucket-level approximation: a record holds totals, not timestamps, so
// the totals spread evenly over the game's span — the traces hold the
// exact timing if a finer backfill is ever wanted. Fields that joined
// the schema later may be absent on old records.
function sessionBackfillFromHistory() {
  const games = [];
  const earliest = SessionScope.earliest(Date.now());
  for (const [historyModeKey, records] of Object.entries(history)) {
    const mines = minesOfModeKey(historyModeKey);
    for (const record of records) {
      if (record.timeMs <= 0) continue;
      const from = record.endedAt - record.timeMs;
      if (record.endedAt < earliest) continue;
      const actionSummary = actionCategorySummary(record.actionEvaluations);
      const fatal = fatalEvaluationOf(record);
      games.push({
        kind: 'game',
        modeKey: historyModeKey,
        from,
        to: record.endedAt,
        px: record.mousePathPx,
        useful: record.clicks,
        wasted: record.wastedClicks || 0,
        misclicks: record.misclicks,
        flags: record.flagsPlaced || 0,
        unflags: record.flagsRemoved || 0,
        ...(record.outcome === 'win' && typeof record.unusedCorrectFlags === 'number'
          ? { unusedMarks: record.unusedCorrectFlags } : {}),
        fatalMistake: evaluationHasMistake(fatal),
        likelyMisclick: Array.isArray(fatal && fatal.mistakes)
          && fatal.mistakes.includes('likely-misclick-after-wrong-flag'),
        categoryCounts: actionSummary.counts,
        excessRisk: actionSummary.excessRisk,
        modeledLifeGap: actionSummary.modeledLifeGap,
        fastGapMs: record.fastclickGapMs,
        cadenceSpread: record.cadenceSpread,
        end: record.outcome === 'win' ? 'win'
          : sessionEndingKind(fatal),
        winUnmarked: recordWinUnmarkedShare(record, mines),
        timeMs: record.timeMs,
        boardKey: historyModeKey.split('@')[0],
        endedAt: record.endedAt,
      });
    }
  }
  games.sort((a, b) => a.to - b.to);
  sessionPlayOffsetMs = 0;
  sessionEvents.unshift(...games);
  sessionChartsDirty = true;
}
