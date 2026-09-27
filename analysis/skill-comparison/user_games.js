'use strict';
// Convert the player's exported Expert wins into the shared game format
// (see corpus_actions.py). Inputs are the game's own exports: the history
// export (export history) and the traces export (export traces). Input kinds
// come from TrainingCore.replay, the same replay the training page uses.
//
// Usage: node user_games.js HISTORY.json TRACES.json OUT.jsonl

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const TrainingCore = require(path.join(REPO, 'training-core.js'));
const Solver = require(path.join(REPO, 'solver.js'));
const GameRandom = require(path.join(REPO, 'rng.js'));

const KINDS = {
  'first-reveal': 'reveal', reveal: 'reveal', 'chord-multi': 'chord', 'chord-single': 'chord',
  flag: 'flag', unflag: 'unflag',
};
// Layout events measure #board's border box; its border is a bevel of one
// eighth of a cell (style.css --bevel-size), so the cell grid is inset by it.
const BOARD_BORDER_CELLS = 1 / 8;
// Every click's recorded position must lie within this distance of its own
// cell under that geometry (sub-pixel rounding), or the game is not emitted.
const CLICK_CELL_TOLERANCE_PX = 1;

function layoutAt(layouts, t) {
  let current = null;
  for (const layout of layouts) {
    if (layout.t > t) break;
    current = layout;
  }
  if (current === null) throw new Error('sample before the first layout event');
  return current;
}

function cellPx(layout) {
  return [layout.width / (layout.boardWidth + 2 * BOARD_BORDER_CELLS),
    layout.height / (layout.boardHeight + 2 * BOARD_BORDER_CELLS)];
}

function toCells(layout, x, y) {
  const [w, h] = cellPx(layout);
  return [(x - layout.left) / w - BOARD_BORDER_CELLS, (y - layout.top) / h - BOARD_BORDER_CELLS];
}

function pxOutsideCell(layout, e, width) {
  const [w, h] = cellPx(layout);
  const [cx, cy] = toCells(layout, e.x, e.y);
  const dx = (cx - (e.index % width)) * w;
  const dy = (cy - Math.floor(e.index / width)) * h;
  return Math.max(dx < 0 ? -dx : Math.max(0, dx - w), dy < 0 ? -dy : Math.max(0, dy - h));
}

function convert(record, trace, deps) {
  const replay = TrainingCore.replay(trace, 'win', TrainingCore.BOARD, deps);
  if (replay.status !== 'replayed') return { status: replay.status };
  const layouts = trace.events.filter((e) => e.kind === 'layout');
  const width = TrainingCore.BOARD.width;
  for (const e of trace.events) {
    if ((e.kind !== 'lup' && e.kind !== 'rdown') || !Number.isInteger(e.index)) continue;
    if (pxOutsideCell(layoutAt(layouts, e.t), e, width) > CLICK_CELL_TOLERANCE_PX) return { status: 'layout-mismatch' };
  }
  const t0 = replay.steps.find((s) => s.kind === 'first-reveal').t;
  const actions = replay.steps.filter((s) => s.t >= t0).map((s) => [
    Math.round((s.t - t0) * 10) / 10, s.index % width, Math.floor(s.index / width),
    KINDS[s.kind] || 'noop']);
  const samples = [];
  for (let i = 0; i < trace.sampleT.length; i++) {
    const t = trace.sampleT[i];
    if (t < t0) continue;
    const [cx, cy] = toCells(layoutAt(layouts, t), trace.sampleX[i], trace.sampleY[i]);
    samples.push([Math.round((t - t0) * 10) / 10, cx, cy]);
  }
  const firstReveal = replay.steps.find((s) => s.kind === 'first-reveal').index;
  const mines = trace.finalBoard !== undefined ? trace.finalBoard.cells.map((c) => (c.mine ? '1' : '0')).join('')
    : deps.randomPlacement(width, TrainingCore.BOARD.height, TrainingCore.BOARD.mines, firstReveal,
      deps.fromSeed(trace.seed)).map((m) => (m ? '1' : '0')).join('');
  return { status: 'converted', game: { source: 'self', id: String(record.endedAt), player: 'self',
    timeMs: record.timeMs, bv3: record.bv3, cellPx: cellPx(layouts[layouts.length - 1])[0], mines, actions, samples } };
}

function main() {
  const [historyPath, tracesPath, outPath] = process.argv.slice(2);
  const history = JSON.parse(fs.readFileSync(historyPath));
  const traces = new Map(JSON.parse(fs.readFileSync(tracesPath)).map((t) => [t.endedAt, t]));
  const deps = { randomPlacement: Solver.randomPlacement, fromSeed: GameRandom.fromSeed, rngVersion: GameRandom.VERSION };
  const status = {};
  const lines = [];
  for (const record of history[TrainingCore.KEY]) {
    if (record.outcome !== 'win') continue;
    const trace = traces.get(record.endedAt);
    if (trace === undefined) {
      status['no-trace'] = (status['no-trace'] || 0) + 1;
      continue;
    }
    const result = convert(record, trace, deps);
    status[result.status] = (status[result.status] || 0) + 1;
    if (result.status === 'converted') lines.push(JSON.stringify(result.game));
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log('expert wins:', status);
}

main();
