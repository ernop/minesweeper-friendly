'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = require('./game-source.js').source;
const start = source.indexOf('function beginFlagEpisode(');
const end = source.indexOf('// Returns whether the click changed anything', start);
if (start < 0 || end <= start) throw new Error('flag episode span not found');

const context = {
  activeFlagEpisodes: new Map(),
  flagEpisodes: [],
  unusedCorrectFlags: 0,
  cells: [
    { mine: true, flagged: true },
    { mine: true, flagged: true },
    { mine: false, flagged: true },
  ],
  actionEvaluations: [],
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
const resetGame = () => {
  context.activeFlagEpisodes = new Map();
  context.flagEpisodes = [];
  context.unusedCorrectFlags = 0;
  context.actionEvaluations = [];
};

check('stored unused-mark count exists only on wins',
  source.includes("...(outcome === 'win' ? { unusedCorrectFlags: unusedCorrectFlags } : {})"));

{
  resetGame();
  const used = evaluation();
  context.beginFlagEpisode(0, used);
  context.markChordFlagUsage(2);
  context.finishFlagEpisode(0, 'game-ended');
  context.finishOpenFlagEpisodes(true);
  check('a correct mark consumed by a chord is not counted',
    context.unusedCorrectFlags === 0 && used.mistakes.length === 0);
}

{
  resetGame();
  const removed = evaluation();
  context.beginFlagEpisode(1, removed);
  context.finishFlagEpisode(1, 'flag-removed');
  check('unused marking remains undecided until the outcome',
    context.unusedCorrectFlags === 0 && removed.mistakes.length === 0);
  context.finishOpenFlagEpisodes(false);
  check('a loss never classifies an unused correct mark',
    context.unusedCorrectFlags === 0
      && removed.mistakes.length === 0
      && context.actionEvaluations.length === 0);
}

{
  resetGame();
  const removed = evaluation();
  context.beginFlagEpisode(1, removed);
  context.finishFlagEpisode(1, 'flag-removed');
  context.finishOpenFlagEpisodes(true);
  check('a win counts a correct mark removed before chord use',
    context.unusedCorrectFlags === 1);
  check('win-only unused mark annotates its original placement',
    removed.mistakes.includes('unused-correct-flag')
      && removed.evidence.unusedFlagEndedBy === 'flag-removed');
  check('win-only unused mark enters report evidence once',
    context.actionEvaluations.filter((item) => item === removed).length === 1);
}

{
  resetGame();
  const safe = evaluation();
  context.beginFlagEpisode(2, safe);
  context.finishFlagEpisode(2, 'game-ended');
  context.finishOpenFlagEpisodes(true);
  check('an unused wrong flag is not called an unused correct mark',
    context.unusedCorrectFlags === 0 && safe.mistakes.length === 0);
}

{
  resetGame();
  const standing = evaluation();
  context.beginFlagEpisode(0, standing);
  context.finishOpenFlagEpisodes(true);
  check('a win counts a correct mark never used by a chord',
    context.unusedCorrectFlags === 1
      && standing.evidence.unusedFlagEndedBy === 'game-ended');
}

console.log(`unused-mark: all ${checks} checks passed`);
