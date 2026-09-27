'use strict';
// Builds the Minesweeper problems bank (problems-bank.json at the repository
// root) from real Expert replays: moments where one newly opened number makes
// between 1 and MAX_FRESH_SAFE squares provably safe, all by single-number
// counting (class "one") or all by the same two-number pattern family.
// Spec: docs/product/problems.md.
//
// Each problem stores the board the original player saw just before opening
// the start square (mines, opened squares, flags), the start square and the
// cursor's place in it at that click, the squares the new number proves safe
// or mines ("fresh"), and what the original player did next. The full solver
// must agree that the fresh squares are exactly what the new number made
// provable, so no other deduction hides in a problem. Level statistics per
// class come from situations.js output.
//
// Usage: node problems_bank.js SITUATIONS.json OUT.json BANK_ID [--keep PREVIOUS.json] CORPUS.jsonl [...]
// --keep puts every problem of an earlier bank that still qualifies first, so
// attempts made with it keep their problems.

const fs = require('fs');
const S = require('./situations.js');

const MAX_FRESH_SAFE = 4;
const ONE_PROBLEMS = 40;
// Enough moments per family that sets rarely repeat a board: the aim is to
// learn the rule, not the particular position.
const PER_FAMILY = 40;
// A family becomes a problem class only with this many judged fresh moves in
// the corpus, so its level statistics mean something.
const MIN_FAMILY_JUDGED = 20;
// The original player's response is followed this far after the start square.
const FOLLOW_ACTIONS = 10;
const FOLLOW_MS = 10000;

function hexOf(bits) {
  let out = '';
  for (let i = 0; i < bits.length; i += 4) {
    out += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | (bits[i + 3] ? 1 : 0)).toString(16);
  }
  return out;
}

function cellsWhere(facts, value, keep) {
  return [...facts.entries()].filter(([cell, v]) => v === value && keep(cell)).map(([cell]) => cell).sort((a, b) => a - b);
}

// Applies the actions after the start square to copies of the board and
// reports what the original player did about the fresh squares.
function follow(game, k, board, freshSafe, freshMines) {
  const revealed = board.revealed.slice();
  const flagged = board.flagged.slice();
  const open = (start, opened) => {
    const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      if (revealed[c] || flagged[c]) continue;
      revealed[c] = true;
      opened.push(c);
      if (board.adjacent[c] === 0) for (const n of S.NEIGHBORS[c]) if (!revealed[n]) stack.push(n);
    }
  };
  const [t0] = game.actions[k];
  const safeLeft = new Set(freshSafe);
  let first = null;
  let doneMs = null;
  for (let j = k + 1; j < game.actions.length && j <= k + FOLLOW_ACTIONS; j++) {
    const [t, x, y, kind] = game.actions[j];
    if (t - t0 > FOLLOW_MS) break;
    const cell = y * S.W + x;
    const opened = [];
    if (kind === 'reveal') open(cell, opened);
    else if (kind === 'chord') for (const n of S.NEIGHBORS[cell]) if (!revealed[n] && !flagged[n]) open(n, opened);
    else if (kind === 'flag') flagged[cell] = true;
    else if (kind === 'unflag') flagged[cell] = false;
    // An answer aims at the fresh squares themselves: a chain opening from
    // some other square that happens to reach them is not a response.
    const answers = (kind === 'reveal' && freshSafe.includes(cell))
      || (kind === 'chord' && opened.some((c) => freshSafe.includes(c)))
      || (kind === 'flag' && freshMines.includes(cell));
    if (first === null && answers) {
      first = { cell, kind, ms: t - t0, immediate: j === k + 1 };
      if (first.immediate) {
        const moved = S.movementSplit(game.samples, 0, t0, t, [x, y]);
        if (moved.split !== null) {
          first.thinkMs = moved.split.reaction + moved.split.hover;
          first.travelMs = moved.split.travel;
        }
      }
    }
    for (const c of opened) safeLeft.delete(c);
    if (safeLeft.size === 0) {
      doneMs = t - t0;
      break;
    }
  }
  return { first, doneMs };
}

function cursorInStart(game, k) {
  const [t, x, y] = game.actions[k];
  const sample = game.samples.find((s) => s[0] === t && Math.floor(s[1]) === x && Math.floor(s[2]) === y);
  if (sample === undefined) throw new Error(`game ${game.id}: no cursor sample at the click of action ${k}`);
  return [Number((sample[1] - x).toFixed(3)), Number((sample[2] - y).toFixed(3))];
}

function candidatesOf(game, familyIds) {
  const found = [];
  S.replayGame(game, (k, action, board) => {
    const [, x, y, kind] = action;
    const start = y * S.W + x;
    if (k === 0 || kind !== 'reveal' || board.adjacent[start] === 0 || board.revealed[start]) return;
    if (board.flagged.some((f, c) => f && !board.mine[c])) return;
    const before = S.settle(board.revealed.slice(), board.adjacent);
    const revealedAfter = board.revealed.slice();
    revealedAfter[start] = true;
    const after = S.settle(revealedAfter, board.adjacent);
    const isFresh = (c) => !revealedAfter[c] && !board.flagged[c] && !before.two.has(c);
    const freshSafe = cellsWhere(after.two, 2, isFresh);
    const freshMines = cellsWhere(after.two, 1, isFresh);
    if (freshSafe.length === 0 || freshSafe.length > MAX_FRESH_SAFE) return;
    let classId;
    let pattern = null;
    if (freshSafe.every((c) => after.one.get(c) === 2)) {
      classId = 'one';
    } else if (freshSafe.every((c) => !after.one.has(c))) {
      const residual = S.residualClues(after);
      const pairs = freshSafe.map((c) => ({ cell: c, pair: S.decisivePair(residual, c, 2) }));
      if (pairs.some((p) => p.pair === null)) return;
      const families = new Set(pairs.map((p) => S.familyKey(p.pair, p.cell, 2)));
      if (families.size !== 1) return;
      const [family] = families;
      if (!familyIds.has(family)) return;
      classId = familyIds.get(family);
      pattern = S.patternKey(pairs[0].pair, pairs[0].cell, 2);
    } else {
      return;
    }
    const followed = follow(game, k, { ...board, revealed: revealedAfter }, freshSafe, freshMines);
    // Only compact facts are kept: a corpus holds tens of thousands of
    // candidate moments, and the proof states are rebuilt for chosen ones.
    found.push({
      game: { id: game.id, bv3: game.bv3, timeMs: game.timeMs }, k, start, classId, pattern, freshSafe, freshMines,
      opened: Uint8Array.from(board.revealed), flags: Uint8Array.from(board.flagged), mine: Uint8Array.from(board.mine),
      startAt: cursorInStart(game, k), original: followed,
    });
  });
  return found;
}

function exactlyFresh(candidate) {
  const mine = Array.from(candidate.mine, Boolean);
  const adjacent = mine.map((_, i) => S.NEIGHBORS[i].filter((n) => mine[n]).length);
  const revealedBefore = Array.from(candidate.opened, Boolean);
  const revealedAfter = revealedBefore.slice();
  revealedAfter[candidate.start] = true;
  const before = S.exactFacts(S.settle(revealedBefore, adjacent));
  const after = S.exactFacts(S.settle(revealedAfter, adjacent));
  if (!before.complete || !after.complete) return false;
  const covered = (c) => !revealedAfter[c] && !candidate.flags[c];
  const freshSafe = cellsWhere(after, 2, (c) => covered(c) && !before.has(c));
  const freshMines = cellsWhere(after, 1, (c) => covered(c) && !before.has(c));
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return same(freshSafe, candidate.freshSafe) && same(freshMines, candidate.freshMines);
}

function main() {
  const [situationsPath, outPath, bankId, ...rest] = process.argv.slice(2);
  if (!/^[A-Za-z0-9._-]+$/.test(bankId ?? '')) throw new Error('BANK_ID must be [A-Za-z0-9._-]+');
  const keepPath = rest[0] === '--keep' ? rest[1] : null;
  const inputs = keepPath === null ? rest : rest.slice(2);
  const kept = new Set(keepPath === null ? [] : JSON.parse(fs.readFileSync(keepPath, 'utf8')).problems.map((p) => p.id));
  const situations = JSON.parse(fs.readFileSync(situationsPath, 'utf8'));
  const levels = S.LEVEL_BANDS.map(S.bandName).filter((b) => situations.levels[b]);
  const classes = {
    one: {
      family: null,
      byLevel: Object.fromEntries(levels.map((b) => [b, {
        medianThinkMs: situations.levels[b].oneThinkMs, freshMoves: situations.levels[b].oneFresh,
      }])),
    },
  };
  // A family's key is its class id, so ids stay the same across rebuilds.
  const familyIds = new Map();
  const corpusJudged = (f) => levels.reduce((s, b) => s + f.byGroup[b].judged, 0);
  situations.families.filter((f) => f.key.includes(' safe') && corpusJudged(f) >= MIN_FAMILY_JUDGED).forEach((f) => {
    familyIds.set(f.key, f.key);
    classes[f.key] = {
      family: f.key,
      corpusMoves: f.corpusCount,
      byLevel: Object.fromEntries(levels.map((b) => [b, {
        medianThinkMs: f.byGroup[b].medianThinkMs, freshMoves: f.byGroup[b].fresh,
        fluentShare: f.byGroup[b].fluentShare, judgedMoves: f.byGroup[b].judged,
      }])),
    };
  });

  // One game parsed at a time, so only candidates outlive the scan.
  const byClass = new Map();
  let corpusGames = 0;
  for (const file of inputs) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (line === '') continue;
      const game = JSON.parse(line);
      if (game.source !== 'saolei') continue;
      corpusGames++;
      for (const c of candidatesOf(game, familyIds)) {
        if (!byClass.has(c.classId)) byClass.set(c.classId, []);
        byClass.get(c.classId).push(c);
      }
      if (corpusGames % 100 === 0) console.error(`scanned ${corpusGames} games`);
    }
  }

  const problems = [];
  for (const [classId, list] of byClass) {
    const quota = classId === 'one' ? ONE_PROBLEMS : PER_FAMILY;
    // Problems of the kept bank first, then moments the original player
    // answered at once (they carry a reference time), then faster players;
    // one problem per game per class.
    const idOf = (c) => `${c.game.id}-${c.k}`;
    list.sort((a, b) => (Number(kept.has(idOf(b))) - Number(kept.has(idOf(a))))
      || (Number(b.original.first?.immediate === true) - Number(a.original.first?.immediate === true))
      || (b.game.bv3 / b.game.timeMs - a.game.bv3 / a.game.timeMs) || (a.k - b.k));
    const usedGames = new Set();
    let taken = 0;
    for (const c of list) {
      if (taken === quota && !kept.has(idOf(c))) break;
      if (usedGames.has(c.game.id) || !exactlyFresh(c)) continue;
      usedGames.add(c.game.id);
      taken++;
      const bvs = c.game.bv3 / (c.game.timeMs / 1000);
      problems.push({
        id: `${c.game.id}-${c.k}`,
        classId,
        pattern: c.pattern,
        videoId: c.game.id,
        sourceBvs: Number(bvs.toFixed(2)),
        mines: hexOf(c.mine),
        opened: hexOf(c.opened),
        flags: hexOf(c.flags),
        start: c.start,
        startAt: c.startAt,
        freshSafe: c.freshSafe,
        freshMines: c.freshMines,
        original: c.original,
      });
    }
  }
  problems.sort((a, b) => (a.classId < b.classId ? -1 : a.classId > b.classId ? 1 : a.id < b.id ? -1 : 1));
  const used = new Set(problems.map((p) => p.classId));
  for (const id of Object.keys(classes)) if (!used.has(id)) delete classes[id];
  const bank = {
    format: 'minesweeper-problems-bank',
    formatVersion: 2,
    bankId,
    source: 'saolei.wang Expert replays, stratified by 3BV/s',
    corpusGames,
    width: S.W, height: S.H, mines: S.MINES,
    levels,
    fluentMarginMs: S.FLUENT_MARGIN_MS,
    classes,
    // Median in-game travel by move length, per level, for the pointing test.
    travelByLevel: Object.fromEntries(levels.map((b) => [b, situations.levels[b].travelByDistance])),
    problems,
  };
  fs.writeFileSync(outPath, JSON.stringify(bank) + '\n');
  const counts = {};
  for (const p of problems) counts[p.classId] = (counts[p.classId] || 0) + 1;
  const keptFound = problems.filter((p) => kept.has(p.id)).length;
  console.log(`${problems.length} problems in ${Object.keys(classes).length} classes`, counts,
    keepPath === null ? '' : `kept ${keptFound} of ${kept.size} earlier problems`);
}

main();
