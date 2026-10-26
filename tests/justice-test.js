'use strict';

// Deterministic policy and correctness tests for sealed-pocket mercy.
// Run: node tests/justice-test.js

const fs = require('node:fs');
const path = require('node:path');
const Justice = require('../justice.js');

let failures = 0;

function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

function makeBoard(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mines = [];
  const revealed = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('ragged fixture');
    for (const char of row) {
      if (!'.#*'.includes(char)) throw new Error('bad fixture char ' + char);
      mines.push(char === '*');
      revealed.push(char === '.');
    }
  }
  const adjacent = mines.map((mine, index) => (mine ? 0
    : Justice.neighbors(index, width, height).filter((neighbor) => mines[neighbor]).length));
  return {
    view: {
      width,
      height,
      mines: mines.filter(Boolean).length,
      revealed,
      adjacent,
    },
    mines,
    at: (x, y) => y * width + x,
  };
}

function validRedraw(board, redrawn, clicked) {
  if (redrawn[clicked]) return false;
  if (redrawn.filter(Boolean).length !== board.view.mines) return false;
  for (let i = 0; i < redrawn.length; i++) {
    if (!board.view.revealed[i]) continue;
    const count = Justice.neighbors(i, board.view.width, board.view.height)
      .filter((neighbor) => redrawn[neighbor]).length;
    if (count !== board.view.adjacent[i]) return false;
  }
  return true;
}

// 1. A symmetric 1-in-3 is certified before the witness is consulted.
{
  const minedEntry = makeBoard(['.*', '##']);
  const safeEntry = makeBoard(['.#', '*#']);
  const minedCertificate = Justice.certifyEntry(minedEntry.view, 1);
  const safeCertificate = Justice.certifyEntry(safeEntry.view, 1);
  check('1-in-3: certified cardinality pocket',
    minedCertificate !== null && minedCertificate.type === 'cardinality');
  check('1-in-3: qualification independent of hidden layout',
    JSON.stringify(minedCertificate) === JSON.stringify(safeCertificate));
  check('1-in-3: exact entry odds recorded',
    minedCertificate.clearWays === 2 && minedCertificate.totalWays === 3);
  const batched = Justice.certifyEntries(minedEntry.view, [1, 2, 3]);
  check('1-in-3: batch certification covers every pocket entry',
    batched.size === 3 && [1, 2, 3].every((entry) => batched.has(entry)));
  check('1-in-3: batch reuses one pocket certificate',
    batched.get(1) === batched.get(2) && batched.get(2) === batched.get(3));
  const redrawn = Justice.redrawEntry(
    minedCertificate, 1, minedEntry.mines, () => 0);
  check('1-in-3: mined entry redrawn clear', validRedraw(minedEntry, redrawn, 1));
  const unchanged = Justice.redrawEntry(
    safeCertificate, 1, safeEntry.mines, () => 0);
  check('1-in-3: already-safe entry leaves layout unchanged',
    unchanged.every((mine, index) => mine === safeEntry.mines[index]));
}

// 2. A larger cardinality pocket uses direct combinatorial redraw.
{
  const board = makeBoard([
    '*##',
    '#.#',
    '##*',
  ]);
  const certificate = Justice.certifyEntry(board.view, board.at(0, 0));
  check('2-in-8: certified without layout enumeration',
    certificate !== null
      && certificate.type === 'cardinality'
      && certificate.mineCount === 2
      && certificate.cells.length === 8);
  const redrawn = Justice.redrawEntry(
    certificate, board.at(0, 0), board.mines, () => 0);
  check('2-in-8: conditioned redraw valid',
    validRedraw(board, redrawn, board.at(0, 0)));
}

// 3. An even alternating chain has exactly two equal-total layouts.
{
  const board = makeBoard(['*.#.*.#']);
  const certificate = Justice.certifyEntry(board.view, 0);
  check('alternating chain: complement certificate',
    certificate !== null
      && certificate.type === 'complement'
      && certificate.partitionA.length === 2
      && certificate.partitionB.length === 2);
  const redrawn = Justice.redrawEntry(certificate, 0, board.mines, () => 0);
  check('alternating chain: switches to the clear complement',
    validRedraw(board, redrawn, 0));
}

// 4. Sealed sea remnant behind proven mines.
{
  const board = makeBoard(['.*#**.']);
  const certificate = Justice.certifyEntry(board.view, 3);
  check('sealed sea: certified k-of-n remnant',
    certificate !== null
      && certificate.type === 'sea'
      && certificate.cells.length === 2
      && certificate.mineCount === 1);
  const redrawn = Justice.redrawEntry(certificate, 3, board.mines, () => 0);
  check('sealed sea: conditioned redraw valid', validRedraw(board, redrawn, 3));
  check('sealed sea: mine moves to partner', redrawn[2] === true);
}

// 5. Early open-field guesses remain ordinary risk.
{
  const board = makeBoard([
    '.#########',
    '#*########',
    '##########',
    '##########',
    '####*#####',
    '##*###*###',
    '####*###*#',
    '#######*##',
    '##*#######',
    '#####*####',
  ]);
  check('corner 1: sea entry not certified',
    Justice.certifyEntry(board.view, board.at(5, 9)) === null);
  check('corner 1: neighbor entry not certified',
    Justice.certifyEntry(board.view, board.at(1, 1)) === null);
}

// 6. A geometrically open flank can reveal which side contains the mine.
{
  const board = makeBoard([
    '..##',
    '..*#',
    '.**#',
    '...#',
  ]);
  check('open-flank pair: not certified',
    Justice.certifyEntry(board.view, board.at(2, 1)) === null);
}

// 7. Knowable cells are not ambiguous entries.
{
  const board = makeBoard(['.**']);
  check('provable mine: not certified', Justice.certifyEntry(board.view, 2) === null);
}

// 8. Disconnected complement pockets are certified and redrawn separately.
{
  const board = makeBoard(['*.#.*.#*.**.#.*.#']);
  const first = Justice.certifyEntry(board.view, 0);
  const second = Justice.certifyEntry(board.view, 10);
  check('disconnected pockets: first independently certified',
    first !== null && first.type === 'complement' && first.cells.includes(0));
  check('disconnected pockets: second independently certified',
    second !== null && second.type === 'complement' && second.cells.includes(10));
  const redrawn = Justice.redrawEntry(first, 0, board.mines, () => 0);
  check('disconnected pockets: first redraw leaves second untouched',
    second.cells.every((cell) => redrawn[cell] === board.mines[cell]));
}

// 8b. Two 50/50s seen by one shared number (creator report 2026-10-21: a
// loss on this board). The shared 2 and 5 join the four cells into one
// component with four layouts; each 50/50 still qualifies on its own.
{
  const board = makeBoard([
    '.*..*...',
    '*..*....',
    '.*****..',
    '.*#.*.*.',
    '..*.#...',
  ]);
  const clicked = board.at(2, 4);
  const left = Justice.certifyEntry(board.view, clicked);
  const right = Justice.certifyEntry(board.view, board.at(4, 4));
  check('shared-number 50/50s: the clicked pair certified alone',
    left !== null && left.cells.length === 2 && left.cells.includes(board.at(2, 3))
      && left.clearWays === 1 && left.totalWays === 2);
  check('shared-number 50/50s: the other pair certified alone',
    right !== null && right.cells.length === 2 && right.cells.includes(board.at(4, 3)));
  const redrawn = Justice.redrawEntry(left, clicked, board.mines, () => 0);
  check('shared-number 50/50s: mined entry redrawn clear', validRedraw(board, redrawn, clicked));
  check('shared-number 50/50s: the other pair untouched',
    right.cells.every((cell) => redrawn[cell] === board.mines[cell]));
}

// 8c. A 50/50 with no number of its own: the 2s see it and the right-hand
// pair together, and the right-hand 1 pins that pair, so subtraction pins
// this one.
{
  const board = makeBoard([
    '****',
    '#.#.',
    '*.*.',
  ]);
  const certificate = Justice.certifyEntry(board.view, board.at(0, 2));
  check('subtracted 50/50: certified',
    certificate !== null && certificate.mineCount === 1
      && certificate.cells.length === 2 && certificate.cells.includes(board.at(0, 1)));
  const redrawn = Justice.redrawEntry(certificate, board.at(0, 2), board.mines, () => 0);
  check('subtracted 50/50: conditioned redraw valid',
    validRedraw(board, redrawn, board.at(0, 2)));
}

// 9. Equal-sized overlapping constraints can prove their one-sided cells.
{
  // Equal-size overlapping clues:
  //   shared + cell 3 = 3
  //   shared + cell 4 = 2
  // therefore cell 3 is mined and cell 4 is safe.
  const view = {
    width: 5,
    height: 1,
    mines: 3,
    revealed: [false, false, false, false, false],
    adjacent: [0, 0, 0, 0, 0],
  };
  const facts = Justice.proveFacts(view, [
    { covered: [0, 1, 2, 3], count: 3 },
    { covered: [0, 1, 2, 4], count: 2 },
  ]);
  check('overlap subtraction proves the one-sided mine', facts.get(3) === 1);
  check('overlap subtraction proves the one-sided safe', facts.get(4) === 2);
}

// 10. A forced fact that requires combining four constraints, rather than
// matching one local pattern, is found by all-consistent-layout search.
{
  const view = {
    width: 5,
    height: 1,
    mines: 2,
    revealed: [false, false, false, false, false],
    adjacent: [0, 0, 0, 0, 0],
  };
  const clues = [
    { covered: [0, 1, 2], count: 1 },
    { covered: [0, 3, 4], count: 1 },
    { covered: [1, 3], count: 1 },
    { covered: [2, 4], count: 1 },
  ];
  const local = Justice.proveFacts(view, clues, { global: false, exact: false });
  check('local count/subset rules alone do not find higher-order fact',
    !local.has(0));
  const numbers = Justice.proveFacts(view, clues, { global: false });
  check('every layout the numbers allow proves it without the mine total',
    numbers.get(0) === 2 && numbers.complete === true && numbers.method === 'all-number-layouts');
  const exact = Justice.proveFacts(view, clues);
  check('complete solver proves higher-order safe', exact.get(0) === 2);
  check('complete solver labels exhaustive result', exact.complete === true
    && exact.method === 'all-consistent-layouts');
  const limited = Justice.proveFacts(view, clues, { maxVisits: 0 });
  check('work limit is explicit rather than a false judgement',
    limited.complete === false && limited.method === 'work-limit' && !limited.has(0));
  const limitedLevels = Justice.proveLevels(view, clues, { maxVisits: 0 });
  check('a stopped search leaves every level in one pass to the rules',
    limitedLevels.facts.complete === false && limitedLevels.facts.method === 'work-limit'
    && [...limitedLevels.levelOf.values()].every((level) => level === 'counting' || level === 'overlap'));
}

// Justice.proveLevels, every level in one pass, against each level's own
// proof: each fact at the first level whose proof proves it, and the facts,
// completeness, and method of the full proof.
function levelsInOnePassAgree(view, clues) {
  const proofs = Justice.DEDUCTION_LEVELS.map((level) => Justice.proveFacts(view, clues, level.proof));
  const full = proofs[proofs.length - 1];
  const { facts, levelOf } = Justice.proveLevels(view, clues);
  if (facts.size !== full.size || levelOf.size !== full.size
    || facts.complete !== full.complete || facts.method !== full.method) return false;
  for (const [cell, fact] of full) {
    if (facts.get(cell) !== fact) return false;
    const first = proofs.findIndex((proof) => proof.has(cell));
    if (levelOf.get(cell) !== Justice.DEDUCTION_LEVELS[first].id) return false;
  }
  return true;
}

// 10b. Deduction levels: every fact at the first level that proves it, each
// level keeping every fact of the levels below it.
{
  const levelsOf = (board) => {
    const clues = Justice.rawClues(board.view);
    const proofs = Justice.DEDUCTION_LEVELS.map((level) => Justice.proveFacts(board.view, clues, level.proof));
    const nested = proofs.every((facts, i) => i === 0
      || [...proofs[i - 1]].every(([cell, fact]) => facts.get(cell) === fact))
      && levelsInOnePassAgree(board.view, clues);
    const levels = {};
    board.view.revealed.forEach((open, cell) => {
      if (open) return;
      const first = proofs.findIndex((facts) => facts.has(cell));
      levels[cell] = first === -1 ? null
        : (proofs[first].get(cell) === 1 ? 'mine ' : 'safe ') + Justice.DEDUCTION_LEVELS[first].id;
    });
    return { nested, levels };
  };
  check('deduction levels: counting, overlap, all numbers, mine total, in that order',
    Justice.DEDUCTION_LEVELS.map((level) => level.id).join() === 'counting,overlap,allNumbers,mineTotal');

  // A 1 touching one covered square; then a 1 touching that mine, one
  // number at a time.
  const one = levelsOf(makeBoard(['.*#', '...']));
  check('level 1: a 1 beside one covered square, then a 1 beside that mine',
    one.nested && JSON.stringify(one.levels) === JSON.stringify({ 1: 'mine counting', 2: 'safe counting' }));

  // The creator's example (2026-10-26): a 1 2 2 1 wall over zeros on a board
  // four wide resolves as open, mine, mine, open, and only two numbers
  // compared do it.
  const wall = levelsOf(makeBoard(['#**#', '....', '....']));
  check('level 2: the 1 2 2 1 wall',
    wall.nested && JSON.stringify(wall.levels)
      === JSON.stringify({ 0: 'safe overlap', 1: 'mine overlap', 2: 'mine overlap', 3: 'safe overlap' }));

  // 2 a 1 0     The 1 above (a + c = 1) and the 1 at the right (e + f = 1)
  // b c 2 1     each put one mine among the five covered squares of the
  // 2 d e f     middle 2: that is both its mines, so d is safe, which three
  //             numbers prove together and no pair does. Comparing the two
  // top numbers proves b; e and f stay unknown even with the mine total.
  const three = levelsOf(makeBoard(['.#..', '**..', '.#*#']));
  check('level 3: two 1s inside a 2',
    three.nested && JSON.stringify(three.levels) === JSON.stringify({ 1: 'safe allNumbers', 4: 'mine overlap',
      5: 'mine allNumbers', 9: 'safe allNumbers', 10: null, 11: null }));

  // 0 0 1 2 a   Counting proves the mine between the 1s; each 2 then needs
  // 0 0 1 * b   one more: b alone, or a and c both. The board's 2 mines
  // 0 0 1 2 c   allow only b.
  const totalBoard = makeBoard(['....#', '...**', '....#']);
  const total = levelsOf(totalBoard);
  check('level 4: the mine total chooses between one mine and two',
    total.nested && JSON.stringify(total.levels) === JSON.stringify({ 4: 'safe mineTotal', 8: 'mine counting',
      9: 'mine mineTotal', 14: 'safe mineTotal' }));
  // A proof without the mine total does not replace the full proof a click
  // asks for again.
  const clues = Justice.rawClues(totalBoard.view);
  const full = Justice.proveFacts(totalBoard.view, clues);
  Justice.proveFacts(totalBoard.view, clues, { global: false });
  check('the full proof stays cached past a proof without the mine total',
    Justice.proveFacts(totalBoard.view, clues) === full && full.get(9) === 1);
}

// 11. Random small constraint systems agree with full brute force.
{
  let state = 0x5eed1234;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let matched = true;
  for (let trial = 0; trial < 100 && matched; trial++) {
    const size = 8;
    const witness = Array.from({ length: size }, () => random() < 0.35);
    if (!witness.some(Boolean)) witness[0] = true;
    const clues = [];
    for (let c = 0; c < 5; c++) {
      const covered = [];
      for (let cell = 0; cell < size; cell++) {
        if (random() < 0.45) covered.push(cell);
      }
      if (covered.length < 2) covered.push(c % size, (c + 3) % size);
      const unique = [...new Set(covered)];
      clues.push({
        covered: unique,
        count: unique.filter((cell) => witness[cell]).length,
      });
    }
    const mineCount = witness.filter(Boolean).length;
    const models = [];
    const numberModels = [];
    for (let mask = 0; mask < (1 << size); mask++) {
      let mines = 0;
      for (let cell = 0; cell < size; cell++) mines += (mask >> cell) & 1;
      if (clues.every((clue) => clue.covered.reduce(
        (sum, cell) => sum + ((mask >> cell) & 1), 0) === clue.count)) {
        numberModels.push(mask);
        if (mines === mineCount) models.push(mask);
      }
    }
    const view = {
      width: size,
      height: 1,
      mines: mineCount,
      revealed: new Array(size).fill(false),
      adjacent: new Array(size).fill(0),
    };
    const facts = Justice.proveFacts(view, clues);
    const numberFacts = Justice.proveFacts(view, clues, { global: false });
    if (!facts.complete || !numberFacts.complete || models.length === 0) matched = false;
    const factIn = (layouts, cell) => (layouts.every((mask) => ((mask >> cell) & 1) === 1) ? 1
      : layouts.every((mask) => ((mask >> cell) & 1) === 0) ? 2 : undefined);
    for (let cell = 0; cell < size && matched; cell++) {
      if (facts.get(cell) !== factIn(models, cell)) matched = false;
      if (numberFacts.get(cell) !== factIn(numberModels, cell)) matched = false;
    }
    if (!levelsInOnePassAgree(view, clues)) matched = false;
  }
  check('exact facts, with and without the mine total and every level in one pass, match brute force on random constraint systems', matched);
}

// 11b. Stuck positions on random small boards, against brute force over
// every layout the view allows. Each board opens one safe cell, opens every
// proven-safe cell until none is left, is checked there, then opens one more
// safe cell as a lucky guess and goes on. For every certificate: its family
// holds in every layout, every family member can replace the group in every
// layout, no covered cell outside the group that could still be opened sees
// the members differently, and the redraw of a mined entry is a valid layout
// with the entry clear.
{
  let state = 0x20261021;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const pick = ([low, high]) => low + Math.floor(random() * (high - low + 1));
  const subsets = (cells, k) => {
    if (k === 0) return [[]];
    if (cells.length < k) return [];
    const [first, ...rest] = cells;
    return [...subsets(rest, k - 1).map((tail) => [first, ...tail]), ...subsets(rest, k)];
  };
  const members = (certificate) => (certificate.type === 'complement'
    ? [certificate.partitionA, certificate.partitionB]
    : subsets(certificate.cells, certificate.mineCount)).map((mined) => new Set(mined));
  let failure = null;
  let positions = 0;
  let certified = 0;
  let partOfComponent = 0;
  const checkPosition = (label, view, structure) => {
    const { width, height, revealed, adjacent } = view;
    const neighbors = (cell) => Justice.neighbors(cell, width, height);
    const covered = [];
    for (let cell = 0; cell < revealed.length; cell++) if (!revealed[cell]) covered.push(cell);
    if (covered.length > 14) return;
    positions++;
    const consistent = (layout) => layout.filter(Boolean).length === view.mines
      && revealed.every((open, cell) => !open || (!layout[cell]
        && neighbors(cell).filter((n) => layout[n]).length === adjacent[cell]));
    const layouts = [];
    for (let mask = 0; mask < (1 << covered.length); mask++) {
      const layout = new Array(revealed.length).fill(false);
      covered.forEach((cell, bit) => { layout[cell] = ((mask >> bit) & 1) === 1; });
      if (consistent(layout)) layouts.push(layout);
    }
    const seen = new Set();
    for (const [entry, certificate] of Justice.certifyEntries(view, covered)) {
      if (!layouts.some((layout) => layout[entry]) || !layouts.some((layout) => !layout[entry])) {
        failure = label + ': certified a proven cell ' + entry;
        return;
      }
      for (const layout of layouts.filter((candidate) => candidate[entry])) {
        if (!validRedraw({ view }, Justice.redrawEntry(certificate, entry, layout, random), entry)) {
          failure = label + ': invalid redraw of entry ' + entry;
        }
      }
      if (seen.has(certificate)) continue;
      seen.add(certificate);
      certified++;
      const component = structure.components[structure.componentOfCell.get(entry)];
      if (component !== undefined && component.cells.length > certificate.cells.length) partOfComponent++;
      const family = members(certificate);
      const inFamily = (layout) => family.some((mined) => certificate.cells.every((cell) => layout[cell] === mined.has(cell)));
      if (!layouts.every(inFamily)) failure = label + ': a layout outside the ' + certificate.type + ' family';
      for (const layout of layouts) {
        for (const mined of family) {
          const swapped = layout.slice();
          for (const cell of certificate.cells) swapped[cell] = mined.has(cell);
          if (!consistent(swapped)) failure = label + ': a ' + certificate.type + ' member not possible';
        }
      }
      for (const observer of covered) {
        if (certificate.cells.includes(observer) || layouts.every((layout) => layout[observer])) continue;
        const counts = new Set(family.map((mined) => neighbors(observer).filter((n) => mined.has(n)).length));
        if (counts.size > 1) failure = label + ': cell ' + observer + ' could tell the group apart';
      }
    }
  };
  for (let board = 0; board < 800 && failure === null; board++) {
    const width = pick([5, 6]);
    const height = pick([5, 6]);
    const size = width * height;
    const mineTotal = pick([5, 8]);
    const mines = new Array(size).fill(false);
    for (let placed = 0; placed < mineTotal;) {
      const cell = Math.floor(random() * size);
      if (!mines[cell]) { mines[cell] = true; placed++; }
    }
    const neighbors = (cell) => Justice.neighbors(cell, width, height);
    const adjacent = mines.map((mine, cell) => (mine ? 0 : neighbors(cell).filter((n) => mines[n]).length));
    const revealed = new Array(size).fill(false);
    const open = (start) => {
      const stack = [start];
      while (stack.length > 0) {
        const cell = stack.pop();
        if (revealed[cell]) continue;
        revealed[cell] = true;
        if (adjacent[cell] === 0) stack.push(...neighbors(cell).filter((n) => !revealed[n]));
      }
    };
    const safe = [];
    for (let cell = 0; cell < size; cell++) if (!mines[cell]) safe.push(cell);
    open(safe[Math.floor(random() * safe.length)]);
    while (failure === null) {
      const view = { width, height, mines: mineTotal, revealed: revealed.slice(), adjacent };
      const structure = Justice.buildStructure(view);
      const provenSafe = [...structure.facts].filter(([cell, status]) => status === 2 && !revealed[cell]);
      if (provenSafe.length > 0) {
        for (const [cell] of provenSafe) open(cell);
        continue;
      }
      const unopened = safe.filter((cell) => !revealed[cell]);
      if (unopened.length === 0) break;
      checkPosition('board ' + board, view, structure);
      open(unopened[Math.floor(random() * unopened.length)]);
    }
  }
  check('stuck positions: every certificate holds against brute force' + (failure ? ' (' + failure + ')' : ''),
    failure === null);
  check('stuck positions: certificates found (' + certified + ' in ' + positions + ' positions)',
    certified >= 200);
  check('stuck positions: groups inside larger components certified (' + partOfComponent + ')',
    partOfComponent >= 15);
}

// 12. Chords categorically bypass Justice in the game integration. This is
// an origin rule, not something the pure cell certifier can infer.
{
  const source = require('./game-source.js').source;
  const chordBody = source.slice(
    source.indexOf('function chord('), source.indexOf('function checkWin('));
  check('chord integration: never calls Justice', !chordBody.includes('attemptJustice'));
  check('direct reveal integration: calls Justice before mine test',
    source.indexOf('attemptJustice(index)') < source.indexOf('if (cell.mine)', source.indexOf('function revealCell(')));
}

console.log(failures === 0 ? '\nall tests passed' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
