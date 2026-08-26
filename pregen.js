'use strict';

// Pure support for the "Pregen 10" play mode. Candidate boards are scored
// without touching game-page state, and only their seeds survive ranking so
// the selected board can be regenerated through the normal replayable stream.

function pregenNeighbors(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        result.push(ny * width + nx);
      }
    }
  }
  return result;
}

// 3BV as measured on minesweeper.online: one click for each connected zero
// region (including its numbered border), then one for every untouched number.
function board3BV(width, height, mineAt) {
  if (mineAt.length !== width * height) {
    throw new Error('mine map does not match the board');
  }
  const adjacent = new Array(mineAt.length).fill(0);
  for (let i = 0; i < mineAt.length; i++) {
    if (mineAt[i]) continue;
    adjacent[i] = pregenNeighbors(i, width, height)
      .reduce((count, n) => count + (mineAt[n] ? 1 : 0), 0);
  }

  const seen = new Array(mineAt.length).fill(false);
  let count = 0;
  for (let i = 0; i < mineAt.length; i++) {
    if (mineAt[i] || seen[i] || adjacent[i] !== 0) continue;
    count++;
    seen[i] = true;
    const stack = [i];
    while (stack.length > 0) {
      const j = stack.pop();
      for (const n of pregenNeighbors(j, width, height)) {
        if (mineAt[n] || seen[n]) continue;
        seen[n] = true;
        if (adjacent[n] === 0) stack.push(n);
      }
    }
  }
  for (let i = 0; i < mineAt.length; i++) {
    if (!mineAt[i] && !seen[i]) count++;
  }
  return count;
}

function rankSeeds(options) {
  const ranked = options.seeds.map((seed, ordinal) => {
    const mineAt = options.place(
      options.generator,
      options.width,
      options.height,
      options.mineCount,
      options.safeIndex,
      options.randomFromSeed(seed),
    );
    return {
      seed,
      bv3: board3BV(options.width, options.height, mineAt),
      ordinal,
    };
  });
  ranked.sort((a, b) => b.bv3 - a.bv3 || a.ordinal - b.ordinal);
  return ranked.map(({ seed, bv3 }) => ({ seed, bv3 }));
}

function chartWins(records, challengeStartedAt, dayStartedAt) {
  const wins = records.filter((record) => record.outcome === 'win');
  return {
    challenge: wins.filter((record) => record.endedAt >= challengeStartedAt),
    today: wins.filter((record) => record.endedAt >= dayStartedAt),
  };
}

function progressRows(completed) {
  const rows = completed.map(({ run, record }) => ({
    run,
    bv3: record.bv3,
    timeMs: record.timeMs,
    outcome: record.outcome,
  }));
  rows.sort((a, b) => a.run - b.run);
  if (rows.length > 0) rows[rows.length - 1].latest = true;
  return rows;
}

const Pregen = {
  board3BV,
  rankSeeds,
  chartWins,
  progressRows,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Pregen;
