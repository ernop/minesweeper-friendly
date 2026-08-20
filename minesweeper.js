'use strict';

//-------CONSTANTS-------

const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

const LCD_MIN = -99;
const LCD_MAX = 999;
const TIMER_CAP_SECONDS = 999;

// Seven-segment layout in a 13x23 viewBox. Segment -> polygon points.
const SEGMENT_POINTS = {
  A: '1,0 12,0 10,2 3,2',
  B: '13,1 13,11 11,9.5 11,3',
  C: '13,12 13,22 11,20 11,13.5',
  D: '1,23 3,21 10,21 12,23',
  E: '0,12 2,13.5 2,20 0,22',
  F: '0,1 2,3 2,9.5 0,11',
  G: '1.5,11.5 3,10.5 10,10.5 11.5,11.5 10,12.5 3,12.5',
};

const DIGIT_SEGMENTS = {
  '0': 'ABCDEF',
  '1': 'BC',
  '2': 'ABGED',
  '3': 'ABGCD',
  '4': 'FGBC',
  '5': 'AFGCD',
  '6': 'AFGEDC',
  '7': 'ABC',
  '8': 'ABCDEFG',
  '9': 'ABCFGD',
  '-': 'G',
};

// The status button shows a dove (peace) instead of the classic smiley:
// idle dove, startled flap while pressing, olive branch on win, and a
// broken heart on loss.
const DOVE_BODY = '<path d="M6 9.5 Q6.5 5.8 10.5 6.3 Q14.5 6.8 16.5 9 Q20.5 10.5 24 9.5 L21.5 12 L23.5 14.5 Q17.5 18.5 12 17.5 Q7 16.5 6 12 Q5.6 10.6 6 9.5 Z" fill="#ffffff" stroke="#000" stroke-width="1.1"/>';
const DOVE_BEAK = '<path d="M6.2 8.8 L3 10 L6.2 11.2 Z" fill="#f0a020"/>';
const DOVE_EYE = '<circle cx="8.7" cy="8.8" r="0.75"/>';
const DOVE_EYE_WIDE = '<circle cx="8.7" cy="8.8" r="1.15" fill="none" stroke="#000" stroke-width="0.7"/><circle cx="8.7" cy="8.8" r="0.55"/>';
const DOVE_WING_FOLDED = '<path d="M10.5 10.5 Q14.5 8.5 17.5 10 Q14.5 13.5 10.5 10.5 Z" fill="#dddddd" stroke="#000" stroke-width="0.9"/>';
const DOVE_WING_RAISED = '<path d="M12 9.5 Q13 3.5 18.5 4 Q16.5 8.5 12 9.5 Z" fill="#dddddd" stroke="#000" stroke-width="0.9"/>';
const OLIVE_BRANCH = '<path d="M3 10.8 Q1.6 12.6 2.4 14.8" fill="none" stroke="#2e7d32" stroke-width="0.9"/><ellipse cx="1.7" cy="12.3" rx="1.4" ry="0.75" transform="rotate(-35 1.7 12.3)" fill="#43a047"/><ellipse cx="3.5" cy="13.9" rx="1.4" ry="0.75" transform="rotate(30 3.5 13.9)" fill="#43a047"/>';
const BROKEN_HEART = '<path d="M13 21.5 C5.5 15.5 4.5 9.5 8 7.3 C10.6 5.8 12.4 7.6 13 9.2 C13.6 7.6 15.4 5.8 18 7.3 C21.5 9.5 20.5 15.5 13 21.5 Z" fill="#d32f2f" stroke="#000" stroke-width="1"/><path d="M13 8.8 L11.6 11.5 L13.8 14 L12 17 L13.4 19.5" fill="none" stroke="#ffffff" stroke-width="1.3"/>';

const FACE_SVGS = {
  smile: faceSvg(DOVE_BODY + DOVE_WING_FOLDED + DOVE_EYE + DOVE_BEAK),
  ooh: faceSvg(DOVE_BODY + DOVE_WING_RAISED + DOVE_EYE_WIDE + DOVE_BEAK),
  dead: faceSvg(BROKEN_HEART),
  cool: faceSvg(DOVE_BODY + DOVE_WING_FOLDED + DOVE_EYE + DOVE_BEAK + OLIVE_BRANCH),
};

const FLAG_SVG = '<svg viewBox="0 0 16 16"><path d="M9 3 L9 8.5 L3.5 5.75 Z" fill="#ff0000"/><rect x="8.4" y="3" width="1.2" height="9" fill="#000"/><rect x="5" y="11.5" width="8" height="1.5" fill="#000"/><rect x="3.5" y="13" width="11" height="2" fill="#000"/></svg>';

const MINE_SVG_INNER = '<line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/><circle cx="8" cy="8" r="4.6" stroke="none"/><rect x="6" y="6" width="2" height="2" fill="#ffffff" stroke="none"/>';
const MINE_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '</svg>';
const WRONG_FLAG_SVG = '<svg viewBox="0 0 16 16" fill="#000" stroke="#000" stroke-width="1.4">' + MINE_SVG_INNER + '<path d="M2 2 L14 14 M14 2 L2 14" stroke="#ff0000" stroke-width="2"/></svg>';

function faceSvg(features) {
  return '<svg viewBox="0 0 26 26">' + features + '</svg>';
}

//-------CORE STATE-------

let config = { ...DIFFICULTIES.beginner };
let cells = [];            // {mine, revealed, flagged, adjacent}
let cellElements = [];
let gameState = 'ready';   // ready | playing | won | lost
let minesPlaced = false;
let flagsCount = 0;
let revealedCount = 0;
let startTime = 0;
let finalTimeMs = 0;
let timerInterval = null;
let clickCount = 0;    // board clicks that changed something (reveal/flag/chord)
let wastedClicks = 0;  // board clicks that changed nothing
let flagsPlaced = 0;   // flags the player placed (removals don't subtract)
let flagsRemoved = 0;  // flags the player took back; each removal means the
                       // placement + removal pair (2 clicks) netted nothing —
                       // the second kind of waste besides no-op clicks

// Press-preview state (left button held down)
let leftDown = false;
let pressedIndices = [];

// Mouse path length during the run (px). The position is tracked at all
// times so the first in-game segment starts from wherever the cursor
// already is, but distance only accumulates while playing.
let mousePathPx = 0;
let lastMouseX = null;
let lastMouseY = null;

//-------DOM-------

const boardElement = document.getElementById('board');
const faceButton = document.getElementById('face-button');
const mineCounter = document.getElementById('mine-counter');
const timerDisplay = document.getElementById('timer');
const resultSummary = document.getElementById('result-summary');
const resultStats = document.getElementById('result-stats');
const resultRanks = document.getElementById('result-ranks');
const customForm = document.getElementById('custom-form');

//-------LCD DISPLAYS-------

function buildLcd(container) {
  for (let d = 0; d < 3; d++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 13 23');
    for (const [name, points] of Object.entries(SEGMENT_POINTS)) {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', points);
      poly.dataset.segment = name;
      svg.appendChild(poly);
    }
    container.appendChild(svg);
  }
}

function setLcd(container, value) {
  const clamped = Math.max(LCD_MIN, Math.min(LCD_MAX, value));
  if (container.dataset.value === String(clamped)) return;
  container.dataset.value = String(clamped);
  const text = clamped < 0
    ? '-' + String(-clamped).padStart(2, '0')
    : String(clamped).padStart(3, '0');
  const digits = container.querySelectorAll('svg');
  for (let d = 0; d < 3; d++) {
    const litSegments = DIGIT_SEGMENTS[text[d]];
    for (const poly of digits[d].querySelectorAll('polygon')) {
      poly.classList.toggle('on', litSegments.includes(poly.dataset.segment));
    }
  }
}

//-------BOARD HELPERS-------

function neighbors(index) {
  const x = index % config.width;
  const y = (index - x) / config.width;
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= config.width || ny < 0 || ny >= config.height) continue;
      result.push(ny * config.width + nx);
    }
  }
  return result;
}

// Mines are placed on the first reveal so that cell is never a mine
// (first-click safety, as on minesweeper.online standard mode).
function placeMines(safeIndex) {
  const pool = [];
  for (let i = 0; i < cells.length; i++) {
    if (i !== safeIndex) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let k = 0; k < config.mines; k++) {
    cells[pool[k]].mine = true;
  }
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) continue;
    cells[i].adjacent = neighbors(i).filter((n) => cells[n].mine).length;
  }
  minesPlaced = true;
}

//-------GAME FLOW-------

function newGame() {
  gameState = 'ready';
  minesPlaced = false;
  flagsCount = 0;
  revealedCount = 0;
  clickCount = 0;
  wastedClicks = 0;
  flagsPlaced = 0;
  flagsRemoved = 0;
  finalTimeMs = 0;
  startTime = 0;
  mousePathPx = 0;
  clearInterval(timerInterval);
  timerInterval = null;
  leftDown = false;
  pressedIndices = [];

  cells = [];
  for (let i = 0; i < config.width * config.height; i++) {
    cells.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
  }

  document.documentElement.style.setProperty('--board-width', config.width);
  boardElement.textContent = '';
  cellElements = [];
  for (let i = 0; i < cells.length; i++) {
    const el = document.createElement('div');
    el.className = 'cell hidden';
    el.dataset.index = i;
    boardElement.appendChild(el);
    cellElements.push(el);
  }

  beginTrace();

  setLcd(mineCounter, config.mines);
  setLcd(timerDisplay, 0);
  setFace('smile');
  renderedResult = null;
  resultSummary.textContent = '';
  resultStats.textContent = '';
  resultRanks.textContent = '';
}

function startTimer() {
  startTime = performance.now();
  timerInterval = setInterval(() => {
    setLcd(timerDisplay, Math.min(TIMER_CAP_SECONDS, Math.floor((performance.now() - startTime) / 1000)));
  }, 200);
}

function elapsedMs() {
  return startTime === 0 ? 0 : performance.now() - startTime;
}

function setFace(name) {
  faceButton.innerHTML = FACE_SVGS[name];
}

function updateCell(i) {
  const cell = cells[i];
  const el = cellElements[i];
  if (cell.revealed) {
    el.className = 'cell revealed' + (cell.adjacent > 0 ? ' n' + cell.adjacent : '');
    el.innerHTML = '';
    if (cell.adjacent > 0) el.textContent = cell.adjacent;
  } else {
    el.className = 'cell hidden';
    el.innerHTML = cell.flagged ? FLAG_SVG : '';
  }
}

function revealCell(index) {
  const cell = cells[index];
  if (cell.revealed || cell.flagged) return;

  if (!minesPlaced) {
    placeMines(index);
    gameState = 'playing';
    startTimer();
  }

  if (cell.mine) {
    lose([index]);
    return;
  }

  floodReveal(index);
  checkWin();
}

function floodReveal(index) {
  const stack = [index];
  while (stack.length > 0) {
    const i = stack.pop();
    const cell = cells[i];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    revealedCount++;
    updateCell(i);
    if (cell.adjacent === 0) {
      for (const n of neighbors(i)) {
        if (!cells[n].revealed) stack.push(n);
      }
    }
  }
}

// Returns whether the click changed anything (false on a revealed cell).
function toggleFlag(index) {
  const cell = cells[index];
  if (cell.revealed) return false;
  cell.flagged = !cell.flagged;
  flagsCount += cell.flagged ? 1 : -1;
  if (cell.flagged) flagsPlaced++;
  else flagsRemoved++;
  clickCount++;
  updateCell(index);
  setLcd(mineCounter, config.mines - flagsCount);
  return true;
}

// Left-click chord on a satisfied number opens all unflagged neighbors.
// Returns whether the click changed anything (a chord on a zero cell, an
// unsatisfied number, or a number with nothing left to open is a no-op).
function chord(index) {
  const cell = cells[index];
  if (!cell.revealed || cell.adjacent === 0) return false;
  const around = neighbors(index);
  const flaggedCount = around.filter((n) => cells[n].flagged).length;
  if (flaggedCount !== cell.adjacent) return false;

  const toReveal = around.filter((n) => !cells[n].revealed && !cells[n].flagged);
  if (toReveal.length === 0) return false;
  clickCount++;

  const hitMines = toReveal.filter((n) => cells[n].mine);
  if (hitMines.length > 0) {
    lose(hitMines);
    return true;
  }
  for (const n of toReveal) floodReveal(n);
  checkWin();
  return true;
}

function checkWin() {
  if (revealedCount !== cells.length - config.mines) return;
  gameState = 'won';
  finish();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine && !cells[i].flagged) {
      cells[i].flagged = true;
      updateCell(i);
    }
  }
  setLcd(mineCounter, 0);
  setFace('cool');
  reportResult('win');
}

function lose(hitIndices) {
  gameState = 'lost';
  finish();
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const el = cellElements[i];
    if (cell.mine && !cell.flagged) {
      el.className = 'cell revealed';
      el.innerHTML = MINE_SVG;
    } else if (!cell.mine && cell.flagged) {
      el.className = 'cell revealed';
      el.innerHTML = WRONG_FLAG_SVG;
    }
  }
  for (const i of hitIndices) {
    cellElements[i].className = 'cell revealed mine-hit';
    cellElements[i].innerHTML = MINE_SVG;
  }
  setFace('dead');
  reportResult('loss');
}

function finish() {
  finalTimeMs = elapsedMs();
  clearInterval(timerInterval);
  timerInterval = null;
  clearPresses();
}

//-------STATS (3BV, as measured on minesweeper.online)-------

function compute3BV() {
  const seen = new Array(cells.length).fill(false);
  let count = 0;
  // Each connected zero-region (plus its numbered border) costs one click.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine || seen[i] || cells[i].adjacent !== 0) continue;
    count++;
    seen[i] = true;
    const stack = [i];
    while (stack.length > 0) {
      const j = stack.pop();
      for (const n of neighbors(j)) {
        if (cells[n].mine || seen[n]) continue;
        seen[n] = true;
        if (cells[n].adjacent === 0) stack.push(n);
      }
    }
  }
  // Every remaining number not touching a zero-region costs one click.
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].mine && !seen[i]) count++;
  }
  return count;
}

function reportResult(outcome) {
  const record = {
    endedAt: Date.now(),
    outcome: outcome,
    timeMs: Math.round(finalTimeMs),
    bv3: compute3BV(),
    clicks: clickCount,
    wastedClicks: wastedClicks,
    flagsPlaced: flagsPlaced,
    flagsRemoved: flagsRemoved,
    mousePathPx: Math.round(mousePathPx),
    states: activeStateNames(),
  };
  const modeRecords = appendGameRecord(record);
  saveTrace(record);
  renderResult(record, modeRecords);
}

// The result currently on screen ({record, modeRecords}), kept so a
// settings toggle can re-render it in place; null while no result shows.
let renderedResult = null;

function renderResult(record, modeRecords) {
  renderedResult = { record, modeRecords };
  const seconds = secondsOf(record);
  resultSummary.textContent = (record.outcome === 'win' ? 'Win' : 'Loss')
    + '\n' + modeLabel() + '\n' + formatDate(record.endedAt);
  resultStats.textContent = '';
  const statsGrid = document.createElement('div');
  statsGrid.id = 'stats-grid';
  // "Clicks over 3BV" only exists for wins: a lost board was never
  // finished, so the subtraction means nothing.
  for (const [label, value] of [
    ['Time', seconds.toFixed(3) + 's'],
    ['3BV', String(record.bv3)],
    ['3BV/s', bvPerSecond(record).toFixed(4)],
    ['Clicks', String(record.clicks)],
    ['Wasted clicks', String(record.wastedClicks)],
    ['Flags placed', isMarkless(record) ? '0 - markless' : String(record.flagsPlaced)],
    ['Flags removed', String(record.flagsRemoved)],
    ...(record.outcome === 'win'
      ? [['Clicks over 3BV', String(record.clicks - record.bv3)]]
      : []),
    ['Efficiency', efficiencyPercent(record) + '%'],
    ['Mouse path', record.mousePathPx + 'px'],
    ['Mouse speed', Math.round(record.mousePathPx / seconds) + 'px/s'],
    ['Path per click', Math.round(record.mousePathPx / record.clicks) + 'px'],
    ['Path per 3BV', Math.round(record.mousePathPx / record.bv3) + 'px'],
    // The states row appears only when the game carries at least one state
    // tag; a tagless game shows nothing rather than an empty row.
    ...(record.states.length > 0 ? [['States', record.states.join(', ')]] : []),
  ]) {
    const labelCell = document.createElement('span');
    labelCell.className = 'stat-label';
    labelCell.textContent = label;
    const valueCell = document.createElement('span');
    valueCell.className = 'stat-value';
    valueCell.textContent = value;
    statsGrid.append(labelCell, valueCell);
  }
  resultStats.appendChild(statsGrid);
  if (record.outcome === 'win') {
    renderRanks(record, modeRecords);
  } else {
    resultRanks.textContent = '';
  }
}

//-------PLAY HISTORY (every finished game kept per mode)-------

// The game-record schema: one record per finished game, win or loss,
// holding only the primary measurements; every other displayed stat is
// derived from them at read time, never stored. This is the single
// definition of the record shape — reportResult writes exactly these
// fields, importHistory validates candidates against `valid`, and the
// data-format card renders `example` and `describe` — so the writer, the
// validator, and the documentation cannot drift apart. wastedClicks and
// flagsPlaced joined the schema on 2026-08-19, flagsRemoved on 2026-08-20:
// all are always written now, but games recorded before they were measured
// lack them, so absence is valid ("not measured"); displays that need them
// use only records that carry them.
const isNumber = (v) => typeof v === 'number';
const GAME_RECORD_SCHEMA = [
  { field: 'endedAt', valid: isNumber, example: '1787201223496', describe: 'when the game finished (Unix epoch, ms)' },
  { field: 'outcome', valid: (v) => v === 'win' || v === 'loss', example: '"win"', describe: '"win" or "loss"' },
  { field: 'timeMs', valid: isNumber, example: '6705', describe: 'solve time in ms (shown as 6.705s)' },
  { field: 'bv3', valid: isNumber, example: '10', describe: "the board's 3BV: minimum clicks to clear it" },
  { field: 'clicks', valid: isNumber, example: '19', describe: 'clicks that changed the board (reveals, flags, chords)' },
  { field: 'wastedClicks', valid: (v) => v === undefined || isNumber(v), example: '3', describe: 'board clicks that changed nothing; absent on games recorded before 2026-08-19' },
  { field: 'flagsPlaced', valid: (v) => v === undefined || isNumber(v), example: '0', describe: 'flags the player placed (win auto-flagging not counted); 0 = a markless game; absent on games recorded before 2026-08-19' },
  { field: 'flagsRemoved', valid: (v) => v === undefined || isNumber(v), example: '1', describe: 'flags the player took back; each removal = a place+remove pair (2 clicks) that netted nothing; absent on games recorded before 2026-08-20' },
  { field: 'mousePathPx', valid: isNumber, example: '1182', describe: 'cursor travel while playing, px' },
  { field: 'states', valid: (v) => v === undefined || (Array.isArray(v) && v.every((s) => typeof s === 'string')), example: '["sleepy"]', describe: 'player-defined state tags active when the game finished (see the states panel); absent on games recorded before 2026-08-20' },
];

// Records are grouped by mode key and kept in chronological order. The RAM
// copy of the whole history (userdata 'history', filled by loadUserdata);
// scalar records are small enough that all of them stay in RAM — revisit
// only if that ever stops being true.
let history = null;

//-------PERSONAL SETTINGS (behavior switches, stored beside the history)-------

// Player-facing behavior switches ("settings", never "config" — that word
// is taken by the board parameters). Like GAME_RECORD_SCHEMA, this is the
// single definition of the settings block: settingsFrom fills absent fields
// from `default` (a stored block written before a setting existed simply
// predates it — absence means the player never changed it), importHistory
// validates an incoming block against `valid`, buildSettingsPanel renders
// the controls from `label`/`describe`, and exports carry the block under
// the reserved "settings" key — so the writer, the validator, the UI, and
// the documentation cannot drift apart.
const SETTINGS_SCHEMA = [
  {
    field: 'collapseDuplicateCharts',
    default: true,
    valid: (v) => typeof v === 'boolean',
    label: 'collapse duplicate tablecharts',
    describe: 'when several time windows hold the exact same wins (e.g. every win this week happened today), show only the most specific chart; off = every window always renders its own chart',
  },
];

// The RAM copy of the settings block (userdata 'settings').
let settings = null;

function settingsFrom(stored) {
  const filled = {};
  for (const s of SETTINGS_SCHEMA) {
    filled[s.field] = s.field in stored ? stored[s.field] : s.default;
  }
  return filled;
}

function saveSettings() {
  persistUserdata('settings', settings);
}

// A mode's identity is its parameters; named difficulty labels are
// display-only (see modeLabel).
function modeKeyOf(params) {
  return params.width + 'x' + params.height + '/' + params.mines;
}

function modeKey() {
  return modeKeyOf(config);
}

function secondsOf(record) {
  return record.timeMs / 1000;
}

function bvPerSecond(record) {
  return record.bv3 / secondsOf(record);
}

function efficiencyPercent(record) {
  return Math.round((record.bv3 / record.clicks) * 100);
}

// A markless game: the player never placed a single flag. Records from
// before flagsPlaced was measured have it undefined and never qualify —
// the status is only claimed where it is known.
function isMarkless(record) {
  return record.flagsPlaced === 0;
}

// Local midnight `daysBack` days before the given moment.
function startOfDay(ms, daysBack = 0) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
}

// Day-and-longer windows anchor at local midnights: "today" runs from the
// last midnight, "past week" from midnight 6 days back (7 calendar days),
// "this month"/"in <year>" from their calendar starts, and the rolling
// "in the last year" starts at the end of the day exactly 365 days prior.
// Sub-day windows stay purely rolling.
// [label, windowStartMs, specificity]. Lower specificity = narrower window;
// when two lists contain the exact same wins only the most specific
// survives (see renderRanks), so broad charts appear gradually as history
// spreads out. Day categories (added in rankColumns) sit at 5-7, between
// "today" and "past week".
function rankWindows(nowMs) {
  const d = new Date(nowMs);
  return [
    ['lifetime', -Infinity, 12],
    ['in ' + d.getFullYear(), new Date(d.getFullYear(), 0, 1).getTime(), 10],
    ['in the last year', startOfDay(nowMs, 364), 11],
    ['this month', new Date(d.getFullYear(), d.getMonth(), 1).getTime(), 9],
    ['past week', startOfDay(nowMs, 6), 8],
    ['today', startOfDay(nowMs), 4],
    ['past hour', nowMs - 3600e3, 3],
    ['past 15 min', nowMs - 15 * 60e3, 2],
    ['past 5 min', nowMs - 5 * 60e3, 1],
    ['past 1 min', nowMs - 60e3, 0],
  ];
}

function difficultyDisplayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function modeLabel() {
  for (const [name, d] of Object.entries(DIFFICULTIES)) {
    if (d.width === config.width && d.height === config.height && d.mines === config.mines) {
      return difficultyDisplayName(name);
    }
  }
  return 'Custom ' + config.width + 'x' + config.height + '-' + config.mines;
}

function formatDate(timestampMs) {
  const d = new Date(timestampMs);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Relative age in the largest sensible unit, split into count and unit so the
// counts can be right-aligned as their own column.
function relativeAge(nowMs, thenMs) {
  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (seconds < 60) return { count: seconds, unit: 's' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { count: minutes, unit: 'm' };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { count: hours, unit: 'h' };
  const days = Math.floor(hours / 24);
  if (days < 7) return { count: days, unit: 'd' };
  if (days < 30) return { count: Math.floor(days / 7), unit: 'w' };
  if (days < 365) return { count: Math.floor(days / 30), unit: 'mo' };
  return { count: Math.floor(days / 365), unit: 'y' };
}

// Each age unit's span in ms, matching relativeAge's boundaries. Used to
// place an age within its unit: frac runs 0 (just entered the unit) to 1
// (about to roll into the next), so scatter dots can fade with age inside
// a single color. Years cap at 10, beyond which everything is equally old.
const AGE_UNIT_SPANS = [
  ['s', 0, 60e3],
  ['m', 60e3, 3600e3],
  ['h', 3600e3, 864e5],
  ['d', 864e5, 7 * 864e5],
  ['w', 7 * 864e5, 30 * 864e5],
  ['mo', 30 * 864e5, 365 * 864e5],
  ['y', 365 * 864e5, 10 * 365 * 864e5],
];

function ageInfo(nowMs, thenMs) {
  const age = Math.max(0, nowMs - thenMs);
  for (const [unit, lo, hi] of AGE_UNIT_SPANS) {
    if (age < hi || unit === 'y') {
      return { unit, frac: Math.min(1, (age - lo) / (hi - lo)) };
    }
  }
}

//-------DAY CATEGORIES (weekday / weekend / US holidays)-------

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

// US federal holidays (fixed dates plus the weekday-rule ones).
function isHoliday(date) {
  const m = date.getMonth();
  const day = date.getDate();
  const weekday = date.getDay();
  const nth = Math.ceil(day / 7);
  if (m === 0 && day === 1) return true;                       // New Year's Day
  if (m === 0 && weekday === 1 && nth === 3) return true;      // MLK Day
  if (m === 1 && weekday === 1 && nth === 3) return true;      // Presidents Day
  if (m === 4 && weekday === 1 && day >= 25) return true;      // Memorial Day
  if (m === 5 && day === 19) return true;                      // Juneteenth
  if (m === 6 && day === 4) return true;                       // Independence Day
  if (m === 8 && weekday === 1 && day <= 7) return true;       // Labor Day
  if (m === 10 && weekday === 4 && nth === 4) return true;     // Thanksgiving
  if (m === 11 && day === 25) return true;                     // Christmas
  return false;
}

// Columns for the current win: the rolling windows, plus lifetime-spanning
// categories the win itself belongs to (same weekday, weekend/weekday,
// holiday when today is one).
function rankColumns(record) {
  const columns = rankWindows(record.endedAt).map(([label, startMs, specificity]) => ({
    label: label,
    filter: (s) => s.endedAt >= startMs,
    specificity: specificity,
  }));
  const winDate = new Date(record.endedAt);
  const weekday = winDate.getDay();
  columns.push({
    label: 'on ' + WEEKDAY_NAMES[weekday] + 's',
    filter: (s) => new Date(s.endedAt).getDay() === weekday,
    specificity: 5,
  });
  const weekend = isWeekend(winDate);
  columns.push({
    label: weekend ? 'on weekends' : 'on weekdays',
    filter: (s) => isWeekend(new Date(s.endedAt)) === weekend,
    specificity: 6,
  });
  if (isHoliday(winDate)) {
    columns.push({
      label: 'on holidays',
      filter: (s) => isHoliday(new Date(s.endedAt)),
      specificity: 7,
    });
  }
  return columns;
}

// Appends the finished game to its mode's history and returns that mode's
// full record list (the appended object included, so identity search works).
function appendGameRecord(record) {
  const key = modeKey();
  if (!(key in history)) history[key] = [];
  history[key].push(record);
  persistUserdata('history', history);
  return history[key];
}

// Visible slice of a ranked list, always the full 11 rows when the list has
// them (a constant row count keeps a chart's height stable across re-sorts,
// so reordering never reflows its neighbors). When my row sits within the
// top 11, the whole budget anchors at #1: the top 11 renders with my row in
// its true place. Otherwise the window centers on me — 5 above, 5 below —
// sliding upward when I'm near the bottom so the budget still fills.
function windowBounds(myIndex, length) {
  if (myIndex <= 10) return [0, Math.min(length, 11)];
  const end = Math.min(length, myIndex + 6);
  return [Math.max(0, end - 11), end];
}

// Rankaverage charts: wins grouped by a stat's value, ranked by the group's
// average solve time. Each row shows rank, value, average, and win count; a
// final row aligned under the average-time column notes how this win moved
// its own group's average. 3BV/s buckets
// at 2 decimals, mouse path at 100px, mouse speed at 10px/s; the rest group
// on exact integers.
const RANKAVERAGE_SPECS = [
  { label: 'efficiency', value: efficiencyPercent, format: (v) => v + '%' },
  { label: 'clicks', value: (s) => s.clicks, format: (v) => String(v) },
  { label: '3BV', value: (s) => s.bv3, format: (v) => String(v) },
  { label: '3BV/s', value: (s) => Number(bvPerSecond(s).toFixed(2)), format: (v) => v.toFixed(2) },
  { label: 'mouse path', value: (s) => Math.round(s.mousePathPx / 100) * 100, format: (v) => v + 'px' },
  { label: 'mouse speed', value: (s) => Math.round(s.mousePathPx / secondsOf(s) / 10) * 10, format: (v) => v + 'px/s' },
];

// Every list renders its full 11-row window around the player's row (see
// windowBounds); a mediocre placement still shows its 5 neighbors above and
// below, at full opacity, since the placement itself is fresh information.
// The list ends with an "of N" footer completing the highlighted "#x": the
// rank fraction lives in the chart, not the heading. headingText may be
// null for charts whose column headers do the naming. sortHeader, when
// given, renders a row of subtle clickable column headers above the data
// ({cls, text, active, onClick} each).
function buildRankList(headingText, rowCount, myIndex, gridClass, buildRowCells, sortHeader) {
  const list = document.createElement('div');
  list.className = 'rank-list';
  if (headingText !== null) {
    const heading = document.createElement('h4');
    heading.textContent = headingText;
    list.appendChild(heading);
  }
  const grid = document.createElement('div');
  grid.className = gridClass;
  if (sortHeader) {
    const row = document.createElement('div');
    row.className = 'rank-row sort-row';
    for (const { cls, text, active, onClick } of sortHeader) {
      const cell = document.createElement('span');
      cell.className = cls + ' sort-cell' + (active ? ' active' : '');
      cell.textContent = text;
      const plain = text.replace(/[\u25be\u25b4]/g, '').trim();
      cell.title = 'sort by ' + (plain === '#' ? 'rank' : plain);
      cell.addEventListener('click', onClick);
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  const [start, end] = windowBounds(myIndex, rowCount);
  for (let i = start; i < end; i++) {
    const row = document.createElement('div');
    row.className = i === myIndex ? 'rank-row me' : 'rank-row';
    for (const [cls, text] of buildRowCells(i)) {
      const cell = document.createElement('span');
      cell.className = cls;
      cell.textContent = text;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  list.appendChild(grid);
  // The "of N" only appears when rows are actually cut off below: if the
  // last row is visible, the list's end is already in view and the count
  // says nothing new. The footer line itself always renders (blank via
  // nbsp) so toggling between sort orders that do and don't reach the last
  // row cannot change the chart's height.
  const total = document.createElement('div');
  total.className = 'rank-total';
  total.textContent = end < rowCount ? 'of ' + rowCount : '\u00a0';
  list.appendChild(total);
  return list;
}

// Tick positions for a scatter axis: a 1/2/5*10^k step sized to give at
// most `count` ticks across the range.
function niceTicks(min, max, count) {
  const span = max - min;
  if (span <= 0) return [min];
  const mag = Math.pow(10, Math.floor(Math.log10(span / count)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step) ticks.push(v);
  return ticks;
}

// Ticks for a date x-axis (epoch ms): a calendar step from minutes up to
// days, aligned to local wall-clock multiples, labeled HH:mm below a day
// and M/D from a day up. At most 5 ticks: HH:mm labels are the widest kind
// at the title-sized tick font, so more would collide.
function timeTicks(min, max) {
  const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
  const steps = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR,
    12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];
  const span = Math.max(max - min, 1);
  const step = steps.find((s) => span / s <= 5) || 365 * DAY;
  const offMs = new Date(min).getTimezoneOffset() * 60e3;
  const ticks = [];
  for (let t = Math.ceil((min - offMs) / step) * step + offMs; t <= max; t += step) ticks.push(t);
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (t) => {
    const d = new Date(t);
    return step < DAY
      ? pad2(d.getHours()) + ':' + pad2(d.getMinutes())
      : (d.getMonth() + 1) + '/' + d.getDate();
  };
  return { ticks, fmt };
}

// Small inline-SVG scatter plot: every win is a dot colored by its age unit
// (the same palette as rank-list ages, so time trends are scannable) and
// faded within that color by how deep into the unit it sits (a 6-day-old
// dot is paler than a 1-day-old one); this game is the black-ringed dot
// labeled with its today-rank. Shows relationships (e.g. does moving the
// mouse faster actually win games faster?) rather than rankings. There is
// no chart title: the terse axis labels, rendered at title size along
// with the tick values, name the chart. opts.timeAxis renders x as a local
// date/time axis; opts.idealLine draws the y = x diagonal (used where y has
// a hard floor at x, e.g. clicks can never beat 3BV). ageInfoOf maps a win
// to its {unit, frac} age (see ageInfo).
function buildScatter(wins, me, fx, fy, xLabel, yLabel, meLabel, ageInfoOf, opts = {}) {
  const W = 270, H = 210, L = 54, R = 10, T = 10, B = 36;
  const xs = wins.map(fx), ys = wins.map(fy);
  const pad = (min, max) => {
    const p = (max - min) * 0.04;
    return [min - p, max + p];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const px = (v) => x1 === x0 ? (L + W - R) / 2 : L + (v - x0) / (x1 - x0) * (W - L - R);
  const py = (v) => y1 === y0 ? (T + H - B) / 2 : H - B - (v - y0) / (y1 - y0) * (H - T - B);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'scatter-svg');
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });
  const tickFmt = (ticks) => {
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
    const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return (v) => v.toFixed(dec);
  };
  // x caps at 6 ticks (the labels are title-sized, so a 7-tick x-axis can
  // collide with itself); y stacks vertically and takes the full 7.
  let xTicks, fmtX;
  if (opts.timeAxis) {
    ({ ticks: xTicks, fmt: fmtX } = timeTicks(x0, x1));
  } else {
    xTicks = niceTicks(x0, x1, 6);
    fmtX = tickFmt(xTicks);
  }
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: px(v), y: H - B + 14, class: 'scatter-tick tick-x' }, fmtX(v));
  }
  const yTicks = niceTicks(y0, y1, 7), fmtY = tickFmt(yTicks);
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' }, fmtY(v));
  }
  if (opts.idealLine) {
    const t0 = Math.max(x0, y0);
    const t1 = Math.min(x1, y1);
    if (t0 < t1) {
      el('line', {
        x1: px(t0).toFixed(1), y1: py(t0).toFixed(1),
        x2: px(t1).toFixed(1), y2: py(t1).toFixed(1),
        class: 'scatter-ideal',
      });
    }
  }
  const dot = (s, cls, r, opacity) => el('circle', {
    cx: px(fx(s)).toFixed(1), cy: py(fy(s)).toFixed(1), r, class: cls,
    'fill-opacity': opacity,
  });
  // The deeper into its age unit a win sits, the more washed-out its dot:
  // full color on entering the unit, fading to 30% at the far edge.
  for (const s of wins) {
    if (s === me) continue;
    const age = ageInfoOf(s);
    dot(s, 'scatter-dot age-dot-' + age.unit, '2.2', (1 - 0.7 * age.frac).toFixed(2));
  }
  dot(me, 'scatter-me age-dot-' + ageInfoOf(me).unit, '3.5', '1');
  // Today-rank tag beside the me-dot; flips to the left near the right edge.
  const meX = px(fx(me));
  const flipLeft = meX > W - R - 50;
  el('text', {
    x: (flipLeft ? meX - 6 : meX + 6).toFixed(1),
    y: Math.max(T + 9, py(fy(me)) - 5).toFixed(1),
    class: 'scatter-me-label' + (flipLeft ? ' flip-left' : ''),
  }, meLabel);
  el('text', { x: L + (W - L - R) / 2, y: H - 4, class: 'scatter-axis-label' }, '\u2192 ' + xLabel);
  el('text', {
    transform: 'translate(12 ' + (T + (H - T - B) / 2) + ') rotate(-90)',
    class: 'scatter-axis-label',
  }, '\u2192 ' + yLabel);

  const list = document.createElement('div');
  list.className = 'rank-list scatter';
  list.append(svg);
  return list;
}

// How this win moved the average time of its own bucket (the average over
// all wins sharing this bucketed value), before vs after this game. Returns
// class + text for a cell rendered in the average-time column.
function avgDelta(spec, record, wins) {
  const bucket = spec.value(record);
  const inBucket = wins.filter((s) => spec.value(s) === bucket);
  const avg = (list) => list.reduce((sum, s) => sum + s.timeMs, 0) / list.length;
  const fmt = (ms) => (ms / 1000).toFixed(3) + 's';
  const before = inBucket.filter((s) => s !== record);
  if (before.length === 0) return { className: 'delta-new', text: 'new' };
  const prevAvg = avg(before);
  const newAvg = avg(inBucket);
  // Classify at display precision: a shift that rounds to 0.000s is
  // unchanged. The sign is the real direction of the average time ("-" =
  // it fell, "+" = it rose); the color says whether that's good (green)
  // or bad (red).
  const shift = fmt(Math.abs(newAvg - prevAvg));
  if (shift === '0.000s') return { className: 'delta-same', text: '=' };
  if (newAvg < prevAvg) return { className: 'delta-improved', text: '-' + shift };
  return { className: 'delta-worsened', text: '+' + shift };
}

// The player's chosen row order for each rankaverage chart, keyed by the
// stat label and persisted so a preference survives reloads. An entry is
// {key, dir}; a missing entry means the natural rank order. The RAM copy
// (userdata 'rankavgSort').
let rankavgSorts = null;

function saveRankavgSort(label, sort) {
  if (sort === null) delete rankavgSorts[label];
  else rankavgSorts[label] = sort;
  persistUserdata('rankavgSort', rankavgSorts);
}

// One rankaverage tablechart. It carries no title — the value column's
// header names the stat. Clicking a column header cycles its sort:
// ascending, then descending, then back to the natural rank order (by the
// bucket's average time). Sorting only reorders rows — each
// row keeps its true by-average rank number — and the 11-row window stays
// centered on this game's bucket. Every comparator ends in a deterministic
// tie-break, so a given history renders the same way every time.
function buildRankavgList(spec, record, wins) {
  const groups = new Map(); // bucketed value -> { count, totalMs }
  for (const s of wins) {
    const v = spec.value(s);
    const g = groups.get(v) || { count: 0, totalMs: 0 };
    g.count += 1;
    g.totalMs += s.timeMs;
    groups.set(v, g);
  }
  const avgMs = (v) => groups.get(v).totalMs / groups.get(v).count;
  const ascComparators = {
    rank: (a, b) => avgMs(a) - avgMs(b) || a - b,
    value: (a, b) => a - b,
    time: (a, b) => avgMs(a) - avgMs(b) || a - b,
    count: (a, b) => groups.get(a).count - groups.get(b).count || avgMs(a) - avgMs(b) || a - b,
  };
  const byAvg = [...groups.keys()].sort(ascComparators.rank);
  const rankOf = (v) => byAvg.indexOf(v) + 1;
  // Only a well-formed {key, dir} counts; anything else (including entries
  // from older versions of this code) falls back to the natural order.
  const saved = rankavgSorts[spec.label];
  const sort = saved && typeof saved === 'object' && saved.key in ascComparators
    && (saved.dir === 'asc' || saved.dir === 'desc') ? saved : null;
  const order = [...byAvg];
  if (sort !== null) {
    order.sort(ascComparators[sort.key]);
    if (sort.dir === 'desc') order.reverse();
  }
  const myIndex = order.indexOf(spec.value(record));
  let list;
  const arrow = { desc: ' \u25be', asc: ' \u25b4' };
  const sortHeader = [
    ['rank-cell', '#', 'rank'],
    ['val-cell', spec.label, 'value'],
    ['avg-cell', 'avg', 'time'],
    ['cnt-cell', 'count', 'count'],
  ].map(([cls, text, key]) => {
    const active = sort !== null && sort.key === key;
    return {
      cls,
      text: text + (active ? arrow[sort.dir] : ''),
      active,
      onClick: () => {
        const next = !active ? { key, dir: 'asc' }
          : sort.dir === 'asc' ? { key, dir: 'desc' }
          : null;
        saveRankavgSort(spec.label, next);
        const fresh = buildRankavgList(spec, record, wins);
        // Freeze the box at its pre-click width (the row count, and so the
        // height, is already constant — see windowBounds) so re-sorting
        // never reflows the whole row of tablecharts around this one.
        fresh.style.width = list.getBoundingClientRect().width + 'px';
        list.replaceWith(fresh);
      },
    };
  });
  list = buildRankList(
    null,
    order.length, myIndex, 'rankavg-grid',
    (i) => [
      ['rank-cell', '#' + rankOf(order[i])],
      ['val-cell', spec.format(order[i])],
      ['avg-cell', (avgMs(order[i]) / 1000).toFixed(3) + 's'],
      ['cnt-cell', groups.get(order[i]).count + '\u00d7'],
    ],
    sortHeader);
  // The delta is a time, so it rides the grid as one more row with its
  // text in the average-time column, aligning under the times above it.
  const delta = avgDelta(spec, record, wins);
  const deltaRow = document.createElement('div');
  deltaRow.className = 'rank-row';
  for (const [cls, text] of [
    ['rank-cell', ''],
    ['val-cell', ''],
    ['avg-cell rank-delta ' + delta.className, delta.text],
    ['cnt-cell', ''],
  ]) {
    const cell = document.createElement('span');
    cell.className = cls;
    cell.textContent = text;
    deltaRow.appendChild(cell);
  }
  list.querySelector('.rankavg-grid').appendChild(deltaRow);
  return list;
}

function renderRanks(record, modeRecords) {
  resultRanks.textContent = '';
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  // Ranking order everywhere: fastest first, ties broken by earlier finish.
  const byTimeThenEnd = (a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt;
  // Row builder shared by every time-ranked list: rank, solve time, and the
  // win's age split into count and unit cells (or a single "this" marking
  // the game that just finished).
  const timeAgeRow = (list) => (i) => {
    const age = relativeAge(record.endedAt, list[i].endedAt);
    const cells = [
      ['rank-cell', '#' + (i + 1)],
      ['time-cell', (list[i].timeMs / 1000).toFixed(3) + 's'],
    ];
    if (age.count === 0 && age.unit === 's') {
      cells.push(['age-just-cell age-u-s', 'this']);
    } else {
      cells.push(['age-num-cell age-u-' + age.unit, String(age.count)]);
      cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
    }
    return cells;
  };
  // Progressive disclosure (the collapseDuplicateCharts setting, on by
  // default): two lists holding the exact same wins would render
  // identically, so only the most specific one of each such group is shown,
  // and broader charts appear on their own once history spreads across
  // enough hours/days/weekdays to make them differ. Switched off, every
  // window renders its own chart regardless of duplication.
  const candidates = rankColumns(record).map((column) => ({
    column,
    inWindow: wins.filter(column.filter).sort(byTimeThenEnd),
  }));
  const kept = new Set(candidates);
  if (settings.collapseDuplicateCharts) {
    const seenSets = new Set();
    kept.clear();
    for (const c of [...candidates].sort((a, b) => a.column.specificity - b.column.specificity)) {
      const signature = c.inWindow.map((s) => s.endedAt).join('|');
      if (seenSets.has(signature)) continue;
      seenSets.add(signature);
      kept.add(c);
    }
  }
  for (const c of candidates) {
    if (!kept.has(c)) continue;
    const { column, inWindow } = c;
    // `record` is an element of modeRecords, so identity search finds it.
    const myIndex = inWindow.indexOf(record);
    resultRanks.appendChild(buildRankList(
      column.label,
      inWindow.length, myIndex, 'rank-grid',
      timeAgeRow(inWindow)));
  }

  // Best times on boards of this exact 3BV: the fairest time comparison,
  // since only equally-hard layouts compete.
  const sameBv = wins.filter((s) => s.bv3 === record.bv3).sort(byTimeThenEnd);
  resultRanks.appendChild(buildRankList(
    'best times for this 3BV (' + record.bv3 + ')',
    sameBv.length, sameBv.indexOf(record), 'rank-grid',
    timeAgeRow(sameBv)));

  for (const spec of RANKAVERAGE_SPECS) {
    resultRanks.appendChild(buildRankavgList(spec, record, wins));
  }

  // Streak lists: wins in chronological runs split by losses. A k-loss
  // streak joins k+1 adjacent runs; the streak ending in this win is "me".
  // modeRecords is chronological (appended in play order; import re-sorts).
  const runs = [[]];
  for (const r of modeRecords) {
    if (r.outcome === 'win') runs[runs.length - 1].push(r.endedAt);
    else runs.push([]);
  }
  for (const [label, slack] of [['streak', 0], ['near-streak', 1], ['near-near-streak', 2]]) {
    const span = Math.min(slack + 1, runs.length);
    // Each window of `span` adjacent runs is trimmed to its nonempty core
    // (consecutive losses leave empty runs that pad windows). Identical
    // cores are deduped and cores strictly inside a wider core are dropped,
    // so a sub-streak never appears alongside the wider streak containing
    // it. Windows that merely overlap (sharing a middle run across two
    // different losses) are distinct streaks and both stay.
    const cores = new Map(); // 'a-b' -> {a, b} inclusive run-index range
    for (let i = 0; i + span <= runs.length; i++) {
      let a = -1, b = -1;
      for (let j = i; j < i + span; j++) {
        if (runs[j].length === 0) continue;
        if (a === -1) a = j;
        b = j;
      }
      if (a === -1) continue;
      cores.set(a + '-' + b, { a, b });
    }
    const allCores = [...cores.values()];
    const segments = allCores
      .filter((c) => !allCores.some((o) => o.a <= c.a && c.b <= o.b && (o.a < c.a || o.b > c.b)))
      .map(({ a, b }) => {
        const winsAt = runs.slice(a, b + 1).flat();
        return { len: winsAt.length, end: winsAt[winsAt.length - 1], current: b === runs.length - 1 };
      });
    segments.sort((a, b) => b.len - a.len || b.end - a.end);
    const myIndex = segments.findIndex((seg) => seg.current);
    resultRanks.appendChild(buildRankList(
      label,
      segments.length, myIndex, 'rank-grid',
      (i) => {
        const seg = segments[i];
        const age = relativeAge(record.endedAt, seg.end);
        const cells = [
          ['rank-cell', '#' + (i + 1)],
          ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')],
        ];
        if (age.count === 0 && age.unit === 's') {
          cells.push(['age-just-cell age-u-s', 'this']);
        } else {
          cells.push(['age-num-cell age-u-' + age.unit, String(age.count)]);
          cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
        }
        return cells;
      }));
  }

  // Scatter plots at the very bottom: primary measurements first (3BV and
  // mouse path against win time), then derived mouse metrics. Needs at
  // least 2 wins to have a spread.
  if (wins.length >= 2) {
    const brk = document.createElement('div');
    brk.className = 'flex-break';
    resultRanks.appendChild(brk);
    const todayStart = startOfDay(record.endedAt);
    const todayRank = wins
      .filter((s) => s.endedAt >= todayStart)
      .sort(byTimeThenEnd)
      .indexOf(record) + 1;
    const meLabel = '#' + todayRank + ' today';
    const ageInfoOf = (s) => ageInfo(record.endedAt, s.endedAt);
    const hourOfDay = (s) => {
      const d = new Date(s.endedAt);
      return d.getHours() + d.getMinutes() / 60;
    };
    // Axis labels stay terse — one or two words, no units or asides; the
    // tick values carry the scale. "date" spreads wins across the calendar;
    // "time of day" folds every win onto one 24-hour clock, exposing the
    // daily rhythm instead of the long-term trend.
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.endedAt, secondsOf,
      'date', 'time', meLabel, ageInfoOf, { timeAxis: true }));
    resultRanks.appendChild(buildScatter(
      wins, record, hourOfDay, secondsOf,
      'time of day', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.bv3, secondsOf,
      '3BV', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.bv3, (s) => s.clicks,
      '3BV', 'clicks', meLabel, ageInfoOf,
      { idealLine: true }));
    // Only wins that carry the wastedClicks measurement (recorded since
    // 2026-08-19) can appear on its chart.
    const withWasted = wins.filter((s) => 'wastedClicks' in s);
    if (withWasted.length >= 2) {
      resultRanks.appendChild(buildScatter(
        withWasted, record, (s) => s.wastedClicks, bvPerSecond,
        'wasted clicks', '3BV/s', meLabel, ageInfoOf));
    }
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx, secondsOf,
      'mouse path', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / secondsOf(s), secondsOf,
      'mouse speed', 'time', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / secondsOf(s), efficiencyPercent,
      'mouse speed', 'efficiency', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / s.clicks, efficiencyPercent,
      'path per click', 'efficiency', meLabel, ageInfoOf));
    resultRanks.appendChild(buildScatter(
      wins, record, (s) => s.mousePathPx / s.bv3, secondsOf,
      'path per 3BV', 'time', meLabel, ageInfoOf));
    const legend = document.createElement('div');
    legend.className = 'scatter-legend';
    legend.appendChild(document.createTextNode('dot color = how long ago that win was (dots fade as they age within a color):'));
    for (const [unit, name] of [['s', 'seconds'], ['m', 'minutes'], ['h', 'hours'],
      ['d', 'days'], ['w', 'weeks'], ['mo', 'months'], ['y', 'years']]) {
      const item = document.createElement('span');
      item.className = 'legend-item age-u-' + unit;
      item.textContent = name;
      legend.appendChild(item);
    }
    resultRanks.appendChild(legend);
  }
}

//-------PERSISTENT STORAGE (one IndexedDB database: userdata + traces)-------

// All storage moved from localStorage into IndexedDB on 2026-08-20. One
// database holds two stores: 'userdata' (play history, settings, rankavg
// sorts, player states — one entry per kind) and 'traces' (see the trace
// section below). Userdata is RAM-first: loadUserdata reads every kind
// into its RAM object once at startup, all reads and mutations work on RAM
// synchronously, and each mutation calls persistUserdata — an async
// fire-and-forget write of that kind's whole RAM object. IndexedDB
// structured-clones the value at put() time, so RAM mutations after the
// call cannot race the write. Traces are far too large for RAM and are
// written straight to their store, one entry per game.

const DB_NAME = 'minesweeper-friendly';
const TRACE_STORE = 'traces';
const USERDATA_STORE = 'userdata';
const USERDATA_KINDS = ['history', 'settings', 'rankavgSort', 'states'];

let db = null;

// A failure to open the database or to persist data is a bug to fix, not a
// mode to tolerate: announce where the player can see it, and throw.
function storageFailure(what) {
  backupStatus.textContent = what;
  throw new Error(what);
}

// Where each userdata kind lived before 2026-08-20. The version-2 upgrade
// below carries the data over exactly once (the upgrade only ever runs
// once per origin); deletable once every player's origin has upgraded.
const LEGACY_LOCALSTORAGE_KEYS = {
  history: 'minesweeper-friendly.history',
  settings: 'minesweeper-friendly.settings',
  rankavgSort: 'minesweeper-friendly.rankavgSort',
  states: 'minesweeper-friendly.states',
};

const dbRequest = indexedDB.open(DB_NAME, 2);
dbRequest.onupgradeneeded = (event) => {
  const upgraded = event.target.result;
  if (event.oldVersion < 1) upgraded.createObjectStore(TRACE_STORE, { keyPath: 'endedAt' });
  if (event.oldVersion < 2) {
    const store = upgraded.createObjectStore(USERDATA_STORE);
    const moved = [];
    for (const [kind, storageKey] of Object.entries(LEGACY_LOCALSTORAGE_KEYS)) {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) continue;
      store.put(JSON.parse(raw), kind);
      moved.push(storageKey);
    }
    // The old keys disappear only after the carried-over data is committed.
    event.target.transaction.addEventListener('complete', () => {
      for (const storageKey of moved) localStorage.removeItem(storageKey);
    });
  }
};
dbRequest.onsuccess = (event) => {
  db = event.target.result;
  loadUserdata();
};
dbRequest.onerror = () => storageFailure('database failed to open: ' + dbRequest.error);

// Reads every userdata kind into its RAM object, then finishes startup:
// init() builds the settings panel, the states panel, and the first board,
// all of which read RAM.
function loadUserdata() {
  const tx = db.transaction(USERDATA_STORE);
  tx.onerror = () => storageFailure('userdata load failed: ' + tx.error);
  const store = tx.objectStore(USERDATA_STORE);
  const got = {};
  for (const kind of USERDATA_KINDS) {
    const request = store.get(kind);
    request.onsuccess = () => { got[kind] = request.result; };
  }
  tx.oncomplete = () => {
    // An absent kind is a player who never stored it, not an error.
    history = got.history === undefined ? {} : got.history;
    settings = settingsFrom(got.settings === undefined ? {} : got.settings);
    rankavgSorts = got.rankavgSort === undefined ? {} : got.rankavgSort;
    playerStates = got.states === undefined
      ? DEFAULT_STATE_NAMES.map((name) => ({ name, active: false }))
      : got.states;
    init();
  };
}

// Persists one userdata kind's RAM object. Fire-and-forget: RAM is already
// current, so nothing waits on the disk write.
function persistUserdata(kind, value) {
  if (db === null) storageFailure(kind + ' not saved: database is not open');
  const tx = db.transaction(USERDATA_STORE, 'readwrite');
  tx.objectStore(USERDATA_STORE).put(value, kind);
  tx.onerror = () => storageFailure(kind + ' save failed: ' + tx.error);
}

//-------RAW INPUT TRACE (full per-game cursor and click stream)-------

// Decided 2026-08-20 (PRODUCT.md "Raw input traces"): every finished game
// keeps its complete input stream — cursor samples, button events, board
// geometry — as the ground truth behind all motion metrics. Scalar record
// fields summarize; the trace is what lets any future metric be computed
// over past games too. Traces live in their own store, keyed by endedAt
// exactly like the history records, and are never held in RAM.
//
// A trace runs from board creation (newGame) to finish. Pre-first-click
// movement is warmup and is real data, so sampling covers 'ready' as well
// as 'playing'; post-game movement belongs to no game and is not captured.
// Timestamps are ms relative to the trace's start (startedAt holds the
// absolute epoch ms). layout events snapshot the board's bounding rect,
// re-recorded on scroll, resize, and zoom, so every (x,y) sample stays
// mappable to a board cell forever.

let trace = null;

function beginTrace() {
  trace = {
    startedAt: Date.now(),
    t0: performance.now(),
    t: [], x: [], y: [],   // cursor samples, one entry per mousemove
    events: [],            // button + layout events, see traceEvent/recordLayout
  };
  recordLayout();
}

function tracing() {
  return gameState === 'ready' || gameState === 'playing';
}

// Board geometry snapshot: with the rect and the board's cell dimensions,
// any sample (x,y) maps to a cell index offline.
function recordLayout() {
  const rect = boardElement.getBoundingClientRect();
  trace.events.push({
    t: performance.now() - trace.t0,
    kind: 'layout',
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    boardWidth: config.width, boardHeight: config.height,
  });
}

// kind: 'ldown' | 'lup' | 'rdown'. index is the board cell the event hit,
// or null (an 'lup' released off the cells while the button was down).
function traceEvent(kind, event, index) {
  trace.events.push({
    t: performance.now() - trace.t0,
    kind: kind,
    x: event.clientX,
    y: event.clientY,
    index: index,
  });
}

// Stored trace: identity fields matching the game record, plus the sample
// arrays as typed arrays (compact; IndexedDB stores them natively).
function saveTrace(record) {
  if (db === null) storageFailure('trace not saved: database is not open');
  const stored = {
    endedAt: record.endedAt,
    mode: modeKey(),
    outcome: record.outcome,
    startedAt: trace.startedAt,
    sampleT: Float64Array.from(trace.t),
    sampleX: Float32Array.from(trace.x),
    sampleY: Float32Array.from(trace.y),
    events: trace.events,
  };
  const tx = db.transaction(TRACE_STORE, 'readwrite');
  tx.objectStore(TRACE_STORE).put(stored);
  tx.onerror = () => storageFailure('trace save failed: ' + tx.error);
}

//-------PLAYER STATES (session tags stamped onto finished games)-------

// The player keeps a personal list of state tags ("sleepy", "new mouse", ...)
// and toggles which ones currently apply; every finished game records the
// active set (see reportResult), so life circumstances can be correlated
// with results later. Editing the list only shapes future games — past
// records keep whatever states they were stamped with.
const DEFAULT_STATE_NAMES = ['sleepy', 'just woke up', 'inebriated'];

// The RAM copy (userdata 'states'): [{name, active}] in display order. A
// new player gets the default options to choose from, none active (see
// loadUserdata); the list is only persisted once the player changes
// something.
let playerStates = null;

function savePlayerStates() {
  persistUserdata('states', playerStates);
}

function activeStateNames() {
  return playerStates.filter((s) => s.active).map((s) => s.name);
}

const statesChips = document.getElementById('states-chips');
const statesAddBtn = document.getElementById('states-add-btn');
const statesMenu = document.getElementById('states-menu');
const statesOptions = document.getElementById('states-options');
const statesAddForm = document.getElementById('states-add-form');
const statesAddInput = document.getElementById('states-add-input');
const statesStatus = document.getElementById('states-status');

// Only ACTIVE states are visible: each is a chip, and clicking it takes the
// state off. Everything inactive lives out of sight behind the "+ state"
// button, whose menu lists the inactive options (click one to put it on,
// its x to delete it from the list) plus the new-state field. An untagged
// session shows nothing but the one small button.
function renderStates() {
  statesChips.textContent = '';
  for (const state of playerStates) {
    if (!state.active) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'state-chip';
    chip.title = 'click to take this state off (future games only)';
    chip.textContent = state.name + ' \u00d7';
    chip.addEventListener('click', () => {
      state.active = false;
      savePlayerStates();
      renderStates();
    });
    statesChips.appendChild(chip);
  }
  statesOptions.textContent = '';
  for (const state of playerStates) {
    if (state.active) continue;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'state-option';
    option.textContent = state.name;
    option.addEventListener('click', () => {
      state.active = true;
      statesMenu.hidden = true;
      savePlayerStates();
      renderStates();
    });
    const remove = document.createElement('span');
    remove.className = 'state-remove';
    remove.textContent = '\u00d7';
    remove.title = 'delete from the list (past games keep their recorded states)';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      playerStates = playerStates.filter((s) => s !== state);
      savePlayerStates();
      renderStates();
    });
    option.appendChild(remove);
    statesOptions.appendChild(option);
  }
}

statesAddBtn.addEventListener('click', () => {
  statesMenu.hidden = !statesMenu.hidden;
  statesStatus.textContent = '';
});

// A state created here goes on immediately (typing it mid-session means
// "I am in this state now"); one chip-click takes it off.
statesAddForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = statesAddInput.value.trim();
  if (name === '') {
    statesStatus.textContent = 'state name is empty';
    return;
  }
  if (playerStates.some((s) => s.name === name)) {
    statesStatus.textContent = '"' + name + '" already exists';
    return;
  }
  playerStates.push({ name, active: true });
  savePlayerStates();
  statesAddInput.value = '';
  statesMenu.hidden = true;
  renderStates();
});

//-------PRESS PREVIEW (held left button)-------

function clearPresses() {
  for (const i of pressedIndices) updateCell(i);
  pressedIndices = [];
}

function pressAt(index) {
  clearPresses();
  if (gameState === 'won' || gameState === 'lost') return;
  const cell = cells[index];
  let targets = [];
  if (!cell.revealed && !cell.flagged) {
    targets = [index];
  } else if (cell.revealed && cell.adjacent > 0) {
    targets = neighbors(index).filter((n) => !cells[n].revealed && !cells[n].flagged);
  }
  for (const i of targets) {
    cellElements[i].className = 'cell pressed';
    pressedIndices.push(i);
  }
}

//-------EVENTS-------

function cellIndexFromEvent(event) {
  const el = event.target.closest('.cell');
  return el === null ? null : Number(el.dataset.index);
}

boardElement.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('ldown', event, index);
  leftDown = true;
  setFace('ooh');
  pressAt(index);
});

boardElement.addEventListener('mouseover', (event) => {
  if (!leftDown) return;
  const index = cellIndexFromEvent(event);
  if (index !== null) pressAt(index);
});

boardElement.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !leftDown) return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  if (gameState === 'won' || gameState === 'lost') return;
  // Logged before acting so a game-ending click is inside its own trace.
  traceEvent('lup', event, index);
  const cell = cells[index];
  if (!cell.revealed && !cell.flagged) {
    clickCount++;
    revealCell(index);
  } else if (cell.revealed) {
    if (!chord(index)) wastedClicks++;
  } else {
    // Left-clicking a flagged cell does nothing.
    wastedClicks++;
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;
  // Releases on a cell were already logged by the board handler above
  // (it runs first on the bubble path); this catches the rest — a press
  // dragged off the cells and released, still a real input event.
  if (leftDown && tracing() && cellIndexFromEvent(event) === null) {
    traceEvent('lup', event, null);
  }
  leftDown = false;
  clearPresses();
  if (gameState === 'ready' || gameState === 'playing') setFace('smile');
});

document.addEventListener('mousemove', (event) => {
  if (lastMouseX !== null && gameState === 'playing') {
    mousePathPx += Math.hypot(event.clientX - lastMouseX, event.clientY - lastMouseY);
  }
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (tracing()) {
    trace.t.push(performance.now() - trace.t0);
    trace.x.push(event.clientX);
    trace.y.push(event.clientY);
  }
});

boardElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index === null) return;
  traceEvent('rdown', event, index);
  if (!toggleFlag(index)) wastedClicks++;
});

// The board can shift under the viewport coordinate system; every such
// change gets a fresh layout event so samples stay mappable to cells.
document.addEventListener('scroll', () => {
  if (tracing()) recordLayout();
});
window.addEventListener('resize', () => {
  if (tracing()) recordLayout();
});

// Anywhere on the top panel (face button included, since it bubbles) restarts.
document.getElementById('top-panel').addEventListener('click', newGame);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  event.preventDefault();
  newGame();
});

//-------DIFFICULTY TABS-------

for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    for (const t of document.querySelectorAll('#difficulty-tabs a')) t.classList.remove('active');
    tab.classList.add('active');
    const name = tab.dataset.difficulty;
    if (name === 'custom') {
      customForm.hidden = false;
      customForm.requestSubmit();
    } else {
      customForm.hidden = true;
      config = { ...DIFFICULTIES[name] };
      newGame();
    }
  });
}

customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const width = Math.max(8, Math.min(100, Number(document.getElementById('custom-width').value)));
  const height = Math.max(1, Math.min(100, Number(document.getElementById('custom-height').value)));
  // Classic winmine constraint: mines fit with at least a 3x3 opening's worth of space.
  const maxMines = (width - 1) * (height - 1);
  const mines = Math.max(1, Math.min(maxMines, Number(document.getElementById('custom-mines').value)));
  document.getElementById('custom-width').value = width;
  document.getElementById('custom-height').value = height;
  document.getElementById('custom-mines').value = mines;
  config = { width, height, mines };
  newGame();
});

//-------ZOOM-------

document.getElementById('zoom-select').addEventListener('change', (event) => {
  document.documentElement.style.setProperty('--cell-size', event.target.value + 'px');
  if (tracing()) recordLayout();
});

//-------BACKUP (export / import of the play history)-------

const backupStatus = document.getElementById('backup-status');
const importPanel = document.getElementById('import-panel');
const importText = document.getElementById('import-text');
const importFileInput = document.getElementById('import-file-input');
const exportFileLink = document.getElementById('export-file');

function gameCount(history) {
  return Object.values(history).reduce((n, list) => n + list.length, 0);
}

document.getElementById('export-btn').addEventListener('click', () => {
  // The reserved "settings" key rides along with the mode lists; it can
  // never collide with a mode key (those are always WxH/M).
  const json = JSON.stringify({ settings, ...history });
  navigator.clipboard.writeText(json).then(
    () => { backupStatus.textContent = 'export copied to clipboard (' + gameCount(history) + ' games)'; },
    (err) => { backupStatus.textContent = 'clipboard copy failed: ' + err.message; },
  );
  if (exportFileLink.href) URL.revokeObjectURL(exportFileLink.href);
  exportFileLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  exportFileLink.download = 'minesweeper-friendly-history-' + new Date().toISOString().slice(0, 10) + '.json';
  exportFileLink.hidden = false;
});

// Traces export as a JSON array of per-game trace objects (typed arrays
// converted back to plain arrays), download-only — traces are far too
// large for the clipboard. Consumed by the offline analysis pipelines
// (see analysis/ and agents.md).
const exportTracesLink = document.getElementById('export-traces-file');

document.getElementById('export-traces-btn').addEventListener('click', () => {
  if (db === null) storageFailure('trace export failed: database is not open');
  const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).getAll();
  request.onerror = () => storageFailure('trace export failed: ' + request.error);
  request.onsuccess = () => {
    const games = request.result.map((s) => ({
      ...s,
      sampleT: Array.from(s.sampleT),
      sampleX: Array.from(s.sampleX),
      sampleY: Array.from(s.sampleY),
    }));
    const json = JSON.stringify(games);
    if (exportTracesLink.href) URL.revokeObjectURL(exportTracesLink.href);
    exportTracesLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    exportTracesLink.download = 'minesweeper-friendly-traces-' + new Date().toISOString().slice(0, 10) + '.json';
    exportTracesLink.hidden = false;
    backupStatus.textContent = games.length + ' traces ready (' + (json.length / 1048576).toFixed(1) + ' MB)';
  };
});

// Merges an exported history into the stored one. endedAt identifies a
// record within a mode (one player cannot finish two games of the same mode
// in the same millisecond), so re-importing the same blob is a no-op. The
// reserved "settings" key (exports since 2026-08-20; absent on older
// exports) carries the settings block, whose known fields overwrite the
// stored settings. The whole blob — settings included — is validated
// before anything is written.
function importHistory(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    backupStatus.textContent = 'import failed: ' + err.message;
    return;
  }
  let importedSettings = null;
  if ('settings' in parsed) {
    importedSettings = parsed.settings;
    delete parsed.settings;
    const malformed = importedSettings === null || typeof importedSettings !== 'object'
      || SETTINGS_SCHEMA.some((s) => s.field in importedSettings && !s.valid(importedSettings[s.field]));
    if (malformed) {
      backupStatus.textContent = 'import failed: "settings" is not a valid settings block';
      return;
    }
  }
  for (const [mode, list] of Object.entries(parsed)) {
    if (!Array.isArray(list)) {
      backupStatus.textContent = 'import failed: "' + mode + '" is not an array of game records';
      return;
    }
    for (const r of list) {
      const malformed = r === null || typeof r !== 'object'
        || GAME_RECORD_SCHEMA.some((f) => !f.valid(r[f.field]));
      if (malformed) {
        backupStatus.textContent = 'import failed: "' + mode + '" contains a malformed game record';
        return;
      }
    }
  }
  let added = 0;
  let dups = 0;
  for (const [mode, list] of Object.entries(parsed)) {
    if (!(mode in history)) history[mode] = [];
    const seen = new Set(history[mode].map((r) => r.endedAt));
    for (const r of list) {
      if (seen.has(r.endedAt)) {
        dups += 1;
        continue;
      }
      seen.add(r.endedAt);
      history[mode].push(r);
      added += 1;
    }
    // Merged-in records restore the chronological-order invariant.
    history[mode].sort((a, b) => a.endedAt - b.endedAt);
  }
  persistUserdata('history', history);
  let settingsNote = '';
  if (importedSettings !== null) {
    for (const s of SETTINGS_SCHEMA) {
      if (s.field in importedSettings) settings[s.field] = importedSettings[s.field];
    }
    saveSettings();
    refreshSettingsPanel();
    settingsNote = ', applied settings';
  }
  backupStatus.textContent = 'imported ' + added + ' new games, skipped ' + dups + ' duplicates' + settingsNote;
  importPanel.hidden = true;
  importText.value = '';
}

document.getElementById('import-btn').addEventListener('click', () => {
  importPanel.hidden = !importPanel.hidden;
});

const formatPanel = document.getElementById('format-panel');

document.getElementById('format-btn').addEventListener('click', () => {
  formatPanel.hidden = !formatPanel.hidden;
});

//-------SETTINGS PANEL-------

const settingsPanel = document.getElementById('settings-panel');

document.getElementById('settings-btn').addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

// One checkbox row per SETTINGS_SCHEMA entry. A change saves immediately
// and re-renders the result on screen (if any), so the effect is visible
// without finishing another game.
function buildSettingsPanel() {
  for (const s of SETTINGS_SCHEMA) {
    const row = document.createElement('label');
    row.className = 'setting-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.field = s.field;
    box.checked = settings[s.field];
    box.addEventListener('change', () => {
      settings[s.field] = box.checked;
      saveSettings();
      if (renderedResult !== null) renderResult(renderedResult.record, renderedResult.modeRecords);
    });
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.textContent = s.label;
    const describe = document.createElement('span');
    describe.className = 'setting-describe';
    describe.textContent = s.describe;
    row.append(box, name, describe);
    settingsPanel.appendChild(row);
  }
}

// Re-syncs the checkboxes after an import replaces settings.
function refreshSettingsPanel() {
  for (const box of settingsPanel.querySelectorAll('input[type=checkbox]')) {
    box.checked = settings[box.dataset.field];
  }
}

// The data-format reference card, generated from GAME_RECORD_SCHEMA and
// DIFFICULTIES so it always matches what the code writes and accepts.
function buildFormatPanel() {
  const block = (headingText) => {
    const div = document.createElement('div');
    div.className = 'format-block';
    const heading = document.createElement('h4');
    heading.textContent = headingText;
    div.appendChild(heading);
    formatPanel.appendChild(div);
    return div;
  };

  const exportBlock = block('the whole export');
  const beginnerKey = modeKeyOf(DIFFICULTIES.beginner);
  const intermediateKey = modeKeyOf(DIFFICULTIES.intermediate);
  const keyColumn = (key) => ('"' + key + '":').padEnd(intermediateKey.length + 4);
  const pre = document.createElement('pre');
  pre.textContent = '{\n  ' + keyColumn('settings') + '{ \u2026the settings panel\u2019s switches\u2026 },\n  '
    + keyColumn(beginnerKey) + '[ \u2026one record per finished game\u2026 ],\n  '
    + keyColumn(intermediateKey) + '[ \u2026 ]\n}';
  const namedModes = Object.entries(DIFFICULTIES)
    .map(([name, d]) => modeKeyOf(d) + ' = ' + difficultyDisplayName(name))
    .join(', ');
  const exportNote = document.createElement('p');
  exportNote.textContent = 'One list per board, keyed by its parameters (width\u00d7height/mines: '
    + namedModes + '). Records sit in play order, wins and losses alike. The reserved '
    + '"settings" key carries the settings panel\u2019s switches; importing applies them '
    + '(absent on exports from before 2026-08-20).';
  exportBlock.append(pre, exportNote);

  const recordBlock = block('each game record');
  const table = document.createElement('table');
  for (const f of GAME_RECORD_SCHEMA) {
    const row = document.createElement('tr');
    for (const text of [f.field, f.example, f.describe]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  const recordNote = document.createElement('p');
  recordNote.textContent = 'Only these ' + GAME_RECORD_SCHEMA.length + ' measurements are stored. '
    + 'Everything else on the win screen (3BV/s, clicks over 3BV, efficiency, mouse speed, '
    + 'path per click, path per 3BV, every rank and chart) is recomputed from them at display time.';
  recordBlock.append(table, recordNote);
}

document.getElementById('import-apply').addEventListener('click', () => importHistory(importText.value));

document.getElementById('import-open').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (file) file.text().then(importHistory);
  importFileInput.value = '';
});

//-------INIT-------

// Static chrome builds immediately; everything that reads userdata waits
// in init, which loadUserdata calls once the RAM copies are filled.
buildLcd(mineCounter);
buildLcd(timerDisplay);
buildFormatPanel();

function init() {
  buildSettingsPanel();
  renderStates();
  newGame();
}
