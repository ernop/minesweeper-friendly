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
