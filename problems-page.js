'use strict';

// Minesweeper problems page (docs/product/problems.md). The page keeps its own
// IndexedDB database, so it runs the same on the game's origin and on a host
// of its own; it loads the problem bank, runs sets of problems, saves every
// attempt, and shows the per-rule profile, the history, and the backup.

const PROBLEM_DB_NAME = 'minesweeper-problems';
const PROBLEM_DB_VERSION = 1;
const ATTEMPT_STORE = 'attempts';
const PREFERENCE_STORE = 'preferences';
const PROBLEM_BANK_URL = 'problems-bank.json?v=20260926-problems';
const HISTORY_ROWS = 30;
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
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ATTEMPT_STORE, { keyPath: 'startedAt' });
      request.result.createObjectStore(PREFERENCE_STORE);
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
  document.body.classList.remove('problems-running');
  byId('problems-play').hidden = true;
  byId('problems-summary').hidden = true;
  for (const id of ['problems-start', 'problems-profile', 'problems-history', 'problems-backup']) byId(id).hidden = false;
  byId('problems-start-set').textContent = 'Start ' + PROBLEM_SET_SIZE + ' problems';
  renderCellSizes();
  renderProfile();
  renderHistory();
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

// One cell per level: its median thinking time on the class, green when it
// is at or above yours, a dash when too few corpus moves stand behind it.
function levelCells(tr, classId, yourMs) {
  for (const level of bank.levels) {
    const median = levelThinkMs(bank, classId, level);
    const matched = median !== null && yourMs !== null && median >= yourMs;
    const td = cellText(tr, seconds(median), matched ? 'problems-level-matched' : '');
    td.title = bank.classes[classId].byLevel[level].freshMoves + ' fresh moves in the replay corpus';
  }
}

function renderProfile() {
  const body = headerRow(byId('problems-profile-table'),
    ['Rule', 'Solved', 'You', ...bank.levels.map((l) => levelLabel(l) + ' 3BV/s')], [0]);
  for (const row of problemProfile(bank, attempts)) {
    const tr = body.insertRow();
    const described = describeProblemClass(bank, row.classId);
    const name = cellText(tr, described.name, 'problems-rule-name problems-text');
    name.title = described.rule;
    cellText(tr, row.solved + ' of ' + row.attempts);
    cellText(tr, seconds(row.medianThinkMs), 'problems-number');
    levelCells(tr, row.classId, row.medianThinkMs);
  }
}

function renderHistory() {
  const recent = [...attempts].sort((a, b) => b.startedAt - a.startedAt).slice(0, HISTORY_ROWS);
  byId('problems-history-count').textContent = attempts.length === 0 ? 'No attempts yet.'
    : attempts.length + ' attempts saved; the latest ' + recent.length + ' are shown.';
  const body = headerRow(byId('problems-history-table'),
    ['When', 'Rule', 'Result', 'Thinking', 'First answer', 'All squares', 'Other clicks'], [0, 1, 2]);
  for (const attempt of recent) {
    const tr = body.insertRow();
    cellText(tr, new Date(attempt.startedAt).toLocaleString(), 'problems-text');
    const problem = bank.byId.get(attempt.problemId);
    if (problem === undefined) {
      cellText(tr, 'a problem not in bank ' + bank.bankId, 'problems-text');
      cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
      for (let i = 0; i < 4; i++) cellText(tr, '\u2013');
      continue;
    }
    const summary = summarizeAttempt(bank, attempt);
    cellText(tr, describeProblemClass(bank, problem.classId).name, 'problems-rule-name problems-text');
    cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
    cellText(tr, seconds(summary.thinkMs), 'problems-number');
    cellText(tr, seconds(summary.firstMs), 'problems-number');
    cellText(tr, seconds(summary.doneMs), 'problems-number');
    cellText(tr, String(summary.otherClicks));
  }
}

function exportAttempts() {
  const file = problemAttemptsFile(attempts, Date.now());
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
    read = readProblemAttemptsFile(JSON.parse(await file.text()));
  } catch (error) {
    status.textContent = 'Import failed: ' + error.message;
    status.hidden = false;
    return;
  }
  const known = new Set(attempts.map((a) => a.startedAt));
  const fresh = [];
  for (const attempt of read.valid) {
    if (known.has(attempt.startedAt)) continue;
    known.add(attempt.startedAt);
    fresh.push(attempt);
  }
  const tx = problemDb.transaction(ATTEMPT_STORE, 'readwrite');
  for (const attempt of fresh) tx.objectStore(ATTEMPT_STORE).add(attempt);
  tx.onerror = () => showFailure('import not saved: ' + tx.error);
  tx.oncomplete = () => {
    attempts.push(...fresh);
    status.textContent = 'Imported ' + fresh.length + ' new attempts; ' + (read.valid.length - fresh.length)
      + ' were already here' + (read.rejected > 0 ? '; ' + read.rejected + ' invalid attempts were rejected.' : '.');
    status.hidden = false;
    renderProfile();
    renderHistory();
  };
}

//-------PLAYING A SET-------

function beginSet() {
  const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  run = { problems: pickProblemSet(bank, attempts, random), index: 0, setStartedAt: Date.now(), results: [] };
  for (const id of ['problems-start', 'problems-profile', 'problems-history', 'problems-backup', 'problems-summary']) byId(id).hidden = true;
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
    problem,
    board: problemBoard(bank, problem),
    phase: 'waiting',
    grid: null,
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
  byId('problems-play-count').textContent = 'Problem ' + (run.index + 1) + ' of ' + run.problems.length;
  setInstruction('Rest the cursor on the ringed square.');
  buildBoard();
  paintBoard(false);
  // The grid is measured once per problem, after layout, in page coordinates
  // so scrolling during an attempt cannot shift the recorded positions.
  const first = squareElements[0].getBoundingClientRect();
  const last = squareElements[squareElements.length - 1].getBoundingClientRect();
  live.grid = {
    left: first.left + window.scrollX,
    top: first.top + window.scrollY,
    cellW: (last.right - first.left) / bank.width,
    cellH: (last.bottom - first.top) / bank.height,
  };
  placeRing(problem);
}

function placeRing(problem) {
  const ring = byId('problems-start-ring');
  const square = squareElements[problem.start];
  const size = cellPx * 1.8;
  ring.style.width = size + 'px';
  ring.style.height = size + 'px';
  ring.style.left = (square.offsetLeft + cellPx / 2 - size / 2) + 'px';
  ring.style.top = (square.offsetTop + cellPx / 2 - size / 2) + 'px';
  ring.style.setProperty('--dot-x', (50 + (problem.startAt[0] - 0.5) * cellPx / size * 100) + '%');
  ring.style.setProperty('--dot-y', (50 + (problem.startAt[1] - 0.5) * cellPx / size * 100) + '%');
  ring.hidden = false;
}

function gridPosition(event) {
  return {
    x: (event.pageX - live.grid.left) / live.grid.cellW,
    y: (event.pageY - live.grid.top) / live.grid.cellH,
  };
}

function squareAt(position) {
  const col = Math.floor(position.x);
  const row = Math.floor(position.y);
  if (col < 0 || row < 0 || col >= bank.width || row >= bank.height) return null;
  return row * bank.width + col;
}

function onPointerMove(event) {
  if (live === null || live.phase === 'done') return;
  const position = gridPosition(event);
  const square = squareAt(position);
  if (live.phase === 'waiting') {
    if (square === live.problem.start) beginPreview(event.timeStamp, position);
    return;
  }
  live.samples.t.push(event.timeStamp);
  live.samples.x.push(position.x);
  live.samples.y.push(position.y);
  if (live.phase === 'preview' && square !== live.problem.start) cancelPreview();
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

function act(kind, cell, t) {
  const effect = applyProblemAction(live.board, kind, cell);
  live.actions.push({ t: t - live.startT, kind, cell });
  for (const opened of effect.opened) paintSquare(opened, true);
  if (effect.flagChanged) paintSquare(cell, true);
  if (effect.mineHit !== null) finishAttempt('mine', t);
  else if (problemSolved(live.board, live.problem)) finishAttempt('solved', t);
}

// Buttons as in the game: a right press flags at once; once both buttons are
// down the left release chords and never opens a covered square; a plain left
// release opens a covered square or chords a number.
function onBoardMouseDown(event) {
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
    if (live.board.revealed[cell]) act('chord', cell, event.timeStamp);
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
  values.replaceChildren();
  if (attempt.outcome !== 'solved') {
    const outcome = document.createElement('span');
    outcome.className = 'problems-outcome';
    outcome.textContent = OUTCOME_TEXT[attempt.outcome];
    values.append(outcome);
  }
  values.append(valueBlock(seconds(summary.thinkMs), 'thinking'), valueBlock(seconds(summary.travelMs), 'moving'),
    valueBlock(seconds(summary.firstMs), 'first answer'), valueBlock(seconds(summary.doneMs), 'all squares'));
  if (summary.otherClicks > 0) {
    values.append(valueBlock(String(summary.otherClicks), summary.otherClicks === 1
      ? 'click outside the new number\'s squares' : 'clicks outside the new number\'s squares'));
  }

  const described = describeProblemClass(bank, problem.classId);
  const rule = byId('problems-result-rule');
  rule.replaceChildren();
  const name = document.createElement('strong');
  name.textContent = described.name + ': ';
  rule.append(name, described.rule + ' The dashed squares are what the new number proves: green safe, red mines.');

  const profileRow = problemProfile(bank, attempts).find((row) => row.classId === problem.classId);
  const body = headerRow(byId('problems-result-levels'),
    ['3BV/s level', ...bank.levels.map(levelLabel), 'You (' + profileRow.thinkCount + ' timed)'], [0]);
  const tr = body.insertRow();
  cellText(tr, 'Median thinking on this rule', 'problems-rule-name problems-text');
  levelCells(tr, problem.classId, profileRow.medianThinkMs);
  cellText(tr, seconds(profileRow.medianThinkMs), 'problems-number');

  const first = problem.original.first;
  byId('problems-result-original').textContent = first !== null && first.immediate
    ? 'The original player (' + problem.sourceBvs.toFixed(2) + ' 3BV/s in that game) answered in ' + seconds(first.ms)
      + (first.thinkMs === undefined ? '.' : ', thinking ' + seconds(first.thinkMs) + '.')
    : 'The original player (' + problem.sourceBvs.toFixed(2) + ' 3BV/s in that game) did something else first.';

  const last = run.index === run.problems.length - 1;
  byId('problems-next').textContent = last ? 'Finish the set (Enter)' : 'Next problem (Enter)';
  byId('problems-result').hidden = false;
  byId('problems-next').focus();
}

function nextProblem() {
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
    finishAttempt('abandoned', performance.now());
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
  const body = headerRow(byId('problems-summary-table'),
    ['#', 'Rule', 'Result', 'Thinking', 'First answer', 'All squares'], [1, 2]);
  run.results.forEach((attempt, i) => {
    const summary = summarizeAttempt(bank, attempt);
    const tr = body.insertRow();
    cellText(tr, String(i + 1));
    cellText(tr, describeProblemClass(bank, bank.byId.get(attempt.problemId).classId).name, 'problems-rule-name problems-text');
    cellText(tr, OUTCOME_TEXT[attempt.outcome], 'problems-text');
    cellText(tr, seconds(summary.thinkMs), 'problems-number');
    cellText(tr, seconds(summary.firstMs), 'problems-number');
    cellText(tr, seconds(summary.doneMs), 'problems-number');
  });
  byId('problems-summary-done').focus();
}

// A hidden tab or an unfocused window makes timing meaningless: a running
// attempt ends as interrupted, a preview starts over.
function onInterruption() {
  if (live === null) return;
  if (live.phase === 'running') finishAttempt('interrupted', performance.now());
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
byId('problems-next').addEventListener('click', nextProblem);
byId('problems-stop').addEventListener('click', stopSet);
byId('problems-summary-done').addEventListener('click', renderHome);
byId('problems-export').addEventListener('click', exportAttempts);
byId('problems-import').addEventListener('change', (event) => importAttempts(event.target));

startProblemsPage();
