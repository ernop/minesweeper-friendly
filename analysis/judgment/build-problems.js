#!/usr/bin/env node
'use strict';
// Judgment problems (creator request 2026-10-14): picks wins and losses from
// the player's own saved games, each with one or more situations (the fatal
// click, or an earlier choice), for the quiz page judge.html beside this file.
// The creator says how each game should be judged; the answers settle the
// result categories in BACKLOG.md, "Game results as one tree per board type".
//
//   node analysis/judgment/build-problems.js <history-export.json>
//        [--out analysis/judgment/judgment-problems.json] [--survey]
//
// --survey prints how many games each kind of problem could draw from and
// writes nothing. Reads only saved records: every judged action keeps the
// visible position before it, its risk facts, and its alternatives; clean
// wins are rebuilt from their seed.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

//-------ARGUMENTS-------

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  process.stderr.write('usage: node analysis/judgment/build-problems.js <history-export.json> '
    + '[--out file.json] [--survey]\n');
  process.exit(args.length === 0 ? 2 : 0);
}
const outAt = args.indexOf('--out');
if (outAt !== -1 && outAt + 1 >= args.length) throw new Error('--out needs a value');
const outPath = outAt === -1
  ? path.join(__dirname, 'judgment-problems.json') : args[outAt + 1];
const survey = args.includes('--survey');
const inputPath = args.find((arg, i) => !arg.startsWith('--') && (i === 0 || args[i - 1] !== '--out'));
if (!inputPath) throw new Error('no history export path given');

//-------THE GAME'S OWN CODE-------

const repo = path.join(__dirname, '..', '..');
globalThis.Justice = require(path.join(repo, 'justice.js'));
const Odds = require(path.join(repo, 'odds.js'));
const Solver = require(path.join(repo, 'solver.js'));
const GameRandom = require(path.join(repo, 'rng.js'));
const source = fs.readFileSync(path.join(repo, 'game', 'evaluation.js'), 'utf8');
const startIdx = source.indexOf('//-------GAME-END EVALUATION: VERDICT');
const endIdx = source.indexOf('//-------GAME-END EVALUATION: CAPTURE');
if (startIdx === -1 || endIdx === -1) throw new Error('verdict section markers not found');
vm.runInThisContext(source.slice(startIdx, endIdx));
/* global ACTION_EVALUATION_VERSION, EARLY_GAME_PROGRESS_LIMIT, LOSS_TYPE_LABELS,
   WIN_TYPE_LABELS, evaluationBoardProgress, evaluationProvenSafeAvailable,
   evaluationJusticeSafeAvailable, besideFlagSatisfiedNumber, easiestProofTier,
   fatalProofTiers, lossTypeOf, winTypeOf, likelyMisclickReasonsOf, positionView,
   squareDistance */

//-------DEFINITIONS-------

const BANK_FORMAT = 'minesweeper-judgment-problems';
const BANK_FORMAT_VERSION = 1;
const SIZE_NAMES = { '9x9/10': 'Beginner', '16x16/40': 'Intermediate', '30x16/99': 'Expert' };
const KEYS = Object.keys(SIZE_NAMES).map((size) => size + '@standard');
// The endgame begins once nine tenths of the safe squares are open
// (BACKLOG.md, "Game results as one tree per board type").
const ENDGAME_PROGRESS = 0.9;
const TINY_RISK = 0.08;
const HUGE_LOSS_RISK = 0.4;
const HUGE_WIN_RISK = 0.3;
const SMALL_RISK_RATIO = 1.35;
const COIN_FLIP_RISK = 0.45;
const LAST_SQUARES_PROGRESS = 0.95;
const RUSHED_MS = 500;
const MAX_MOMENTS = 3;
const EPS = 1e-12;

function phaseOf(progress) {
  if (progress < EARLY_GAME_PROGRESS_LIMIT) return 'opening';
  return progress >= ENDGAME_PROGRESS ? 'endgame' : 'middle';
}

function flagsAround(position, cell) {
  const flagged = new Set(position.flagged);
  return Justice.neighbors(cell, position.width, position.height).filter((nb) => flagged.has(nb));
}

// The flags a reveal trusted: those around every revealed number beside the
// clicked square whose flags already matched its count.
function trustedFlagsOf(position, cell) {
  const trusted = new Set();
  for (const [number, count] of position.revealed) {
    if (count === 0 || squareDistance(position.width, number, cell) !== 1) continue;
    const flags = flagsAround(position, number);
    if (flags.length === count) for (const flag of flags) trusted.add(flag);
  }
  return [...trusted];
}

function provenFacts(position) {
  const view = positionView(position);
  return Justice.proveFacts(view, Justice.rawClues(view));
}

//-------MOMENTS: ONE SAVED, POSITIONED ACTION-------

// What a saved action was, judged against what the player could know then.
// Light: saved evidence plus the prover only where a kind needs it.
function momentOf(evaluation, ledger) {
  if (evaluation.position === undefined) return null;
  const evidence = evaluation.evidence;
  const position = evaluation.position;
  const progress = evaluationBoardProgress(evaluation);
  const mistakes = evaluation.mistakes;
  const fatal = evaluation.result === 'death';
  const cell = evaluation.selected[0];
  const moment = {
    evaluation,
    actionNumber: evaluation.actionNumber,
    atMs: evaluation.atMs,
    action: evaluation.action,
    fatal,
    progress,
    phase: phaseOf(progress),
  };
  const previous = ledger.find((entry) => entry.actionNumber === evaluation.actionNumber - 1);
  if (previous !== undefined) moment.sincePreviousMs = evaluation.atMs - previous.atMs;
  else if (evaluation.actionNumber === 2) moment.sincePreviousMs = evaluation.atMs;

  if (evaluation.action === 'chord') {
    // A chord whose capture failed saved no flag facts.
    if (!Array.isArray(evidence.wrongFlags)) {
      moment.kind = 'unmeasured';
      return moment;
    }
    const contradicted = evidence.wrongFlags.length > 0 || evidence.openedProvenMines.length > 0;
    if (fatal) moment.kind = contradicted ? 'known-through-own-flag' : 'gamble-on-own-flag';
    else moment.kind = contradicted ? 'chord-contradiction-survived' : 'chord-other';
    return moment;
  }
  if (evaluation.action === 'flag-place') {
    moment.kind = mistakes.includes('flagged-proven-safe') ? 'flag-on-safe'
      : mistakes.includes('unused-correct-flag') ? 'unused-flag' : 'flag-other';
    return moment;
  }
  if (evaluation.action === 'flag-remove') {
    moment.kind = mistakes.includes('removed-proven-mine-flag') ? 'removed-mine-flag' : 'flag-other';
    return moment;
  }
  if (evaluation.action !== 'reveal') {
    moment.kind = 'other';
    return moment;
  }
  if (evidence.firstReveal === true) {
    moment.kind = 'first-click';
    return moment;
  }
  const measured = typeof evidence.chosenRisk === 'number' && typeof evidence.bestRisk === 'number';
  if (measured) {
    moment.chosenRisk = evidence.chosenRisk;
    moment.bestRisk = evidence.bestRisk;
  }
  if (evidence.knowledge === 'proven-mine') {
    moment.kind = fatal && besideFlagSatisfiedNumber(position, cell)
      ? 'known-through-own-flag' : 'known-mine';
    return moment;
  }
  if (fatal && besideFlagSatisfiedNumber(position, cell)) {
    const facts = provenFacts(position);
    const contradicted = trustedFlagsOf(position, cell).some((flag) => facts.get(flag) === 2);
    moment.kind = contradicted ? 'known-through-own-flag' : 'gamble-on-own-flag';
    return moment;
  }
  if (evaluationProvenSafeAvailable(evidence)
      || mistakes.includes('opened-unproven-with-safe-move')) {
    moment.kind = 'unnecessary';
  } else if (evaluationJusticeSafeAvailable(evidence) && evidence.justiceProtected !== true) {
    moment.kind = 'unnecessary-justice';
  } else if (!measured) {
    moment.kind = 'unmeasured';
  } else if (evidence.chosenRisk > evidence.bestRisk + EPS
      && evidence.actualRisk > evidence.bestActualRisk + EPS) {
    moment.kind = 'worse';
    moment.riskRatio = evidence.chosenRisk / evidence.bestRisk;
  } else {
    moment.kind = 'best';
  }
  return moment;
}

// The one-step expected-life comparison, recomputed from the saved position
// with the game's own call (game/play.js). Records saved before 2026-10-11
// stored a bare survival tie where the model never ran; the current odds
// code omits the comparison there, so only real comparisons survive.
function modeledLifeOf(moment, record) {
  if (moment.modeledLife === undefined) {
    const evaluation = moment.evaluation;
    const guess = Odds.scoreGuess(positionView(evaluation.position), evaluation.selected[0],
      { considerJustice: record.justiceEnabled === true });
    moment.modeledLife = guess !== null && guess.measured && typeof guess.expectedLife === 'number'
      ? { expectedLife: guess.expectedLife, bestExpectedLife: guess.bestExpectedLife,
        bestExpectedCells: guess.bestExpectedCells }
      : null;
  }
  return moment.modeledLife;
}

function lessInformative(moment, record) {
  const life = modeledLifeOf(moment, record);
  return life !== null && life.bestExpectedLife > life.expectedLife + 1e-9;
}

function moreInformative(moment, record) {
  const life = modeledLifeOf(moment, record);
  return life !== null && life.expectedLife >= life.bestExpectedLife - 1e-9;
}

const KNOWN_KINDS = new Set(['known-mine', 'known-through-own-flag']);
const UNNECESSARY_KINDS = new Set(['unnecessary', 'unnecessary-justice']);

// Display priority of a game's other moments: the most consequential first.
const MOMENT_SEVERITY = {
  'known-mine': 9, 'known-through-own-flag': 9, 'gamble-on-own-flag': 8,
  unnecessary: 7, 'unnecessary-justice': 7, worse: 6, 'flag-on-safe': 4,
  'removed-mine-flag': 4, 'chord-contradiction-survived': 4, best: 2,
};

function safeTierOf(moment) {
  if (moment.safeTier === undefined) {
    moment.safeTier = easiestProofTier(moment.evaluation.position, 2);
  }
  return moment.safeTier;
}

function mineTierOf(moment) {
  if (moment.mineTier === undefined) {
    moment.mineTier = moment.evaluation.evidence.mineProofTier
      || easiestProofTier(moment.evaluation.position, 1, moment.evaluation.selected[0]);
  }
  return moment.mineTier;
}

function besideNumber(moment) {
  const position = moment.evaluation.position;
  const cell = moment.evaluation.selected[0];
  return position.revealed.some(([number, count]) =>
    count > 0 && squareDistance(position.width, number, cell) === 1);
}

function nearestLowestDistance(moment) {
  const lower = moment.evaluation.alternatives.find((alt) => alt.kind === 'lower-risk-reveal');
  if (lower === undefined) return undefined;
  const cell = moment.evaluation.selected[0];
  return Math.min(...lower.cells.map((other) =>
    squareDistance(moment.evaluation.position.width, other, cell)));
}

//-------GAMES-------

function modernEvidence(record) {
  return Array.isArray(record.actionEvaluations)
    && record.actionEvaluations.every((evaluation) => !evaluation.legacy
      && evaluation.version === ACTION_EVALUATION_VERSION);
}

function gameOf(key, record) {
  const ledger = record.actionEvaluations;
  // The page's history load adds these to losses saved before 2026-10-11.
  for (const evaluation of ledger) {
    if (evaluation.result === 'death') Object.assign(evaluation.evidence, fatalProofTiers(evaluation));
  }
  const moments = ledger.map((evaluation) => momentOf(evaluation, ledger)).filter(Boolean);
  const game = { key, record, moments };
  if (record.outcome === 'loss') {
    game.fatal = moments.find((moment) => moment.fatal);
  }
  game.survived = moments.filter((moment) => !moment.fatal);
  return game;
}

function survivedOfKinds(game, kinds) {
  return game.survived.filter((moment) => kinds.has(moment.kind));
}

function worstRisk(moments) {
  return moments.reduce((best, moment) =>
    (best === undefined || moment.chosenRisk > best.chosenRisk ? moment : best), undefined);
}

//-------STRATA: THE KINDS OF PROBLEM-------

// Each stratum names a kind of game worth judging and returns the moment
// that makes the game that kind (its focus), or undefined. `measure` orders
// the candidates so a quota spreads across the kind's range.
const loss = (test) => (game) => {
  if (game.record.outcome !== 'loss' || game.fatal === undefined) return undefined;
  return test(game.fatal, game) ? game.fatal : undefined;
};
const win = (pick) => (game) => (game.record.outcome === 'win' ? pick(game) : undefined);
const byRisk = (moment) => moment.chosenRisk;
const byRatio = (moment) => moment.riskRatio;
const byProgress = (moment) => moment.progress;

const STRATA = [
  // Losses the numbers made certain.
  { id: 'loss-known-counting-opening', quota: 3, label: 'Lost: clicked a mine that counting proved, in the opening',
    focus: loss((f) => f.kind === 'known-mine' && f.phase === 'opening' && mineTierOf(f) === 'counting'),
    measure: byProgress },
  { id: 'loss-known-counting-middle', quota: 4, label: 'Lost: clicked a mine that counting proved, mid-game',
    focus: loss((f) => f.kind === 'known-mine' && f.phase === 'middle' && mineTierOf(f) === 'counting'),
    measure: byProgress },
  { id: 'loss-known-counting-endgame', quota: 4, label: 'Lost: clicked a mine that counting proved, in the endgame',
    focus: loss((f) => f.kind === 'known-mine' && f.phase === 'endgame' && mineTierOf(f) === 'counting'),
    measure: byProgress },
  { id: 'loss-known-overlap', quota: 4, label: 'Lost: clicked a mine that comparing overlapping numbers proved',
    focus: loss((f) => f.kind === 'known-mine' && mineTierOf(f) === 'overlap'), measure: byProgress },
  { id: 'loss-known-whole-board', quota: 3, label: 'Lost: clicked a mine only whole-board reasoning proved',
    focus: loss((f) => f.kind === 'known-mine' && mineTierOf(f) === 'whole-board'), measure: byProgress },
  { id: 'loss-known-no-safe-move', quota: 3, label: 'Lost: clicked a proven mine when no square was safe',
    focus: loss((f) => f.kind === 'known-mine' && !evaluationProvenSafeAvailable(f.evaluation.evidence)),
    measure: byProgress },
  { id: 'loss-at-the-last-squares', quota: 4, label: 'Lost with at most a twentieth of the safe squares left',
    focus: loss((f) => f.progress >= LAST_SQUARES_PROGRESS && f.kind !== 'unmeasured'), measure: byProgress },
  { id: 'loss-known-slip-after-wrong-flag', quota: 3, label: 'Lost: likely misclick right after a wrong flag',
    focus: loss((f, g) => f.kind === 'known-mine'
      && likelyMisclickReasonsOf(f.evaluation, g.record.actionEvaluations).includes('wrong-flag')),
    measure: byProgress },
  { id: 'loss-known-wrong-button', quota: 3, label: 'Lost: left-clicked a proven mine right after a chord beside it lacked flags',
    focus: loss((f, g) => f.kind === 'known-mine'
      && likelyMisclickReasonsOf(f.evaluation, g.record.actionEvaluations).includes('wrong-button')),
    measure: byProgress },
  { id: 'loss-own-flag-contradicted-chord', quota: 4, label: 'Lost: chorded through a flag the numbers contradicted',
    focus: loss((f) => f.kind === 'known-through-own-flag' && f.action === 'chord'), measure: byProgress },
  { id: 'loss-own-flag-contradicted-reveal', quota: 3, label: 'Lost: clicked beside a number whose contradicted flags said safe',
    focus: loss((f) => f.kind === 'known-through-own-flag' && f.action === 'reveal'), measure: byProgress },
  { id: 'loss-gamble-on-guessed-flag', quota: 4, label: 'Lost: trusted a flag that was itself a guess',
    focus: loss((f) => f.kind === 'gamble-on-own-flag'), measure: byProgress },
  // Losses on a gamble while a square was proven safe.
  { id: 'loss-unnecessary-counting', quota: 4, label: 'Lost: guessed while counting proved a square safe',
    focus: loss((f) => f.kind === 'unnecessary' && safeTierOf(f) === 'counting'), measure: byRisk },
  { id: 'loss-unnecessary-overlap', quota: 4, label: 'Lost: guessed while overlapping numbers proved a square safe',
    focus: loss((f) => f.kind === 'unnecessary' && safeTierOf(f) === 'overlap'), measure: byRisk },
  { id: 'loss-unnecessary-whole-board', quota: 4, label: 'Lost: guessed while only whole-board reasoning proved a square safe',
    focus: loss((f) => f.kind === 'unnecessary' && safeTierOf(f) === 'whole-board'), measure: byRisk },
  { id: 'loss-unnecessary-opening', quota: 3, label: 'Lost: guessed in the opening while a square was proven safe',
    focus: loss((f) => f.kind === 'unnecessary' && f.phase === 'opening'), measure: byRisk },
  { id: 'loss-unnecessary-justice', quota: 2, label: 'Lost: guessed while only A Just Universe guaranteed a safe entry',
    focus: loss((f) => f.kind === 'unnecessary-justice'), measure: byRisk },
  { id: 'loss-unnecessary-tiny', quota: 3, label: 'Lost: a needless guess at a small risk',
    focus: loss((f) => f.kind === 'unnecessary' && f.chosenRisk < TINY_RISK), measure: byRisk },
  { id: 'loss-unnecessary-huge', quota: 3, label: 'Lost: a needless guess at a large risk',
    focus: loss((f) => f.kind === 'unnecessary' && f.chosenRisk >= HUGE_LOSS_RISK), measure: byRisk },
  // Losses on a riskier gamble than the safest one.
  { id: 'loss-worse-opening-fast', quota: 5, label: 'Lost: a riskier guess beside a number, fast, in the opening',
    focus: loss((f) => f.kind === 'worse' && f.phase === 'opening' && besideNumber(f)
      && f.sincePreviousMs < RUSHED_MS), measure: byRatio },
  { id: 'loss-worse-opening-slow', quota: 4, label: 'Lost: a riskier guess in the opening after a long look',
    focus: loss((f) => f.kind === 'worse' && f.phase === 'opening' && f.sincePreviousMs >= 1500),
    measure: byRatio },
  { id: 'loss-worse-small-ratio', quota: 4, label: 'Lost: a guess barely riskier than the safest',
    focus: loss((f) => f.kind === 'worse' && f.riskRatio < SMALL_RISK_RATIO), measure: byRatio },
  { id: 'loss-worse-middle-near', quota: 4, label: 'Lost: a riskier guess mid-game, safest square nearby',
    focus: loss((f) => f.kind === 'worse' && f.phase === 'middle' && nearestLowestDistance(f) <= 2),
    measure: byRatio },
  { id: 'loss-worse-middle-far', quota: 4, label: 'Lost: a riskier guess mid-game, safest square far away',
    focus: loss((f) => f.kind === 'worse' && f.phase === 'middle' && nearestLowestDistance(f) > 2),
    measure: byRatio },
  { id: 'loss-worse-endgame', quota: 4, label: 'Lost: a riskier guess in the endgame',
    focus: loss((f) => f.kind === 'worse' && f.phase === 'endgame'), measure: byRatio },
  { id: 'loss-worse-more-informative', quota: 4, label: 'Lost: a riskier guess that the one-step model rated more informative',
    focus: loss((f, g) => f.kind === 'worse' && moreInformative(f, g.record)), measure: byRatio },
  // Losses on the best gamble available.
  { id: 'loss-best-opening', quota: 4, label: 'Lost: the safest guess available, in the opening',
    focus: loss((f) => f.kind === 'best' && f.phase === 'opening'), measure: byRisk },
  { id: 'loss-best-middle', quota: 4, label: 'Lost: the safest guess available, mid-game',
    focus: loss((f) => f.kind === 'best' && f.phase === 'middle'), measure: byRisk },
  { id: 'loss-best-endgame-coin-flip', quota: 4, label: 'Lost: a forced coin flip in the endgame',
    focus: loss((f) => f.kind === 'best' && f.phase === 'endgame' && f.chosenRisk >= COIN_FLIP_RISK),
    measure: byRisk },
  { id: 'loss-best-less-informative', quota: 3, label: 'Lost: the lowest risk, but a less informative square',
    focus: loss((f, g) => f.kind === 'best' && lessInformative(f, g.record)), measure: byRisk },
  // How the game got there.
  { id: 'loss-path-earlier-avoidable-risk', quota: 4, label: 'Lost on a forced guess after surviving an avoidable one',
    focus: (game) => {
      if (game.record.outcome !== 'loss' || game.fatal === undefined
          || !['best', 'worse'].includes(game.fatal.kind)) return undefined;
      return worstRisk(survivedOfKinds(game, new Set(['unnecessary', 'worse'])));
    }, measure: byRisk },
  { id: 'loss-path-earlier-wrong-flag', quota: 3, label: 'Lost through a flag placed earlier on a proven-safe square',
    focus: (game) => (game.record.outcome === 'loss' ? causalFlagMoments(game)[0] : undefined),
    measure: byProgress },
  // Wins.
  { id: 'win-unnecessary-counting', quota: 6, label: 'Won after guessing while counting proved a square safe',
    focus: win((g) => worstRisk(survivedOfKinds(g, new Set(['unnecessary']))
      .filter((m) => safeTierOf(m) === 'counting'))), measure: byRisk },
  { id: 'win-unnecessary-harder-proof', quota: 4, label: 'Won after guessing while only harder reasoning proved a square safe',
    focus: win((g) => worstRisk(survivedOfKinds(g, new Set(['unnecessary']))
      .filter((m) => safeTierOf(m) !== 'counting'))), measure: byRisk },
  { id: 'win-unnecessary-huge', quota: 4, label: 'Won after a needless guess at a large risk',
    focus: win((g) => worstRisk(survivedOfKinds(g, UNNECESSARY_KINDS)
      .filter((m) => m.chosenRisk >= HUGE_WIN_RISK))), measure: byRisk },
  { id: 'win-unnecessary-tiny', quota: 3, label: 'Won after a needless guess at a small risk',
    focus: win((g) => {
      const needless = survivedOfKinds(g, UNNECESSARY_KINDS);
      return needless.length > 0 && needless.every((m) => m.chosenRisk < TINY_RISK)
        ? needless[0] : undefined;
    }), measure: byRisk },
  { id: 'win-worse-opening', quota: 5, label: 'Won after a riskier guess in the opening',
    focus: win((g) => survivedOfKinds(g, UNNECESSARY_KINDS).length === 0
      ? worstRisk(survivedOfKinds(g, new Set(['worse'])).filter((m) => m.phase === 'opening'))
      : undefined), measure: byRatio },
  { id: 'win-worse-later', quota: 5, label: 'Won after a riskier guess past the opening',
    focus: win((g) => survivedOfKinds(g, UNNECESSARY_KINDS).length === 0
      ? worstRisk(survivedOfKinds(g, new Set(['worse'])).filter((m) => m.phase !== 'opening'))
      : undefined), measure: byRatio },
  { id: 'win-worse-small-ratio', quota: 3, label: 'Won after a guess barely riskier than the safest',
    focus: win((g) => {
      const risky = survivedOfKinds(g, new Set(['worse', 'unnecessary', 'unnecessary-justice']));
      return risky.length > 0 && risky.every((m) => m.kind === 'worse' && m.riskRatio < SMALL_RISK_RATIO)
        ? risky[0] : undefined;
    }), measure: byRatio },
  { id: 'win-worse-more-informative', quota: 3, label: 'Won after a riskier guess the one-step model rated more informative',
    focus: win((g) => survivedOfKinds(g, new Set(['worse'])).find((m) => moreInformative(m, g.record))),
    measure: byRatio },
  { id: 'win-less-informative-only', quota: 3, label: 'Won; every guess at the lowest risk, one less informative',
    focus: win((g) => {
      const risky = survivedOfKinds(g, new Set(['worse', 'unnecessary', 'unnecessary-justice']));
      return risky.length === 0
        ? g.survived.find((m) => m.kind === 'best' && lessInformative(m, g.record)) : undefined;
    }), measure: byRisk },
  { id: 'win-flag-on-safe', quota: 4, label: 'Won without risky guesses after flagging a proven-safe square',
    focus: win((g) => {
      const risky = survivedOfKinds(g, new Set(['worse', 'unnecessary', 'unnecessary-justice']));
      return risky.length === 0 ? survivedOfKinds(g, new Set(['flag-on-safe']))[0] : undefined;
    }), measure: byProgress },
  { id: 'win-many-mistakes', quota: 5, label: 'Won after three or more avoidable risks',
    focus: win((g) => {
      const risky = survivedOfKinds(g, new Set(['worse', 'unnecessary', 'unnecessary-justice']));
      return risky.length >= 3 ? worstRisk(risky) : undefined;
    }), measure: byRisk },
  { id: 'win-clean-best-only', quota: 4, label: 'Won; every guess at the lowest risk (final board)',
    focus: win((g) => cleanWinFinal(g, (guesses) => guesses > 0)), measure: () => 0 },
  { id: 'win-clean-no-guess', quota: 3, label: 'Won without a guess (final board)',
    focus: win((g) => cleanWinFinal(g, (guesses) => guesses === 0)), measure: () => 0 },
];

// A clean win's only picture is its final board, rebuilt from the seed; a
// Just Universe redraw would make the seed's layout wrong, so those are left out.
function cleanWinFinal(game, guessTest) {
  const record = game.record;
  if (typeof record.guesses !== 'number' || !guessTest(record.guesses) || record.justice !== 0
      || record.boardVersion !== 'uniform-first-safe-fisher-yates-v1'
      || record.rngVersion !== GameRandom.VERSION) return undefined;
  if (game.moments.some((m) => m.kind !== 'first-click' && m.kind !== 'unused-flag'
      && m.kind !== 'best')) return undefined;
  return { kind: 'final', progress: 1, phase: 'endgame', actionNumber: Infinity };
}

//-------BANK MOMENTS: FULL FACTS FOR DISPLAY-------

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function choiceShareOf(moment) {
  if (KNOWN_KINDS.has(moment.kind) || UNNECESSARY_KINDS.has(moment.kind)) return 1;
  if (moment.kind === 'best') return 0;
  if (moment.kind === 'worse') return (moment.chosenRisk - moment.bestRisk) / moment.chosenRisk;
  return undefined;
}

function bankMoment(moment, record, key) {
  if (moment.kind === 'final') return finalBoardMoment(record, key);
  const evaluation = moment.evaluation;
  const evidence = evaluation.evidence;
  const position = evaluation.position;
  const view = positionView(position);
  const facts = Justice.proveFacts(view, Justice.rawClues(view));
  const safeCells = [];
  const mineCells = [];
  for (const [cell, fact] of facts) {
    if (view.revealed[cell]) continue;
    if (fact === 2) safeCells.push(cell);
    if (fact === 1) mineCells.push(cell);
  }
  const out = {
    actionNumber: evaluation.actionNumber,
    atMs: evaluation.atMs,
    action: evaluation.action,
    selected: evaluation.selected,
    result: evaluation.result,
    kind: moment.kind,
    phase: moment.phase,
    progress: round(moment.progress),
    position,
    safeCells: safeCells.sort((a, b) => a - b),
    mineCells: mineCells.sort((a, b) => a - b),
    contradictedFlags: position.flagged.filter((cell) => facts.get(cell) === 2),
    mistakes: evaluation.mistakes,
  };
  if (typeof evaluation.triggerCell === 'number') out.triggerCell = evaluation.triggerCell;
  if (moment.sincePreviousMs !== undefined) out.sincePreviousMs = Math.round(moment.sincePreviousMs);
  for (const field of ['chosenRisk', 'bestRisk', 'actualRisk', 'bestActualRisk']) {
    if (typeof evidence[field] === 'number') out[field] = round(evidence[field], 6);
  }
  if (evidence.justiceProtected === true) out.justiceProtected = true;
  const guessKinds = new Set(['unnecessary', 'unnecessary-justice', 'worse', 'best']);
  if (guessKinds.has(moment.kind) && typeof evidence.chosenRisk === 'number') {
    const life = modeledLifeOf(moment, record);
    if (life !== null) {
      out.expectedLife = round(life.expectedLife, 6);
      out.bestExpectedLife = round(life.bestExpectedLife, 6);
      if (life.bestExpectedLife > life.expectedLife + 1e-9) {
        out.lessInformative = true;
        out.higherLifeCells = life.bestExpectedCells;
      } else if (moment.kind === 'worse') {
        out.moreInformative = true;
      }
    }
  }
  if (moment.kind === 'known-mine') out.proofTier = mineTierOf(moment);
  if (moment.kind === 'unnecessary' && safeCells.length > 0) out.proofTier = safeTierOf(moment);
  if (moment.kind === 'worse') {
    out.riskRatio = round(moment.riskRatio, 3);
    out.nearestLowestDistance = nearestLowestDistance(moment);
  }
  if (evaluation.action === 'reveal' && evidence.firstReveal !== true) out.besideNumber = besideNumber(moment);
  if (evaluation.action === 'chord') {
    out.wrongFlags = evidence.wrongFlags;
    out.openedProvenMines = evidence.openedProvenMines;
    out.chordFlags = flagsAround(position, evaluation.triggerCell);
  }
  if (evaluation.action === 'reveal' && moment.fatal) {
    const trusted = trustedFlagsOf(position, evaluation.selected[0]);
    if (trusted.length > 0) out.trustedFlags = trusted;
  }
  const misclick = likelyMisclickReasonsOf(evaluation, record.actionEvaluations);
  if (misclick.length > 0) out.misclick = misclick;
  const share = choiceShareOf(moment);
  if (share !== undefined) out.choiceShare = round(share, 4);
  const odds = Odds.analyzeView(view);
  out.oddsMeasured = odds.measured === true;
  if (odds.measured) {
    out.pMine = odds.unproven.map((cell) => [cell, round(odds.pMine[cell], 4)]);
    if (safeCells.length === 0) {
      const minP = Odds.minRisk(odds);
      out.lowestCells = odds.unproven.filter((cell) => odds.pMine[cell] <= minP + EPS);
    }
    if (typeof out.chosenRisk === 'number' && moment.kind !== 'known-mine'
        && evaluation.action === 'reveal'
        && Math.abs(odds.pMine[evaluation.selected[0]] - evidence.chosenRisk) > 1e-6) {
      throw new Error('recomputed risk disagrees with the saved risk for ' + key + ' at '
        + record.endedAt + ' action ' + evaluation.actionNumber);
    }
  }
  return out;
}

function finalBoardMoment(record, key) {
  const [width, height] = key.split('/')[0].split('x').map(Number);
  const mines = Number(key.split('/')[1].split('@')[0]);
  const mineAt = Solver.randomPlacement(width, height, mines, record.firstRevealIndex,
    GameRandom.fromSeed(record.seed));
  const revealed = [];
  const flagged = [];
  for (let cell = 0; cell < width * height; cell++) {
    if (mineAt[cell]) {
      flagged.push(cell);
      continue;
    }
    const count = Justice.neighbors(cell, width, height).filter((nb) => mineAt[nb]).length;
    revealed.push([cell, count]);
  }
  if (revealed.length !== width * height - mines) throw new Error('rebuilt layout has the wrong mine count');
  return {
    kind: 'final',
    action: 'final',
    result: 'won',
    atMs: record.timeMs,
    phase: 'endgame',
    progress: 1,
    position: { width, height, mines, revealed, flagged },
    firstRevealIndex: record.firstRevealIndex,
  };
}

//-------THE GAME'S CATEGORY, PROPOSED-------

// The proposed tree (BACKLOG.md): a loss is filed by its fatal click; a win
// by the worst risk it survived.
function proposedCategory(game) {
  if (game.record.outcome === 'loss') {
    const f = game.fatal;
    const category = KNOWN_KINDS.has(f.kind) ? 'known'
      : UNNECESSARY_KINDS.has(f.kind) ? 'unnecessary-gamble'
        : f.kind === 'worse' ? 'worse-gamble'
          : f.kind === 'best' ? 'best-gamble'
            : f.kind === 'gamble-on-own-flag' ? 'own-flag-gamble' : 'unmeasured';
    const proposal = { category, phase: f.phase, decidingAction: f.actionNumber };
    const share = choiceShareOf(f);
    if (share !== undefined) proposal.choiceShare = round(share, 4);
    return proposal;
  }
  const needless = survivedOfKinds(game, UNNECESSARY_KINDS);
  const worse = survivedOfKinds(game, new Set(['worse']));
  const deciding = needless.length > 0 ? worstRisk(needless) : worstRisk(worse);
  const category = needless.length > 0 ? 'won-despite-unnecessary'
    : worse.length > 0 ? 'won-despite-worse'
      : game.record.guesses > 0 ? 'clean-best-only' : 'clean-no-guess';
  const proposal = { category };
  if (deciding !== undefined) {
    proposal.phase = deciding.phase;
    proposal.decidingAction = deciding.actionNumber;
  }
  // The guess ledger sums raw mine chances and ignores A Just Universe's
  // guarantees, so a win's avoidable risk comes from its saved riskier
  // guesses, each measured under the active rules.
  proposal.avoidableRisk = round([...needless, ...worse].reduce((sum, moment) => {
    const evidence = moment.evaluation.evidence;
    return sum + evidence.actualRisk - evidence.bestActualRisk;
  }, 0), 4);
  return proposal;
}

function todayLabel(game) {
  if (game.record.outcome === 'loss') {
    const type = lossTypeOf(game.fatal.evaluation);
    return { kind: type, text: LOSS_TYPE_LABELS[type] };
  }
  const type = winTypeOf(game.record);
  return { kind: type, text: WIN_TYPE_LABELS[type] };
}

//-------SELECTION-------

// The flags a death through the player's own flags relied on, where an
// earlier saved action placed one of them on a proven-safe square.
function causalFlagMoments(game) {
  const f = game.fatal;
  if (f === undefined || (f.kind !== 'known-through-own-flag' && f.kind !== 'gamble-on-own-flag')) {
    return [];
  }
  const position = f.evaluation.position;
  const relied = new Set(f.action === 'chord'
    ? flagsAround(position, f.evaluation.triggerCell)
    : trustedFlagsOf(position, f.evaluation.selected[0]));
  return game.survived.filter((m) => m.kind === 'flag-on-safe' && relied.has(m.evaluation.selected[0]));
}

const RISK_MOMENT_KINDS = new Set(['unnecessary', 'unnecessary-justice', 'worse']);

// The focus, the fatal click, then the game's other risky choices; flag
// mistakes only where a death relied on that flag or the focus is one.
function displayMoments(game, focus) {
  if (focus.kind === 'final') return [focus];
  const chosen = new Set([focus]);
  if (game.fatal !== undefined) chosen.add(game.fatal);
  const causal = new Set(causalFlagMoments(game));
  const others = game.moments
    .filter((m) => !chosen.has(m) && (RISK_MOMENT_KINDS.has(m.kind) || causal.has(m)
      || (m.kind === 'best' && lessInformative(m, game.record))
      || (focus.kind === 'flag-on-safe' && m.kind === 'flag-on-safe')))
    .sort((a, b) => MOMENT_SEVERITY[b.kind] - MOMENT_SEVERITY[a.kind]
      || (b.chosenRisk || 0) - (a.chosenRisk || 0));
  for (const other of others) {
    if (chosen.size >= MAX_MOMENTS) break;
    chosen.add(other);
  }
  return [...chosen].sort((a, b) => a.actionNumber - b.actionNumber);
}

// Spread a quota over the board sizes, then over each size's range of the
// stratum's measure, so a kind shows its mild and its extreme cases.
function pickSpread(candidates, quota) {
  const groups = KEYS.map((key) => candidates.filter((c) => c.game.key === key)
    .sort((a, b) => a.measure - b.measure || a.game.record.endedAt - b.game.record.endedAt));
  const counts = groups.map(() => 0);
  let remaining = quota;
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let g = 0; g < groups.length && remaining > 0; g++) {
      if (counts[g] < groups[g].length) {
        counts[g]++;
        remaining--;
        progressed = true;
      }
    }
  }
  const picked = [];
  groups.forEach((group, g) => {
    for (let i = 0; i < counts[g]; i++) {
      picked.push(group[Math.floor((i + 0.5) * group.length / counts[g])]);
    }
  });
  return picked;
}

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

//-------RUN-------

const exportData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const games = [];
for (const key of KEYS) {
  if (!Array.isArray(exportData[key])) throw new Error('export has no ' + key + ' history');
  for (const record of exportData[key]) {
    if (!modernEvidence(record)) continue;
    if (record.outcome !== 'win' && record.outcome !== 'loss') continue;
    games.push(gameOf(key, record));
  }
}

const candidatesByStratum = STRATA.map((stratum) => games
  .map((game) => ({ game, focus: stratum.focus(game) }))
  .filter((candidate) => candidate.focus !== undefined)
  .map((candidate) => ({ ...candidate, measure: stratum.measure(candidate.focus) })));

if (survey) {
  for (let s = 0; s < STRATA.length; s++) {
    const perKey = KEYS.map((key) => candidatesByStratum[s].filter((c) => c.game.key === key).length);
    process.stdout.write(STRATA[s].id.padEnd(36) + ' quota ' + String(STRATA[s].quota).padStart(2)
      + '   ' + perKey.map((n, k) => SIZE_NAMES[KEYS[k].split('@')[0]][0] + ' ' + n).join('  ') + '\n');
  }
  process.stdout.write('games with full evidence: ' + games.length + '; quotas total '
    + STRATA.reduce((sum, stratum) => sum + stratum.quota, 0) + '\n');
  process.exit(0);
}

// Scarce kinds choose first, so a game that fits a rare kind serves it.
const used = new Set();
const problems = [];
const strataOut = [];
const order = STRATA.map((_, s) => s)
  .sort((a, b) => candidatesByStratum[a].length - candidatesByStratum[b].length);
for (const s of order) {
  const stratum = STRATA[s];
  const free = candidatesByStratum[s].filter((c) => !used.has(c.game));
  const picked = pickSpread(free, stratum.quota);
  for (const { game, focus } of picked) {
    used.add(game);
    const record = game.record;
    const moments = displayMoments(game, focus).map((m) => bankMoment(m, record, game.key));
    problems.push({
      id: game.key + '|' + record.endedAt,
      key: game.key,
      sizeName: SIZE_NAMES[game.key.split('@')[0]],
      outcome: record.outcome,
      timeMs: record.timeMs,
      endedAt: record.endedAt,
      timeZone: record.timeZone,
      bv3: record.bv3,
      guesses: record.guesses,
      lifeLost: typeof record.lifeLost === 'number' ? round(record.lifeLost, 4) : undefined,
      lifeNeedless: typeof record.lifeNeedless === 'number' ? round(record.lifeNeedless, 4) : undefined,
      justiceEnabled: record.justiceEnabled === true,
      stratum: stratum.id,
      focusAction: focus.kind === 'final' ? 'final' : focus.actionNumber,
      moments,
      proposed: proposedCategory(game),
      today: todayLabel(game),
    });
  }
  strataOut[s] = { id: stratum.id, label: stratum.label, available: candidatesByStratum[s].length,
    selected: picked.length };
}

problems.sort((a, b) => hash32(a.id) - hash32(b.id));
const bank = {
  format: BANK_FORMAT,
  formatVersion: BANK_FORMAT_VERSION,
  bankId: 'judgment-' + new Date().toISOString().slice(0, 10) + '-' + hash32(problems.map((p) => p.id).join()).toString(16),
  builtAt: new Date().toISOString(),
  sourceExport: path.basename(inputPath),
  strata: strataOut,
  problems,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(bank));
process.stderr.write(problems.length + ' problems from ' + games.length + ' games written to '
  + outPath + ' (' + Math.round(fs.statSync(outPath).size / 1024) + ' KB)\n');
for (const stratum of strataOut) {
  if (stratum.selected < STRATA.find((s) => s.id === stratum.id).quota) {
    process.stderr.write('short: ' + stratum.id + ' ' + stratum.selected + ' of '
      + STRATA.find((s) => s.id === stratum.id).quota + '\n');
  }
}
