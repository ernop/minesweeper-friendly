'use strict';

// Research only; not loaded by the game. Board-only measurements. All search limits count deterministic work, never
// elapsed time. A stopped proof returns bounds / incomplete, not a guessed value.
const BoardMetrics = (() => {
  const Shape = typeof BoardShape === 'undefined' ? require('../board-shape.js') : BoardShape;
  const Zi = typeof Zini === 'undefined' ? require('../zini.js') : Zini;
  const VERSION = 1;
  const LIMIT = Symbol('board metric work limit');
  const budget = (limit) => ({ used: 0, limit, tick(n = 1) {
    this.used += n;
    if (this.used > this.limit) throw LIMIT;
  } });
  const bit = (i) => 1n << BigInt(i);
  const mask = (ids) => ids.reduce((out, i) => out | bit(i), 0n);
  const count = (bits) => {
    let n = 0;
    while (bits) { bits &= bits - 1n; n++; }
    return n;
  };

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
      mineCount: mines.length - safe.length };
  }

  function minimumChordClicks(b, options = {}) {
    if (b.mines.length > 1024) return { status: 'bounded', lower: 1, upper: b.units.length };
    let upper = Math.min(b.units.length,
      Zi.zini(b.width, b.height, b.mines), Zi.hzini(b.width, b.height, b.mines));
    if (upper === 1) return { status: 'exact', lower: 1, upper: 1 };
    const work = budget(options.maxWork ?? 300000);
    const safeMask = mask(b.safe);
    const mineMask = mask(b.mines.flatMap((v, i) => v ? [i] : []));
    const unitMask = mask(b.units);
    const floods = b.floods.map(mask);
    // Bundle a chord's prerequisite reveal and missing correct flags with it.
    // Flags can always be postponed until their first chord without changing cost.
    const chords = b.safe.filter((i) => b.clues[i] > 0).map((i) => ({
      cell: bit(i), flags: mask(b.around[i]) & mineMask,
      opens: b.around[i].reduce((m, nb) => m | floods[nb], bit(i)),
    }));
    const direct = [...new Set(b.safe.map((i) => floods[i]))];
    // A packing bound: no single bundled action can cover two selected units.
    // Ignoring prerequisites/flag costs only makes this relaxation cheaper.
    const conflict = new Map(b.units.map((i) => [bit(i), bit(i)]));
    for (const opens of [...direct, ...chords.map((c) => c.opens)]) {
      const touched = opens & unitMask;
      for (const u of conflict.keys()) if (touched & u) conflict.set(u, conflict.get(u) | touched);
    }
    const lowerAt = (state) => {
      let remaining = unitMask & ~state;
      let n = 0;
      for (const [u, conflicts] of conflict) if (remaining & u) {
        n++;
        remaining &= ~conflicts;
      }
      return n;
    };
    let lower = lowerAt(0n);
    let threshold = lower;
    const seen = new Map();
    const search = (state, cost) => {
      work.tick();
      if ((state & safeMask) === safeMask) { upper = Math.min(upper, cost); return true; }
      if (cost + lowerAt(state) > threshold || (seen.get(state) ?? Infinity) <= cost) return false;
      seen.set(state, cost);
      const nexts = new Map();
      const add = (next, price) => {
        if (next === state || cost + price > threshold) return;
        if (price < (nexts.get(next) ?? Infinity)) nexts.set(next, price);
      };
      for (const opens of direct) { work.tick(); add(state | opens, 1); }
      for (const c of chords) {
        work.tick();
        if (!(c.opens & safeMask & ~state & ~c.cell)) continue;
        add(state | c.opens | c.flags,
          1 + (state & c.cell ? 0 : 1) + count(c.flags & ~state));
      }
      const ordered = [...nexts].map(([next, price]) => ({ next, price,
        gain: count(next & unitMask & ~state) / price }));
      ordered.sort((a, z) => z.gain - a.gain || a.price - z.price
        || (a.next < z.next ? -1 : a.next > z.next ? 1 : 0));
      for (const { next, price } of ordered) if (search(next, cost + price)) return true;
      return false;
    };
    let complete = true;
    try {
      for (; threshold < upper; threshold++) {
        seen.clear();
        if (search(0n, 0)) break;
        lower = threshold + 1;
      }
    } catch (err) { if (err !== LIMIT) throw err; complete = false; }
    return { status: complete || lower === upper ? 'exact' : 'bounded',
      lower: complete ? upper : lower, upper };
  }

  // Every original visible clue counts once. The total mine counter counts
  // once too; known cells are substituted without consuming a clue.
  function equations(b, revealed, knownMines) {
    const unknown = b.mines.flatMap((_, i) =>
      !revealed.has(i) && !knownMines.has(i) ? [i] : []);
    const clues = [...revealed].sort((a, z) => a - z).map((i) => ({
      cells: b.around[i].filter((nb) => !revealed.has(nb) && !knownMines.has(nb)),
      need: b.clues[i] - b.around[i].filter((nb) => knownMines.has(nb)).length,
    })).filter((c) => c.cells.length);
    clues.push({ cells: unknown, need: b.mineCount - knownMines.size, global: true });
    return { unknown, clues };
  }

  const chooseCache = new Map();
  function choose(n, k) {
    if (k < 0 || k > n) return 0n;
    k = Math.min(k, n - k);
    const key = n + ',' + k;
    if (chooseCache.has(key)) return chooseCache.get(key);
    let v = 1n;
    for (let i = 1; i <= k; i++) v = v * BigInt(n - k + i) / BigInt(i);
    chooseCache.set(key, v);
    return v;
  }

  // Cells with identical equation membership are exchangeable. Enumerate
  // their mine counts, weighting each assignment by exact binomial counts.
  function enumerate(clues, work) {
    const membership = new Map();
    clues.forEach((clue, ci) => clue.cells.forEach((cell) => {
      if (!membership.has(cell)) membership.set(cell, []);
      membership.get(cell).push(ci);
    }));
    const bySignature = new Map();
    for (const [cell, ids] of membership) {
      const key = ids.join(',');
      if (!bySignature.has(key)) bySignature.set(key, { cells: [], ids });
      bySignature.get(key).cells.push(cell);
    }
    const groups = [...bySignature.values()].sort((a, z) =>
      z.ids.length - a.ids.length || a.cells[0] - z.cells[0]);
    const need = clues.map((c) => c.need);
    const remaining = clues.map((c) => c.cells.length);
    const assigned = [];
    const ways = new Map();
    const mineWays = groups.map(() => new Map());
    const visit = (at, mines, weight) => {
      work.tick();
      if (at === groups.length) {
        if (need.some((v) => v !== 0)) return;
        ways.set(mines, (ways.get(mines) ?? 0n) + weight);
        groups.forEach((g, i) => {
          const w = weight * BigInt(assigned[i]) / BigInt(g.cells.length);
          mineWays[i].set(mines, (mineWays[i].get(mines) ?? 0n) + w);
        });
        return;
      }
      const g = groups[at];
      const size = g.cells.length;
      let lo = 0, hi = size;
      for (const ci of g.ids) {
        remaining[ci] -= size;
        lo = Math.max(lo, need[ci] - remaining[ci]);
        hi = Math.min(hi, need[ci]);
      }
      for (let n = lo; n <= hi; n++) {
        assigned[at] = n;
        for (const ci of g.ids) need[ci] -= n;
        visit(at + 1, mines + n, weight * choose(size, n));
        for (const ci of g.ids) need[ci] += n;
      }
      for (const ci of g.ids) remaining[ci] += size;
    };
    visit(0, 0, 1n);
    if (!ways.size) throw new Error('inconsistent board equations');
    return { groups, ways, mineWays };
  }

  function subsetFacts(clues, work) {
    work.tick();
    const facts = new Map();
    if (clues.length === 1) {
      const c = clues[0];
      if (c.need === 0 || c.need === c.cells.length) {
        for (const i of c.cells) facts.set(i, c.need === 0 ? 0 : 1);
      }
      return facts;
    }
    const result = enumerate(clues, work);
    const total = [...result.ways.values()].reduce((s, v) => s + v, 0n);
    result.groups.forEach((g, gi) => {
      const mines = [...result.mineWays[gi].values()].reduce((s, v) => s + v, 0n);
      if (mines === 0n || mines === total) for (const i of g.cells) facts.set(i, mines === 0n ? 0 : 1);
    });
    return facts;
  }

  function factsAtWidth(clues, k, work) {
    const facts = new Map();
    const picked = [];
    const visit = (from) => {
      if (picked.length === k) {
        for (const [i, v] of subsetFacts(picked, work)) facts.set(i, v);
        return;
      }
      for (let i = from; i <= clues.length - (k - picked.length); i++) {
        picked.push(clues[i]); visit(i + 1); picked.pop();
      }
    };
    visit(0);
    return facts;
  }

  function convolve(a, z, work, max) {
    const out = new Map();
    for (const [i, x] of a) for (const [j, y] of z) {
      work.tick();
      if (i + j <= max) out.set(i + j, (out.get(i + j) ?? 0n) + x * y);
    }
    return out;
  }

  // Exact posterior under uniform layouts satisfying the visible clues and
  // total mine count. Hidden board contents are not an input to this routine.
  function modelCounts(unknown, clues, work) {
    const local = clues.filter((c) => !c.global);
    const totalMines = clues.find((c) => c.global).need;
    const attached = new Map();
    local.forEach((c, ci) => c.cells.forEach((cell) => {
      if (!attached.has(cell)) attached.set(cell, []);
      attached.get(cell).push(ci);
    }));
    const seen = new Set();
    const components = [];
    for (const start of attached.keys()) {
      if (seen.has(start)) continue;
      const stack = [start], ids = new Set();
      while (stack.length) {
        const cell = stack.pop();
        if (seen.has(cell)) continue;
        seen.add(cell);
        for (const ci of attached.get(cell)) if (!ids.has(ci)) {
          ids.add(ci); stack.push(...local[ci].cells);
        }
      }
      components.push(enumerate([...ids].map((ci) => local[ci]), work));
    }
    const sea = unknown.filter((i) => !attached.has(i));
    const seaWays = new Map();
    for (let k = 0; k <= Math.min(totalMines, sea.length); k++) seaWays.set(k, choose(sea.length, k));
    const prefix = [new Map([[0, 1n]])];
    for (const c of components) prefix.push(convolve(prefix[prefix.length - 1], c.ways, work, totalMines));
    const suffix = new Array(components.length + 1);
    suffix[components.length] = seaWays;
    for (let i = components.length - 1; i >= 0; i--) suffix[i] = convolve(components[i].ways, suffix[i + 1], work, totalMines);
    const total = suffix[0].get(totalMines) ?? 0n;
    if (!total) throw new Error('no globally consistent board layouts');
    const numerators = new Map();
    components.forEach((c, ci) => {
      const other = convolve(prefix[ci], suffix[ci + 1], work, totalMines);
      c.groups.forEach((g, gi) => {
        let numerator = 0n;
        for (const [k, ways] of c.mineWays[gi]) numerator += ways * (other.get(totalMines - k) ?? 0n);
        for (const cell of g.cells) numerators.set(cell, numerator);
      });
    });
    let seaNumerator = 0n;
    if (sea.length) for (const [k, ways] of prefix[components.length]) {
      seaNumerator += ways * choose(sea.length - 1, totalMines - k - 1);
    }
    for (const cell of sea) numerators.set(cell, seaNumerator);
    return { total, numerators };
  }

  function canonicalLogic(b, options = {}) {
    const work = budget(options.maxWork ?? 1000000);
    const revealed = new Set();
    const knownMines = new Set();
    const guesses = [];
    let rounds = 0, lower = 0, upper = 0, mineHits = 0, status = 'complete';
    const open = (i) => {
      if (b.mines[i]) { knownMines.add(i); mineHits++; }
      else for (const cell of b.floods[i]) revealed.add(cell);
    };
    const apply = (facts) => {
      for (const [i, mine] of facts) {
        if (mine) knownMines.add(i);
        else open(i);
      }
      rounds++;
    };
    // The same upper-left observation is used for every board. Mine hits
    // are knowledge in this analysis, never a redraw or a peek at other cells.
    open(0);
    try {
      while (revealed.size < b.safe.length) {
        work.tick();
        const { unknown, clues } = equations(b, revealed, knownMines);
        let facts = new Map();
        let width = 1;
        for (; width <= Math.min(2, clues.length); width++) {
          facts = factsAtWidth(clues, width, work);
          if (facts.size) break;
        }
        if (facts.size) {
          lower = Math.max(lower, width); upper = Math.max(upper, width);
          apply(facts); continue;
        }
        const models = modelCounts(unknown, clues, work);
        for (const [i, numerator] of models.numerators) {
          if (numerator === 0n || numerator === models.total) facts.set(i, numerator === 0n ? 0 : 1);
        }
        if (facts.size) {
          // Try higher clue widths with a separate deterministic sub-budget.
          // Full-model facts remain a sound upper bound if width certification
          // is expensive; continue the board instead of inventing a width.
          const certification = budget(Math.min(Math.floor(work.limit / 40),
            Math.max(0, work.limit - work.used)));
          let found = false;
          try {
            for (width = 3; width <= clues.length; width++) {
              const narrow = factsAtWidth(clues, width, certification);
              if (narrow.size) { facts = narrow; found = true; break; }
            }
          } catch (err) { if (err !== LIMIT) throw err; }
          work.tick(Math.min(certification.used, certification.limit));
          lower = Math.max(lower, Math.min(width, clues.length));
          upper = Math.max(upper, found ? width : clues.length);
          apply(facts); continue;
        }
        let chosen = -1, best;
        for (const i of unknown) {
          const numerator = models.numerators.get(i);
          if (chosen < 0 || numerator < best) { chosen = i; best = numerator; }
        }
        // unknown is row-major, and exact integer ties keep the first cell.
        const risk = Number(best * 1000000000000n / models.total) / 1000000000000;
        guesses.push({ cell: chosen, risk, mine: b.mines[chosen] });
        open(chosen);
      }
    } catch (err) { if (err !== LIMIT) throw err; status = 'incomplete'; }
    return { status, lower, upper, rounds, guesses: guesses.length, mineHits,
      openingMine: b.mines[0], remainingSafe: b.safe.length - revealed.size,
      ...(options.trace ? { choices: guesses } : {}) };
  }

  function analyze(width, height, mines, options = {}) {
    const b = board(width, height, mines);
    return { version: VERSION, workSpread: b.workSpread, effort: options.chord?.maxWork ?? 300000,
      chord: minimumChordClicks(b, options.chord), logic: canonicalLogic(b, options.logic) };
  }

  function valid(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Number.isInteger(value.version) || value.version < 1) return false;
    if (value.version !== VERSION) return true; // preserve uninterpretable future measurements
    const integer = (v) => Number.isSafeInteger(v) && v >= 0;
    if (!Number.isFinite(value.workSpread) || value.workSpread < 0
        || (value.effort !== undefined && !integer(value.effort))) return false;
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

  return { VERSION, board, minimumChordClicks, canonicalLogic, analyze,
    valid, equations, modelCounts, factsAtWidth, budget };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BoardMetrics;
