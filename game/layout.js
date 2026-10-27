'use strict';

// Board position (a pure constraint solver, its page wiring, and the position
// editor), zoom (cell size), and page layout: the docked details column,
// Justice callout placement, and result clearance.

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

// A trial's lobby and review show no board, so nothing is placed: the hidden
// frame measures as an empty box at the page origin, and constraining that
// box would push the offset further on every layout pass.
function boardPositionOffset() {
  if (gameArea.classList.contains('trial-no-board')) return { x: 0, y: 0 };
  const inset = parseFloat(getComputedStyle(pageLayout).getPropertyValue('--board-edge-inset'));
  const current = boardPageRect(gameFrame);
  const base = boardPositionRect(current, -appliedBoardOffsetX, -appliedBoardOffsetY);
  const mainRect = boardPageRect(mainElement);
  // The board may move up to the game setup rows, never over them.
  const setupBottom = Math.max(...[difficultyTabs, modeOptions, boardLabPanel]
    .filter((row) => !row.hidden).map((row) => boardPageRect(row).bottom));
  const viewportRight = Math.max(inset, window.innerWidth - inset);
  let left = Math.max(inset, mainRect.left + inset);
  let right = Math.min(viewportRight, mainRect.right - inset);
  if (right < left) {
    left = mainRect.left;
    right = mainRect.right;
  }
  return constrainBoardOffset(base, {
    left,
    right,
    top: setupBottom + inset,
  }, [], settings.boardOffsetX, settings.boardOffsetY);
}

function applyBoardPosition() {
  if (settings === null) return;
  syncGameSidebar();
  const placed = boardPositionOffset();
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
  // The replay transport under the board is as wide as the board frame.
  gameArea.style.setProperty('--board-frame-width', gameFrame.offsetWidth + 'px');
  applyBoardPosition();
  syncJusticePlacement();
  placeBoardSides();
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

// Game data's chart takes the column height left below the summary,
// controls, and during-this-game section, so the options row under it stays
// in view. Each open side keeps a readable plot's height; a column too short
// for that scrolls instead of crushing them. The subviews (configure,
// session history) take the column height as one view.
const GAME_DATA_SIDE_MIN_HEIGHT = 240;
const GAME_DATA_SUBVIEW_MIN_HEIGHT = 480;
function fitGameDataToSidebar() {
  const profile = resultStats.querySelector('.board-time-profile');
  if (profile === null || !profile.checkVisibility()) return;
  const column = getComputedStyle(gameSidebar);
  const offset = profile.getBoundingClientRect().top - gameSidebar.getBoundingClientRect().top + gameSidebar.scrollTop;
  const bottom = parseFloat(column.maxHeight) - parseFloat(column.paddingBottom) - parseFloat(column.borderBottomWidth);
  const room = Math.floor(bottom - offset);
  if (profile.dataset.screen !== 'chart') {
    profile.style.height = Math.max(GAME_DATA_SUBVIEW_MIN_HEIGHT, room) + 'px';
    return;
  }
  const section = profile.querySelector('.game-data-section.open');
  if (section === null) {
    profile.style.height = '';
    return;
  }
  // Everything but the chart keeps its own height: the options row.
  const fixed = profile.getBoundingClientRect().height - section.getBoundingClientRect().height;
  const openSides = Number(section.dataset.openSides);
  profile.style.height = Math.max(Math.ceil(fixed) + openSides * GAME_DATA_SIDE_MIN_HEIGHT, room) + 'px';
}

// Reserve the details column before results exist. A finished game's
// content never decides how much room the board or history receives.
// Keeps the session summary and a table beside it under a small board.
const MAIN_MIN_BESIDE_DETAILS = 640;
// One details column beside the board column: docked while the board column
// leaves it its minimum; below that the details become the Game details
// popover. Its width is the player's share of the window, yielding to the
// board column down to the minimum.
function detailsColumnFit() {
  const layoutStyle = getComputedStyle(pageLayout);
  const gap = parseFloat(layoutStyle.columnGap);
  const minimum = parseFloat(layoutStyle.getPropertyValue('--game-sidebar-min-width'));
  const free = pageLayout.clientWidth;
  const board = gameFrame.offsetWidth + 16;
  return {
    docked: window.innerWidth > 700 && free - gap - board >= minimum,
    minimum,
    maximum: Math.max(minimum, Math.floor(free - gap - Math.max(board, MAIN_MIN_BESIDE_DETAILS))),
  };
}
function detailsColumnWidth(fit, share) {
  return Math.max(fit.minimum, Math.min(fit.maximum, Math.round(share * window.innerWidth)));
}
function syncGameSidebar() {
  const fit = detailsColumnFit();
  const docked = fit.docked;
  const width = detailsColumnWidth(fit, settings.detailsColumnShare);
  pageLayout.style.setProperty('--game-sidebar-docked-width', width + 'px');
  detailsResize.hidden = !docked;
  detailsResize.setAttribute('aria-valuemin', String(fit.minimum));
  detailsResize.setAttribute('aria-valuemax', String(fit.maximum));
  detailsResize.setAttribute('aria-valuenow', String(width));
  const compact = !docked;
  if (pageLayout.classList.contains('compact-sidebar') !== compact) {
    if (gameSidebar.matches(':popover-open')) gameSidebar.hidePopover();
    pageLayout.classList.toggle('compact-sidebar', compact);
    if (compact) gameSidebar.setAttribute('popover', 'auto');
    else gameSidebar.removeAttribute('popover');
  }
  gameSidebarButton.hidden = docked;
  gameSidebarClose.hidden = docked;
  // The docked column sticks below the top bar, which wraps to two rows when
  // its width cannot hold the bar's items.
  pageLayout.style.setProperty('--top-bar-height', topBar.offsetHeight + 'px');
  resultsBox.hidden = resultStats.textContent === '';
  fitGameDataToSidebar();
}

// The docked column's left-edge grip sits in the column gap, outside the
// column's own scroll, at the column's height. The column and its charts
// follow the pointer on the next animation frame; release saves the share.
// The room the board leaves cannot change during a drag, so its limits are
// read once when it starts.
const detailsResize = document.getElementById('details-resize');
const DETAILS_RESIZE_KEY_STEP = 10;
// The grip's height sizes the grid row it shares with the column, so it can
// resize #page-layout, which the result layout observer watches. Set inside
// this callback, that change is a shallower resize the browser cannot
// deliver in the same frame, and the error bar shows its "ResizeObserver
// loop" report.
let detailsResizeFrame = null;
new ResizeObserver(() => {
  if (detailsResizeFrame !== null) return;
  detailsResizeFrame = requestAnimationFrame(() => {
    detailsResizeFrame = null;
    detailsResize.style.height = gameSidebar.offsetHeight + 'px';
  });
}).observe(gameSidebar);
function setDetailsColumnWidth(fit, width) {
  settings.detailsColumnShare = Math.max(fit.minimum, Math.min(fit.maximum, width)) / window.innerWidth;
}
detailsResize.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const fit = detailsColumnFit();
  const step = event.key === 'ArrowLeft' ? DETAILS_RESIZE_KEY_STEP : -DETAILS_RESIZE_KEY_STEP;
  setDetailsColumnWidth(fit, detailsColumnWidth(fit, settings.detailsColumnShare) + step);
  saveSettings();
  syncBoardLayout();
});
detailsResize.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  detailsResize.setPointerCapture(event.pointerId);
  detailsResize.classList.add('dragging');
  const fit = detailsColumnFit();
  const startX = event.clientX;
  const startWidth = detailsColumnWidth(fit, settings.detailsColumnShare);
  let frame = null;
  const move = (ev) => {
    setDetailsColumnWidth(fit, startWidth + startX - ev.clientX);
    if (frame === null) {
      frame = requestAnimationFrame(() => {
        frame = null;
        syncBoardLayout();
      });
    }
  };
  const stop = () => {
    detailsResize.removeEventListener('pointermove', move);
    detailsResize.removeEventListener('lostpointercapture', stop);
    detailsResize.classList.remove('dragging');
    if (frame !== null) cancelAnimationFrame(frame);
    saveSettings();
    syncBoardLayout();
  };
  detailsResize.addEventListener('pointermove', move);
  detailsResize.addEventListener('lostpointercapture', stop);
});

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

// Beside the board (user decision 2026-10-07: "the session sum could be to
// the left of the board, ranks won to the right, board in middle"): the
// session summary rests left of the board frame and ranks won right of it,
// tops aligned, each only where it fits inside the board column. This game's
// stats (creator 2026-10-26: "flowing up as possible") take a side neither
// holds, the left first, where they fit. A block that does not fit stays in
// the table list below the board, and all keep their place in its DOM order.
const BOARD_SIDE_GAP = 16;
function placeBoardSides() {
  const stats = resultRanks.querySelector('.game-stats');
  const blocks = [[['left'], resultRanks.querySelector('.session-summary')],
    [['right'], resultRanks.querySelector('.recent-placements')],
    [['left', 'right'], stats]].filter(([, block]) => block !== null);
  for (const [, block] of blocks) {
    block.classList.remove('beside-board');
    block.style.removeProperty('left');
    block.style.removeProperty('top');
  }
  stats?.classList.remove('below-first-line');
  if (gameArea.classList.contains('trial-no-board')) return;
  const inset = parseFloat(getComputedStyle(pageLayout).getPropertyValue('--board-edge-inset'));
  const frame = gameFrame.getBoundingClientRect();
  // The replay transport under a small board is wider than its frame.
  const transport = replayControls.hidden ? frame : replayControls.getBoundingClientRect();
  const boardLeft = Math.min(frame.left, transport.left);
  const boardRight = Math.max(frame.right, transport.right);
  const main = mainElement.getBoundingClientRect();
  const leftOf = (side, width) => (side === 'left' ? boardLeft - BOARD_SIDE_GAP - width : boardRight + BOARD_SIDE_GAP);
  const taken = new Set();
  for (const [sides, block] of blocks) {
    const width = block.getBoundingClientRect().width;
    const side = sides.find((s) => !taken.has(s)
      && leftOf(s, width) >= main.left + inset && leftOf(s, width) + width <= main.right - inset);
    if (side === undefined) continue;
    taken.add(side);
    block.classList.add('beside-board');
    block.style.left = (leftOf(side, width) - main.left) + 'px';
    block.style.top = (frame.top - main.top) + 'px';
  }
  // Under the board, this game's stats lead the first line of tables, beside
  // the summary column, where they fit there. Otherwise they float where the
  // line would have put them, under the summary, so the rank tables after
  // them still use the room beside it.
  if (stats !== null && !stats.classList.contains('beside-board')
      && stats.closest('.result-chart-section-tables') !== null
      && stats.getBoundingClientRect().top > stats.parentElement.getBoundingClientRect().top + 1) {
    stats.classList.add('below-first-line');
  }
}

// Justice callouts and the blocks beside the board belong to the board's
// rows: the history below starts after the lowest of them. The stats and
// replay legend have their own column and contribute no height here.
function syncResultClearance() {
  const sections = [pregenCharts, resultAnalysis, resultRanks];
  const areaBottom = gameArea.getBoundingClientRect().bottom;
  const overhangs = [...resultRanks.querySelectorAll('.beside-board')]
    .map((block) => block.getBoundingClientRect().bottom - areaBottom);
  if (!gameArea.classList.contains('trial-no-board') && justiceLive.childElementCount > 0) {
    overhangs.push(justiceLive.getBoundingClientRect().bottom - areaBottom);
  }
  const extra = Math.max(0, Math.ceil(Math.max(0, ...overhangs)));
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
  // Startup restores the saved state through here; only closing an open
  // editor hands focus back to its button.
  const wasOpen = !boardPositionPanel.hidden;
  rememberPanel('boardPosition', open);
  if (!open && stopBoardPositionDrag !== null) stopBoardPositionDrag();
  boardPositionPanel.hidden = !open;
  boardPositionDragSurface.hidden = !open;
  boardPositionButton.setAttribute('aria-expanded', String(open));
  syncBoardLayout();
  if (open) boardPositionDragSurface.focus({ preventScroll: true });
  else if (wasOpen) boardPositionButton.focus({ preventScroll: true });
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
    observer.observe(topBar);
    observer.observe(topRight);
    observer.observe(scoresNav);
    observer.observe(modeOptions);
    observer.observe(boardLabPanel);
    observer.observe(gameFrame);
    observer.observe(replayControls);
    observer.observe(resultsBox);
    observer.observe(justiceLive);
    observer.observe(difficultyTabs);
    observer.observe(boardPositionPanel);
  }
}

//-------ZOOM (the persistent cell size) and the pixel ratio beside it-------

// Pages cannot read the browser zoom: devicePixelRatio is the browser zoom
// times the system display scale (2 on a 200%-scaled display at browser
// zoom 100%), so it must not be labeled as the zoom. A media query on the
// current ratio fires once when it changes.
const pixelRatioValue = document.getElementById('pixel-ratio-value');

function renderPixelRatio() {
  const ratio = window.devicePixelRatio;
  pixelRatioValue.textContent = String(Number(ratio.toFixed(2)));
  repaintScatterDots();
  matchMedia('(resolution: ' + ratio + 'dppx)')
    .addEventListener('change', renderPixelRatio, { once: true });
}

function applyCellSize() {
  document.getElementById('zoom-select').value = String(settings.cellSize);
  document.documentElement.style.setProperty('--cell-size', settings.cellSize + 'px');
  applyBoardPosition();
  if (tracing()) recordLayout();
  syncJusticePlacement();
  placeBoardSides();
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
  renderPixelRatio();
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
