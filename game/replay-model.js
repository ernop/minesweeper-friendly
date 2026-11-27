'use strict';

// Path and choice replay, pure part: path events, gaps, bins, replay
// frames, encodings, legends, and status text.

//-------PATH REPLAY: COMPUTATION-------

// The same Tukey inner-fence rule used by the lower scatter charts keeps an
// extreme pause or coalesced burst from flattening every local color
// difference. Values remain data; only the display range is trimmed.
function pathDisplayRange(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const q = (p) => {
    const at = (sorted.length - 1) * p;
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  };
  let shown = sorted;
  if (sorted.length >= 8) {
    const q1 = q(0.25);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    shown = sorted.filter((value) => value >= low && value <= high);
  }
  let min = shown[0];
  let max = shown[shown.length - 1];
  return {
    min,
    max,
    trimmed: sorted.length - shown.length,
  };
}

function pathDecisionEvents(events) {
  return events
    .filter((event) => event.kind === 'decision'
      && event.evaluation && event.evaluation.position)
    .sort((a, b) => a.t - b.t);
}

function pathClickEvents(events) {
  return events
    .filter((event) => (event.kind === 'lup' || event.kind === 'rdown')
      && Number.isFinite(event.x) && Number.isFinite(event.y))
    .sort((a, b) => a.t - b.t);
}

function pathDecisionProgress(decision) {
  const position = decision.evaluation.position;
  const safeCells = position.width * position.height - position.mines;
  return safeCells > 0 ? positionOpenCount(position) / safeCells : 0;
}

function pathDecisionIsLessUseful(decision) {
  return Array.isArray(decision.evaluation.mistakes)
    && decision.evaluation.mistakes.length > 0;
}

// Context roles for each run of less-useful actions. The useful action before
// a run and the next useful action after it stay visible, so the overlay shows
// a complete measurable episode rather than disconnected red fragments.
function pathLessUsefulRoles(decisions) {
  const roles = decisions.map(() => ({ before: false, less: false, after: false }));
  let i = 0;
  while (i < decisions.length) {
    if (!pathDecisionIsLessUseful(decisions[i])) {
      i++;
      continue;
    }
    if (i > 0) roles[i - 1].before = true;
    while (i < decisions.length && pathDecisionIsLessUseful(decisions[i])) {
      roles[i].less = true;
      i++;
    }
    if (i < decisions.length) roles[i].after = true;
  }
  return roles;
}

// Uncertain reasonable-choice cells become connected areas for replay
// callouts. Eight-neighbor connectivity matches the way a Minesweeper pocket
// reads visually; deterministic ordering keeps side labels stable.
function pathChoiceAreas(evaluation) {
  const position = evaluation.position;
  if (!position) return [];
  const width = position.width;
  const height = position.height;
  const areas = [];
  for (const choice of evaluation.choices || []) {
    if (!(typeof choice.risk === 'number' && choice.risk > 0 && choice.risk < 1)) continue;
    const remaining = new Set(squareList(choice.cells).filter((cell) =>
      Number.isInteger(cell) && cell >= 0 && cell < width * height));
    while (remaining.size > 0) {
      const first = Math.min(...remaining);
      remaining.delete(first);
      const cells = [];
      const queue = [first];
      while (queue.length > 0) {
        const cell = queue.pop();
        cells.push(cell);
        const x = cell % width;
        const y = Math.floor(cell / width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            const neighbor = ny * width + nx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height
                && remaining.delete(neighbor)) queue.push(neighbor);
          }
        }
      }
      cells.sort((a, b) => a - b);
      areas.push({ kind: choice.kind, risk: choice.risk, cells });
    }
  }
  return areas.sort((a, b) => a.cells[0] - b.cells[0]);
}

function pathRiskLabel(risk) {
  if (Math.abs(risk - 0.5) <= 1e-12) return '50/50';
  const pct = risk * 100;
  if (pct < 0.1) return '<0.1% mine';
  if (pct > 99.9) return '>99.9% mine';
  const shown = Math.round(pct * 10) / 10;
  return (Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1)) + '% mine';
}

function pathHeatColor(value, range) {
  if (range.max <= range.min) return 'hsl(110, 88%, 42%)';
  const fraction = Math.max(0, Math.min(1,
    (value - range.min) / (range.max - range.min)));
  return 'hsl(' + (220 * (1 - fraction)).toFixed(1) + ', 88%, 42%)';
}

// Sampling is event-driven: nothing is recorded while the cursor rests or
// sits outside the window. A silent stretch whose endpoints are far apart
// means the cursor left the window and re-entered elsewhere ('away'); nearby
// endpoints mean it rested in place ('rest'). Away gaps get duration labels
// so "how long was I off-screen?" is answered on the path itself.
const PATH_GAP_MS = 300;
const PATH_GAP_DISTANCE_PX = 40;

function pathTraceGaps(t, x, y) {
  const gaps = [];
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (dt < PATH_GAP_MS) continue;
    const distancePx = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    gaps.push({
      from: i - 1,
      to: i,
      dtMs: dt,
      distancePx,
      kind: distancePx >= PATH_GAP_DISTANCE_PX ? 'away' : 'rest',
    });
  }
  return gaps;
}

// Rough-movement flags per sample segment (index i marks samples i-1..i):
// crawling below a quarter of the game's own median moving speed, or a hard
// direction reversal (>135°) between adjacent moving segments — hesitation
// and overshoot correction. Needs at least 8 moving segments to know what
// "normal" pace is; otherwise nothing is flagged. Pace is each sample's
// cursor travel (sampleTravelPx); direction is the step between samples.
function pathRoughSegments(t, x, y, travel) {
  const n = t.length;
  const rough = new Array(n).fill(false);
  const info = new Array(n).fill(null);
  const speeds = [];
  for (let i = 1; i < n; i++) {
    const dt = t[i] - t[i - 1];
    if (dt <= 0 || dt >= PATH_GAP_MS) continue;
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    const len = Math.hypot(dx, dy);
    const speed = travel[i] * 1000 / dt;
    info[i] = { speed, len, theta: len > 0 ? Math.atan2(dy, dx) : null };
    if (speed > 0) speeds.push(speed);
  }
  if (speeds.length < 8) return rough;
  speeds.sort((a, b) => a - b);
  const median = speeds[Math.floor(speeds.length / 2)];
  let prevTheta = null;
  for (let i = 1; i < n; i++) {
    const seg = info[i];
    if (seg === null) {
      prevTheta = null;
      continue;
    }
    if (seg.speed > 0 && seg.speed < median * 0.25) rough[i] = true;
    if (seg.theta !== null) {
      if (prevTheta !== null && seg.len >= 4) {
        let turn = Math.abs(seg.theta - prevTheta) % (2 * Math.PI);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn > Math.PI * 0.75) rough[i] = true;
      }
      prevTheta = seg.theta;
    }
  }
  return rough;
}

// Raw inputs annotated with what the game did with them. A decision frame
// records t equal to the exact input event that it accepted, so exact-time
// matching ties each accepted input to its action kind — which is how a
// left release that performed a chord is told apart from a plain reveal.
function pathClickActions(events) {
  const actionAt = new Map();
  for (const event of events) {
    if (event.kind === 'decision' && event.evaluation) {
      actionAt.set(event.t, event.evaluation.action);
    }
  }
  return pathClickEvents(events).map((click) => ({
    ...click,
    action: actionAt.get(click.t) || null,
  }));
}

// Legend classes for a continuous path parameter: equal-width bins over the
// display range, each holding the exact numeric interval it covers, so the
// legend can enumerate every color class the line uses.
function pathValueBins(range, count) {
  if (range === undefined || !(range.max > range.min)) return [];
  const bins = [];
  for (let k = 0; k < count; k++) {
    bins.push({
      min: range.min + (range.max - range.min) * k / count,
      max: range.min + (range.max - range.min) * (k + 1) / count,
    });
  }
  return bins;
}

function pathBinIndex(bins, value) {
  if (bins.length === 0 || !Number.isFinite(value)) return -1;
  const span = bins[bins.length - 1].max - bins[0].min;
  const k = Math.floor((value - bins[0].min) / span * bins.length);
  return Math.max(0, Math.min(bins.length - 1, k));
}

// The player's full option set is raw click, chord, and mark-mine — and
// marking only pays off by unlocking a chord. So besides the chords
// available right now (numbers already satisfied by placed flags), this
// also finds every mark-then-chord combo: a number whose flags plus
// unflagged proven mines exactly satisfy it, with at least one other
// covered neighbor to open. Raw safe clicks need no scan — they are the
// facts map's proven-safe entries. `facts` maps covered cells to
// 1 (proven mine) / 2 (proven safe); `safe` is true when everything the
// chord would open is proven clear.
function replayMoveOptions(view, flagged, facts) {
  const chords = [];
  const flagChords = [];
  for (let i = 0; i < view.width * view.height; i++) {
    if (!view.revealed[i] || view.adjacent[i] <= 0) continue;
    let flags = 0;
    const needFlags = [];
    const opens = [];
    const cx = i % view.width;
    const cy = Math.floor(i / view.width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= view.width || ny < 0 || ny >= view.height) continue;
        const nb = ny * view.width + nx;
        if (view.revealed[nb]) continue;
        if (flagged.has(nb)) flags++;
        else if (facts.get(nb) === 1) needFlags.push(nb);
        else opens.push(nb);
      }
    }
    if (flags === view.adjacent[i] && needFlags.length + opens.length > 0) {
      // Chordable right now. Unflagged proven mines among the neighbors
      // would be opened by this chord, so they make it provably fatal.
      const allOpens = [...needFlags, ...opens];
      chords.push({
        cell: i,
        opens: allOpens,
        safe: needFlags.length === 0
          && allOpens.every((cell) => facts.get(cell) === 2),
      });
    } else if (needFlags.length > 0 && opens.length > 0
        && flags + needFlags.length === view.adjacent[i]) {
      flagChords.push({
        cell: i,
        needFlags,
        opens,
        safe: opens.every((cell) => facts.get(cell) === 2),
      });
    }
  }
  return { chords, flagChords };
}

// Every visual encoding review mode can put on the board or its canvas,
// in one table: the color (published to CSS as `--replay-<key>` by
// applyReplayEncodingColors), the legend swatch form, and the complete
// legend wording. The frame model names squares by these keys, the
// stylesheet reads the colors through the variables, and the legend renders
// the wording verbatim — so a color or a meaning changes in exactly one
// place and the legend can never drift from the board (semantic labels are
// never shortened; see docs/product/ui-doctrine.md).
//
// Hue budget: purple = the measured choice set and its group labels; gold =
// the action itself; green = proven safe; blue = chord now; teal = chord
// after marks; red = mine; orange = mistake-tagged action; black = clean
// action; deep pink = rough movement. Measured choices used to be a second
// green, indistinguishable from the proven-safe ring on the same square.
const REPLAY_ENCODINGS = replayEncodingTable({
  choice: {
    color: '#7256a8', form: 'ring', look: 'solid purple ring',
    means: 'measured reasonable choice',
    detail: 'a square the analysis rated worth choosing at this moment',
  },
  area: {
    color: '#7256a8', form: 'leader', look: 'purple arrow to a side label',
    means: 'connected group of uncertain choices',
    detail: 'the side label gives that group\u2019s exact mine risk and square count',
  },
  trigger: {
    color: '#f1a208', form: 'ring', look: 'gold ring',
    means: 'square the action was performed on',
  },
  selected: {
    color: '#f1a208', form: 'fill', look: 'gold wash',
    means: 'squares the action changed',
  },
  crosshair: {
    color: '#f1a208', form: 'crosshair', look: 'crosshair + word',
    means: 'exact input pixel and action kind',
  },
  safe: {
    color: '#1b8a3f', form: 'dashed', look: 'dashed green',
    means: 'proven safe: open it with a raw click',
    detail: 'around a flag it means that flag is provably wrong',
  },
  'chord-now': {
    color: '#0b5d97', form: 'dashed', look: 'dashed blue',
    means: 'number you can chord now',
  },
  'mark-mine': {
    color: FLAG_COLOR, form: 'flag', look: 'mini flag',
    means: 'mark-mine move on a proven mine',
  },
  'chord-after-marks': {
    color: '#00838f', form: 'dashed', look: 'dashed teal',
    means: 'number chordable after those marks',
    detail: 'opens 2 or more cells',
  },
  'chord-after-marks-single': {
    color: '#00838f', form: 'dashed-thin', look: 'thin dashed teal',
    means: 'mark-then-chord combo that opens a single cell',
    detail: 'never faster than that cell\u2019s raw click',
  },
  'chord-open': {
    color: '#d9f2e0', form: 'fill', look: 'pale green fill',
    means: 'cells a chord opens',
  },
  mine: {
    color: '#c62828', form: 'dashed', look: 'dashed red',
    means: 'proven mine: never open',
    detail: 'flag it or chord past it',
  },
  prob: {
    color: '#000000', form: 'badge', look: 'corner number',
    means: 'exact mine probability (%) from everything visible',
    detail: 'a proven cell already ringed by another layer shows no number',
  },
  pointless: {
    color: '#d95f02', form: 'dot', look: 'numbered orange ring',
    means: 'mistake-tagged action',
    detail: 'every such action up to the shown moment',
  },
  purposeful: {
    color: '#000000', form: 'dot', look: 'numbered black ring',
    means: 'clean action',
    detail: 'every such action up to the shown moment',
  },
  movement: {
    color: '#ad1457', form: 'line', look: 'deep-pink underlay',
    means: 'rough movement',
    detail: 'crawling under \u00bc of this game\u2019s median pace, or a hard reversal',
  },
});

// Each encoding is written as three parts so the legend can set the
// meaning as the headline and the look words plus detail beneath it; the
// complete `label` (look = meaning — detail) is derived, never retyped, and
// is what exports and tests read.
function replayEncodingTable(entries) {
  const table = {};
  for (const [key, entry] of Object.entries(entries)) {
    table[key] = Object.freeze({
      ...entry,
      label: entry.look + ' = ' + entry.means
        + (entry.detail ? ' \u2014 ' + entry.detail : ''),
    });
  }
  return Object.freeze(table);
}

function replayChoiceCells(evaluation) {
  return [...new Set((evaluation.choices || [])
    .flatMap((choice) => squareList(choice.cells)))];
}

function replayProbabilityText(p) {
  const pct = p * 100;
  if (pct >= 99.95) return '>99';
  if (pct < 0.05) return '<0.1';
  if (pct < 9.95) {
    const shown = Math.round(pct * 10) / 10;
    return Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1);
  }
  return String(Math.round(pct));
}

// The square the action was performed on: a chord stores it explicitly;
// every other action acts on its (single) selected square.
function replayTriggerCell(evaluation) {
  if (Number.isInteger(evaluation.triggerCell)) return evaluation.triggerCell;
  const selected = Array.isArray(evaluation.selected) ? evaluation.selected : [];
  return evaluation.action !== 'no-op' && selected.length === 1
    ? selected[0] : null;
}

// Which encodings each board square carries at one decision frame. Pure:
// reads the stored evaluation, the solver read for that position (null
// when no solver layer is on), and the overlay switches. The painter only
// translates keys to `replay-<key>` classes and badges, so everything about
// what is shown is testable without a DOM.
//
// Rules worth naming: a mark-then-chord combo that opens one cell is kept
// (the option set stays complete) but marked as the dominated option it is,
// and its single open cell gets no chord fill; the mine-% badge is dropped
// from a proven cell whose ring already states 0 or 100, because four
// symbols in one square hid the board.
function replayFrameModel(evaluation, solver, overlays) {
  const position = evaluation.position;
  const size = position.width * position.height;
  const revealed = positionNumbers(position);
  const flagged = positionFlags(position);
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push({
      revealed: revealed.has(i),
      adjacent: revealed.get(i) || 0,
      flagged: flagged.has(i),
      marks: new Set(),
      badge: null,
    });
  }
  const mark = (cell, key) => {
    if (Number.isInteger(cell) && cell >= 0 && cell < size) cells[cell].marks.add(key);
  };
  if (solver !== null && overlays.moves) {
    for (const cell of solver.provenSafe) mark(cell, 'safe');
    for (const chord of solver.chords) {
      if (!chord.safe) continue;
      mark(chord.cell, 'chord-now');
      for (const cell of chord.opens) mark(cell, 'chord-open');
    }
    for (const chord of solver.flagChords) {
      if (!chord.safe) continue;
      if (chord.opens.length >= 2) {
        mark(chord.cell, 'chord-after-marks');
        for (const cell of chord.opens) mark(cell, 'chord-open');
      } else {
        mark(chord.cell, 'chord-after-marks-single');
      }
    }
    // Mark-mine is the third option besides click and chord: every unflagged
    // proven mine can be marked, which is what unlocks the combo chords.
    for (const cell of solver.provenMines) {
      if (!flagged.has(cell)) mark(cell, 'mark-mine');
    }
  }
  if (solver !== null && overlays.mines) {
    for (const cell of solver.provenMines) mark(cell, 'mine');
  }
  if (solver !== null && overlays.probs) {
    for (let i = 0; i < size; i++) {
      if (cells[i].revealed) continue;
      const fact = solver.facts.get(i);
      if (fact === 1 && overlays.mines) continue;
      if (fact === 2 && overlays.moves) continue;
      cells[i].badge = fact === 1 ? '100'
        : fact === 2 ? '0'
          : replayProbabilityText(solver.pMine[i]);
    }
  }
  const choices = replayChoiceCells(evaluation);
  for (const cell of choices) mark(cell, 'choice');
  for (const cell of evaluation.selected || []) mark(cell, 'selected');
  const triggerCell = replayTriggerCell(evaluation);
  if (triggerCell !== null) mark(triggerCell, 'trigger');
  return {
    cells,
    triggerCell,
    choiceCount: choices.length,
  };
}

// Legend rows for the active overlays: encoding keys, rendered verbatim from
// REPLAY_ENCODINGS.
function replayLegendRows(overlays) {
  const rows = [{
    title: 'decision-time board',
    keys: ['choice', 'area', 'trigger', 'selected', 'crosshair'],
  }];
  if (overlays.moves) {
    rows.push({
      title: 'available moves',
      keys: ['safe', 'chord-now', 'mark-mine', 'chord-after-marks',
        'chord-after-marks-single', 'chord-open'],
    });
  }
  if (overlays.mines) rows.push({ title: 'forced mines', keys: ['mine'] });
  if (overlays.probs) rows.push({ title: 'mine %', keys: ['prob'] });
  if (overlays.pointless) rows.push({ title: 'pointless clicks', keys: ['pointless'] });
  if (overlays.purposeful) rows.push({ title: 'purposeful clicks', keys: ['purposeful'] });
  if (overlays.movement) rows.push({ title: 'rough movement', keys: ['movement'] });
  return rows;
}

// The status line's parts, so the values (action number, in-game time,
// action kind) can be set larger than the words around them.
// `step` is the slider position = actions already done; the shown board is
// the one the player faced while deciding action step + 1 (`evaluation`),
// so `time` is that decision's moment and `action` the move about to be made.
function replayStatusParts(step, count, evaluation) {
  const choiceCount = replayChoiceCells(evaluation).length;
  return {
    done: String(step),
    count: String(count),
    time: Number.isFinite(evaluation.atMs)
      ? (evaluation.atMs / 1000).toFixed(2) + ' s' : 'before timer',
    action: evaluation.action,
    choices: choiceCount + ' measured choice' + (choiceCount === 1 ? '' : 's'),
  };
}

// The slider's last position: every action done, the finished board.
function replayEndStatusParts(count, finalMs) {
  return {
    done: String(count),
    count: String(count),
    time: (finalMs / 1000).toFixed(2) + ' s',
  };
}

function replayExplainTargetProof(view, flaggedSet, targetIndex, fact, facts) {
  const w = view.width;
  const h = view.height;
  const shortCoord = (idx) => '(' + ((idx % w) + 1) + ', ' + (Math.floor(idx / w) + 1) + ')';
  const clueName = (idx) => 'the ' + view.adjacent[idx] + ' at ' + shortCoord(idx);
  const aroundOf = (idx) => {
    const x = idx % w;
    const y = Math.floor(idx / w);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
          out.push((y + dy) * w + (x + dx));
        }
      }
    }
    return out;
  };
  const adjClues = aroundOf(targetIndex).filter((n) => view.revealed[n] && view.adjacent[n] > 0);

  // 1. Direct 1-number counting with placed flags
  for (const c of adjClues) {
    const val = view.adjacent[c];
    const nbs = aroundOf(c);
    const flg = nbs.filter((n) => !view.revealed[n] && flaggedSet.has(n));
    const cov = nbs.filter((n) => !view.revealed[n] && !flaggedSet.has(n));
    if (fact === 2 && flg.length === val) {
      return {
        ruleLabel: '1-number counting',
        howKnown: '1-number counting from ' + clueName(c) + ': all ' + val + ' of its mines are already flagged at '
          + flg.map(shortCoord).join(', ') + ', so its remaining covered neighbor ' + shortCoord(targetIndex) + ' is provably safe.',
        witnessClues: [c],
      };
    }
    if (fact === 1 && flg.length + cov.length === val) {
      return {
        ruleLabel: '1-number counting',
        howKnown: '1-number counting from ' + clueName(c) + ': it needs ' + val + ' ' + (val === 1 ? 'mine' : 'mines')
          + (flg.length > 0 ? ' (' + flg.length + ' already flagged at ' + flg.map(shortCoord).join(', ') + ')' : '')
          + ' and has only ' + cov.length + ' covered ' + (cov.length === 1 ? 'neighbor' : 'neighbors') + ' left ('
          + cov.map(shortCoord).join(', ') + '), so ' + shortCoord(targetIndex) + ' is provably a mine.',
        witnessClues: [c],
      };
    }
  }

  // 1B. No-flag 1-number counting (using single-number exhaustion mines)
  const isSingleExhaustionMine = (m) => {
    if (view.revealed[m]) return false;
    if (flaggedSet.has(m)) return true;
    for (const c of aroundOf(m)) {
      if (view.revealed[c] && view.adjacent[c] > 0) {
        const cov = aroundOf(c).filter((n) => !view.revealed[n]);
        if (cov.length === view.adjacent[c]) return true;
      }
    }
    return false;
  };
  for (const c of adjClues) {
    const val = view.adjacent[c];
    const nbs = aroundOf(c);
    const knownMines = nbs.filter(isSingleExhaustionMine);
    if (fact === 2 && knownMines.length === val) {
      return {
        ruleLabel: '1-number counting (no flags)',
        howKnown: 'No-flag 1-number counting from ' + clueName(c) + ': all ' + val + ' of its mines are already known at '
          + knownMines.map(shortCoord).join(', ') + ', so its remaining covered neighbor ' + shortCoord(targetIndex) + ' is provably safe.',
        witnessClues: [c],
      };
    }
  }

  // 2. Two-number overlap (1-1, 1-2, subset difference)
  for (const useKnownMines of [false, true]) {
    const clueState = (c) => {
      const nbs = aroundOf(c);
      const mines = nbs.filter((n) => !view.revealed[n] && (flaggedSet.has(n) || (useKnownMines && isSingleExhaustionMine(n))));
      const unk = nbs.filter((n) => !view.revealed[n] && !mines.includes(n));
      return { rem: view.adjacent[c] - mines.length, unk };
    };
    for (const c1 of adjClues) {
      const st1 = clueState(c1);
      if (!st1.unk.includes(targetIndex) || st1.rem < 0) continue;
      const nearby = new Set();
      for (const u of st1.unk) {
        for (const nb of aroundOf(u)) {
          if (nb !== c1 && view.revealed[nb] && view.adjacent[nb] > 0) nearby.add(nb);
        }
      }
      for (const c2 of nearby) {
        const st2 = clueState(c2);
        if (st2.rem < 0 || st2.unk.includes(targetIndex)) continue;
        const shared = st1.unk.filter((n) => st2.unk.includes(n));
        if (shared.length === 0) continue;
        const only1 = st1.unk.filter((n) => !st2.unk.includes(n));
        const only2 = st2.unk.filter((n) => !st1.unk.includes(n));
        const forcedIntoSharedBy2 = st2.rem - only2.length;
        const maxInSharedBy2 = Math.min(st2.rem, shared.length);
        if (fact === 2 && forcedIntoSharedBy2 === st1.rem && st1.rem > 0) {
          return {
            ruleLabel: '2-number overlap',
            howKnown: '2-number overlap between ' + clueName(c2) + ' and ' + clueName(c1) + ': '
              + clueName(c2) + ' needs ' + st2.rem + ' more ' + (st2.rem === 1 ? 'mine' : 'mines')
              + ', forcing ' + st1.rem + ' ' + (st1.rem === 1 ? 'mine' : 'mines') + ' into their shared squares ('
              + shared.map(shortCoord).join(', ') + '); that satisfies ' + clueName(c1)
              + ', proving ' + shortCoord(targetIndex) + ' safe.',
            witnessClues: [c1, c2],
          };
        }
        if (fact === 1 && st1.rem - maxInSharedBy2 === only1.length && only1.length > 0) {
          return {
            ruleLabel: '2-number overlap',
            howKnown: '2-number overlap between ' + clueName(c1) + ' and ' + clueName(c2) + ': at most '
              + maxInSharedBy2 + ' ' + (maxInSharedBy2 === 1 ? 'mine' : 'mines') + ' can sit in their shared squares ('
              + shared.map(shortCoord).join(', ') + ') without overflowing ' + clueName(c2)
              + ', forcing the remaining ' + (st1.rem - maxInSharedBy2) + ' '
              + (st1.rem - maxInSharedBy2 === 1 ? 'mine' : 'mines') + ' of ' + clueName(c1)
              + ' onto ' + shortCoord(targetIndex) + '.',
            witnessClues: [c1, c2],
          };
        }
      }
    }
  }

  return {
    ruleLabel: 'multi-number overlap',
    howKnown: 'Coupled constraint deduction from nearby clues (' + adjClues.slice(0, 5).map(clueName).join(', ')
      + ') proves ' + shortCoord(targetIndex) + (fact === 2 ? ' safe.' : ' is a mine.'),
    witnessClues: adjClues,
  };
}

function replayMentationExplanation(step, count, evaluation, solver) {
  const position = evaluation.position;
  const view = positionView(position);
  const flaggedSet = positionFlags(position);
  const w = position.width;
  const h = position.height;
  const shortCoord = (idx) => '(' + ((idx % w) + 1) + ', ' + (Math.floor(idx / w) + 1) + ')';
  const clueName = (idx) => 'the ' + view.adjacent[idx] + ' at ' + shortCoord(idx);
  const aroundOf = (idx) => {
    const x = idx % w;
    const y = Math.floor(idx / w);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
          out.push((y + dy) * w + (x + dx));
        }
      }
    }
    return out;
  };

  const trigger = replayTriggerCell(evaluation);
  const safeCount = solver ? solver.provenSafe.length : 0;
  const unflaggedMines = solver ? solver.provenMines.filter((m) => !flaggedSet.has(m)).length : 0;
  const safeChords = solver ? solver.chords.filter((c) => c.safe).length : 0;
  const boardSummary = 'On board: ' + safeCount + ' proven-safe ' + (safeCount === 1 ? 'square' : 'squares')
    + ', ' + unflaggedMines + ' unflagged proven ' + (unflaggedMines === 1 ? 'mine' : 'mines')
    + ', ' + safeChords + ' ready ' + (safeChords === 1 ? 'chord' : 'chords');

  if (trigger === null || evaluation.action === 'no-op') {
    return {
      statusLabel: 'NO-OP (click changed nothing)',
      howKnown: 'This click did not open or flag any square.',
      boardSummary,
      witnessClues: [],
    };
  }

  if (step === 0 && view.revealed.every((r) => !r)) {
    return {
      statusLabel: 'Opening Click at ' + shortCoord(trigger),
      howKnown: 'First click of the game before any clue numbers were revealed.',
      boardSummary: 'Board covered at start',
      witnessClues: [],
    };
  }

  if (evaluation.action === 'chord') {
    const val = view.adjacent[trigger];
    const nbs = aroundOf(trigger);
    const flg = nbs.filter((n) => !view.revealed[n] && flaggedSet.has(n));
    const cov = nbs.filter((n) => !view.revealed[n] && !flaggedSet.has(n));
    const allSafe = solver && cov.every((n) => solver.facts.get(n) === 2);
    return {
      statusLabel: (allSafe ? 'KNOWN SAFE CHORD' : 'CHORD') + ' at ' + shortCoord(trigger),
      howKnown: 'Chording ' + clueName(trigger) + ' with ' + flg.length + ' flagged ' + (flg.length === 1 ? 'mine' : 'mines')
        + ' (' + flg.map(shortCoord).join(', ') + ') to open ' + cov.map(shortCoord).join(', ') + '.',
      boardSummary,
      witnessClues: [trigger],
    };
  }

  const fact = solver ? solver.facts.get(trigger) : undefined;
  const pMinePct = solver && Array.isArray(solver.pMine) && Number.isFinite(solver.pMine[trigger])
    ? replayProbabilityText(solver.pMine[trigger]) + '% mine risk'
    : null;

  if (evaluation.action === 'reveal' && fact === 2) {
    const proof = replayExplainTargetProof(view, flaggedSet, trigger, 2, solver.facts);
    return {
      statusLabel: 'KNOWN SAFE (' + proof.ruleLabel + ') at ' + shortCoord(trigger),
      howKnown: proof.howKnown,
      boardSummary,
      witnessClues: proof.witnessClues,
    };
  }

  if (evaluation.action === 'flag' && fact === 1) {
    const proof = replayExplainTargetProof(view, flaggedSet, trigger, 1, solver.facts);
    return {
      statusLabel: 'KNOWN MINE (' + proof.ruleLabel + ') at ' + shortCoord(trigger),
      howKnown: proof.howKnown,
      boardSummary,
      witnessClues: proof.witnessClues,
    };
  }

  if (evaluation.action === 'reveal' && fact === 1) {
    const proof = replayExplainTargetProof(view, flaggedSet, trigger, 1, solver.facts);
    return {
      statusLabel: 'BLUNDER INTO KNOWN MINE (' + proof.ruleLabel + ') at ' + shortCoord(trigger),
      howKnown: proof.howKnown,
      boardSummary,
      witnessClues: proof.witnessClues,
    };
  }

  if (evaluation.action === 'flag' && fact === 2) {
    const proof = replayExplainTargetProof(view, flaggedSet, trigger, 2, solver.facts);
    return {
      statusLabel: 'WRONG FLAG ON KNOWN SAFE SQUARE at ' + shortCoord(trigger),
      howKnown: proof.howKnown,
      boardSummary,
      witnessClues: proof.witnessClues,
    };
  }

  // Otherwise fact === undefined: GUESS
  if (safeCount > 0) {
    const tx = trigger % w;
    const ty = Math.floor(trigger / w);
    const sortedSafe = [...solver.provenSafe].sort((a, b) => {
      const da = Math.max(Math.abs((a % w) - tx), Math.abs(Math.floor(a / w) - ty));
      const db = Math.max(Math.abs((b % w) - tx), Math.abs(Math.floor(b / w) - ty));
      return da - db;
    });
    const bestSafe = sortedSafe[0];
    const bestProof = replayExplainTargetProof(view, flaggedSet, bestSafe, 2, solver.facts);
    return {
      statusLabel: 'GUESS (unforced' + (pMinePct ? ', ' + pMinePct : '') + ') at ' + shortCoord(trigger),
      howKnown: 'Not provably safe from the visible numbers while ' + safeCount + ' proven-safe '
        + (safeCount === 1 ? 'square was' : 'squares were') + ' open \u2014 e.g. ' + shortCoord(bestSafe)
        + ' (' + bestProof.howKnown + ')',
      boardSummary,
      witnessClues: bestProof.witnessClues,
    };
  }

  return {
    statusLabel: 'GUESS (forced' + (pMinePct ? ', ' + pMinePct : '') + ') at ' + shortCoord(trigger),
    howKnown: 'No square anywhere on the board was logically provable as safe from the visible numbers; you had to guess at ' + shortCoord(trigger) + '.',
    boardSummary,
    witnessClues: [],
  };
}

//-------THEORY-OF-MIND MENTATION MODEL (mentation-v2)-------

const REPLAY_MENTATION_VERSION = 'mentation-v2';

const REPLAY_MENTATION_REASONS = Object.freeze([
  { id: 'misclick-aim', label: 'Actually a misclick / aim slip' },
  { id: 'misclick-button', label: 'Button-order / left-right slip' },
  { id: 'miscounted-number', label: 'Miscounted a number / thought it was satisfied' },
  { id: 'guessed-without-proof', label: 'Actually guessed (did not see the proof)' },
  { id: 'eyes-elsewhere', label: 'Was looking at a different part of the board' },
  { id: 'different-clue', label: 'Knew it from a different clue or deduction' },
  { id: 'planned-order', label: 'Planned click order / intentionally deferred' },
  { id: 'distracted', label: 'Checking mine count or momentary distraction' },
]);

function replayFrontierRegions(view, flaggedSet, solver) {
  const w = view.width;
  const h = view.height;
  const n = w * h;
  const inFrontier = new Uint8Array(n);
  const aroundOf = (idx) => {
    const x = idx % w;
    const y = Math.floor(idx / w);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
          out.push((y + dy) * w + (x + dx));
        }
      }
    }
    return out;
  };
  for (let i = 0; i < n; i++) {
    if (!view.revealed[i] || view.adjacent[i] <= 0) continue;
    const cov = aroundOf(i).filter((nb) => !view.revealed[nb] && !flaggedSet.has(nb));
    if (cov.length > 0) {
      inFrontier[i] = 1;
      for (const c of cov) inFrontier[c] = 1;
    }
  }
  const regionOf = new Int32Array(n).fill(-1);
  const regions = [];
  for (let i = 0; i < n; i++) {
    if (!inFrontier[i] || regionOf[i] !== -1) continue;
    const id = regions.length;
    const cells = [];
    const clues = [];
    const queue = [i];
    regionOf[i] = id;
    while (queue.length > 0) {
      const cur = queue.pop();
      cells.push(cur);
      if (view.revealed[cur] && view.adjacent[cur] > 0) clues.push(cur);
      for (const nb of aroundOf(cur)) {
        if (inFrontier[nb] && regionOf[nb] === -1) {
          regionOf[nb] = id;
          queue.push(nb);
        }
      }
    }
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += (c % w) + 0.5;
      sy += Math.floor(c / w) + 0.5;
    }
    const safeCells = solver
      ? cells.filter((c) => !view.revealed[c] && !flaggedSet.has(c) && solver.facts.get(c) === 2)
      : [];
    regions.push({
      id,
      cells,
      clues,
      safeCells,
      centerX: sx / cells.length,
      centerY: sy / cells.length,
    });
  }
  return { regions, regionOf };
}

function replayCursorInBoardCells(trace, width, height, fromT, toT, prevCell, targetCell) {
  const empty = {
    valid: false,
    clickFracX: null,
    clickFracY: null,
    departMs: null,
    preClickHoverMs: null,
    pathRatio: null,
    slowOnClueMs: 0,
    clueDriftCells: [],
    abandonedFocus: null,
  };
  if (!trace || !Array.isArray(trace.events) || !Array.isArray(trace.t) || trace.t.length < 2) return empty;
  const layouts = trace.events.filter((e) => e.kind === 'layout' && Number.isFinite(e.width) && e.width > 0);
  if (layouts.length === 0) return empty;
  const layoutAt = (t) => {
    let best = layouts[0];
    for (let i = 1; i < layouts.length; i++) {
      if (layouts[i].t <= t) best = layouts[i];
      else break;
    }
    return best;
  };
  // Board border bevel is 1/8 cell on each side (style.css --bevel-size)
  const toCell = (layout, px, py) => {
    const cellW = layout.width / (width + 0.25);
    const cellH = layout.height / (height + 0.25);
    return [
      (px - layout.left) / cellW - 0.125,
      (py - layout.top) / cellH - 0.125,
    ];
  };

  const tArr = trace.t;
  const xArr = trace.x;
  const yArr = trace.y;
  const pts = [];
  for (let i = 0; i < tArr.length; i++) {
    if (tArr[i] < fromT) continue;
    if (tArr[i] > toT) break;
    const lay = layoutAt(tArr[i]);
    const [cx, cy] = toCell(lay, xArr[i], yArr[i]);
    pts.push({ t: tArr[i], x: cx, y: cy });
  }
  if (pts.length < 2) return empty;

  const endPt = pts[pts.length - 1];
  const clickFracX = endPt.x - Math.floor(endPt.x);
  const clickFracY = endPt.y - Math.floor(endPt.y);

  const ox = prevCell !== null ? (prevCell % width) + 0.5 : pts[0].x;
  const oy = prevCell !== null ? Math.floor(prevCell / width) + 0.5 : pts[0].y;
  const tx = targetCell !== null ? (targetCell % width) : Math.floor(endPt.x);
  const ty = targetCell !== null ? Math.floor(targetCell / width) : Math.floor(endPt.y);
  const tcx = tx + 0.5;
  const tcy = ty + 0.5;

  let departMs = null;
  if (prevCell !== null) {
    for (const p of pts) {
      if (Math.hypot(p.x - ox, p.y - oy) > 0.7) {
        departMs = Math.max(0, Math.round(p.t - fromT));
        break;
      }
    }
  }

  let preClickHoverMs = 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (pts[i].x >= tx && pts[i].x < tx + 1 && pts[i].y >= ty && pts[i].y < ty + 1) {
      preClickHoverMs = Math.max(0, Math.round(toT - pts[i].t));
    } else {
      break;
    }
  }

  let pathLen = 0;
  let slowOnClueMs = 0;
  const driftSet = new Set();
  // Detect abandoned frontier check: dwell >= 180 ms within 1.15-cell radius,
  // >= 2.2 cells away from both prev and target.
  let dwellStart = pts[0].t;
  let anchorX = pts[0].x;
  let anchorY = pts[0].y;
  let abandonedFocus = null;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dt = p1.t - p0.t;
    const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    pathLen += seg;
    if (dt > 0 && dt < 300) {
      const spd = seg * 1000 / dt;
      if (spd < 3.0) {
        const mx = 0.5 * (p0.x + p1.x);
        const my = 0.5 * (p0.y + p1.y);
        const inTarget = mx >= tx && mx < tx + 1 && my >= ty && my < ty + 1;
        const nearOrigin = Math.hypot(mx - ox, my - oy) <= 0.75;
        if (!inTarget && !nearOrigin) {
          const cx = Math.floor(mx);
          const cy = Math.floor(my);
          if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
            slowOnClueMs += dt;
            driftSet.add(cy * width + cx);
          }
        }
      }
    }
    if (Math.hypot(p1.x - anchorX, p1.y - anchorY) > 1.15) {
      const dur = p1.t - dwellStart;
      if (dur >= 180
          && Math.hypot(anchorX - ox, anchorY - oy) >= 2.2
          && Math.hypot(anchorX - tcx, anchorY - tcy) >= 2.2) {
        if (!abandonedFocus || dur > abandonedFocus.durMs) {
          abandonedFocus = { x: anchorX, y: anchorY, durMs: Math.round(dur) };
        }
      }
      dwellStart = p1.t;
      anchorX = p1.x;
      anchorY = p1.y;
    }
  }

  const chord = Math.hypot(tcx - ox, tcy - oy);
  const pathRatio = chord >= 0.8 ? pathLen / chord : null;

  return {
    valid: true,
    clickFracX,
    clickFracY,
    departMs,
    preClickHoverMs,
    pathRatio,
    slowOnClueMs: Math.round(slowOnClueMs),
    clueDriftCells: [...driftSet],
    abandonedFocus,
  };
}

// Simulates the player's visual attention, working memory, intent vs. execution
// (misclick / button slip / counting misread / false belief / deliberate move),
// and exact logical deduction proof for one decision frame in Replay.
function replayTheoryOfMind(step, decisions, trace, solver) {
  const curDecision = decisions[step];
  const prevDecision = step > 0 ? decisions[step - 1] : null;
  const nextDecision = step + 1 < decisions.length ? decisions[step + 1] : null;
  const evaluation = curDecision.evaluation;
  const position = evaluation.position;
  const view = positionView(position);
  const flaggedSet = positionFlags(position);
  const w = position.width;
  const h = position.height;
  const shortCoord = (idx) => '(' + ((idx % w) + 1) + ', ' + (Math.floor(idx / w) + 1) + ')';
  const clueName = (idx) => 'the ' + view.adjacent[idx] + ' at ' + shortCoord(idx);
  const aroundOf = (idx) => {
    const x = idx % w;
    const y = Math.floor(idx / w);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
          out.push((y + dy) * w + (x + dx));
        }
      }
    }
    return out;
  };

  const deduction = replayMentationExplanation(step, decisions.length, evaluation, solver);
  const trigger = replayTriggerCell(evaluation);
  const prevTrigger = prevDecision ? replayTriggerCell(prevDecision.evaluation) : null;
  const nextTrigger = nextDecision ? replayTriggerCell(nextDecision.evaluation) : null;
  const gapMs = prevDecision ? Math.round(curDecision.t - prevDecision.t) : null;
  const distCells = trigger !== null && prevTrigger !== null
    ? Math.max(Math.abs((trigger % w) - (prevTrigger % w)), Math.abs(Math.floor(trigger / w) - Math.floor(prevTrigger / w)))
    : 0;

  const cursor = prevDecision
    ? replayCursorInBoardCells(trace, w, h, prevDecision.t, curDecision.t, prevTrigger, trigger)
    : replayCursorInBoardCells(trace, w, h, 0, curDecision.t, null, trigger);

  // Use decision's exact click x, y if cursor trace lacked samples
  if (cursor.clickFracX === null && Number.isFinite(curDecision.x) && Number.isFinite(curDecision.y) && trace && Array.isArray(trace.events)) {
    const layouts = trace.events.filter((e) => e.kind === 'layout' && Number.isFinite(e.width) && e.width > 0);
    if (layouts.length > 0) {
      let lay = layouts[0];
      for (const l of layouts) if (l.t <= curDecision.t) lay = l;
      const cellW = lay.width / (w + 0.25);
      const cellH = lay.height / (h + 0.25);
      const cx = (curDecision.x - lay.left) / cellW - 0.125;
      const cy = (curDecision.y - lay.top) / cellH - 0.125;
      cursor.clickFracX = cx - Math.floor(cx);
      cursor.clickFracY = cy - Math.floor(cy);
    }
  }

  const { regions, regionOf } = replayFrontierRegions(view, flaggedSet, solver);
  const targetRegionId = trigger !== null ? regionOf[trigger] : -1;
  const prevRegionId = prevTrigger !== null ? regionOf[prevTrigger] : -1;

  // --- LAYER 1: INTENT VS EXECUTION (MISCLICK / SLIP / MISREAD / FALSE BELIEF) ---
  const fact = trigger !== null && solver ? solver.facts.get(trigger) : undefined;
  const isErrorLike = evaluation.action === 'no-op'
    || (evaluation.action === 'reveal' && fact === 1)
    || (evaluation.action === 'flag' && fact === 2)
    || ((evaluation.action === 'reveal' || evaluation.action === 'flag') && fact === undefined && solver && solver.provenSafe.length > 0);

  let intent = {
    kind: 'deliberate',
    headline: 'Deliberate move',
    detail: 'Cursor approach and board state are consistent with an intentional ' + evaluation.action + '.',
    intendedCell: null,
    falseBeliefFlags: [],
  };

  // Detect any provably wrong flags within distance <= 2 of trigger
  if (trigger !== null && solver) {
    const tx = trigger % w;
    const ty = Math.floor(trigger / w);
    const wrongNearby = [];
    for (const fIdx of flaggedSet) {
      if (solver.facts.get(fIdx) === 2) {
        const d = Math.max(Math.abs((fIdx % w) - tx), Math.abs(Math.floor(fIdx / w) - ty));
        if (d <= 2) wrongNearby.push(fIdx);
      }
    }
    intent.falseBeliefFlags = wrongNearby;
  }

  if (trigger !== null && isErrorLike) {
    // Hypothesis A: Spatial aim slip (edge click pointing to an adjacent valid move, or immediate adjacent correction)
    let aimCandidate = null;
    let aimReason = '';
    if (cursor.clickFracX !== null && cursor.clickFracY !== null) {
      const dxEdge = cursor.clickFracX - 0.5;
      const dyEdge = cursor.clickFracY - 0.5;
      if (Math.abs(dxEdge) >= 0.22 || Math.abs(dyEdge) >= 0.22) {
        const stepX = Math.abs(dxEdge) >= 0.22 ? (dxEdge > 0 ? 1 : -1) : 0;
        const stepY = Math.abs(dyEdge) >= 0.22 ? (dyEdge > 0 ? 1 : -1) : 0;
        const nx = (trigger % w) + stepX;
        const ny = Math.floor(trigger / w) + stepY;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const cand = ny * w + nx;
          const candIsSafe = solver && !view.revealed[cand] && !flaggedSet.has(cand) && solver.facts.get(cand) === 2;
          const candIsMine = solver && !view.revealed[cand] && !flaggedSet.has(cand) && solver.facts.get(cand) === 1;
          const candIsChord = solver && solver.chords.some((ch) => ch.cell === cand && ch.safe);
          if ((evaluation.action === 'reveal' && (candIsSafe || candIsChord))
              || (evaluation.action === 'flag' && candIsMine)
              || (evaluation.action === 'no-op' && (candIsSafe || candIsChord || candIsMine))) {
            aimCandidate = cand;
            const side = [dyEdge < -0.22 ? 'top' : dyEdge > 0.22 ? 'bottom' : '', dxEdge < -0.22 ? 'left' : dxEdge > 0.22 ? 'right' : ''].filter(Boolean).join('-');
            const what = candIsChord ? 'ready chord' : candIsSafe ? 'proven-safe square' : 'proven mine';
            aimReason = 'Click landed near the ' + side + ' edge of ' + shortCoord(trigger)
              + ' (' + Math.round(Math.min(cursor.clickFracX, 1 - cursor.clickFracX, cursor.clickFracY, 1 - cursor.clickFracY) * 100)
              + '% from the border), directly beside the ' + what + ' at ' + shortCoord(cand) + '.';
          }
        }
      }
    }
    if (aimCandidate === null && evaluation.action === 'no-op' && nextDecision && nextTrigger !== null) {
      const nextGap = Math.round(nextDecision.t - curDecision.t);
      const nextDist = Math.max(Math.abs((trigger % w) - (nextTrigger % w)), Math.abs(Math.floor(trigger / w) - Math.floor(nextTrigger / w)));
      if (nextGap <= 450 && nextDist === 1 && nextDecision.evaluation.action !== 'no-op') {
        aimCandidate = nextTrigger;
        aimReason = 'Immediately corrected ' + nextGap + ' ms later with a clean ' + nextDecision.evaluation.action
          + ' on the adjacent square ' + shortCoord(nextTrigger) + '.';
      }
    }

    if (aimCandidate !== null) {
      intent = {
        ...intent,
        kind: 'spatial-aim-slip',
        headline: 'Likely MISCLICK (spatial aim slip toward ' + shortCoord(aimCandidate) + ')',
        detail: aimReason,
        intendedCell: aimCandidate,
      };
    } else if (evaluation.action === 'reveal' && fact === 1) {
      // Hypothesis B: Button-order / 1.5-click slip on a proven mine beside a 1-flag-short number
      const oneShortClue = aroundOf(trigger).find((c) => {
        if (!view.revealed[c] || view.adjacent[c] <= 0) return false;
        const flg = aroundOf(c).filter((n) => !view.revealed[n] && flaggedSet.has(n)).length;
        return flg === view.adjacent[c] - 1;
      });
      if (oneShortClue !== undefined) {
        intent = {
          ...intent,
          kind: 'button-order-slip',
          headline: 'Likely MISCLICK (left/right or 1.5-click slip on a mine)',
          detail: 'You left-clicked the proven mine at ' + shortCoord(trigger) + ' beside ' + clueName(oneShortClue)
            + ' (which was 1 flag short) — likely intended to right-click flag it or released left before right on a 1.5-click.',
          intendedCell: trigger,
        };
      }
    } else if (evaluation.action === 'reveal' && fact === undefined) {
      // Hypothesis C: Counting misread (hallucinated flag around a 1-flag-short clue) vs. Speculative ocean click
      const adjClues = aroundOf(trigger).filter((c) => view.revealed[c] && view.adjacent[c] > 0);
      if (adjClues.length === 0) {
        intent = {
          ...intent,
          kind: 'speculative-ocean-click',
          headline: 'Deliberate speculative ocean click (opening hunt)',
          detail: shortCoord(trigger) + ' touches zero revealed clue numbers — you clicked into unexplored territory trying to pop a new zero opening.',
          intendedCell: null,
        };
      } else {
        // Check if an adjacent clue is 1 flag short and has a distractor flag at Chebyshev distance 2
        let misreadClue = null;
        let distractorFlag = null;
        for (const c of adjClues) {
          const nbs = aroundOf(c);
          const flg = nbs.filter((n) => !view.revealed[n] && flaggedSet.has(n));
          if (flg.length === view.adjacent[c] - 1) {
            const cx = c % w;
            const cy = Math.floor(c / w);
            for (const fIdx of flaggedSet) {
              const d = Math.max(Math.abs((fIdx % w) - cx), Math.abs(Math.floor(fIdx / w) - cy));
              if (d === 2) {
                misreadClue = c;
                distractorFlag = fIdx;
                break;
              }
            }
          }
          if (misreadClue !== null) break;
        }
        if (misreadClue !== null && cursor.preClickHoverMs !== null && cursor.preClickHoverMs < 220) {
          intent = {
            ...intent,
            kind: 'counting-misread',
            headline: 'Likely COUNTING MISREAD around ' + clueName(misreadClue),
            detail: clueName(misreadClue) + ' had only ' + (view.adjacent[misreadClue] - 1) + ' of its ' + view.adjacent[misreadClue]
              + ' mines flagged, with a nearby distractor flag just outside its ring at ' + shortCoord(distractorFlag)
              + ' — fast scan likely miscounted it as satisfied.',
            intendedCell: null,
          };
        }
      }
    }
  }

  if (intent.falseBeliefFlags.length > 0) {
    intent.detail += ' False belief on board: your flag at ' + intent.falseBeliefFlags.map(shortCoord).join(', ')
      + ' is provably WRONG (that square is safe), which corrupts nearby counting.';
  }

  // --- LAYER 2: SIMULATED VISUAL ATTENTION & WORKING MEMORY ---
  const focusSet = new Set();
  if (trigger !== null) focusSet.add(trigger);
  for (const wIdx of deduction.witnessClues || []) focusSet.add(wIdx);
  for (const dIdx of cursor.clueDriftCells) {
    if (view.revealed[dIdx] && view.adjacent[dIdx] > 0) focusSet.add(dIdx);
  }

  // Find if another frontier region had >= 2 easy safe squares while player stayed slow/guessing here
  let otherEasyRegion = null;
  if (solver) {
    for (const r of regions) {
      if (r.id === targetRegionId) continue;
      if (r.safeCells.length >= 2) {
        if (!otherEasyRegion || r.safeCells.length > otherEasyRegion.safeCells.length) otherEasyRegion = r;
      }
    }
  }

  let attention = {
    mode: 'local-read',
    headline: 'Reading local frontier around ' + (trigger !== null ? shortCoord(trigger) : 'board'),
    narrative: 'Working inside the local frontier around ' + (trigger !== null ? shortCoord(trigger) : 'the board') + '.',
    focusCells: [...focusSet],
    abandonedFocus: cursor.abandonedFocus,
  };

  if (step === 0) {
    attention = {
      ...attention,
      mode: 'opening',
      headline: 'Opening start',
      narrative: 'Initial opening click before any frontier exists.',
    };
  } else if (cursor.abandonedFocus !== null) {
    const abX = Math.floor(cursor.abandonedFocus.x) + 1;
    const abY = Math.floor(cursor.abandonedFocus.y) + 1;
    attention = {
      ...attention,
      mode: 'abandoned-hypothesis',
      headline: 'Checked (' + abX + ', ' + abY + ') for ' + cursor.abandonedFocus.durMs + ' ms, then shifted to ' + shortCoord(trigger),
      narrative: 'Your gaze/cursor first paused over the frontier near (' + abX + ', ' + abY + ') for '
        + cursor.abandonedFocus.durMs + ' ms, rejected or left it without clicking, and redirected to ' + shortCoord(trigger) + '.',
    };
  } else if (distCells >= 3.5 && cursor.departMs !== null && cursor.departMs <= 55 && (cursor.pathRatio === null || cursor.pathRatio <= 1.28)) {
    attention = {
      ...attention,
      mode: 'eyes-ahead-transition',
      headline: 'Eyes-ahead jump (' + distCells + ' sq, departed in ' + cursor.departMs + ' ms)',
      narrative: 'Your eyes had already shifted to the frontier around ' + shortCoord(trigger)
        + ' before your hand finished clicking ' + shortCoord(prevTrigger) + ' — you executed ' + shortCoord(prevTrigger)
        + ' from motor memory while already reading this new region.',
    };
  } else if (otherEasyRegion !== null && ((gapMs !== null && gapMs >= 600) || (fact === undefined && evaluation.action === 'reveal'))) {
    const oCol = Math.round(otherEasyRegion.centerX);
    const oRow = Math.round(otherEasyRegion.centerY);
    attention = {
      ...attention,
      mode: 'attention-tunnel',
      headline: 'Attention tunnel at ' + shortCoord(trigger) + ' (' + otherEasyRegion.safeCells.length + ' safe squares open near (' + oCol + ', ' + oRow + '))',
      narrative: 'Your focus stayed locked on the cluster at ' + shortCoord(trigger)
        + (gapMs !== null ? ' for ' + gapMs + ' ms' : '') + ' instead of scanning out to the open frontier near ('
        + oCol + ', ' + oRow + ') where ' + otherEasyRegion.safeCells.length + ' proven-safe squares were waiting.',
    };
  } else if (cursor.slowOnClueMs >= 140 || (cursor.pathRatio !== null && cursor.pathRatio >= 1.65 && distCells <= 2.5)) {
    const drifted = cursor.clueDriftCells.filter((c) => view.revealed[c] && view.adjacent[c] > 0).slice(0, 4);
    attention = {
      ...attention,
      mode: 'cursor-assisted-reading',
      headline: 'Cursor-assisted clue reading (' + cursor.slowOnClueMs + ' ms on clues'
        + (cursor.pathRatio !== null ? ', ' + cursor.pathRatio.toFixed(1) + '\u00d7 path' : '') + ')',
      narrative: 'Your pointer drifted slowly across ' + (drifted.length > 0 ? drifted.map(clueName).join(', ') : 'open clue numbers')
        + ' while reading this cluster, rather than keeping the hand parked until your eyes solved it.',
    };
  } else if (distCells <= 2 && gapMs !== null && gapMs <= 360 && targetRegionId === prevRegionId && targetRegionId !== -1) {
    attention = {
      ...attention,
      mode: 'working-memory-queue',
      headline: 'Working-memory chunk execution (' + gapMs + ' ms)',
      narrative: 'Fast local follow-up inside the same frontier cluster (' + gapMs
        + ' ms): continuing an already-read local sequence without shifting gaze.',
    };
  } else if (distCells >= 3) {
    attention = {
      ...attention,
      mode: 'area-switch',
      headline: 'Shifted focus ' + distCells + ' sq to ' + shortCoord(trigger)
        + (cursor.departMs !== null ? ' (departed after ' + cursor.departMs + ' ms)' : ''),
      narrative: 'Left the previous area around ' + shortCoord(prevTrigger) + ' and moved ' + distCells
        + ' squares to start working the frontier around ' + shortCoord(trigger) + '.',
    };
  }

  const isNotable = intent.kind !== 'deliberate'
    || intent.falseBeliefFlags.length > 0
    || attention.mode === 'abandoned-hypothesis'
    || attention.mode === 'attention-tunnel'
    || attention.mode === 'cursor-assisted-reading'
    || attention.mode === 'eyes-ahead-transition'
    || evaluation.action === 'no-op'
    || (fact === undefined && step > 0)
    || (gapMs !== null && gapMs >= 600);

  return {
    modelVersion: REPLAY_MENTATION_VERSION,
    step,
    gapMs,
    distCells,
    trigger,
    cursor,
    deduction,
    attention,
    intent,
    isNotable,
  };
}
