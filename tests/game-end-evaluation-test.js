'use strict';
// Known-answer tests for the game-end evaluation: the death-verdict
// classifier, its player-facing justification text, and the Justice
// recap wording (extracts the pure GAME-END EVALUATION: VERDICT span).

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------GAME-END EVALUATION: VERDICT');
const endIdx = source.indexOf('//-------GAME-END EVALUATION: CAPTURE');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}
function assertContains(name, text, want) {
  checks++;
  if (!text.includes(want)) {
    throw new Error(`${name}: "${text}" does not contain "${want}"`);
  }
}
function assertNotContains(name, text, unwanted) {
  checks++;
  if (text.includes(unwanted)) {
    throw new Error(`${name}: "${text}" must not contain "${unwanted}"`);
  }
}

// The classifier, ranked: a provable mine outranks everything; then the
// act shape (chord, blind first click); then the measured facts.
assertEq('proven mine wins over everything',
  deathVerdict({ via: 'bare', provenMine: true, measured: true, safeAvailable: true }), 'mine');
assertEq('proven mine via chord is still mine',
  deathVerdict({ via: 'chord', provenMine: true }), 'mine');
assertEq('chord death without a proven mine',
  deathVerdict({ via: 'chord', provenMine: false }), 'chord');
assertEq('blind first click is an angel-death',
  deathVerdict({ via: 'first' }), 'angel');
assertEq('unmeasured bare death is unjudged',
  deathVerdict({ via: 'bare', provenMine: false, measured: false }), undefined);
assertEq('safe square available makes the guess needless',
  deathVerdict({ via: 'bare', provenMine: false, measured: true, safeAvailable: true, bestOdds: false }),
  'needless');
assertEq('forced at the best odds is an angel-death',
  deathVerdict({ via: 'bare', provenMine: false, measured: true, safeAvailable: false, bestOdds: true }),
  'angel');
assertEq('forced off the best odds is a forced guess',
  deathVerdict({ via: 'bare', provenMine: false, measured: true, safeAvailable: false, bestOdds: false }),
  'forced');
assertEq('proof-or-die with a safe square available is needless',
  deathVerdict({ via: 'proof', provenMine: false, measured: true, safeAvailable: true }), 'needless');
assertEq('proof-or-die with nothing provable is forced',
  deathVerdict({ via: 'proof', provenMine: false, measured: true, safeAvailable: false }), 'forced');

// Every kind has a label.
for (const kind of ['mine', 'chord', 'needless', 'forced', 'angel']) {
  checks++;
  if (typeof DEATH_KIND_LABELS[kind] !== 'string') {
    throw new Error(`missing label for kind ${kind}`);
  }
}
assertEq('mine label matches the requested wording',
  DEATH_KIND_LABELS.mine, 'clicked clear mine');
assertEq('angel label', DEATH_KIND_LABELS.angel, 'angel-death');

// The justification text names the judgement's exact grounds.
assertContains('mine text states the provable fact',
  deathVerdictText({ deathKind: 'mine' }), 'provably a mine');
assertContains('mine text counts the click',
  deathVerdictText({ deathKind: 'mine' }), 'Clicked clear mine +1');
assertContains('chord text blames the flag',
  deathVerdictText({ deathKind: 'chord' }), 'wrong flag');
assertContains('angel text absolves',
  deathVerdictText({ deathKind: 'angel', deathRisk: 0.25 }), 'not your fault');
assertContains('angel text carries the odds',
  deathVerdictText({ deathKind: 'angel', deathRisk: 0.25 }), '25.0%');
assertContains('forced text compares both odds',
  deathVerdictText({ deathKind: 'forced', deathRisk: 0.3, deathBestRisk: 0.125 }), '30.0%');
assertContains('forced text names the best available',
  deathVerdictText({ deathKind: 'forced', deathRisk: 0.3, deathBestRisk: 0.125 }), '12.5%');
assertContains('needless text names the safe square',
  deathVerdictText({ deathKind: 'needless', deathRisk: 0.2 }), 'provably safe square was available');
assertContains('proof-or-die forced text states the rule death',
  deathVerdictText({ deathKind: 'forced', playMode: 'proof-or-die' }), 'death by rule');
assertNotContains('proof-or-die forced text never talks odds',
  deathVerdictText({ deathKind: 'forced', playMode: 'proof-or-die' }), '%');
assertContains('unjudged text admits the limit',
  deathVerdictText({}), 'could not be judged');

// The Justice recap: the rule is cited by name, the count is right, and
// the redraw detail is honest about entries that were already clear.
assertContains('recap cites the rule',
  justiceRecapText(2, 1), 'A Just Universe');
assertContains('recap counts the choices',
  justiceRecapText(2, 1), '2 times');
assertContains('recap singular', justiceRecapText(1, 1), 'once');
assertContains('recap names the real save',
  justiceRecapText(1, 1), 'moved out from under you');
assertContains('recap is honest about already-clear entries',
  justiceRecapText(2, 0), 'already clear');
assertContains('event detail names the pocket',
  justiceEventDetail({ type: 'sea', clearWays: 3, totalWays: 5, saved: true }, 0),
  'sealed sea pocket (3/5 layouts clear)');
assertContains('event detail says the mine moved',
  justiceEventDetail({ type: 'sea', clearWays: 3, totalWays: 5, saved: true }, 0),
  'redrawn');
assertContains('event detail says already clear',
  justiceEventDetail({ type: 'complement', clearWays: 1, totalWays: 2, saved: false }, 1),
  'already clear');

console.log(`game-end-evaluation: all ${checks} checks passed`);
