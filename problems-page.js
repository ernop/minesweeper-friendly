'use strict';

// Minesweeper problems page (docs/product/problems.md), a subpage of the game
// site. It keeps its own IndexedDB database (names in problems-storage.js),
// independent of the game database's versions; it loads the problem bank,
// runs sets of problems and the pointing test, saves every attempt and run,
// and shows the ladders, the history, and the backup.

const PROBLEM_DB_VERSION = 3;
const PROBLEM_BANK_URL = 'problems-bank.json?v=20260927-two-safe';
const HISTORY_ROWS = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';
// Vertical distance between ladder labels, px.
const LADDER_GAP_PX = 22;
const OUTCOME_TEXT = {
  solved: 'Solved',
  mine: 'Opened a mine',
  timeout: 'Out of time',
  abandoned: 'Stopped',
  interrupted: 'Interrupted (tab or window changed)',
};

let problemDb = null;
let bank = null;
let attempts = [];
let cellPx = PROBLEM_DEFAULT_CELL_PX;
// The set being played: its problems, position, and start time.
let run = null;
// The problem on screen. phase: waiting (cursor not yet on the start square),
// preview (board shown, start square about to open), running, done.
let live = null;
let squareElements = [];
// The board's grid in page coordinates (measureGrid).
let boardGrid = null;
let pointingRuns = [];
let drillAttempts = [];
// The pointing test on screen. phase: ready (waiting for the start square's
// press), showing (a target is drawn), between (pressed; next target not yet
// drawn), done.
let pointing = null;

const byId = (id) => document.getElementById(id);

function showFailure(message) {
  const status = byId('problems-status');
  status.textContent = message;
  status.classList.add('problems-error');
  status.hidden = false;
  throw new Error(message);
}

function requestResult(request, what) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(what + ': ' + request.error));
  });
}

function openProblemDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROBLEM_DB_NAME, PROBLEM_DB_VERSION);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore(ATTEMPT_STORE, { keyPath: 'startedAt' });
        request.result.createObjectStore(PREFERENCE_STORE);
      }
      if (event.oldVersion < 2) request.result.createObjectStore(POINTING_STORE, { keyPath: 'startedAt' });
      if (event.oldVersion < 3) request.result.createObjectStore(DRILL_STORE, { keyPath: 'startedAt' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('problem database failed to open: ' + request.error));
    request.onblocked = () => reject(new Error('problem database update blocked; close other problem tabs and reload'));
  });
}

async function loadBank() {
  const response = await fetch(PROBLEM_BANK_URL);
  if (!response.ok) throw new Error('problem bank failed to load: HTTP ' + response.status + ' ' + (await response.text()));
  return readProblemBank(await response.json());
}

async function startProblemsPage() {
  try {
    const [db, loaded] = await Promise.all([openProblemDb(), loadBank()]);
    problemDb = db;
    problemDb.onversionchange = () => {
      problemDb.close();
      showFailure('the problem database changed in another tab; reload this page');
    };
    bank = loaded;
    const stored = await requestResult(db.transaction(ATTEMPT_STORE).objectStore(ATTEMPT_STORE).getAll(), 'attempts failed to load');
    for (const attempt of stored) {
      if (!validProblemAttempt(attempt)) throw new Error('stored attempt ' + attempt.startedAt + ' is malformed');
    }
    attempts = stored;
    const runs = await requestResult(db.transaction(POINTING_STORE).objectStore(POINTING_STORE).getAll(), 'pointing runs failed to load');
    for (const saved of runs) {
      if (!validPointingRun(saved, bank.width, bank.height)) throw new Error('stored pointing run ' + saved.startedAt + ' is malformed');
    }
    pointingRuns = runs;
    const drills = await requestResult(db.transaction(DRILL_STORE).objectStore(DRILL_STORE).getAll(), 'drill attempts failed to load');
    for (const saved of drills) {
      if (!validDrillAttempt(saved)) throw new Error('stored drill attempt ' + saved.startedAt + ' is malformed');
    }
    drillAttempts = drills;
    const size = await requestResult(db.transaction(PREFERENCE_STORE).objectStore(PREFERENCE_STORE).get('cellPx'), 'preferences failed to load');
    if (size !== undefined) {
      if (!PROBLEM_CELL_SIZES.includes(size)) throw new Error('stored square size ' + size + ' is not offered');
      cellPx = size;
    }
  } catch (error) {
    showFailure(error.message);
  }
  byId('problems-status').hidden = true;
  renderHome();
}

//-------HOME: start, profile, history, backup-------

function renderHome() {
  run = null;
  live = null;
  pointing = null;
  document.body.classList.remove('problems-running');
  byId('problems-play').hidden = true;
  byId('problems-summary').hidden = true;
  for (const id of HOME_SECTIONS) byId(id).hidden = false;
  byId('problems-start-set').textContent = 'Start ' + PROBLEM_SET_SIZE + ' problems';
  renderCellSizes();
  renderProfile();
  renderDrillHome();
  renderPointingHome();
  renderHistory();
}

const HOME_SECTIONS = ['problems-start', 'problems-profile', 'problems-drill', 'problems-pointing', 'problems-history', 'problems-backup'];

function hideHome() {
  for (const id of [...HOME_SECTIONS, 'problems-summary']) byId(id).hidden = true;
}

function renderCellSizes() {
  const field = byId('problems-cell-size');
  for (const old of field.querySelectorAll('label')) old.remove();
  for (const size of PROBLEM_CELL_SIZES) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'problems-cell-size';
    input.value = String(size);
    input.checked = size === cellPx;
    input.addEventListener('change', () => saveCellSize(size));
    label.append(input, ' ' + size + ' px');
    field.append(label);
  }
}

function saveCellSize(size) {
  cellPx = size;
  const tx = problemDb.transaction(PREFERENCE_STORE, 'readwrite');
  tx.objectStore(PREFERENCE_STORE).put(size, 'cellPx');
  tx.onerror = () => showFailure('square size not saved: ' + tx.error);
}

function seconds(ms) {
  return ms === null ? '\u2013' : (ms / 1000).toFixed(2) + ' s';
}

function cellText(row, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  row.append(td);
  return td;
}

// textColumns: indexes of the columns that hold words, aligned left.
function headerRow(table, labels, textColumns) {
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  labels.forEach((label, i) => {
    const th = document.createElement('th');
    th.textContent = label;
    if (textColumns.includes(i)) th.className = 'problems-text';
    head.append(th);
  });
  return table.createTBody();
}

function levelLabel(level) {
  return level.endsWith('-') ? level.slice(0, -1) + '+' : level.replace('-', '\u2013');
}

// The skill levels of a class as ladder entries, and the levels left out
// because too few corpus moves stand behind their median.
function levelEntries(classId) {
  const entries = [];
  const missing = [];
  for (const level of bank.levels) {
    const ms = levelThinkMs(bank, classId, level);
    if (ms === null) {
      missing.push(levelLabel(level));
      continue;
    }
    entries.push({ ms, kind: 'level', label: levelLabel(level) + ' 3BV/s',
      title: 'Median of ' + bank.classes[classId].byLevel[level].freshMoves + ' moves in real games' });
  }
  return { entries, missing };
}

// A vertical ladder in the style of the game's 0-100% chart: fastest at the
// top, every entry at its exact time on the band, labels beside it.
function renderLadder(container, spec) {
  const figure = document.createElement('figure');
  figure.className = 'problems-ladder';
  const caption = document.createElement('figcaption');
  const title = document.createElement('span');
  title.className = 'problems-ladder-title';
  title.textContent = spec.title;
  const help = document.createElement('span');
  help.className = 'problems-help';
  help.title = spec.help;
  help.textContent = '(?)';
  caption.append(title, ' ', help);
  figure.append(caption);
  const note = document.createElement('p');
  note.className = 'problems-ladder-note';
  note.textContent = spec.entries.length === 0 ? spec.note + '. No times yet.' : spec.note;
  figure.append(note);
  container.append(figure);
  if (spec.entries.length === 0) return;
  const height = Math.max(200, spec.entries.length * LADDER_GAP_PX + 20);
  const layout = ladderLayout(spec.entries.map((e) => e.ms), height, LADDER_GAP_PX);
  const stage = document.createElement('div');
  stage.className = 'problems-ladder-stage';
  stage.style.height = height + 'px';
  const band = document.createElement('div');
  band.className = 'problems-ladder-band';
  for (const tick of layout.ticks) {
    const mark = document.createElement('span');
    mark.className = 'problems-ladder-tick';
    mark.style.top = tick.y + 'px';
    mark.textContent = (tick.ms / 1000).toFixed(2);
    band.append(mark);
  }
  const leaders = document.createElementNS(SVG_NS, 'svg');
  leaders.setAttribute('class', 'problems-ladder-leaders');
  leaders.setAttribute('viewBox', '0 0 16 ' + height);
  leaders.setAttribute('preserveAspectRatio', 'none');
  leaders.setAttribute('aria-hidden', 'true');
  stage.append(band, leaders);
  spec.entries.forEach((entry, i) => {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', String(layout.dotY[i]));
    line.setAttribute('x2', '16');
    line.setAttribute('y2', String(layout.labelY[i]));
    leaders.append(line);
    const dot = document.createElement('span');
    dot.className = 'problems-ladder-dot';
    dot.dataset.kind = entry.kind;
    dot.style.top = layout.dotY[i] + 'px';
    const label = document.createElement('span');
    label.className = 'problems-ladder-label';
    label.dataset.kind = entry.kind;
    label.style.top = layout.labelY[i] + 'px';
    label.title = entry.title;
    const value = document.createElement('span');
    value.className = 'problems-ladder-value';
    value.textContent = seconds(entry.ms);
    const name = document.createElement('span');
    name.className = 'problems-ladder-name';
    name.textContent = entry.label;
    label.append(value, name);
    stage.append(dot, label);
  });
  figure.append(stage);
  if (spec.missing.length > 0) {
    const missing = document.createElement('p');
    missing.className = 'problems-ladder-note';
    missing.textContent = 'Too few games yet: ' + spec.missing.join(', ');
    figure.append(missing);
  }
}

function renderProfile() {
  const container = byId('problems-profile-ladders');
  container.replaceChildren();
  const earlier = attempts.filter((a) => a.protocol !== PROBLEM_PROTOCOL).length;
  const earlierNote = byId('problems-profile-earlier');
  earlierNote.textContent = earlier + ' earlier attempts, made without the focus box, are in the history but not in the ladders.';
  earlierNote.hidden = earlier === 0;
  for (const row of problemProfile(bank, attempts)) {
    const described = describeProblemClass(bank, row.classId);
    const { entries, missing } = levelEntries(row.classId);
    if (row.medianThinkMs !== null) {
      entries.push({ ms: row.medianThinkMs, kind: 'you', label: 'You',
        title: 'Your median over ' + row.thinkCount + ' solved problems' });
    }
    renderLadder(container, {
      title: described.name,
      help: described.rule,
      note: row.attempts === 0 ? 'Not tried yet' : row.solved + ' of ' + row.attempts + ' solved',
      entries,
      missing,
    });
  }
}

function renderHistory() {
  const recent = [...attempts].sort((a, b) => b.startedAt - a.startedAt).slice(0, HISTORY_ROWS);
  byId('problems-history-count').textContent = attempts.length === 0 ? 'No attempts yet.'
    : attempts.length + ' attempts saved; the latest ' + recent.length + ' are shown.';
  const body = headerRow(byId('problems-history-table'),
    ['When', 'Rule', 'Result', 'Thinking', 'Total', 'Extra clicks'], [0, 1, 2]);
  for (const attempt of recent) {
    const tr = body.insertRow();
    cellText(tr, new Date(attempt.startedAt).toLocaleString(), 'problems-text');
    const problem = bank.byId.get(attempt.problemId);
    if (problem === undefined) {
      cellText(tr, 'a problem not in bank ' + bank.bankId, 'problems-text');
      cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
      for (let i = 0; i < 3; i++) cellText(tr, '\u2013');
      continue;
    }
    const summary = summarizeAttempt(bank, attempt);
    cellText(tr, describeProblemClass(bank, problem.classId).name, 'problems-rule-name problems-text');
    cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
    cellText(tr, seconds(summary.thinkMs), 'problems-number');
    cellText(tr, seconds(summary.doneMs), 'problems-number');
    cellText(tr, String(summary.otherClicks));
  }
}

function exportAttempts() {
  const file = problemAttemptsFile(attempts, pointingRuns, drillAttempts, Date.now());
  const link = byId('problems-download');
  if (link.href) URL.revokeObjectURL(link.href);
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  link.download = 'minesweeper-problems-' + new Date().toISOString().slice(0, 10) + '.json';
  link.hidden = false;
  link.click();
}

async function importAttempts(fileInput) {
  const status = byId('problems-backup-status');
  const [file] = fileInput.files;
  fileInput.value = '';
  if (file === undefined) return;
  let read;
  try {
    read = readProblemAttemptsFile(JSON.parse(await file.text()), bank.width, bank.height);
  } catch (error) {
    status.textContent = 'Import failed: ' + error.message;
    status.hidden = false;
    return;
  }
  const unseen = (list, incoming) => {
    const known = new Set(list.map((item) => item.startedAt));
    return incoming.filter((item) => !known.has(item.startedAt) && known.add(item.startedAt));
  };
  const fresh = unseen(attempts, read.valid);
  const freshRuns = unseen(pointingRuns, read.validRuns);
  const freshDrills = unseen(drillAttempts, read.validDrills);
  const tx = problemDb.transaction([ATTEMPT_STORE, POINTING_STORE, DRILL_STORE], 'readwrite');
  for (const attempt of fresh) tx.objectStore(ATTEMPT_STORE).add(attempt);
  for (const saved of freshRuns) tx.objectStore(POINTING_STORE).add(saved);
  for (const saved of freshDrills) tx.objectStore(DRILL_STORE).add(saved);
  tx.onerror = () => showFailure('import not saved: ' + tx.error);
  tx.oncomplete = () => {
    attempts.push(...fresh);
    pointingRuns.push(...freshRuns);
    drillAttempts.push(...freshDrills);
    const already = read.valid.length - fresh.length + read.validRuns.length - freshRuns.length
      + read.validDrills.length - freshDrills.length;
    status.textContent = 'Imported ' + fresh.length + ' new attempts, ' + freshRuns.length + ' pointing runs, and '
      + freshDrills.length + ' drill attempts; ' + already + ' were already here'
      + (read.rejected > 0 ? '; ' + read.rejected + ' invalid items were rejected.' : '.');
    status.hidden = false;
    renderProfile();
    renderPointingHome();
    renderDrillHome();
    renderHistory();
  };
}

//-------PLAYING A SET-------

const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// run.mode: 'problems' (a set of problems) or 'drill' (a last-flag drill set).
function beginSet() {
  run = { mode: 'problems', problems: pickProblemSet(bank, attempts, cryptoRandom), index: 0, setStartedAt: Date.now(), results: [] };
  hideHome();
  byId('problems-play').hidden = false;
  document.body.classList.add('problems-running');
  showProblem();
}

function beginDrill() {
  run = { mode: 'drill', problems: pickDrillSet(bank, drillAttempts, cryptoRandom), index: 0, setStartedAt: Date.now(), results: [] };
  hideHome();
  byId('problems-play').hidden = false;
  document.body.classList.add('problems-running');
  showProblem();
}

function buildBoard() {
  const boardElement = byId('board');
  boardElement.style.setProperty('--cell-size', cellPx + 'px');
  boardElement.style.setProperty('--board-width', String(bank.width));
  if (squareElements.length !== bank.width * bank.height) {
    boardElement.replaceChildren();
    squareElements = [];
    for (let i = 0; i < bank.width * bank.height; i++) {
      const square = document.createElement('div');
      boardElement.append(square);
      squareElements.push(square);
    }
  }
}

function paintSquare(i, showContext) {
  const element = squareElements[i];
  const board = live.board;
  if (showContext && board.revealed[i]) {
    if (board.mine[i]) {
      element.className = 'cell revealed mine-hit';
      element.innerHTML = MINE_SVG;
      return;
    }
    const n = board.adjacent[i];
    element.className = 'cell revealed' + (n > 0 ? ' n' + n : '');
    element.textContent = n > 0 ? String(n) : '';
    return;
  }
  element.className = 'cell hidden';
  element.innerHTML = showContext && board.flagged[i] ? FLAG_SVG : '';
}

function paintBoard(showContext) {
  for (let i = 0; i < squareElements.length; i++) paintSquare(i, showContext);
}

function setInstruction(text) {
  byId('problems-play-instruction').textContent = text;
}

function showProblem() {
  const problem = run.problems[run.index];
  live = {
    mode: run.mode,
    problem,
    board: problemBoard(bank, problem),
    phase: 'waiting',
    previewT: null,
    startT: null,
    actions: [],
    samples: { t: [], x: [], y: [] },
    leftDown: false,
    chordGesture: false,
    previewTimer: null,
    timeoutTimer: null,
  };
  byId('problems-result').hidden = true;
  byId('problems-play-count').textContent = (run.mode === 'drill' ? 'Last-flag drill ' : 'Problem ')
    + (run.index + 1) + ' of ' + run.problems.length;
  setInstruction('Rest the cursor on the ringed square.');
  buildBoard();
  paintBoard(false);
  measureGrid();
  placeRing(problem);
  // A drill's box surrounds the number whose last flag is missing.
  placeFocusBox(run.mode === 'drill' ? { ...problem, start: problem.number } : problem);
}

// The grid is measured once per problem or pointing run, after layout, in page
// coordinates, so scrolling during it cannot shift the recorded positions.
function measureGrid() {
  const first = squareElements[0].getBoundingClientRect();
  const last = squareElements[squareElements.length - 1].getBoundingClientRect();
  boardGrid = {
    left: first.left + window.scrollX,
    top: first.top + window.scrollY,
    cellW: (last.right - first.left) / bank.width,
    cellH: (last.bottom - first.top) / bank.height,
  };
}

// A square's rectangle in the board area's own coordinates (the area scrolls
// sideways on narrow screens, and its overlays scroll with it).
function squareInArea(cell) {
  const area = byId('problems-board-area');
  const areaRect = area.getBoundingClientRect();
  const rect = squareElements[cell].getBoundingClientRect();
  const left = rect.left - areaRect.left + area.scrollLeft;
  const top = rect.top - areaRect.top + area.scrollTop;
  return { left, top, right: left + rect.width, bottom: top + rect.height };
}

function placeRing(problem) {
  placeRingOver(problem.start, problem.startAt);
}

// The ring around a square; its dot at `at` (fractions of the square).
function placeRingOver(cell, at) {
  const ring = byId('problems-start-ring');
  const square = squareInArea(cell);
  const size = cellPx * 1.8;
  ring.style.width = size + 'px';
  ring.style.height = size + 'px';
  ring.style.left = ((square.left + square.right) / 2 - size / 2) + 'px';
  ring.style.top = ((square.top + square.bottom) / 2 - size / 2) + 'px';
  ring.style.setProperty('--dot-x', (50 + (at[0] - 0.5) * cellPx / size * 100) + '%');
  ring.style.setProperty('--dot-y', (50 + (at[1] - 0.5) * cellPx / size * 100) + '%');
  ring.hidden = false;
}

// The area where the answer lies, shown from the start through the result.
function placeFocusBox(problem) {
  const box = problemFocusBox(bank, problem);
  const first = squareInArea(box.row0 * bank.width + box.col0);
  const last = squareInArea(box.row1 * bank.width + box.col1);
  const element = byId('problems-focus-box');
  const pad = 3;
  element.style.left = (first.left - pad) + 'px';
  element.style.top = (first.top - pad) + 'px';
  element.style.width = (last.right - first.left + 2 * pad) + 'px';
  element.style.height = (last.bottom - first.top + 2 * pad) + 'px';
  element.hidden = false;
}

function gridPosition(event) {
  return {
    x: (event.pageX - boardGrid.left) / boardGrid.cellW,
    y: (event.pageY - boardGrid.top) / boardGrid.cellH,
  };
}

function squareAt(position) {
  const col = Math.floor(position.x);
  const row = Math.floor(position.y);
  if (col < 0 || row < 0 || col >= bank.width || row >= bank.height) return null;
  return row * bank.width + col;
}

function onPointerMove(event) {
  if (pointing !== null) {
    onPointingMove(event);
    return;
  }
  if (live === null || live.phase === 'done') return;
  const position = gridPosition(event);
  const square = squareAt(position);
  if (live.phase === 'waiting') {
    if (square !== live.problem.start) return;
    if (live.mode === 'drill') startDrillPosition(event.timeStamp, position);
    else beginPreview(event.timeStamp, position);
    return;
  }
  live.samples.t.push(event.timeStamp);
  live.samples.x.push(position.x);
  live.samples.y.push(position.y);
  if (live.phase === 'preview' && square !== live.problem.start) cancelPreview();
}

// A drill position has nothing to open first: the board appears in the frame
// after the cursor reaches the ring, and that frame's timestamp is time zero.
function startDrillPosition(t, position) {
  live.phase = 'appearing';
  live.samples = { t: [t], x: [position.x], y: [position.y] };
  requestAnimationFrame((frameT) => {
    if (live === null || live.phase !== 'appearing') return;
    paintBoard(true);
    byId('problems-start-ring').hidden = true;
    live.startT = frameT;
    live.phase = 'running';
    setInstruction('Open the boxed number\'s squares: flag its missing mine and chord in one motion.');
    live.timeoutTimer = setTimeout(() => finishDrillAttempt('timeout', performance.now()), LAST_FLAG_TIMEOUT_MS);
  });
}

function finishCurrent(outcome, t) {
  if (live.mode === 'drill') finishDrillAttempt(outcome, t);
  else finishAttempt(outcome, t);
}

function beginPreview(t, position) {
  live.phase = 'preview';
  live.previewT = t;
  live.samples = { t: [t], x: [position.x], y: [position.y] };
  paintBoard(true);
  live.previewTimer = setTimeout(openStartSquare, Math.max(0, PROBLEM_PREVIEW_MS - (performance.now() - t)));
}

function cancelPreview() {
  clearTimeout(live.previewTimer);
  live.phase = 'waiting';
  live.previewT = null;
  live.samples = { t: [], x: [], y: [] };
  paintBoard(false);
}

// The start square opens in an animation frame; that frame's timestamp is the
// attempt's time zero (the frame that first draws the new number).
function openStartSquare() {
  requestAnimationFrame(function open(frameT) {
    if (live === null || live.phase !== 'preview') return;
    // The first frame at or after the preview's end, on the frame clock.
    if (frameT - live.previewT < PROBLEM_PREVIEW_MS) {
      requestAnimationFrame(open);
      return;
    }
    const effect = applyProblemAction(live.board, 'reveal', live.problem.start);
    for (const cell of effect.opened) paintSquare(cell, true);
    byId('problems-start-ring').hidden = true;
    live.startT = frameT;
    live.phase = 'running';
    setInstruction('Open every square the new number proves safe.');
    live.timeoutTimer = setTimeout(() => finishAttempt('timeout', performance.now()), PROBLEM_TIMEOUT_MS);
  });
}

// gesture: the chord came from both buttons (the second half of a 1.5 click).
function act(kind, cell, t, gesture) {
  const effect = applyProblemAction(live.board, kind, cell);
  live.actions.push({ t: t - live.startT, kind, cell, ...(gesture ? { gesture: true } : {}) });
  for (const opened of effect.opened) paintSquare(opened, true);
  if (effect.flagChanged) paintSquare(cell, true);
  if (effect.mineHit !== null) finishCurrent('mine', t);
  else if (problemSolved(live.board, live.problem)) finishCurrent('solved', t);
}

// Buttons as in the game: a right press flags at once; once both buttons are
// down the left release chords and never opens a covered square; a plain left
// release opens a covered square or chords a number.
function onBoardMouseDown(event) {
  if (pointing !== null) {
    onPointingPress(event);
    return;
  }
  if (live === null || live.phase !== 'running') return;
  const cell = squareAt(gridPosition(event));
  if (event.button === 2) {
    if (live.leftDown) {
      live.chordGesture = true;
      return;
    }
    if (cell !== null && !live.board.revealed[cell]) act(live.board.flagged[cell] ? 'unflag' : 'flag', cell, event.timeStamp);
    return;
  }
  if (event.button !== 0) return;
  live.leftDown = true;
  live.chordGesture = (event.buttons & 2) !== 0;
}

function onMouseUp(event) {
  if (live === null || live.phase !== 'running') return;
  if (event.button === 2) {
    if (!live.leftDown) live.chordGesture = false;
    return;
  }
  if (event.button !== 0 || !live.leftDown) return;
  live.leftDown = false;
  const gesture = live.chordGesture;
  live.chordGesture = false;
  const cell = squareAt(gridPosition(event));
  if (cell === null) return;
  if (gesture) {
    if (live.board.revealed[cell]) act('chord', cell, event.timeStamp, true);
    return;
  }
  act(live.board.revealed[cell] ? 'chord' : 'reveal', cell, event.timeStamp);
}

function finishAttempt(outcome, endT) {
  clearTimeout(live.timeoutTimer);
  live.phase = 'done';
  const attempt = {
    startedAt: Math.round(performance.timeOrigin + live.startT),
    protocol: PROBLEM_PROTOCOL,
    bankId: bank.bankId,
    problemId: live.problem.id,
    classId: live.problem.classId,
    setStartedAt: run.setStartedAt,
    cellPx,
    timeOriginMs: performance.timeOrigin,
    previewT: live.previewT,
    startT: live.startT,
    endT,
    outcome,
    actions: live.actions,
    samples: {
      t: live.samples.t.map((t) => t - live.startT),
      x: live.samples.x,
      y: live.samples.y,
    },
  };
  if (!validProblemAttempt(attempt)) showFailure('attempt ' + attempt.startedAt + ' could not be recorded: its record is malformed');
  const tx = problemDb.transaction(ATTEMPT_STORE, 'readwrite');
  tx.objectStore(ATTEMPT_STORE).add(attempt);
  tx.onerror = () => showFailure('attempt not saved: ' + tx.error);
  tx.oncomplete = () => {
    attempts.push(attempt);
    run.results.push(attempt);
    if (outcome === 'abandoned') renderSummary();
    else renderResult(attempt);
  };
}

function valueBlock(number, label) {
  const block = document.createElement('div');
  block.className = 'problems-value';
  const value = document.createElement('span');
  value.className = 'problems-value-number';
  value.textContent = number;
  const caption = document.createElement('span');
  caption.className = 'problems-value-label';
  caption.textContent = label;
  block.append(value, caption);
  return block;
}

function renderResult(attempt) {
  const summary = summarizeAttempt(bank, attempt);
  const problem = live.problem;
  paintBoard(true);
  for (const cell of problem.freshSafe) squareElements[cell].classList.add('problems-answer-safe');
  for (const cell of problem.freshMines) squareElements[cell].classList.add('problems-answer-mine');
  squareElements[problem.start].classList.add('problems-start-square');
  setInstruction(OUTCOME_TEXT[attempt.outcome]);

  const values = byId('problems-result-values');
  values.replaceChildren(valueBlock(seconds(summary.thinkMs), 'thinking'),
    valueBlock(seconds(summary.travelMs), 'moving'), valueBlock(seconds(summary.doneMs), 'total'));
  if (summary.otherClicks > 0) values.append(valueBlock(String(summary.otherClicks), 'extra clicks'));

  const described = describeProblemClass(bank, problem.classId);
  const { entries, missing } = levelEntries(problem.classId);
  if (summary.thinkMs !== null) entries.push({ ms: summary.thinkMs, kind: 'you', label: 'You', title: 'This problem' });
  const first = problem.original.first;
  if (first !== null && first.immediate && first.thinkMs !== undefined) {
    entries.push({ ms: first.thinkMs, kind: 'original', label: 'Original player',
      title: problem.sourceBvs.toFixed(2) + ' 3BV/s in that game' });
  }
  const ladder = byId('problems-result-ladder');
  ladder.replaceChildren();
  renderLadder(ladder, { title: described.name, help: described.rule, note: 'Thinking time by skill level (3BV/s)', entries, missing });

  const last = run.index === run.problems.length - 1;
  byId('problems-answer-key').hidden = false;
  byId('problems-stop').hidden = false;
  byId('problems-next').textContent = last ? 'Finish the set (Enter)' : 'Next problem (Enter)';
  byId('problems-result').hidden = false;
  byId('problems-next').focus();
}

function nextProblem() {
  if (pointing !== null) {
    if (pointing.phase === 'done') renderHome();
    return;
  }
  if (live === null || live.phase !== 'done') return;
  if (run.index === run.problems.length - 1) {
    renderSummary();
    return;
  }
  run.index++;
  showProblem();
}

function stopSet() {
  if (live !== null && live.phase === 'running') {
    finishCurrent('abandoned', performance.now());
    return;
  }
  if (live !== null && live.phase === 'preview') clearTimeout(live.previewTimer);
  renderSummary();
}

function renderSummary() {
  if (run.results.length === 0) {
    renderHome();
    return;
  }
  live = null;
  document.body.classList.remove('problems-running');
  byId('problems-play').hidden = true;
  byId('problems-summary').hidden = false;
  if (run.mode === 'drill') {
    const body = headerRow(byId('problems-summary-table'), ['#', 'Result', 'Time', 'Clicks', '1.5 click'], [1, 4]);
    run.results.forEach((attempt, i) => {
      const summary = summarizeDrillAttempt(bank, attempt);
      const tr = body.insertRow();
      cellText(tr, String(i + 1));
      cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
      cellText(tr, seconds(summary.doneMs), 'problems-number');
      cellText(tr, String(summary.clicks), 'problems-number');
      cellText(tr, summary.usedGesture ? 'yes' : 'no', 'problems-text');
    });
  } else {
    const body = headerRow(byId('problems-summary-table'), ['#', 'Rule', 'Result', 'Thinking', 'Total'], [1, 2]);
    run.results.forEach((attempt, i) => {
      const summary = summarizeAttempt(bank, attempt);
      const tr = body.insertRow();
      cellText(tr, String(i + 1));
      cellText(tr, describeProblemClass(bank, bank.byId.get(attempt.problemId).classId).name, 'problems-rule-name problems-text');
      cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
      cellText(tr, seconds(summary.thinkMs), 'problems-number');
      cellText(tr, seconds(summary.doneMs), 'problems-number');
    });
  }
  byId('problems-summary-done').focus();
}

//-------LAST-FLAG DRILL-------

function finishDrillAttempt(outcome, endT) {
  clearTimeout(live.timeoutTimer);
  live.phase = 'done';
  const attempt = {
    startedAt: Math.round(performance.timeOrigin + live.startT),
    protocol: LAST_FLAG_PROTOCOL,
    bankId: bank.bankId,
    positionId: live.problem.id,
    setStartedAt: run.setStartedAt,
    cellPx,
    timeOriginMs: performance.timeOrigin,
    startT: live.startT,
    endT,
    outcome,
    actions: live.actions,
    samples: { t: live.samples.t.map((t) => t - live.startT), x: live.samples.x, y: live.samples.y },
  };
  if (!validDrillAttempt(attempt)) showFailure('drill attempt ' + attempt.startedAt + ' could not be recorded: its record is malformed');
  const tx = problemDb.transaction(DRILL_STORE, 'readwrite');
  tx.objectStore(DRILL_STORE).add(attempt);
  tx.onerror = () => showFailure('drill attempt not saved: ' + tx.error);
  tx.oncomplete = () => {
    drillAttempts.push(attempt);
    run.results.push(attempt);
    if (outcome === 'abandoned') renderSummary();
    else renderDrillResult(attempt);
  };
}

function renderDrillResult(attempt) {
  const summary = summarizeDrillAttempt(bank, attempt);
  const position = live.problem;
  paintBoard(true);
  for (const cell of position.freshSafe) squareElements[cell].classList.add('problems-answer-safe');
  squareElements[position.mineCell].classList.add('problems-answer-mine');
  squareElements[position.number].classList.add('problems-start-square');
  setInstruction(OUTCOME_TEXT[attempt.outcome]);
  byId('problems-result-values').replaceChildren(
    valueBlock(seconds(summary.doneMs), 'time'),
    valueBlock(String(summary.clicks), summary.clicks === 1 ? 'click' : 'clicks'),
    valueBlock(summary.usedGesture ? 'yes' : 'no', '1.5 click'),
  );
  const ladder = byId('problems-result-ladder');
  const original = document.createElement('p');
  original.textContent = 'The original player (' + position.sourceBvs.toFixed(2) + ' 3BV/s in that game) flagged and chorded '
    + seconds(position.originalMs) + ' after their previous click.';
  ladder.replaceChildren(original);
  byId('problems-answer-key').hidden = false;
  byId('problems-stop').hidden = false;
  const last = run.index === run.problems.length - 1;
  byId('problems-next').textContent = last ? 'Finish the drill (Enter)' : 'Next position (Enter)';
  byId('problems-result').hidden = false;
  byId('problems-next').focus();
}

function renderDrillHome() {
  const done = drillAttempts.filter((a) => bank.lastFlagById.has(a.positionId)
    && a.outcome !== 'abandoned' && a.outcome !== 'interrupted');
  const stats = byId('drill-stats');
  if (done.length === 0) {
    stats.textContent = 'Not tried yet.';
    return;
  }
  const summaries = done.map((a) => summarizeDrillAttempt(bank, a));
  const solved = summaries.filter((s) => s.outcome === 'solved');
  if (solved.length === 0) {
    stats.textContent = done.length + ' positions tried, none solved yet.';
    return;
  }
  const gestureShare = solved.filter((s) => s.usedGesture).length / solved.length;
  stats.textContent = done.length + ' positions tried, ' + solved.length + ' solved; median time '
    + seconds(problemMedian(solved.map((s) => s.doneMs))) + '; 1.5 click in '
    + Math.round(100 * gestureShare) + '% of solved positions.';
}

//-------POINTING TEST-------

const POINTING_BUCKETS = ['2-4', '4-8', '8+'];

function beginPointing() {
  hideHome();
  byId('problems-play').hidden = false;
  byId('problems-result').hidden = true;
  document.body.classList.add('problems-running');
  live = null;
  buildBoard();
  for (const square of squareElements) {
    square.className = 'cell hidden';
    square.innerHTML = '';
  }
  measureGrid();
  const route = pointingTargets(bank.width, bank.height);
  pointing = { route, index: 0, phase: 'ready', startT: null, shownT: null, targets: [], misses: [],
    samples: { t: [], x: [], y: [] } };
  byId('problems-play-count').textContent = 'Pointing test';
  setInstruction('Press the ringed square to begin, then each blue square as fast as you can.');
  byId('problems-focus-box').hidden = true;
  placeRingOver(POINTING_START[1] * bank.width + POINTING_START[0], [0.5, 0.5]);
}

// Each target is drawn in the frame after the previous press; that frame's
// timestamp is when it was shown.
function showNextTarget() {
  pointing.phase = 'between';
  const target = pointing.route[pointing.index];
  byId('problems-play-count').textContent = 'Pointing test: target ' + (pointing.index + 1) + ' of ' + pointing.route.length;
  requestAnimationFrame((frameT) => {
    if (pointing === null || pointing.phase !== 'between') return;
    squareElements[target.cell].classList.add('pointing-target');
    pointing.shownT = frameT;
    pointing.phase = 'showing';
  });
}

function onPointingMove(event) {
  if (pointing.phase === 'ready' || pointing.phase === 'done') return;
  const position = gridPosition(event);
  pointing.samples.t.push(event.timeStamp);
  pointing.samples.x.push(position.x);
  pointing.samples.y.push(position.y);
}

// Presses on the target count; presses elsewhere while it shows are misses;
// presses in the frame gap between targets count for nothing.
function onPointingPress(event) {
  if (event.button !== 0) return;
  const position = gridPosition(event);
  const cell = squareAt(position);
  if (pointing.phase === 'ready') {
    if (cell !== POINTING_START[1] * bank.width + POINTING_START[0]) return;
    pointing.startT = event.timeStamp;
    pointing.samples = { t: [event.timeStamp], x: [position.x], y: [position.y] };
    byId('problems-start-ring').hidden = true;
    setInstruction('Press each blue square as fast as you can.');
    showNextTarget();
    return;
  }
  if (pointing.phase !== 'showing') return;
  const target = pointing.route[pointing.index];
  if (cell !== target.cell) {
    pointing.misses.push({ t: event.timeStamp, x: position.x, y: position.y });
    return;
  }
  pointing.targets.push({ shownT: pointing.shownT, pressT: event.timeStamp, x: position.x, y: position.y, misses: pointing.misses });
  pointing.misses = [];
  squareElements[target.cell].classList.remove('pointing-target');
  pointing.index++;
  if (pointing.index === pointing.route.length) finishPointing('complete', event.timeStamp);
  else showNextTarget();
}

function finishPointing(outcome, endT) {
  pointing.phase = 'done';
  const record = {
    startedAt: Math.round(performance.timeOrigin + pointing.startT),
    protocol: POINTING_PROTOCOL,
    cellPx,
    timeOriginMs: performance.timeOrigin,
    startT: pointing.startT,
    endT,
    outcome,
    targets: pointing.targets,
    samples: pointing.samples,
  };
  if (!validPointingRun(record, bank.width, bank.height)) {
    showFailure('pointing run ' + record.startedAt + ' could not be recorded: its record is malformed');
  }
  const tx = problemDb.transaction(POINTING_STORE, 'readwrite');
  tx.objectStore(POINTING_STORE).add(record);
  tx.onerror = () => showFailure('pointing run not saved: ' + tx.error);
  tx.oncomplete = () => {
    pointingRuns.push(record);
    if (outcome === 'complete') renderPointingResult(record);
    else renderHome();
  };
}

// Ladders for travel by move length: the skill levels' in-game travel and
// this run's.
function pointingLadders(container, summary) {
  container.replaceChildren();
  for (const bucket of POINTING_BUCKETS) {
    const entries = [];
    const missing = [];
    for (const level of bank.levels) {
      const entry = bank.travelByLevel[level][bucket];
      if (entry.moves < PROBLEM_LEVEL_MIN_MOVES) {
        missing.push(levelLabel(level));
        continue;
      }
      entries.push({ ms: entry.medianMs, kind: 'level', label: levelLabel(level) + ' 3BV/s',
        title: 'Median in-game travel over ' + entry.moves + ' moves' });
    }
    const yours = summary.byDistance[bucket].medianTravelMs;
    if (yours !== null) entries.push({ ms: yours, kind: 'you', label: 'You', title: 'This pointing run' });
    renderLadder(container, {
      title: bucket.replace('-', '\u2013') + ' squares',
      help: 'Travel: from the cursor starting to move until it enters the square for the last time before the press. Levels: players\' in-game travel for moves of this length.',
      note: 'Travel by skill level (3BV/s)',
      entries,
      missing,
    });
  }
}

function pointingValues(container, summary) {
  container.replaceChildren(
    valueBlock(seconds(summary.medianMovementMs), 'per target'),
    valueBlock(summary.throughputBitsPerSec.toFixed(1) + ' bits/s', 'throughput'),
    valueBlock(String(summary.misses), summary.misses === 1 ? 'miss' : 'misses'),
  );
}

function renderPointingResult(record) {
  const summary = summarizePointing(record, bank.width, bank.height);
  byId('problems-play-count').textContent = 'Pointing test';
  setInstruction('Done');
  pointingValues(byId('problems-result-values'), summary);
  pointingLadders(byId('problems-result-ladder'), summary);
  byId('problems-answer-key').hidden = true;
  byId('problems-stop').hidden = true;
  byId('problems-next').textContent = 'Done (Enter)';
  byId('problems-result').hidden = false;
  byId('problems-next').focus();
}

function renderPointingHome() {
  const complete = pointingRuns.filter((r) => r.outcome === 'complete').sort((a, b) => a.startedAt - b.startedAt);
  const latest = byId('pointing-latest');
  latest.replaceChildren();
  byId('pointing-count').textContent = complete.length === 0 ? 'Not taken yet.'
    : complete.length + (complete.length === 1 ? ' complete run. Latest:' : ' complete runs. Latest:');
  if (complete.length === 0) return;
  const summary = summarizePointing(complete[complete.length - 1], bank.width, bank.height);
  const values = document.createElement('div');
  values.className = 'pointing-values';
  pointingValues(values, summary);
  const ladders = document.createElement('div');
  ladders.className = 'pointing-ladders';
  pointingLadders(ladders, summary);
  latest.append(values, ladders, pointingSizeComparison(complete));
}

function pointingSizeComparison(complete) {
  const sizes = pointingBySize(complete, bank.width, bank.height);
  if (sizes.length === 1) {
    const hint = document.createElement('p');
    hint.textContent = 'All runs so far at ' + sizes[0].cellPx + ' px squares. To compare sizes, choose another square size above and take runs there too.';
    return hint;
  }
  const section = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = 'By square size';
  const scroll = document.createElement('div');
  scroll.className = 'problems-table-scroll';
  const table = document.createElement('table');
  table.className = 'problems-table';
  const body = headerRow(table, ['square size', 'runs', 'per target', '2\u20134 squares', '4\u20138 squares', '8+ squares', 'misses per run'], [0]);
  const ms = (value) => (value === null ? '\u2013' : Math.round(value) + ' ms');
  for (const size of sizes) {
    const row = body.insertRow();
    cellText(row, size.cellPx + ' px', 'problems-text');
    cellText(row, String(size.runs), 'problems-number');
    cellText(row, ms(size.medianMovementMs), 'problems-number');
    for (const name of ['2-4', '4-8', '8+']) cellText(row, ms(size.byDistance[name]), 'problems-number');
    cellText(row, size.missesPerRun.toFixed(1), 'problems-number');
  }
  scroll.append(table);
  section.append(heading, scroll);
  return section;
}

// A hidden tab or an unfocused window makes timing meaningless: a running
// attempt ends as interrupted, a preview starts over.
function onInterruption() {
  if (pointing !== null) {
    if (pointing.phase === 'showing' || pointing.phase === 'between') finishPointing('interrupted', performance.now());
    return;
  }
  if (live === null) return;
  if (live.phase === 'running') finishCurrent('interrupted', performance.now());
  else if (live.phase === 'preview') cancelPreview();
}

document.addEventListener('mousemove', onPointerMove);
document.addEventListener('mouseup', onMouseUp);
byId('board').addEventListener('mousedown', onBoardMouseDown);
byId('problems-board-area').addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onInterruption();
});
window.addEventListener('blur', onInterruption);
document.addEventListener('keydown', (event) => {
  if (pointing !== null) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (pointing.phase === 'showing' || pointing.phase === 'between') finishPointing('abandoned', performance.now());
      else renderHome();
    } else if ((event.key === 'Enter' || event.key === ' ') && pointing.phase === 'done'
        && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      renderHome();
    }
    return;
  }
  if (run === null) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (live === null) renderHome();
    else stopSet();
  } else if ((event.key === 'Enter' || event.key === ' ') && live !== null && live.phase === 'done'
      && !(event.target instanceof HTMLButtonElement)) {
    // A focused button already acts on these keys itself.
    event.preventDefault();
    nextProblem();
  }
});
byId('problems-start-set').addEventListener('click', beginSet);
byId('pointing-start').addEventListener('click', beginPointing);
byId('drill-start').addEventListener('click', beginDrill);
byId('problems-next').addEventListener('click', nextProblem);
byId('problems-stop').addEventListener('click', stopSet);
byId('problems-summary-done').addEventListener('click', renderHome);
byId('problems-export').addEventListener('click', exportAttempts);
byId('problems-import').addEventListener('change', (event) => importAttempts(event.target));

startProblemsPage();
