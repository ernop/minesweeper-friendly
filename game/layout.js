'use strict';

// Board position (a pure constraint solver, its page wiring, and the position
// editor), zoom (cell size), and page layout: the full-width top stage with
// an adaptive details dock, Justice callout placement, and stage clearance.

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
// bounds keep a board that fits inside the full stage width; oversized
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

// Choose where the details column docks around the placed board inside the
// full-width top stage: the wider free flank (right on ties) when it holds at
// least `minimum` pixels, otherwise below the board at full stage width.
// Never moves the board.
function detailsDockPlacement(stageWidth, boardLeft, boardRight, minimum, gap, preferredWidth, narrowViewport) {
  const clampedLeft = Math.max(0, Math.min(stageWidth, boardLeft));
  const clampedRight = Math.max(clampedLeft, Math.min(stageWidth, boardRight));
  const leftRoom = Math.floor(clampedLeft - gap);
  const rightRoom = Math.floor(stageWidth - clampedRight - gap);
  const widestFlank = Math.max(leftRoom, rightRoom);
  if (narrowViewport || widestFlank < minimum) {
    return { dock: 'below', minimum, maximum: Math.max(0, Math.floor(stageWidth)), width: Math.max(0, Math.floor(stageWidth)) };
  }
  const dock = rightRoom >= leftRoom ? 'right' : 'left';
  const maximum = dock === 'right' ? rightRoom : leftRoom;
  const width = Math.max(minimum, Math.min(maximum, preferredWidth));
  return { dock, minimum, maximum, width };
}

//-------PERSISTENT BOARD POSITION END-------

//-------PAGE LAYOUT (applied position, adaptive details dock, clearance)-------

const boardPositionButton = document.getElementById('board-position-btn');
const boardPositionPanel = document.getElementById('board-position-panel');
const boardPositionX = document.getElementById('board-position-x');
const boardPositionXNumber = document.getElementById('board-position-x-number');
const boardPositionY = document.getElementById('board-position-y');
const boardPositionYNumber = document.getElementById('board-position-y-number');
const boardPositionXTicks = [...boardPositionX.parentElement.querySelectorAll('.board-position-ticks > span')];
const boardPositionYTicks = [...boardPositionY.parentElement.querySelectorAll('.board-position-ticks > span')];
const boardPositionDragSurface = document.getElementById('board-position-drag-surface');

const BOARD_OFFSET_X_LIMIT = 2000;
const BOARD_OFFSET_Y_MIN_LIMIT = -1000;
const BOARD_OFFSET_Y_MAX_LIMIT = 2000;
const DETAILS_DOCK_GAP = 18;
const REPLAY_CONTROLS_MIN_WIDTH = 340;
const BELOW_TWO_COLUMN_MIN_WIDTH = 900;

let appliedBoardOffsetX = 0;
let appliedBoardOffsetY = 0;
let boardPositionRange = {
  fitsHorizontally: true,
  minX: -BOARD_OFFSET_X_LIMIT,
  maxX: BOARD_OFFSET_X_LIMIT,
  minY: BOARD_OFFSET_Y_MIN_LIMIT,
  maxY: BOARD_OFFSET_Y_MAX_LIMIT,
};
let boardLayoutFrame = null;
let stopBoardPositionDrag = null;
let cachedLayoutConstants = null;

function readLayoutConstants() {
  if (cachedLayoutConstants === null) {
    const style = getComputedStyle(pageLayout);
    cachedLayoutConstants = {
      inset: parseFloat(style.getPropertyValue('--board-edge-inset')),
      sidebarMin: parseFloat(style.getPropertyValue('--game-sidebar-min-width')),
    };
  }
  return cachedLayoutConstants;
}

function setStyleProp(element, name, value) {
  if (element.style.getPropertyValue(name) !== value) {
    if (value === '') element.style.removeProperty(name);
    else element.style.setProperty(name, value);
  }
}

function setAttrIfChanged(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

// Board layout uses document coordinates so scrolling cannot move content.
function boardPageRect(element) {
  return boardPositionLayoutRect(
    element.getBoundingClientRect(), window.scrollX, window.scrollY, false);
}

function syncAxisSlider(rangeInput, numberInput, tickSpans, min, max, value) {
  const locked = min >= max;
  const minStr = String(min);
  const maxStr = String(max);
  const valStr = String(value);
  if (rangeInput.min !== minStr) rangeInput.min = minStr;
  if (rangeInput.max !== maxStr) rangeInput.max = maxStr;
  if (numberInput.min !== minStr) numberInput.min = minStr;
  if (numberInput.max !== maxStr) numberInput.max = maxStr;
  if (rangeInput.disabled !== locked) rangeInput.disabled = locked;
  if (numberInput.disabled !== locked) numberInput.disabled = locked;
  if (rangeInput.value !== valStr) rangeInput.value = valStr;
  if (numberInput.value !== valStr) numberInput.value = valStr;
  if (tickSpans.length === 5) {
    const labels = locked
      ? [minStr, '', '', '', maxStr]
      : [min, Math.round(min + (max - min) * 0.25), Math.round((min + max) / 2),
          Math.round(min + (max - min) * 0.75), max].map(String);
    tickSpans.forEach((span, i) => {
      if (span.textContent !== labels[i]) span.textContent = labels[i];
    });
  }
}

function syncBoardPositionInputs() {
  const xVal = Math.max(boardPositionRange.minX, Math.min(boardPositionRange.maxX, appliedBoardOffsetX));
  const yVal = Math.max(boardPositionRange.minY, Math.min(boardPositionRange.maxY, appliedBoardOffsetY));
  syncAxisSlider(boardPositionX, boardPositionXNumber, boardPositionXTicks,
    boardPositionRange.minX, boardPositionRange.maxX, xVal);
  syncAxisSlider(boardPositionY, boardPositionYNumber, boardPositionYTicks,
    boardPositionRange.minY, boardPositionRange.maxY, yVal);
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
  const frame = gameFrame.getBoundingClientRect();
  let anchor = frame;
  if (!replayControls.hidden) {
    const replay = replayControls.getBoundingClientRect();
    const left = Math.min(frame.left, replay.left);
    const top = Math.min(frame.top, replay.top);
    const right = Math.max(frame.right, replay.right);
    const bottom = Math.max(frame.bottom, replay.bottom);
    anchor = { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  const placed = boardPositionPanelRect(anchor,
    boardPositionPanel.offsetWidth, boardPositionPanel.offsetHeight, bounds);
  boardPositionPanel.style.left = placed.left + 'px';
  boardPositionPanel.style.top = placed.top + 'px';
}

// Measure the top stage once so board placement and adaptive details docking
// share one geometry snapshot without triggering interleaved reflows.
function measureTopStage() {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const stageClientRect = topStage.getBoundingClientRect();
  const stageRect = boardPositionLayoutRect(stageClientRect, scrollX, scrollY, false);
  const trialNoBoard = gameArea.classList.contains('trial-no-board');
  const frameClientRect = trialNoBoard ? null : gameFrame.getBoundingClientRect();
  const frameRect = frameClientRect === null ? null
    : boardPositionLayoutRect(frameClientRect, scrollX, scrollY, false);
  const setupBottom = Math.max(...[pageHead, modeOptions, boardLabPanel]
    .filter((row) => !row.hidden)
    .map((row) => row.getBoundingClientRect().bottom + scrollY));
  return { scrollX, scrollY, stageClientRect, stageRect, trialNoBoard, frameClientRect, frameRect, setupBottom };
}

// A trial's lobby and review show no board, so nothing is placed: the hidden
// frame measures as an empty box at the page origin, and constraining that
// box would push the offset further on every layout pass.
function boardPositionOffset(snapshot = measureTopStage()) {
  if (snapshot.trialNoBoard) {
    return { x: 0, y: 0, range: boardPositionRange, snapshot };
  }
  const { inset } = readLayoutConstants();
  const base = boardPositionRect(snapshot.frameRect, -appliedBoardOffsetX, -appliedBoardOffsetY);
  const viewportRight = Math.max(inset, window.innerWidth - inset);
  let left = Math.max(inset, snapshot.stageRect.left + inset);
  let right = Math.min(viewportRight, snapshot.stageRect.right - inset);
  if (right < left) {
    left = snapshot.stageRect.left;
    right = snapshot.stageRect.right;
  }
  const bounds = { left, right, top: snapshot.setupBottom + inset };
  const placed = constrainBoardOffset(base, bounds, [], settings.boardOffsetX, settings.boardOffsetY);
  const fitsHorizontally = base.width <= Math.max(0, bounds.right - bounds.left);
  let minX = fitsHorizontally ? Math.max(-BOARD_OFFSET_X_LIMIT, Math.ceil(bounds.left - base.left)) : -BOARD_OFFSET_X_LIMIT;
  let maxX = fitsHorizontally ? Math.min(BOARD_OFFSET_X_LIMIT, Math.floor(bounds.right - base.right)) : BOARD_OFFSET_X_LIMIT;
  if (minX > maxX) {
    minX = placed.x;
    maxX = placed.x;
  }
  const minY = Math.max(BOARD_OFFSET_Y_MIN_LIMIT, Math.min(0, Math.ceil(bounds.top - base.top)));
  return {
    ...placed,
    range: { fitsHorizontally, minX, maxX, minY, maxY: BOARD_OFFSET_Y_MAX_LIMIT },
    snapshot,
  };
}

function applyBoardPosition(snapshot = measureTopStage()) {
  if (settings === null) return null;
  const placed = boardPositionOffset(snapshot);
  const prevX = appliedBoardOffsetX;
  appliedBoardOffsetX = placed.x;
  appliedBoardOffsetY = placed.y;
  boardPositionRange = placed.range;
  setStyleProp(gameArea, '--board-position-applied-x', placed.x === 0 ? '' : placed.x + 'px');
  setStyleProp(gameArea, '--board-position-applied-y', placed.y === 0 ? '' : placed.y + 'px');
  setStyleProp(gameArea, '--board-position-flow-clearance', placed.y <= 0 ? '' : placed.y + 'px');

  if (!boardPositionDragSurface.hidden) {
    boardPositionDragSurface.style.left = gameFrame.offsetLeft + 'px';
    boardPositionDragSurface.style.top = gameFrame.offsetTop + 'px';
    boardPositionDragSurface.style.width = gameFrame.offsetWidth + 'px';
    boardPositionDragSurface.style.height = gameFrame.offsetHeight + 'px';
  }
  if (!boardPositionPanel.hidden) {
    syncBoardPositionInputs();
    placeBoardPositionPanel();
  }
  return { ...placed, deltaX: placed.x - prevX };
}

function syncReplayBounds(snapshot) {
  // Keep transport sizing variables directly on #replay-controls so changing
  // them never invalidates the board's cell grid.
  setStyleProp(replayControls, '--stage-width', Math.round(snapshot.stageClientRect.width) + 'px');
  if (snapshot.frameClientRect !== null) {
    setStyleProp(replayControls, '--board-frame-width', Math.round(snapshot.frameClientRect.width) + 'px');
  }
}

function syncBoardLayout() {
  if (settings === null) return;
  const snapshot = measureTopStage();
  syncReplayBounds(snapshot);
  const placed = applyBoardPosition(snapshot);
  syncGameSidebar(snapshot, placed ? placed.deltaX : 0);
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

// Game data's chart takes the docked column height left below the summary,
// controls, and live perf charts, so the options row under it stays in view.
// Each open side keeps a readable plot's height; a column too short for that
// scrolls instead of crushing them. Below the board, game data flows at full
// readable height (matching live perf charts when side by side).
const GAME_DATA_SIDE_MIN_HEIGHT = 240;
const GAME_DATA_SUBVIEW_MIN_HEIGHT = 480;
const GAME_DATA_BAND_COMPACT_MAX_HEIGHT = 580;

// Cap the docked column's height to the board area when game data's percentile
// band stands alone (live perf charts absent or closed), so a short band does
// not stretch below the board and leave an empty gap above the tables.
function syncDetailsDockMaxHeight(stageDocTop = null, boardAreaHeight = null) {
  const docked = topStage.dataset.detailsDock === 'left' || topStage.dataset.detailsDock === 'right';
  if (!docked) {
    setStyleProp(gameSidebar, '--details-dock-max-height', '');
    return;
  }
  const top = stageDocTop !== null ? stageDocTop : topStage.getBoundingClientRect().top + window.scrollY;
  const viewportRoom = Math.max(480, Math.floor(window.innerHeight - top - 16));
  let maxHeight = viewportRoom;
  if (!resultsBox.hidden && !settings.gameDataDistributions
      && resultStats.querySelector('.board-time-profile') !== null) {
    const duringEl = resultStats.querySelector('.during-game');
    const duringOpen = duringEl !== null
      && duringEl.querySelector(':scope > .stat-section-body:not([hidden])') !== null;
    if (!duringOpen) {
      const areaHeight = boardAreaHeight !== null ? boardAreaHeight : gameArea.offsetHeight;
      maxHeight = Math.min(viewportRoom, Math.max(GAME_DATA_BAND_COMPACT_MAX_HEIGHT, areaHeight));
    }
  }
  setStyleProp(gameSidebar, '--details-dock-max-height', maxHeight + 'px');
}

function fitGameDataToSidebar(syncDockHeight = true) {
  const profile = resultStats.querySelector('.board-time-profile');
  if (profile === null || resultsBox.hidden || !profile.checkVisibility()) return;
  const below = topStage.dataset.detailsDock === 'below';
  let targetHeight = '';
  if (below) {
    const sibling = resultStats.querySelector('.during-game');
    const siblingHeight = topStage.dataset.belowColumns === '2' && sibling !== null && sibling.checkVisibility()
      ? Math.floor(sibling.getBoundingClientRect().height) : 0;
    if (profile.dataset.screen !== 'chart') {
      targetHeight = Math.max(GAME_DATA_SUBVIEW_MIN_HEIGHT, siblingHeight) + 'px';
    } else {
      const section = profile.querySelector('.game-data-section.open');
      if (section !== null) {
        const fixed = profile.getBoundingClientRect().height - section.getBoundingClientRect().height;
        const openSides = Number(section.dataset.openSides);
        const needed = Math.ceil(fixed) + openSides * GAME_DATA_SIDE_MIN_HEIGHT;
        targetHeight = (siblingHeight > 0
          ? Math.max(needed, siblingHeight)
          : Math.max(needed, Math.min(620, Math.round(window.innerHeight * 0.65)))) + 'px';
      }
    }
  } else {
    if (syncDockHeight) syncDetailsDockMaxHeight();
    const column = getComputedStyle(gameSidebar);
    const offset = profile.getBoundingClientRect().top - gameSidebar.getBoundingClientRect().top + gameSidebar.scrollTop;
    const bottom = parseFloat(column.maxHeight) - parseFloat(column.paddingBottom) - parseFloat(column.borderBottomWidth);
    const room = Math.floor(bottom - offset);
    if (profile.dataset.screen !== 'chart') {
      targetHeight = Math.max(GAME_DATA_SUBVIEW_MIN_HEIGHT, room) + 'px';
    } else {
      const section = profile.querySelector('.game-data-section.open');
      if (section !== null) {
        const fixed = profile.getBoundingClientRect().height - section.getBoundingClientRect().height;
        const openSides = Number(section.dataset.openSides);
        targetHeight = Math.max(Math.ceil(fixed) + openSides * GAME_DATA_SIDE_MIN_HEIGHT, room) + 'px';
      }
    }
  }
  if (profile.style.height !== targetHeight) profile.style.height = targetHeight;
}

// Adaptive details dock around the placed board inside #top-stage:
// docks into the wider free flank (right on ties) when at least 320 px fits,
// and drops directly below the board at full width otherwise. The footprint
// always reserves the replay transport's minimum width so ending a small
// board never shifts the docked panel.
function detailsColumnFit(snapshot = null, deltaX = 0) {
  const stageRect = snapshot !== null ? snapshot.stageClientRect : topStage.getBoundingClientRect();
  const { sidebarMin: minimum } = readLayoutConstants();
  let boardLeft;
  let boardRight;
  if (gameArea.classList.contains('trial-no-board')) {
    const trialRect = document.getElementById('trial-stage').getBoundingClientRect();
    const width = Math.max(trialRect.width, REPLAY_CONTROLS_MIN_WIDTH);
    boardLeft = (stageRect.width - width) / 2;
    boardRight = (stageRect.width + width) / 2;
  } else {
    const frame = snapshot !== null && snapshot.frameClientRect !== null
      ? snapshot.frameClientRect : gameFrame.getBoundingClientRect();
    const footprint = Math.max(frame.width, REPLAY_CONTROLS_MIN_WIDTH);
    const center = (frame.left + frame.right) / 2 + deltaX - stageRect.left;
    boardLeft = center - footprint / 2;
    boardRight = center + footprint / 2;
  }
  return detailsDockPlacement(
    stageRect.width,
    boardLeft,
    boardRight,
    minimum,
    DETAILS_DOCK_GAP,
    Math.round(settings.detailsColumnShare * window.innerWidth),
    window.innerWidth <= 700);
}

function detailsColumnWidth(fit, share) {
  return Math.max(fit.minimum, Math.min(fit.maximum, Math.round(share * window.innerWidth)));
}

function syncGameSidebar(snapshot = null, deltaX = 0) {
  const fit = detailsColumnFit(snapshot, deltaX);
  const dock = fit.dock;
  const docked = dock !== 'below';
  if (topStage.dataset.detailsDock !== dock) topStage.dataset.detailsDock = dock;
  const hideResults = resultStats.childElementCount === 0;
  if (resultsBox.hidden !== hideResults) resultsBox.hidden = hideResults;
  if (docked) {
    const widthVal = fit.width + 'px';
    setStyleProp(gameSidebar, '--details-dock-width', widthVal);
    setStyleProp(detailsResize, '--details-dock-width', widthVal);
    syncDetailsDockMaxHeight(snapshot !== null ? snapshot.stageRect.top : null);
    if ('belowColumns' in topStage.dataset) delete topStage.dataset.belowColumns;
  } else {
    setStyleProp(gameSidebar, '--details-dock-width', '');
    setStyleProp(detailsResize, '--details-dock-width', '');
    setStyleProp(gameSidebar, '--details-dock-max-height', '');
    if (detailsResize.style.height !== '') detailsResize.style.height = '';
    if (topStage.style.minHeight !== '') topStage.style.minHeight = '';
    const cols = fit.width >= BELOW_TWO_COLUMN_MIN_WIDTH && resultStats.childElementCount >= 2 ? '2' : '1';
    if (topStage.dataset.belowColumns !== cols) topStage.dataset.belowColumns = cols;
  }
  if (detailsResize.hidden !== !docked) detailsResize.hidden = !docked;
  setAttrIfChanged(detailsResize, 'aria-valuemin', String(fit.minimum));
  setAttrIfChanged(detailsResize, 'aria-valuemax', String(fit.maximum));
  setAttrIfChanged(detailsResize, 'aria-valuenow', String(fit.width));
  fitGameDataToSidebar(false);
}

// The docked column's board-facing edge grip sits in the gap between the
// column and the board, at the column's height. The column and its charts
// follow the pointer on the next animation frame; release saves the share.
// The board never moves during a drag, so the flank limits are fixed at start.
const detailsResize = document.getElementById('details-resize');
const DETAILS_RESIZE_KEY_STEP = 10;
let sidebarClearanceFrame = null;
new ResizeObserver((entries) => {
  if (settings === null) return;
  const entry = entries[entries.length - 1];
  const box = entry.borderBoxSize && entry.borderBoxSize[0];
  const blockSize = box ? box.blockSize : null;
  // Defer the ancestor min-height update to the next frame so mutating
  // #top-stage (shallower than #game-sidebar and observed for width changes)
  // never triggers a ResizeObserver undelivered-notifications error.
  if (sidebarClearanceFrame !== null) cancelAnimationFrame(sidebarClearanceFrame);
  sidebarClearanceFrame = requestAnimationFrame(() => {
    sidebarClearanceFrame = null;
    syncResultClearance(blockSize);
  });
}).observe(gameSidebar);

function setDetailsColumnWidth(fit, width) {
  settings.detailsColumnShare = Math.max(fit.minimum, Math.min(fit.maximum, width)) / window.innerWidth;
}

detailsResize.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const fit = detailsColumnFit();
  if (fit.dock === 'below') return;
  const sign = fit.dock === 'left' ? 1 : -1;
  const step = (event.key === 'ArrowRight' ? 1 : -1) * sign * DETAILS_RESIZE_KEY_STEP;
  setDetailsColumnWidth(fit, detailsColumnWidth(fit, settings.detailsColumnShare) + step);
  saveSettings();
  syncBoardLayout();
});

detailsResize.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const fit = detailsColumnFit();
  if (fit.dock === 'below') return;
  event.preventDefault();
  detailsResize.setPointerCapture(event.pointerId);
  detailsResize.classList.add('dragging');
  const sign = fit.dock === 'left' ? 1 : -1;
  const startX = event.clientX;
  const startWidth = detailsColumnWidth(fit, settings.detailsColumnShare);
  let frame = null;
  const move = (ev) => {
    setDetailsColumnWidth(fit, startWidth + sign * (ev.clientX - startX));
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
  if (justiceLive.childElementCount === 0) {
    if (justiceLive.classList.contains('justice-left') || justiceLive.classList.contains('justice-below')) {
      justiceLive.classList.remove('justice-left', 'justice-below');
    }
    return;
  }
  justiceLive.classList.remove('justice-left', 'justice-below');
  const mainRect = boardPageRect(mainElement);
  const { inset } = readLayoutConstants();
  const docked = topStage.dataset.detailsDock === 'left' || topStage.dataset.detailsDock === 'right';
  const dockRect = docked ? boardPageRect(gameSidebar) : null;
  const collides = (rect) => rect.left < mainRect.left + inset
    || rect.right > mainRect.right - inset
    || (dockRect !== null && boardPositionOverlapArea(rect, {
      left: dockRect.left - inset,
      top: dockRect.top - inset,
      right: dockRect.right + inset,
      bottom: dockRect.bottom + inset,
    }) > 0);

  if (!collides(boardPageRect(justiceLive))) return;
  justiceLive.classList.add('justice-left');
  if (!collides(boardPageRect(justiceLive))) return;
  justiceLive.classList.remove('justice-left');
  justiceLive.classList.add('justice-below');
}

// Keep every section below #top-stage clear of both the docked details panel
// and any Justice callout hanging below the board, without moving the board.
// Also keeps the resize grip's height matched to the docked details panel.
function syncResultClearance(measuredSidebarHeight = null) {
  const docked = topStage.dataset.detailsDock === 'left' || topStage.dataset.detailsDock === 'right';
  if (docked) {
    const sidebarHeight = measuredSidebarHeight !== null ? measuredSidebarHeight : gameSidebar.offsetHeight;
    let needed = sidebarHeight;
    if (!gameArea.classList.contains('trial-no-board') && justiceLive.childElementCount > 0) {
      needed = Math.max(needed, justiceLive.getBoundingClientRect().bottom - topStage.getBoundingClientRect().top);
    }
    const gripHeight = Math.ceil(sidebarHeight) + 'px';
    if (detailsResize.style.height !== gripHeight) detailsResize.style.height = gripHeight;
    if (gameSidebar.style.marginTop !== '') gameSidebar.style.removeProperty('margin-top');
    const target = needed > 0 ? Math.ceil(needed) + 'px' : '';
    if (topStage.style.minHeight !== target) topStage.style.minHeight = target;
  } else {
    if (detailsResize.style.height !== '') detailsResize.style.height = '';
    if (topStage.style.minHeight !== '') topStage.style.minHeight = '';
    let extra = 0;
    if (!gameArea.classList.contains('trial-no-board') && justiceLive.childElementCount > 0) {
      extra = Math.max(0, Math.ceil(justiceLive.getBoundingClientRect().bottom - gameArea.getBoundingClientRect().bottom));
    }
    const margin = extra > 0 ? (16 + extra) + 'px' : '';
    if (gameSidebar.style.marginTop !== margin) gameSidebar.style.marginTop = margin;
  }
}

//-------BOARD POSITION EDITOR (the position panel controls)-------

function setBoardPositionPreference(x, y, persist) {
  settings.boardOffsetX = Math.max(-BOARD_OFFSET_X_LIMIT, Math.min(BOARD_OFFSET_X_LIMIT, Math.round(x)));
  settings.boardOffsetY = Math.max(BOARD_OFFSET_Y_MIN_LIMIT, Math.min(BOARD_OFFSET_Y_MAX_LIMIT, Math.round(y)));
  syncBoardLayout();
  if (persist) saveSettings();
}

function setBoardPositionEditing(open, options = {}) {
  // Startup restores the saved state through here; only closing an open
  // editor hands focus back to its button, and only a user click from below
  // scrolls an off-screen board into view.
  const wasOpen = !boardPositionPanel.hidden;
  rememberPanel('boardPosition', open);
  if (!open && stopBoardPositionDrag !== null) stopBoardPositionDrag();
  boardPositionPanel.hidden = !open;
  boardPositionDragSurface.hidden = !open;
  boardPositionButton.setAttribute('aria-expanded', String(open));
  if (open && options.scrollToBoard && !gameArea.classList.contains('trial-no-board')) {
    const rect = gameFrame.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      gameFrame.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }
  syncBoardLayout();
  if (open) boardPositionDragSurface.focus({ preventScroll: true });
  else if (wasOpen) boardPositionButton.focus({ preventScroll: true });
}

function bindBoardPositionInput(range, number, axis) {
  const apply = (source, persist) => {
    if (source.value === '' || !Number.isFinite(Number(source.value))) return;
    const value = Number(source.value);
    const x = axis === 'x' ? value : appliedBoardOffsetX;
    const y = axis === 'y' ? value : appliedBoardOffsetY;
    setBoardPositionPreference(x, y, persist);
  };
  range.addEventListener('input', () => apply(range, false));
  range.addEventListener('change', () => apply(range, true));
  number.addEventListener('change', () => apply(number, true));
}

function initBoardPositionControls() {
  syncBoardPositionInputs();
  boardPositionButton.addEventListener('click', () => {
    setBoardPositionEditing(boardPositionPanel.hidden, { scrollToBoard: true });
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
    const nextX = appliedBoardOffsetX + dx * scale;
    const nextY = appliedBoardOffsetY + dy * scale;
    const clampedX = boardPositionRange.fitsHorizontally
      ? Math.max(boardPositionRange.minX, Math.min(boardPositionRange.maxX, nextX)) : nextX;
    const clampedY = Math.max(boardPositionRange.minY, Math.min(boardPositionRange.maxY, nextY));
    setBoardPositionPreference(clampedX, clampedY, true);
  });

  boardPositionDragSurface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || stopBoardPositionDrag !== null) return;
    event.preventDefault();
    boardPositionDragSurface.focus({ preventScroll: true });
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = appliedBoardOffsetX;
    const originY = appliedBoardOffsetY;
    const range = boardPositionRange;
    const move = (ev) => {
      if (ev.pointerId !== event.pointerId) return;
      const nextX = originX + ev.clientX - startX;
      const nextY = originY + ev.clientY - startY;
      const clampedX = range.fitsHorizontally
        ? Math.max(range.minX, Math.min(range.maxX, nextX)) : nextX;
      const clampedY = Math.max(range.minY, Math.min(range.maxY, nextY));
      setBoardPositionPreference(clampedX, clampedY, false);
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
    let lastStageWidth = -1;
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (entry.target === topStage) {
          const width = Math.round(entry.contentRect.width);
          if (width !== lastStageWidth) {
            lastStageWidth = width;
            changed = true;
          }
        } else {
          changed = true;
        }
      }
      if (changed) scheduleBoardLayout();
    });
    observer.observe(topStage);
    observer.observe(pageHead);
    observer.observe(modeOptions);
    observer.observe(boardLabPanel);
    observer.observe(gameFrame);
    observer.observe(justiceLive);
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

function applyCellSize(layout = true) {
  document.getElementById('zoom-select').value = String(settings.cellSize);
  document.documentElement.style.setProperty('--cell-size', settings.cellSize + 'px');
  if (layout) syncBoardLayout();
  if (tracing()) recordLayout();
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
  applyCellSize(false);
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
