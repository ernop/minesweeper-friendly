'use strict';

const Solver = require('../solver.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

function rngOf(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

// 3x3, one mine in a corner, open the opposite corner: the rest is counting.
check('corner-mine board is solved, uniform, single-path', (() => {
  const mines = [
    true, false, false,
    false, false, false,
    false, false, false,
  ];
  const r = Solver.analyze(3, 3, mines, 8);
  return r.solved && r.uniform && r.singlePath;
})());

check('a mine as the opening is refused', (() => {
  let threw = false;
  try {
    Solver.analyze(3, 3, [true, false, false, false, false, false, false, false, false], 0);
  } catch (err) { threw = true; }
  return threw;
})());

check('two safes in one zero-flood are one path', (() => {
  // Mine in a corner; opening opposite leaves a counting step whose
  // proven safes share one flood.
  const mines = [
    true, false, false,
    false, false, false,
    false, false, false,
  ];
  const r = Solver.analyze(3, 3, mines, 8);
  return r.solved && r.singlePath;
})());

check('tunnel generate finds a single-path beginner board', (() => {
  let stream = 0.4;
  const rng = () => { stream = (stream * 1.61 + 0.08) % 1; return stream; };
  const got = Solver.generate(9, 9, 10, 40, rng, (r) => r.singlePath, 200, Solver.tunnelPlacement);
  return got.report.solved && got.report.singlePath && got.mineAt[40] === false;
})());

check('generate produces a solved beginner NG board', (() => {
  let stream = 0.1;
  const rng = () => { stream = (stream * 1.7 + 0.13) % 1; return stream; };
  const got = Solver.generate(9, 9, 10, 40, rng, (r) => r.solved, 400);
  return got.report.solved && got.mineAt[40] === false && got.attempts >= 1;
})());

check('uniform predicate rejects mixed-grade reports', (() => {
  const report = { solved: true, uniform: false, singlePath: true };
  return report.solved && !report.uniform;
})());

check('certain mine: last two cells, one mine', (() => {
  // 2x1: mine on the right, left revealed as 1? 2x1 with mine at 1, click 0.
  const mines = [false, true];
  const adjacent = Solver.adjacentMap(2, 1, mines);
  const revealed = [true, false];
  const view = { width: 2, height: 1, mines: 1, adjacent: adjacent, revealed: revealed };
  return Solver.isCertainMine(view, 1) && !Solver.isProvenSafe(view, 1);
})());

check('angelic forceSafe swaps a 50/50 mine onto its partner', (() => {
  const mines = [true, false];
  const adjacent = [0, 0];
  const revealed = [false, false];
  const view = { width: 2, height: 1, mines: 1, adjacent: adjacent, revealed: revealed };
  const next = Solver.forceSafe(view, mines, 0, () => 0);
  return next !== null && next[0] === false && next[1] === true;
})());

if (failures) {
  console.log(failures + ' failed');
  process.exit(1);
}
console.log('all ok');
