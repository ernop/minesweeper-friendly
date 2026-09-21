'use strict';

// Completed board measurements only. C* / RCW searches are research code in
// reference/board-metric-searches.js and do not run in the game.
const BoardMetrics = (() => {
  const Shape = typeof BoardShape === 'undefined' ? require('./board-shape.js') : BoardShape;
  const Zi = typeof Zini === 'undefined' ? require('./zini.js') : Zini;
  const VERSION = 1;

  function board(width, height, mines) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
        || width * height > 100000 || mines.length !== width * height
        || mines.some((v) => typeof v !== 'boolean') || mines.every(Boolean)) {
      throw new Error('invalid fixed board');
    }
    const around = mines.map((_, i) => Shape.neighbors(i, width, height));
    const clues = around.map((ids) => ids.filter((i) => mines[i]).length);
    const safe = mines.flatMap((mine, i) => mine ? [] : [i]);
    const floods = mines.map((mine, i) => mine ? [] : [i]);
    const seen = new Set();
    const covered = new Set();
    const points = [];
    const units = [];
    for (const start of safe) {
      if (clues[start] || seen.has(start)) continue;
      const flood = new Set();
      const zeros = [];
      const stack = [start];
      while (stack.length) {
        const i = stack.pop();
        if (flood.has(i)) continue;
        flood.add(i);
        if (!clues[i]) {
          zeros.push(i);
          seen.add(i);
          stack.push(...around[i]);
        }
      }
      const cells = [...flood];
      for (const i of zeros) floods[i] = cells;
      for (const i of cells) covered.add(i);
      units.push(start);
      points.push({ x: zeros.reduce((s, i) => s + i % width, 0) / zeros.length,
        y: zeros.reduce((s, i) => s + Math.floor(i / width), 0) / zeros.length });
    }
    for (const i of safe) if (!covered.has(i)) {
      units.push(i);
      points.push({ x: i % width, y: Math.floor(i / width) });
    }
    const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
    const meanY = points.reduce((s, p) => s + p.y, 0) / points.length;
    const workSpread = Math.sqrt(points.reduce((s, p) =>
      s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / points.length);
    return { width, height, mines, around, clues, safe, floods, units, workSpread,
      zeroOneCells: safe.filter((i) => clues[i] <= 1).length,
      zeroOpenedCells: covered.size,
      mineCount: mines.length - safe.length };
  }

  function analyze(width, height, mines) {
    const b = board(width, height, mines);
    // hzini already has a primary record field; never duplicate it inside
    // boardMetrics. Its established algorithm and historical values stay fixed.
    return { hzini: Zi.hzini(width, height, mines),
      boardMetrics: { version: VERSION, workSpread: b.workSpread,
        safeCells: b.safe.length, zeroOneCells: b.zeroOneCells, zeroOpenedCells: b.zeroOpenedCells } };
  }

  function hasFractions(value) {
    return value?.version === VERSION && Number.isSafeInteger(value.safeCells)
      && value.safeCells > 0 && value.safeCells <= 100000
      && [value.zeroOneCells, value.zeroOpenedCells].every((n) =>
        Number.isSafeInteger(n) && n >= 0 && n <= value.safeCells);
  }

  function valid(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Number.isInteger(value.version) || value.version < 1) return false;
    if (value.version !== VERSION) return true; // preserve uninterpretable future measurements
    const integer = (v) => Number.isSafeInteger(v) && v >= 0;
    if (!Number.isFinite(value.workSpread) || value.workSpread < 0
        || (value.effort !== undefined && !integer(value.effort))) return false;
    if (['safeCells', 'zeroOneCells', 'zeroOpenedCells'].some((key) => value[key] !== undefined)
        && !hasFractions(value)) return false;
    const c = value.chord, l = value.logic;
    if (c !== undefined && (!c || !['exact', 'bounded'].includes(c.status)
        || !integer(c.lower) || c.lower < 1 || !integer(c.upper) || c.upper < c.lower
        || (c.status === 'exact') !== (c.lower === c.upper))) return false;
    if (l !== undefined && (!l || !['complete', 'incomplete'].includes(l.status)
        || ![l.lower, l.upper, l.rounds, l.guesses, l.mineHits, l.remainingSafe].every(integer)
        || l.upper < l.lower || typeof l.openingMine !== 'boolean'
        || l.mineHits > l.guesses + (l.openingMine ? 1 : 0)
        || (l.status === 'complete') !== (l.remainingSafe === 0))) return false;
    return true;
  }

  return { VERSION, board, analyze, valid, hasFractions };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BoardMetrics;
