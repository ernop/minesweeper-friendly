'use strict';
// Known-answer and statistical tests for the board-generator registry
// (generators.js): exact mine counts, safe-cell exclusion, determinism
// from a seed, the top-score-key suffix, parameter filling/validation,
// and the statistical signatures of the colored generators (pink noise
// clusters more than uniform, blue noise spreads more evenly).

const BoardGenerators = require('../generators.js');
const GameRandom = require('../rng.js');

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

function seedNumbered(k) {
  return (k * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4);
}

function generatorWithDefaults(id) {
  return { id, params: BoardGenerators.paramsFrom(id, undefined) };
}

function placedMines(mineAt) {
  return mineAt.reduce((count, mined) => count + (mined ? 1 : 0), 0);
}

//-------placement invariants, every generator-------

const CASES = [
  { width: 9, height: 9, mines: 10, safeIndex: 40 },
  { width: 30, height: 16, mines: 99, safeIndex: 0 },
  { width: 8, height: 1, mines: 1, safeIndex: 3 },
  { width: 10, height: 10, mines: 80, safeIndex: 55 },
  { width: 16, height: 16, mines: 40, safeIndex: null }, // Board lab: no first click
];

for (const spec of BoardGenerators.SPECS) {
  const generator = generatorWithDefaults(spec.id);
  for (const c of CASES) {
    const rng = GameRandom.fromSeed(seedNumbered(7));
    const mineAt = BoardGenerators.place(
      generator, c.width, c.height, c.mines, c.safeIndex, rng);
    check(spec.id + ' map length', mineAt.length === c.width * c.height);
    check(spec.id + ' exact mine count', placedMines(mineAt) === c.mines);
    if (c.safeIndex !== null) {
      check(spec.id + ' safe cell clear', mineAt[c.safeIndex] === false);
    }
    const again = BoardGenerators.place(
      generatorWithDefaults(spec.id), c.width, c.height, c.mines, c.safeIndex,
      GameRandom.fromSeed(seedNumbered(7)));
    check(spec.id + ' deterministic from seed',
      mineAt.every((mined, i) => mined === again[i]));
  }
  check(spec.id + ' has a version string',
    typeof spec.version === 'string' && spec.version.length > 0);
}

check('default generator is the historical placement version',
  BoardGenerators.byId(BoardGenerators.DEFAULT_ID).version
    === 'uniform-first-safe-fisher-yates-v1');

//-------statistical signatures on 16x16/40 over many seeds-------

function adjacentMinePairs(mineAt, width, height) {
  // Mine pairs that are 8-neighbors: the clustering measure.
  let pairs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mineAt[y * width + x]) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height
            && mineAt[ny * width + nx]) pairs++;
      }
    }
  }
  return pairs;
}

function meanNearestMineDistance(mineAt, width, height) {
  const mines = [];
  for (let i = 0; i < mineAt.length; i++) {
    if (mineAt[i]) mines.push([i % width, Math.floor(i / width)]);
  }
  let total = 0;
  for (const [x, y] of mines) {
    let best = Infinity;
    for (const [ox, oy] of mines) {
      if (ox === x && oy === y) continue;
      const d = (ox - x) * (ox - x) + (oy - y) * (oy - y);
      if (d < best) best = d;
    }
    total += Math.sqrt(best);
  }
  return total / mines.length;
}

function averageOver(generator, measure) {
  const runs = 40;
  let total = 0;
  for (let k = 0; k < runs; k++) {
    const rng = GameRandom.fromSeed(seedNumbered(1000 + k));
    const mineAt = BoardGenerators.place(generator, 16, 16, 40, 0, rng);
    total += measure(mineAt, 16, 16);
  }
  return total / runs;
}

const uniformPairs = averageOver(generatorWithDefaults('uniform'), adjacentMinePairs);
const pinkPairs = averageOver(generatorWithDefaults('pink-noise'), adjacentMinePairs);
check('pink noise clusters mines (adjacent pairs well above uniform: '
  + pinkPairs.toFixed(1) + ' vs ' + uniformPairs.toFixed(1) + ')',
pinkPairs > uniformPairs * 1.3);

const uniformSpacing = averageOver(generatorWithDefaults('uniform'), meanNearestMineDistance);
const blueSpacing = averageOver(generatorWithDefaults('blue-noise'), meanNearestMineDistance);
check('blue noise spreads mines (nearest-mine distance well above uniform: '
  + blueSpacing.toFixed(2) + ' vs ' + uniformSpacing.toFixed(2) + ')',
blueSpacing > uniformSpacing * 1.2);

// spread 1 auditions a single candidate: exactly uniform sampling.
const blueSpreadOne = { id: 'blue-noise', params: { spread: 1 } };
const spreadOneSpacing = averageOver(blueSpreadOne, meanNearestMineDistance);
check('blue noise at spread 1 behaves like uniform ('
  + spreadOneSpacing.toFixed(2) + ' vs ' + uniformSpacing.toFixed(2) + ')',
Math.abs(spreadOneSpacing - uniformSpacing) < uniformSpacing * 0.15);

// contrast 0 weights every cell equally: pink noise degenerates to uniform.
const pinkFlat = { id: 'pink-noise', params: { alpha: 1, scale: 8, contrast: 0 } };
const flatPairs = averageOver(pinkFlat, adjacentMinePairs);
check('pink noise at contrast 0 behaves like uniform ('
  + flatPairs.toFixed(1) + ' vs ' + uniformPairs.toFixed(1) + ')',
Math.abs(flatPairs - uniformPairs) < uniformPairs * 0.25);

//-------top score key suffix-------

check('default generator adds no key suffix',
  BoardGenerators.keySuffix(BoardGenerators.uniformGenerator()) === '');
check('pink noise key suffix is canonical (schema order)',
  BoardGenerators.keySuffix(generatorWithDefaults('pink-noise'))
    === '+pink-noise(alpha=1,scale=8,contrast=2)');
check('blue noise key suffix',
  BoardGenerators.keySuffix(generatorWithDefaults('blue-noise'))
    === '+blue-noise(spread=8)');
check('tuned parameters change the key',
  BoardGenerators.keySuffix({ id: 'blue-noise', params: { spread: 16 } })
    === '+blue-noise(spread=16)');

//-------display labels-------

check('default display label', BoardGenerators.displayLabel(
  BoardGenerators.uniformGenerator()) === 'Default');
check('parameterized display label', BoardGenerators.displayLabel(
  generatorWithDefaults('blue-noise')) === 'Blue noise (spread strength 8)');

//-------parameter filling and validation-------

const filled = BoardGenerators.paramsFrom('pink-noise', { alpha: 2.5 });
check('override kept', filled.alpha === 2.5);
check('absent params take defaults', filled.scale === 8 && filled.contrast === 2);

check('empty params block valid', BoardGenerators.validParamsBlock({}));
check('good params block valid',
  BoardGenerators.validParamsBlock({ 'pink-noise': { alpha: 1.5 }, 'blue-noise': {} }));
check('unknown generator invalid',
  !BoardGenerators.validParamsBlock({ 'plaid-noise': {} }));
check('unknown param key invalid',
  !BoardGenerators.validParamsBlock({ 'pink-noise': { hue: 3 } }));
check('out-of-range param invalid',
  !BoardGenerators.validParamsBlock({ 'pink-noise': { alpha: 99 } }));
check('non-numeric param invalid',
  !BoardGenerators.validParamsBlock({ 'pink-noise': { alpha: '1' } }));

check('stored generator: complete non-default is valid',
  BoardGenerators.validStoredGenerator(generatorWithDefaults('pink-noise')));
check('stored generator: default never stored',
  !BoardGenerators.validStoredGenerator(BoardGenerators.uniformGenerator()));
check('stored generator: incomplete params invalid',
  !BoardGenerators.validStoredGenerator({ id: 'pink-noise', params: { alpha: 1 } }));
check('stored generator: unknown id invalid',
  !BoardGenerators.validStoredGenerator({ id: 'plaid-noise', params: {} }));

check('unknown generator id throws', (() => {
  try {
    BoardGenerators.byId('plaid-noise');
    return false;
  } catch (err) {
    return err.message.includes('unknown board generator');
  }
})());

console.log('generators-test: ' + checks + ' checks passed');
