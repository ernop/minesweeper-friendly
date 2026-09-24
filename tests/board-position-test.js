'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = require('./game-source.js').source;
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = source.indexOf('//-------PERSISTENT BOARD POSITION (pure constraint solver)-------');
const end = source.indexOf('//-------PERSISTENT BOARD POSITION END-------');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('board-position solver span markers not found');
}
vm.runInThisContext(source.slice(start, end), {
  filename: 'board-position-solver-span.js',
});

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log((ok ? '  ok  ' : 'FAIL  ') + name);
}

const base = {
  left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200,
};
const bounds = { left: 0, right: 800, top: 50 };

{
  const beforeScroll = boardPositionLayoutRect(base, 0, 0, false);
  const viewportAfterScroll = {
    left: 60, top: -200, right: 260, bottom: 0, width: 200, height: 200,
  };
  const afterScroll = boardPositionLayoutRect(
    viewportAfterScroll, 40, 300, false);
  check('ordinary layout coordinates do not change when the page scrolls',
    afterScroll.left === beforeScroll.left && afterScroll.top === beforeScroll.top);

  const fixed = boardPositionLayoutRect(base, 40, 300, true);
  check('fixed chrome keeps its scroll-zero exclusion coordinates',
    fixed.left === base.left && fixed.top === base.top);
}

{
  const result = constrainBoardOffset(base, bounds, [], 50, 30);
  check('safe preferred position is unchanged',
    result.x === 50 && result.y === 30 && !result.adjusted);
}

{
  const result = constrainBoardOffset(base, bounds, [], -500, -500);
  check('position is clamped inside the left and top bounds',
    result.x === -100 && result.y === -50 && result.adjusted);
}

{
  const exclusion = {
    left: 250, top: 80, right: 500, bottom: 400, width: 250, height: 320,
  };
  const result = constrainBoardOffset(base, bounds, [exclusion], 0, 0);
  const placed = boardPositionRect(base, result.x, result.y);
  check('nearby fixed chrome pushes the board to its closest clear side',
    result.x === -58 && boardPositionOverlapArea(placed, exclusion) === 0);
}

{
  const exclusion = {
    left: 100, top: 80, right: 500, bottom: 400, width: 400, height: 320,
  };
  const result = constrainBoardOffset(
    base, { left: 100, right: 800, top: 50 }, [exclusion], 0, 0);
  const placed = boardPositionRect(base, result.x, result.y);
  check('board stacks below chrome when neither horizontal side is available',
    result.y === 308 && boardPositionOverlapArea(placed, exclusion) === 0);
}

{
  const wide = {
    left: -50, top: 100, right: 850, bottom: 300, width: 900, height: 200,
  };
  const result = constrainBoardOffset(wide, bounds, [], 75, 0);
  check('an oversized board keeps intentional horizontal overflow',
    result.x === 75);
}

{
  const viewport = { left: 12, top: 12, right: 1188, bottom: 888 };
  const board = boardPositionRect(base, 300, 50);
  const panel = boardPositionPanelRect(board, 350, 170, viewport);
  check('editor opens directly beneath the board',
    panel.top === board.bottom + 10
      && panel.left + panel.width / 2 === board.left + board.width / 2);
  const moved = boardPositionPanelRect(boardPositionRect(board, 80, 120), 350, 170, viewport);
  check('editor follows both axes of board movement',
    moved.left - panel.left === 80 && moved.top - panel.top === 120);

  const lowered = boardPositionRect(board, 0, 480);
  const above = boardPositionPanelRect(lowered, 350, 170, viewport);
  check('editor stays next to the board above it near the bottom edge',
    above.bottom === lowered.top - 10 && boardPositionOverlapArea(above, lowered) === 0);

  const narrow = { left: 12, top: 12, right: 378, bottom: 788 };
  const narrowBoard = { left: 55, top: 90, right: 325, bottom: 420, width: 270, height: 330 };
  const narrowPanel = boardPositionPanelRect(narrowBoard, 350, 170, narrow);
  check('narrow screens keep the editor at the board instead of the viewport bottom',
    narrowPanel.top === narrowBoard.bottom + 10
      && narrowPanel.left >= narrow.left && narrowPanel.right <= narrow.right);

  for (const [name, rect] of [
    ['oversized board', { left: -500, top: -500, right: 1500, bottom: 1500, width: 2000, height: 2000 }],
    ['scrolled past board', boardPositionRect(narrowBoard, 0, -1000)],
    ['board below viewport', boardPositionRect(narrowBoard, 0, 1000)],
  ]) {
    const visible = boardPositionPanelRect(rect, 350, 170, narrow);
    check(name + ' keeps the entire editor inside the viewport',
      visible.left >= narrow.left && visible.top >= narrow.top
        && visible.right <= narrow.right && visible.bottom <= narrow.bottom);
  }
}

check('game frame stays centered when surrounding result width changes',
  /#game-frame\s*\{[^}]*width:\s*max-content;[^}]*margin-inline:\s*auto;/s.test(css));
check('beside game data the frame rests at the edge inset instead of centering',
  /#page-layout\.board-beside-game-data #game-frame\s*\{[^}]*margin-inline:\s*auto var\(--board-edge-inset\);/s.test(css)
    && source.includes("pageLayout.classList.toggle('board-beside-game-data', docked && gameDataColumnWanted())"));
check('offset constraints use the same edge inset as the resting frame',
  /#page-layout\s*\{[^}]*--board-edge-inset:\s*8px;/s.test(css)
    && source.includes("getPropertyValue('--board-edge-inset')")
    && !/mainRect\.(left|right) [+-] 8\b/.test(source));
check('position editor exposes independent horizontal and vertical values',
  html.includes('id="board-position-x-number"')
    && html.includes('id="board-position-y-number"'));
check('both position sliders show labeled notch scales',
  (html.match(/class="board-position-ticks"/g) || []).length === 2
    && html.includes('<span>-2000</span>')
    && html.includes('<span>2000</span>'));

console.log(failures === 0
  ? 'board-position: all checks passed'
  : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
