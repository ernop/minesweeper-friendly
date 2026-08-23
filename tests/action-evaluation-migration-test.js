'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
function runSection(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error('section marker missing');
  vm.runInThisContext(source.slice(start, end));
}
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
  check('old win becomes empty modern ledger',
    Array.isArray(modern.record.actionEvaluations)
      && modern.record.actionEvaluations.length === 0);
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

console.log(`action-evaluation-migration: all ${checks} checks passed`);
