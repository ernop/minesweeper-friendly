'use strict';

// Modes that change how boards are dealt or shown: Pregen 10, Endgame
// drill, Board lab, and trials on the live board.

//-------PREGENERATED HIGH-3BV MODE-------

const PREGEN_BATCH_SIZE = 10;

function pregenBatchKey() {
  return boardKey() + BoardGenerators.keySuffix(gameGenerator);
}

function buildPregenBatch(key) {
  backupStatus.textContent = 'generating and ranking 10 boards by 3BV\u2026';
  const seeds = [];
  for (let i = 0; i < PREGEN_BATCH_SIZE; i++) seeds.push(GameRandom.createSeed());
  let boards;
  try {
    boards = Pregen.rankSeeds({
      seeds,
      width: config.width,
      height: config.height,
      mineCount: config.mines,
      safeIndex: config.width - 1,
      generator: gameGenerator,
      randomFromSeed: GameRandom.fromSeed,
      place: BoardGenerators.place,
    });
  } catch (err) {
    backupStatus.textContent = 'board generation failed: ' + err.message;
    throw err;
  }
  pregenBatch = { key, boards, next: 0, startedAt: Date.now(), results: [] };
  backupStatus.textContent = '';
}

function setupPregenBoard() {
  const key = pregenBatchKey();
  if (pregenBatch === null || pregenBatch.key !== key
      || pregenBatch.next >= pregenBatch.boards.length) {
    buildPregenBatch(key);
  }
  const candidate = pregenBatch.boards[pregenBatch.next];
  pregenBatch.next++;
  pregenCurrent = {
    rank: pregenBatch.next,
    total: pregenBatch.boards.length,
    bv3: candidate.bv3,
  };

  // Regenerate the chosen candidate from its own seed. This consumes exactly
  // the placement portion of the stream, leaving Justice redraws replayable.
  gameSeed = candidate.seed;
  gameRandom = GameRandom.fromSeed(gameSeed);
  const opening = config.width - 1;
  const mineAt = BoardGenerators.place(
    gameGenerator, config.width, config.height, config.mines, opening, gameRandom);
  if (Pregen.board3BV(config.width, config.height, mineAt) !== candidate.bv3) {
    throw new Error('pregenerated board changed while being dealt');
  }
  applyMineMap(mineAt);
  floodReveal(opening);
  gameState = 'playing';
  justiceEnabledForGame = justiceAppliesToMode() && settings.justUniverse;
  startTimer();
  checkWin();
}

function renderPregenChrome() {
  const box = document.getElementById('pregen-progress');
  box.hidden = !pregenActive() || pregenCurrent === null;
  box.textContent = box.hidden
    ? ''
    : pregenCurrent.rank + ' / ' + pregenCurrent.total + ' \u00b7 3BV ' + pregenCurrent.bv3;
}

function buildPregenProgressTable(rows) {
  const panel = document.createElement('section');
  panel.className = 'pregen-progress-panel';
  const heading = document.createElement('h4');
  heading.textContent = 'challenge progress';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['run', '3BV', 'time']) {
    const cell = document.createElement('th');
    cell.textContent = label;
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.outcome === 'loss') tr.classList.add('loss');
    if (row.latest) tr.classList.add('me');
    const run = document.createElement('td');
    run.textContent = String(row.run);
    const bv3 = document.createElement('td');
    bv3.textContent = String(row.bv3);
    const time = document.createElement('td');
    time.textContent = (row.timeMs / 1000).toFixed(3) + 's';
    if (row.outcome === 'loss') {
      const outcome = document.createElement('span');
      outcome.className = 'pregen-progress-outcome';
      outcome.textContent = ' loss';
      time.appendChild(outcome);
    }
    tr.append(run, bv3, time);
    body.appendChild(tr);
  }
  table.append(head, body);
  panel.append(heading, table);
  return panel;
}

function buildPregenChartPanel(label, wins, referenceMs) {
  const panel = document.createElement('section');
  panel.className = 'pregen-chart-panel';
  const heading = document.createElement('h4');
  heading.textContent = label;
  panel.appendChild(heading);
  if (wins.length < 2) {
    const waiting = document.createElement('p');
    waiting.className = 'pregen-chart-waiting';
    waiting.textContent = wins.length + ' / 2 wins needed';
    panel.appendChild(waiting);
    return panel;
  }

  const latest = wins.reduce((a, b) => a.endedAt > b.endedAt ? a : b);
  const byTimeThenEnd = [...wins]
    .sort((a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt);
  const rank = byTimeThenEnd.indexOf(latest) + 1;
  const pairs = wins.map((record) => [record.bv3, secondsOf(record)]);
  panel.appendChild(buildScatter(
    wins,
    latest,
    (record) => record.bv3,
    secondsOf,
    '3BV',
    'time',
    rank + ' ' + label,
    (record) => ageInfo(referenceMs, record.endedAt),
    {
      trimY: true,
      trendLines: trendLinesFor([], pairs),
    },
  ));
  return panel;
}

function renderPregenCharts() {
  pregenCharts.textContent = '';
  const visible = pregenActive() && pregenBatch !== null && history !== null;
  pregenCharts.hidden = !visible;
  if (!visible) {
    syncResultClearance();
    return;
  }
  const records = history[modeKey()] || [];
  const scoped = Pregen.chartWins(
    records, pregenBatch.startedAt, startOfDay(Date.now()));
  const progress = Pregen.progressRows(pregenBatch.results);
  const referenceMs = Date.now();
  pregenCharts.append(
    buildPregenProgressTable(progress),
    buildPregenChartPanel('this challenge', scoped.challenge, referenceMs),
    buildPregenChartPanel('whole day', scoped.today, referenceMs),
  );
  syncResultClearance();
}

//-------ENDGAME DRILL MODE (dealing logic in endgame.js)-------

// The live drill's presentation facts: the remnant's remaining 3BV (the
// record's bv3 — the minimum clicks to finish what is actually left) and
// its covered-safe count for the chrome line.
let drillCurrent = null;

function setupEndgameDrill() {
  backupStatus.textContent = 'dealing an endgame position\u2026';
  let deal;
  try {
    deal = EndgameDrill.deal({
      width: config.width,
      height: config.height,
      mines: config.mines,
      generator: gameGenerator,
      place: BoardGenerators.place,
      createSeed: GameRandom.createSeed,
      randomFromSeed: GameRandom.fromSeed,
      classifyCells: Solver.classifyCells,
    });
  } catch (err) {
    backupStatus.textContent = 'endgame deal failed: ' + err.message;
    throw err;
  }
  // The deal's seed replays the board and the window search alike; the
  // fresh stream is never drawn from again (justice is off in drills).
  gameSeed = deal.seed;
  gameRandom = GameRandom.fromSeed(deal.seed);
  applyMineMap(deal.mineAt);
  for (let i = 0; i < deal.revealed.length; i++) {
    if (!deal.revealed[i]) continue;
    cells[i].revealed = true;
    revealedCount++;
    updateCell(i);
  }
  drillCurrent = { remaining3BV: deal.remaining3BV, safeLeft: deal.safeLeft };
  backupStatus.textContent = '';
  // gameState stays 'ready' with mines placed: the timer starts on the
  // player's first input (reveal, flag, or chord).
}

function renderDrillChrome() {
  const box = document.getElementById('endgame-drill-info');
  box.hidden = !endgameDrillActive() || drillCurrent === null;
  box.textContent = box.hidden
    ? ''
    : drillCurrent.safeLeft + ' safe cells left \u00b7 remaining 3BV '
      + drillCurrent.remaining3BV;
}

//-------BOARD LAB (the non-play mode for exploring board generation)-------

// The lab shows every board as if it had just been solved: safe cells
// open with their numbers, mines flagged, counters at their win values.
// No timer runs, no input reaches the cells, and nothing is recorded.
function buildLabBoard() {
  applyMineMap(BoardGenerators.place(
    gameGenerator, config.width, config.height, config.mines, null, gameRandom));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) {
      cells[i].flagged = true;
    } else {
      cells[i].revealed = true;
      revealedCount++;
    }
    updateCell(i);
  }
  flagsCount = config.mines;
  setLcd(mineCounter, 0);
  gameState = 'lab';
}

// The lab panel's slider rows are rebuilt only when the generator
// changes: a regeneration mid-drag must not replace the slider element
// under the pointer.
let labPanelGeneratorId = null;
let labControls = null;

function labSliderRow(labelText, title, min, max, step, value, onInput) {
  const row = document.createElement('label');
  row.className = 'lab-row';
  const name = document.createElement('span');
  name.className = 'lab-name';
  name.textContent = labelText;
  if (title !== '') name.title = title;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  const readout = document.createElement('span');
  readout.className = 'lab-value';
  readout.textContent = String(value);
  slider.addEventListener('input', () => {
    readout.textContent = slider.value;
    onInput(Number(slider.value));
  });
  row.append(name, slider, readout);
  return { row, slider, readout };
}

// Classic winmine constraint, same as the custom form: mines fit with at
// least a 3x3 opening's worth of space (floor 1 for one-row boards).
function labMaxMines() {
  return Math.max(1, (config.width - 1) * (config.height - 1));
}

function buildLabPanel() {
  const panel = document.getElementById('board-lab-panel');
  panel.textContent = '';
  labControls = { params: {} };

  const note = document.createElement('p');
  note.id = 'board-lab-note';
  note.textContent = 'Every board is shown already solved. Nothing here is timed or recorded.';
  panel.appendChild(note);

  const sizeChanged = () => {
    if (config.mines > labMaxMines()) config.mines = labMaxMines();
    rememberCustomBoard();
    syncDifficultyTabs();
    newGame();
  };
  labControls.width = labSliderRow('width', '', 8, 100, 1, config.width, (v) => {
    config.width = v;
    sizeChanged();
  });
  labControls.height = labSliderRow('height', '', 1, 100, 1, config.height, (v) => {
    config.height = v;
    sizeChanged();
  });
  labControls.mines = labSliderRow('mines', '', 1, labMaxMines(), 1, config.mines, (v) => {
    config.mines = v;
    rememberCustomBoard();
    syncDifficultyTabs();
    newGame();
  });
  panel.append(labControls.width.row, labControls.height.row, labControls.mines.row);

  const spec = BoardGenerators.byId(settings.boardGenerator);
  const params = BoardGenerators.paramsFrom(spec.id, settings.boardGeneratorParams[spec.id]);
  for (const p of spec.params) {
    const control = labSliderRow(p.label, p.describe, p.min, p.max, p.step, params[p.key], (v) => {
      if (!(spec.id in settings.boardGeneratorParams)) {
        settings.boardGeneratorParams[spec.id] = {};
      }
      settings.boardGeneratorParams[spec.id][p.key] = v;
      saveSettings();
      newGame();
    });
    labControls.params[p.key] = control;
    panel.appendChild(control.row);
  }

  const remake = document.createElement('button');
  remake.type = 'button';
  remake.id = 'board-lab-new';
  remake.textContent = 'make new board';
  remake.addEventListener('click', () => newGame());
  panel.appendChild(remake);
  labPanelGeneratorId = spec.id;
}

// Size sliders track config (the difficulty tabs also change it); param
// sliders are the only writers of their values, so they are not re-set
// here — a generator change or settings import rebuilds the panel.
function syncLabPanelValues() {
  for (const [control, value] of [
    [labControls.width, config.width],
    [labControls.height, config.height],
    [labControls.mines, config.mines],
  ]) {
    control.slider.value = String(value);
    control.readout.textContent = String(value);
  }
  labControls.mines.slider.max = String(labMaxMines());
}

function syncLabChrome() {
  const panel = document.getElementById('board-lab-panel');
  const lab = boardLabActive();
  scoresNav.hidden = lab;
  panel.hidden = !lab;
  if (!lab) {
    panel.textContent = '';
    labPanelGeneratorId = null;
    labControls = null;
    return;
  }
  if (labPanelGeneratorId !== settings.boardGenerator) buildLabPanel();
  else syncLabPanelValues();
}

//-------TRIALS ON THE LIVE BOARD (setup, phases, chrome)-------

function setupTrialBoard() {
  if (!trialIsActive()) {
    trialPresentation = null;
    return;
  }
  if (trialSession.nextIndex >= Trial.gameCount(trialSession)) {
    endTrial('completed');
    trialPresentation = null;
    return;
  }
  trialPresentation = Trial.presentation(trialSession, gameRandom);
  applyMineMap(trialPresentation.mines);
  if (settings.trialGiveOpening) {
    floodReveal(trialPresentation.firstClick);
    gameState = 'playing';
    startTimer();
    justiceEnabledForGame = settings.justUniverse;
    checkWin();
  }
}

const TRIAL_START_ARM_MS = 800;
let trialStartArmTimer = null;

function clearTrialStartArm() {
  if (trialStartArmTimer !== null) {
    clearTimeout(trialStartArmTimer);
    trialStartArmTimer = null;
  }
}

function startTrial() {
  if (!Trial.isPlayMode(settings.playMode) || trialIsActive()) return;
  lastTrialReview = null;
  if (gameRandom === null) {
    gameSeed = GameRandom.createSeed();
    gameRandom = GameRandom.fromSeed(gameSeed);
  }
  trialSession = Trial.createSession(
    boardKey(), config.width, config.height, config.mines, gameRandom, settings.playMode);
  persistUserdata('trial', trialSession);
  newGame();
}

function trialKindCopy(id) {
  const kind = Trial.kindOf(id);
  const games = kind.identities * kind.repeats;
  return playModeLabel(id) + '\n\n'
    + kind.identities + ' board' + (kind.identities === 1 ? '' : 's')
    + ', each in ' + kind.repeats + ' orientations (' + games + ' games).\n'
    + 'Same logical maps, different flips and rotations.\n'
    + 'You choose the first click. These games do not count toward Standard.';
}

function playModeOfTrial(session) {
  return session.playMode === undefined ? 'trial' : session.playMode;
}

function trialSessionPlayMode() {
  return playModeOfTrial(trialSession);
}

function trialIsActive() {
  return trialSession !== null && trialSession.endedHow === null
    && trialSessionPlayMode() === settings.playMode;
}

function trialReviewMatches() {
  return lastTrialReview !== null
    && lastTrialReview.endedHow
    && playModeOfTrial(lastTrialReview) === settings.playMode
    && lastTrialReview.width === config.width
    && lastTrialReview.height === config.height
    && lastTrialReview.mines === config.mines;
}

function trialPhase() {
  if (!Trial.isPlayMode(settings.playMode)) return 'none';
  if (trialIsActive()) return 'playing';
  if (trialReviewMatches()) return 'review';
  return 'lobby';
}

function trialBlocksPlay() {
  return Trial.isPlayMode(settings.playMode) && trialPhase() !== 'playing';
}

function endTrial(how) {
  if (!trialIsActive()) return;
  Trial.finishSession(trialSession, how);
  persistUserdata('trial', trialSession);
  lastTrialReview = trialSession;
  clearInterval(timerInterval);
  timerInterval = null;
}

function abandonTrial() {
  if (!trialIsActive()) return;
  Trial.finishSession(trialSession, 'quit');
  persistUserdata('trial', trialSession);
  lastTrialReview = null;
}

function syncTrialBoardVisibility(phase) {
  const hide = phase === 'lobby' || phase === 'review';
  document.getElementById('game-frame').hidden = hide;
  gameArea.classList.toggle('trial-no-board', hide);
  document.body.classList.toggle('trial-offboard', hide);
  resultsBox.hidden = hide;
  if (hide) resultRanks.style.removeProperty('--result-overflow');
}

function renderTrialChrome() {
  const stage = document.getElementById('trial-stage');
  const copy = document.getElementById('trial-copy');
  const verdict = document.getElementById('trial-verdict');
  const btn = document.getElementById('trial-start-btn');
  const box = document.getElementById('trial-progress');
  const phase = trialPhase();
  syncTrialBoardVisibility(phase);
  if (phase === 'none') {
    clearTrialStartArm();
    stage.hidden = true;
    verdict.hidden = true;
    box.hidden = true;
    box.textContent = '';
    return;
  }
  if (phase === 'playing') {
    clearTrialStartArm();
    stage.hidden = true;
    verdict.hidden = true;
    box.hidden = false;
    box.textContent = '';
    const label = document.createElement('span');
    label.textContent = trialSession.results.length + ' / ' + Trial.gameCount(trialSession);
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.textContent = 'end trial';
    quit.addEventListener('click', () => {
      endTrial('quit');
      renderTrialChrome();
    });
    box.append(label, quit);
    return;
  }
  box.hidden = true;
  box.textContent = '';
  stage.hidden = false;
  if (phase === 'lobby') {
    clearTrialStartArm();
    copy.hidden = false;
    copy.textContent = trialKindCopy(settings.playMode);
    verdict.hidden = true;
    verdict.textContent = '';
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = 'start trial';
    resultSummary.textContent = '';
    clearResultStats();
    resultAnalysis.textContent = '';
    resultRanks.textContent = '';
    return;
  }
  btn.textContent = 'start another trial';
  btn.hidden = false;
  btn.disabled = true;
  clearTrialStartArm();
  trialStartArmTimer = setTimeout(() => {
    trialStartArmTimer = null;
    if (trialPhase() !== 'review') return;
    btn.disabled = false;
  }, TRIAL_START_ARM_MS);
  if (lastTrialReview) renderTrialReview(lastTrialReview);
}
