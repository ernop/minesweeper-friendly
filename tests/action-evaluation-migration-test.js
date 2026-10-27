'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = require('./game-source.js').source;
function runSection(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error('section marker missing');
  vm.runInThisContext(source.slice(start, end));
}
globalThis.Justice = require(path.join(__dirname, '..', 'justice.js'));
runSection('//-------GAME-END EVALUATION: VERDICT',
  '//-------GAME-END EVALUATION: CAPTURE');
runSection('//-------ACTION EVALUATION: HISTORY NORMALIZATION (pure)',
  '//-------ACTION EVALUATION: HISTORY NORMALIZATION END');

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

const base = {
  endedAt: 1,
  outcome: 'loss',
  timeMs: 1000,
  clicks: 3,
  playMode: 'standard',
};

{
  const modern = normalizeGameRecord({
    ...base,
    stupidDeath: true,
    deathKind: 'needless',
    deathRisk: 0.25,
    deathBestRisk: 0,
  });
  check('legacy record changed', modern.changed);
  check('one fatal action created', modern.record.actionEvaluations.length === 1);
  const fatal = modern.record.actionEvaluations[0];
  check('death kind becomes legacy provenance', fatal.legacy.deathKind === 'needless');
  check('selected risk retained', fatal.evidence.chosenRisk === 0.25);
  check('best risk retained', fatal.evidence.bestRisk === 0);
  check('needless mistake retained', fatal.mistakes.includes('guessed-with-safe-move'));
  check('legacy boolean removed', !('stupidDeath' in modern.record));
  check('legacy kind removed', !('deathKind' in modern.record));
  check('legacy risks removed',
    !('deathRisk' in modern.record) && !('deathBestRisk' in modern.record));
}

{
  const win = { ...base, outcome: 'win', actionEvaluations: [] };
  const modern = normalizeGameRecord({ ...win, flagsWithoutMultiCellChord: 4 });
  check('removed win measure deleted', modern.changed && !('flagsWithoutMultiCellChord' in modern.record));
  check('record without it unchanged', !normalizeGameRecord(win).changed);
  const earlierGap = normalizeGameRecord({ ...win, fastclickGapMs: 180 });
  check('fastclick gap of the earlier definition deleted',
    earlierGap.changed && !('fastclickGapMs' in earlierGap.record));
  const plannedPairs = { ...win, fastclickGapMs: 142, fastclickGapVersion: 'planned-pairs-v1' };
  const kept = normalizeGameRecord(plannedPairs);
  check('fastclick gap with its version kept', !kept.changed && kept.record.fastclickGapMs === 142);
  const noPairs = { ...win, fastclickGapVersion: 'planned-pairs-v1' };
  check('version without a gap unchanged', !normalizeGameRecord(noPairs).changed);
}

{
  const modern = normalizeGameRecord({ ...base, stupidDeath: true });
  const fatal = modern.record.actionEvaluations[0];
  check('boolean-only source retained', fatal.legacy.source === 'avoidable-boolean-v1');
  check('boolean-only uncertainty explicit', fatal.mistakes.includes('legacy-avoidable'));
  check('boolean-only cannot invent kind', fatal.legacy.deathKind === undefined);
}

{
  const modern = normalizeGameRecord({
    ...base,
    outcome: 'win',
    stupidDeath: undefined,
  });
  check('old win becomes explicit coverage note',
    Array.isArray(modern.record.actionEvaluations)
      && modern.record.actionEvaluations.length === 1
      && modern.record.actionEvaluations[0].legacy.source
        === 'pre-action-evaluation-coverage');
  check('old win note is not invented as a mistake',
    modern.record.actionEvaluations[0].mistakes.length === 0
      && actionEvaluationCategory(modern.record.actionEvaluations[0])
        === 'measurementNotes');
}

{
  const evaluation = {
    version: ACTION_EVALUATION_VERSION,
    action: 'reveal',
    result: 'continued',
    mistakes: ['guessed-with-safe-move'],
    evidence: { chosenRisk: 0.2, bestRisk: 0 },
    alternatives: [],
  };
  const modern = normalizeGameRecord({ ...base, actionEvaluations: [evaluation] });
  check('modern record stays unchanged', modern.changed === false);
  check('modern evidence object retained',
    modern.record.actionEvaluations[0] === evaluation);
}

// A loss saved before its fatal reveal stored proof tiers gains them once
// from the saved position; loading it again changes nothing.
{
  const fatal = {
    version: ACTION_EVALUATION_VERSION,
    action: 'reveal',
    actionNumber: 3,
    atMs: 900,
    result: 'death',
    selected: [1],
    mistakes: ['opened-proven-mine', 'ignored-safe-move'],
    evidence: { safeAvailable: true },
    alternatives: [],
    position: { width: 3, height: 1, mines: 1, revealed: [[0, 1]], flagged: [] },
  };
  const first = normalizeGameRecord({ ...base, actionEvaluations: [fatal] });
  check('an untiered loss is upgraded and persisted', first.changed);
  const measured = first.record.actionEvaluations[0];
  check('the opened mine tier is stored', measured.evidence.mineProofTier === 'counting');
  check('the safe square tier is stored', measured.evidence.safeProofTier === 'whole-board');
  check('the loaded record is not mutated', fatal.evidence.mineProofTier === undefined);
  check('a tiered loss is left unchanged', normalizeGameRecord(first.record).changed === false);
}

// Boards and square lists saved before 2026-10-26 hold arrays: loading
// converts them to strings once, losslessly; a converted record loads
// unchanged, and a board no string can hold stops the load.
{
  const saved = {
    version: ACTION_EVALUATION_VERSION,
    action: 'reveal',
    actionNumber: 2,
    atMs: 500,
    result: 'continued',
    selected: [5],
    mistakes: ['chose-higher-risk'],
    evidence: { boardProgress: 0.25 },
    alternatives: [{ kind: 'lower-risk-reveal', cells: [6, 7], risk: 0.1 }],
    choices: [{ kind: 'minimum-risk-reveal', cells: [6, 7], risk: 0.1 }],
    position: { width: 4, height: 2, mines: 2, revealed: [[0, 1], [1, 2], [3, 0]], flagged: [2] },
  };
  const loaded = normalizeGameRecord({ ...base, outcome: 'win', actionEvaluations: [saved] });
  const converted = loaded.record.actionEvaluations[0];
  check('an array-format record is converted and persisted', loaded.changed);
  check('the board becomes one character per square', converted.position.cells === '12F0....');
  check('the board keeps its size and nothing else',
    JSON.stringify(Object.keys(converted.position)) === '["width","height","mines","cells"]'
      && converted.position.width === 4 && converted.position.height === 2 && converted.position.mines === 2);
  check('square lists become comma-joined squares',
    converted.alternatives[0].cells === '6,7' && converted.choices[0].cells === '6,7');
  check('list risks are kept', converted.alternatives[0].risk === 0.1 && converted.choices[0].risk === 0.1);
  check('the decoders read the converted board back exactly',
    JSON.stringify([...positionNumbers(converted.position)]) === '[[0,1],[1,2],[3,0]]'
      && JSON.stringify([...positionFlags(converted.position)]) === '[2]'
      && positionOpenCount(converted.position) === 3);
  check('the decoders read a square list back exactly',
    JSON.stringify(squareList(converted.alternatives[0].cells)) === '[6,7]');
  check('the saved record is not mutated', Array.isArray(saved.position.revealed));
  const again = normalizeGameRecord(loaded.record);
  check('a converted record loads unchanged',
    again.changed === false && again.record.actionEvaluations[0] === converted);
  let refused = false;
  try {
    normalizeGameRecord({ ...base, outcome: 'win',
      actionEvaluations: [{ ...saved, position: { ...saved.position, flagged: [0] } }] });
  } catch (error) {
    refused = /unconvertible flag/.test(error.message);
  }
  check('a square both open and flagged stops the load', refused);
}

console.log(`action-evaluation-migration: all ${checks} checks passed`);
