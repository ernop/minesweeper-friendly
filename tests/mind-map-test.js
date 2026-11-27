'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'game-data.js'), 'utf8'));
const GuardianAngel = require('../guardian-angel.js');
const Solver = require('../solver.js');
const GameRandom = require('../rng.js');
const TrainingCore = require('../training-core.js');
const MindMap = require('../mind-map.js');

const deps = {
  randomPlacement: Solver.randomPlacement,
  fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION,
};

// 1. Every catalog entry has a valid rectangular visual diagram with target marks.
assert(MindMap.TECHNIQUES.length >= 20, 'expected full technique catalog');
for (const tech of MindMap.TECHNIQUES) {
  assert(tech.id && tech.label && tech.help, 'technique metadata required: ' + tech.id);
  const d = tech.diagram;
  assert(d.width >= 3 && d.height >= 3, 'diagram dimensions valid: ' + tech.id);
  assert.strictEqual(d.cells.length, d.width * d.height, 'diagram cell count matches w*h: ' + tech.id);
  assert(d.cells.some((c) => c.mark), 'diagram marks at least one target square: ' + tech.id);
}

// Verify 1-3-1 inner corner diagram mathematically with GuardianAngel.proveLevels
{
  // Real 5x5 mine placement producing the exact 1-3-1 inner corner:
  const w = 5;
  const h = 5;
  const mine = new Array(25).fill(false);
  for (const [x, y] of [[2, 0], [4, 0], [4, 2], [0, 2], [2, 4]]) mine[y * w + x] = true;
  const adj = new Array(25).fill(0);
  for (let i = 0; i < 25; i++) {
    if (!mine[i]) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) adj[ny * w + nx]++;
      }
    }
  }
  const rev = new Array(25).fill(false);
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) rev[y * w + x] = true;
  const view = { width: w, height: h, mines: 5, revealed: rev, adjacent: adj };
  const lv = GuardianAngel.proveLevels(view, GuardianAngel.rawClues(view));
  assert.strictEqual(lv.facts.get(0 * w + 4), 1, '1-3-1 outer corner must be proven mine');
  assert.strictEqual(lv.levelOf.get(0 * w + 4), 'allNumbers', '1-3-1 outer corner is an allNumbers proof');
  assert.strictEqual(lv.facts.get(3 * w + 4), 2, '1-3-1 far right square must be proven safe');
  assert.strictEqual(lv.facts.get(0 * w + 1), 2, '1-3-1 far top square must be proven safe');
}

// 2. Synthetic traced win exercising:
//    - layout-mapped left vs right hover dwell
//    - habit vs physical no-op clicks & post-no-op slowdown
//    - endgame pointless flag when only 1 safe square remains
//    - abandoned hover check + single-game episode reconstruction
function makeSyntheticWin(endedAt) {
  // 5x5 board with 3 mines at (4,0), (4,1), (4,2).
  // First click at (0,0) floods all safe squares except (3,0)? No, let's place mines
  // at (2,0), (2,1), (2,2), (2,3), (2,4) dividing left opening from right region — even
  // simpler: 5x5 with 2 mines at (4,0) and (4,4), plus (3,1) and (3,3) -> let's build a
  // tiny 4x4 with 2 mines at (3,0) and (3,1).
  // Layout (4x4, mines at idx 3 and 7):
  //   0 0 1 *
  //   0 0 2 *
  //   0 0 1 1
  //   0 0 0 0
  // Wait: first click at (0,0) floods ALL 14 safe cells! Put mines at (2,0),(2,1),(3,2) ->
  // (3,0) and (3,1) are isolated safe cells behind the mine wall!
  // Let's check 4x4 with mines at (2,0), (2,1), (2,2), (3,2) [4 mines]:
  //   (0,0) opens cols 0..1 and (2,3),(3,3)? Wait (1,3)=0 opens (2,3)=2 and (1,2)=2.
  //   Put mines at (2,0)=2, (2,1)=6, (2,2)=10, (2,3)=14 [full col 2 = 4 mines!]:
  //   Left side cols 0..1: (0,0) opens all 8 cells!
  //   Right side cols 3: (3,0)=2, (3,1)=3, (3,2)=3, (3,3)=2 — 4 safe cells left to open!
  const width = 4;
  const height = 4;
  const mines = 4;
  const mineIdx = new Set([2, 6, 10, 14]);
  const finalBoard = { cells: Array.from({ length: 16 }, (_, i) => ({ mine: mineIdx.has(i) })) };

  // Board rect: left=100, top=200, cell=30px plus 1/8-cell bevel each side -> width=127.5, height=127.5
  const cellCenter = (idx) => ({
    x: 100 + ((idx % width) + 0.5 + 1 / 8) * 30,
    y: 200 + (Math.floor(idx / width) + 0.5 + 1 / 8) * 30,
  });

  // Include explicit ldown events 60 ms before each lup so press-to-press
  // timing and pre-down target hover separate mechanical hold from dwell.
  const events = [
    { t: 0, kind: 'layout', left: 100, top: 200, width: 127.5, height: 127.5, boardWidth: width, boardHeight: height },
    { t: 40, kind: 'ldown', index: 0 },
    { t: 100, kind: 'lup', index: 0 },      // opens cols 0..1 (8 safe opened; 4 safe remain: 3,7,11,15)
    { t: 440, kind: 'ldown', index: 3 },
    { t: 500, kind: 'lup', index: 3 },      // reveal (3,0) [remSafe 4 -> 3], P2P = 400 ms
    { t: 800, kind: 'rdown', index: 2 },    // flag mine (2,0) [remSafe 3], P2P = 360 ms
    { t: 940, kind: 'ldown', index: 0 },
    { t: 1000, kind: 'lup', index: 0 },     // noop-blank (habit finished-recheck)
    { t: 1390, kind: 'ldown', index: 7 },
    { t: 1450, kind: 'lup', index: 7 },     // reveal (3,1) [remSafe 3 -> 2], post-noop
    { t: 1700, kind: 'rdown', index: 0 },   // noop-right-on-open (physical button slip)
    { t: 2040, kind: 'ldown', index: 11 },
    { t: 2100, kind: 'lup', index: 11 },    // reveal (3,2) [remSafe 2 -> 1], post-noop
    { t: 2500, kind: 'rdown', index: 14 },  // pointless flag when ONLY 1 safe square (15) remains!
    { t: 2740, kind: 'ldown', index: 15 },
    { t: 2800, kind: 'lup', index: 15 },    // final winning reveal! P2P = 240 ms (not 300 ms!)
  ];

  // Pointer samples: arrive 80 ms before ldown (140 ms before lup) on reveals,
  // and 80 ms before rdown on flags -> identical ~80 ms pre-down hover, 60 ms left hold!
  const sampleT = [];
  const sampleX = [];
  const sampleY = [];
  const pushSamples = (tStart, tEnd, x, y) => {
    for (let t = tStart; t <= tEnd; t += 20) {
      sampleT.push(t);
      sampleX.push(x);
      sampleY.push(y);
    }
  };
  const c0 = cellCenter(0);
  const c3 = cellCenter(3);
  const c2 = cellCenter(2);
  const c7 = cellCenter(7);
  const c11 = cellCenter(11);
  const c14 = cellCenter(14);
  const c15 = cellCenter(15);
  pushSamples(0, 100, c0.x, c0.y);
  pushSamples(360, 500, c3.x, c3.y);   // 80 ms pre-down hover + 60 ms hold
  pushSamples(720, 800, c2.x, c2.y);   // 80 ms pre-down hover (flag)
  pushSamples(1310, 1450, c7.x, c7.y); // 80 ms pre-down hover + 60 ms hold
  pushSamples(1960, 2100, c11.x, c11.y);
  pushSamples(2420, 2500, c14.x, c14.y); // 80 ms pre-down hover (flag)
  pushSamples(2660, 2800, c15.x, c15.y); // 80 ms pre-down hover + 60 ms hold

  const record = {
    endedAt,
    outcome: 'win',
    timeMs: 2700,
    bv3: 5,
    boardChangingClicks: 7,
    noOpClicks: 2,
  };
  const trace = {
    events,
    finalBoard,
    sampleT: Float64Array.from(sampleT),
    sampleX: Float32Array.from(sampleX),
    sampleY: Float32Array.from(sampleY),
  };
  return { record, trace, spec: { level: 'Expert', width, height, mines } };
}

const syn = makeSyntheticWin(1764000000000);
const analyzed = MindMap.analyzeGame(syn.record, syn.trace, syn.spec, deps, {
  scanPointer: true,
  captureCrops: true,
  buildEpisodes: true,
});
assert(analyzed !== null, 'synthetic win must replay cleanly');
assert.strictEqual(analyzed.endgame.last1Flags, 1, 'must catch pointless flag placed at 1 safe square left');
assert.strictEqual(analyzed.endgame.end5Unused, 2, 'must catch unused flags in final 5 safe squares');
assert.strictEqual(analyzed.endgame.trailingFlags, 1, 'must catch trailing flag right before winning reveal');
assert.strictEqual(analyzed.noops.habit, 1, 'must classify blank click as habit no-op');
assert.strictEqual(analyzed.noops.physical, 1, 'must classify right-on-open as physical slip');
assert(analyzed.episodes.some((e) => e.kind === 'endgame-flag' && e.crop), 'episodes must capture endgame pointless flag with board crop');

// Verify summarize produces highlights, ranked traits, techniques, and recentGames
const repeated = Array.from({ length: 12 }, (_, i) => {
  const s = makeSyntheticWin(1764000000000 + i * 10000);
  return MindMap.analyzeGame(s.record, s.trace, s.spec, deps, {
    scanPointer: true,
    captureCrops: true,
    buildEpisodes: true,
  });
});
const summary = MindMap.summarize(repeated, repeated.map((r) => ({ outcome: 'win', endedAt: r.endedAt, timeMs: r.timeMs, bv3: r.bv3 })));
assert.strictEqual(summary.counts.Expert, 12);
assert.strictEqual(summary.endgame.Expert.withLast1Pct, 100, '100% of synthetic wins flagged at 1 safe left');
assert(summary.highlights.some((h) => h.title.includes('endgame flagging')), 'must surface pointless endgame flagging highlight');
assert(summary.rankedTraits.length >= 3, 'must build ranked traits list');
for (let i = 1; i < summary.rankedTraits.length; i++) {
  assert(summary.rankedTraits[i - 1].costSec >= summary.rankedTraits[i].costSec, 'ranked traits must sort by descending costSec');
}
assert(summary.mentation !== null, 'must produce Expert mentation profile');
assert.strictEqual(summary.mentation.preDownHover.leftHoldMs, 60, 'must separate 60 ms mechanical left button hold');
assert(Math.abs(summary.mentation.preDownHover.revealMs - summary.mentation.preDownHover.flagMs) <= 20,
  'pre-down hover must match between reveals and flags once mechanical hold is removed');
assert(!summary.rankedTraits.some((t) => t.id === 'left-hover'), 'debunked left-hover artifact trait must not appear');
assert(summary.mentation.breakers.length >= 1, 'must compute chunk-breaker breakdown');
// Press-to-press gap on final reveal (2740 ldown - 2500 rdown = 240 ms, not 300 ms trigger gap)
const lastMove = analyzed.moves[analyzed.moves.length - 1];
assert.strictEqual(lastMove.gapMs, 240, 'must time flag->reveal press-to-press without 60 ms button-hold bias');
for (const row of summary.techniques.all) {
  assert(row.easyPct >= 0 && row.easyPct <= 100, 'easyPct must be bounded 0..100: ' + row.id + '=' + row.easyPct);
  assert(row.slowPct >= 0 && row.slowPct <= 100, 'slowPct must be bounded 0..100: ' + row.id + '=' + row.slowPct);
}
assert.strictEqual(summary.recentGames.length, 12);

// 3. Verify TrainingCore.weeks computes top3BvPerS only when >= 3 wins in a week
const weekRecords = [
  { endedAt: new Date(2026, 10, 23, 10, 0).getTime(), outcome: 'win', timeMs: 100000, bv3: 200, boardChangingClicks: 200, noOpClicks: 10 }, // 2.0
  { endedAt: new Date(2026, 10, 23, 11, 0).getTime(), outcome: 'win', timeMs: 100000, bv3: 220, boardChangingClicks: 200, noOpClicks: 10 }, // 2.2
  { endedAt: new Date(2026, 10, 23, 12, 0).getTime(), outcome: 'win', timeMs: 100000, bv3: 240, boardChangingClicks: 200, noOpClicks: 10 }, // 2.4
  { endedAt: new Date(2026, 10, 23, 13, 0).getTime(), outcome: 'win', timeMs: 100000, bv3: 150, boardChangingClicks: 200, noOpClicks: 10 }, // 1.5
  { endedAt: new Date(2026, 10, 16, 10, 0).getTime(), outcome: 'win', timeMs: 100000, bv3: 180, boardChangingClicks: 200, noOpClicks: 10 },
  { endedAt: new Date(2026, 10, 16, 11, 0).getTime(), outcome: 'win', timeMs: 100000, bv3: 190, boardChangingClicks: 200, noOpClicks: 10 },
];
const weeks = TrainingCore.weeks(weekRecords, () => undefined);
assert.strictEqual(weeks.length, 2);
assert(Math.abs(weeks[0].top3BvPerS - 2.2) < 1e-9, 'top-3 average of [2.4, 2.2, 2.0, 1.5] must be 2.2');
assert.strictEqual(weeks[1].top3BvPerS, null, 'week with 2 wins must report null top3BvPerS');

// 4. Verify MindMap.inspectGame reconstructs full board, cursor trajectory, and claims
const inspection = MindMap.inspectGame(syn.record, syn.trace, syn.spec, deps);
assert(inspection !== null, 'inspectGame must replay synthetic win');
assert.strictEqual(inspection.modelVersion, 'mentation-v1');
assert.strictEqual(inspection.steps.length, 9);
assert(inspection.steps.some((st) => st.claims.some((c) => c.claimType === 'endgame-flag')), 'inspectGame must emit endgame-flag claim');
assert(inspection.steps.some((st) => st.claims.some((c) => c.claimType === 'noop-habit')), 'inspectGame must emit noop-habit claim');
assert(inspection.steps.some((st) => st.claims.some((c) => c.claimType === 'noop-physical')), 'inspectGame must emit noop-physical claim');
assert(inspection.steps.some((st) => st.cursor && st.cursor.points.length >= 2), 'inspectGame must attach bevel-calibrated cursor trajectory points');
assert(inspection.steps.every((st) => st.deduction && typeof st.deduction.statusLabel === 'string' && typeof st.deduction.howKnown === 'string'),
  'every step must carry a deduction explanation (what was known, how it was known, or why it was a guess)');
assert(inspection.steps.some((st) => st.deduction.category === 'known-safe' && st.deduction.witnessClues.length >= 1),
  'known-safe steps must identify the witness clue numbers that proved them');
assert(inspection.steps.some((st) => st.deduction.category === 'known-mine' && st.deduction.witnessClues.length >= 1),
  'known-mine steps must identify the witness clue numbers that proved them');

console.log('mind-map-test: all checks passed (' + MindMap.TECHNIQUES.length + ' visual techniques, synthetic replay, endgame audit, ranked traits, weekly top-3, inspectGame)');
