'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
const start = source.indexOf('function cellsTouch(');
const end = source.indexOf('\n// Returns whether the click changed anything', start);
if (start < 0 || end < 0) throw new Error('likely-misclick functions not found');

const context = {
  config: { width: 3 },
  cells: Array.from({ length: 9 }, () => ({ flagged: false, mine: false })),
  activeFlagEpisodes: new Map(),
  LIKELY_MISCLICK_MAX_MS: 1000,
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}
function evaluation(action, target, atMs) {
  return {
    action,
    atMs,
    selected: action === 'chord' ? [2] : [target],
    ...(action === 'chord' ? { triggerCell: target } : {}),
    result: 'continued',
    mistakes: ['opened-unproven-with-safe-move'],
    evidence: {},
  };
}
function setFlag(index, atMs, mine = false) {
  context.cells[index] = { flagged: true, mine };
  context.activeFlagEpisodes.set(index, {
    index,
    evaluation: { atMs },
    usedByChord: false,
  });
}
function reset() {
  context.activeFlagEpisodes.clear();
  context.cells = Array.from({ length: 9 }, () => ({ flagged: false, mine: false }));
}

setFlag(4, 100);
const quickReveal = evaluation('reveal', 8, 1099);
context.annotateLikelyMisclickDeath(quickReveal);
check('adjacent wrong flag under one second is inferred as a likely misclick',
  quickReveal.mistakes.includes('likely-misclick-after-wrong-flag'));
check('technical classification remains alongside the inference',
  quickReveal.mistakes.includes('opened-unproven-with-safe-move'));
check('inference records its measured gap and both cells',
  quickReveal.evidence.likelyMisclick.gapMs === 999
    && quickReveal.evidence.likelyMisclick.flagCell === 4
    && quickReveal.evidence.likelyMisclick.targetCell === 8);

reset();
setFlag(4, 100);
const boundary = evaluation('reveal', 8, 1100);
context.annotateLikelyMisclickDeath(boundary);
check('exactly one second does not satisfy the strict under-one-second rule',
  !boundary.mistakes.includes('likely-misclick-after-wrong-flag'));

reset();
setFlag(0, 100);
const distant = evaluation('reveal', 8, 500);
context.annotateLikelyMisclickDeath(distant);
check('nonadjacent wrong flags do not qualify',
  !distant.mistakes.includes('likely-misclick-after-wrong-flag'));

reset();
setFlag(4, 100, true);
const correctFlag = evaluation('reveal', 8, 500);
context.annotateLikelyMisclickDeath(correctFlag);
check('correct flags do not qualify',
  !correctFlag.mistakes.includes('likely-misclick-after-wrong-flag'));

reset();
setFlag(4, 100);
context.cells[4].flagged = false;
const removedFlag = evaluation('reveal', 8, 500);
context.annotateLikelyMisclickDeath(removedFlag);
check('flags removed before death do not qualify',
  !removedFlag.mistakes.includes('likely-misclick-after-wrong-flag'));

reset();
setFlag(4, 100);
const quickChord = evaluation('chord', 5, 500);
context.annotateLikelyMisclickDeath(quickChord);
check('adjacent fatal chords use the chord center as their target',
  quickChord.evidence.likelyMisclick.targetCell === 5);

console.log(`likely misclick: ${checks} checks passed`);
