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
  return safeCells > 0 ? position.revealed.length / safeCells : 0;
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
    if (!(typeof choice.risk === 'number' && choice.risk > 0 && choice.risk < 1)
        || !Array.isArray(choice.cells)) continue;
    const remaining = new Set(choice.cells.filter((cell) =>
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
const PATH_GAP_TRAVEL_PX = 40;

function pathTraceGaps(t, x, y) {
  const gaps = [];
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (dt < PATH_GAP_MS) continue;
    const travelPx = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    gaps.push({
      from: i - 1,
      to: i,
      dtMs: dt,
      travelPx,
      kind: travelPx >= PATH_GAP_TRAVEL_PX ? 'away' : 'rest',
    });
  }
  return gaps;
}

// Rough-movement flags per sample segment (index i marks samples i-1..i):
// crawling below a quarter of the game's own median moving speed, or a hard
// direction reversal (>135°) between adjacent moving segments — hesitation
// and overshoot correction. Needs at least 8 moving segments to know what
// "normal" pace is; otherwise nothing is flagged.
function pathRoughSegments(t, x, y) {
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
    const speed = len * 1000 / dt;
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
// Hue budget: purple = the measured choice set and its pocket labels; gold =
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
    means: 'uncertain pocket',
    detail: 'the side label gives that pocket\u2019s exact mine risk and cell count',
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
    color: '#c62828', form: 'flag', look: 'mini flag',
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
    .flatMap((choice) => Array.isArray(choice.cells) ? choice.cells : []))];
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
  const revealed = new Map(position.revealed || []);
  const flagged = new Set(position.flagged || []);
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
  if (solver !== null && overlays.probs && solver.measured) {
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
    solverState: solver === null ? 'off' : solver.measured ? 'exact' : 'bounded',
  };
}

// Legend rows for the active overlays: encoding keys (rendered verbatim from
// REPLAY_ENCODINGS) plus the exact-enumeration caveat where it applies.
function replayLegendRows(overlays, solverState) {
  const rows = [{
    title: 'decision-time board',
    keys: ['choice', 'area', 'trigger', 'selected', 'crosshair'],
  }];
  const bounded = solverState === 'bounded';
  const solverNote = bounded
    ? 'position too complex for exact enumeration — showing bounded-proof facts only'
    : undefined;
  if (overlays.moves) {
    rows.push({
      title: 'available moves',
      keys: ['safe', 'chord-now', 'mark-mine', 'chord-after-marks',
        'chord-after-marks-single', 'chord-open'],
      note: solverNote,
    });
  }
  if (overlays.mines) {
    rows.push({
      title: 'forced mines',
      keys: ['mine'],
      note: overlays.moves ? undefined : solverNote,
    });
  }
  if (overlays.probs) {
    rows.push({
      title: 'mine %',
      keys: bounded ? [] : ['prob'],
      note: bounded ? 'position too complex for exact probabilities' : undefined,
    });
  }
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
