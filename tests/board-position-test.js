'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
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

console.log(failures === 0
  ? 'board-position: all checks passed'
  : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
