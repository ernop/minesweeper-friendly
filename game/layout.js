'use strict';

// Board position (a pure constraint solver, its page wiring, and the position
// editor), zoom (cell size), and page layout: docked sidebar and game data
// columns, Justice callout placement, and result clearance.

//-------PERSISTENT BOARD POSITION (pure constraint solver)-------

function boardPositionRect(rect, x, y) {
  const width = rect.width === undefined ? rect.right - rect.left : rect.width;
  const height = rect.height === undefined ? rect.bottom - rect.top : rect.height;
  return {
    left: rect.left + x,
    top: rect.top + y,
    right: rect.left + x + width,
    bottom: rect.top + y + height,
    width,
    height,
  };
}

function boardPositionOverlapArea(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function boardPositionLayoutRect(rect, scrollX, scrollY, fixedAtViewportOrigin) {
  return boardPositionRect(
    rect,
    fixedAtViewportOrigin ? 0 : scrollX,
    fixedAtViewportOrigin ? 0 : scrollY);
}

function boardPositionPanelRect(board, width, height, bounds) {
  const gap = 10;
  const centerX = board.left + (board.width - width) / 2;
  const candidates = [
    [centerX, board.bottom + gap],
    [centerX, board.top - gap - height],
    [board.right + gap, board.top],
    [board.left - gap - width, board.top],
  ];
  let best = null;
  for (const [x, y] of candidates) {
    const left = Math.max(bounds.left, Math.min(bounds.right - width, x));
    const top = Math.max(bounds.top, Math.min(bounds.bottom - height, y));
    const rect = { left, top, right: left + width, bottom: top + height, width, height };
    const overlap = boardPositionOverlapArea(rect, board);
    const distance = (left - x) ** 2 + (top - y) ** 2;
    if (best === null || overlap < best.overlap
        || (overlap === best.overlap && distance < best.distance)) {
      best = { ...rect, overlap, distance };
    }
  }
  return best;
}

// Find the collision-free offset nearest the player's preference. Horizontal
// bounds keep a board that fits inside the available main column; oversized
// boards retain their natural overflow. There is deliberately no lower bound:
// positive Y expands page flow, so a deeply lowered board remains scrollable.
function constrainBoardOffset(base, bounds, exclusions, preferredX, preferredY) {
  const gap = 8;
  const availableWidth = Math.max(0, bounds.right - bounds.left);
  const fitsHorizontally = base.width <= availableWidth;
  const minX = bounds.left - base.left;
  const maxX = bounds.right - base.right;
  const clampX = (x) => fitsHorizontally ? Math.max(minX, Math.min(maxX, x)) : x;
  const minY = bounds.top - base.top;
  const clampY = (y) => Math.max(minY, y);
  const xCandidates = [clampX(preferredX)];
  const yCandidates = [clampY(preferredY)];

  for (const exclusion of exclusions) {
    xCandidates.push(clampX(exclusion.left - gap - base.right));
    xCandidates.push(clampX(exclusion.right + gap - base.left));
    yCandidates.push(clampY(exclusion.top - gap - base.bottom));
    yCandidates.push(clampY(exclusion.bottom + gap - base.top));
  }

  let best = null;
  for (const x of new Set(xCandidates.map(Math.round))) {
    for (const y of new Set(yCandidates.map(Math.round))) {
      const placed = boardPositionRect(base, x, y);
      const overlap = exclusions.reduce(
        (sum, exclusion) => sum + boardPositionOverlapArea(placed, exclusion), 0);
      const distance = (x - preferredX) ** 2 + (y - preferredY) ** 2;
      const score = overlap * 1e9 + distance;
      if (best === null || score < best.score) best = { x, y, score, overlap };
    }
  }
  return { x: best.x, y: best.y, adjusted: best.x !== preferredX || best.y !== preferredY };
}

//-------PERSISTENT BOARD POSITION END-------

//-------PAGE LAYOUT (applied position, docked columns, clearance)-------

const boardPositionButton = document.getElementById('board-position-btn');
const boardPositionPanel = document.getElementById('board-position-panel');
const boardPositionX = document.getElementById('board-position-x');
const boardPositionXNumber = document.getElementById('board-position-x-number');
const boardPositionY = document.getElementById('board-position-y');
const boardPositionYNumber = document.getElementById('board-position-y-number');
const boardPositionDragSurface = document.getElementById('board-position-drag-surface');

let appliedBoardOffsetX = 0;
let appliedBoardOffsetY = 0;
let boardLayoutFrame = null;
let stopBoardPositionDrag = null;

// Board layout uses document coordinates so scrolling cannot move content.
function boardPageRect(element) {
  return boardPositionLayoutRect(
    element.getBoundingClientRect(), window.scrollX, window.scrollY, false);
}

function syncBoardPositionInputs() {
  const x = String(settings.boardOffsetX);
  const y = String(settings.boardOffsetY);
  boardPositionX.value = x;
  boardPositionXNumber.value = x;
  boardPositionY.value = y;
  boardPositionYNumber.value = y;
}

// Keep the editor beside the board without constraining the position being
// chosen. At screen edges, another side or an overlap keeps Done reachable.
function placeBoardPositionPanel() {
  if (boardPositionPanel.hidden) return;
  const margin = 12;
  const viewport = window.visualViewport;
  const bounds = {
    left: viewport.offsetLeft + margin,
    top: viewport.offsetTop + margin,
    right: viewport.offsetLeft + viewport.width - margin,
    bottom: viewport.offsetTop + viewport.height - margin,
  };
  boardPositionPanel.style.maxWidth = Math.max(0, bounds.right - bounds.left) + 'px';
  boardPositionPanel.style.maxHeight = Math.max(0, bounds.bottom - bounds.top) + 'px';
  const placed = boardPositionPanelRect(gameFrame.getBoundingClientRect(),
    boardPositionPanel.offsetWidth, boardPositionPanel.offsetHeight, bounds);
  boardPositionPanel.style.left = placed.left + 'px';
  boardPositionPanel.style.top = placed.top + 'px';
}

function applyBoardPosition() {
  if (settings === null) return;
  syncGameSidebar();
  const inset = parseFloat(getComputedStyle(pageLayout).getPropertyValue('--board-edge-inset'));
  const current = boardPageRect(gameFrame);
  const base = boardPositionRect(current, -appliedBoardOffsetX, -appliedBoardOffsetY);
  const mainRect = boardPageRect(mainElement);
  const tabsRect = boardPageRect(difficultyTabs);
  const viewportRight = Math.max(inset, window.innerWidth - inset);
  let left = Math.max(inset, mainRect.left + inset);
  let right = Math.min(viewportRight, mainRect.right - inset);
  if (right < left) {
    left = mainRect.left;
    right = mainRect.right;
  }
  const placed = constrainBoardOffset(base, {
    left,
    right,
    top: tabsRect.bottom + inset,
  }, [], settings.boardOffsetX, settings.boardOffsetY);

  appliedBoardOffsetX = placed.x;
  appliedBoardOffsetY = placed.y;
  gameArea.style.setProperty('--board-position-applied-x', placed.x + 'px');
  gameArea.style.setProperty('--board-position-applied-y', placed.y + 'px');
  gameArea.style.setProperty(
    '--board-position-flow-clearance', Math.max(0, placed.y) + 'px');

  boardPositionDragSurface.style.left = gameFrame.offsetLeft + 'px';
  boardPositionDragSurface.style.top = gameFrame.offsetTop + 'px';
  boardPositionDragSurface.style.width = gameFrame.offsetWidth + 'px';
  boardPositionDragSurface.style.height = gameFrame.offsetHeight + 'px';
  placeBoardPositionPanel();
}

function syncBoardLayout() {
  applyBoardPosition();
  syncJusticePlacement();
  syncResultClearance();
  recordLayoutIfMoved();
}

function scheduleBoardLayout() {
  if (boardLayoutFrame !== null) return;
  boardLayoutFrame = requestAnimationFrame(() => {
    boardLayoutFrame = null;
    syncBoardLayout();
  });
}

// The game data chart takes the column height left below the controls and
// summary, so its footer stays in view. A column too short for a readable
// plot scrolls instead of crushing it.
const GAME_DATA_MIN_HEIGHT = 480;
function fitGameDataToSidebar() {
  const profile = resultStats.querySelector('.board-time-profile');
  if (profile === null || !profile.checkVisibility()) return;
  const column = getComputedStyle(gameSidebar);
  const offset = profile.getBoundingClientRect().top - gameSidebar.getBoundingClientRect().top + gameSidebar.scrollTop;
  const bottom = parseFloat(column.maxHeight) - parseFloat(column.paddingBottom) - parseFloat(column.borderBottomWidth);
  profile.style.height = Math.max(GAME_DATA_MIN_HEIGHT, Math.floor(bottom - offset)) + 'px';
}

// Game data gets its own column only where a win can plot it, so trial modes
// and a hidden chart do not reserve an empty strip.
const GAME_DATA_MIN_WIDTH = 360;
// Keeps the ranks-won summary and a table beside it under the board.
const MAIN_MIN_WITH_GAME_DATA = 640;
function gameDataColumnWanted() {
  return settings !== null && settings.shownThings.boardPercentiles
    && !Trial.isPlayMode(settings.playMode);
}

function placeGameData() {
  const docked = pageLayout.classList.contains('game-data-docked');
  const host = (docked ? resultStats : gameDataColumn).querySelector('.board-time-profile-host');
  if (host === null) return;
  host.querySelector('.board-time-profile').style.height = '';
  (docked ? gameDataColumn : resultStats).appendChild(host);
}

// Reserve the options/stats column before results exist. A finished game's
// content never decides how much room the board or history receives.
function syncGameSidebar() {
  const layoutStyle = getComputedStyle(pageLayout);
  const gap = parseFloat(layoutStyle.columnGap);
  const metricsBeside = !metricsPanel.hidden && window.innerWidth > 700;
  const metricsWidth = metricsBeside ? metricsPanel.getBoundingClientRect().width : 0;
  // Game data takes a full-height column beside the board column when the
  // board, two tables' width, and the details column at its minimum still
  // fit. Otherwise the details column holds it, taking its preferred share of
  // the viewport but yielding to the board down to its minimum; below that
  // the details become the Game details popover.
  const preferred = parseFloat(layoutStyle.getPropertyValue('--game-sidebar-width'));
  const minimum = parseFloat(layoutStyle.getPropertyValue('--game-sidebar-min-width'));
  const free = pageLayout.clientWidth - metricsWidth;
  const board = gameFrame.offsetWidth + 16;
  const room = free - gap * 2 - board;
  const docked = window.innerWidth > 700 && room >= minimum;
  const dataRoom = free - gap * 3 - minimum - Math.max(board, MAIN_MIN_WITH_GAME_DATA);
  const dataDocked = docked && gameDataColumnWanted() && dataRoom >= GAME_DATA_MIN_WIDTH;
  const dataPreferred = parseFloat(layoutStyle.getPropertyValue('--game-data-width'));
  pageLayout.style.setProperty('--game-data-docked-width', Math.min(dataPreferred, dataRoom) + 'px');
  pageLayout.style.setProperty('--game-sidebar-docked-width',
    (dataDocked ? minimum : Math.max(minimum, Math.min(preferred, room))) + 'px');
  pageLayout.classList.toggle('game-data-docked', dataDocked);
  pageLayout.classList.toggle('board-beside-game-data', docked && gameDataColumnWanted());
  placeGameData();
  const compact = !docked;
  if (pageLayout.classList.contains('compact-sidebar') !== compact) {
    if (gameSidebar.matches(':popover-open')) gameSidebar.hidePopover();
    pageLayout.classList.toggle('compact-sidebar', compact);
    if (compact) gameSidebar.setAttribute('popover', 'auto');
    else gameSidebar.removeAttribute('popover');
  }
  gameSidebarButton.hidden = docked;
  gameSidebarClose.hidden = docked;
  resultsBox.hidden = resultSummary.textContent === '' && resultStats.textContent === '';
  fitGameDataToSidebar();
}

function syncJusticePlacement() {
  justiceLive.classList.remove('justice-left', 'justice-below');
  if (justiceLive.childElementCount === 0) return;
  const mainRect = boardPageRect(mainElement);
  const inset = parseFloat(getComputedStyle(pageLayout).getPropertyValue('--board-edge-inset'));
  // Keep board callouts within the main column. Sidebar contents, including
  // an open compact popover, must not reposition them or the history below.
  const collides = (rect) => rect.left < mainRect.left + inset || rect.right > mainRect.right - inset;

  if (!collides(boardPageRect(justiceLive))) return;
  justiceLive.classList.add('justice-left');
  if (!collides(boardPageRect(justiceLive))) return;
  justiceLive.classList.remove('justice-left');
  justiceLive.classList.add('justice-below');
}

// Justice callouts belong to the board. The stats and replay legend have
// their own column and contribute no height to the history below the board.
function syncResultClearance() {
  const sections = [pregenCharts, resultAnalysis, resultRanks];
  const extra = !gameArea.classList.contains('trial-no-board') && justiceLive.childElementCount > 0
    ? Math.max(0, Math.ceil(justiceLive.getBoundingClientRect().bottom
      - gameArea.getBoundingClientRect().bottom)) : 0;
  const target = !pregenCharts.hidden ? pregenCharts
    : resultAnalysis.childElementCount > 0 ? resultAnalysis : resultRanks;
  target.style.setProperty('--result-overflow', extra + 'px');
  for (const section of sections) {
    if (section !== target) section.style.removeProperty('--result-overflow');
  }
}

//-------BOARD POSITION EDITOR (the position panel controls)-------

function setBoardPositionPreference(x, y, persist) {
  settings.boardOffsetX = Math.max(-2000, Math.min(2000, Math.round(x)));
  settings.boardOffsetY = Math.max(-1000, Math.min(2000, Math.round(y)));
  syncBoardPositionInputs();
  syncBoardLayout();
  if (persist) saveSettings();
}

function setBoardPositionEditing(open) {
  rememberPanel('boardPosition', open);
  if (!open && stopBoardPositionDrag !== null) stopBoardPositionDrag();
  boardPositionPanel.hidden = !open;
  boardPositionDragSurface.hidden = !open;
  boardPositionButton.setAttribute('aria-expanded', String(open));
  syncBoardLayout();
  if (open) boardPositionDragSurface.focus({ preventScroll: true });
  else boardPositionButton.focus({ preventScroll: true });
}

function bindBoardPositionInput(range, number, axis) {
  const apply = (source, persist) => {
    if (source.value === '' || !Number.isFinite(Number(source.value))) return;
    const value = Number(source.value);
    const x = axis === 'x' ? value : settings.boardOffsetX;
    const y = axis === 'y' ? value : settings.boardOffsetY;
    setBoardPositionPreference(x, y, persist);
  };
  range.addEventListener('input', () => apply(range, false));
  range.addEventListener('change', () => apply(range, true));
  number.addEventListener('change', () => apply(number, true));
}

function initBoardPositionControls() {
  syncBoardPositionInputs();
  boardPositionButton.addEventListener('click', () => {
    setBoardPositionEditing(boardPositionPanel.hidden);
  });
  document.getElementById('board-position-done').addEventListener('click', () => {
    setBoardPositionEditing(false);
  });
  document.getElementById('board-position-reset').addEventListener('click', () => {
    setBoardPositionPreference(0, 0, true);
  });
  bindBoardPositionInput(boardPositionX, boardPositionXNumber, 'x');
  bindBoardPositionInput(boardPositionY, boardPositionYNumber, 'y');

  boardPositionDragSurface.addEventListener('keydown', (event) => {
    const deltas = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!(event.key in deltas)) {
      if (event.key === 'Escape') setBoardPositionEditing(false);
      return;
    }
    event.preventDefault();
    const scale = event.shiftKey ? 10 : 1;
    const [dx, dy] = deltas[event.key];
    setBoardPositionPreference(
      settings.boardOffsetX + dx * scale,
      settings.boardOffsetY + dy * scale,
      true);
  });

  boardPositionDragSurface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || stopBoardPositionDrag !== null) return;
    event.preventDefault();
    boardPositionDragSurface.focus({ preventScroll: true });
    const startX = event.clientX;
    const startY = event.clientY;
    const preferenceX = settings.boardOffsetX;
    const preferenceY = settings.boardOffsetY;
    const move = (ev) => {
      if (ev.pointerId !== event.pointerId) return;
      setBoardPositionPreference(
        preferenceX + ev.clientX - startX,
        preferenceY + ev.clientY - startY,
        false);
    };
    const up = (ev) => {
      if (ev.pointerId !== event.pointerId) return;
      move(ev);
      stopBoardPositionDrag();
    };
    const cancel = (ev) => {
      if (ev.pointerId === event.pointerId) stopBoardPositionDrag();
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', stop);
      stopBoardPositionDrag = null;
      saveSettings();
    };
    stopBoardPositionDrag = stop;
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', stop);
  });

  boardPositionPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setBoardPositionEditing(false);
  });

  window.visualViewport.addEventListener('resize', placeBoardPositionPanel);
  window.visualViewport.addEventListener('scroll', placeBoardPositionPanel);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(scheduleBoardLayout);
    observer.observe(topRight);
    observer.observe(scoresNav);
    observer.observe(gameFrame);
    observer.observe(resultsBox);
    observer.observe(justiceLive);
    observer.observe(difficultyTabs);
    observer.observe(metricsPanel);
    observer.observe(boardPositionPanel);
  }
}

//-------ZOOM (the persistent cell size)-------

function applyCellSize() {
  document.getElementById('zoom-select').value = String(settings.cellSize);
  document.documentElement.style.setProperty('--cell-size', settings.cellSize + 'px');
  applyBoardPosition();
  if (tracing()) recordLayout();
  syncJusticePlacement();
  syncResultClearance();
}

function initCellSizeControl() {
  const select = document.getElementById('zoom-select');
  select.replaceChildren();
  const definition = SETTINGS_SCHEMA.find((s) => s.field === 'cellSize');
  for (const size of definition.choices) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = String(size);
    select.appendChild(option);
  }
  applyCellSize();
  select.disabled = false;
  select.addEventListener('change', () => {
    const size = Number(select.value);
    if (!definition.valid(size)) {
      select.value = String(settings.cellSize);
      return;
    }
    settings.cellSize = size;
    saveSettings();
    applyCellSize();
  });
}
