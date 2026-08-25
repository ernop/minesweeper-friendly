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
// given wavelength (in cells), sampled with bilinear smoothstep
// interpolation.
function valueNoiseOctave(width, height, rng, wavelength) {
  const latticeWidth = Math.floor(width / wavelength) + 2;
  const latticeHeight = Math.floor(height / wavelength) + 2;
  const lattice = new Float64Array(latticeWidth * latticeHeight);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng() * 2 - 1;
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = y / wavelength;
    const y0 = Math.floor(gy);
    const ty = generatorSmoothstep(gy - y0);
    for (let x = 0; x < width; x++) {
      const gx = x / wavelength;
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

// Fractal (octave-summed) value noise whose power spectrum approximates
// 1/f^alpha: octave o sits at wavelength scale/2^o with amplitude
// persistence^o, and persistence = 2^(-alpha/2) gives spectral slope
// alpha. The field is standardized (mean 0, sd 1) so `contrast` means
// the same thing at every alpha and scale.
function fractalField(width, height, rng, alpha, scale) {
  const field = new Float64Array(width * height);
  const persistence = Math.pow(2, -alpha / 2);
  let amplitude = 1;
  for (let wavelength = scale; wavelength >= 1; wavelength /= 2) {
    const octave = valueNoiseOctave(width, height, rng, wavelength);
    for (let i = 0; i < field.length; i++) field[i] += amplitude * octave[i];
    amplitude *= persistence;
  }
  let mean = 0;
  for (let i = 0; i < field.length; i++) mean += field[i];
  mean /= field.length;
  let variance = 0;
  for (let i = 0; i < field.length; i++) {
    variance += (field[i] - mean) * (field[i] - mean);
  }
  const sd = Math.sqrt(variance / field.length);
  // An exactly constant field (possible only on a 1-cell board, where a
  // single lattice sample covers everything) standardizes to all zeros:
  // equal weights, which is what a featureless field means.
  for (let i = 0; i < field.length; i++) {
    field[i] = sd === 0 ? 0 : (field[i] - mean) / sd;
  }
  return field;
}

// Colored-noise placement: cell weights exp(contrast * field), mines
// drawn as an exact weighted sample without replacement
// (Efraimidis-Spirakis: the mineCount largest ln(u)/w).
function coloredNoisePlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const field = fractalField(width, height, rng, params.alpha, params.scale);
  const keys = new Float64Array(n);
  const order = [];
  for (let i = 0; i < n; i++) {
    if (i === safeIndex) continue;
    keys[i] = Math.log(rng()) / Math.exp(params.contrast * field[i]);
    order.push(i);
  }
  if (mineCount > order.length) {
    throw new Error('more mines than placeable cells');
  }
  order.sort((a, b) => keys[b] - keys[a]);
  const mineAt = new Array(n).fill(false);
  for (let k = 0; k < mineCount; k++) mineAt[order[k]] = true;
  return mineAt;
}

// Blue-noise placement (Mitchell's best-candidate): each mine auditions
// `spread` uniform candidates among the free cells and takes the one
// farthest from every already-placed mine. spread 1 is exactly uniform;
// larger values spread the mines more evenly.
function blueNoisePlacement(width, height, mineCount, safeIndex, rng, params) {
  const n = width * height;
  const mineAt = new Array(n).fill(false);
  const free = [];
  for (let i = 0; i < n; i++) {
    if (i !== safeIndex) free.push(i);
  }
  if (mineCount > free.length) {
    throw new Error('more mines than placeable cells');
  }
  // Squared distance from each cell to its nearest placed mine,
  // relaxed after every placement; Infinity until the first mine exists.
  const nearest = new Float64Array(n).fill(Infinity);
  for (let m = 0; m < mineCount; m++) {
    let bestSlot = -1;
    let bestDistance = -1;
    const auditions = Math.min(params.spread, free.length);
    for (let c = 0; c < auditions; c++) {
      const slot = Math.floor(rng() * free.length);
      if (nearest[free[slot]] > bestDistance) {
        bestDistance = nearest[free[slot]];
        bestSlot = slot;
      }
    }
    const chosen = free[bestSlot];
    free[bestSlot] = free[free.length - 1];
    free.pop();
    mineAt[chosen] = true;
    const cx = chosen % width;
    const cy = (chosen - cx) / width;
    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const d = dx * dx + dy * dy;
        const i = y * width + x;
        if (d < nearest[i]) nearest[i] = d;
      }
    }
  }
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
