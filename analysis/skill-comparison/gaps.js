'use strict';
// Gap ranking (plan v2): how many seconds per game the player would save if one
// skill matched a faster level, everything else staying the player's own.
//
// Each of the player's games is split into parts: for every move with a
// measured movement (situations.js), its thinking time (reaction plus hover)
// and its travel; gaps longer than DECISION_GAP_MAX_MS as long pauses; and the
// rest of the gaps unchanged. One skill at a time is replaced with a target
// level's value for the same situation:
//   thinking    the level's mean thinking time for the same kind of move
//               (reveal, flag, or chord), logic, and freshness;
//   travel      the level's mean travel for the same distance;
// Means, not medians: the player's own total includes the player's slow
// moves, so the level's value must include the level's slow moves too.
//   pauses      the level's long-pause seconds per 3BV, times the game's 3BV;
//   clicks      the level's effective clicks per 3BV: the game's per-click time
//               is kept and the number of clicks scaled to the level's.
// Seconds saved are per game, averaged over the player's games; "all" applies
// every replacement together (the click scaling applies to the replaced
// per-click times, so the parts do not simply add). A move of a kind the target
// level makes fewer than MIN_CLASS_MOVES times has no comparable value there
// and keeps the player's own time; the report counts those moves, so savings
// err low rather than borrowing another situation's value.
//
// Usage: node gaps.js OUT.json GAMES.jsonl [GAMES.jsonl ...]

const fs = require('fs');
const S = require('./situations.js');

const TRAVEL_BUCKETS = [[1, 2], [2, 4], [4, 8], [8, Infinity]];
const TARGETS = ['1.8-2.2', '2.6-3', '3-3.5'];
const MIN_CLASS_MOVES = 20;

function thinkClass(d) {
  if (d.kind === 'chord') return 'chord';
  if (d.logic !== 'one' && d.logic !== 'two') return `${d.kind}-other`;
  return `${d.kind}-${d.logic}-${d.fresh ? 'fresh' : 'queued'}`;
}

function travelClass(d) {
  const index = TRAVEL_BUCKETS.findIndex(([low, high]) => d.distance >= low && d.distance < high);
  return `travel-${index}`;
}

const measured = (d) => d.think !== undefined && d.gap <= S.DECISION_GAP_MAX_MS;

// Per-level medians by situation, long-pause rate, and click rate.
function levelModel(games) {
  const think = new Map();
  const travel = new Map();
  let longPauseMs = 0;
  let bv3 = 0;
  let effective = 0;
  for (const g of games) {
    bv3 += g.bv3;
    effective += g.effective;
    for (const d of g.decisions) {
      if (d.gap > S.DECISION_GAP_MAX_MS) longPauseMs += d.gap;
      if (!measured(d)) continue;
      const t = thinkClass(d);
      const v = travelClass(d);
      if (!think.has(t)) think.set(t, []);
      if (!travel.has(v)) travel.set(v, []);
      think.get(t).push(d.think);
      travel.get(v).push(d.travel);
    }
  }
  const means = (map) => new Map([...map].map(([k, list]) => [k, { mean: list.reduce((s, v) => s + v, 0) / list.length, n: list.length }]));
  return { think: means(think), travel: means(travel), longPauseMsPer3BV: longPauseMs / bv3, effectivePer3BV: effective / bv3 };
}

// The target's value for a situation, or null when it has too few moves there.
function comparable(map, key) {
  const entry = map.get(key);
  return entry !== undefined && entry.n >= MIN_CLASS_MOVES ? entry.mean : null;
}

// One game's time rebuilt with the chosen replacements, and how many of its
// moves kept the player's own value for lack of a comparable one.
function rebuilt(game, target, replace) {
  let perClickMs = 0;
  let longPauseMs = 0;
  let otherMs = 0;
  let kept = 0;
  for (const d of game.decisions) {
    if (d.gap > S.DECISION_GAP_MAX_MS) {
      longPauseMs += d.gap;
      continue;
    }
    if (!measured(d)) {
      otherMs += d.gap;
      continue;
    }
    let think = d.think;
    let travel = d.travel;
    if (replace.thinking) {
      const value = comparable(target.think, thinkClass(d));
      if (value === null) kept++;
      else think = value;
    }
    if (replace.travel) {
      const value = comparable(target.travel, travelClass(d));
      if (value === null) kept++;
      else travel = value;
    }
    perClickMs += think + travel;
  }
  if (replace.pauses) longPauseMs = target.longPauseMsPer3BV * game.bv3;
  const clickScale = replace.clicks ? (target.effectivePer3BV * game.bv3) / game.effective : 1;
  // Moves between decisions (unflags, clicks that changed nothing) count with the rest.
  const between = game.timeMs - game.decisions.reduce((s, d) => s + d.gap, 0);
  return { ms: (perClickMs + otherMs) * clickScale + longPauseMs + between, kept };
}

function main() {
  const [outPath, ...inputs] = process.argv.slice(2);
  const files = inputs.flatMap((p) => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const games = files.map((g) => S.analyzeGame(g));
  const yours = games.filter((g) => g.group === 'you');
  if (yours.length === 0) throw new Error('no games of yours: pass the self.jsonl from user_games.js');
  const choices = {
    thinking: { thinking: true },
    travel: { travel: true },
    pauses: { pauses: true },
    clicks: { clicks: true },
    all: { thinking: true, travel: true, pauses: true, clicks: true },
  };
  const actualMs = S.median(yours.map((g) => g.timeMs));
  const result = { yourGames: yours.length, yourMedianSeconds: actualMs / 1000, targets: {} };
  for (const level of TARGETS) {
    const levelGames = games.filter((g) => g.group === level);
    if (levelGames.length === 0) throw new Error(`no corpus games at level ${level}`);
    const target = levelModel(levelGames);
    const rows = {};
    for (const [name, replace] of Object.entries(choices)) {
      const runs = yours.map((g) => ({ game: g, ...rebuilt(g, target, replace) }));
      const saved = runs.map((r) => (r.game.timeMs - r.ms) / 1000);
      rows[name] = {
        secondsSavedPerGame: saved.reduce((s, v) => s + v, 0) / saved.length,
        medianSeconds: S.median(runs.map((r) => r.ms / 1000)),
        keptMovesPerGame: runs.reduce((s, r) => s + r.kept, 0) / runs.length,
      };
    }
    result.targets[level] = { games: levelGames.length, medianBvs: S.median(levelGames.map((g) => g.bvs)), rows };
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
  console.log(`your ${result.yourGames} games: median ${result.yourMedianSeconds.toFixed(1)} s`);
  for (const [level, t] of Object.entries(result.targets)) {
    console.log(`\nif one skill matched level ${level} (median ${t.medianBvs.toFixed(2)} 3BV/s, ${t.games} games):`);
    const ranked = Object.entries(t.rows).filter(([n]) => n !== 'all').sort((a, b) => b[1].secondsSavedPerGame - a[1].secondsSavedPerGame);
    for (const [name, row] of [...ranked, ['all', t.rows.all]]) {
      console.log(`  ${name.padEnd(9)} saves ${row.secondsSavedPerGame.toFixed(1).padStart(6)} s/game   median time ${row.medianSeconds.toFixed(1)} s`
        + (row.keptMovesPerGame > 0 ? `   (${row.keptMovesPerGame.toFixed(1)} moves/game kept as yours)` : ''));
    }
  }
}

main();
