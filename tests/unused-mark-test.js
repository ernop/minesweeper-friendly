'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
const start = source.indexOf('function beginFlagEpisode(');
const end = source.indexOf('// Returns whether the click changed anything', start);
if (start < 0 || end <= start) throw new Error('flag episode span not found');

const recorded = { evaluations: 0, unused: 0 };
const context = {
  activeFlagEpisodes: new Map(),
  unusedCorrectFlags: 0,
  cells: [
    { mine: true, flagged: true },
    { mine: true, flagged: true },
    { mine: false, flagged: true },
  ],
  actionEvaluations: [],
  sessionRecordEvaluation() { recorded.evaluations++; },
  sessionRecordUnusedMark() { recorded.unused++; },
  neighbors() { return [0, 1]; },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}
const evaluation = () => ({ mistakes: [], evidence: {} });

{
  const used = evaluation();
  context.beginFlagEpisode(0, used);
  context.markChordFlagUsage(2);
  context.finishFlagEpisode(0, 'game-ended');
  check('a correct mark consumed by a chord is not counted',
    context.unusedCorrectFlags === 0 && used.mistakes.length === 0);
}

{
  const removed = evaluation();
  context.beginFlagEpisode(1, removed);
  context.finishFlagEpisode(1, 'flag-removed');
  check('a correct mark removed before chord use is counted',
    context.unusedCorrectFlags === 1);
  check('unused mark annotates its original placement',
    removed.mistakes.includes('unused-correct-flag')
      && removed.evidence.unusedFlagEndedBy === 'flag-removed');
  check('unused mark enters report and live session evidence',
    context.actionEvaluations.includes(removed)
      && recorded.evaluations === 1 && recorded.unused === 1);
}

{
  const safe = evaluation();
  context.beginFlagEpisode(2, safe);
  context.finishFlagEpisode(2, 'game-ended');
  check('an unused wrong flag is not called an unused correct mark',
    context.unusedCorrectFlags === 1 && safe.mistakes.length === 0);
}

{
  const standing = evaluation();
  context.beginFlagEpisode(0, standing);
  context.finishOpenFlagEpisodes();
  check('game end counts a correct mark never used by a chord',
    context.unusedCorrectFlags === 2
      && standing.evidence.unusedFlagEndedBy === 'game-ended');
}

console.log(`unused-mark: all ${checks} checks passed`);
