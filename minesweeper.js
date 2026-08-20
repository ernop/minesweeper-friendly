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
let clickCount = 0;

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

  setLcd(mineCounter, config.mines);
  setLcd(timerDisplay, 0);
  setFace('smile');
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

function toggleFlag(index) {
  const cell = cells[index];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  flagsCount += cell.flagged ? 1 : -1;
  clickCount++;
  updateCell(index);
  setLcd(mineCounter, config.mines - flagsCount);
}

// Left-click chord on a satisfied number opens all unflagged neighbors.
function chord(index) {
  const cell = cells[index];
  if (!cell.revealed || cell.adjacent === 0) return;
  const around = neighbors(index);
  const flaggedCount = around.filter((n) => cells[n].flagged).length;
  if (flaggedCount !== cell.adjacent) return;

  const toReveal = around.filter((n) => !cells[n].revealed && !cells[n].flagged);
  if (toReveal.length === 0) return;
  clickCount++;

  const hitMines = toReveal.filter((n) => cells[n].mine);
  if (hitMines.length > 0) {
    lose(hitMines);
    return;
  }
  for (const n of toReveal) floodReveal(n);
  checkWin();
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
    mousePathPx: Math.round(mousePathPx),
  };
  const modeRecords = appendGameRecord(record);
  renderResult(record, modeRecords);
}

function renderResult(record, modeRecords) {
  const seconds = secondsOf(record);
  resultSummary.textContent = (record.outcome === 'win' ? 'Win' : 'Loss')
    + '\n' + modeLabel() + '\n' + formatDate(record.endedAt);
  resultStats.textContent = '';
  const statsGrid = document.createElement('div');
  statsGrid.id = 'stats-grid';
  for (const [label, value] of [
    ['Time', seconds.toFixed(3) + 's'],
    ['3BV', String(record.bv3)],
    ['3BV/s', bvPerSecond(record).toFixed(4)],
    ['Clicks', String(record.clicks)],
    ['Efficiency', efficiencyPercent(record) + '%'],
    ['Mouse path', record.mousePathPx + 'px'],
    ['Mouse speed', Math.round(record.mousePathPx / seconds) + 'px/s'],
    ['Path per click', Math.round(record.mousePathPx / record.clicks) + 'px'],
    ['Path per 3BV', Math.round(record.mousePathPx / record.bv3) + 'px'],
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

//-------PLAY HISTORY (localStorage, every finished game kept per mode)-------

// One record per finished game, win or loss, holding only the primary
// measurements: { endedAt, outcome: 'win'|'loss', timeMs, bv3, clicks,
// mousePathPx }. Derived metrics (3BV/s, efficiency, mouse speed, ...) are
// computed from these wherever needed, never stored. Records are grouped by
// mode key and kept in chronological order.
const HISTORY_KEY = 'minesweeper-friendly.history';

// A mode's identity is its parameters; named difficulty labels are
// display-only (see modeLabel).
function modeKey() {
  return config.width + 'x' + config.height + '/' + config.mines;
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

function modeLabel() {
  for (const [name, d] of Object.entries(DIFFICULTIES)) {
    if (d.width === config.width && d.height === config.height && d.mines === config.mines) {
      return name.charAt(0).toUpperCase() + name.slice(1);
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

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  return raw === null ? {} : JSON.parse(raw);
}

// Appends the finished game to its mode's history and returns that mode's
// full record list (the appended object included, so identity search works).
function appendGameRecord(record) {
  const history = loadHistory();
  const key = modeKey();
  if (!(key in history)) history[key] = [];
  history[key].push(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history[key];
}

// Visible slice of a ranked list, 11 rows max. When my row sits within the
// top 11, the whole budget anchors at #1: the top 11 renders with my row in
// its true place. Only when #1 is out of reach does the window center on
// me: the 5 nearest faster and 5 nearest slower entries.
function windowBounds(myIndex, length) {
  if (myIndex <= 10) return [0, Math.min(length, 11)];
  return [myIndex - 5, Math.min(length, myIndex + 6)];
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
function buildRankList(headingText, rowCount, myIndex, gridClass, buildRowCells) {
  const list = document.createElement('div');
  list.className = 'rank-list';
  const heading = document.createElement('h4');
  heading.textContent = headingText;
  list.appendChild(heading);
  const grid = document.createElement('div');
  grid.className = gridClass;
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

// Small inline-SVG scatter plot: every win is a dot colored by its age unit
// (the same palette as rank-list ages, so time trends are scannable); this
// game is the black-ringed dot labeled with its today-rank. Shows
// relationships (e.g. does moving the mouse faster actually win games
// faster?) rather than rankings. Both axes carry nice tick labels with
// gridlines plus a spelled-out axis label naming the metric and unit.
function buildScatter(title, wins, me, fx, fy, xLabel, yLabel, meLabel, ageUnitOf) {
  const W = 270, H = 200, L = 52, R = 10, T = 8, B = 32;
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
  const xTicks = niceTicks(x0, x1, 7), fmtX = tickFmt(xTicks);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: px(v), y: H - B + 11, class: 'scatter-tick tick-x' }, fmtX(v));
  }
  const yTicks = niceTicks(y0, y1, 7), fmtY = tickFmt(yTicks);
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(v) + 2.5, class: 'scatter-tick tick-y' }, fmtY(v));
  }
  const dot = (s, cls, r) => el('circle', { cx: px(fx(s)).toFixed(1), cy: py(fy(s)).toFixed(1), r, class: cls });
  for (const s of wins) if (s !== me) dot(s, 'scatter-dot age-dot-' + ageUnitOf(s), '2.2');
  dot(me, 'scatter-me age-dot-' + ageUnitOf(me), '3.5');
  // Today-rank tag beside the me-dot; flips to the left near the right edge.
  const meX = px(fx(me));
  const flipLeft = meX > W - R - 50;
  el('text', {
    x: (flipLeft ? meX - 6 : meX + 6).toFixed(1),
    y: Math.max(T + 9, py(fy(me)) - 5).toFixed(1),
    class: 'scatter-me-label' + (flipLeft ? ' flip-left' : ''),
  }, meLabel);
  el('text', { x: L + (W - L - R) / 2, y: H - 3, class: 'scatter-axis-label' }, '\u2192 ' + xLabel);
  el('text', {
    transform: 'translate(10 ' + (T + (H - T - B) / 2) + ') rotate(-90)',
    class: 'scatter-axis-label',
  }, '\u2192 ' + yLabel);

  const list = document.createElement('div');
  list.className = 'rank-list scatter';
  const heading = document.createElement('h4');
  heading.textContent = title;
  list.append(heading, svg);
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

function renderRanks(record, modeRecords) {
  resultRanks.textContent = '';
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  // Progressive disclosure: two lists holding the exact same wins would
  // render identically, so only the most specific one of each such group is
  // shown. Broader charts appear on their own once history spreads across
  // enough hours/days/weekdays to make them differ.
  const candidates = rankColumns(record).map((column) => ({
    column,
    inWindow: wins
      .filter(column.filter)
      .sort((a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt),
  }));
  const seenSets = new Set();
  const kept = new Set();
  for (const c of [...candidates].sort((a, b) => a.column.specificity - b.column.specificity)) {
    const signature = c.inWindow.map((s) => s.endedAt).join('|');
    if (seenSets.has(signature)) continue;
    seenSets.add(signature);
    kept.add(c);
  }
  for (const c of candidates) {
    if (!kept.has(c)) continue;
    const { column, inWindow } = c;
    // `record` is an element of modeRecords, so identity search finds it.
    const myIndex = inWindow.indexOf(record);
    resultRanks.appendChild(buildRankList(
      column.label + ' - #' + (myIndex + 1) + ' of ' + inWindow.length,
      inWindow.length, myIndex, 'rank-grid',
      (i) => {
        const age = relativeAge(record.endedAt, inWindow[i].endedAt);
        const cells = [
          ['rank-cell', '#' + (i + 1)],
          ['time-cell', (inWindow[i].timeMs / 1000).toFixed(3) + 's'],
        ];
        if (age.count === 0 && age.unit === 's') {
          cells.push(['age-just-cell age-u-s', 'just now']);
        } else {
          cells.push(['age-num-cell age-u-' + age.unit, String(age.count)]);
          cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
        }
        return cells;
      }));
  }
  for (const spec of RANKAVERAGE_SPECS) {
    const groups = new Map(); // value -> { count, totalMs }
    for (const s of wins) {
      const v = spec.value(s);
      const g = groups.get(v) || { count: 0, totalMs: 0 };
      g.count += 1;
      g.totalMs += s.timeMs;
      groups.set(v, g);
    }
    const avgMs = (v) => groups.get(v).totalMs / groups.get(v).count;
    const byAvg = [...groups.keys()].sort((a, b) => avgMs(a) - avgMs(b));
    const avgIndex = byAvg.indexOf(spec.value(record));
    const avgList = buildRankList(
      spec.label + ' rankaverage - #' + (avgIndex + 1) + ' of ' + byAvg.length,
      byAvg.length, avgIndex, 'rankavg-grid',
      (i) => [
        ['rank-cell', '#' + (i + 1)],
        ['val-cell', spec.format(byAvg[i])],
        ['avg-cell', (avgMs(byAvg[i]) / 1000).toFixed(3) + 's'],
        ['cnt-cell', groups.get(byAvg[i]).count + '\u00d7'],
      ]);
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
    avgList.querySelector('.rankavg-grid').appendChild(deltaRow);
    resultRanks.appendChild(avgList);
  }

  // Streak lists: wins in chronological runs split by losses. A k-loss
  // streak joins k+1 adjacent runs; the streak ending in this win is "me".
  // modeRecords is chronological (appended in play order; import re-sorts).
  const runs = [[]];
  for (const r of modeRecords) {
    if (r.outcome === 'win') runs[runs.length - 1].push(r.endedAt);
    else runs.push([]);
  }
  for (const [label, slack] of [['streak', 0], ['near-streak (1 loss ok)', 1], ['near-near-streak (2 losses ok)', 2]]) {
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
      label + ' - #' + (myIndex + 1) + ' of ' + segments.length,
      segments.length, myIndex, 'rank-grid',
      (i) => {
        const seg = segments[i];
        const age = relativeAge(record.endedAt, seg.end);
        const cells = [
          ['rank-cell', '#' + (i + 1)],
          ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')],
        ];
        if (age.count === 0 && age.unit === 's') {
          cells.push(['age-just-cell age-u-s', 'just now']);
        } else {
          cells.push(['age-num-cell age-u-' + age.unit, String(age.count)]);
          cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
        }
        return cells;
      }));
  }

  // Scatter plots at the very bottom: derived mouse metrics against
  // outcomes. Needs at least 2 wins to have a spread.
  if (wins.length >= 2) {
    const brk = document.createElement('div');
    brk.className = 'flex-break';
    resultRanks.appendChild(brk);
    const todayStart = startOfDay(record.endedAt);
    const todayRank = wins
      .filter((s) => s.endedAt >= todayStart)
      .sort((a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt)
      .indexOf(record) + 1;
    const meLabel = '#' + todayRank + ' today';
    const ageUnitOf = (s) => relativeAge(record.endedAt, s.endedAt).unit;
    resultRanks.appendChild(buildScatter('mouse speed vs time',
      wins, record, (s) => s.mousePathPx / secondsOf(s), secondsOf,
      'mouse speed (px/s)', 'win time (s)', meLabel, ageUnitOf));
    resultRanks.appendChild(buildScatter('path per click vs efficiency',
      wins, record, (s) => s.mousePathPx / s.clicks, efficiencyPercent,
      'mouse path per click (px)', 'efficiency (%)', meLabel, ageUnitOf));
    resultRanks.appendChild(buildScatter('path per 3BV vs time',
      wins, record, (s) => s.mousePathPx / s.bv3, secondsOf,
      'mouse path per 3BV (px)', 'win time (s)', meLabel, ageUnitOf));
    const legend = document.createElement('div');
    legend.className = 'scatter-legend';
    legend.appendChild(document.createTextNode('dot color = how long ago that win was:'));
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
  const cell = cells[index];
  if (!cell.revealed && !cell.flagged) {
    clickCount++;
    revealCell(index);
  } else if (cell.revealed) {
    chord(index);
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;
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
});

boardElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index !== null) toggleFlag(index);
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
  const history = loadHistory();
  const json = JSON.stringify(history);
  navigator.clipboard.writeText(json).then(
    () => { backupStatus.textContent = 'export copied to clipboard (' + gameCount(history) + ' games)'; },
    (err) => { backupStatus.textContent = 'clipboard copy failed: ' + err.message; },
  );
  if (exportFileLink.href) URL.revokeObjectURL(exportFileLink.href);
  exportFileLink.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  exportFileLink.download = 'minesweeper-friendly-history-' + new Date().toISOString().slice(0, 10) + '.json';
  exportFileLink.hidden = false;
});

const RECORD_NUMBER_FIELDS = ['endedAt', 'timeMs', 'bv3', 'clicks', 'mousePathPx'];

// Merges an exported history into the stored one. endedAt identifies a
// record within a mode (one player cannot finish two games of the same mode
// in the same millisecond), so re-importing the same blob is a no-op. The
// whole blob is validated before anything is written.
function importHistory(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    backupStatus.textContent = 'import failed: ' + err.message;
    return;
  }
  for (const [mode, list] of Object.entries(parsed)) {
    if (!Array.isArray(list)) {
      backupStatus.textContent = 'import failed: "' + mode + '" is not an array of game records';
      return;
    }
    for (const r of list) {
      const malformed = r === null || typeof r !== 'object'
        || (r.outcome !== 'win' && r.outcome !== 'loss')
        || RECORD_NUMBER_FIELDS.some((f) => typeof r[f] !== 'number');
      if (malformed) {
        backupStatus.textContent = 'import failed: "' + mode + '" contains a malformed game record';
        return;
      }
    }
  }
  const history = loadHistory();
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
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  backupStatus.textContent = 'imported ' + added + ' new games, skipped ' + dups + ' duplicates';
  importPanel.hidden = true;
  importText.value = '';
}

document.getElementById('import-btn').addEventListener('click', () => {
  importPanel.hidden = !importPanel.hidden;
});

document.getElementById('import-apply').addEventListener('click', () => importHistory(importText.value));

document.getElementById('import-open').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (file) file.text().then(importHistory);
  importFileInput.value = '';
});

//-------INIT-------

buildLcd(mineCounter);
buildLcd(timerDisplay);
newGame();
