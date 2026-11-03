'use strict';

if (typeof Justice === 'undefined') {
  globalThis.Justice = require('./justice.js');
}

// Remaining-layout odds for a player view, counted exactly. Every layout
// the visible board allows is equally likely, so a square's mine chance is
// the layouts mining it over all layouts. Justice's layout counter counts
// each group of squares the numbers link, without listing them, and the
// groups join the sea (the squares no number touches) by their mine counts.
// Nothing stops at a limit. Counts are BigInts, so every fact and every
// comparison is exact; pMine holds the same ratios as numbers for display.
//
// A bare click into a square some layout mines is scored as a guess
// (docs/product/per-game-stats.md, "Guess ledger"): life lost is its mine
// chance, needless life lost the excess over the safest square, and
// one-move life the chance of surviving it and then the safest next square,
// over every number it can show.

const ODDS_VERSION = 'guess-ledger-v3';

// The product of two counts by mine count; counts above maxMines dropped.
function multiplyRows(a, b, maxMines) {
  const length = Math.min(maxMines + 1, a.length + b.length - 1);
  const out = new Array(Math.max(0, length)).fill(0n);
  for (let i = 0; i < a.length && i < length; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < b.length && i + j < length; j++) {
      if (b[j] !== 0n) out[i + j] += a[i] * b[j];
    }
  }
  return out;
}

// out[k] = choose(seaSize, mines - k) for k below `length`: the sea's
// layouts when the rest of the board holds k of `mines`.
function seaRow(seaSize, mines, length) {
  return Justice.chooseRange(seaSize, mines - length + 1, mines).reverse();
}

// num / den as a number, for 0 <= num <= den. Past a double's range both
// are cut to their top thousand bits first.
function ratio(num, den) {
  if (num === 0n) return 0;
  if (num === den) return 1;
  const shift = den.toString(16).length * 4 - 1000;
  if (shift <= 0) return Number(num) / Number(den);
  const bits = BigInt(shift);
  return Number(num >> bits) / Number(den >> bits);
}

// opts.structure: Justice.buildStructure's for this view when the caller
// already holds it, else built here. Throws when no layout fits the view.
function analyzeView(view, opts) {
  opts = opts || {};
  const structure = opts.structure === undefined ? Justice.buildStructure(view) : opts.structure;
  const size = view.width * view.height;
  const needs = structure.clues.map((clue) => clue.count);
  const minesLeft = view.mines - structure.provenMineCount;
  const seaSize = structure.seaCells.length;
  let frontierSize = 0;
  const groups = structure.components.map(({ cells }) => {
    frontierSize += cells.length;
    const counted = Justice.countGroup(cells, structure.cluesOfCell, needs, null);
    const dense = (counts) => {
      const row = counts.length > 0 ? counts[0].slice(0, cells.length + 1) : [];
      while (row.length < cells.length + 1) row.push(0n);
      return row;
    };
    return { cells, boxes: counted.boxes, layouts: dense(counted.layouts), mineLayouts: counted.mineLayouts.map(dense) };
  });
  const prefix = [[1n]];
  for (const group of groups) prefix.push(multiplyRows(prefix[prefix.length - 1], group.layouts, minesLeft));
  const suffix = new Array(groups.length + 1);
  suffix[groups.length] = [1n];
  for (let g = groups.length - 1; g >= 0; g--) suffix[g] = multiplyRows(groups[g].layouts, suffix[g + 1], minesLeft);
  const all = prefix[groups.length];
  const seaWays = seaRow(seaSize, minesLeft, all.length);
  let total = 0n;
  for (let k = 0; k < all.length; k++) total += all[k] * seaWays[k];
  if (total === 0n) throw new Error('odds: no layout fits the visible numbers and the mine count');

  const mineLayouts = new Array(size).fill(0n);
  if (seaSize > 0) {
    const seaMineWays = seaRow(seaSize - 1, minesLeft - 1, all.length);
    let seaMine = 0n;
    for (let k = 0; k < all.length; k++) seaMine += all[k] * seaMineWays[k];
    for (const cell of structure.seaCells) mineLayouts[cell] = seaMine;
  }
  groups.forEach((group, g) => {
    const others = multiplyRows(prefix[g], suffix[g + 1], minesLeft);
    // rest[k]: the layouts of the rest of the board completing one of this
    // group's layouts holding k mines; 0 when the mine count rules it out.
    const rest = group.layouts.map((_, k) => {
      let ways = 0n;
      for (let o = 0; o < others.length && k + o < seaWays.length; o++) {
        if (others[o] !== 0n) ways += others[o] * seaWays[k + o];
      }
      return ways;
    });
    group.boxes.forEach((box, b) => {
      const mined = group.mineLayouts[b];
      let ways = 0n;
      for (let k = 0; k < mined.length; k++) if (mined[k] !== 0n) ways += mined[k] * rest[k];
      for (const cell of box.squares) mineLayouts[cell] = ways;
    });
  });
  for (const [cell, fact] of structure.facts) if (fact === 1) mineLayouts[cell] = total;

  const pMine = new Array(size).fill(0);
  const unproven = [];
  let provenSafeOpen = false;
  for (let i = 0; i < size; i++) {
    if (view.revealed[i]) continue;
    const mined = mineLayouts[i];
    if (mined === 0n) provenSafeOpen = true;
    else if (mined !== total) unproven.push(i);
    pMine[i] = ratio(mined, total);
  }
  return {
    structure,
    needs,
    groups,
    frontierSize,
    minesLeft,
    seaSize,
    total,
    mineLayouts,
    pMine,
    unproven,
    provenSafeOpen,
  };
}

// The fewest layouts mining any one covered square that some layout leaves
// safe: 0n when one is safe in every layout or none is undecided.
function fewestMined(odds) {
  if (odds.provenSafeOpen) return 0n;
  let fewest = null;
  for (const cell of odds.unproven) {
    const mined = odds.mineLayouts[cell];
    if (fewest === null || mined < fewest) fewest = mined;
  }
  return fewest === null ? 0n : fewest;
}

function minRisk(odds) {
  return ratio(fewestMined(odds), odds.total);
}

// What one-move life values computed on the same odds share.
function lifeCache() {
  return { classes: new Map(), far: new Map(), seaRows: new Map() };
}

// One-move life of opening `cell`, times the layouts: the sum, over each
// number n the square can show, of the layouts leaving it safe and showing
// n, minus the layouts among those mining the safest other square. The
// second term is 0 when some other square is then safe in all of them, or
// none is undecided. Groups touching the square or its covered neighbors
// are recounted with it safe and its neighbors' mines tracked; the other
// groups and the sea keep their counts, the sea split into the square's
// neighbors and the rest.
function lifeLayouts(view, odds, cell, cache) {
  const { structure } = odds;
  const fact = structure.facts.get(cell);
  if (fact === 1) return 0n;
  const tracked = [];
  let provenAround = 0;
  for (const neighbor of Justice.neighbors(cell, view.width, view.height)) {
    if (view.revealed[neighbor]) continue;
    const neighborFact = structure.facts.get(neighbor);
    if (neighborFact === 1) provenAround++;
    else if (neighborFact !== 2) tracked.push(neighbor);
  }
  const touched = new Set();
  const own = structure.componentOfCell.get(cell);
  if (own !== undefined) touched.add(own);
  let seaTracked = 0;
  for (const neighbor of tracked) {
    const g = structure.componentOfCell.get(neighbor);
    if (g === undefined) seaTracked++;
    else touched.add(g);
  }
  // A square no number touches, beside none either, depends only on how
  // many of its neighbors are covered and how many are proven mines.
  const classKey = touched.size === 0 ? (fact === 2 ? 'safe ' : 'sea ') + seaTracked + ' ' + provenAround : null;
  if (classKey !== null && cache.classes.has(classKey)) return cache.classes.get(classKey);
  const value = countLife(view, odds, cell, tracked, touched, fact === 2, seaTracked, provenAround, cache);
  if (classKey !== null) cache.classes.set(classKey, value);
  return value;
}

function countLife(view, odds, cell, tracked, touched, provenSafe, seaTracked, provenAround, cache) {
  const { structure, groups, minesLeft } = odds;
  const mined = odds.mineLayouts[cell];
  // Another square safe in every layout stays safe after this one opens.
  let safeElsewhere = false;
  for (const [square, fact] of structure.facts) {
    if (fact === 2 && square !== cell && !view.revealed[square]) {
      safeElsewhere = true;
      break;
    }
  }
  if (safeElsewhere) return odds.total - mined;

  const seaOther = odds.seaSize - (structure.seaSet.has(cell) ? 1 : 0) - seaTracked;
  const region = [];
  for (const g of touched) for (const square of groups[g].cells) if (square !== cell) region.push(square);
  const near = region.length > 0
    ? Justice.countGroup(region, structure.cluesOfCell, odds.needs, new Set(tracked))
    : { boxes: [], layouts: [[1n]], mineLayouts: [] };
  const farKey = [...touched].sort((a, b) => a - b).join();
  let far = cache.far.get(farKey);
  if (far === undefined) {
    const untouched = [];
    for (let g = 0; g < groups.length; g++) if (!touched.has(g)) untouched.push(g);
    const before = [[1n]];
    for (const g of untouched) before.push(multiplyRows(before[before.length - 1], groups[g].layouts, minesLeft));
    const after = new Array(untouched.length + 1);
    after[untouched.length] = [1n];
    for (let i = untouched.length - 1; i >= 0; i--) after[i] = multiplyRows(groups[untouched[i]].layouts, after[i + 1], minesLeft);
    let capacity = 0;
    for (const g of untouched) capacity += groups[g].cells.length;
    far = {
      untouched,
      capacity,
      product: before[untouched.length],
      others: untouched.map((_, i) => multiplyRows(before[i], after[i + 1], minesLeft)),
    };
    cache.far.set(farKey, far);
  }

  // choose(n, r) for r from `from` to minesLeft, the only sea mine counts
  // that can complete a layout: the groups hold at most frontierSize.
  const from = minesLeft - odds.frontierSize - 9;
  const seaWaysOf = (n) => {
    let row = cache.seaRows.get(n);
    if (row === undefined) {
      row = Justice.chooseRange(n, from, minesLeft);
      cache.seaRows.set(n, row);
    }
    return row;
  };
  const seaRest = seaWaysOf(seaOther);
  const seaRestLess = seaOther > 0 ? seaWaysOf(seaOther - 1) : null;
  const choose = Justice.choose;
  const P = far.product;
  const R = region.length;
  // kernel[j][kr]: the layouts of the far groups and the sea holding j of
  // the tracked mines and minesLeft - kr mines, so the near groups hold kr.
  // kernelSea: the same with one given tracked sea square mined; kernelRest
  // with one given untracked sea square mined.
  const kernel = [];
  const kernelSea = [];
  const kernelRest = [];
  for (let j = 0; j <= seaTracked; j++) {
    const row = new Array(R + 1).fill(0n);
    const rowSea = new Array(R + 1).fill(0n);
    const rowRest = new Array(R + 1).fill(0n);
    const ways = choose(seaTracked, j);
    const waysSea = j > 0 ? choose(seaTracked - 1, j - 1) : 0n;
    for (let kr = 0; kr <= R; kr++) {
      let base = 0n;
      let baseRest = 0n;
      for (let u = 0; u < P.length; u++) {
        if (P[u] === 0n) continue;
        const r = minesLeft - kr - u - j;
        base += P[u] * seaRest[r - from];
        if (seaRestLess !== null) baseRest += P[u] * seaRestLess[r - 1 - from];
      }
      row[kr] = base * ways;
      rowSea[kr] = base * waysSea;
      rowRest[kr] = baseRest * ways;
    }
    kernel.push(row);
    kernelSea.push(rowSea);
    kernelRest.push(rowRest);
  }
  const atNumber = (counts, k, jt) => {
    let ways = 0n;
    for (let jr = 0; jr < counts.length && jr <= jt; jr++) {
      const j = jt - jr;
      if (j > seaTracked) continue;
      const own = counts[jr];
      const row = k[j];
      for (let kr = 0; kr < own.length; kr++) if (own[kr] !== 0n) ways += own[kr] * row[kr];
    }
    return ways;
  };

  // near-and-sea[jt][r]: the near groups and the sea holding jt tracked
  // mines and r mines in all, for the r a far group's square needs.
  const nearSea = new Map();
  const nearSeaAt = (jt) => {
    let row = nearSea.get(jt);
    if (row !== undefined) return row;
    const low = minesLeft - far.capacity;
    row = new Array(far.capacity + 1).fill(0n);
    for (let i = 0; i <= far.capacity; i++) {
      const r = low + i;
      let ways = 0n;
      for (let jr = 0; jr < near.layouts.length && jr <= jt; jr++) {
        const j = jt - jr;
        if (j > seaTracked) continue;
        const pick = choose(seaTracked, j);
        const own = near.layouts[jr];
        for (let kr = 0; kr < own.length; kr++) {
          if (own[kr] !== 0n) ways += own[kr] * pick * seaRest[r - kr - j - from];
        }
      }
      row[i] = ways;
    }
    nearSea.set(jt, row);
    return row;
  };

  let life = 0n;
  for (let jt = 0; jt <= tracked.length; jt++) {
    const shown = atNumber(near.layouts, kernel, jt);
    if (shown === 0n) continue;
    // The fewest of these layouts mining one other square; 0n once some
    // square is safe in all of them.
    let fewest = null;
    const see = (ways) => {
      if (ways < shown && (fewest === null || ways < fewest)) fewest = ways;
    };
    for (const counts of near.mineLayouts) {
      see(atNumber(counts, kernel, jt));
      if (fewest === 0n) break;
    }
    if (fewest !== 0n && seaTracked > 0) see(atNumber(near.layouts, kernelSea, jt));
    if (fewest !== 0n && seaOther > 0) see(atNumber(near.layouts, kernelRest, jt));
    for (let i = 0; i < far.untouched.length && fewest !== 0n; i++) {
      const group = groups[far.untouched[i]];
      const others = far.others[i];
      const row = nearSeaAt(jt);
      // rest[kg]: everything but this group, given it holds kg mines. The
      // group and the others hold at most far.capacity, inside the row.
      const rest = group.layouts.map((_, kg) => {
        let ways = 0n;
        for (let u = 0; u < others.length; u++) {
          if (others[u] !== 0n) ways += others[u] * row[far.capacity - kg - u];
        }
        return ways;
      });
      for (const counts of group.mineLayouts) {
        let ways = 0n;
        for (let kg = 0; kg < counts.length; kg++) if (counts[kg] !== 0n) ways += counts[kg] * rest[kg];
        see(ways);
        if (fewest === 0n) break;
      }
    }
    life += shown - (fewest === null ? 0n : fewest);
  }
  return life;
}

// One-move life of opening `cell`, as a number.
function expectedLife(view, odds, cell) {
  return ratio(lifeLayouts(view, odds, cell, lifeCache()), odds.total);
}

// Score a bare click into `clicked`. Returns null when the click is not a
// guess: already revealed, or safe in every layout. opts.considerJustice:
// A just universe is on, so a certified pocket's entry is safe. opts.odds:
// analyzeView's result for this view when the caller holds it, else
// counted here.
function scoreGuess(view, clicked, opts) {
  opts = opts || {};
  if (view.revealed[clicked]) return null;
  const odds = opts.odds === undefined ? analyzeView(view) : opts.odds;
  const { total, mineLayouts } = odds;
  const mined = mineLayouts[clicked];
  if (mined === 0n) return null;

  const fewest = fewestMined(odds);
  const p = ratio(mined, total);
  const minP = ratio(fewest, total);
  const bestCells = [];
  for (let i = 0; i < view.revealed.length; i++) {
    if (!view.revealed[i] && mineLayouts[i] === fewest) bestCells.push(i);
  }
  const idealRisk = !odds.provenSafeOpen && mined === fewest;
  // Certification depends only on this one visible position. Batch all
  // candidates so the board's proof structure is built once, rather than
  // once per covered cell on the click-critical path.
  const certificates = opts.considerJustice === true
    ? Justice.certifyEntries(view, odds.unproven, odds.structure) : new Map();
  const justice = certificates.has(clicked);

  // Each covered square's one-move life as layouts over a denominator: all
  // layouts, or for a protected square the layouts leaving it safe, since
  // opening it is safe. A square's value is at most its survival chance, so
  // past the best value found the riskier squares are skipped; a protected
  // square has no such bound.
  const cache = lifeCache();
  const valueOf = (square) => ({
    life: lifeLayouts(view, odds, square, cache),
    of: certificates.has(square) ? total - mineLayouts[square] : total,
  });
  const chosen = valueOf(clicked);
  let best = chosen;
  let bestExpectedCells = [clicked];
  const consider = (square) => {
    const value = valueOf(square);
    const left = value.life * best.of;
    const right = best.life * value.of;
    if (left > right) {
      best = value;
      bestExpectedCells = [square];
    } else if (left === right) {
      bestExpectedCells.push(square);
    }
  };
  const open = [];
  for (let i = 0; i < view.revealed.length; i++) {
    if (i === clicked || view.revealed[i] || mineLayouts[i] === total) continue;
    if (certificates.has(i)) consider(i);
    else open.push(i);
  }
  open.sort((a, b) => (mineLayouts[a] < mineLayouts[b] ? -1 : mineLayouts[a] > mineLayouts[b] ? 1 : 0));
  for (const square of open) {
    if ((total - mineLayouts[square]) * best.of < best.life * total) break;
    consider(square);
  }
  bestExpectedCells.sort((a, b) => a - b);

  return {
    cell: clicked,
    p,
    minP,
    actualP: justice ? 0 : p,
    actualMinP: certificates.size > 0 ? 0 : minP,
    bestCells,
    lifeLost: p,
    lifeNeedless: ratio(mined - fewest, total),
    expectedLife: ratio(chosen.life, chosen.of),
    bestExpectedLife: ratio(best.life, best.of),
    bestExpectedCells,
    idealRisk,
    // Riskier than the safest square; and so under the rules in play,
    // where a protected square is safe.
    higherRisk: mined > fewest,
    actualHigherRisk: !justice && (certificates.size > 0 || mined > fewest),
    perfectPlay: chosen.life * best.of === best.life * chosen.of,
    justice,
    needlessGuess: !idealRisk,
  };
}

// Perfect play's chance to win from a position (docs/product/design-axis.md,
// "Move hierarchy", level 5): every layout the visible board allows is
// equally likely, and perfect play wins as many of them as any way of
// playing on can. Opening a square that no remaining layout mines never
// loses, so perfect play opens every such square at once and reads its
// number; a guess keeps the layouts that leave its square safe. Counts of
// layouts are whole numbers, so the chances are exact ratios.
//
// The board splits into parts play settles separately. An undecided square
// joins every covered square beside it that is not a proven mine, since
// opening either shows a number counting the other. A number group (an
// analyzeView group) touching several parts joins them, unless its layouts
// are every combination of its pieces in each part. Parts the mine total
// leaves one possible mine count are then independent: the layouts are
// every combination of one layout per part, and perfect play wins exactly
// the combinations of layouts it wins in each part, so the counts multiply.
// Parts it leaves several counts are searched as one. Each search lists its
// layouts and every position play can reach, both exponential in its
// squares: past WIN_WORK_LIMIT units of work in all (one unit per layout
// per square looked at, listing a group's layouts included) it stops, and
// the chances are not computed. `odds` is analyzeView(view), and `cell` is
// undecided. The counts are BigInts: products over many parts pass 2^53.
// The limit bounds how long a guess's search runs, measured 2026-11-03 on
// the 4,703 undecided guesses of 2,245 saved games: here a guess takes at
// most 76 ms and a game's guesses at most 112 ms, in the reports worker; a
// limit 1,000 times higher computes 2 to 4 more guesses in 100 at up to 18 s
// a guess; and 98% of the guesses left need 10^8 to 10^107 units before
// their search can begin (BACKLOG.md, "Deeper than one-move perfect play").
const WIN_WORK_LIMIT = 100000;

function winChances(view, odds, cell) {
  const { width, height } = view;
  const size = width * height;
  const { structure, groups } = odds;
  // 1 undecided; 2 covered and proven safe; 0 open or a proven mine.
  const kind = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (view.revealed[i]) continue;
    const fact = structure.facts.get(i);
    if (fact === undefined) kind[i] = 1;
    else if (fact === 2) kind[i] = 2;
  }
  if (kind[cell] !== 1) throw new Error('win chances: square ' + cell + ' is not undecided');

  const limit = BigInt(WIN_WORK_LIMIT);
  let work = 0n;
  const listed = new Map();
  // A group's layouts, each a Uint8Array over its cells; null past the limit.
  const listGroup = (g) => {
    if (listed.has(g)) return listed.get(g);
    const group = groups[g];
    const count = group.layouts.reduce((sum, ways) => sum + ways, 0n);
    work += count * BigInt(group.cells.length);
    if (work > limit) return null;
    const list = [];
    Justice.listGroupLayouts(group.cells, structure.cluesOfCell, odds.needs, (mined) => {
      list.push(mined.slice());
    });
    listed.set(g, list);
    return list;
  };

  const parent = Int32Array.from({ length: size }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  };
  for (let i = 0; i < size; i++) {
    if (kind[i] !== 1) continue;
    for (const neighbor of Justice.neighbors(i, width, height)) if (kind[neighbor] !== 0) join(i, neighbor);
  }
  // A group's positions in group.cells, by part.
  const piecesOf = (group) => {
    const byPart = new Map();
    group.cells.forEach((square, i) => {
      const root = find(square);
      const positions = byPart.get(root);
      if (positions === undefined) byPart.set(root, [i]);
      else positions.push(i);
    });
    return byPart;
  };
  // The distinct ways a group's layouts mine some of its positions.
  const patternsOf = (list, positions) => {
    const patterns = new Map();
    for (const mined of list) {
      const bits = positions.map((i) => mined[i]);
      const key = bits.join('');
      if (!patterns.has(key)) patterns.set(key, { bits, mines: bits.reduce((sum, bit) => sum + bit, 0) });
    }
    return [...patterns.values()];
  };
  // Joining parts only coarsens them, and a group whose layouts are every
  // combination of its pieces stays so in coarser parts: one pass.
  for (let g = 0; g < groups.length; g++) {
    const byPart = piecesOf(groups[g]);
    if (byPart.size === 1) continue;
    const list = listGroup(g);
    if (list === null) return { measured: false };
    let combinations = 1;
    for (const positions of byPart.values()) combinations *= patternsOf(list, positions).length;
    if (combinations === list.length) continue;
    const roots = [...byPart.keys()];
    for (const root of roots) join(roots[0], root);
  }

  const parts = new Map();
  for (let i = 0; i < size; i++) {
    if (kind[i] === 0) continue;
    const root = find(i);
    let part = parts.get(root);
    if (part === undefined) {
      part = { squares: [], pieces: [], sea: [] };
      parts.set(root, part);
    }
    part.squares.push(i);
    if (kind[i] === 1 && !structure.componentOfCell.has(i)) part.sea.push(i);
  }
  // A group wholly in one part is counted by mine count without a list;
  // its patterns, every layout, are listed only for the search.
  groups.forEach((group, g) => {
    for (const [root, positions] of piecesOf(group)) {
      const piece = { squares: positions.map((i) => group.cells[i]) };
      if (positions.length === group.cells.length) {
        piece.group = g;
        piece.byMines = group.layouts;
      } else {
        piece.patterns = patternsOf(listed.get(g), positions);
        piece.byMines = new Array(positions.length + 1).fill(0n);
        for (const pattern of piece.patterns) piece.byMines[pattern.mines]++;
      }
      parts.get(root).pieces.push(piece);
    }
  });
  // A part of proven-safe squares alone opens without a guess.
  const live = [...parts.values()].filter((part) => part.pieces.length > 0 || part.sea.length > 0);
  const counts = live.map((part) => {
    let byMines = Justice.chooseRange(part.sea.length, 0, part.sea.length);
    for (const piece of part.pieces) byMines = multiplyRows(byMines, piece.byMines, Infinity);
    return byMines;
  });
  // The mine counts each part holds in some layout of the whole board.
  const before = [[1n]];
  for (const own of counts) before.push(multiplyRows(before[before.length - 1], own, Infinity));
  const after = new Array(counts.length + 1);
  after[counts.length] = [1n];
  for (let p = counts.length - 1; p >= 0; p--) after[p] = multiplyRows(counts[p], after[p + 1], Infinity);
  const searches = [];
  const coupled = { parts: [], byMines: [1n], mines: odds.minesLeft };
  live.forEach((part, p) => {
    const possible = [];
    for (let m = 0; m < counts[p].length; m++) {
      if (counts[p][m] === 0n) continue;
      // The others' layouts holding the rest of the mines.
      const rest = odds.minesLeft - m;
      let others = 0n;
      const first = Math.max(0, rest - after[p + 1].length + 1);
      for (let i = first; i <= rest && i < before[p].length; i++) others += before[p][i] * after[p + 1][rest - i];
      if (others > 0n) possible.push(m);
    }
    if (possible.length === 1) {
      searches.push({ parts: [part], mines: possible[0], layoutCount: counts[p][possible[0]] });
      coupled.mines -= possible[0];
    } else {
      coupled.parts.push(part);
      coupled.byMines = multiplyRows(coupled.byMines, counts[p], Infinity);
    }
  });
  if (coupled.parts.length > 0) {
    searches.push({ parts: coupled.parts, mines: coupled.mines, layoutCount: coupled.byMines[coupled.mines] });
  }
  for (const search of searches) {
    search.squares = search.parts.flatMap((part) => part.squares);
    work += search.layoutCount * BigInt(search.squares.length);
  }
  if (work > limit) return { measured: false };
  for (const search of searches) {
    for (const part of search.parts) {
      for (const piece of part.pieces) {
        if (piece.patterns !== undefined) continue;
        const list = listGroup(piece.group);
        if (list === null) return { measured: false };
        piece.patterns = list.map((bits) => ({ bits, mines: bits.reduce((sum, bit) => sum + bit, 0) }));
      }
    }
  }

  let spent = Number(work);
  let over = false;
  const spend = (amount) => {
    spent += amount;
    if (spent > WIN_WORK_LIMIT) over = true;
  };
  // One search's layouts and the most of them perfect play wins, at best
  // and, when the search holds `cell`, after opening it.
  const searchWins = (search) => {
    const n = search.squares.length;
    const localOf = new Map(search.squares.map((square, i) => [square, i]));
    const pieces = search.parts.flatMap((part) => part.pieces).map((piece) => ({
      locals: piece.squares.map((square) => localOf.get(square)),
      patterns: piece.patterns,
    }));
    const sea = search.parts.flatMap((part) => part.sea).map((square) => localOf.get(square));
    // The fewest and most mines pieces k onward and the sea can hold.
    const fewest = new Array(pieces.length + 1).fill(0);
    const most = new Array(pieces.length + 1).fill(sea.length);
    for (let k = pieces.length - 1; k >= 0; k--) {
      const mines = pieces[k].patterns.map((pattern) => pattern.mines);
      fewest[k] = fewest[k + 1] + Math.min(...mines);
      most[k] = most[k + 1] + Math.max(...mines);
    }
    const layouts = [];
    const assign = new Uint8Array(n);
    const addSea = (seaMines) => {
      const chosen = Array.from({ length: seaMines }, (_, i) => i);
      for (;;) {
        const layout = assign.slice();
        for (const i of chosen) layout[sea[i]] = 1;
        layouts.push(layout);
        let i = seaMines - 1;
        while (i >= 0 && chosen[i] === sea.length - seaMines + i) i--;
        if (i < 0) return;
        chosen[i]++;
        for (let j = i + 1; j < seaMines; j++) chosen[j] = chosen[j - 1] + 1;
      }
    };
    const walk = (k, mines) => {
      if (mines + fewest[k] > search.mines || mines + most[k] < search.mines) return;
      if (k === pieces.length) {
        addSea(search.mines - mines);
        return;
      }
      const { locals, patterns } = pieces[k];
      for (const pattern of patterns) {
        for (let i = 0; i < locals.length; i++) assign[locals[i]] = pattern.bits[i];
        walk(k + 1, mines + pattern.mines);
      }
    };
    walk(0, 0);
    if (BigInt(layouts.length) !== search.layoutCount) {
      throw new Error('win chances: listed ' + layouts.length + ' layouts of ' + search.layoutCount);
    }
    const neighborLocals = search.squares.map((square) => Justice.neighbors(square, width, height)
      .filter((neighbor) => localOf.has(neighbor)).map((neighbor) => localOf.get(neighbor)));
    const numbers = layouts.map((layout) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        let mines = 0;
        for (const j of neighborLocals[i]) mines += layout[j];
        out[i] = mines;
      }
      return out;
    });
    // MurmurHash3's 32-bit finalizer: tags whose sums over different sets of
    // layouts rarely coincide.
    const layoutTags = Int32Array.from(layouts, (_, l) => {
      let x = l + 1;
      x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
      x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
      return x ^ (x >>> 16);
    });

    // The layouts split by what perfect play reads once it has opened every
    // square they all leave safe: the numbers on those squares. A part
    // whose layouts disagree on a newly safe square's number splits again.
    const settle = (layoutIds, settled) => {
      spend(layoutIds.length * n);
      if (over) return;
      let sets = [layoutIds];
      for (let i = 0; i < n; i++) {
        let mined = false;
        for (const l of layoutIds) {
          if (layouts[l][i]) {
            mined = true;
            break;
          }
        }
        if (mined) continue;
        const next = [];
        for (const set of sets) {
          if (set.length === 1) {
            next.push(set);
            continue;
          }
          const shown = numbers[set[0]][i];
          if (set.every((l) => numbers[l][i] === shown)) {
            next.push(set);
            continue;
          }
          const byNumber = [[], [], [], [], [], [], [], [], []];
          for (const l of set) byNumber[numbers[l][i]].push(l);
          for (const same of byNumber) if (same.length > 0) next.push(same);
        }
        sets = next;
      }
      if (sets.length === 1) settled.push(layoutIds);
      else {
        for (const set of sets) {
          if (set.length === 1) settled.push(set);
          else settle(set, settled);
        }
      }
    };
    const winsOf = (settled) => {
      let total = 0;
      for (const layoutIds of settled) total += wins(layoutIds, 0);
      return total;
    };
    // The most layouts of a settled set perfect play wins when that is more
    // than `floor`; otherwise a count no more than `floor`, all a caller
    // needing more must know, so the search stops once it cannot pass the
    // floor. One layout left is a win: every square is known. A guess wins
    // at most the layouts it survives, which orders and bounds the search.
    // The memo keeps each count with whether it is exact or only a ceiling.
    //
    // A square is dead when every layout leaving it safe gives it the same
    // number: opening it shows nothing, in this set or any part of it. Play
    // that opens a dead square and later the first square whose number
    // splits its layouts wins no more than opening that square first, which
    // was then live here too; so perfect play's first guess can be a live
    // square. Where every square is dead, no guess ever tells two layouts
    // apart, so perfect play wins exactly one.
    const memo = new Map();
    function wins(layoutIds, floor) {
      if (layoutIds.length === 1) return 1;
      const key = layoutIds.join();
      const known = memo.get(key);
      if (known !== undefined && (known.exact || known.value <= floor)) return known.value;
      spend(layoutIds.length * n);
      if (over) return 0;
      // Squares mined in the same layouts are one choice: opening either
      // keeps the same layouts and then opens the other. A choice is found
      // by the sum of its mined layouts' random tags, then compared in full,
      // and is live when any of its squares is.
      const choices = new Map();
      let anyLive = false;
      for (let i = 0; i < n; i++) {
        let mines = 0;
        let tag = 0;
        let shown = -1;
        let live = false;
        for (const l of layoutIds) {
          if (layouts[l][i]) {
            mines++;
            tag = (tag + layoutTags[l]) | 0;
          } else if (shown < 0) shown = numbers[l][i];
          else if (numbers[l][i] !== shown) live = true;
        }
        if (mines === 0 || mines === layoutIds.length) continue;
        if (live) anyLive = true;
        const same = choices.get(tag);
        const match = same === undefined ? undefined
          : same.find((choice) => layoutIds.every((l) => layouts[l][i] === layouts[l][choice.square]));
        if (match !== undefined) match.live = match.live || live;
        else if (same === undefined) choices.set(tag, [{ square: i, live }]);
        else same.push({ square: i, live });
      }
      if (!anyLive) {
        memo.set(key, { value: 1, exact: true });
        return 1;
      }
      const survivorSets = [];
      for (const same of choices.values()) {
        for (const choice of same) {
          if (choice.live) survivorSets.push(layoutIds.filter((l) => layouts[l][choice.square] === 0));
        }
      }
      let best = floor;
      let exact = false;
      for (const survivors of survivorSets.sort((a, b) => b.length - a.length)) {
        if (survivors.length <= best) break;
        const settled = [];
        settle(survivors, settled);
        let total = 0;
        let unsettled = survivors.length;
        // Each settled set must win more than `needed`: else this guess wins
        // no more than best even if every set after it wins all its layouts.
        let short = false;
        for (const group of settled) {
          unsettled -= group.length;
          const needed = best - total - unsettled;
          const value = wins(group, needed);
          if (value <= needed) {
            short = true;
            break;
          }
          total += value;
        }
        if (over) return 0;
        if (!short) {
          best = total;
          exact = true;
        }
      }
      memo.set(key, { value: best, exact });
      return best;
    }

    const all = layouts.map((_, l) => l);
    const settled = [];
    settle(all, settled);
    const best = winsOf(settled);
    const local = localOf.get(cell);
    if (local === undefined) return { layouts: layouts.length, chosen: best, best };
    const settledAfter = [];
    settle(all.filter((l) => layouts[l][local] === 0), settledAfter);
    return { layouts: layouts.length, chosen: winsOf(settledAfter), best };
  };

  let totalLayouts = 1n;
  let totalChosenWins = 1n;
  let totalBestWins = 1n;
  for (const search of searches) {
    const found = searchWins(search);
    if (over) return { measured: false };
    totalLayouts *= BigInt(found.layouts);
    totalChosenWins *= BigInt(found.chosen);
    totalBestWins *= BigInt(found.best);
  }
  return { measured: true, layouts: totalLayouts, chosenWins: totalChosenWins, bestWins: totalBestWins };
}

const Odds = {
  VERSION: ODDS_VERSION,
  ratio,
  analyzeView,
  minRisk,
  lifeCache,
  lifeLayouts,
  expectedLife,
  scoreGuess,
  winChances,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Odds;
