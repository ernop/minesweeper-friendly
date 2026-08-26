'use strict';

const Pregen = require('../pregen.js');
const BoardGenerators = require('../generators.js');
const GameRandom = require('../rng.js');

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

function mineMap(width, height, mines) {
  const result = new Array(width * height).fill(false);
  for (const index of mines) result[index] = true;
  return result;
}

check('one empty opening region has 3BV 1',
  Pregen.board3BV(3, 3, mineMap(3, 3, [])) === 1);
check('a center mine leaves eight individually clicked numbers',
  Pregen.board3BV(3, 3, mineMap(3, 3, [4])) === 8);
check('a corner mine is covered by the opposite zero opening',
  Pregen.board3BV(3, 3, mineMap(3, 3, [0])) === 1);

const rankedKnown = Pregen.rankSeeds({
  seeds: ['low', 'high-a', 'high-b'],
  width: 3,
  height: 3,
  mineCount: 1,
  safeIndex: 2,
  generator: {},
  randomFromSeed: (seed) => seed,
  place: (_generator, _width, _height, _mines, _safe, seed) =>
    seed === 'low' ? mineMap(3, 3, [0]) : mineMap(3, 3, [4]),
});
check('candidates sort by descending 3BV',
  rankedKnown.map((candidate) => candidate.seed).join(',') === 'high-a,high-b,low');
check('equal-3BV candidates retain generation order',
  rankedKnown[0].seed === 'high-a' && rankedKnown[1].seed === 'high-b');

const seeds = Array.from({ length: 10 }, (_, i) =>
  (i + 1).toString(16).padStart(8, '0').repeat(4));
const generator = BoardGenerators.uniformGenerator();
const ranked = Pregen.rankSeeds({
  seeds,
  width: 9,
  height: 9,
  mineCount: 10,
  safeIndex: 8,
  generator,
  randomFromSeed: GameRandom.fromSeed,
  place: BoardGenerators.place,
});
check('a full batch contains ten candidates', ranked.length === 10);
check('a full batch is descending',
  ranked.every((candidate, i) => i === 0 || ranked[i - 1].bv3 >= candidate.bv3));
for (const candidate of ranked) {
  const board = BoardGenerators.place(
    generator, 9, 9, 10, 8, GameRandom.fromSeed(candidate.seed));
  check('upper-right opening stays safe', board[8] === false);
  check('stored score reproduces from the seed',
    Pregen.board3BV(9, 9, board) === candidate.bv3);
}

const scoped = Pregen.chartWins([
  { endedAt: 100, outcome: 'win' },
  { endedAt: 200, outcome: 'loss' },
  { endedAt: 300, outcome: 'win' },
  { endedAt: 400, outcome: 'win' },
], 350, 250);
check('challenge chart keeps wins since this batch began',
  scoped.challenge.map((record) => record.endedAt).join(',') === '400');
check('whole-day chart keeps wins since local midnight',
  scoped.today.map((record) => record.endedAt).join(',') === '300,400');
check('losses stay out of both normal 3BV-time charts',
  !scoped.challenge.some((record) => record.outcome === 'loss')
    && !scoped.today.some((record) => record.outcome === 'loss'));

const progress = Pregen.progressRows([
  { run: 1, record: { bv3: 40, timeMs: 12000, outcome: 'win' } },
  { run: 2, record: { bv3: 35, timeMs: 9000, outcome: 'loss' } },
]);
check('progress table keeps one row per completed run', progress.length === 2);
check('progress table retains loss outcomes',
  progress[1].run === 2 && progress[1].outcome === 'loss');
check('progress table highlights only the latest completed run',
  progress[0].latest !== true && progress[1].latest === true);
check('progress table never adds a transient active run',
  Pregen.progressRows([]).length === 0);

console.log('pregen tests passed (' + checks + ' checks)');
