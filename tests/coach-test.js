'use strict';
// Unit tests for coach.js: mode registry, flag/chord/bail/shield detectors,
// overlap pattern classification, record validation, and transfer/state analytics.
//
// Usage: node tests/coach-test.js

const assert = require('node:assert/strict');
const GuardianAngel = require('../guardian-angel.js');
const Coach = require('../coach.js');

globalThis.GuardianAngel = GuardianAngel;

// Helper to construct a valid visible board from a mine layout and open/flag
// mask: mineRows uses '*' for mine, '.' for safe; maskRows uses 'o' for
// revealed, 'F' for covered + flagged, '.' for covered.
function buildBoard(mineRows, maskRows) {
  const height = mineRows.length;
  const width = mineRows[0].length;
  const mine = new Array(width * height).fill(false);
  let mines = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mineRows[y][x] === '*') {
        mine[y * width + x] = true;
        mines++;
      }
    }
  }
  const adjacent = new Array(width * height).fill(0);
  for (let i = 0; i < mine.length; i++) {
    if (mine[i]) continue;
    adjacent[i] = GuardianAngel.neighbors(i, width, height).filter((n) => mine[n]).length;
  }
  const revealed = new Array(width * height).fill(false);
  const flagged = new Array(width * height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = maskRows[y][x];
      const i = y * width + x;
      if (ch === 'o') {
        if (mine[i]) throw new Error('fixture reveals a mine at ' + x + ',' + y);
        revealed[i] = true;
      } else if (ch === 'F') {
        flagged[i] = true;
      }
    }
  }
  return { view: { width, height, mines, revealed, adjacent }, flagged, mine };
}

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error('FAIL: ' + name);
}

//-------MODES & VALIDATION-------

check('four coach modes exist', Coach.MODES.length === 4);
for (const id of ['coach-no-waste', 'coach-early-bail', 'coach-scan-shield', 'coach-full']) {
  check('recognizes ' + id, Coach.isPlayMode(id));
}
check('standard is not a coach mode', !Coach.isPlayMode('standard'));
assert.throws(() => Coach.featuresOf('standard'), /unknown coach play mode/);
check('full mix enables all three features',
  Coach.featuresOf('coach-full').noWaste
  && Coach.featuresOf('coach-full').earlyBail
  && Coach.featuresOf('coach-full').scanShield);

const validRecord = Coach.emptyCounters('coach-full', { flagBudget: 35, bailDelayMs: 450 });
check('emptyCounters passes validCoachRecord', Coach.validCoachRecord(validRecord));
check('rejects wrong version', !Coach.validCoachRecord({ ...validRecord, version: 2 }));
check('rejects invalid flagBudget', !Coach.validCoachRecord({ ...validRecord, flagBudget: 99 }));
check('rejects negative count', !Coach.validCoachRecord({ ...validRecord, noOpCues: -1 }));
check('rejects unknown pattern family', !Coach.validCoachRecord({
  ...validRecord,
  slowPatterns: { ...validRecord.slowPatterns, bogus: 1 },
}));

//-------FLAG EVALUATION (wrong flag & 1-cell flag)-------
{
  // Useful flag: mine at (0,0); '1' at (1,1) touches 3 covered cells (0,0),(1,0),(2,0).
  // Flagging (0,0) leaves 2 openable safe cells around (1,1) -> useful flag!
  const { view, flagged } = buildBoard(
    ['*..', '...', '...'],
    ['F..', 'ooo', 'ooo'],
  );
  const res = Coach.evaluateFlagPlacement(view, flagged, 0);
  check('useful flag (2+ chord targets) is neither wrong nor low-value',
    !res.wrongFlag && !res.lowValueFlag && res.maxChordOpens === 2);
}

{
  // Low-value single-cell flag: mine at (0,0); only (0,0) and (1,0) covered,
  // (0,1)='1' and (1,1)='1' each have 2 covered neighbors -> maxChordOpens === 1.
  const { view, flagged } = buildBoard(
    ['*..', '...', '...'],
    ['F.o', 'ooo', 'ooo'],
  );
  const res = Coach.evaluateFlagPlacement(view, flagged, 0);
  check('1-cell flag is flagged as low-value single-cell-chord',
    !res.wrongFlag && res.lowValueFlag && res.lowValueReason === 'single-cell-chord' && res.maxChordOpens === 1);
}

{
  // Low-value no-chord-target flag: only (0,0) is covered and is a mine -> 0 openable cells.
  const { view, flagged } = buildBoard(
    ['*..', '...', '...'],
    ['Foo', 'ooo', 'ooo'],
  );
  const res = Coach.evaluateFlagPlacement(view, flagged, 0);
  check('isolated 1-mine flag with 0 chord targets is low-value no-chord-target',
    !res.wrongFlag && res.lowValueFlag && res.lowValueReason === 'no-chord-target' && res.maxChordOpens === 0);
}

{
  // Wrong flag on a counting-proven-safe cell: mine at (1,0), (0,0)='1' touches only (1,0)
  // so (1,0) is counting-proven mine; (1,1)='1' touches (1,0) and (2,0) so (2,0) is counting-safe.
  const { view, flagged } = buildBoard(
    ['.*.', '...', '...'],
    ['o.F', 'ooo', 'ooo'],
  );
  const res = Coach.evaluateFlagPlacement(view, flagged, 2);
  check('flagging a counting-proven-safe cell triggers wrongFlag',
    res.wrongFlag && res.provenSafeTier === 'counting');
}

{
  // Wrong flag overflagging an adjacent '1' even before counting proves safe:
  const { view, flagged } = buildBoard(
    ['*..', '...', '...'],
    ['FF.', 'ooo', 'ooo'],
  );
  const res = Coach.evaluateFlagPlacement(view, flagged, 1);
  check('overflagging adjacent number triggers wrongFlag with overflaggedNumbers',
    res.wrongFlag && res.overflaggedNumbers.includes(4));
}

//-------CHORD EFFICIENCY-------
{
  // (2,0) is revealed '0' next to (1,1)='1', so chording (1,1) to open 1 cell is on an opening rim.
  const { view } = buildBoard(
    ['*..', '...', '...'],
    ['F.o', 'ooo', 'ooo'],
  );
  const rim = Coach.evaluateChordEfficiency(view, 4, [1]);
  check('1-cell chord on opening rim detected', rim.oneCellChord && rim.onOpeningRim);
  const multi = Coach.evaluateChordEfficiency(view, 4, [1, 2]);
  check('multi-cell chord is not 1-cell chord', !multi.oneCellChord && !multi.onOpeningRim);
}
{
  // Every revealed neighbor around (1,1) is > 0 -> not on opening rim.
  const { view } = buildBoard(
    ['*.*', '...', '*.*'],
    ['F.o', 'ooo', 'ooo'].map((r, y) => (y === 0 ? 'F..' : y === 2 ? '.o.' : 'ooo')),
  );
  const nonRim = Coach.evaluateChordEfficiency(view, 4, [1]);
  check('1-cell chord away from zero is not opening rim', nonRim.oneCellChord && !nonRim.onOpeningRim);
}

//-------STATE B (EARLY BAIL), EASY LOCAL, AND PATTERN CLASSIFICATION-------
{
  // 9x5 board:
  // Top row (y=0) is all covered with mines at x=0,2,4,6,8 -> row 1 is 1 2 1 2 1 2 1 2 1.
  //   Counting proves NOTHING on row 0; overlap proves (0,0),(2,0) mines and (1,0) safe!
  // Bottom-right (y=4): mine at (7,4), (8,4)='1' open touching ONLY (7,4) -> counting mine (7,4);
  //   (7,3)='1' touches (6,4) and (7,4) -> counting-safe at (6,4) = 4*9+6 = 42!
  const b = buildBoard(
    [
      '*.*.*.*.*',
      '.........',
      '.........',
      '.........',
      '.......*.',
    ],
    [
      '.........',
      'ooooooooo',
      'ooooooooo',
      'ooooooooo',
      'oooooo..o',
    ],
  );
  const stateLeft = Coach.analyzeBoardState(b.view, b.flagged, [10]); // anchor (1,1)
  check('State B detected when local has only 1-2 overlap and remote has counting-safe',
    stateLeft.regime === 'state-b' && stateLeft.localHard === true
    && stateLeft.remoteClusterCells.includes(42)); // (6,4) = 4*9+6 = 42

  const wallPat = Coach.classifyPatternAt(b.view, 0, stateLeft.countingFacts, stateLeft.overlapFacts);
  check('1-2 touching wall classified as 1-2-wall (got ' + wallPat + ')', wallPat === '1-2-wall');

  const stateRight = Coach.analyzeBoardState(b.view, b.flagged, [34]); // anchor (7,3)
  check('easy-local detected when counting-safe is within 2 squares',
    stateRight.regime === 'easy-local' && stateRight.localHintCells.includes(42));
}

{
  // Interior 1-2 (all clues strictly interior on a 7x6 board):
  // Covered strip across row 2 with mines at x=0,2,4,6? Keep walls covered too so
  // interior numbers at (2,3)='1', (3,3)='2', (4,3)='1' sit strictly off every wall!
  const interior12 = buildBoard(
    [
      '.......',
      '.......',
      '..*.*..',
      '.......',
      '.......',
    ],
    [
      '.......',
      '.......',
      '.......',
      'o.ooo.o',
      'ooooooo',
    ],
  );
  // Wait: row 2 cols 1..5 are covered and row 3 cols 2..4 are '1','2','1' ->
  // (2,3)='1' touches (1,2),(2,2),(3,2) AND (1,3) covered! To keep (2,3) touching ONLY 2 covered cells:
  // open (1,3) and (5,3) too, with mines at (0,2),(2,2),(4,2),(6,2) and cover rows 0..2 completely!
  const interior12Clean = buildBoard(
    [
      '.......',
      '.......',
      '*.*.*.*',
      '.......',
      '.......',
    ],
    [
      '.......',
      '.......',
      '.......',
      'ooooooo',
      'ooooooo',
    ],
  );
  // Wait: (0,3) is on left wall x=0; check (3,2)=17 (safe) touched by interior (2,3)='1' and (3,3)='2'!
  // Note: (0,3) touches (0,2),(1,2) so (0,3)='1' and (1,3)='2' prove (2,2) mine;
  // for (3,2) safe, the clues touching (3,2) are (2,3)='1', (3,3)='2', (4,3)='1' — ALL interior!
  const state = Coach.analyzeBoardState(interior12Clean.view, interior12Clean.flagged, [24]);
  check('hard-only board detected when only overlap moves exist', state.regime === 'hard-only');
  const pat = Coach.classifyPatternAt(interior12Clean.view, 17, state.countingFacts, state.overlapFacts); // (3,2) safe
  check('interior 1-2 classified as 1-2-interior (got ' + pat + ')', pat === '1-2-interior');
}

{
  // Interior 1-1 subset on 6x6 board:
  // (1,2)='1' (interior) touches {(2,2),(2,3)}; (1,3)='1' (interior) touches {(2,2),(2,3),(2,4)} -> (2,4)=26 safe!
  const interior11Clean = buildBoard(
    [
      '*.*...',
      '...*..',
      '......',
      '..*...',
      '......',
      '*.*...',
    ],
    [
      '......',
      'ooo...',
      'oo....',
      'oo....',
      'oo....',
      '......',
    ],
  );
  const state11 = Coach.analyzeBoardState(interior11Clean.view, interior11Clean.flagged, [13]);
  const target24 = 4 * 6 + 2; // (2,4) = 26
  const pat11 = Coach.classifyPatternAt(interior11Clean.view, target24, state11.countingFacts, state11.overlapFacts);
  check('interior 1-1 classified as 1-1-interior (got ' + pat11 + ')', pat11 === '1-1-interior');
}

//-------SCAN SHIELD-------
{
  // 9x5 board with counting-safe at (6,4)=42, overlap-safe at (1,0)=1,
  // and unproven sea cell at (0,4)=36 (no revealed number touches it when (0,3) & (1,3) & (1,4) are covered!).
  const s = buildBoard(
    [
      '*.*.*.*.*',
      '.........',
      '.........',
      '.........',
      '*......*.',
    ],
    [
      '.........',
      'ooooooooo',
      'ooooooooo',
      '..ooooooo',
      '..oooo..o',
    ],
  );
  // (0,4)=36 touches no revealed cell (all neighbors (0,3),(1,3),(1,4) covered) -> unproven sea cell!
  // (6,4)=42 is counting-safe!
  const shieldMissed = Coach.checkScanShield(s.view, 36);
  check('shield blocks unproven click when counting-safe exists elsewhere',
    shieldMissed.block === true && shieldMissed.reason === 'missed-safe'
    && shieldMissed.tier === 'counting' && shieldMissed.safeCells.includes(42));

  const shieldSafe = Coach.checkScanShield(s.view, 42);
  check('shield allows counting-safe click', shieldSafe.block === false);

  const shieldOverlapSafe = Coach.checkScanShield(s.view, 1);
  check('shield allows overlap-safe click', shieldOverlapSafe.block === false);
}

{
  // Genuine forced 50/50: mine at (0,0), only (0,0) and (1,0) covered, both (0,1) and (1,1) are '1'.
  const b = buildBoard(
    ['*.', '..', '..'],
    ['..', 'oo', 'oo'],
  );
  const forced = Coach.checkScanShield(b.view, 0);
  check('shield allows genuine forced 50/50 guess', forced.block === false);
}

{
  // Proven mine click when NO safe cell exists anywhere:
  // 5x2 board, mines at (0,0) and (4,0).
  // (0,0) is counting-proven mine (only covered neighbor of (0,1)='1');
  // (4,0) and (4,1) are touched only by (3,0)='1' and (3,1)='1' -> pure 50/50!
  const b = buildBoard(
    ['*...*', '.....'],
    ['.ooo.', 'oooo.'],
  );
  const mineClick = Coach.checkScanShield(b.view, 0);
  check('shield blocks clicking a proven mine even with no safe move',
    mineClick.block === true && mineClick.reason === 'proven-mine' && mineClick.clickedWasMine === true);
  const guessClick = Coach.checkScanShield(b.view, 4);
  check('shield allows clicking into the 50/50 on that same board', guessClick.block === false);
}

{
  // Whole-board mine-count proof: 1 mine total at (0,0), (0,0) is counting-proven mine,
  // so distant covered cell (3,2)=11 is whole-board proven safe!
  const wb = buildBoard(
    ['*...', '....', '....'],
    ['.ooo', 'oooo', 'ooo.'],
  );
  const wbClick = Coach.checkScanShield(wb.view, 11);
  check('shield never falsely blocks a whole-board proven-safe move', wbClick.block === false);
}

//-------TRANSFER & STATE SAMPLE ANALYTICS-------
{
  const bvPerSecond = (r) => r.bv3 / (r.timeMs / 1000);
  const ioeOf = (r) => r.bv3 / (r.boardChangingClicks + r.noOpClicks);
  const fatalKindOf = (r) => r._fatal;
  const deps = { bvPerSecond, ioeOf, fatalKindOf };
  const day0 = new Date(2026, 10, 20, 12, 0, 0).getTime();

  const stdWin = (i, dayOffset, timeMs, noops, leftHard, stateSample) => ({
    endedAt: day0 + dayOffset * 86400000 + i * 60000,
    outcome: 'win',
    timeMs,
    bv3: 160,
    boardChangingClicks: 200,
    noOpClicks: noops,
    flagsPlaced: 80,
    flagChordGapMs: 250,
    moveGapMedianMs: 900,
    movesLeftHardWork: leftHard,
    ...(stateSample ? { stateSample } : {}),
  });
  const stdLoss = (i, dayOffset, fatal) => ({
    endedAt: day0 + dayOffset * 86400000 + i * 60000 + 30000,
    outcome: 'loss',
    timeMs: 30000,
    bv3: 160,
    boardChangingClicks: 70,
    noOpClicks: 5,
    _fatal: fatal,
  });

  const preStd = [];
  for (let i = 0; i < 12; i++) preStd.push(stdWin(i, 0, 95000, 35, 1.0, { sampledAt: day0, focus: 3, pace: 'calm' }));
  preStd.push(stdLoss(20, 0, 'guess-safe'));
  preStd.push(stdLoss(21, 0, 'guess-min'));

  const noCoach = Coach.summarizeTransfer(preStd, [], deps);
  check('no coach games yields no-practice and recommends No-waste',
    noCoach.status === 'no-practice' && noCoach.recommendation.mode === 'coach-no-waste');

  const coachGames = [];
  for (let i = 0; i < 6; i++) {
    const c = Coach.emptyCounters('coach-no-waste', { flagBudget: 35 });
    c.noOpCues = i < 3 ? 12 : 4;
    c.lowValueFlagCues = i < 3 ? 8 : 2;
    c.flagChordPairs = 10;
    c.flagChord15Clicks = i < 3 ? 2 : 7;
    c.slowPatterns['1-2-interior'] = 2;
    coachGames.push({
      endedAt: day0 + 2 * 86400000 + i * 120000,
      outcome: 'win',
      timeMs: 85000,
      bv3: 160,
      boardChangingClicks: 185,
      noOpClicks: i < 3 ? 12 : 4,
      playMode: 'coach-no-waste',
      coach: c,
    });
  }
  const postStd = [];
  for (let i = 0; i < 10; i++) {
    postStd.push(stdWin(i, i < 5 ? 2 : 3, 82000, 12, 2.5, { sampledAt: day0 + 2 * 86400000, focus: 5, pace: 'flowing' }));
  }

  const practice = Coach.summarizePractice(coachGames);
  check('practice aggregates by mode and splits earlier/latest halves',
    practice.totalGames === 6 && practice.byMode.length === 1
    && practice.byMode[0].earlier.noopsPerGame === 12
    && practice.byMode[0].latest.noopsPerGame === 4
    && Math.abs(practice.byMode[0].latest.click15Share - 0.7) < 1e-12);
  check('practice aggregates slowPatterns',
    practice.slowPatternTotal === 12 && practice.slowPatterns[0].family === '1-2-interior');

  const transfer = Coach.summarizeTransfer([...preStd, ...postStd], coachGames, deps);
  check('transfer compares baseline vs post once >= 10 post wins exist',
    transfer.status === 'compared'
    && transfer.baseline.wins === 12 && transfer.post.wins === 10
    && transfer.baseline.medianNoopsPerWin === 35 && transfer.post.medianNoopsPerWin === 12
    && transfer.post.median3bvPerS > transfer.baseline.median3bvPerS
    && transfer.coachDays.wins === 5 && transfer.nonCoachDays.wins === 17);

  const states = Coach.summarizeStateSamples([...preStd, ...postStd], deps);
  check('state samples split by focus and pace',
    states.totalSampledGames === 22
    && states.byFocus.length === 2 && states.byFocus[0].value === 3 && states.byFocus[1].value === 5
    && states.byPace.length === 2);
}

{
  // Endgame pointless flag & readyHighNumbers detection
  const { view, flagged } = buildBoard(
    ['*..', '...', '...'],
    ['Foo', 'ooo', 'oo.'],
  );
  const res = Coach.evaluateFlagPlacement(view, flagged, 0);
  check('endgame pointless flag detected when <= 5 safe squares remain',
    res.endgamePointless === true && res.remSafe === 1);
}

console.log(`coach: all ${checks} checks passed`);
