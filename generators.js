'use strict';

if (typeof Solver === 'undefined') {
  globalThis.Solver = require('./solver.js');
}

// Board generators: the algorithms that turn (width, height, mines,
// safeIndex, rng, params) into a mine map. The generator plus its exact
// parameter values are part of the top score key — boards made by
// different generators (or the same generator tuned differently) never
// share a ranking list. Every generator draws all of its randomness from
// the passed rng, so a stored seed plus the generator id, parameter
// values, and version string replays the placement exactly.
//
// safeIndex is the first-clicked cell (never mined) — or null in the
// Board lab, where boards are generated without a first click.

function generatorSmoothstep(t) {
  return t * t * (3 - 2 * t);
}

// One octave of value noise: a lattice of rng values in [-1, 1] at the
// given per-axis wavelengths (in cells), sampled with bilinear
// smoothstep interpolation. Unequal wavelengths stretch the features
// (anisotropy: streaks and bands).
function valueNoiseOctave(width, height, rng, wavelengthX, wavelengthY) {
  const latticeWidth = Math.floor(width / wavelengthX) + 2;
  const latticeHeight = Math.floor(height / wavelengthY) + 2;
  const lattice = new Float64Array(latticeWidth * latticeHeight);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng() * 2 - 1;
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = y / wavelengthY;
    const y0 = Math.floor(gy);
    const ty = generatorSmoothstep(gy - y0);
    for (let x = 0; x < width; x++) {
      const gx = x / wavelengthX;
      const x0 = Math.floor(gx);
      const tx = generatorSmoothstep(gx - x0);
      const a = lattice[y0 * latticeWidth + x0];
      const b = lattice[y0 * latticeWidth + x0 + 1];
      const c = lattice[(y0 + 1) * latticeWidth + x0];
      const d = lattice[(y0 + 1) * latticeWidth + x0 + 1];
      out[y * width + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

// Standardize a field to mean 0, sd 1 in place, so exponential contrast
// means the same thing whatever produced the field. An exactly constant
// field (possible only when one lattice sample covers everything)
// becomes all zeros: equal weights, which is what featureless means.
function standardizeField(field) {
  let mean = 0;
  for (let i = 0; i < field.length; i++) mean += field[i];
  mean /= field.length;
  let variance = 0;
  for (let i = 0; i < field.length; i++) {
    variance += (field[i] - mean) * (field[i] - mean);
  }
  const sd = Math.sqrt(variance / field.length);
  for (let i = 0; i < field.length; i++) {
    field[i] = sd === 0 ? 0 : (field[i] - mean) / sd;
  }
  return field;
}

// Fractal (octave-summed) value noise whose power spectrum approximates
// 1/f^alpha: octave o sits at wavelength scale/2^o with amplitude
// persistence^o, and persistence = 2^(-alpha/2) gives spectral slope
// alpha. stretch is log2 of the x:y wavelength ratio (0 = isotropic,
// positive = horizontal streaks, negative = vertical). Standardized.
function fractalField(width, height, rng, alpha, scale, stretch) {
  const field = new Float64Array(width * height);
  const persistence = Math.pow(2, -alpha / 2);
  let amplitude = 1;
  let wavelengthX = scale * Math.pow(2, stretch / 2);
  let wavelengthY = scale * Math.pow(2, -stretch / 2);
  while (Math.max(wavelengthX, wavelengthY) >= 1) {
    const octave = valueNoiseOctave(width, height, rng, wavelengthX, wavelengthY);
    for (let i = 0; i < field.length; i++) field[i] += amplitude * octave[i];
    amplitude *= persistence;
    wavelengthX /= 2;
    wavelengthY /= 2;
  }
  return standardizeField(field);
}

// Exact weighted sampling without replacement over an explicit cell list
// (Efraimidis-Spirakis: the `count` cells with the largest ln(u)/w win).
// Marks the winners in mineAt.
function weightedSampleInto(mineAt, cellList, count, rng, weightOf) {
  if (count > cellList.length) {
    throw new Error('more mines than placeable cells');
  }
  const keys = new Float64Array(cellList.length);
  const order = [];
  for (let k = 0; k < cellList.length; k++) {
    keys[k] = Math.log(rng()) / weightOf(cellList[k]);
    order.push(k);
  }
  order.sort((a, b) => keys[b] - keys[a]);
  for (let k = 0; k < count; k++) mineAt[cellList[order[k]]] = true;
}

// Best-candidate placement (Mitchell): each mine auditions `spread`
// uniform candidates among the free cells and takes the one with the
// highest score. nearest[] holds each cell's squared distance to its
// closest placed mine (Infinity before the first), relaxed after every
// placement; scoreOf reads it. Mutates mineAt, nearest, and free.
function bestCandidatePlace(mineAt, nearest, free, count, spread, rng, width, scoreOf) {
  if (count > free.length) {
    throw new Error('more mines than placeable cells');
  }
  const n = mineAt.length;
  for (let m = 0; m < count; m++) {
    let bestSlot = -1;
    let bestScore = -1;
    const auditions = Math.min(spread, free.length);
    for (let c = 0; c < auditions; c++) {
      const slot = Math.floor(rng() * free.length);
      const score = scoreOf(free[slot]);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }
    const chosen = free[bestSlot];
    free[bestSlot] = free[free.length - 1];
    free.pop();
    mineAt[chosen] = true;
    const cx = chosen % width;
    const cy = (chosen - cx) / width;
    for (let i = 0; i < n; i++) {
      const dx = i % width - cx;
      const dy = (i - i % width) / width - cy;
      const d = dx * dx + dy * dy;
      if (d < nearest[i]) nearest[i] = d;
    }
  }
}

function freeCellList(n, safeIndex) {
  const free = [];
  for (let i = 0; i < n; i++) {
    if (i !== safeIndex) free.push(i);
  }
  return free;
}

// Colored-noise placement: cell weights exp(contrast * field), drawn as
// an exact weighted sample without replacement.
function coloredNoisePlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const field = fractalField(width, height, rng, params.alpha, params.scale, params.stretch);
  const mineAt = new Array(n).fill(false);
  weightedSampleInto(mineAt, freeCellList(n, safeIndex), mineCount, rng,
    (cell) => Math.exp(params.contrast * field[cell]));
  return mineAt;
}

// Blue-noise placement: best-candidate scored purely by distance to the
// nearest placed mine. spread 1 is exactly uniform; larger values
// spread the mines more evenly.
function blueNoisePlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const mineAt = new Array(n).fill(false);
  const nearest = new Float64Array(n).fill(Infinity);
  bestCandidatePlace(mineAt, nearest, freeCellList(n, safeIndex), mineCount,
    params.spread, rng, width, (cell) => nearest[cell]);
  return mineAt;
}

// Green-noise placement: a single mid-frequency octave (band-pass — the
// halftoning literature's green noise), so mine clumps have one
// characteristic size with even spacing between clumps.
function greenNoisePlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const field = standardizeField(
    valueNoiseOctave(width, height, rng, params.scale, params.scale));
  const mineAt = new Array(n).fill(false);
  weightedSampleInto(mineAt, freeCellList(n, safeIndex), mineCount, rng,
    (cell) => Math.exp(params.contrast * field[cell]));
  return mineAt;
}

// Stippled placement: a smooth density field (red-noise slope, large
// features) rendered with stippling's local evenness — best-candidate
// scored by nearest-distance x density, so dense regions accept tighter
// spacing and sparse regions demand wider spacing.
function stippledPlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const field = fractalField(width, height, rng, 2, params.scale, 0);
  const density = new Float64Array(n);
  for (let i = 0; i < n; i++) density[i] = Math.exp(params.contrast * field[i]);
  const mineAt = new Array(n).fill(false);
  const nearest = new Float64Array(n).fill(Infinity);
  bestCandidatePlace(mineAt, nearest, freeCellList(n, safeIndex), mineCount,
    params.spread, rng, width, (cell) => nearest[cell] * density[cell]);
  return mineAt;
}

//-------LETTERFORMS (a 5x7 uppercase pixel font, mines follow the strokes)-------

const LETTERFORM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTERFORMS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

// Letterforms placement: rng picks `letters` random uppercase letters
// (deterministic from the seed, like the rest of the layout), rasterizes
// each into an equal horizontal slot of the board, and weights stroke
// cells exp(contrast) against 1 elsewhere — the solved board spells the
// letters in mines.
function letterformsPlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const letterCount = params.letters;
  const chosen = [];
  for (let k = 0; k < letterCount; k++) {
    chosen.push(LETTERFORM_ALPHABET[Math.floor(rng() * LETTERFORM_ALPHABET.length)]);
  }
  const slotWidth = width / letterCount;
  const margin = 0.08;
  const inStroke = (x, y) => {
    const slot = Math.min(letterCount - 1, Math.floor(x / slotWidth));
    const u = (x + 0.5 - slot * slotWidth) / slotWidth;
    const v = (y + 0.5) / height;
    if (u < margin || u >= 1 - margin || v < margin || v >= 1 - margin) return false;
    const col = Math.floor((u - margin) / (1 - 2 * margin) * 5);
    const row = Math.floor((v - margin) / (1 - 2 * margin) * 7);
    return LETTERFORMS[chosen[slot]][row][col] === '1';
  };
  const strokeWeight = Math.exp(params.contrast);
  const mineAt = new Array(n).fill(false);
  weightedSampleInto(mineAt, freeCellList(n, safeIndex), mineCount, rng,
    (cell) => inStroke(cell % width, (cell - cell % width) / width) ? strokeWeight : 1);
  return mineAt;
}

// Every generator: id (stored in settings, records, and top score keys),
// label (menus), version (the record's boardVersion — names the exact
// placement algorithm a seed replays through), describe (menu tooltip),
// params (schema: key, label, min/max/step, default, describe), place().
const GENERATOR_SPECS = [
  {
    id: 'uniform',
    label: 'Default',
    version: 'uniform-first-safe-fisher-yates-v1',
    describe: 'every layout equally likely: a Fisher-Yates shuffle over all cells except the first-clicked one',
    params: [],
    place: (width, height, mineCount, safeIndex, rng) =>
      Solver.randomPlacement(width, height, mineCount, safeIndex, rng),
  },
  {
    id: 'pink-noise',
    label: 'Pink noise',
    version: 'colored-noise-fbm-exp-weights-v1',
    describe: 'mines drawn from a 1/f^alpha fractal noise field: dense clumps and sparse plains at every size up to the feature size',
    params: [
      {
        key: 'alpha', label: 'spectral exponent', min: 0, max: 3, step: 0.1, default: 1,
        describe: 'the noise color: 0 = white (uniform), 1 = pink, 2 = red/brown; higher puts more power into the largest features',
      },
      {
        key: 'scale', label: 'feature size', min: 2, max: 32, step: 1, default: 8,
        describe: 'wavelength of the largest noise features, in cells',
      },
      {
        key: 'contrast', label: 'contrast', min: 0, max: 6, step: 0.25, default: 2,
        describe: 'how strongly the field biases placement: 0 = uniform regardless of the field, higher = mines hug the field peaks',
      },
      {
        key: 'stretch', label: 'stretch', min: -3, max: 3, step: 0.5, default: 0,
        describe: 'anisotropy, as log2 of the x:y feature ratio: 0 = round features, positive = horizontal streaks, negative = vertical veins (each step of 1 doubles the ratio)',
      },
    ],
    place: coloredNoisePlacement,
  },
  {
    id: 'blue-noise',
    label: 'Blue noise',
    version: 'blue-noise-best-candidate-v1',
    describe: 'mines repel each other (best-candidate sampling): evenly spread, few adjacent pairs',
    params: [
      {
        key: 'spread', label: 'spread strength', min: 1, max: 32, step: 1, default: 8,
        describe: 'candidates auditioned per mine (the farthest from every placed mine wins): 1 = uniform, higher = more even spacing',
      },
    ],
    place: blueNoisePlacement,
  },
  {
    id: 'green-noise',
    label: 'Green noise',
    version: 'green-noise-bandpass-exp-weights-v1',
    describe: 'mid-frequency (band-pass) noise: mine clumps of one characteristic size, evenly spaced apart',
    params: [
      {
        key: 'scale', label: 'clump spacing', min: 2, max: 32, step: 1, default: 6,
        describe: 'the band\u2019s wavelength in cells: clump centers sit about this far apart, each clump about half this wide',
      },
      {
        key: 'contrast', label: 'contrast', min: 0, max: 6, step: 0.25, default: 3,
        describe: 'how strongly the band biases placement: 0 = uniform, higher = tighter, cleaner clumps',
      },
    ],
    place: greenNoisePlacement,
  },
  {
    id: 'stippled',
    label: 'Stippled',
    version: 'stippled-density-best-candidate-v1',
    describe: 'stippling: a smooth large-scale density field rendered with locally even dot spacing (tight where dense, wide where sparse)',
    params: [
      {
        key: 'scale', label: 'density feature size', min: 4, max: 48, step: 1, default: 16,
        describe: 'wavelength of the density field\u2019s largest features, in cells',
      },
      {
        key: 'contrast', label: 'density range', min: 0, max: 4, step: 0.25, default: 1.5,
        describe: 'how much the local mine density varies across the board: 0 = pure blue noise, higher = stronger light/dark regions',
      },
      {
        key: 'spread', label: 'evenness', min: 1, max: 32, step: 1, default: 12,
        describe: 'candidates auditioned per mine: 1 = no local evenness, higher = cleaner stippling',
      },
    ],
    place: stippledPlacement,
  },
  {
    id: 'letterforms',
    label: 'Letterforms',
    version: 'letterforms-5x7-exp-weights-v1',
    describe: 'mine density follows random uppercase letters (5x7 pixel font, letters drawn from the seed): the solved board spells them in mines',
    params: [
      {
        key: 'letters', label: 'letters', min: 1, max: 6, step: 1, default: 1,
        describe: 'how many random letters share the board, side by side in equal slots',
      },
      {
        key: 'contrast', label: 'stroke contrast', min: 0, max: 8, step: 0.5, default: 5,
        describe: 'weight of stroke cells against background (e^contrast): 0 = uniform, higher = mines almost exclusively in the strokes',
      },
    ],
    place: letterformsPlacement,
  },
];

const GENERATORS_BY_ID = new Map(GENERATOR_SPECS.map((g) => [g.id, g]));
const DEFAULT_GENERATOR_ID = 'uniform';

function generatorById(id) {
  const spec = GENERATORS_BY_ID.get(id);
  if (spec === undefined) throw new Error('unknown board generator ' + id);
  return spec;
}

// A generator's parameter values: stored overrides merged over the schema
// defaults (absence means the player never changed that parameter — the
// settingsFrom convention).
function generatorParamsFrom(id, stored) {
  const spec = generatorById(id);
  const params = {};
  for (const p of spec.params) {
    params[p.key] = stored !== undefined && p.key in stored ? stored[p.key] : p.default;
  }
  return params;
}

function validGeneratorParamValue(paramSpec, value) {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= paramSpec.min && value <= paramSpec.max;
}

// Validity of a whole stored boardGeneratorParams block: a map of known
// generator id -> { known param key -> in-range number }.
function validGeneratorParamsBlock(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([id, stored]) => {
      const spec = GENERATORS_BY_ID.get(id);
      return spec !== undefined
        && stored !== null && typeof stored === 'object' && !Array.isArray(stored)
        && Object.entries(stored).every(([key, v]) => {
          const paramSpec = spec.params.find((p) => p.key === key);
          return paramSpec !== undefined && validGeneratorParamValue(paramSpec, v);
        });
    });
}

// A record's stored `generator` field: non-default id plus the complete
// parameter set the board was placed with.
function validStoredGenerator(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const spec = GENERATORS_BY_ID.get(value.id);
  if (spec === undefined || value.id === DEFAULT_GENERATOR_ID) return false;
  const params = value.params;
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return false;
  return Object.keys(params).length === spec.params.length
    && spec.params.every((p) => validGeneratorParamValue(p, params[p.key]));
}

// The generator portion of a top score key: '' for the default generator
// (so pre-generator keys stay valid unchanged), otherwise
// '+id(key=value,...)' with the parameters in schema order.
function generatorKeySuffix(generator) {
  if (generator.id === DEFAULT_GENERATOR_ID) return '';
  const spec = generatorById(generator.id);
  const parts = spec.params.map((p) => p.key + '=' + generator.params[p.key]);
  return '+' + generator.id + (parts.length > 0 ? '(' + parts.join(',') + ')' : '');
}

function generatorDisplayLabelOf(generator) {
  const spec = generatorById(generator.id);
  if (spec.params.length === 0) return spec.label;
  return spec.label + ' ('
    + spec.params.map((p) => p.label + ' ' + generator.params[p.key]).join(', ')
    + ')';
}

function generatorPlace(generator, width, height, mineCount, safeIndex, rng) {
  return generatorById(generator.id)
    .place(width, height, mineCount, safeIndex, rng, generator.params);
}

const BoardGenerators = {
  SPECS: GENERATOR_SPECS,
  DEFAULT_ID: DEFAULT_GENERATOR_ID,
  byId: generatorById,
  paramsFrom: generatorParamsFrom,
  validParamsBlock: validGeneratorParamsBlock,
  validStoredGenerator: validStoredGenerator,
  keySuffix: generatorKeySuffix,
  displayLabel: generatorDisplayLabelOf,
  place: generatorPlace,
  uniformGenerator: () => ({ id: DEFAULT_GENERATOR_ID, params: {} }),
};

if (typeof module !== 'undefined' && module.exports) module.exports = BoardGenerators;
