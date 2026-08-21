'use strict';

// Finished-board shape facts for the board-shape time lists.
// Edge cells have no wrap-around neighbors. Mines connect including
// diagonally (the same 8-neighborhood the numbers use).

function shapeNeighbors(index, width, height) {
  const x = index % width;
  const y = (index - x) / width;
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      result.push(ny * width + nx);
    }
  }
  return result;
}

function boardShapeOf(width, height, mineAt) {
  const n = width * height;
  if (mineAt.length !== n) {
    throw new Error('mine map length does not match width*height');
  }
  let maxAdjacent = 0;
  let hasSeven = false;
  let zeroCount = 0;
  for (let i = 0; i < n; i++) {
    if (mineAt[i]) continue;
    let adjacent = 0;
    for (const nb of shapeNeighbors(i, width, height)) {
      if (mineAt[nb]) adjacent++;
    }
    if (adjacent > maxAdjacent) maxAdjacent = adjacent;
    if (adjacent === 7) hasSeven = true;
    if (adjacent === 0) zeroCount++;
  }
  const seen = new Array(n).fill(false);
  let islandCount = 0;
  let largestIsland = 0;
  for (let i = 0; i < n; i++) {
    if (!mineAt[i] || seen[i]) continue;
    islandCount++;
    let size = 0;
    const stack = [i];
    seen[i] = true;
    while (stack.length > 0) {
      const j = stack.pop();
      size++;
      for (const nb of shapeNeighbors(j, width, height)) {
        if (!mineAt[nb] || seen[nb]) continue;
        seen[nb] = true;
        stack.push(nb);
      }
    }
    if (size > largestIsland) largestIsland = size;
  }
  return { maxAdjacent, hasSeven, zeroCount, islandCount, largestIsland };
}

const BoardShape = {
  neighbors: shapeNeighbors,
  of: boardShapeOf,
};

if (typeof module !== 'undefined' && module.exports) module.exports = BoardShape;
