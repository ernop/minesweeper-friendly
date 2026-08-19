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

let config = { ...DIFFICULTIES.intermediate };
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
  showStats('Win');
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
  showStats('Loss');
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

function showStats(result) {
  const bv = compute3BV();
  const seconds = finalTimeMs / 1000;
  const stats = {
    at: Date.now(),
    timeMs: Math.round(finalTimeMs),
    bv: bv,
    bvps: seconds > 0 ? Number((bv / seconds).toFixed(4)) : 0,
    clicks: clickCount,
    efficiency: clickCount > 0 ? Math.round((bv / clickCount) * 100) : 0,
  };
  resultSummary.textContent = result + ' - ' + modeLabel() + ' - ' + formatDate(stats.at);
  resultStats.textContent = 'Time ' + seconds.toFixed(3) + 's - 3BV ' + stats.bv
    + ' - 3BV/s ' + stats.bvps.toFixed(4) + ' - Clicks ' + stats.clicks
    + ' - Efficiency ' + stats.efficiency + '%';
  if (result === 'Win') {
    recordScoreAndRenderRanks(stats);
  } else {
    resultRanks.textContent = 'Losses are not ranked.';
  }
}

//-------SCORE HISTORY (localStorage, all wins kept per mode)-------

const SCORES_KEY = 'minesweeper-friendly.scores.v1';

const RANK_WINDOWS = [
  ['lifetime', Infinity],
  ['past year', 365 * 86400e3],
  ['past month', 30 * 86400e3],
  ['past week', 7 * 86400e3],
  ['past day', 86400e3],
  ['past hour', 3600e3],
  ['past 15 min', 15 * 60e3],
  ['past 5 min', 5 * 60e3],
  ['past 1 min', 60e3],
];

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
function rankColumns(stats) {
  const columns = RANK_WINDOWS.map(([label, span]) => ({
    label: label,
    filter: (s) => stats.at - s.at <= span,
  }));
  const winDate = new Date(stats.at);
  const weekday = winDate.getDay();
  columns.push({
    label: 'on ' + WEEKDAY_NAMES[weekday] + 's',
    filter: (s) => new Date(s.at).getDay() === weekday,
  });
  const weekend = isWeekend(winDate);
  columns.push({
    label: weekend ? 'on weekends' : 'on weekdays',
    filter: (s) => isWeekend(new Date(s.at)) === weekend,
  });
  if (isHoliday(winDate)) {
    columns.push({
      label: 'on holidays',
      filter: (s) => isHoliday(new Date(s.at)),
    });
  }
  return columns;
}

function loadScores() {
  const raw = localStorage.getItem(SCORES_KEY);
  return raw === null ? {} : JSON.parse(raw);
}

// Appends the win to this mode's history, then renders one ranked-list column
// per time window: up to 10 scores above the new one, the new one bolded, and
// up to 10 below. Ordering is by time, ties broken by earlier date.
function recordScoreAndRenderRanks(stats) {
  const allScores = loadScores();
  const key = modeLabel();
  if (!(key in allScores)) allScores[key] = [];
  const modeScores = allScores[key];
  modeScores.push(stats);
  localStorage.setItem(SCORES_KEY, JSON.stringify(allScores));
  renderRanks(stats, modeScores);
}

function renderRanks(stats, modeScores) {
  resultRanks.textContent = '';
  for (const column of rankColumns(stats)) {
    const inWindow = modeScores
      .filter(column.filter)
      .sort((a, b) => a.timeMs - b.timeMs || a.at - b.at);
    // `stats` is an element of modeScores, so identity search finds it.
    const myIndex = inWindow.indexOf(stats);
    const start = Math.max(0, myIndex - 10);
    const end = Math.min(inWindow.length, myIndex + 11);

    const list = document.createElement('div');
    list.className = 'rank-list';
    const heading = document.createElement('h4');
    heading.textContent = column.label + ' - #' + (myIndex + 1) + ' of ' + inWindow.length;
    list.appendChild(heading);
    // Three aligned columns per list: rank, time, date.
    const grid = document.createElement('div');
    grid.className = 'rank-grid';
    for (let i = start; i < end; i++) {
      const row = document.createElement('div');
      row.className = i === myIndex ? 'rank-row me' : 'rank-row';
      const age = relativeAge(stats.at, inWindow[i].at);
      const justNow = age.count === 0 && age.unit === 's';
      const unitClass = ' age-u-' + age.unit;
      for (const [cls, text] of [
        ['rank-cell', '#' + (i + 1)],
        ['time-cell', (inWindow[i].timeMs / 1000).toFixed(3) + 's'],
        ['age-num-cell' + unitClass, justNow ? '' : String(age.count)],
        ['age-unit-cell' + unitClass, justNow ? 'just now' : age.unit + ' ago'],
      ]) {
        const cell = document.createElement('span');
        cell.className = cls;
        cell.textContent = text;
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
    list.appendChild(grid);
    resultRanks.appendChild(list);
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

boardElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (gameState === 'won' || gameState === 'lost') return;
  const index = cellIndexFromEvent(event);
  if (index !== null) toggleFlag(index);
});

// Anywhere on the top panel (face button included, since it bubbles) restarts.
document.getElementById('top-panel').addEventListener('click', newGame);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.target.tagName === 'INPUT') return;
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

//-------INIT-------

buildLcd(mineCounter);
buildLcd(timerDisplay);
newGame();
