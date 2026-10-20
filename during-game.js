'use strict';

// During the game: how one finished game unfolded on its own clock, the block
// "live perf charts" at the head of the game data column
// (docs/product/during-game.md). This file is the block's pure part: the row,
// chart, and event track catalog and the rows' defaults, which the settings
// schema reads on both pages; the per-game model and the rows' drawn series,
// which the analysis worker builds from the finished game's trace with the
// prover (justice.js), saved positions (game/evaluation.js), the fastclick
// rule (game/session-stats.js), and the replay's frame order
// (game/replay-model.js); and the hover lookup the game page runs on those
// series.

const DuringGame = (() => {
  //-------DURING THE GAME: MODEL (analysis worker)-------

  // Near: at most 2 squares away in any direction.
  const NEAR_SQUARES = 2;
  // Proven-safe squares at most 2 squares apart belong to one work area.
  const AREA_LINK_SQUARES = 2;
  const LONG_GAP_MS = 1000;
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

  // Cumulative cursor travel at each in-game sample, on the game clock. The
  // step into the first in-game sample counts, as the live path counter
  // counts the first move after the clock starts.
  function cursorPath(sampleT, sampleX, sampleY, startT, spanMs) {
    const times = [0];
    const cumulative = [0];
    let total = 0;
    for (let i = 1; i < sampleT.length; i++) {
      const at = sampleT[i] - startT;
      if (at <= 0) continue;
      if (at > spanMs) break;
      total += Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]);
      times.push(at);
      cumulative.push(total);
    }
    return { times, cumulative };
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

  // game: { width, height, mines (the final layout), timeMs, outcome, t, x,
  // y (cursor samples), events, initialPageState }. The time axis runs from
  // the clock's start to its stop or to the last action, whichever is later
  // (the record's time is rounded to the millisecond).
  function model(game) {
    const { width, height } = game;
    const size = width * height;
    const decisions = pathDecisionEvents(game.events);
    if (decisions.length === 0) return { recorded: false };
    const last = decisions.length - 1;
    const spanMs = Math.max(game.timeMs, decisions[last].evaluation.atMs);
    const mineAt = game.mines;
    const mineCount = mineAt.reduce((count, mine) => count + (mine ? 1 : 0), 0);
    const board = boardUnits(width, height, mineAt);
    const startT = clockStartT(decisions);
    const path = cursorPath(game.t, game.x, game.y, startT, spanMs);
    // Traces from before capture version 1 recorded no page states at all.
    const windowLeft = game.initialPageState === undefined ? null
      : windowLeftSpans(game.events, game.initialPageState, startT, spanMs);

    // Pass 1: what each action changed, and what the board proved before it.
    const revealed = new Uint8Array(size);
    for (const [cell] of decisions[0].evaluation.position.revealed) revealed[cell] = 1;
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
    const flaggedMinesOf = (position) => position.flagged.filter((cell) => mineAt[cell]).length;
    const progress = { startMs: [0], solved: [solved], opened: [opened],
      flaggedMines: [flaggedMinesOf(decisions[0].evaluation.position)] };
    const known = { startMs: [], all: [], counting: [], areas: [], safeCells: [] };
    const factsAt = [];
    const changedBy = [];
    let proofRevealed = -1;
    let proofs = null;
    for (let k = 0; k <= last; k++) {
      const evaluation = decisions[k].evaluation;
      const position = evaluation.position;
      // Proofs read only the open numbers, which only grow.
      if (position.revealed.length !== proofRevealed) {
        const view = positionView(position);
        proofs = {
          counting: Justice.proveFacts(view, Justice.rawClues(view), { subset: false, global: false, exact: false }),
          all: Justice.proveFacts(view, Justice.rawClues(view)),
        };
        proofRevealed = position.revealed.length;
      }
      const flagged = new Set(position.flagged);
      const safeAll = safeCellsOf(proofs.all, flagged);
      const complete = proofs.all.complete === true;
      factsAt.push(proofs.all);
      known.startMs.push(k === 0 ? 0 : decisions[k - 1].evaluation.atMs);
      known.all.push(complete ? safeAll.length : null);
      known.counting.push(safeCellsOf(proofs.counting, flagged).length);
      known.areas.push(complete ? areasOf(safeAll, width, height).count : null);
      known.safeCells.push(complete ? safeAll : null);
      // The squares this action opened: the next frame's new squares; a win
      // opens every square still covered, a death none.
      const changed = [];
      if (k < last) {
        for (const [cell] of decisions[k + 1].evaluation.position.revealed) {
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
    const sampleT = game.t;
    const movingAt = (inputT) => {
      const i = lastIndexAtOrBefore(sampleT, inputT);
      return i >= 0 && inputT - sampleT[i] <= SESSION_MOVING_PRESS_MS;
    };
    const actions = [];
    const events = [];
    const flagPlacedAt = new Map();
    let previous = null;
    let leftBehind = [];
    let noOpsSince = 0;
    for (let k = 0; k <= last; k++) {
      const decision = decisions[k];
      const evaluation = decision.evaluation;
      const evidence = evaluation.evidence;
      const atMs = evaluation.atMs;
      const cell = targetCellOf(evaluation);
      const changes = BOARD_CHANGING.has(evaluation.action);
      const flagged = new Set(evaluation.position.flagged);
      const action = { atMs, kind: evaluation.action, cell, changes, opened: changedBy[k].length,
        solved: progress.solved[k + 1] - progress.solved[k], result: evaluation.result };
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
          ...(typeof evidence.bestRisk === 'number' ? { bestRisk: evidence.bestRisk } : {}) });
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
        action.moving = movingAt(decision.t);
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
              known: known.all[k], countingKnown: known.counting[k],
              ...(safe === null ? {} : { nearKnown: nearSafe.length, safeCells: safe }),
              endedBy: evaluation.action, guess: action.guess === true, noOps: noOpsSince,
              ...(windowLeft === null ? {}
                : { windowLeft: windowLeft.some(([from, to]) => from < atMs && to > previous.atMs) }) });
          }
          const continuing = nearSafe.some((square) => squareDistance(width, cell, square) <= NEAR_SQUARES);
          if (!near(cell) && !continuing && (nearSafe.length > 0 || safe !== null)) {
            // A move: away from everything the previous board-changing
            // action touched and from the proven-safe squares near it. Left
            // work while such squares remained; moved on once none did.
            const facts = { cell, fromCell: previous.cell, squares: action.squares, guess: action.guess === true };
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
              at('left-work', { ...facts, leftSafe: nearSafe.length, safeCells: nearSafe });
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
      recorded: true, timeMs: spanMs, outcome: game.outcome, width, height, mines: mineCount,
      pageStateRecorded: windowLeft !== null,
      bv3: { total: board.total, atStart: solvedAtStart },
      safe: { total: size - mineCount, atStart: openedAtStart },
      actions, progress, known, path, events,
    };
  }

  //-------DURING THE GAME: ROWS (catalog, per-row data)-------

  const GROUPS = [
    ['progress', 'progress'],
    ['pace', 'pace'],
    ['board', 'board'],
    ['events', 'events'],
  ];

  // Two charts, in this order. Progress plots shares of the board on a fixed
  // 0 to 1 scale. Every other line shares one chart (creator 2026-10-20:
  // combine the solitary line charts) on a log scale of each line against
  // its own whole-game value, since their units differ. Event rows are
  // marks on the tracks under the charts.
  const CHARTS = [
    { id: 'progress', name: 'progress', scale: 'share' },
    { id: 'relative', name: 'pace and board against the whole game', scale: 'relative' },
  ];
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
  const eventsOf = (type) => (m) => ({ kind: 'events', events: m.events.filter((e) => e.type === type) });
  const gameDataFormat = (id) => (value) => GameData.metrics.find((metric) => metric.id === id).format(value);
  const percent = (value) => Math.round(value * 100) + '%';
  const ms = (value) => Math.round(value) + 'ms';
  const decimal1 = (value) => (Math.round(value * 10) / 10).toFixed(1);
  const integer = (value) => String(value);

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
  //   speed     cursor travel over time
  //   events    detected events, at an instant or over a span
  //   unrecorded  the trace did not record what the row needs
  // Rows that share a game data name keep its definition and format.
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
    { id: 'bvPerSecond', group: 'pace', name: '3BV/s', default: true, format: gameDataFormat('bvPerSecond'),
      chart: 'relative', color: '#2e7d32',
      help: '3BV solved per second.',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: m.actions.filter((a) => a.solved > 0).map((a) => ({ atMs: a.atMs, weight: a.solved })) }) },
    { id: 'clickRate', group: 'pace', name: 'click rate', default: true, format: gameDataFormat('clickRate'),
      chart: 'relative', color: '#1565c0',
      help: 'Board-changing clicks per second: reveals, flags, flag removals, and chords.',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: changingActions(m).map((a) => ({ atMs: a.atMs, weight: 1 })) }) },
    { id: 'actionGap', group: 'pace', name: 'action gaps', default: true, format: ms,
      chart: 'relative', color: '#546e7a',
      help: 'The time from one board-changing click to the next; averages take the median.',
      data: (m) => ({ kind: 'value', aggregate: 'median',
        incidents: changingActions(m).filter((a) => a.gapMs !== undefined).map((a) => ({ atMs: a.atMs, value: a.gapMs })) }) },
    { id: 'fastclickGap', group: 'pace', name: 'fastclick gap', default: true, format: gameDataFormat('fastclickGap'),
      chart: 'relative', color: '#ef6c00',
      help: 'Gaps of 1 second or less between board-changing clicks, ending in a click made while the cursor was moving (it moved in the 100 ms before); averages take the median. Flags are timed at the right press, left clicks at release.',
      data: (m) => ({ kind: 'value', aggregate: 'median',
        incidents: changingActions(m).filter((a) => a.gapMs !== undefined && a.gapMs <= FASTCLICK_MAX_GAP_MS && a.moving)
          .map((a) => ({ atMs: a.atMs, value: a.gapMs })) }) },
    { id: 'mouseSpeed', group: 'pace', name: 'mouse speed', default: true, format: gameDataFormat('mouseSpeed'),
      chart: 'relative', color: '#6a1b9a',
      help: 'Cursor travel per second, pauses included. Each dot is the speed between two board-changing clicks.',
      data: (m) => ({ kind: 'speed', path: m.path,
        incidents: changingActions(m).filter((a) => a.gapMs > 0)
          .map((a) => ({ atMs: a.atMs, value: a.pathPx * 1000 / a.gapMs })) }) },
    { id: 'efficiency', group: 'pace', name: 'efficiency', default: false, format: gameDataFormat('efficiency'),
      chart: 'relative', color: '#9e9d24',
      help: '3BV solved divided by board-changing clicks.',
      data: (m) => ({ kind: 'ratio', incidents: changingActions(m).map((a) => ({ atMs: a.atMs, num: a.solved, den: 1 })) }) },
    { id: 'correctness', group: 'pace', name: 'board-changing click share', default: false, format: gameDataFormat('correctness'),
      chart: 'relative', color: '#283593',
      help: 'Board-changing clicks divided by all clicks; a wrong flag still counts as a change.',
      data: (m) => ({ kind: 'ratio', incidents: m.actions.map((a) => ({ atMs: a.atMs, num: a.changes ? 1 : 0, den: 1 })) }) },
    { id: 'ioe', group: 'pace', name: 'IOE', default: false, format: gameDataFormat('ioe'),
      chart: 'relative', color: '#ad1457',
      help: '3BV solved divided by all clicks, including those that changed nothing.',
      data: (m) => ({ kind: 'ratio', incidents: m.actions.map((a) => ({ atMs: a.atMs, num: a.solved, den: 1 })) }) },
    { id: 'noopRate', group: 'pace', name: 'no-op rate', default: false, format: gameDataFormat('noopRate'),
      chart: 'relative', color: '#c79100',
      help: 'Clicks that changed nothing, per second.',
      data: (m) => ({ kind: 'rate', perMs: 1000,
        incidents: m.actions.filter((a) => a.kind === 'no-op').map((a) => ({ atMs: a.atMs, weight: 1 })) }) },
    { id: 'misclickRate', group: 'pace', name: 'misclick rate', default: false, format: gameDataFormat('misclickRate'),
      chart: 'relative', color: '#c62828',
      help: 'Misclicks per minute: actions the visible board had already proved wrong.',
      data: (m) => ({ kind: 'rate', perMs: 60000,
        incidents: m.events.filter((e) => e.type === 'misclick').map((e) => ({ atMs: e.atMs, weight: 1 })) }) },
    { id: 'pathPerClick', group: 'pace', name: 'path / click', default: false, format: gameDataFormat('pathPerClick'),
      chart: 'relative', color: '#37474f',
      help: 'Cursor travel per board-changing click.',
      data: (m) => ({ kind: 'ratio', incidents: changingActions(m).map((a) => ({ atMs: a.atMs, num: a.pathPx, den: 1 })) }) },
    { id: 'pathPer3bv', group: 'pace', name: 'path / 3BV', default: false, format: gameDataFormat('pathPer3bv'),
      chart: 'relative', color: '#00acc1',
      help: 'Cursor travel per 3BV solved.',
      data: (m) => ({ kind: 'ratio', incidents: changingActions(m).map((a) => ({ atMs: a.atMs, num: a.pathPx, den: a.solved })) }) },
    { id: 'safeKnown', group: 'board', name: 'safe squares known', default: true, format: decimal1,
      chart: 'relative', color: '#00897b',
      help: 'Covered squares the visible board had proved safe, between your clicks. The game value is the average over time.',
      data: (m) => ({ kind: 'state', steps: m.known.startMs.map((atMs, i) => ({ atMs, value: m.known.all[i] })) }) },
    { id: 'safeByCounting', group: 'board', name: 'safe by counting', default: false, format: decimal1,
      chart: 'relative', color: '#7cb342',
      help: 'The safe squares known that counting single numbers proves, the quickest kind to see. The game value is the average over time.',
      data: (m) => ({ kind: 'state', steps: m.known.startMs.map((atMs, i) => ({ atMs, value: m.known.counting[i] })) }) },
    { id: 'workAreas', group: 'board', name: 'work areas', default: false, format: decimal1,
      chart: 'relative', color: '#8d6e63',
      help: 'Separate places holding safe squares known; squares at most 2 apart count as one place. The game value is the average over time.',
      data: (m) => ({ kind: 'state', steps: m.known.startMs.map((atMs, i) => ({ atMs, value: m.known.areas[i] })) }) },
    { id: 'squaresMoved', group: 'board', name: 'squares moved between actions', default: true, format: decimal1,
      chart: 'relative', color: '#4e342e',
      help: 'How far each board-changing click was from the one before, in squares in any direction; averages take the mean.',
      data: (m) => ({ kind: 'value', aggregate: 'mean',
        incidents: changingActions(m).filter((a) => a.squares !== undefined).map((a) => ({ atMs: a.atMs, value: a.squares })) }) },
    { id: 'noOpEvents', group: 'events', name: 'no-op clicks', default: true, format: integer, track: 'clicks', mark: 'ring', color: '#000000',
      help: 'Clicks that changed nothing.', data: eventsOf('no-op') },
    { id: 'misclickEvents', group: 'events', name: 'misclicks', default: true, format: integer, track: 'clicks', mark: 'cross', color: '#c62828',
      help: 'Actions the visible board had already proved wrong: opening a proven mine, flagging a proven-safe square, removing a proven mine\u2019s flag, or a chord against the proof.',
      data: eventsOf('misclick') },
    { id: 'flagRemovedEvents', group: 'events', name: 'flags removed', default: true, format: integer, track: 'clicks', mark: 'down', color: '#6a1b9a',
      help: 'A flag taken off again; one taken off within 1 second of placing it is a quick undo.', data: eventsOf('flag-removed') },
    { id: 'wrongFlagEvents', group: 'events', name: 'flags on safe squares', default: true, format: integer, track: 'clicks', mark: 'up', color: '#ad1457',
      help: 'A flag placed on a square with no mine under it.', data: eventsOf('wrong-flag') },
    { id: 'guessEvents', group: 'events', name: 'guesses', default: true, format: integer, track: 'clicks', mark: 'diamond', color: '#ef6c00',
      help: 'Opening a square the visible board had not proved safe, after the first click.', data: eventsOf('guess') },
    { id: 'longGapEvents', group: 'events', name: 'long gaps', default: true, format: integer, track: 'pauses', mark: 'band', color: '#90a4ae',
      help: 'A gap of 1 second or more between board-changing clicks.', data: eventsOf('long-gap') },
    { id: 'movedOnEvents', group: 'events', name: 'moved on', default: true, format: integer, track: 'jumps', mark: 'chevronRight', color: '#1565c0',
      help: 'A jump of 3 or more squares from everything the click before it opened or marked, after the proven-safe squares within 2 squares of those had run out.',
      data: eventsOf('moved-on') },
    { id: 'leftWorkEvents', group: 'events', name: 'left work', default: true, format: integer, track: 'jumps', mark: 'arrowRight', color: '#c62828',
      help: 'A jump of 3 or more squares from everything the click before it opened or marked, and from the proven-safe squares still within 2 squares of those, leaving them unopened.',
      data: eventsOf('left-work') },
    { id: 'forkEvents', group: 'events', name: 'forks', default: true, format: integer, track: 'jumps', mark: 'fork', color: '#00897b',
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

  // The row's value over [fromMs, toMs] of a game lasting spanMs; undefined
  // where it is not measured. Under a second of play is no evidence, as in
  // the session stats.
  function windowValue(data, fromMs, toMs, spanMs) {
    const from = Math.max(0, fromMs);
    const to = Math.min(spanMs, toMs);
    if (to - from < SESSION_MIN_PLAY_MS) return undefined;
    const inside = (item) => item.atMs >= from && item.atMs <= to;
    if (data.kind === 'rate') {
      const weight = data.incidents.filter(inside).reduce((sum, item) => sum + item.weight, 0);
      return weight * data.perMs / (to - from);
    }
    if (data.kind === 'ratio') {
      const items = data.incidents.filter(inside);
      const den = items.reduce((sum, item) => sum + item.den, 0);
      return den > 0 ? items.reduce((sum, item) => sum + item.num, 0) / den : undefined;
    }
    if (data.kind === 'value') {
      const values = data.incidents.filter(inside).map((item) => item.value);
      if (values.length === 0) return undefined;
      return data.aggregate === 'median' ? sessionMedian(values) : mean(values);
    }
    if (data.kind === 'speed') return (pathAt(data.path, to) - pathAt(data.path, from)) * 1000 / (to - from);
    throw new Error('during the game: ' + data.kind + ' rows do not average');
  }

  // The row's value over the whole game: the final share, the
  // time-weighted mean of a board state, the game's rate or ratio, the
  // median or mean of all incidents, or the event count.
  function gameValue(data, spanMs) {
    if (data.kind === 'unrecorded') return undefined;
    if (data.kind === 'progress') return data.steps[data.steps.length - 1].value;
    if (data.kind === 'state') {
      let weighted = 0;
      let measured = 0;
      data.steps.forEach((step, i) => {
        const end = i + 1 < data.steps.length ? data.steps[i + 1].atMs : spanMs;
        if (step.value === null || end <= step.atMs) return;
        weighted += step.value * (end - step.atMs);
        measured += end - step.atMs;
      });
      return measured > 0 ? weighted / measured : undefined;
    }
    if (data.kind === 'events') return data.events.length;
    return windowValue(data, 0, spanMs, spanMs);
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
        return { id, kind: data.kind, summary: gameValue(data, m.timeMs), ...drawn(data, averageId, m.timeMs) };
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

  return { NEAR_SQUARES, LONG_GAP_MS, QUICK_UNDO_MS, GROUPS, CHARTS, TRACKS, ROWS, defaults, AVERAGES, DEFAULT_AVERAGE,
    rowById, model, view, valueAt };
})();
