'use strict';

// Path and choice replay on the page: controls, slider, frame rendering,
// the path canvas, tooltips, and legends.

//-------PATH REPLAY: DISPLAY-------

// The just-finished trace remains in RAM until the next board. Its decision
// events are also persisted in the trace store, preserving exact player-view
// positions and measured choices for future historical analysis.
// The replay transport sits under the board whenever a finished game is
// shown. Its position `replayStep` counts actions done: 0 … N−1 show the
// board the player faced before action step + 1 (review frames), N is the
// finished board itself. `replayEnabled` is derived from that position;
// there is no separate toggle (2026-09-04).
let replayEnabled = false;
let pathCanvas = null;
let pathResizeObserver = null;
let replayFinishedCells = null;
let replayStep = 0;
// The position a hover preview replaced (previewReplayStep), null when none
// runs.
let replayPreviewReturnStep = null;
// The board overlays are saved with the player's settings, like the path
// view. The solver layers that show the logically deducible state of the
// shown board (available moves, forced mines) start on: seeing what was
// provable at each moment is the point of review (requested 2026-08-30
// late evening).
// Solver reads per decision index for the current trace (cleared on a new
// board); enumeration can take milliseconds, and slider scrubbing revisits
// the same frames constantly.
const replaySolverCache = new Map();
// Interpretive-legend hover state: which legend bin is spotlighted, and the
// cached geometry the canvas repaint + pointer hit tests read.
let pathHighlightBin = -1;
let lastPathState = null;
let pathTooltipEl = null;
const pathViewControl = document.getElementById('path-view-control');
const pathViewButtons = [...pathViewControl.querySelectorAll('[data-path-view]')];
const pathViewLegend = document.getElementById('path-view-legend');
const replayControls = document.getElementById('replay-controls');
const replayPrevious = document.getElementById('replay-prev');
const replayPlay = document.getElementById('replay-play');
const replayNext = document.getElementById('replay-next');
const replayStatus = document.getElementById('replay-status');
const replaySlider = document.getElementById('replay-slider');
const replaySliderScale = document.getElementById('replay-slider-scale');
const replaySliderValue = document.getElementById('replay-slider-value');
const replayOverlayControl = document.getElementById('replay-overlay-control');
const replayOverlayButtons =
  [...replayOverlayControl.querySelectorAll('[data-replay-overlay]')];
const replayMentation = document.getElementById('replay-mentation');
const replayMentationPanel = document.getElementById('replay-mentation-panel');
let lastReplayToM = null;
let replayFeedbackCache = null;
let replayFeedbackLoading = false;

function ensureReplayFeedbackLoaded(onReady) {
  if (replayFeedbackCache !== null) {
    if (onReady) onReady();
    return;
  }
  if (replayFeedbackLoading || typeof db === 'undefined' || db === null) return;
  replayFeedbackLoading = true;
  try {
    const req = db.transaction(USERDATA_STORE).objectStore(USERDATA_STORE).get('mentationFeedback');
    req.onsuccess = () => {
      replayFeedbackLoading = false;
      const val = req.result;
      replayFeedbackCache = (val && typeof val === 'object' && val.entries && typeof val.entries === 'object')
        ? val
        : { version: 1, entries: {} };
      if (onReady) onReady();
    };
    req.onerror = () => {
      replayFeedbackLoading = false;
      replayFeedbackCache = { version: 1, entries: {} };
    };
  } catch (_err) {
    replayFeedbackLoading = false;
    replayFeedbackCache = { version: 1, entries: {} };
  }
}

function jumpNotableReplayStep(direction) {
  if (!pathViewAvailable()) return;
  const decisions = pathDecisionEvents(trace.events);
  if (decisions.length === 0) return;
  const start = direction > 0
    ? (replayStep >= decisions.length ? 0 : replayStep + 1)
    : (replayStep >= decisions.length ? decisions.length - 1 : replayStep - 1);
  for (let i = start; i >= 0 && i < decisions.length; i += direction) {
    const ev = decisions[i].evaluation;
    const solver = replaySolverAt(i, ev.position);
    const tom = replayTheoryOfMind(i, decisions, trace, solver);
    if (tom.isNotable) {
      setReplayStep(i);
      return;
    }
  }
  setReplayStep(direction > 0 ? decisions.length - 1 : 0);
}

function pathViewAvailable() {
  return (gameState === 'won' || gameState === 'lost')
    && trace !== null
    && !document.getElementById('game-frame').hidden;
}

function replayDecisionCount() {
  return pathViewAvailable() ? pathDecisionEvents(trace.events).length : 0;
}

// The player's own moves of the game-history position (slider, buttons,
// arrow keys, a click on the live perf charts) stop playback and keep the
// position past any hover preview.
function setReplayStep(step) {
  replayPreviewReturnStep = null;
  stopReplayPlayback();
  moveReplayStep(step);
}

// Moves the game-history position, remembered for a reload.
function moveReplayStep(step) {
  showReplayStep(step);
  rememberReplayPosition();
}

// Shows a game-history position: review frames for positions before the
// end, the finished board at the end. Entering the frames starts the idle
// solver precompute for every frame.
function showReplayStep(step) {
  const count = replayDecisionCount();
  replayStep = Math.max(0, Math.min(count, step));
  const enabled = replayStep < count;
  const entering = enabled && !replayEnabled;
  replayEnabled = enabled;
  renderPathView();
  if (entering) scheduleReplayPrecompute();
}

// Hovering the live perf charts previews moments on the board itself
// (creator 2026-10-21, in place of a second board beside the charts). The
// first preview stops playback and holds the position it replaced, which
// ending the preview shows again; a preview is never remembered.
function previewReplayStep(step) {
  if (replayPreviewReturnStep === null) {
    stopReplayPlayback();
    replayPreviewReturnStep = replayStep;
  }
  if (step !== replayStep) showReplayStep(step);
}

function endReplayPreview() {
  if (replayPreviewReturnStep === null) return;
  const step = replayPreviewReturnStep;
  replayPreviewReturnStep = null;
  if (step !== replayStep) showReplayStep(step);
}

function renderPathViewControls() {
  const available = pathViewAvailable();
  // After game end the transport shows under the board, its view toggles
  // with it.
  replayControls.hidden = !available;
  for (const button of pathViewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.pathView === settings.pathView));
  }
  for (const button of replayOverlayButtons) {
    button.setAttribute('aria-pressed',
      String(settings.replayOverlays[button.dataset.replayOverlay] === true));
  }
  if (available) renderReplaySlider();
}

// Slider range 0 … N (actions done), thumb label, previous/next state, and
// the end-position status. Frame statuses come from renderReplayFrame.
function renderReplaySlider() {
  const count = replayDecisionCount();
  const positions = count + 1;
  if (Number(replaySlider.max) !== count) {
    replaySlider.max = String(count);
    renderReplaySliderScale(positions);
  }
  replaySlider.disabled = count === 0;
  replaySlider.value = String(replayStep);
  replaySliderValue.textContent = String(replayStep);
  replaySliderValue.style.setProperty('--thumb',
    String(count === 0 ? 0.5 : replayStep / count));
  document.getElementById('replay-first').disabled = replayStep === 0;
  document.getElementById('replay-last').disabled = replayStep >= count;
  replayPrevious.disabled = replayStep === 0;
  replayNext.disabled = replayStep >= count;
  replayPlay.disabled = count === 0;
  renderReplayPlayButton();
  if (count === 0) {
    replayStatus.textContent = 'no decision frames were recorded for this game';
  } else if (replayStep >= count) {
    renderReplayEndStatus(replayEndStatusParts(count, finalTimeMs));
  }
}

// One mapper per drawing pass: points arrive in trace-time order, so the
// active layout event only ever advances.
function pathPointMapper(width, height) {
  const layouts = trace.events.filter((e) => e.kind === 'layout');
  let i = 0;
  return (t, x, y) => {
    while (i + 1 < layouts.length && layouts[i + 1].t <= t) i++;
    const geometry = layouts[i];
    return [
      (x - geometry.left) / geometry.width * width,
      (y - geometry.top) / geometry.height * height,
    ];
  };
}

function removePathCanvas() {
  if (pathCanvas !== null) {
    pathCanvas.remove();
    pathCanvas = null;
  }
}

function removeReplayCallouts() {
  const old = document.getElementById('replay-choice-areas');
  if (old !== null) old.remove();
}

// Labels uncertain connected choice areas just outside the board, with elbow
// leaders back to the actual cells. Vertical packing prevents nearby pockets'
// labels from hiding one another.
function renderReplayChoiceAreas(evaluation) {
  removeReplayCallouts();
  const areas = pathChoiceAreas(evaluation);
  if (areas.length === 0) return;
  const boardRect = boardElement.getBoundingClientRect();
  const resultRect = resultStats.textContent !== '' ? resultsBox.getBoundingClientRect() : null;
  const blocks = (rect) => rect !== null
    && rect.left < boardRect.right + 150
    && rect.right > boardRect.right
    && rect.top < boardRect.bottom
    && rect.bottom > boardRect.top;
  // Keep pocket labels out of the sidebar when it is near the board.
  const legendRect = !pathViewLegend.hidden
    ? pathViewLegend.getBoundingClientRect() : null;
  const rightBlocked = blocks(resultRect) || blocks(legendRect);
  const rightRoom = window.innerWidth - boardRect.right;
  const leftRoom = boardRect.left;
  const onRight = (!rightBlocked && rightRoom >= 150) || leftRoom < 150;
  const placed = areas.map((area) => {
    const rects = area.cells.map((cell) => cellElements[cell].getBoundingClientRect());
    return {
      area,
      anchorX: onRight
        ? Math.max(...rects.map((rect) => rect.right - boardRect.left))
        : Math.min(...rects.map((rect) => rect.left - boardRect.left)),
      anchorY: rects.reduce((sum, rect) =>
        sum + rect.top + rect.height / 2 - boardRect.top, 0) / rects.length,
    };
  }).sort((a, b) => a.anchorY - b.anchorY);
  const gap = 22;
  let nextY = 10;
  for (const item of placed) {
    item.labelY = Math.max(nextY, Math.min(boardRect.height - 10, item.anchorY));
    nextY = item.labelY + gap;
  }
  for (let i = placed.length - 2; i >= 0; i--) {
    placed[i].labelY = Math.min(placed[i].labelY, placed[i + 1].labelY - gap);
  }

  const layer = document.createElement('div');
  layer.id = 'replay-choice-areas';
  layer.className = onRight ? 'on-right' : 'on-left';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(boardRect.width));
  svg.setAttribute('height', String(boardRect.height));
  svg.setAttribute('aria-hidden', 'true');
  layer.appendChild(svg);
  for (const item of placed) {
    const edgeX = onRight ? boardRect.width + 4 : -4;
    const labelX = onRight ? boardRect.width + 9 : -9;
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', [
      item.anchorX + ',' + item.anchorY,
      edgeX + ',' + item.anchorY,
      edgeX + ',' + item.labelY,
      labelX + ',' + item.labelY,
    ].join(' '));
    line.setAttribute('class', 'replay-area-leader');
    svg.appendChild(line);
    const label = document.createElement('span');
    label.className = 'replay-area-label';
    if (onRight) label.style.left = (boardRect.width + 11) + 'px';
    else label.style.right = (boardRect.width + 11) + 'px';
    label.style.top = (item.labelY - 9) + 'px';
    label.textContent = pathRiskLabel(item.area.risk)
      + ' · ' + item.area.cells.length + ' cell'
      + (item.area.cells.length === 1 ? '' : 's');
    layer.appendChild(label);
  }
  boardElement.appendChild(layer);
}

// Re-places the pocket labels for the shown frame (called when the space
// beside the board changes after the frame was painted).
function refreshReplayChoiceAreas() {
  if (!replayEnabled || !pathViewAvailable()) return;
  const decisions = pathDecisionEvents(trace.events);
  if (replayStep >= decisions.length) return;
  renderReplayChoiceAreas(decisions[replayStep].evaluation);
}

// The finished board as the game board shows it: its own squares, or the
// copy kept while a replay frame is painted over them.
function finishedBoardCells() {
  return replayFinishedCells === null ? cellElements : replayFinishedCells;
}

function restoreFinishedBoard() {
  removeReplayCallouts();
  if (replayFinishedCells === null) return;
  for (let i = 0; i < cellElements.length; i++) {
    cellElements[i].className = replayFinishedCells[i].className;
    cellElements[i].innerHTML = replayFinishedCells[i].innerHTML;
  }
  replayFinishedCells = null;
}

// Full-knowledge solver reading of one replay position: the exact mine
// chance of every covered cell, the proven mines and safes, and the full move
// option set from replayMoveOptions: chords available now and
// mark-mine-then-chord combos, each with the exact cells the chord would
// open and whether every one of them is proven clear. A solver exception
// propagates (Anti-Fallback Principle).
function replaySolverRead(position) {
  const view = positionView(position);
  const size = position.width * position.height;
  const revealed = view.revealed;
  const flagged = positionFlags(position);
  const odds = Odds.analyzeView(view);
  const facts = odds.structure.facts;
  const provenMines = [];
  const provenSafe = [];
  for (let i = 0; i < size; i++) {
    if (revealed[i]) continue;
    if (facts.get(i) === 1) provenMines.push(i);
    else if (facts.get(i) === 2) provenSafe.push(i);
  }
  const { chords, flagChords } = replayMoveOptions(view, flagged, facts);
  return { pMine: odds.pMine, facts, provenMines, provenSafe, chords, flagChords };
}

function replaySolverAt(step, position) {
  let read = replaySolverCache.get(step);
  if (read === undefined) {
    read = replaySolverRead(position);
    replaySolverCache.set(step, read);
  }
  return read;
}

// Fills the solver cache for every decision frame in short main-thread
// slices once review mode is on, so scrubbing the slider never waits on
// an enumeration: the shown frame is solved synchronously, the rest arrive
// in the idle gaps between inputs. Cancelled whenever the trace it reads
// stops being the current one.
let replayPrecomputeTimer = 0;

function cancelReplayPrecompute() {
  if (replayPrecomputeTimer !== 0) {
    clearTimeout(replayPrecomputeTimer);
    replayPrecomputeTimer = 0;
  }
}

function scheduleReplayPrecompute() {
  cancelReplayPrecompute();
  const decisions = pathDecisionEvents(trace.events);
  let next = 0;
  const sliceMs = 8;
  const work = () => {
    replayPrecomputeTimer = 0;
    const deadline = performance.now() + sliceMs;
    while (next < decisions.length && performance.now() < deadline) {
      replaySolverAt(next, decisions[next].evaluation.position);
      next++;
    }
    if (next < decisions.length) replayPrecomputeTimer = setTimeout(work, 0);
  };
  replayPrecomputeTimer = setTimeout(work, 0);
}

// Publishes every encoding color as a CSS custom property so the stylesheet,
// the legend swatches, and the canvas painter all read the one table.
function applyReplayEncodingColors() {
  for (const [key, encoding] of Object.entries(REPLAY_ENCODINGS)) {
    document.documentElement.style.setProperty('--replay-' + key, encoding.color);
  }
}
applyReplayEncodingColors();

// Notches for every position (thinned above 60) plus black numeric labels
// at both ends and three interior quarters, so the game-history slider's
// scale is readable without hovering anything. Positions are 0 … N actions
// done, so the labels read 0 at the left and N at the right.
function renderReplaySliderScale(positions) {
  replaySliderScale.replaceChildren();
  if (positions < 1) return;
  const positionOf = (step) => positions === 1 ? 50 : step / (positions - 1) * 100;
  const notchEvery = Math.max(1, Math.ceil(positions / 60));
  for (let step = 0; step < positions; step += notchEvery) {
    const notch = document.createElement('span');
    notch.className = 'replay-slider-notch';
    notch.style.left = positionOf(step) + '%';
    replaySliderScale.appendChild(notch);
  }
  const labelSteps = [...new Set([
    0,
    Math.round((positions - 1) * 0.25),
    Math.round((positions - 1) * 0.5),
    Math.round((positions - 1) * 0.75),
    positions - 1,
  ])].sort((a, b) => a - b);
  for (const step of labelSteps) {
    const label = document.createElement('span');
    label.className = 'replay-slider-label';
    label.style.left = positionOf(step) + '%';
    label.textContent = String(step);
    replaySliderScale.appendChild(label);
  }
}

// Translates the frame model onto the board's squares: base classes from the
// stored position, one `replay-<key>` class per encoding, the glyph or
// flag/mine icon, then the mark-mine hint and the probability badge.
function paintReplayFrame(model) {
  for (let i = 0; i < cellElements.length; i++) {
    const element = cellElements[i];
    const cell = model.cells[i];
    const classes = ['cell', cell.revealed ? 'revealed' : 'hidden'];
    if (cell.revealed && cell.adjacent > 0) classes.push('n' + cell.adjacent);
    for (const key of cell.marks) classes.push('replay-' + key);
    element.className = classes.join(' ');
    if (cell.revealed) {
      paintCellGlyph(element, cell.adjacent);
      continue;
    }
    element.innerHTML = cell.flagged ? chosenFlagSvg()
      : cell.marks.has('mine') ? mineSvg(settings.mineStyle) : '';
    if (cell.marks.has('mark-mine')) {
      const hint = document.createElement('span');
      hint.className = 'replay-flag-hint';
      hint.innerHTML = chosenFlagSvg();
      element.appendChild(hint);
    }
    if (cell.badge !== null) {
      const badge = document.createElement('span');
      badge.className = 'replay-prob';
      badge.textContent = cell.badge;
      element.appendChild(badge);
    }
  }
}

// Values (action number, in-game time, action kind) are the largest text
// in the status; the words around them are secondary.
function renderReplayStatus(parts) {
  const value = (text) => {
    const span = document.createElement('span');
    span.className = 'replay-status-value';
    span.textContent = text;
    return span;
  };
  replayStatus.replaceChildren(
    value(parts.done), ' of ' + parts.count + ' actions done · deciding at ',
    value(parts.time), ' · next: ', value(parts.action),
    ' · ' + parts.choices);
}

function renderReplayEndStatus(parts) {
  replayStatus.textContent = parts.done + ' / ' + parts.count + ' actions · Finished board';
  lastReplayToM = null;
  if (replayMentationPanel && !replayMentationPanel.hidden) {
    replayMentationPanel.hidden = true;
    replayMentationPanel.replaceChildren();
  }
  if (replayMentation && replayMentation.dataset.mode !== 'end') {
    replayMentation.dataset.mode = 'end';
    const heading = document.createElement('span');
    heading.className = 'path-view-heading';
    heading.textContent = 'Mentation';
    const copy = document.createElement('span');
    copy.className = 'replay-mentation-copy';
    copy.textContent = 'Step back (<) to inspect simulated attention, misclick/misread analysis, and deduction proof ';
    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.textContent = 'First notable move >>';
    jumpBtn.addEventListener('click', () => jumpNotableReplayStep(1));
    replayMentation.replaceChildren(heading, copy, jumpBtn);
  }
}

function renderReplayMentation(step, decisions, evaluation, solver) {
  const tom = replayTheoryOfMind(step, decisions, trace, solver);
  lastReplayToM = tom;
  for (const wIdx of tom.deduction.witnessClues || []) {
    if (cellElements[wIdx]) cellElements[wIdx].classList.add('replay-witness');
  }

  if (replayMentation) {
    replayMentation.dataset.mode = 'step';
    const heading = document.createElement('span');
    heading.className = 'path-view-heading';
    heading.textContent = 'Mentation';
    const summary = document.createElement('span');
    summary.className = 'replay-mentation-copy';
    const primaryHeadline = tom.intent.kind !== 'deliberate' ? tom.intent.headline : tom.deduction.statusLabel;
    const strong = document.createElement('strong');
    strong.textContent = 'Move ' + (step + 1) + '/' + decisions.length + ': ' + primaryHeadline;
    summary.append(strong, ' \u00b7 ' + tom.attention.headline);
    const prevNotable = document.createElement('button');
    prevNotable.type = 'button';
    prevNotable.textContent = '<< Prev notable';
    prevNotable.title = 'Jump to previous misclick, guess, detour, attention tunnel, or slow move';
    prevNotable.addEventListener('click', () => jumpNotableReplayStep(-1));
    const nextNotable = document.createElement('button');
    nextNotable.type = 'button';
    nextNotable.textContent = 'Next notable >>';
    nextNotable.title = 'Jump to next misclick, guess, detour, attention tunnel, or slow move';
    nextNotable.addEventListener('click', () => jumpNotableReplayStep(1));
    replayMentation.replaceChildren(heading, summary, prevNotable, nextNotable);
  }

  if (!replayMentationPanel) return;
  const buildCard = () => {
    const box = document.createElement('div');
    box.className = 'replay-tom-card';

    const title = document.createElement('div');
    title.className = 'replay-tom-head';
    title.textContent = 'Mentation (Theory of Mind \u00b7 ' + tom.modelVersion + ') \u2014 Move '
      + (step + 1) + ' of ' + decisions.length
      + (tom.gapMs !== null ? ' (' + tom.gapMs + ' ms)' : '');
    box.appendChild(title);

    const addSection = (cls, label, headline, detail) => {
      const sec = document.createElement('div');
      sec.className = 'replay-tom-section ' + cls;
      const h = document.createElement('div');
      h.className = 'replay-tom-label';
      h.textContent = label + ': ' + headline;
      const p = document.createElement('p');
      p.className = 'replay-tom-detail';
      p.textContent = detail;
      sec.append(h, p);
      box.appendChild(sec);
    };

    addSection('replay-tom-attention', '1. Where you were looking & thinking', tom.attention.headline, tom.attention.narrative);
    addSection(
      tom.intent.kind !== 'deliberate' ? 'replay-tom-intent-alert' : 'replay-tom-intent',
      '2. Intent vs. execution',
      tom.intent.headline,
      tom.intent.detail,
    );
    addSection(
      'replay-tom-deduction',
      '3. What was known & how it was known',
      tom.deduction.statusLabel,
      tom.deduction.howKnown + ' ' + tom.deduction.boardSummary + '.',
    );

    // Inline ground-truth calibration persisted to userdata['mentationFeedback']
    const endedAt = (renderedResult && renderedResult.record && renderedResult.record.endedAt)
      || (trace && trace.endedAt) || 0;
    const fbKey = endedAt + ':' + step;
    const existing = replayFeedbackCache && replayFeedbackCache.entries ? replayFeedbackCache.entries[fbKey] || null : null;
    let currentVerdict = existing ? existing.verdict : null;
    const selectedReasons = new Set(existing && Array.isArray(existing.reasons) ? existing.reasons : []);

    const fbWrap = document.createElement('div');
    fbWrap.className = 'replay-tom-calibrate';
    const fbTitle = document.createElement('div');
    fbTitle.className = 'replay-tom-label';
    fbTitle.textContent = '4. Calibrate: did the model simulate your thinking accurately?';
    const verdictRow = document.createElement('div');
    verdictRow.className = 'replay-tom-verdict-row';
    const badge = document.createElement('span');
    badge.className = 'replay-tom-badge';
    badge.textContent = existing ? 'Saved: ' + existing.verdict.toUpperCase() : 'Not rated yet';

    let noteInput = null;
    const persistFeedback = () => {
      if (!currentVerdict || !endedAt) return;
      if (replayFeedbackCache === null) replayFeedbackCache = { version: 1, entries: {} };
      const claimType = tom.intent.kind !== 'deliberate' ? tom.intent.kind : tom.attention.mode;
      const claimHeadline = tom.intent.kind !== 'deliberate' ? tom.intent.headline : tom.attention.headline;
      replayFeedbackCache.entries[fbKey] = {
        endedAt,
        level: config.width === 30 ? 'Expert' : config.width === 16 ? 'Intermediate' : 'Beginner',
        outcome: gameState === 'won' ? 'win' : 'loss',
        stepIndex: step,
        atMs: Number.isFinite(evaluation.atMs) ? Math.round(evaluation.atMs) : 0,
        kind: evaluation.action,
        col: tom.trigger !== null ? (tom.trigger % config.width) + 1 : 0,
        row: tom.trigger !== null ? Math.floor(tom.trigger / config.width) + 1 : 0,
        pressGapMs: tom.gapMs,
        dist: tom.distCells,
        modelVersion: tom.modelVersion,
        claimType,
        claimHeadline,
        deductionStatus: tom.deduction.statusLabel,
        verdict: currentVerdict,
        reasons: [...selectedReasons],
        note: noteInput ? noteInput.value.trim() : '',
        updatedAt: Date.now(),
      };
      if (typeof persistUserdata === 'function') persistUserdata('mentationFeedback', replayFeedbackCache);
      badge.textContent = 'Saved: ' + currentVerdict.toUpperCase();
    };

    const buttons = [
      ['accurate', 'Accurate'],
      ['partly', 'Partly right'],
      ['wrong', 'Wrong'],
    ].map(([id, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-button';
      b.dataset.verdict = id;
      b.textContent = text;
      b.setAttribute('aria-pressed', currentVerdict === id ? 'true' : 'false');
      b.addEventListener('click', () => {
        currentVerdict = id;
        for (const other of buttons) other.setAttribute('aria-pressed', other.dataset.verdict === id ? 'true' : 'false');
        persistFeedback();
      });
      return b;
    });
    verdictRow.append(...buttons, badge);

    const reasonsGrid = document.createElement('div');
    reasonsGrid.className = 'replay-tom-reasons';
    for (const r of REPLAY_MENTATION_REASONS) {
      const lbl = document.createElement('label');
      lbl.className = 'replay-tom-reason';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedReasons.has(r.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedReasons.add(r.id);
        else selectedReasons.delete(r.id);
        if (!currentVerdict) {
          currentVerdict = 'partly';
          for (const other of buttons) other.setAttribute('aria-pressed', other.dataset.verdict === 'partly' ? 'true' : 'false');
        }
        persistFeedback();
      });
      lbl.append(cb, ' ' + r.label);
      reasonsGrid.appendChild(lbl);
    }

    noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'replay-tom-note';
    noteInput.placeholder = 'Optional note: what were you actually looking at or thinking?';
    noteInput.value = existing && existing.note ? existing.note : '';
    noteInput.addEventListener('change', () => {
      if (!currentVerdict && noteInput.value.trim() !== '') {
        currentVerdict = 'partly';
        for (const other of buttons) other.setAttribute('aria-pressed', other.dataset.verdict === 'partly' ? 'true' : 'false');
      }
      persistFeedback();
    });

    const footLink = document.createElement('a');
    footLink.className = 'replay-tom-foot-link';
    footLink.href = 'training.html#training-inspector';
    footLink.textContent = 'View calibration accuracy scoreboard & export feedback on Training & Mentation \u2192';

    fbWrap.append(fbTitle, verdictRow, reasonsGrid, noteInput, footLink);
    box.appendChild(fbWrap);

    replayMentationPanel.replaceChildren(box);
    replayMentationPanel.hidden = false;
  };

  if (replayFeedbackCache === null) {
    ensureReplayFeedbackLoaded(() => {
      if (replayEnabled && lastReplayToM === tom) buildCard();
    });
  }
  buildCard();
}

function renderReplayFrame() {
  const decisions = pathDecisionEvents(trace.events);
  if (replayFinishedCells === null) {
    replayFinishedCells = cellElements.map((element) => ({
      className: element.className,
      innerHTML: element.innerHTML,
    }));
  }
  replayStep = Math.max(0, Math.min(decisions.length - 1, replayStep));
  const evaluation = decisions[replayStep].evaluation;
  const position = evaluation.position;
  const solver = replaySolverAt(replayStep, position);
  const wantSolver = settings.replayOverlays.moves || settings.replayOverlays.mines
    || settings.replayOverlays.probs;
  const model = replayFrameModel(evaluation, wantSolver ? solver : null, settings.replayOverlays);
  paintReplayFrame(model);
  renderReplayChoiceAreas(evaluation);
  renderReplayStatus(replayStatusParts(replayStep, decisions.length, evaluation));
  renderReplayMentation(replayStep, decisions, evaluation, solver);
  renderPathOverlay();
}

function pathSegments(decisions, travel) {
  const segments = [];
  let nextDecision = 0;
  for (let i = 1; i < trace.t.length; i++) {
    while (decisions.length > 0 && nextDecision + 1 < decisions.length
        && decisions[nextDecision].t < trace.t[i]) {
      nextDecision++;
    }
    const decision = decisions[nextDecision] || null;
    const dt = trace.t[i] - trace.t[i - 1];
    if (dt <= 0) continue;
    // A data gap has no movement samples inside it, so it carries no real
    // speed; it is drawn as a dashed connector instead of a colored stroke.
    const gap = dt >= PATH_GAP_MS;
    let value;
    if (settings.pathView === 'movement-speed') {
      if (!gap) value = travel[i] * 1000 / dt;
    } else if (settings.pathView === 'click-speed' && decision !== null && nextDecision > 0) {
      const clickGap = decision.t - decisions[nextDecision - 1].t;
      if (clickGap > 0) value = 1000 / clickGap;
    } else if (settings.pathView === 'progress' && decision !== null) {
      value = pathDecisionProgress(decision);
    }
    segments.push({
      from: i - 1,
      to: i,
      decision,
      decisionIndex: nextDecision,
      value,
      gap,
    });
  }
  return segments;
}

function pathTimeColor(t, endT) {
  const fraction = endT > 0 ? Math.max(0, Math.min(1, t / endT)) : 0;
  return 'hsl(211, 85%, ' + (78 - 56 * fraction).toFixed(1) + '%)';
}

function appendPathLegendRow(legendTarget, title, keys, note) {
  const row = document.createElement('div');
  row.className = 'path-legend-row';
  const heading = document.createElement('span');
  heading.className = 'path-legend-title';
  heading.textContent = title;
  row.appendChild(heading);
  for (const key of keys) {
    const item = document.createElement('span');
    item.className = 'path-legend-key';
    item.append(pathLegendSwatch(key), pathLegendText(key));
    row.appendChild(item);
  }
  if (note) {
    const noteEl = document.createElement('span');
    noteEl.className = 'path-legend-note';
    noteEl.textContent = note;
    row.appendChild(noteEl);
  }
  legendTarget.appendChild(row);
}

// A legend item's wording: the meaning is the headline; the look words and
// any detail sit beneath it in one smaller line, so a reader gets "what it
// is" first and "how it is drawn / the fine print" second. Path-view keys
// that carry only a `label` show that label as the headline. Nothing is
// ever shortened.
function pathLegendText(key) {
  const text = document.createElement('span');
  text.className = 'path-legend-text';
  const headline = document.createElement('span');
  headline.className = 'path-legend-means';
  headline.textContent = key.means || key.label;
  text.appendChild(headline);
  const fine = [key.look, key.detail].filter(Boolean);
  if (key.means && fine.length > 0) {
    const line = document.createElement('span');
    line.className = 'path-legend-detail';
    line.textContent = fine.join(' \u00b7 ');
    text.appendChild(line);
  }
  return text;
}

// One swatch per encoding form, so a legend item shows the same shape the
// board draws: a line, a dot/ring marker, a solid or dashed cell ring, a
// fill, a mini flag, a numeric badge, a crosshair, or a pocket leader.
// `key.dot` is the older spelling of form 'dot'.
function pathLegendSwatch(key) {
  const form = key.form || (key.dot ? 'dot' : 'line');
  const swatch = document.createElement('span');
  swatch.className = 'path-legend-swatch form-' + form;
  swatch.style.setProperty('--swatch-color', key.color);
  if (form === 'flag') swatch.innerHTML = chosenFlagSvg();
  else if (form === 'badge') swatch.textContent = '17';
  else if (form === 'crosshair') swatch.textContent = '\u2316';
  else if (form === 'leader') swatch.textContent = '\u2192';
  return swatch;
}

function appendPathGradientLegend(legendTarget, title, range, format, options = {}) {
  if (range === undefined) {
    appendPathLegendRow(legendTarget, title, [], 'not enough measured movement');
    return;
  }
  if (range.max <= range.min) {
    appendPathLegendRow(legendTarget, title, [{
      color: options.time ? 'hsl(211, 85%, 50%)' : pathHeatColor(range.min, range),
      label: format(range.min),
    }], 'all measured segments have the same value');
    return;
  }
  const row = document.createElement('div');
  row.className = 'path-legend-row';
  const heading = document.createElement('span');
  heading.className = 'path-legend-title';
  heading.textContent = title;
  const scale = document.createElement('span');
  scale.className = 'path-gradient-scale';
  const low = document.createElement('span');
  low.textContent = format(range.min);
  const barWrap = document.createElement('span');
  const bar = document.createElement('span');
  bar.className = 'path-gradient-bar'
    + (options.time ? ' path-time-gradient' : '');
  const mid = document.createElement('span');
  mid.className = 'path-gradient-mid';
  mid.textContent = format((range.min + range.max) / 2);
  barWrap.append(bar, mid);
  const high = document.createElement('span');
  high.textContent = format(range.max);
  scale.append(low, barWrap, high);
  row.append(heading, scale);
  if (range.trimmed > 0) {
    const note = document.createElement('span');
    note.className = 'path-legend-note';
    note.textContent = range.trimmed + ' extreme segment'
      + (range.trimmed === 1 ? '' : 's') + ' clipped to the shown color range';
    row.appendChild(note);
  }
  legendTarget.appendChild(row);
}

function appendReplayLegend(legendTarget) {
  if (!replayEnabled) return;
  for (const row of replayLegendRows(settings.replayOverlays)) {
    appendPathLegendRow(legendTarget, row.title,
      row.keys.map((key) => REPLAY_ENCODINGS[key]), row.note);
  }
}

//-------PATH REPLAY: CANVAS PAINTING + INTERPRETIVE LEGENDS-------

const PATH_POLYLINE_VIEWS = new Set([
  'raw-path', 'movement-speed', 'click-speed', 'progress',
]);
const PATH_LEGEND_BIN_COUNT = 6;

function ensurePathTooltip() {
  if (pathTooltipEl === null) {
    pathTooltipEl = document.createElement('div');
    pathTooltipEl.className = 'path-tooltip';
    pathTooltipEl.hidden = true;
    document.body.appendChild(pathTooltipEl);
  }
  return pathTooltipEl;
}

function showPathTooltip(clientX, clientY, text) {
  const tip = ensurePathTooltip();
  tip.textContent = text;
  tip.hidden = false;
  const pad = 12;
  tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 4,
    clientX + pad) + 'px';
  tip.style.top = Math.max(4, clientY - tip.offsetHeight - pad) + 'px';
}

function hidePathTooltip() {
  if (pathTooltipEl !== null) pathTooltipEl.hidden = true;
}

function setPathHighlightBin(bin) {
  if (pathHighlightBin === bin) return;
  pathHighlightBin = bin;
  if (lastPathState === null) return;
  if (lastPathState.legend !== null) {
    lastPathState.legend.chips.forEach((chip, k) =>
      chip.classList.toggle('hot', k === bin));
  }
  paintPathCanvas();
}

// Binned interpretive legend for a continuous path parameter: one chip per
// color class with its exact numeric interval. Hovering a chip spotlights
// that class's path segments; hovering the path lights the matching chip.
function appendPathBinLegend(legendTarget, title, range, format, options = {}) {
  if (range === undefined) {
    appendPathLegendRow(legendTarget, title, [], 'not enough measured movement');
    return null;
  }
  const colorFor = options.time
    ? (value) => pathTimeColor(value, range.max)
    : (value) => pathHeatColor(value, range);
  if (range.max <= range.min) {
    appendPathLegendRow(legendTarget, title, [{
      color: colorFor(range.min),
      label: format(range.min),
    }], 'all measured segments have the same value');
    return null;
  }
  const bins = pathValueBins(range, PATH_LEGEND_BIN_COUNT);
  const row = document.createElement('div');
  row.className = 'path-legend-row';
  const heading = document.createElement('span');
  heading.className = 'path-legend-title';
  heading.textContent = title;
  row.appendChild(heading);
  const chips = bins.map((bin, k) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'path-bin-chip';
    chip.title = 'hover to spotlight these path segments';
    const swatch = document.createElement('span');
    swatch.className = 'path-legend-swatch';
    swatch.style.background = colorFor((bin.min + bin.max) / 2);
    const label = document.createElement('span');
    label.textContent = format(bin.min) + '–' + format(bin.max);
    chip.append(swatch, label);
    chip.addEventListener('mouseenter', () => setPathHighlightBin(k));
    chip.addEventListener('mouseleave', () => setPathHighlightBin(-1));
    chip.addEventListener('focus', () => setPathHighlightBin(k));
    chip.addEventListener('blur', () => setPathHighlightBin(-1));
    row.appendChild(chip);
    return chip;
  });
  if (range.trimmed > 0) {
    const note = document.createElement('span');
    note.className = 'path-legend-note';
    note.textContent = range.trimmed + ' extreme segment'
      + (range.trimmed === 1 ? '' : 's') + ' clipped to the shown color range';
    row.appendChild(note);
  }
  legendTarget.appendChild(row);
  return { bins, chips, colorFor, format };
}

function pathGapDurationText(dtMs) {
  return dtMs < 1000
    ? Math.round(dtMs) + 'ms away'
    : (dtMs / 1000).toFixed(1) + 's away';
}

// Everything visual on the canvas, painted from lastPathState so a legend
// hover can repaint with a spotlight without rebuilding legends or state.
function paintPathCanvas() {
  const state = lastPathState;
  if (state === null || pathCanvas === null) return;
  const ctx = state.ctx;
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const spotlight = pathHighlightBin >= 0 && state.legend !== null;

  if (state.drawView) {
    ctx.lineWidth = settings.pathView === 'raw-path' ? 3 : 4.25;
    for (const segment of state.segments) {
      if (trace.t[segment.to] > state.cutoff) continue;
      const role = state.lessRoles[segment.decisionIndex];
      if (segment.gap && PATH_POLYLINE_VIEWS.has(settings.pathView)) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.75;
        ctx.strokeStyle = '#78909c';
        ctx.beginPath();
        ctx.moveTo(state.points[segment.from][0], state.points[segment.from][1]);
        ctx.lineTo(state.points[segment.to][0], state.points[segment.to][1]);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const show = settings.pathView === 'raw-path'
        || (settings.pathView === 'less-useful'
          ? role && (role.less || role.after)
          : settings.pathView !== 'click-locations' && Number.isFinite(segment.value));
      if (!show) continue;
      if (settings.pathView === 'raw-path') {
        ctx.strokeStyle = pathTimeColor(trace.t[segment.to], state.endT);
      } else if (settings.pathView === 'less-useful') {
        ctx.strokeStyle = role.less ? '#d95f02' : '#2e7d32';
      } else {
        ctx.strokeStyle = pathHeatColor(segment.value, state.range);
      }
      let alpha = 1;
      let width = settings.pathView === 'raw-path' ? 3 : 4.25;
      if (spotlight) {
        const binValue = settings.pathView === 'raw-path'
          ? trace.t[segment.to] : segment.value;
        if (pathBinIndex(state.legend.bins, binValue) === pathHighlightBin) {
          width += 1.75;
        } else {
          alpha = 0.14;
        }
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(state.points[segment.from][0], state.points[segment.from][1]);
      ctx.lineTo(state.points[segment.to][0], state.points[segment.to][1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const drawDot = (x, y, color, radius = 4) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };
  const drawLabel = (x, y, text, color) => {
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, x + 6, y - 5);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 6, y - 5);
  };

  // Off-screen durations: a dashed connector says data is missing; the label
  // says exactly how long the cursor was away.
  if (state.drawView && PATH_POLYLINE_VIEWS.has(settings.pathView)) {
    for (const gap of state.gaps) {
      if (gap.kind !== 'away' || trace.t[gap.to] > state.cutoff) continue;
      const midX = (state.points[gap.from][0] + state.points[gap.to][0]) / 2;
      const midY = (state.points[gap.from][1] + state.points[gap.to][1]) / 2;
      drawLabel(midX, midY, pathGapDurationText(gap.dtMs), '#37474f');
    }
  }

  if (state.drawView
      && (settings.pathView === 'raw-path' || settings.pathView === 'click-locations')) {
    for (let i = 0; i < state.clicks.length; i++) {
      const click = state.clicks[i];
      if (click.t > state.cutoff) continue;
      const color = click.kind === 'rdown' ? '#c62828'
        : click.action === 'chord' ? '#2e7d32' : '#174ea6';
      drawDot(click.px, click.py, color, settings.pathView === 'click-locations' ? 4.5 : 4);
      if (settings.pathView === 'click-locations') {
        drawLabel(click.px, click.py, String(i + 1), color);
      }
    }
  }

  if (state.drawView && settings.pathView === 'less-useful') {
    for (let i = 0; i < state.decisionPoints.length; i++) {
      const decision = state.decisionPoints[i];
      if (decision.t > state.cutoff) continue;
      const role = state.lessRoles[i];
      if (!(role.before || role.less || role.after)) continue;
      const color = role.less ? '#d95f02' : role.after ? '#2e7d32' : '#174ea6';
      drawDot(decision.px, decision.py, color);
      if (i > 0 && (role.less || role.after)) {
        const gap = decision.t - state.decisionPoints[i - 1].t;
        drawLabel(decision.px, decision.py, gap < 1000 ? Math.round(gap) + 'ms'
          : (gap / 1000).toFixed(2) + 's', color);
      }
    }
  }

  // Review mode action markers are hollow rings with a white halo, so the
  // number glyph, flag, or badge under the exact click spot stays readable.
  const drawRingMarker = (x, y, color, radius = 5.5) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 2.25;
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  if (replayEnabled) {
    // Rough-movement underlay up to the shown moment.
    if (settings.replayOverlays.movement && state.rough !== null) {
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = REPLAY_ENCODINGS.movement.color;
      ctx.globalAlpha = 0.85;
      for (let i = 1; i < trace.t.length; i++) {
        if (!state.rough[i] || trace.t[i] > state.cutoff) continue;
        ctx.beginPath();
        ctx.moveTo(state.points[i - 1][0], state.points[i - 1][1]);
        ctx.lineTo(state.points[i][0], state.points[i][1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Pointless / purposeful click layers up to the shown moment.
    if (settings.replayOverlays.pointless || settings.replayOverlays.purposeful) {
      for (let i = 0; i < state.decisionPoints.length; i++) {
        const decision = state.decisionPoints[i];
        if (decision.t > state.cutoff) continue;
        const less = decision.less;
        if (less && settings.replayOverlays.pointless) {
          const color = REPLAY_ENCODINGS.pointless.color;
          drawRingMarker(decision.px, decision.py, color);
          drawLabel(decision.px, decision.py, String(i + 1), color);
        } else if (!less && settings.replayOverlays.purposeful) {
          const color = REPLAY_ENCODINGS.purposeful.color;
          drawRingMarker(decision.px, decision.py, color);
          drawLabel(decision.px, decision.py, String(i + 1), color);
        }
      }
    }
    // The exact input spot of the displayed action — for a chord, the pixel
    // the chord was performed at.
    const current = state.decisionPoints[state.replayIndex];
    if (current !== undefined) {
      const gold = REPLAY_ENCODINGS.crosshair.color;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(current.px, current.py, 8, 0, 2 * Math.PI);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(current.px, current.py, 8, 0, 2 * Math.PI);
      ctx.lineWidth = 2.25;
      ctx.strokeStyle = gold;
      ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath();
        ctx.moveTo(current.px + dx * 4, current.py + dy * 4);
        ctx.lineTo(current.px + dx * 12, current.py + dy * 12);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(current.px + dx * 4, current.py + dy * 4);
        ctx.lineTo(current.px + dx * 12, current.py + dy * 12);
        ctx.lineWidth = 2;
        ctx.strokeStyle = gold;
        ctx.stroke();
      }
      // The action word gets a solid pill so it stays readable over cell
      // rings and glyphs. It is centered just above the crosshair arms, so
      // it never covers the acted square itself, and clamped to the canvas
      // so it never runs off the board edge.
      ctx.font = 'bold 10px Arial, sans-serif';
      const text = current.action;
      const textWidth = ctx.measureText(text).width;
      const pillW = textWidth + 8;
      const pillH = 14;
      const pillX = Math.max(2, Math.min(state.width - pillW - 2, current.px - pillW / 2));
      const pillY = Math.max(2, Math.min(state.height - pillH - 2, current.py - 14 - pillH));
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = gold;
      ctx.stroke();
      ctx.fillStyle = '#8a6100';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, pillX + 4, pillY + pillH / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
    // Theory-of-Mind board overlays: simulated visual attention focus halo,
    // abandoned frontier check ring, and misclick intended-aim arrow.
    if (lastReplayToM !== null && config.width > 0 && config.height > 0) {
      const cellW = state.width / (config.width + 0.25);
      const cellH = state.height / (config.height + 0.25);
      const cellToPx = (cx, cy) => [(cx + 0.125) * cellW, (cy + 0.125) * cellH];

      const focus = lastReplayToM.attention.focusCells || [];
      if (focus.length > 0) {
        let minC = config.width;
        let maxC = -1;
        let minR = config.height;
        let maxR = -1;
        for (const cIdx of focus) {
          const c = cIdx % config.width;
          const r = Math.floor(cIdx / config.width);
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
        }
        const [fx0, fy0] = cellToPx(minC - 0.15, minR - 0.15);
        const [fx1, fy1] = cellToPx(maxC + 1.15, maxR + 1.15);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(fx0, fy0, fx1 - fx0, fy1 - fy0, 6);
        ctx.fillStyle = 'rgba(0, 87, 217, 0.06)';
        ctx.fill();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 87, 217, 0.58)';
        ctx.stroke();
        ctx.restore();
      }

      const ab = lastReplayToM.attention.abandonedFocus;
      if (ab !== null) {
        const [ax, ay] = cellToPx(ab.x, ab.y);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.arc(ax, ay, cellW * 0.9, 0, Math.PI * 2);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#6e22a8';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 10px Arial, sans-serif';
        const lbl = 'checked ' + ab.durMs + 'ms';
        const lw = ctx.measureText(lbl).width + 8;
        const lx = Math.max(2, Math.min(state.width - lw - 2, ax - lw / 2));
        const ly = Math.max(2, ay - cellW * 0.9 - 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.fillRect(lx, ly, lw, 14);
        ctx.strokeStyle = '#6e22a8';
        ctx.lineWidth = 1;
        ctx.strokeRect(lx, ly, lw, 14);
        ctx.fillStyle = '#5a189a';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, lx + 4, ly + 7.5);
        ctx.restore();
      }

      if (lastReplayToM.intent.kind === 'spatial-aim-slip' && lastReplayToM.intent.intendedCell !== null && current !== undefined) {
        const ic = lastReplayToM.intent.intendedCell;
        const [ix, iy] = cellToPx((ic % config.width) + 0.5, Math.floor(ic / config.width) + 0.5);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.moveTo(current.px, current.py);
        ctx.lineTo(ix, iy);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#d95f02';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ix, iy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#d95f02';
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function renderPathOverlay() {
  // Build the whole legend offscreen before replacing it. Clearing the live
  // legend before measuring the board temporarily shrinks the sidebar and
  // clamps its scroll position, even within one synchronous render.
  const legendTarget = document.createDocumentFragment();
  buildPathOverlay(legendTarget);
  pathViewLegend.replaceChildren(legendTarget);
  pathViewLegend.hidden = pathViewLegend.childElementCount === 0;
  scheduleBoardLayout();
}

function buildPathOverlay(legendTarget) {
  removePathCanvas();
  pathHighlightBin = -1;
  lastPathState = null;
  hidePathTooltip();
  if (!pathViewAvailable()) return;
  const decisions = pathDecisionEvents(trace.events);
  const drawView = settings.pathView !== 'off'
    && (decisions.length > 0 || settings.pathView === 'raw-path');
  if (settings.pathView !== 'off' && !drawView) {
    appendPathLegendRow(legendTarget, 'path', [], 'no recorded decision locations');
  }
  // Review mode keeps a canvas alive even with the path off: the exact
  // click-spot crosshair and the click/movement layers live there.
  if (!drawView && !replayEnabled) {
    appendReplayLegend(legendTarget);
    return;
  }
  const rect = boardElement.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.id = 'path-canvas';
  // The layout events measured the board's border box; absolute children
  // are placed relative to the padding box, so the canvas backs out by
  // the border widths to cover exactly what was measured.
  canvas.style.left = -boardElement.clientLeft + 'px';
  canvas.style.top = -boardElement.clientTop + 'px';
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  const scale = window.devicePixelRatio;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  boardElement.appendChild(canvas);
  pathCanvas = canvas;
  if (pathResizeObserver === null) {
    pathResizeObserver = new ResizeObserver(() => {
      if (pathCanvas === null) return;
      if (replayEnabled) renderReplayFrame();
      else renderPathOverlay();
    });
    pathResizeObserver.observe(boardElement);
  }
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const travel = sampleTravelPx(trace.x, trace.y, liveMergedObservations());
  const segments = drawView ? pathSegments(decisions, travel) : [];
  const endT = trace.t.length === 0 ? 0 : trace.t[trace.t.length - 1];
  const replayIndex = Math.max(0, Math.min(decisions.length - 1, replayStep));
  const cutoff = replayEnabled && decisions.length > 0
    ? decisions[replayIndex].t
    : Infinity;
  const range = settings.pathView === 'progress'
    ? { min: 0, max: 1, trimmed: 0 }
    : pathDisplayRange(segments.map((segment) => segment.value));
  let legend = null;
  const gaps = drawView && PATH_POLYLINE_VIEWS.has(settings.pathView)
    ? pathTraceGaps(trace.t, trace.x, trace.y) : [];
  if (drawView) {
    if (settings.pathView === 'movement-speed') {
      legend = appendPathBinLegend(legendTarget, 'movement speed', range,
        (value) => Math.round(value) + ' px/s');
    } else if (settings.pathView === 'click-speed') {
      legend = appendPathBinLegend(legendTarget, 'click speed', range,
        (value) => value.toFixed(2) + '/s');
    } else if (settings.pathView === 'progress') {
      legend = appendPathBinLegend(legendTarget, 'game progress', range,
        (value) => Math.round(value * 100) + '% uncovered');
    } else if (settings.pathView === 'raw-path') {
      legend = appendPathBinLegend(legendTarget, 'raw path · elapsed trace time',
        { min: 0, max: endT, trimmed: 0 },
        (value) => (value / 1000).toFixed(1) + 's', { time: true });
      appendPathLegendRow(legendTarget, 'click markers', [
        { color: '#174ea6', label: 'left-button release', dot: true },
        { color: '#2e7d32', label: 'chord', dot: true },
        { color: '#c62828', label: 'right-button press', dot: true },
      ]);
    } else if (settings.pathView === 'click-locations') {
      const chordCount = pathClickActions(trace.events)
        .filter((click) => click.action === 'chord').length;
      appendPathLegendRow(legendTarget, 'numbered click locations', [
        { color: '#174ea6', label: 'left-button release', dot: true },
        { color: '#2e7d32', label: 'chord — left release on a satisfied number', dot: true },
        { color: '#c62828', label: 'right-button press', dot: true },
      ], 'numbers are raw input order · ' + chordCount + ' chord'
        + (chordCount === 1 ? '' : 's') + ' detected');
    } else if (settings.pathView === 'less-useful') {
      const count = decisions.filter(pathDecisionIsLessUseful).length;
      appendPathLegendRow(legendTarget, 'less-useful episodes', [
        { color: '#174ea6', label: 'last useful click', dot: true },
        { color: '#d95f02', label: 'mistake-tagged action / path' },
        { color: '#2e7d32', label: 'next useful action / path' },
      ], count + ' mistake-tagged action' + (count === 1 ? '' : 's')
        + ' · time labels measure each action-to-action segment');
    }
    if (gaps.some((gap) => gap.kind === 'away')) {
      appendPathLegendRow(legendTarget, 'data gaps', [
        { color: '#78909c', label: 'dashed = no cursor samples · “away” label = how long the cursor was gone' },
      ]);
    }
    if (legend !== null) {
      appendPathLegendRow(legendTarget, 'hover', [],
        'mouse over a legend range to spotlight its segments; mouse over the path to read the exact value');
    }
  }
  appendReplayLegend(legendTarget);
  const mapper = pathPointMapper(rect.width, rect.height);
  const points = trace.t.map((t, i) => mapper(t, trace.x[i], trace.y[i]));
  const lessRoles = pathLessUsefulRoles(decisions);
  const clickMapper = pathPointMapper(rect.width, rect.height);
  const clicks = pathClickActions(trace.events).map((click) => {
    const [px, py] = clickMapper(click.t, click.x, click.y);
    return { ...click, px, py };
  });
  const decisionMapper = pathPointMapper(rect.width, rect.height);
  const decisionPoints = decisions.map((decision) => {
    const [px, py] = decisionMapper(decision.t, decision.x, decision.y);
    return {
      t: decision.t,
      px,
      py,
      less: pathDecisionIsLessUseful(decision),
      action: decision.evaluation.action,
    };
  });
  const rough = replayEnabled && settings.replayOverlays.movement
    ? pathRoughSegments(trace.t, trace.x, trace.y, travel) : null;
  lastPathState = {
    ctx,
    width: rect.width,
    height: rect.height,
    drawView,
    segments,
    points,
    range,
    legend,
    endT,
    cutoff,
    lessRoles,
    clicks,
    decisionPoints,
    gaps,
    rough,
    replayIndex,
  };
  paintPathCanvas();
}

// Path hover: nearest drawn segment within reach reports its exact value in
// a tooltip and lights the matching legend chip (which in turn spotlights
// the whole class). Listening on the board keeps the canvas input-inert.
function pathSegmentAtPoint(px, py) {
  const state = lastPathState;
  if (state === null || !state.drawView || state.legend === null) return null;
  const reach = 8;
  let best = null;
  let bestDistance = reach;
  for (const segment of state.segments) {
    if (segment.gap || trace.t[segment.to] > state.cutoff) continue;
    const binValue = settings.pathView === 'raw-path'
      ? trace.t[segment.to] : segment.value;
    if (!Number.isFinite(binValue)) continue;
    const [x1, y1] = state.points[segment.from];
    const [x2, y2] = state.points[segment.to];
    if (px < Math.min(x1, x2) - reach || px > Math.max(x1, x2) + reach
        || py < Math.min(y1, y2) - reach || py > Math.max(y1, y2) + reach) {
      continue;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
    const distance = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { segment, binValue };
    }
  }
  return best;
}

boardElement.addEventListener('mousemove', (event) => {
  if (lastPathState === null || lastPathState.legend === null
      || pathCanvas === null) return;
  const rect = pathCanvas.getBoundingClientRect();
  const hit = pathSegmentAtPoint(
    event.clientX - rect.left, event.clientY - rect.top);
  if (hit === null) {
    hidePathTooltip();
    setPathHighlightBin(-1);
    return;
  }
  const legend = lastPathState.legend;
  showPathTooltip(event.clientX, event.clientY, legend.format(hit.binValue));
  setPathHighlightBin(pathBinIndex(legend.bins, hit.binValue));
});

boardElement.addEventListener('mouseleave', () => {
  if (lastPathState === null) return;
  hidePathTooltip();
  setPathHighlightBin(-1);
});

function renderPathView() {
  if (!replayEnabled) restoreFinishedBoard();
  removePathCanvas();
  renderPathViewControls();
  if (replayEnabled && pathViewAvailable()) {
    renderReplayFrame();
  } else {
    removeReplayCallouts();
    renderPathOverlay();
  }
}

// The path views color one path line, so one shows at a time: pressing
// another switches to it, and pressing the shown one turns the path off.
for (const button of pathViewButtons) {
  button.addEventListener('click', () => {
    const id = button.dataset.pathView;
    if (!PATH_VIEW_IDS.has(id)) throw new Error('unknown path view: ' + id);
    updateSettings({ pathView: settings.pathView === id ? 'off' : id });
    renderPathView();
  });
}

//-------PATH REPLAY: PLAYBACK-------

// Playback walks the actions at the pace they were played: each frame stays
// up for the real time until the next action. The wait before the first
// action is not play time (the timer starts with that action), so the
// opening frame holds for a fixed moment instead.
const REPLAY_OPENING_FRAME_MS = 500;
let replayPlaybackTimer = 0;

function replayFrameHoldMs(step) {
  if (step === 0) return REPLAY_OPENING_FRAME_MS;
  const decisions = pathDecisionEvents(trace.events);
  return decisions[step].t - decisions[step - 1].t;
}

function renderReplayPlayButton() {
  const playing = replayPlaybackTimer !== 0;
  replayPlay.classList.toggle('playing', playing);
  replayPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  replayPlay.title = playing ? 'Pause' : 'Play at the pace it was played';
}

function stopReplayPlayback() {
  if (replayPlaybackTimer === 0) return;
  clearTimeout(replayPlaybackTimer);
  replayPlaybackTimer = 0;
  renderReplayPlayButton();
}

function scheduleReplayPlayback() {
  replayPlaybackTimer = setTimeout(() => {
    replayPlaybackTimer = 0;
    moveReplayStep(replayStep + 1);
    if (replayStep < replayDecisionCount()) scheduleReplayPlayback();
    renderReplayPlayButton();
  }, replayFrameHoldMs(replayStep));
}

replayPlay.addEventListener('click', () => {
  if (replayPlaybackTimer !== 0) {
    stopReplayPlayback();
    return;
  }
  // From the finished board, play starts over, as a video does at its end;
  // from a hover preview, it plays on from the moment previewed.
  replayPreviewReturnStep = null;
  if (replayStep >= replayDecisionCount()) moveReplayStep(0);
  scheduleReplayPlayback();
  renderReplayPlayButton();
});

document.getElementById('replay-first').addEventListener('click', () => setReplayStep(0));
document.getElementById('replay-last').addEventListener('click', () => setReplayStep(replayDecisionCount()));

replayPrevious.addEventListener('click', () => {
  setReplayStep(replayStep - 1);
});

replayNext.addEventListener('click', () => {
  setReplayStep(replayStep + 1);
});

replaySlider.addEventListener('input', () => {
  setReplayStep(Number(replaySlider.value));
});

for (const button of replayOverlayButtons) {
  button.addEventListener('click', () => {
    const key = button.dataset.replayOverlay;
    if (!(key in settings.replayOverlays)) throw new Error('unknown replay overlay: ' + key);
    updateSettings({ replayOverlays: { ...settings.replayOverlays, [key]: !settings.replayOverlays[key] } });
    renderPathView();
  });
}

document.addEventListener('keydown', (event) => {
  if (!pathViewAvailable() || replayDecisionCount() === 0) return;
  if (!replayControls.checkVisibility()) return;
  if (event.target instanceof HTMLElement
      && event.target.matches(
        'input, select, textarea, button, summary, [contenteditable], [tabindex]')) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setReplayStep(replayStep - 1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    setReplayStep(replayStep + 1);
  }
});
