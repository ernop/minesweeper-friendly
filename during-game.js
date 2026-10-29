'use strict';

// During the game: how one finished game unfolded on its own clock, the block
// "live perf charts" at the head of the game data column
// (docs/product/during-game.md). This file is the block's pure part: the row,
// chart, and event track catalog and the rows' defaults, which the settings
// schema reads on both pages; the per-game model and the rows' drawn series,
// which the analysis worker builds from the finished game's trace with the
// prover (justice.js), saved positions and square distances
// (game/evaluation.js), the hand-at-rest rule and the median
// (game/trace-metrics.js), and the replay's frame order
// (game/replay-model.js); the record's move habits and fastclick gap, which
// the worker takes from the same model; and the hover lookup the game page
// runs on those series. Rows showing a catalog measurement take its id,
// name, definition, and format from game-data.js, loaded first everywhere.

const DuringGame = (() => {
  //-------DURING THE GAME: MODEL (analysis worker)-------

  // Near: at most 2 squares away in any direction.
  const NEAR_SQUARES = 2;
  // Near the last move (creator 2026-10-26): at most 5 steps from its
  // square, a step being one square across or down (Manhattan distance).
  const NEAR_LAST_MOVE_STEPS = 5;
  // Proven-safe squares at most 2 squares apart belong to one work area.
  const AREA_LINK_SQUARES = 2;
  const LONG_GAP_MS = 1000;
  // A window needs this much play before its rates are measurable: one
  // incident over a 50 ms sliver prints a 1200/min absurdity that reads as data.
  const MIN_WINDOW_MS = 1000;
  // A flag taken off this soon after it was placed was a quick undo.
  const QUICK_UNDO_MS = 1000;
  const BOARD_CHANGING = new Set(['reveal', 'proof-open', 'chord', 'flag-place', 'flag-remove']);

  function neighborsOf(cell, width, height) {
    const x = cell % width;
    const y = (cell - x) / width;
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height) out.push(ny * width + nx);
      }
    }
    return out;
  }

  // 3BV's units on the final layout, as pregen.js board3BV counts them: each
  // zero region is one unit, solved once any of its zeros is open; each
  // number touching no zero is one unit, solved when it is open. A Justice
  // redraw keeps every visible number, so the final layout floods every
  // earlier position exactly as the game did.
  function boardUnits(width, height, mineAt) {
    const size = width * height;
    const adjacent = new Int8Array(size);
    for (let cell = 0; cell < size; cell++) {
      if (mineAt[cell]) continue;
      for (const n of neighborsOf(cell, width, height)) if (mineAt[n]) adjacent[cell]++;
    }
    const region = new Int32Array(size).fill(-1);
    let regions = 0;
    for (let cell = 0; cell < size; cell++) {
      if (mineAt[cell] || adjacent[cell] !== 0 || region[cell] !== -1) continue;
      region[cell] = regions;
      const stack = [cell];
      while (stack.length > 0) {
        for (const n of neighborsOf(stack.pop(), width, height)) {
          if (!mineAt[n] && adjacent[n] === 0 && region[n] === -1) {
            region[n] = regions;
            stack.push(n);
          }
        }
      }
      regions++;
    }
    const isolated = new Uint8Array(size);
    let isolatedCount = 0;
    for (let cell = 0; cell < size; cell++) {
      if (mineAt[cell] || adjacent[cell] === 0) continue;
      if (neighborsOf(cell, width, height).every((n) => mineAt[n] || adjacent[n] !== 0)) {
        isolated[cell] = 1;
        isolatedCount++;
      }
    }
    return { adjacent, region, regions, isolated, total: regions + isolatedCount };
  }

  // The game clock's zero in trace time. Every input after the first click
  // records both clocks at once; a game whose only action started the clock
  // began at that action.
  function clockStartT(decisions) {
    const offsets = decisions.filter((d) => d.evaluation.atMs > 0)
      .map((d) => d.t - d.evaluation.atMs).sort((a, b) => a - b);
    if (offsets.length === 0) return decisions[0].t;
    const mid = Math.floor(offsets.length / 2);
    return offsets.length % 2 === 1 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2;
  }

  // The time axis: from the clock's start to its stop or to the last action,
  // whichever is later (the record's time is rounded to the millisecond).
  function gameClock(decisions, timeMs) {
    return { startT: clockStartT(decisions),
      spanMs: Math.max(timeMs, decisions[decisions.length - 1].evaluation.atMs) };
  }

  // Cumulative cursor travel at each in-game sample, on the game clock
  // (sampleTravelPx, game/trace-metrics.js). All of the step into the first
  // sample after the clock starts counts: the move that ended there.
  function cursorPath(sampleT, travel, startT, spanMs) {
    const times = [0];
    const cumulative = [0];
    let total = 0;
    for (let i = 0; i < sampleT.length; i++) {
      const at = sampleT[i] - startT;
      if (at <= 0) continue;
      if (at > spanMs) break;
      total += travel[i];
      times.push(at);
      cumulative.push(total);
    }
    return { times, cumulative };
  }

  // The game's cursor travel, px: the record's path (`mousePathPx`) and the
  // live perf charts' whole-game path, one computation. game: { timeMs, t,
  // x, y (cursor samples), merged (the observations they replaced), events }.
  // A game without an action ended as it began, a trial whose given opening
  // opened every safe square, so the cursor traveled nowhere in it.
  function cursorTravelPx(game) {
    const decisions = pathDecisionEvents(game.events);
    if (decisions.length === 0) return 0;
    const { startT, spanMs } = gameClock(decisions, game.timeMs);
    const path = cursorPath(game.t, sampleTravelPx(game.x, game.y, game.merged), startT, spanMs);
    return path.cumulative[path.cumulative.length - 1];
  }

  // The 3BV the open squares have solved, on the layout mineAt: each zero
  // region with an open square, and each open number touching no zero, as
  // the model counts its progress. A trial's given opening (the record's
  // givenOpeningBv3) is the squares open before the first action.
  function bv3SolvedBy(width, height, mineAt, openCells) {
    const board = boardUnits(width, height, mineAt);
    const regions = new Set();
    let isolated = 0;
    for (const cell of openCells) {
      if (board.region[cell] !== -1) regions.add(board.region[cell]);
      else if (board.isolated[cell]) isolated++;
    }
    return regions.size + isolated;
  }

  // The 3BV a saved game had solved before its first action, from its trace:
  // a trial's given opening. Undefined when the trace recorded no action.
  function bv3SolvedAtStart(width, height, mineAt, events) {
    const decisions = pathDecisionEvents(events);
    if (decisions.length === 0) return undefined;
    return bv3SolvedBy(width, height, mineAt, positionNumbers(decisions[0].evaluation.position).keys());
  }

  function lastIndexAtOrBefore(sorted, value) {
    if (sorted.length === 0 || sorted[0] > value) return -1;
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sorted[mid] <= value) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Clicks that open squares, after which the player sees something new.
  const OPENING_ACTIONS = new Set(['reveal', 'proof-open', 'chord']);

  // A click that can be one of a planned pair, with the time its first
  // button went down and whether it was the only click pressed since the
  // decision before (`lefts` and `rights`: the left and right presses since
  // then, in order). A flag acts at its right press; a reveal or chord at the
  // left release, pressed at the left press before it, or at the right press
  // a two-button chord began with. Null for a flag removal, a correction
  // rather than a planned click, and for a click that changed nothing.
  function pairClickOf(evaluation, lefts, rights) {
    const action = evaluation.action;
    if (!BOARD_CHANGING.has(action) || action === 'flag-remove') return null;
    if (action === 'flag-place') {
      return { pressT: rights[rights.length - 1].t, alone: lefts.length === 0 && rights.length === 1 };
    }
    const chordRights = rights.filter((press) => press.chordGesture === true);
    return { pressT: Math.min(lefts[lefts.length - 1].t, ...chordRights.map((press) => press.t)),
      alone: lefts.length === 1 && rights.length === chordRights.length };
  }

  // Whether the cursor stood still, STROKE_GAP_MS without a sample (the hand
  // at rest, game/trace-metrics.js), at some point from fromT to toT.
  function restedBetween(sampleT, fromT, toT) {
    let lastT = fromT;
    for (let i = lastIndexAtOrBefore(sampleT, fromT) + 1; i < sampleT.length && sampleT[i] < toT; i++) {
      if (sampleT[i] - lastT >= STROKE_GAP_MS) return true;
      lastT = sampleT[i];
    }
    return toT - lastT >= STROKE_GAP_MS;
  }

  // Whether the board's proof before a pair (`facts`) held every square the
  // pair's clicks act on: the squares a reveal or chord opens safe, a flagged
  // square a mine. Null when one is unproven and the proof stopped at its
  // work limit, which leaves open whether the board proved it.
  function provenTogether(facts, evaluations) {
    let unproven = false;
    for (const evaluation of evaluations) {
      const wanted = evaluation.action === 'flag-place' ? 1 : 2;
      for (const cell of evaluation.selected) {
        const fact = facts.get(cell);
        if (fact === undefined) unproven = true;
        else if (fact !== wanted) return false;
      }
    }
    if (!unproven) return true;
    return facts.complete === true ? false : null;
  }

  // The fastclick gap's planned pairs (creator 2026-10-26: two clicks
  // "precomputed at teh same time", docs/product/per-game-stats.md): two
  // board-changing clicks in a row, neither a flag removal, on touching
  // squares (a chord's square is its number), every square they act on
  // proven before the first, nothing else pressed between them, and, after
  // a first click that opened squares, the cursor never at rest before the
  // second press. A flag shows nothing new, so the hand may hold still
  // after one. Each pair's gap runs press to press and is placed at the
  // second click. The record's fastclick gap is their median and the live
  // line plots them. Null when a pair's squares were left open by a proof
  // stopped at its work limit: an unjudged pair leaves the game unmeasured
  // rather than measured on the pairs that could be judged.
  // events: the trace's events as recorded; decisions: its decision events
  // in order (pathDecisionEvents); factsAt: the proof before each decision.
  function plannedPairsOf(events, decisions, factsAt, sampleT, width) {
    const decisionIndex = new Map(decisions.map((decision, k) => [decision, k]));
    const pairs = [];
    let judged = true;
    let previous = null;
    let lefts = [];
    let rights = [];
    for (const event of events) {
      if (event.kind === 'ldown') lefts.push(event);
      else if (event.kind === 'rdown') rights.push(event);
      if (event.kind !== 'decision' || !decisionIndex.has(event)) continue;
      const { evaluation } = event;
      const click = pairClickOf(evaluation, lefts, rights);
      lefts = [];
      rights = [];
      if (click !== null && previous !== null && click.alone
          && squareDistance(width, targetCellOf(previous.evaluation), targetCellOf(evaluation)) === 1
          && !(OPENING_ACTIONS.has(previous.evaluation.action) && restedBetween(sampleT, previous.t, click.pressT))) {
        const proven = provenTogether(factsAt[previous.k], [previous.evaluation, evaluation]);
        if (proven === null) judged = false;
        else if (proven) pairs.push({ atMs: evaluation.atMs, gapMs: click.pressT - previous.pressT });
      }
      previous = click === null ? null : { k: decisionIndex.get(event), t: event.t, pressT: click.pressT, evaluation };
    }
    return judged ? pairs : null;
  }

  function pathAt(path, atMs) {
    const i = lastIndexAtOrBefore(path.times, atMs);
    return i < 0 ? 0 : path.cumulative[i];
  }

  // Covered, unflagged squares a proof marked safe, ascending.
  function safeCellsOf(facts, flagged) {
    const cells = [];
    for (const [cell, fact] of facts) if (fact === 2 && !flagged.has(cell)) cells.push(cell);
    return cells.sort((a, b) => a - b);
  }

  // The covered, unflagged squares each deduction level is the first to
  // prove safe, and those it is the first to prove mines, by level id
  // (Justice.proveLevels). The levels that search layouts are null where the
  // search stopped at its work limit.
  function countsByLevel(proof, flagged) {
    const safe = {};
    const mines = {};
    const searched = proof.facts.complete === true;
    for (const level of Justice.DEDUCTION_LEVELS) {
      safe[level.id] = levelMeasured(level, searched) ? 0 : null;
      mines[level.id] = levelMeasured(level, searched) ? 0 : null;
    }
    for (const [cell, fact] of proof.facts) {
      if (flagged.has(cell)) continue;
      if (fact === 2) safe[proof.levelOf.get(cell)]++;
      else mines[proof.levelOf.get(cell)]++;
    }
    return { safe, mines };
  }

  // A value of the move hierarchy's rows where the board offered no such
  // move; the rows draw it as no value and say "none".
  const NO_MOVE = 'none';
  const levelMeasured = (level, searched) => searched || level.proof.exact === false;

  // One proof's facts by square for the per-action passes: `fact` (0 none,
  // 1 mine, 2 safe), `rank` (the index in Justice.DEDUCTION_LEVELS of the
  // first level proving it, which `rankOf` maps from its id), and the
  // proven-safe squares.
  function proofSquares(proof, size, rankOf) {
    const fact = new Uint8Array(size);
    const rank = new Int8Array(size);
    const safe = [];
    for (const [cell, value] of proof.facts) {
      fact[cell] = value;
      rank[cell] = rankOf.get(proof.levelOf.get(cell));
      if (value === 2) safe.push(cell);
    }
    return { complete: proof.facts.complete === true, fact, rank, safe };
  }

  // One game's positions proved, each once: its full proof by level and the
  // same by square. A proof reads only the open numbers, and within one game
  // they only grow, so the count of open squares names the position. The
  // reports worker proves the live game's positions as they arrive during
  // play, and the model reads them back after the game.
  function positionProofs() {
    const rankOf = new Map(Justice.DEDUCTION_LEVELS.map((level, rank) => [level.id, rank]));
    const byOpenCount = new Map();
    return {
      of(position) {
        const openCount = positionOpenCount(position);
        let proven = byOpenCount.get(openCount);
        if (proven === undefined) {
          const view = positionView(position);
          const proof = Justice.proveLevels(view, Justice.rawClues(view));
          proven = { proof, squares: proofSquares(proof, position.width * position.height, rankOf) };
          byOpenCount.set(openCount, proven);
        }
        return proven;
      },
    };
  }

  // The most 3BV per click a proven move offered, of each deduction level's
  // moves and of all of them (docs/product/design-axis.md, "Move
  // hierarchy", levels 2 and 3). A move opens one proven-safe square, or
  // flags an open number's unflagged proven mines and chords it when every
  // covered square beside it is proven and every flag beside it is on a
  // proven mine. Its 3BV are the units of the final layout it solves
  // (boardUnits): a zero's whole opening, or a number touching no zero; a
  // number beside a zero solves none. Its clicks count each flag it needs.
  // Its level is the hardest of the facts it uses. NO_MOVE where no square
  // could be opened by such a move; null where the proof stopped before the
  // level, and for all levels together. `squares` is proofSquares', `around`
  // each square's neighbors.
  function mostBvPerClick(squares, around, revealed, flagged, board) {
    const best = Justice.DEDUCTION_LEVELS.map(() => null);
    const consider = (rank, value) => {
      if (best[rank] === null || value > best[rank]) best[rank] = value;
    };
    const unitOf = (cell) => (board.adjacent[cell] === 0 ? board.region[cell]
      : board.isolated[cell] ? board.regions + cell : null);
    // A chord opens a square, so only an open number beside an unflagged
    // proven-safe square can be one.
    const chords = new Set();
    for (const cell of squares.safe) {
      if (flagged.has(cell)) continue;
      consider(squares.rank[cell], unitOf(cell) === null ? 0 : 1);
      for (const n of around[cell]) if (revealed[n] && board.adjacent[n] > 0) chords.add(n);
    }
    for (const numberCell of chords) {
      let hardest = 0;
      let clicks = 1;
      let proven = true;
      const units = new Set();
      for (const n of around[numberCell]) {
        if (revealed[n]) continue;
        const fact = squares.fact[n];
        if (fact === 0 || (flagged.has(n) && fact !== 1)) {
          proven = false;
          break;
        }
        hardest = Math.max(hardest, squares.rank[n]);
        if (flagged.has(n)) continue;
        if (fact === 1) clicks++;
        else if (unitOf(n) !== null) units.add(unitOf(n));
      }
      if (proven) consider(hardest, units.size / clicks);
    }
    const byLevel = {};
    Justice.DEDUCTION_LEVELS.forEach((level, rank) => {
      byLevel[level.id] = !levelMeasured(level, squares.complete) ? null : best[rank] === null ? NO_MOVE : best[rank];
    });
    const offered = best.filter((value) => value !== null);
    return { all: !squares.complete ? null : offered.length === 0 ? NO_MOVE : Math.max(...offered), byLevel };
  }

  // Steps from the last board-changing click's square to the nearest
  // covered, unflagged proven-safe square, of each deduction level and of
  // all levels, a step being one square across or down (as near the last
  // move counts). NO_MOVE where no such square was proven; null where the
  // proof stopped before the level, and for all levels together, or where
  // such squares were proven before any board-changing click.
  function stepsToSafe(squares, flagged, lastMoveCell, width) {
    const nearest = Justice.DEDUCTION_LEVELS.map(() => null);
    for (const cell of squares.safe) {
      if (flagged.has(cell)) continue;
      const rank = squares.rank[cell];
      const steps = lastMoveCell === null ? Infinity : Math.abs(cell % width - lastMoveCell % width)
        + Math.abs(Math.floor(cell / width) - Math.floor(lastMoveCell / width));
      if (nearest[rank] === null || steps < nearest[rank]) nearest[rank] = steps;
    }
    const valueOf = (steps) => (steps === null ? NO_MOVE : steps === Infinity ? null : steps);
    const byLevel = {};
    Justice.DEDUCTION_LEVELS.forEach((level, rank) => {
      byLevel[level.id] = levelMeasured(level, squares.complete) ? valueOf(nearest[rank]) : null;
    });
    const proven = nearest.filter((steps) => steps !== null);
    return { all: !squares.complete ? null : valueOf(proven.length === 0 ? null : Math.min(...proven)), byLevel };
  }

  // Open numbers a chord would open squares around safely: exactly as many
  // flags beside them as their number, every flag on a mine of the final
  // layout, and a covered square left beside them. `around` is each
  // square's neighbors.
  function chordableCount(position, around, revealed, flagged, mineAt) {
    let count = 0;
    for (const [cell, number] of positionNumbers(position)) {
      if (number === 0) continue;
      let flags = 0;
      let wrongFlag = false;
      let covered = false;
      for (const n of around[cell]) {
        if (flagged.has(n)) {
          flags++;
          if (!mineAt[n]) wrongFlag = true;
        } else if (!revealed[n]) covered = true;
      }
      if (flags === number && !wrongFlag && covered) count++;
    }
    return count;
  }

  // Work areas: proven-safe squares linked through chains of squares at most
  // AREA_LINK_SQUARES apart. Returns each cell's area index and the count.
  function areasOf(cells, width, height) {
    const index = new Map(cells.map((cell, i) => [cell, i]));
    const area = new Array(cells.length).fill(-1);
    let count = 0;
    for (let i = 0; i < cells.length; i++) {
      if (area[i] !== -1) continue;
      area[i] = count;
      const stack = [cells[i]];
      while (stack.length > 0) {
        const cell = stack.pop();
        const cx = cell % width;
        const cy = (cell - cx) / width;
        for (let dy = -AREA_LINK_SQUARES; dy <= AREA_LINK_SQUARES; dy++) {
          for (let dx = -AREA_LINK_SQUARES; dx <= AREA_LINK_SQUARES; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = index.get(ny * width + nx);
            if (j !== undefined && area[j] === -1) {
              area[j] = count;
              stack.push(cells[j]);
            }
          }
        }
      }
      count++;
    }
    return { area, count };
  }

  // Spans when the game's window was hidden or unfocused, on the game clock.
  // Before the first page-state observation the trace's initial state holds.
  function windowLeftSpans(events, initialPageState, startT, spanMs) {
    const away = (state) => !(state.hasFocus && state.visibilityState === 'visible');
    const spans = [];
    let fromT = initialPageState !== undefined && away(initialPageState) ? -Infinity : null;
    for (const event of events) {
      if (event.kind !== 'page-state') continue;
      if (away(event) && fromT === null) fromT = event.t;
      else if (!away(event) && fromT !== null) {
        spans.push([fromT, event.t]);
        fromT = null;
      }
    }
    if (fromT !== null) spans.push([fromT, Infinity]);
    return spans.map(([from, to]) => [Math.max(0, from - startT), Math.min(spanMs, to - startT)])
      .filter(([from, to]) => to > from);
  }

  function targetCellOf(evaluation) {
    if (evaluation.action === 'chord') return evaluation.triggerCell;
    return evaluation.selected.length > 0 ? evaluation.selected[0] : null;
  }

  // The record's misclick, judged as the live counter judges it
  // (Solver.isVisibleMisclick): the exact proof of the board before the
  // action already showed the action wrong.
  function misclickOf(evaluation, facts, flagged, width, height) {
    const cell = targetCellOf(evaluation);
    switch (evaluation.action) {
      case 'reveal':
      case 'proof-open':
        return facts.get(cell) === 1 ? 'opened-proven-mine' : null;
      case 'flag-place': return facts.get(cell) === 2 ? 'flagged-proven-safe' : null;
      case 'flag-remove': return facts.get(cell) === 1 ? 'removed-proven-mine-flag' : null;
      case 'chord':
        return evaluation.selected.some((opened) => facts.get(opened) === 1)
          || neighborsOf(cell, width, height).some((n) => flagged.has(n) && facts.get(n) === 2)
          ? 'chord-visible-contradiction' : null;
      default: return null;
    }
  }

  // game: { width, height, mines (the final layout), justiceEnabled (the
  // record's: whether A just universe was on; absent on games from before
  // it was recorded), timeMs, outcome, t, x, y (cursor samples), merged (the
  // observations they replaced), events, initialPageState, proofs
  // (positionProofs' for this game) }. The time axis is gameClock's.
  function model(game) {
    const { width, height } = game;
    const size = width * height;
    const decisions = pathDecisionEvents(game.events);
    if (decisions.length === 0) return { recorded: false };
    const last = decisions.length - 1;
    const { startT, spanMs } = gameClock(decisions, game.timeMs);
    const mineAt = game.mines;
    const mineCount = mineAt.reduce((count, mine) => count + (mine ? 1 : 0), 0);
    const board = boardUnits(width, height, mineAt);
    const path = cursorPath(game.t, sampleTravelPx(game.x, game.y, game.merged), startT, spanMs);
    // Traces from before capture version 1 recorded no page states at all.
    const windowLeft = game.initialPageState === undefined ? null
      : windowLeftSpans(game.events, game.initialPageState, startT, spanMs);

    // Pass 1: what each action changed, and what the board proved before it.
    const revealed = new Uint8Array(size);
    for (const cell of positionNumbers(decisions[0].evaluation.position).keys()) revealed[cell] = 1;
    const solvedRegion = new Uint8Array(board.regions);
    let solved = 0;
    let opened = 0;
    const open = (cell) => {
      revealed[cell] = 1;
      opened++;
      if (board.region[cell] !== -1) {
        if (solvedRegion[board.region[cell]] === 0) {
          solvedRegion[board.region[cell]] = 1;
          solved++;
        }
      } else if (board.isolated[cell]) solved++;
    };
    for (let cell = 0; cell < size; cell++) if (revealed[cell]) open(cell);
    const solvedAtStart = solved;
    const openedAtStart = opened;
    const flaggedMinesOf = (position) => [...positionFlags(position)].filter((cell) => mineAt[cell]).length;
    const progress = { startMs: [0], solved: [solved], opened: [opened],
      flaggedMines: [flaggedMinesOf(decisions[0].evaluation.position)] };
    // What the board offered before each action: the squares proved safe
    // (`safe`) and mines (`mines`), and those by the first deduction level
    // that proves them, all covered and unflagged; the proven-safe squares'
    // work areas and list; the mines counting proves near the last
    // board-changing action; the chordable numbers; and of all levels and
    // of each, the most 3BV per click of a proven move and the steps from
    // the last board-changing action to the nearest proven-safe square.
    const levelLists = () => Object.fromEntries(Justice.DEDUCTION_LEVELS.map((level) => [level.id, []]));
    const known = { startMs: [], safe: [], mines: [], safeByLevel: levelLists(), minesByLevel: levelLists(),
      areas: [], safeCells: [], minesByCountingNearLastMove: [], chordableNumbers: [],
      mostBvPerClick: [], mostBvPerClickByLevel: levelLists(), stepsToSafe: [], stepsToSafeByLevel: levelLists() };
    const factsAt = [];
    const levelsAt = [];
    const changedBy = [];
    const around = Array.from({ length: size }, (_, cell) => neighborsOf(cell, width, height));
    let lastMoveCell = null;
    for (let k = 0; k <= last; k++) {
      const evaluation = decisions[k].evaluation;
      const position = evaluation.position;
      // The full proof's facts, each with the first deduction level proving it.
      const { proof, squares } = game.proofs.of(position);
      const full = proof.facts;
      const flagged = positionFlags(position);
      const safeAll = safeCellsOf(full, flagged);
      const complete = full.complete === true;
      factsAt.push(full);
      levelsAt.push(proof.levelOf);
      known.startMs.push(k === 0 ? 0 : decisions[k - 1].evaluation.atMs);
      known.safe.push(complete ? safeAll.length : null);
      let mines = 0;
      for (const [cell, fact] of full) if (fact === 1 && !flagged.has(cell)) mines++;
      known.mines.push(complete ? mines : null);
      const byLevel = countsByLevel(proof, flagged);
      for (const level of Justice.DEDUCTION_LEVELS) {
        known.safeByLevel[level.id].push(byLevel.safe[level.id]);
        known.minesByLevel[level.id].push(byLevel.mines[level.id]);
      }
      known.areas.push(complete ? areasOf(safeAll, width, height).count : null);
      known.safeCells.push(complete ? safeAll : null);
      let nearLastMove = null;
      if (lastMoveCell !== null) {
        const lx = lastMoveCell % width;
        const ly = (lastMoveCell - lx) / width;
        nearLastMove = 0;
        for (const [cell, fact] of full) {
          if (fact !== 1 || flagged.has(cell) || proof.levelOf.get(cell) !== 'counting') continue;
          const cx = cell % width;
          if (Math.abs(cx - lx) + Math.abs((cell - cx) / width - ly) <= NEAR_LAST_MOVE_STEPS) nearLastMove++;
        }
      }
      known.minesByCountingNearLastMove.push(nearLastMove);
      known.chordableNumbers.push(chordableCount(position, around, revealed, flagged, mineAt));
      const useful = mostBvPerClick(squares, around, revealed, flagged, board);
      const reach = stepsToSafe(squares, flagged, lastMoveCell, width);
      known.mostBvPerClick.push(useful.all);
      known.stepsToSafe.push(reach.all);
      for (const level of Justice.DEDUCTION_LEVELS) {
        known.mostBvPerClickByLevel[level.id].push(useful.byLevel[level.id]);
        known.stepsToSafeByLevel[level.id].push(reach.byLevel[level.id]);
      }
      if (BOARD_CHANGING.has(evaluation.action)) lastMoveCell = targetCellOf(evaluation);
      // The squares this action opened: the next frame's new squares; a win
      // opens every square still covered, a death none.
      const changed = [];
      if (k < last) {
        for (const cell of positionNumbers(decisions[k + 1].evaluation.position).keys()) {
          if (!revealed[cell]) changed.push(cell);
        }
      } else if (game.outcome === 'win') {
        for (let cell = 0; cell < size; cell++) if (!revealed[cell] && !mineAt[cell]) changed.push(cell);
      }
      for (const cell of changed) open(cell);
      changedBy.push(changed);
      progress.startMs.push(evaluation.atMs);
      progress.solved.push(solved);
      progress.opened.push(opened);
      progress.flaggedMines.push(k < last ? flaggedMinesOf(decisions[k + 1].evaluation.position)
        : progress.flaggedMines[k]
          + (evaluation.action === 'flag-place' && mineAt[evaluation.selected[0]] ? 1 : 0)
          - (evaluation.action === 'flag-remove' && mineAt[evaluation.selected[0]] ? 1 : 0));
    }

    // Pass 2: each action's timing, travel, and what kind of move it was.
    const zoneStamp = new Int32Array(size);
    const markZone = (stamp, cells) => {
      for (const cell of cells) {
        const cx = cell % width;
        const cy = (cell - cx) / width;
        for (let dy = -NEAR_SQUARES; dy <= NEAR_SQUARES; dy++) {
          for (let dx = -NEAR_SQUARES; dx <= NEAR_SQUARES; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) zoneStamp[ny * width + nx] = stamp;
          }
        }
      }
    };
    const actions = [];
    const events = [];
    // Every press on the game clock with its gap from the press before, as
    // the trace's cadence counts presses (cadence spread).
    const presses = [];
    let pressT = null;
    for (const event of game.events) {
      if (event.kind !== 'ldown' && event.kind !== 'rdown') continue;
      if (pressT !== null) presses.push({ atMs: event.t - startT, value: event.t - pressT });
      pressT = event.t;
    }
    const flagPlacedAt = new Map();
    let previous = null;
    let leftBehind = [];
    let noOpsSince = 0;
    // Whether every move's kind and fork were judged on a complete proof.
    let movesJudged = true;
    // What a guess chose among (docs/product/design-axis.md, "Move
    // hierarchy", levels 5 and 6): whether its square was connected (beside
    // an open number); where the guess ledger measured the guess, the lowest
    // mine risk of a connected and of an unconnected unproven square; where
    // the mines were also fixed, perfect play's chance to win after opening
    // the guessed square and at best (Odds.winChances), or that the exact
    // search stopped at its work limit; and where nothing else could ever
    // settle the guess (Justice's sealed pockets), since when that had held
    // without a break, which the walk back reads from the proofs of pass 1.
    // The ledger measures only modes whose mines never move unless A just
    // universe moves them (guessLedgerAppliesToMode).
    const guessFacts = (k, cell) => {
      const evaluation = decisions[k].evaluation;
      const view = positionView(evaluation.position);
      const structure = Justice.buildStructure(view, undefined, factsAt[k]);
      const facts = { connected: structure.frontierSet.has(cell) };
      if (evaluation.evidence.oddsMeasured === true) {
        const odds = Odds.analyzeView(view, { structure });
        let connected = Infinity;
        let unconnected = Infinity;
        for (const square of odds.unproven) {
          if (structure.frontierSet.has(square)) connected = Math.min(connected, odds.pMine[square]);
          else unconnected = Math.min(unconnected, odds.pMine[square]);
        }
        if (connected !== Infinity) facts.safestConnectedRisk = connected;
        if (unconnected !== Infinity) facts.safestUnconnectedRisk = unconnected;
        if (game.justiceEnabled === false) {
          facts.minesFixed = true;
          const chances = Odds.winChances(view, odds, cell);
          facts.winMeasured = chances.measured;
          if (chances.measured) {
            facts.winChance = chances.chosenWins / chances.layouts;
            facts.bestWinChance = chances.bestWins / chances.layouts;
          }
        }
      }
      if (factsAt[k].complete === true && Justice.certifyEntries(view, [cell], structure).has(cell)) {
        facts.unavoidable = true;
        let since = k;
        while (since > 0) {
          const before = factsAt[since - 1];
          if (before !== factsAt[since]) {
            if (before.complete !== true) return facts;
            const earlier = positionView(decisions[since - 1].evaluation.position);
            if (!Justice.certifyEntries(earlier, [cell], Justice.buildStructure(earlier, undefined, before)).has(cell)) break;
          }
          since--;
        }
        facts.waitedMs = evaluation.atMs - known.startMs[since];
      }
      return facts;
    };
    for (let k = 0; k <= last; k++) {
      const decision = decisions[k];
      const evaluation = decision.evaluation;
      const evidence = evaluation.evidence;
      const atMs = evaluation.atMs;
      const cell = targetCellOf(evaluation);
      const changes = BOARD_CHANGING.has(evaluation.action);
      const flagged = positionFlags(evaluation.position);
      const action = { atMs, kind: evaluation.action, cell, changes, opened: changedBy[k].length,
        solved: progress.solved[k + 1] - progress.solved[k], result: evaluation.result,
        category: actionEvaluationCategory(evaluation) };
      // The magnitudes the record's action summary sums (actionCategorySummary).
      if (action.category === 'gameRisk') action.riskDelta = evaluationRiskDelta(evaluation) || 0;
      if (evaluation.mistakes.includes('chose-lower-modeled-life')) action.lifeGap = evaluationLifeGap(evaluation) || 0;
      const at = (type, facts = {}) => events.push({ type, atMs, action: k, ...facts });
      if (evaluation.action === 'no-op') {
        noOpsSince++;
        at('no-op', { reason: evidence.reason, cell });
      }
      const misclick = misclickOf(evaluation, factsAt[k], flagged, width, height);
      if (misclick !== null) at('misclick', { mistake: misclick, cell });
      if ((evaluation.action === 'reveal' || evaluation.action === 'proof-open')
          && evidence.knowledge === 'uncertain' && evidence.firstReveal !== true) {
        action.guess = true;
        at('guess', { cell, safeAvailable: evidence.safeAvailable === true, died: evaluation.result === 'death',
          ...(typeof evidence.chosenRisk === 'number' ? { risk: evidence.chosenRisk } : {}),
          ...(typeof evidence.bestRisk === 'number' ? { bestRisk: evidence.bestRisk } : {}),
          ...guessFacts(k, cell) });
      }
      if (changedBy[k].some((square) => board.adjacent[square] === 0)) at('opening', { cell, opened: action.opened });
      if (evaluation.action === 'flag-place') {
        flagPlacedAt.set(cell, atMs);
        if (!mineAt[cell]) at('wrong-flag', { cell });
        if (evaluation.mistakes.includes('unused-correct-flag')) {
          at('unused-flag', { cell, removed: evidence.unusedFlagEndedBy === 'flag-removed' });
        }
      }
      if (evaluation.action === 'flag-remove') {
        const placedAt = flagPlacedAt.get(cell);
        flagPlacedAt.delete(cell);
        at('flag-removed', { cell, ...(placedAt === undefined ? {}
          : { stoodMs: atMs - placedAt, quickUndo: atMs - placedAt <= QUICK_UNDO_MS }) });
      }
      if (changes) {
        action.pathPx = pathAt(path, atMs) - (previous === null ? 0 : pathAt(path, previous.atMs));
        if (previous !== null) {
          action.gapMs = atMs - previous.atMs;
          action.squares = squareDistance(width, previous.cell, cell);
          const safe = known.safeCells[k];
          const near = (square) => zoneStamp[square] === previous.stamp;
          // Proven-safe squares near the previous action. A proof stopped at
          // its work limit still proves every square it marked.
          const nearSafe = (safe !== null ? safe : safeCellsOf(factsAt[k], flagged)).filter(near);
          if (action.gapMs >= LONG_GAP_MS) {
            events.push({ type: 'long-gap', atMs: previous.atMs, endMs: atMs, action: k,
              known: known.safe[k], countingKnown: known.safeByLevel.counting[k],
              ...(safe === null ? {} : { nearKnown: nearSafe.length, safeCells: safe }),
              endedBy: evaluation.action, guess: action.guess === true, noOps: noOpsSince,
              ...(windowLeft === null ? {}
                : { windowLeft: windowLeft.some(([from, to]) => from < atMs && to > previous.atMs) }) });
          }
          const continuing = nearSafe.some((square) => squareDistance(width, cell, square) <= NEAR_SQUARES);
          const moved = !near(cell) && !continuing;
          if (moved && safe === null) movesJudged = false;
          if (moved && (nearSafe.length > 0 || safe !== null)) {
            // A move: away from everything the previous board-changing
            // action touched and from the proven-safe squares near it. Moved
            // on once none such remained; left work while some did: easy
            // work when counting a single number proved one of them, hard
            // work when only combining numbers did. Counting's facts come
            // before any search, so a proof stopped at its work limit still
            // tells the two apart.
            const facts = { cell, fromCell: previous.cell, squares: action.squares, gapMs: action.gapMs,
              guess: action.guess === true };
            let areas = null;
            if (safe !== null && safe.length > 0) {
              areas = areasOf(safe, width, height);
              let nearest = Infinity;
              for (const square of safe) nearest = Math.min(nearest, squareDistance(width, previous.cell, square));
              let target = -1;
              let targetDistance = Infinity;
              safe.forEach((square, i) => {
                const distance = squareDistance(width, cell, square);
                if (distance <= NEAR_SQUARES && distance < targetDistance) {
                  targetDistance = distance;
                  target = areas.area[i];
                }
              });
              facts.areas = areas.count;
              facts.nearestSafeSquares = nearest;
              facts.toArea = target !== -1;
              if (target !== -1) {
                facts.toNearestArea = safe.some((square, i) => areas.area[i] === target
                  && squareDistance(width, previous.cell, square) === nearest);
              }
            } else if (safe !== null) facts.areas = 0;
            if (nearSafe.length > 0) {
              const byCounting = nearSafe.filter((square) => levelsAt[k].get(square) === 'counting').length;
              at(byCounting > 0 ? 'left-easy-work' : 'left-hard-work',
                { ...facts, leftSafe: nearSafe.length, leftByCounting: byCounting, safeCells: nearSafe });
              leftBehind.push({ atMs, cells: nearSafe });
            } else at('moved-on', facts);
            if (areas !== null && areas.count >= 2) at('fork', { ...facts, safeCells: safe });
            leftBehind = leftBehind.filter((item) => {
              const remaining = item.cells.filter((square) => factsAt[k].get(square) === 2 && !flagged.has(square));
              if (remaining.length === 0) return false;
              if (item.atMs < atMs && remaining.some((square) => squareDistance(width, cell, square) <= NEAR_SQUARES)) {
                at('came-back', { cell, awayMs: atMs - item.atMs });
                return false;
              }
              item.cells = remaining;
              return true;
            });
          }
        }
        markZone(k + 1, cell === null ? changedBy[k] : [cell, ...changedBy[k]]);
        previous = { atMs, cell, stamp: k + 1 };
        noOpsSince = 0;
      }
      actions.push(action);
    }
    for (const [from, to] of windowLeft || []) events.push({ type: 'window-left', atMs: from, endMs: to });
    events.sort((a, b) => a.atMs - b.atMs);
    return {
      recorded: true, timeMs: spanMs, recordTimeMs: game.timeMs, outcome: game.outcome, width, height, mines: mineCount,
      pageStateRecorded: windowLeft !== null,
      categoriesMeasured: actions.every((action) => action.category !== 'measurementNotes'),
      movesJudged,
      bv3: { total: board.total, atStart: solvedAtStart },
      safe: { total: size - mineCount, atStart: openedAtStart },
      actions, presses, plannedPairs: plannedPairsOf(game.events, decisions, factsAt, game.t, width),
      progress, known, path, events,
    };
  }

  //-------DURING THE GAME: MOVE HABITS (the record's per-game summary)-------

  const MOVE_TYPES = new Set(['moved-on', 'left-hard-work', 'left-easy-work']);

  // The game's moves as the record stores them (game/history.js): how many
  // of each kind, the median time before one, and the forks and how many
  // went to the nearest place. Nothing where a proof stopped at its work
  // limit at a move, which leaves that move's kind or fork unknown.
  function moveHabits(m) {
    if (!m.recorded || !m.movesJudged) return {};
    const moves = m.events.filter((event) => MOVE_TYPES.has(event.type));
    const counted = (type) => moves.filter((event) => event.type === type).length;
    const forks = m.events.filter((event) => event.type === 'fork');
    return {
      movesMovedOn: counted('moved-on'),
      movesLeftHardWork: counted('left-hard-work'),
      movesLeftEasyWork: counted('left-easy-work'),
      ...(moves.length > 0 ? { moveGapMedianMs: medianOf(moves.map((event) => event.gapMs)) } : {}),
      forkMoves: forks.length,
      forkMovesToNearestArea: forks.filter((event) => event.toNearestArea === true).length,
    };
  }

  // The record's fastclick gap (game/history.js): the definition it was
  // measured under, and the median of the planned pairs' gaps, which is
  // absent where the game had no planned pair or one went unjudged.
  function fastclickGap(m) {
    if (!m.recorded) return {};
    const gaps = m.plannedPairs === null ? [] : m.plannedPairs.map((pair) => pair.gapMs);
    return { fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION,
      ...(gaps.length > 0 ? { fastclickGapMs: Math.round(medianOf(gaps)) } : {}) };
  }

  //-------DURING THE GAME: ROWS (catalog, per-row data)-------

  const GROUPS = [
    ['progress', 'progress'],
    ['moves', 'moves available'],
    ['moveQuality', 'move usefulness and distance'],
    ['pace', 'pace'],
    ['board', 'board'],
    ['report', 'report categories'],
    ['events', 'events'],
  ];

  // Three charts. Progress plots shares of the board on a fixed 0 to 1
  // scale. Moves available plots raw counts (creator 2026-10-26: "a raw
  // numerical counter") of the moves the board offered, all counted in
  // squares or numbers. Every other line shares one chart (creator
  // 2026-10-20: combine the solitary line charts) on a scale of each line
  // against its own whole-game value, since their units differ. Event rows
  // are marks on the event tracks.
  const CHARTS = [
    { id: 'progress', name: 'progress', scale: 'share' },
    { id: 'moves', name: 'moves available', scale: 'count' },
    { id: 'relative', name: 'against the whole game', scale: 'relative' },
  ];
  // The relative chart's scale (creator 2026-10-21: toggle between log and
  // linear, with one checkbox): doublings either side of 1x by default, or
  // linear from 0.
  const RELATIVE_SCALES = ['log', 'linear'];
  const DEFAULT_RELATIVE_SCALE = 'log';
  // The event tracks (creator 2026-10-20: a compact, meaningful display in
  // place of one lane per event row), by what the events are about: clicks
  // that changed nothing, went against the proof, or risked a mine; jumps,
  // where the next click went; and pauses, time without a click.
  const TRACKS = [
    ['clicks', 'clicks'],
    ['jumps', 'jumps'],
    ['pauses', 'pauses'],
  ];

  const changingActions = (m) => m.actions.filter((a) => a.changes);
  const progressSteps = (m, counts, total, atStart) => ({
    kind: 'progress',
    steps: m.progress.startMs.map((atMs, i) => ({ atMs, value: (counts[i] - atStart) / (total - atStart) })),
  });
  // A move hierarchy row's moment with no such move has no value and says so.
  const stateSteps = (m, values) => ({ kind: 'state', steps: m.known.startMs.map((atMs, i) =>
    (values[i] === NO_MOVE ? { atMs, value: null, none: true } : { atMs, value: values[i] })) });
  const eventsOf = (type) => (m) => ({ kind: 'events', events: m.events.filter((e) => e.type === type) });
  // A report category's actions per minute, each weighing `weight`; a game
  // with any action filed under measurement notes has no measured counts.
  const categoryRate = (test, weight) => (m) => (m.categoriesMeasured ? { kind: 'rate', perMs: 60000,
    incidents: m.actions.filter(test).map((a) => ({ atMs: a.atMs, weight: weight(a) })) } : { kind: 'unrecorded' });
  // A row showing a catalog measurement takes its id, name, definition, and
  // format from the catalog (GameData.metrics), so its line and game summary
  // perf name and define the same thing.
  const measurementRow = (id, row) => {
    const metric = GameData.metrics.find((item) => item.id === id);
    if (metric === undefined) throw new Error('during the game: unknown measurement ' + id);
    return { ...row, id, name: metric.name, help: metric.help, format: metric.format, measurements: [id] };
  };
  const percent = (value) => Math.round(value * 100) + '%';
  const ms = (value) => Math.round(value) + 'ms';
  const decimal1 = (value) => (Math.round(value * 10) / 10).toFixed(1);
  const decimal2 = (value) => value.toFixed(2);
  const integer = (value) => String(value);
  // A count at a moment, or its average over time to a tenth.
  const count = (value) => (Number.isInteger(value) ? integer(value) : decimal1(value));

  // Each row: id, group, name, default, help, format, data(model), and its
  // chart and line color (unique among the rows of its chart) or, for an
  // event row, its track and its mark's shape and color (each shape unique
  // within its track; spans are a band or a bar). The data's kind says how
  // the row draws and averages:
  //   progress  cumulative share of the board, a step per action
  //   state     what the board offered before each action
  //   rate      incidents (weighted) per unit of time
  //   ratio     incidents' numerator sum over their denominator sum
  //   value     one measured value per incident, averaged by `aggregate`
  //   spread    gaps whose spread over their median the row shows
  //   speed     cursor travel over time
  //   events    detected events, at an instant or over a span
  //   unrecorded  not measured for this game: the trace did not record what
  //               the row needs, or a proof it needs stopped at its work limit
  // A row's `measurements` are the catalog measurements it shows: a
  // measurement row's own, or for an event row those computed over exactly
  // its events (their count, the share they are of a whole, or a statistic
  // of them). Hovering the row and hovering one of their game summary perf
  // rows spotlight each other.
  const ROWS = [
    { id: 'bv3Solved', group: 'progress', name: '3BV solved', default: true, format: percent,
      chart: 'progress', color: '#1565c0',
      help: 'How much of the board\u2019s 3BV was done by each moment. An opening counts once, when any of its zeros opens; a number touching no opening counts when it opens.',
      data: (m) => progressSteps(m, m.progress.solved, m.bv3.total, m.bv3.atStart) },
    { id: 'safeOpened', group: 'progress', name: 'squares opened', default: true, format: percent,
      chart: 'progress', color: '#2e7d32',
      help: 'How many of the board\u2019s safe squares were open by each moment.',
      data: (m) => progressSteps(m, m.progress.opened, m.safe.total, m.safe.atStart) },
    { id: 'minesFlagged', group: 'progress', name: 'mines flagged', default: true, format: percent,
      chart: 'progress', color: '#c2185b',
      help: 'How many of the board\u2019s mines had a flag at each moment. Flags on safe squares do not count.',
      data: (m) => progressSteps(m, m.progress.flaggedMines, m.mines, 0) },
    // Moves available (creator 2026-10-26), counted between clicks on
    // covered, unflagged squares. Each by-level row counts what its
    // deduction level is the first to prove (docs/product/design-axis.md,
    // "Deduction levels"), so the four safe rows by level add up to the safe
    // squares known, and the four mine rows to the mines known.
    { id: 'safeKnown', group: 'moves', name: 'safe squares known', default: true, format: count,
      chart: 'moves', color: '#00897b',
      help: 'Covered squares the visible board had proved safe, between your clicks. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.safe) },
    { id: 'safeByCounting', group: 'moves', name: 'safe by counting', default: false, format: count,
      chart: 'moves', color: '#7cb342',
      help: 'The safe squares known that counting single numbers proves, one number at a time, the quickest kind to see. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.safeByLevel.counting) },
    { id: 'safeByOverlap', group: 'moves', name: 'safe by overlap', default: false, format: count,
      chart: 'moves', color: '#1b5e20',
      help: 'The safe squares known that comparing two numbers whose covered squares overlap proves and counting does not, as a 1 2 2 1 row proves the squares facing its 1s safe. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.safeByLevel.overlap) },
    { id: 'safeByAllNumbers', group: 'moves', name: 'safe by all numbers', default: false, format: count,
      chart: 'moves', color: '#9e9d24',
      help: 'The safe squares known that only the numbers taken all together prove: every way of placing mines that fits every number leaves them safe, though no two numbers compared show it. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.safeByLevel.allNumbers) },
    { id: 'safeByMineTotal', group: 'moves', name: 'safe by the mine total', default: false, format: count,
      chart: 'moves', color: '#00acc1',
      help: 'The safe squares known that only the board\u2019s mine count proves: the numbers allow layouts with different numbers of mines, and the mines left rule some of them out. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.safeByLevel.mineTotal) },
    { id: 'minesKnown', group: 'moves', name: 'mines known', default: false, format: count,
      chart: 'moves', color: '#b71c1c',
      help: 'Covered, unflagged squares the visible board had proved to be mines, between your clicks. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.mines) },
    { id: 'minesByCounting', group: 'moves', name: 'mines by counting', default: true, format: count,
      chart: 'moves', color: '#e53935',
      help: 'The mines known that counting single numbers proves, one number at a time, as a 2 with only two covered squares beside it. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.minesByLevel.counting) },
    { id: 'minesByCountingNearLastMove', group: 'moves', name: 'mines by counting near the last move', default: true,
      format: count, chart: 'moves', color: '#ef6c00',
      help: 'The mines by counting at most 5 steps from your last board-changing click, a step being one square across or down; none before the first. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.minesByCountingNearLastMove) },
    { id: 'minesByOverlap', group: 'moves', name: 'mines by overlap', default: false, format: count,
      chart: 'moves', color: '#8e24aa',
      help: 'The mines known that comparing two numbers whose covered squares overlap proves and counting does not, as a 1 2 2 1 row proves mines in the squares facing its 2s. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.minesByLevel.overlap) },
    { id: 'minesByAllNumbers', group: 'moves', name: 'mines by all numbers', default: false, format: count,
      chart: 'moves', color: '#5d4037',
      help: 'The mines known that only the numbers taken all together prove: every way of placing mines that fits every number puts a mine there, though no two numbers compared show it. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.minesByLevel.allNumbers) },
    { id: 'minesByMineTotal', group: 'moves', name: 'mines by the mine total', default: false, format: count,
      chart: 'moves', color: '#ad1457',
      help: 'The mines known that only the board\u2019s mine count proves: the numbers allow layouts with different numbers of mines, and the mines left rule some of them out. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.minesByLevel.mineTotal) },
    { id: 'chordableNumbers', group: 'moves', name: 'chordable numbers', default: true, format: count,
      chart: 'moves', color: '#1565c0',
      help: 'Open numbers ready for a chord: as many flags beside them as their number, every flag on a mine, and a covered square still beside them for the chord to open. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.chordableNumbers) },
    // The move hierarchy's proven moves (creator 2026-10-26,
    // docs/product/design-axis.md, "Move hierarchy"): how useful the best
    // was and how far the nearest was from the last move, of all deduction
    // levels and of each. Their units are not counts, so they draw on the
    // relative chart.
    { id: 'mostBvPerClick', group: 'moveQuality', name: 'most 3BV per click', default: true, format: decimal2,
      chart: 'relative', color: '#00897b',
      help: 'The most 3BV one proven move solved per click, between your clicks: opening a proven-safe square, or flagging an open number\u2019s unflagged proven mines and chording it. Opening a zero solves its opening, 1 3BV, as does opening a number touching no zero; a number beside a zero solves none. Each flag is a click. None when no proven move opened a square. The game value is the average over the time one did.',
      data: (m) => stateSteps(m, m.known.mostBvPerClick) },
    { id: 'mostBvPerClickByCounting', group: 'moveQuality', name: 'most 3BV per click by counting', default: false, format: decimal2,
      chart: 'relative', color: '#7cb342',
      help: 'The most 3BV per click of the proven moves whose every fact counting a single number proves. A move\u2019s level is the hardest of the facts it uses. None when there was no such move. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.mostBvPerClickByLevel.counting) },
    { id: 'mostBvPerClickByOverlap', group: 'moveQuality', name: 'most 3BV per click by overlap', default: false, format: decimal2,
      chart: 'relative', color: '#33691e',
      help: 'The most 3BV per click of the proven moves whose hardest fact comparing two numbers whose covered squares overlap proves, and counting does not. None when there was no such move. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.mostBvPerClickByLevel.overlap) },
    { id: 'mostBvPerClickByAllNumbers', group: 'moveQuality', name: 'most 3BV per click by all numbers', default: false, format: decimal2,
      chart: 'relative', color: '#827717',
      help: 'The most 3BV per click of the proven moves whose hardest fact only the numbers taken all together prove. None when there was no such move. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.mostBvPerClickByLevel.allNumbers) },
    { id: 'mostBvPerClickByMineTotal', group: 'moveQuality', name: 'most 3BV per click by the mine total', default: false, format: decimal2,
      chart: 'relative', color: '#0097a7',
      help: 'The most 3BV per click of the proven moves whose hardest fact only the board\u2019s mine count proves. None when there was no such move. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.mostBvPerClickByLevel.mineTotal) },
    { id: 'stepsToSafe', group: 'moveQuality', name: 'steps to the nearest safe square', default: true, format: count,
      chart: 'relative', color: '#5e35b1',
      help: 'How far the nearest covered square proved safe was from your last board-changing click, between your clicks, a step being one square across or down. None when no square was proven safe. The game value is the average over the time one was.',
      data: (m) => stateSteps(m, m.known.stepsToSafe) },
    { id: 'stepsToSafeByCounting', group: 'moveQuality', name: 'steps to the nearest safe by counting', default: false, format: count,
      chart: 'relative', color: '#8e24aa',
      help: 'How far the nearest square counting a single number proves safe was from your last board-changing click, in steps across or down. None when there was no such square. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.stepsToSafeByLevel.counting) },
    { id: 'stepsToSafeByOverlap', group: 'moveQuality', name: 'steps to the nearest safe by overlap', default: false, format: count,
      chart: 'relative', color: '#3949ab',
      help: 'How far the nearest square that comparing two overlapping numbers proves safe, and counting does not, was from your last board-changing click, in steps across or down. None when there was no such square. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.stepsToSafeByLevel.overlap) },
    { id: 'stepsToSafeByAllNumbers', group: 'moveQuality', name: 'steps to the nearest safe by all numbers', default: false, format: count,
      chart: 'relative', color: '#6d4c41',
      help: 'How far the nearest square only the numbers taken all together prove safe was from your last board-changing click, in steps across or down. None when there was no such square. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.stepsToSafeByLevel.allNumbers) },
    { id: 'stepsToSafeByMineTotal', group: 'moveQuality', name: 'steps to the nearest safe by the mine total', default: false, format: count,
      chart: 'relative', color: '#d81b60',
      help: 'How far the nearest square only the board\u2019s mine count proves safe was from your last board-changing click, in steps across or down. None when there was no such square. The game value is the average over the time there was one.',
      data: (m) => stateSteps(m, m.known.stepsToSafeByLevel.mineTotal) },
    measurementRow('bvPerSecond', { group: 'pace', default: true, chart: 'relative', color: '#2e7d32',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: m.actions.filter((a) => a.solved > 0).map((a) => ({ atMs: a.atMs, weight: a.solved })) }) }),
    measurementRow('clickRate', { group: 'pace', default: true, chart: 'relative', color: '#1565c0',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: changingActions(m).map((a) => ({ atMs: a.atMs, weight: 1 })) }) }),
    { id: 'actionGap', group: 'pace', name: 'action gaps', default: true, format: ms,
      chart: 'relative', color: '#546e7a',
      help: 'The time from one board-changing click to the next; averages take the median.',
      data: (m) => ({ kind: 'value', aggregate: 'median',
        incidents: changingActions(m).filter((a) => a.gapMs !== undefined).map((a) => ({ atMs: a.atMs, value: a.gapMs })) }) },
    measurementRow('fastclickGap', { group: 'pace', default: true, chart: 'relative', color: '#ef6c00',
      data: (m) => (m.plannedPairs === null ? { kind: 'unrecorded' } : { kind: 'value', aggregate: 'median',
        incidents: m.plannedPairs.map((pair) => ({ atMs: pair.atMs, value: pair.gapMs })) }) }),
    measurementRow('mouseSpeed', { group: 'pace', default: true, chart: 'relative', color: '#6a1b9a',
      data: (m) => ({ kind: 'speed', path: m.path,
        incidents: changingActions(m).filter((a) => a.gapMs > 0)
          .map((a) => ({ atMs: a.atMs, value: a.pathPx * 1000 / a.gapMs })) }) }),
    measurementRow('efficiency', { group: 'pace', default: false, chart: 'relative', color: '#9e9d24',
      data: (m) => ({ kind: 'ratio', incidents: changingActions(m).map((a) => ({ atMs: a.atMs, num: a.solved, den: 1 })) }) }),
    measurementRow('boardChangingClickShare', { group: 'pace', default: false, chart: 'relative', color: '#283593',
      data: (m) => ({ kind: 'ratio', incidents: m.actions.map((a) => ({ atMs: a.atMs, num: a.changes ? 1 : 0, den: 1 })) }) }),
    measurementRow('ioe', { group: 'pace', default: false, chart: 'relative', color: '#ad1457',
      data: (m) => ({ kind: 'ratio', incidents: m.actions.map((a) => ({ atMs: a.atMs, num: a.solved, den: 1 })) }) }),
    measurementRow('noopRate', { group: 'pace', default: false, chart: 'relative', color: '#c79100',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: m.actions.filter((a) => a.kind === 'no-op').map((a) => ({ atMs: a.atMs, weight: 1 })) }) }),
    measurementRow('misclickRate', { group: 'pace', default: false, chart: 'relative', color: '#c62828',
      data: (m) => ({ kind: 'rate', perMs: 60000,
        incidents: m.events.filter((e) => e.type === 'misclick').map((e) => ({ atMs: e.atMs, weight: 1 })) }) }),
    measurementRow('pathPerClick', { group: 'pace', default: false, chart: 'relative', color: '#37474f',
      data: (m) => ({ kind: 'ratio', incidents: changingActions(m).map((a) => ({ atMs: a.atMs, num: a.pathPx, den: 1 })) }) }),
    measurementRow('pathPer3bv', { group: 'pace', default: false, chart: 'relative', color: '#00acc1',
      data: (m) => ({ kind: 'ratio', incidents: changingActions(m).map((a) => ({ atMs: a.atMs, num: a.pathPx, den: a.solved })) }) }),
    measurementRow('flagRate', { group: 'pace', default: false, chart: 'relative', color: '#1b5e20',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: m.actions.filter((a) => a.kind === 'flag-place').map((a) => ({ atMs: a.atMs, weight: 1 })) }) }),
    measurementRow('flagRemovalRate', { group: 'pace', default: false, chart: 'relative', color: '#006064',
      data: (m) => ({ kind: 'rate', perMs: 60000,
        incidents: m.actions.filter((a) => a.kind === 'flag-remove').map((a) => ({ atMs: a.atMs, weight: 1 })) }) }),
    measurementRow('cadenceSpread', { group: 'pace', default: false, chart: 'relative', color: '#880e4f',
      data: (m) => ({ kind: 'spread', incidents: m.presses }) }),
    { id: 'workAreas', group: 'board', name: 'work areas', default: false, format: count,
      chart: 'relative', color: '#8d6e63',
      help: 'Separate places holding safe squares known; squares at most 2 apart count as one place. The game value is the average over time.',
      data: (m) => stateSteps(m, m.known.areas) },
    { id: 'squaresMoved', group: 'board', name: 'squares moved between actions', default: true, format: decimal1,
      chart: 'relative', color: '#4e342e',
      help: 'How far each board-changing click was from the one before, in squares in any direction; averages take the mean.',
      data: (m) => ({ kind: 'value', aggregate: 'mean',
        incidents: changingActions(m).filter((a) => a.squares !== undefined).map((a) => ({ atMs: a.atMs, value: a.squares })) }) },
    measurementRow('gameRiskRate', { group: 'report', default: false, chart: 'relative', color: '#d06a00',
      data: categoryRate((a) => a.category === 'gameRisk', () => 1) }),
    measurementRow('earlyGuessRate', { group: 'report', default: false, chart: 'relative', color: '#c9a227',
      data: categoryRate((a) => a.category === 'earlyGuess', () => 1) }),
    measurementRow('timeLossRate', { group: 'report', default: false, chart: 'relative', color: '#1682b8',
      data: categoryRate((a) => a.category === 'timeLoss', () => 1) }),
    measurementRow('lifeMaximizationRate', { group: 'report', default: false, chart: 'relative', color: '#8651ad',
      data: categoryRate((a) => a.category === 'lifeMaximization', () => 1) }),
    measurementRow('excessGameRiskRate', { group: 'report', default: false, chart: 'relative', color: '#b71c1c',
      data: categoryRate((a) => a.riskDelta !== undefined, (a) => 100 * a.riskDelta) }),
    measurementRow('modeledLifeGapRate', { group: 'report', default: false, chart: 'relative', color: '#311b92',
      data: categoryRate((a) => a.lifeGap !== undefined, (a) => a.lifeGap) }),
    { id: 'noOpEvents', group: 'events', name: 'no-op clicks', default: true, format: integer, track: 'clicks', mark: 'ring', color: '#000000',
      measurements: ['noopRate'], help: 'Clicks that changed nothing.', data: eventsOf('no-op') },
    { id: 'misclickEvents', group: 'events', name: 'misclicks', default: true, format: integer, track: 'clicks', mark: 'cross', color: '#c62828',
      measurements: ['misclickRate'],
      help: 'Actions the visible board had already proved wrong: opening a proven mine, flagging a proven-safe square, removing a proven mine\u2019s flag, or chording against the visible proof.',
      data: eventsOf('misclick') },
    { id: 'flagRemovedEvents', group: 'events', name: 'flags removed', default: true, format: integer, track: 'clicks', mark: 'down', color: '#6a1b9a',
      measurements: ['flagRemovalRate'],
      help: 'A flag taken off again; one taken off within 1 second of placing it is a quick undo.', data: eventsOf('flag-removed') },
    { id: 'wrongFlagEvents', group: 'events', name: 'flags on safe squares', default: true, format: integer, track: 'clicks', mark: 'up', color: '#ad1457',
      help: 'A flag placed on a square with no mine under it.', data: eventsOf('wrong-flag') },
    { id: 'guessEvents', group: 'events', name: 'guesses', default: true, format: integer, track: 'clicks', mark: 'diamond', color: '#ef6c00',
      help: 'Opening a square the visible board had not proved safe, after the first click.', data: eventsOf('guess') },
    { id: 'longGapEvents', group: 'events', name: 'long gaps', default: true, format: integer, track: 'pauses', mark: 'band', color: '#90a4ae',
      help: 'A gap of 1 second or more between board-changing clicks.', data: eventsOf('long-gap') },
    { id: 'movedOnEvents', group: 'events', name: 'moved on', default: true, format: integer, track: 'jumps', mark: 'chevronRight', color: '#1565c0',
      measurements: ['timeBeforeMove'],
      help: 'A jump of 3 or more squares from everything the click before it opened or marked, after the proven-safe squares within 2 squares of those had run out: the local work ended.',
      data: eventsOf('moved-on') },
    { id: 'leftHardWorkEvents', group: 'events', name: 'left hard work', default: true, format: integer, track: 'jumps', mark: 'arrowRightOutline', color: '#c62828',
      measurements: ['timeBeforeMove'],
      help: 'The same jump made while proven-safe squares were still within 2 squares, none of which counting a single number proved: the local work had turned slow.',
      data: eventsOf('left-hard-work') },
    { id: 'leftEasyWorkEvents', group: 'events', name: 'left easy work', default: true, format: integer, track: 'jumps', mark: 'arrowRight', color: '#c62828',
      measurements: ['timeBeforeMove', 'easyWorkLeftShare'],
      help: 'The same jump made while counting a single number had proved a square within 2 squares safe.',
      data: eventsOf('left-easy-work') },
    { id: 'forkEvents', group: 'events', name: 'forks', default: true, format: integer, track: 'jumps', mark: 'fork', color: '#00897b',
      measurements: ['nearestAreaShare'],
      help: 'A move made while proven-safe squares lay in 2 or more separate places (squares at most 2 apart count as one place): a choice of where to go next.',
      data: eventsOf('fork') },
    { id: 'cameBackEvents', group: 'events', name: 'came back', default: false, format: integer, track: 'jumps', mark: 'chevronLeft', color: '#6a1b9a',
      help: 'A move back to proven-safe squares left behind by an earlier move.', data: eventsOf('came-back') },
    { id: 'openingEvents', group: 'events', name: 'openings', default: false, format: integer, track: 'clicks', mark: 'square', color: '#2e7d32',
      help: 'A click that opened a zero region.', data: eventsOf('opening') },
    { id: 'windowLeftEvents', group: 'events', name: 'window left', default: true, format: integer, track: 'pauses', mark: 'bar', color: '#000000',
      help: 'Time the game\u2019s window was hidden or out of focus. Games saved before 26 September 2026 did not record it.',
      data: (m) => (m.pageStateRecorded ? eventsOf('window-left')(m) : { kind: 'unrecorded' }) },
    { id: 'unusedFlagEvents', group: 'events', name: 'unused flags', default: false, format: integer, track: 'clicks', mark: 'upOutline', color: '#283593',
      measurements: ['unusedFlagShare', 'unusedFlagRate'],
      help: 'A correct flag that no chord ever used; measured on wins only.', data: eventsOf('unused-flag') },
  ];
  const defaults = Object.freeze(Object.fromEntries(ROWS.map((row) => [row.id, row.default])));
  const rowById = (id) => {
    const row = ROWS.find((item) => item.id === id);
    if (row === undefined) throw new Error('during the game: unknown row ' + id);
    return row;
  };

  //-------DURING THE GAME: AVERAGING (analysis worker)-------

  // The one averaging choice: a rolling window centered on each moment, the
  // default at 2 s (creator 2026-10-20), raw incidents, or fixed buckets
  // from the first click.
  const AVERAGES = [
    ['rolling-2', '2 s rolling average'],
    ['rolling-5', '5 s rolling average'],
    ['rolling-10', '10 s rolling average'],
    ['raw', 'raw'],
    ['buckets-2', '2 s buckets'],
    ['buckets-5', '5 s buckets'],
    ['buckets-10', '10 s buckets'],
  ];
  const DEFAULT_AVERAGE = 'rolling-2';
  function averageOf(id) {
    if (!AVERAGES.some(([value]) => value === id)) throw new Error('during the game: unknown average ' + id);
    if (id === 'raw') return { kind: 'raw' };
    const [kind, seconds] = id.split('-');
    return { kind, windowMs: Number(seconds) * 1000 };
  }
  // Points per rolling line: finer than any row's pixels need.
  const ROLLING_POINTS = 240;

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  // The row's value over `items` of its incidents, the cursor travel from
  // fromMs to toMs, and durationMs of play; undefined where it is not
  // measured.
  function valueOver(data, items, fromMs, toMs, durationMs) {
    if (data.kind === 'rate') return items.reduce((sum, item) => sum + item.weight, 0) * data.perMs / durationMs;
    if (data.kind === 'ratio') {
      const den = items.reduce((sum, item) => sum + item.den, 0);
      return den > 0 ? items.reduce((sum, item) => sum + item.num, 0) / den : undefined;
    }
    if (data.kind === 'value') {
      if (items.length === 0) return undefined;
      const values = items.map((item) => item.value);
      return data.aggregate === 'median' ? medianOf(values) : mean(values);
    }
    if (data.kind === 'spread') return gapSpreadRatioOf(items.map((item) => item.value));
    if (data.kind === 'speed') return (pathAt(data.path, toMs) - pathAt(data.path, fromMs)) * 1000 / durationMs;
    throw new Error('during the game: ' + data.kind + ' rows do not average');
  }

  // The row's value over [fromMs, toMs] of a game lasting spanMs.
  function windowValue(data, fromMs, toMs, spanMs) {
    const from = Math.max(0, fromMs);
    const to = Math.min(spanMs, toMs);
    if (to - from < MIN_WINDOW_MS) return undefined;
    return valueOver(data, data.incidents.filter((item) => item.atMs >= from && item.atMs <= to), from, to, to - from);
  }

  // The row's value over the whole game: the final share, the time-weighted
  // mean of a board state, the event count, or over every incident and the
  // record's time exactly what the record's measurement computes
  // (GameData.metrics), so the legend and game summary perf show one value.
  function gameValue(data, m) {
    if (data.kind === 'unrecorded') return undefined;
    if (data.kind === 'progress') return data.steps[data.steps.length - 1].value;
    if (data.kind === 'state') {
      let weighted = 0;
      let measured = 0;
      data.steps.forEach((step, i) => {
        const end = i + 1 < data.steps.length ? data.steps[i + 1].atMs : m.timeMs;
        if (step.value === null || end <= step.atMs) return;
        weighted += step.value * (end - step.atMs);
        measured += end - step.atMs;
      });
      return measured > 0 ? weighted / measured : undefined;
    }
    if (data.kind === 'events') return data.events.length;
    if ((data.kind === 'rate' || data.kind === 'speed') && m.recordTimeMs === 0) return undefined;
    return valueOver(data, data.incidents, 0, m.timeMs, m.recordTimeMs);
  }

  // What a row draws: `steps` for progress and board states, `events` for
  // event lanes, else `points` (the raw incidents: value dots, or weighted
  // ticks for a rate) and under an average `buckets` [{fromMs, toMs, value}]
  // or `line` [{atMs, value}].
  function drawn(data, averageId, spanMs) {
    if (data.kind === 'unrecorded') return {};
    if (data.kind === 'progress' || data.kind === 'state') return { steps: data.steps };
    if (data.kind === 'events') return { events: data.events };
    const out = {};
    if (data.kind === 'rate') out.ticks = data.incidents;
    else if (data.kind === 'spread') out.ticks = data.incidents.map((item) => ({ atMs: item.atMs, weight: 1 }));
    else if (data.kind === 'ratio') {
      out.points = data.incidents.filter((item) => item.den > 0)
        .map((item) => ({ atMs: item.atMs, value: item.num / item.den }));
    } else out.points = data.incidents;
    const average = averageOf(averageId);
    if (average.kind === 'buckets') {
      out.buckets = [];
      for (let from = 0; from < spanMs; from += average.windowMs) {
        const to = Math.min(spanMs, from + average.windowMs);
        out.buckets.push({ fromMs: from, toMs: to, value: windowValue(data, from, to, spanMs) });
      }
    } else if (average.kind === 'rolling') {
      out.line = [];
      for (let i = 0; i <= ROLLING_POINTS; i++) {
        const atMs = spanMs * i / ROLLING_POINTS;
        out.line.push({ atMs, value: windowValue(data, atMs - average.windowMs / 2, atMs + average.windowMs / 2, spanMs) });
      }
    }
    return out;
  }

  // The block's data for the game page: the shown rows' drawn series and
  // whole-game values, and each action's time and square for the hover and
  // the replay link.
  function view(m, rowIds, averageId) {
    averageOf(averageId);
    if (!m.recorded) return { recorded: false };
    return {
      recorded: true, timeMs: m.timeMs, outcome: m.outcome, width: m.width, height: m.height,
      actions: m.actions.map((a) => ({ atMs: a.atMs, kind: a.kind, cell: a.cell })),
      rows: rowIds.map((id) => {
        const data = rowById(id).data(m);
        return { id, kind: data.kind, summary: gameValue(data, m), ...drawn(data, averageId, m.timeMs),
          ...(data.kind === 'state' && data.steps.every((step) => step.none === true) ? { noMoves: true } : {}) };
      }),
    };
  }

  //-------DURING THE GAME: HOVER LOOKUP (game page)-------

  function stepAt(steps, atMs) {
    let found;
    for (const step of steps) {
      if (step.atMs > atMs) break;
      found = step;
    }
    return found;
  }

  // A drawn row's value at one moment: the step holding then, the events so
  // far, the bucket or rolling point covering it, or in raw the incident
  // nearest to it within toleranceMs; undefined where none is measured.
  function valueAt(row, atMs, toleranceMs) {
    if (row.steps) {
      const step = stepAt(row.steps, atMs);
      return step === undefined || step.value === null ? undefined : step.value;
    }
    if (row.events) return row.events.filter((event) => event.atMs <= atMs).length;
    if (row.buckets) {
      const bucket = row.buckets.find((item) => atMs >= item.fromMs && atMs <= item.toMs);
      return bucket === undefined ? undefined : bucket.value;
    }
    if (row.line) {
      let nearest = row.line[0];
      for (const point of row.line) if (Math.abs(point.atMs - atMs) < Math.abs(nearest.atMs - atMs)) nearest = point;
      return nearest.value;
    }
    if (!row.points) return undefined;
    let nearest;
    for (const point of row.points) {
      const distance = Math.abs(point.atMs - atMs);
      if (distance <= toleranceMs && (nearest === undefined || distance < Math.abs(nearest.atMs - atMs))) nearest = point;
    }
    return nearest === undefined ? undefined : nearest.value;
  }

  //-------DURING THE GAME: LEGEND PICKS (game page)-------

  // The rows a legend click leaves picked, of a legend's `rowIds`; none
  // picked shows them all (creator 2026-10-21). From all shown, a click
  // shows its row alone; then each click adds or removes one row. Removing
  // the last picked row or picking every row shows them all again, since a
  // chart showing nothing is pointless. Picks of rows the legend no longer
  // has (configure removed them) drop out.
  function legendPick(picked, rowId, rowIds) {
    const next = new Set([...picked].filter((id) => rowIds.includes(id)));
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    return next.size === rowIds.length ? new Set() : next;
  }

  // Whether a legend's picks hide a row: some of its rows are picked, and
  // not this one.
  function legendHides(picked, rowId, rowIds) {
    return rowIds.some((id) => picked.has(id)) && !picked.has(rowId);
  }

  return { NEAR_SQUARES, LONG_GAP_MS, QUICK_UNDO_MS, GROUPS, CHARTS, RELATIVE_SCALES, DEFAULT_RELATIVE_SCALE, TRACKS,
    ROWS, defaults, AVERAGES, DEFAULT_AVERAGE, rowById, positionProofs, model, cursorTravelPx, bv3SolvedBy, bv3SolvedAtStart,
    plannedPairsOf, moveHabits, fastclickGap, view, valueAt, legendPick, legendHides };
})();
