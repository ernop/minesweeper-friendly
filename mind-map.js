'use strict';

// Cross-size trace mind-map, visual technique catalog, mentation profile,
// ranked performance traits, automatic notable highlights, and single-game
// thinking reconstruction (docs/product/training.md;
// reference/mentation-model-2026-11-26.md).
//
// Pure computation: runs in mind-map-worker.js off the page thread and in
// Node tests. Never touches the DOM or IndexedDB directly.

if (typeof module !== 'undefined' && module.exports) {
  if (typeof GuardianAngel === 'undefined') globalThis.GuardianAngel = require('./guardian-angel.js');
  if (typeof TrainingCore === 'undefined') globalThis.TrainingCore = require('./training-core.js');
}

const MIND_MAP_KEYS = Object.freeze({
  '9x9/10@standard': Object.freeze({ level: 'Beginner', width: 9, height: 9, mines: 10 }),
  '16x16/40@standard': Object.freeze({ level: 'Intermediate', width: 16, height: 16, mines: 40 }),
  '30x16/99@standard': Object.freeze({ level: 'Expert', width: 30, height: 16, mines: 99 }),
});

const MIND_MAP_SAMPLE_CAPS = Object.freeze({
  Beginner: 100,
  Intermediate: 100,
  Expert: 80,
  ExpertLoss: 60,
});

const MIND_MAP_MODEL_VERSION = 'mentation-v1';
const MIND_MAP_RECENT_EXPERT_TRACES = 12;
const MIND_MAP_RECENT_LOSS_TRACES = 8;
const MIND_MAP_LOSS_MIN_MS = 20000;
const MIND_MAP_BOARD_BORDER_CELLS = 1 / 8;
const MIND_MAP_MIN_GAP_MS = 35;
const MIND_MAP_MAX_GAP_MS = 15000;
const MIND_MAP_SLOW_MS = 600;
const MIND_MAP_FLUENT_MS = 240;
const MIND_MAP_BASELINE_MS = 300;
const MIND_MAP_BAIL_MED_MS = 450;
const MIND_MAP_BAIL_EASY_PCT = 50;
const MIND_MAP_HOVER_CHECK_MS = 220;
const MIND_MAP_HOVER_NEAR_CELLS = 1.6;
const MIND_MAP_HOVER_LEAVE_CELLS = 2.5;
const MIND_MAP_REVERSAL_PX = 45;
const MIND_MAP_REVERSAL_COS = -0.6427876096865394; // cos(130 deg)
const MIND_MAP_BURST_WINDOW_MS = 1000;
const MIND_MAP_DETOUR_MS = 120;
const MIND_MAP_DETOUR_RADIUS = 1.2;
const MIND_MAP_DETOUR_DIST = 2.0;
const MIND_MAP_EYES_AHEAD_DEPART_MS = 45;
const MIND_MAP_CHUNK_MAX_GAP_MS = 380;
const MIND_MAP_DRIFT_MIN_GAP_MS = 450;
const MIND_MAP_HOVER_SPEED = 2.0; // cells/s
const MIND_MAP_FAST_SPEED = 10.0; // cells/s

// Compact board diagram builder from row strings:
//   '.' = covered square     'S' = covered square (proven safe target)
//   'M' = covered square (proven mine target)
//   'F' = flagged square     '_' = open blank (0)
//   '1'..'8' = open number   'C' = open number (chord target, value in chordNum)
//   '?' = unproven guess target
function mindMapDiagram(rows, walls = [], chordNum = 1) {
  const height = rows.length;
  const width = rows[0].length;
  const cells = [];
  for (let y = 0; y < height; y++) {
    const line = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = line[x];
      if (ch === '.') cells.push({ kind: 'covered' });
      else if (ch === 'S') cells.push({ kind: 'covered', mark: 'safe' });
      else if (ch === 'M') cells.push({ kind: 'covered', mark: 'mine' });
      else if (ch === '?') cells.push({ kind: 'covered', mark: 'guess' });
      else if (ch === 'F') cells.push({ kind: 'flag' });
      else if (ch === '_') cells.push({ kind: 'open', num: 0 });
      else if (ch === 'C') cells.push({ kind: 'open', num: chordNum, mark: 'chord' });
      else cells.push({ kind: 'open', num: Number(ch) });
    }
  }
  return Object.freeze({ width, height, walls: Object.freeze([...walls]), cells: Object.freeze(cells) });
}

// Canonical technique catalog with classic Minesweeper visual diagrams.
// Every logical diagram below is checked against GuardianAngel.proveLevels
// by tests/mind-map-test.js so no diagram can misstate a rule.
const MIND_MAP_TECHNIQUES = Object.freeze([
  {
    id: 'corner-1-3-1',
    label: '1-3-1 inner corner',
    tier: 'coupled',
    help: 'A 3 at an inner corner wedged between two 1s forces the outer corner mine and both far side squares safe.',
    diagram: mindMapDiagram(['..M.M', '.213.', '.1_1.', '.212S', '.....']),
  },
  {
    id: 'all-numbers',
    label: 'Multi-clue linked shape',
    tier: 'coupled',
    help: 'Three or more interacting numbers prove a square without using the board mine total.',
    diagram: mindMapDiagram(['.M..S', '.213.', '.1_1.', '.212.', '.....']),
  },
  {
    id: 'mine-total',
    label: 'Mine-count endgame',
    tier: 'coupled',
    help: 'Only the remaining mine counter settles which covered squares are safe or mines.',
    diagram: mindMapDiagram(['__1M', '__1S', '____'], ['top', 'right']),
  },
  {
    id: 'overlap-chain-flag',
    label: 'Overlap chain flag',
    tier: 'overlap',
    help: 'Flagging a mine proved only after chaining two or more overlap steps together.',
    diagram: mindMapDiagram(['..M.', '1221', '____'], ['left', 'right']),
  },
  {
    id: 'overlap-chain-reveal',
    label: 'Overlap chain reveal',
    tier: 'overlap',
    help: 'Opening a safe square proved by chaining two or more overlap steps together.',
    diagram: mindMapDiagram(['.MMS', '1221', '____'], ['left', 'right']),
  },
  {
    id: 'flag-edge-1-2-1',
    label: 'Straight-edge 1-2-1 flag',
    tier: 'overlap',
    help: 'A straight line 1-2-1 along an open side puts mines outside the 2 (over the two 1s).',
    diagram: mindMapDiagram(['.M.M.', '.121.', '.____']),
  },
  {
    id: 'reveal-edge-1-2-1',
    label: 'Straight-edge 1-2-1 reveal',
    tier: 'overlap',
    help: 'The square directly over the middle 2 in a straight 1-2-1 is always safe.',
    diagram: mindMapDiagram(['..S..', '.121.', '.____']),
  },
  {
    id: 'flag-edge-1-2-2-1',
    label: 'Straight-edge 1-2-2-1 flag',
    tier: 'overlap',
    help: 'A straight line 1-2-2-1 puts mines directly over both 2s.',
    diagram: mindMapDiagram(['.MM.', '1221', '____']),
  },
  {
    id: 'flag-1-2-interior',
    label: 'Interior 1-2 flag',
    tier: 'overlap',
    help: 'A 1 beside a 2 away from the wall forces the extra square beside the 2 to be a mine.',
    diagram: mindMapDiagram(['...M', 'F12.', '____']),
  },
  {
    id: 'reveal-1-2-interior',
    label: 'Interior 1-2 reveal',
    tier: 'overlap',
    help: 'A 1 beside a 2 away from the wall forces the extra square beside the 1 to be safe.',
    diagram: mindMapDiagram(['S...', '.12F', '____']),
  },
  {
    id: 'flag-1-2-wall',
    label: 'Wall 1-2 flag',
    tier: 'overlap',
    help: 'A 1 against an edge beside a 2 puts a mine in the third square of the 2.',
    diagram: mindMapDiagram(['..M.', '12..', '____'], ['left']),
  },
  {
    id: 'reveal-1-2-wall',
    label: 'Wall 1-2 reveal',
    tier: 'overlap',
    help: 'After placing or reading a wall 1-2, the square on the far side of the 1 is safe.',
    diagram: mindMapDiagram(['..FS', '121.', '____'], ['left']),
  },
  {
    id: 'reveal-1-1-wall',
    label: 'Wall 1-1 reveal',
    tier: 'overlap',
    help: 'A 1 against an edge shares all its covered squares with the next 1, so the third square is safe.',
    diagram: mindMapDiagram(['..S.', '11..', '____'], ['left']),
  },
  {
    id: 'reveal-1-1-interior',
    label: 'Interior 1-1 reveal',
    tier: 'overlap',
    help: 'When one 1 sits inside another 1\u2019s covered squares away from the edge, the extra square is safe.',
    diagram: mindMapDiagram(['...S', 'F11.', '____']),
  },
  {
    id: 'reveal-counting-noflag',
    label: 'Counting reveal (no flag)',
    tier: 'counting',
    help: 'Opening a proven-safe square directly without first flagging the mine beside it.',
    diagram: mindMapDiagram(['.1S', '.11', '...'], ['top']),
  },
  {
    id: 'reveal-counting-after-flag',
    label: 'Counting reveal (after flag)',
    tier: 'counting',
    help: 'Direct left click on a safe square beside a number whose flags are already placed.',
    diagram: mindMapDiagram(['F1S', '_1_', '___']),
  },
  {
    id: 'flag-exh-4-fresh',
    label: 'Untouched 4 (all mines)',
    tier: 'counting',
    help: 'A 4 with zero flags placed and exactly four covered neighbors.',
    diagram: mindMapDiagram(['MM.', 'M4_', 'M__']),
  },
  {
    id: 'flag-exh-4-partial',
    label: 'Partially-flagged 4',
    tier: 'counting',
    help: 'A 4 that already has some flags placed and whose remaining covered neighbors are all mines.',
    diagram: mindMapDiagram(['.MF', '24F', 'M21']),
  },
  {
    id: 'flag-exh-5plus',
    label: 'Exhaustive 5, 6, or 7',
    tier: 'counting',
    help: 'A 5, 6, or 7 whose unflagged covered neighbors all must be mines.',
    diagram: mindMapDiagram(['MFF', 'M5F', 'M21']),
  },
  {
    id: 'flag-exh-1-3',
    label: 'Exhaustive 1, 2, or 3',
    tier: 'counting',
    help: 'A 1, 2, or 3 whose remaining covered neighbors all must be mines.',
    diagram: mindMapDiagram(['M2.', 'F2_', '___']),
  },
  {
    id: 'chord-multi',
    label: 'Chord opening 2+ squares',
    tier: 'counting',
    help: 'Chording a satisfied number that opens two or more squares in one click.',
    diagram: mindMapDiagram(['FS.', 'FC.', '_S_'], [], 1),
  },
  {
    id: 'chord-single-rim',
    label: '1-square chord on opening rim',
    tier: 'counting',
    help: 'Chording a number on an opening edge when only one square opens (direct click costs the same one click without needing a flag).',
    diagram: mindMapDiagram(['F..', 'CS_', '___'], [], 1),
  },
  {
    id: 'chord-single-other',
    label: '1-square chord (other)',
    tier: 'counting',
    help: 'Chording an interior number when only one square opens.',
    diagram: mindMapDiagram(['FS1', '2C1', 'F21'], [], 2),
  },
  {
    id: 'unproven-guess',
    label: 'Unproven guess',
    tier: 'guess',
    help: 'Opening or flagging a square not proved by any visible number or mine count.',
    diagram: mindMapDiagram(['.?..', '12..', '____']),
  },
]);

const MIND_MAP_TECH_BY_ID = new Map(MIND_MAP_TECHNIQUES.map((t) => [t.id, t]));

function mindMapMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mindMapMean(values) {
  if (values.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function mindMapPercentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function mindMapCellInfo(view, idx, width) {
  const { revealed, flagged, adjacent, around } = view;
  let flags = 0;
  const cov = [];
  for (const n of around[idx]) {
    if (flagged[n]) flags++;
    else if (!revealed[n]) cov.push(n);
  }
  return {
    idx,
    x: idx % width,
    y: Math.floor(idx / width),
    val: adjacent[idx],
    flags,
    rem: adjacent[idx] - flags,
    cov,
  };
}

// Extract a 5x5 (clamped to board edges) local board snapshot centered on
// targetIdx so the UI can draw the exact real-game board at that decision.
function mindMapCrop(view, board, targetIdx, markKind) {
  const { width, height } = board;
  const tx = targetIdx % width;
  const ty = Math.floor(targetIdx / width);
  const x0 = Math.max(0, Math.min(width - 5, tx - 2));
  const y0 = Math.max(0, Math.min(height - 5, ty - 2));
  const cw = Math.min(5, width - x0);
  const ch = Math.min(5, height - y0);
  const walls = [];
  if (x0 === 0) walls.push('left');
  if (x0 + cw === width) walls.push('right');
  if (y0 === 0) walls.push('top');
  if (y0 + ch === height) walls.push('bottom');
  const cells = [];
  for (let y = y0; y < y0 + ch; y++) {
    for (let x = x0; x < x0 + cw; x++) {
      const i = y * width + x;
      const mark = i === targetIdx ? markKind : undefined;
      if (view.revealed[i]) cells.push({ kind: 'open', num: view.adjacent[i], ...(mark ? { mark } : {}) });
      else if (view.flagged[i]) cells.push({ kind: 'flag', ...(mark ? { mark } : {}) });
      else cells.push({ kind: 'covered', ...(mark ? { mark } : {}) });
    }
  }
  return { width: cw, height: ch, walls, cells };
}

// Detect straight-edge 1-2-1 or 1-2-2-1 runs and 1-3-1 inner corners among
// the local effective-number frontier around targetIdx.
function mindMapClassifyOverlap(view, board, targetIdx, isFlag, level) {
  const { width, height } = board;
  const { revealed, adjacent, around } = view;
  const adjNums = [];
  for (const n of around[targetIdx]) {
    if (revealed[n] && adjacent[n] > 0) adjNums.push(mindMapCellInfo(view, n, width));
  }
  const clusterMap = new Map();
  for (const a of adjNums) clusterMap.set(a.idx, a);
  const covPool = new Set();
  for (const a of adjNums) for (const c of a.cov) covPool.add(c);
  for (const c of covPool) {
    for (const n of around[c]) {
      if (revealed[n] && adjacent[n] > 0 && !clusterMap.has(n)) {
        clusterMap.set(n, mindMapCellInfo(view, n, width));
      }
    }
  }
  const cluster = [...clusterMap.values()].filter((a) => a.rem > 0 && a.cov.length > 0);

  for (const center of cluster) {
    if (center.rem !== 3 || center.cov.length < 4) continue;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const arms = [];
    for (const [dx, dy] of dirs) {
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const arm = clusterMap.get(ny * width + nx);
      if (arm && arm.rem === 1) arms.push([dx, dy]);
    }
    if (arms.length >= 2) {
      const hasOrthogonal = arms.some(([ax, ay]) => arms.some(([bx, by]) => ax * bx + ay * by === 0));
      if (hasOrthogonal) return 'corner-1-3-1';
    }
  }

  if (level === 'allNumbers') return 'all-numbers';
  if (level === 'mineTotal') return 'mine-total';

  const at = (x, y) => (x >= 0 && x < width && y >= 0 && y < height ? clusterMap.get(y * width + x) : undefined);
  for (const a of adjNums) {
    if (a.rem !== 1 && a.rem !== 2) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      for (const shift of [-3, -2, -1, 0]) {
        const c0 = at(a.x + shift * dx, a.y + shift * dy);
        const c1 = at(a.x + (shift + 1) * dx, a.y + (shift + 1) * dy);
        const c2 = at(a.x + (shift + 2) * dx, a.y + (shift + 2) * dy);
        const c3 = at(a.x + (shift + 3) * dx, a.y + (shift + 3) * dy);
        if (c0 && c1 && c2 && c3 && c0.rem === 1 && c1.rem === 2 && c2.rem === 2 && c3.rem === 1) {
          if (isFlag) return 'flag-edge-1-2-2-1';
        }
      }
      for (const shift of [-2, -1, 0]) {
        const c0 = at(a.x + shift * dx, a.y + shift * dy);
        const c1 = at(a.x + (shift + 1) * dx, a.y + (shift + 1) * dy);
        const c2 = at(a.x + (shift + 2) * dx, a.y + (shift + 2) * dy);
        if (c0 && c1 && c2 && c0.rem === 1 && c1.rem === 2 && c2.rem === 1) {
          return isFlag ? 'flag-edge-1-2-1' : 'reveal-edge-1-2-1';
        }
      }
    }
  }

  const onWall = (cell) => cell.x === 0 || cell.x === width - 1 || cell.y === 0 || cell.y === height - 1;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = 0; j < cluster.length; j++) {
      if (i === j) continue;
      const A = cluster[i];
      const B = cluster[j];
      const setB = new Set(B.cov);
      const setA = new Set(A.cov);
      const onlyA = A.cov.filter((c) => !setB.has(c));
      const onlyB = B.cov.filter((c) => !setA.has(c));
      if (onlyA.length === 0 && onlyB.length === 0) continue;
      const wall = onWall(A) || onWall(B);
      if (isFlag && onlyA.includes(targetIdx) && A.rem - B.rem === onlyA.length) {
        return wall ? 'flag-1-2-wall' : 'flag-1-2-interior';
      }
      if (!isFlag && onlyA.includes(targetIdx)) {
        if (onlyB.length === 0 && A.rem === B.rem) {
          return wall ? 'reveal-1-1-wall' : 'reveal-1-1-interior';
        }
        if (B.rem - A.rem === onlyB.length && onlyB.length > 0) {
          return wall ? 'reveal-1-2-wall' : 'reveal-1-2-interior';
        }
      }
    }
  }

  return isFlag ? 'overlap-chain-flag' : 'overlap-chain-reveal';
}

function mindMapClassifyStep(step, view, board, proof) {
  const idx = step.index;
  if (step.kind === 'chord-multi') return { techId: 'chord-multi', tier: 'counting' };
  if (step.kind === 'chord-single') {
    const onRim = view.around[idx].some((n) => view.revealed[n] && view.adjacent[n] === 0);
    return { techId: onRim ? 'chord-single-rim' : 'chord-single-other', tier: 'counting' };
  }
  if (step.kind !== 'flag' && step.kind !== 'reveal') return null;

  const isFlag = step.kind === 'flag';
  const expectedVal = isFlag ? 1 : 2;
  const fact = proof.facts.get(idx);
  const level = fact === expectedVal ? proof.levelOf.get(idx) : 'guess';

  if (level === 'guess') return { techId: 'unproven-guess', tier: 'guess' };

  if (level === 'counting') {
    if (isFlag) {
      let bestVal = 0;
      let bestFresh = false;
      for (const n of view.around[idx]) {
        if (!view.revealed[n] || view.adjacent[n] === 0) continue;
        const info = mindMapCellInfo(view, n, board.width);
        if (info.rem === info.cov.length && info.val > bestVal) {
          bestVal = info.val;
          bestFresh = info.flags === 0;
        }
      }
      if (bestVal >= 5) return { techId: 'flag-exh-5plus', tier: 'counting' };
      if (bestVal === 4) return { techId: bestFresh ? 'flag-exh-4-fresh' : 'flag-exh-4-partial', tier: 'counting' };
      return { techId: 'flag-exh-1-3', tier: 'counting' };
    }
    let satisfiedByFlags = false;
    for (const n of view.around[idx]) {
      if (!view.revealed[n] || view.adjacent[n] === 0) continue;
      const info = mindMapCellInfo(view, n, board.width);
      if (info.rem === 0) {
        satisfiedByFlags = true;
        break;
      }
    }
    return {
      techId: satisfiedByFlags ? 'reveal-counting-after-flag' : 'reveal-counting-noflag',
      tier: 'counting',
    };
  }

  return {
    techId: mindMapClassifyOverlap(view, board, idx, isFlag, level),
    tier: level === 'overlap' ? 'overlap' : 'coupled',
  };
}

function mindMapCountEasyElsewhere(proof, view, board, targetIdx) {
  const tx = targetIdx % board.width;
  const ty = Math.floor(targetIdx / board.width);
  let count = 0;
  for (const [cell, lv] of proof.levelOf.entries()) {
    if (lv !== 'counting') continue;
    if (view.revealed[cell] || view.flagged[cell]) continue;
    const dx = Math.abs((cell % board.width) - tx);
    const dy = Math.abs(Math.floor(cell / board.width) - ty);
    if (Math.max(dx, dy) >= 3) count++;
  }
  return count;
}

function mindMapCountLocalSafeCounting(proof, view, board, originIdx) {
  if (originIdx === null || originIdx === undefined) return 0;
  const ox = originIdx % board.width;
  const oy = Math.floor(originIdx / board.width);
  let count = 0;
  for (const [cell, fact] of proof.facts.entries()) {
    if (fact !== 2) continue;
    if (proof.levelOf.get(cell) !== 'counting') continue;
    if (view.revealed[cell] || view.flagged[cell]) continue;
    if (Math.max(Math.abs((cell % board.width) - ox), Math.abs(Math.floor(cell / board.width) - oy)) <= 2) {
      count++;
    }
  }
  return count;
}

// Check on a cross-board jump whether both counting-easy and overlap-only work
// areas existed on the board, and whether the player picked a counting-easy one.
function mindMapCheckCountingFork(proof, view, board, targetIdx) {
  const cells = [];
  for (const [idx, fact] of proof.facts.entries()) {
    if (view.revealed[idx] || view.flagged[idx]) continue;
    cells.push({
      idx,
      x: idx % board.width,
      y: Math.floor(idx / board.width),
      counting: proof.levelOf.get(idx) === 'counting',
    });
  }
  if (cells.length < 2) return null;
  const visited = new Uint8Array(cells.length);
  const areas = [];
  for (let i = 0; i < cells.length; i++) {
    if (visited[i]) continue;
    const q = [i];
    visited[i] = 1;
    const members = [];
    let hasCounting = false;
    for (let h = 0; h < q.length; h++) {
      const u = cells[q[h]];
      members.push(u);
      if (u.counting) hasCounting = true;
      for (let j = 0; j < cells.length; j++) {
        if (visited[j]) continue;
        if (Math.max(Math.abs(u.x - cells[j].x), Math.abs(u.y - cells[j].y)) <= 2) {
          visited[j] = 1;
          q.push(j);
        }
      }
    }
    areas.push({ members, hasCounting });
  }
  if (areas.length < 2) return null;
  const anyCounting = areas.some((a) => a.hasCounting);
  const anyNonCounting = areas.some((a) => !a.hasCounting);
  if (!anyCounting || !anyNonCounting) return null;
  const tx = targetIdx % board.width;
  const ty = Math.floor(targetIdx / board.width);
  for (const a of areas) {
    if (a.members.some((m) => Math.max(Math.abs(m.x - tx), Math.abs(m.y - ty)) <= 1)) {
      return a.hasCounting;
    }
  }
  return null;
}

// Layout events measure #board's border box (1/8-cell bevel on each side).
function mindMapLayoutsOf(trace, board) {
  if (!trace || !Array.isArray(trace.events)) return [];
  const layouts = [];
  for (const e of trace.events) {
    if (e.kind === 'layout' && e.width > 0 && e.height > 0) {
      const bw = e.boardWidth || board.width;
      const bh = e.boardHeight || board.height;
      layouts.push({
        t: e.t,
        left: e.left,
        top: e.top,
        cellW: e.width / (bw + 2 * MIND_MAP_BOARD_BORDER_CELLS),
        cellH: e.height / (bh + 2 * MIND_MAP_BOARD_BORDER_CELLS),
      });
    }
  }
  return layouts;
}

function mindMapLayoutAt(layouts, t) {
  if (layouts.length === 0) return null;
  let active = layouts[0];
  for (let i = 1; i < layouts.length; i++) {
    if (layouts[i].t <= t) active = layouts[i];
    else break;
  }
  return active;
}

function mindMapToCell(layout, x, y) {
  return [
    (x - layout.left) / layout.cellW - MIND_MAP_BOARD_BORDER_CELLS,
    (y - layout.top) / layout.cellH - MIND_MAP_BOARD_BORDER_CELLS,
  ];
}

// Dissect cursor kinematics over [prevT, curT]:
//   - Pre-down hover (curDownT - arriveT) separating button hold from dwell
//   - Mid-flight detours (>= 120 ms dwell >= 2 cells from origin & target)
//   - When fullScan is true: 3-speed velocity budget (hover < 2, drift 2-10,
//     fast >= 10 cells/s), slow time hovering over open clue numbers vs other
//     covered squares, departure time, and path/chord drift ratio.
function mindMapDissectInterval(trace, layouts, prevT, curT, prevIdx, curIdx, curDownT, board, view, fullScan, includePoints = false) {
  const empty = {
    valid: false,
    preDownHoverMs: null,
    departMs: null,
    hasDetour: false,
    detourMs: 0,
    detourSpot: null,
    hoverMs: 0,
    driftMs: 0,
    fastMs: 0,
    slowOnClueMs: 0,
    slowOnOtherCovMs: 0,
    pathRatio: null,
    points: [],
  };
  const st = trace.sampleT;
  const sx = trace.sampleX;
  const sy = trace.sampleY;
  if (!st || !sx || !sy || st.length < 4 || layouts.length === 0) return empty;
  const layout = mindMapLayoutAt(layouts, curT);
  if (!layout) return empty;

  let lo = 0;
  let hi = st.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (st[mid] < prevT) lo = mid + 1;
    else hi = mid;
  }
  let end = lo;
  while (end < st.length && st[end] <= curT) end++;
  if (end - lo < 2) return empty;

  const w = board.width;
  const h = board.height;
  const ox = (prevIdx % w) + 0.5;
  const oy = Math.floor(prevIdx / w) + 0.5;
  const tx = curIdx % w;
  const ty = Math.floor(curIdx / w);
  const tcx = tx + 0.5;
  const tcy = ty + 0.5;

  // Build cell-coordinate samples for [prevT, curT]
  const startRef = lo > 0 && st[lo - 1] <= prevT ? lo - 1 : lo;
  const [sx0, sy0] = mindMapToCell(layout, sx[startRef], sy[startRef]);
  const ptsT = [prevT];
  const ptsX = [sx0];
  const ptsY = [sy0];
  for (let i = lo; i < end; i++) {
    if (st[i] > prevT && st[i] < curT) {
      const [cx, cy] = mindMapToCell(layout, sx[i], sy[i]);
      ptsT.push(st[i]);
      ptsX.push(cx);
      ptsY.push(cy);
    }
  }
  const [ex, ey] = mindMapToCell(layout, sx[end - 1], sy[end - 1]);
  ptsT.push(curT);
  ptsX.push(ex);
  ptsY.push(ey);
  const nPts = ptsT.length;

  // Continuous arrival inside target cell leading up to curT
  let lastOut = 0;
  for (let i = nPts - 1; i >= 0; i--) {
    const x = ptsX[i];
    const y = ptsY[i];
    if (!(x >= tx && x < tx + 1 && y >= ty && y < ty + 1)) {
      lastOut = i;
      break;
    }
  }
  const arriveT = lastOut + 1 < nPts ? ptsT[lastOut + 1] : curT;
  const preDownHoverMs = curDownT !== null
    ? Math.max(0, curDownT - arriveT)
    : Math.max(0, curT - arriveT);

  // Origin departure (>= 0.35 cells from start pos)
  let departMs = curT - prevT;
  for (let i = 1; i < nPts; i++) {
    if (Math.hypot(ptsX[i] - sx0, ptsY[i] - sy0) >= 0.35) {
      departMs = ptsT[i] - prevT;
      break;
    }
  }

  // Mid-flight detours (>= 120 ms dwell >= 2.0 cells from origin & target)
  let detourMs = 0;
  let detourSpot = null;
  let bestDetourDur = 0;
  let dStart = ptsT[0];
  let ax = ptsX[0];
  let ay = ptsY[0];
  for (let i = 1; i < nPts; i++) {
    if (Math.hypot(ptsX[i] - ax, ptsY[i] - ay) > MIND_MAP_DETOUR_RADIUS || i === nPts - 1) {
      const dur = ptsT[i] - dStart;
      if (dur >= MIND_MAP_DETOUR_MS
        && Math.hypot(ax - ox, ay - oy) >= MIND_MAP_DETOUR_DIST
        && Math.hypot(ax - tcx, ay - tcy) >= MIND_MAP_DETOUR_DIST) {
        detourMs += dur;
        if (dur > bestDetourDur) {
          bestDetourDur = dur;
          const dcx = Math.max(0, Math.min(w - 1, Math.floor(ax)));
          const dcy = Math.max(0, Math.min(h - 1, Math.floor(ay)));
          detourSpot = { x: ax, y: ay, durMs: Math.round(dur), cellIndex: dcy * w + dcx };
        }
      }
      dStart = ptsT[i];
      ax = ptsX[i];
      ay = ptsY[i];
    }
  }

  if (!fullScan) {
    return {
      valid: true,
      preDownHoverMs,
      departMs,
      hasDetour: detourMs > 0,
      detourMs,
      detourSpot,
      hoverMs: 0,
      driftMs: 0,
      fastMs: 0,
      slowOnClueMs: 0,
      slowOnOtherCovMs: 0,
      pathRatio: null,
      points: [],
    };
  }

  let hoverMs = 0;
  let driftMs = 0;
  let fastMs = 0;
  let slowOnClueMs = 0;
  let slowOnOtherCovMs = 0;
  let pathCells = 0;
  const points = includePoints ? [{ t: ptsT[0], x: ptsX[0], y: ptsY[0], speed: 0, band: 'hover' }] : [];

  for (let i = 0; i < nPts - 1; i++) {
    const dt = ptsT[i + 1] - ptsT[i];
    if (dt <= 0) continue;
    pathCells += Math.hypot(ptsX[i + 1] - ptsX[i], ptsY[i + 1] - ptsY[i]);
    const midT = 0.5 * (ptsT[i] + ptsT[i + 1]);
    let b = i;
    let f = i + 1;
    while (b > 0 && midT - ptsT[b] < 20) b--;
    while (f < nPts - 1 && ptsT[f] - midT < 20) f++;
    const wdt = (ptsT[f] - ptsT[b]) / 1000;
    const spd = wdt > 0.005 ? Math.hypot(ptsX[f] - ptsX[b], ptsY[f] - ptsY[b]) / wdt : 0;

    let band = 'fast';
    if (spd < MIND_MAP_HOVER_SPEED) {
      hoverMs += dt;
      band = 'hover';
    } else if (spd < MIND_MAP_FAST_SPEED) {
      driftMs += dt;
      band = 'drift';
    } else {
      fastMs += dt;
    }
    if (includePoints) {
      points.push({ t: ptsT[i + 1], x: ptsX[i + 1], y: ptsY[i + 1], speed: spd, band });
    }

    // Non-origin, non-target slow reading (< 3.0 cells/s) classified by cell under cursor
    if (spd < 3.0 && view) {
      const mx = 0.5 * (ptsX[i] + ptsX[i + 1]);
      const my = 0.5 * (ptsY[i] + ptsY[i + 1]);
      const inTarget = mx >= tx && mx < tx + 1 && my >= ty && my < ty + 1;
      const nearOrigin = Math.hypot(mx - ox, my - oy) <= 0.7;
      if (!inTarget && !nearOrigin) {
        const cx = Math.floor(mx);
        const cy = Math.floor(my);
        if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
          const ci = cy * w + cx;
          if (view.revealed[ci] && view.adjacent[ci] > 0) slowOnClueMs += dt;
          else if (!view.revealed[ci] && !view.flagged[ci]) slowOnOtherCovMs += dt;
        }
      }
    }
  }

  const chord = Math.hypot(tcx - ox, tcy - oy);
  const pathRatio = chord >= 0.8 ? pathCells / chord : null;

  return {
    valid: true,
    preDownHoverMs,
    departMs,
    hasDetour: detourMs > 0,
    detourMs,
    detourSpot,
    hoverMs,
    driftMs,
    fastMs,
    slowOnClueMs,
    slowOnOtherCovMs,
    pathRatio,
    points,
  };
}

// Classify no-op root causes: habit/checking/sequencing vs physical/button slips.
function mindMapClassifyNoop(step, steps, i, board) {
  const kind = step.kind;
  const prev = i > 0 ? steps[i - 1] : null;
  const next = i + 1 < steps.length ? steps[i + 1] : null;
  const near = (a, b) => {
    if (!a || !b || a.index === undefined || b.index === undefined) return false;
    const dx = Math.abs((a.index % board.width) - (b.index % board.width));
    const dy = Math.abs(Math.floor(a.index / board.width) - Math.floor(b.index / board.width));
    return Math.max(dx, dy) === 1;
  };

  if (prev && prev.index === step.index && step.gapMs !== null && step.gapMs < 220) {
    return { group: 'physical', cause: 'double-tap' };
  }
  if (kind === 'noop-right-on-open' || kind === 'noop-on-flag' || kind === 'noop-chord-on-unopened') {
    return { group: 'physical', cause: 'button-slip' };
  }
  if (next && next.gapMs !== null && next.gapMs <= 450 && near(step, next)
    && (next.kind === 'reveal' || next.kind === 'flag' || next.kind === 'chord-multi' || next.kind === 'chord-single')) {
    if (kind === 'noop-missing-flag' && next.kind === 'flag') {
      return { group: 'habit', cause: 'premature-chord' };
    }
    return { group: 'physical', cause: 'one-cell-miss' };
  }
  if (kind === 'noop-missing-flag') {
    if (next && next.kind === 'flag' && next.gapMs !== null && next.gapMs < 650 && near(step, next)) {
      return { group: 'habit', cause: 'premature-chord' };
    }
    return { group: 'habit', cause: 'test-chord' };
  }
  if (kind === 'noop-extra-flag') return { group: 'habit', cause: 'test-chord' };
  return { group: 'habit', cause: 'finished-recheck' };
}

// Detect abandoned frontier visual checks (cursor hovers >= 220 ms near a live
// frontier without clicking, then leaves >= 2.5 cells away) and mid-flight
// cursor reversals (> 130 deg, >= 45 px each leg).
function mindMapScanPointerBehavior(trace, layouts, stepSnapshots, board) {
  const st = trace.sampleT;
  const sx = trace.sampleX;
  const sy = trace.sampleY;
  const checks = [];
  let reversals = 0;
  if (!st || !sx || !sy || st.length < 6 || layouts.length === 0 || stepSnapshots.length === 0) {
    return { checks, reversals };
  }

  let snapIdx = 0;
  for (let i = 2; i < st.length - 1; i++) {
    while (snapIdx + 1 < stepSnapshots.length && stepSnapshots[snapIdx + 1].t <= st[i]) snapIdx++;
    const nearClick = Math.abs(st[i] - stepSnapshots[snapIdx].t) < 90
      || (snapIdx + 1 < stepSnapshots.length && Math.abs(stepSnapshots[snapIdx + 1].t - st[i]) < 90);
    if (nearClick) continue;
    let b = i - 1;
    while (b > 0 && st[i] - st[b] < 120) b--;
    let f = i + 1;
    while (f < st.length - 1 && st[f] - st[i] < 120) f++;
    const vx1 = sx[i] - sx[b];
    const vy1 = sy[i] - sy[b];
    const vx2 = sx[f] - sx[i];
    const vy2 = sy[f] - sy[i];
    const d1 = Math.hypot(vx1, vy1);
    const d2 = Math.hypot(vx2, vy2);
    if (d1 >= MIND_MAP_REVERSAL_PX && d2 >= MIND_MAP_REVERSAL_PX) {
      const cos = (vx1 * vx2 + vy1 * vy2) / (d1 * d2);
      if (cos < MIND_MAP_REVERSAL_COS) {
        reversals++;
        i = f;
      }
    }
  }

  let ptr = 0;
  for (let s = 1; s < stepSnapshots.length; s++) {
    const prevT = stepSnapshots[s - 1].t;
    const curT = stepSnapshots[s].t;
    if (curT - prevT < 350) continue;
    const layout = mindMapLayoutAt(layouts, curT);
    if (!layout) continue;
    while (ptr < st.length && st[ptr] < prevT + 60) ptr++;
    const endT = curT - 60;
    const snap = stepSnapshots[s];
    let dwellStart = null;
    let anchorX = 0;
    let anchorY = 0;
    for (let i = ptr; i < st.length && st[i] <= endT; i++) {
      const [cx, cy] = mindMapToCell(layout, sx[i], sy[i]);
      if (dwellStart === null) {
        dwellStart = st[i];
        anchorX = cx;
        anchorY = cy;
      } else if (Math.hypot(cx - anchorX, cy - anchorY) > 1.1) {
        const dur = st[i] - dwellStart;
        if (dur >= MIND_MAP_HOVER_CHECK_MS) {
          const clickX = (snap.index % board.width) + 0.5;
          const clickY = Math.floor(snap.index / board.width) + 0.5;
          if (Math.hypot(clickX - anchorX, clickY - anchorY) >= MIND_MAP_HOVER_LEAVE_CELLS) {
            const regime = mindMapClassifyHoverSite(anchorX, anchorY, snap, board);
            if (regime !== null) {
              checks.push({
                t: dwellStart,
                durMs: dur,
                regime: regime.kind,
                anchorCell: regime.anchorCell,
                crop: regime.crop,
              });
              break;
            }
          }
        }
        dwellStart = st[i];
        anchorX = cx;
        anchorY = cy;
      }
    }
  }
  return { checks, reversals };
}

function mindMapClassifyHoverSite(anchorX, anchorY, snap, board) {
  const { width, height } = board;
  const cx = Math.max(0, Math.min(width - 1, Math.floor(anchorX)));
  const cy = Math.max(0, Math.min(height - 1, Math.floor(anchorY)));
  let nearFrontier = false;
  let hasExh4Plus = null;
  let hasCountingSafe = null;
  let hasCountingMine = null;
  let hasOverlap = null;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (Math.hypot(x + 0.5 - anchorX, y + 0.5 - anchorY) > MIND_MAP_HOVER_NEAR_CELLS) continue;
      const idx = y * width + x;
      if (snap.view.revealed[idx] && snap.view.adjacent[idx] > 0) {
        const info = mindMapCellInfo(snap.view, idx, width);
        if (info.cov.length > 0) {
          nearFrontier = true;
          if (info.val >= 4 && info.rem > 0 && info.rem === info.cov.length && hasExh4Plus === null) {
            hasExh4Plus = idx;
          }
        }
      } else if (!snap.view.revealed[idx] && !snap.view.flagged[idx]) {
        const fact = snap.proof.facts.get(idx);
        const lv = snap.proof.levelOf.get(idx);
        if (fact === 2 && lv === 'counting' && hasCountingSafe === null) hasCountingSafe = idx;
        else if (fact === 1 && lv === 'counting' && hasCountingMine === null) hasCountingMine = idx;
        else if (fact !== undefined && lv !== 'counting' && hasOverlap === null) hasOverlap = idx;
      }
    }
  }
  if (!nearFrontier) return null;
  const anchorCell = hasExh4Plus ?? hasCountingSafe ?? hasCountingMine ?? hasOverlap ?? (cy * width + cx);
  const kind = hasExh4Plus !== null ? 'unflagged-exhaustive-4plus'
    : hasCountingSafe !== null ? 'missed-counting-safe'
      : hasCountingMine !== null ? 'unflagged-counting-mine'
        : hasOverlap !== null ? 'overlap-stumped'
          : 'no-local-move';
  const mark = hasExh4Plus !== null || hasCountingMine !== null ? 'mine'
    : hasCountingSafe !== null ? 'safe' : 'guess';
  return { kind, anchorCell, crop: mindMapCrop(snap.view, board, anchorCell, mark) };
}

// Reconstruct readable decision episodes for one game (latest Expert wins)
// annotating fresh vs queued recognition, cursor-drift loops, and detours.
function mindMapBuildEpisodes(stepRecords, checks, board, startedAtT) {
  const episodes = [];
  let streak = null;
  const flushStreak = () => {
    if (!streak) return;
    if (streak.count >= 3) {
      episodes.push({
        kind: 'streak',
        stepIndex: streak.stepIndex,
        atMs: streak.startMs,
        durMs: streak.totalMs,
        count: streak.count,
        label: `Cleared ${streak.count} fast local moves (${Math.round(streak.totalMs / streak.count)} ms/move)`,
      });
    }
    streak = null;
  };

  for (const s of stepRecords) {
    const atMs = Math.max(0, Math.round(s.t - startedAtT));
    const ageTag = s.ageSteps === 0 ? ' [fresh]' : s.ageSteps >= 1 && s.ageSteps <= 3 ? ' [queued]' : '';
    const driftTag = s.pathRatio !== null && s.pathRatio >= 1.8 ? `, ${s.pathRatio.toFixed(1)}\u00d7 cursor drift` : '';
    const detourTag = s.detourMs >= MIND_MAP_DETOUR_MS ? `, ${Math.round(s.detourMs)} ms detour` : '';

    if (s.tier && s.tier !== 'counting' && s.tier !== 'guess' && s.gapMs >= MIND_MAP_SLOW_MS && s.easyElsewhere >= 2) {
      flushStreak();
      const tech = MIND_MAP_TECH_BY_ID.get(s.techId);
      episodes.push({
        kind: 'slow-bail',
        stepIndex: s.stepIndex,
        atMs,
        durMs: Math.round(s.gapMs),
        label: `Spent ${Math.round(s.gapMs)} ms on ${tech.label}${ageTag} while ${s.easyElsewhere} counting moves waited elsewhere${driftTag}${detourTag}`,
        techId: s.techId,
        crop: s.crop,
      });
      continue;
    }
    if (s.endgamePointless) {
      flushStreak();
      episodes.push({
        kind: 'endgame-flag',
        stepIndex: s.stepIndex,
        atMs,
        durMs: Math.round(s.gapMs || 0),
        label: s.remSafe === 1
          ? `Flagged mine with 1 safe square left (${Math.round(s.gapMs || 0)} ms) instead of clicking to win`
          : `Placed ${s.endgameUnused ? 'unused' : '1-square-only'} flag with ${s.remSafe} safe squares left (${Math.round(s.gapMs || 0)} ms)`,
        crop: s.crop,
      });
      continue;
    }
    if (s.techId === 'unproven-guess' && s.easyElsewhere >= 1 && s.gapMs >= 350) {
      flushStreak();
      episodes.push({
        kind: 'guess-past-safe',
        stepIndex: s.stepIndex,
        atMs,
        durMs: Math.round(s.gapMs),
        label: `Unproven guess (${Math.round(s.gapMs)} ms) while ${s.easyElsewhere} counting moves were open`,
        crop: s.crop,
      });
      continue;
    }
    if (s.tier === 'counting' && s.gapMs !== null && s.gapMs < MIND_MAP_SLOW_MS) {
      if (!streak) streak = { startMs: atMs, stepIndex: s.stepIndex, count: 0, totalMs: 0 };
      streak.count++;
      streak.totalMs += s.gapMs;
    } else {
      flushStreak();
    }
  }
  flushStreak();

  for (const ch of checks) {
    if (ch.regime === 'no-local-move') continue;
    const atMs = Math.max(0, Math.round(ch.t - startedAtT));
    const desc = ch.regime === 'unflagged-exhaustive-4plus' ? 'Hovered near ready 4/5/6/7 and walked away'
      : ch.regime === 'missed-counting-safe' ? 'Hovered near counting-safe square and walked away'
        : ch.regime === 'unflagged-counting-mine' ? 'Hovered near counting mine and walked away'
          : 'Hovered near solvable overlap shape and walked away';
    let bestStepIndex = stepRecords.length > 0 ? stepRecords[0].stepIndex : 1;
    for (const s of stepRecords) {
      if (s.t >= ch.t) {
        bestStepIndex = s.stepIndex;
        break;
      }
    }
    episodes.push({
      kind: 'abandoned-hover',
      stepIndex: bestStepIndex,
      atMs,
      durMs: Math.round(ch.durMs),
      label: `${desc} (${Math.round(ch.durMs)} ms)`,
      crop: ch.crop,
    });
  }

  episodes.sort((a, b) => a.atMs - b.atMs);
  return episodes.slice(0, 40);
}

// Replay and analyze one traced Standard game across all mind-map and
// mentation dimensions.
function mindMapAnalyzeGame(record, trace, boardSpec, deps, options = {}) {
  const board = { width: boardSpec.width, height: boardSpec.height, mines: boardSpec.mines };
  const cellCount = board.width * board.height;
  let earlier = undefined;
  let lastRevealedCount = -1;
  const groupCounts = new Map();

  // Per-square deducible-since tracking (exact step first proved / chord-ready)
  const firstProvenStep = new Int32Array(cellCount).fill(-1);
  const chordReadyStep = new Int32Array(cellCount).fill(-1);
  const exhSeen = new Map();
  let effStepCounter = 0;
  let prevEffIndex = null;
  let prevRevealedCount = 0;

  const stepSnapshots = [];
  const replay = TrainingCore.replay(trace, record.outcome, board, deps, (event, view) => {
    const remSafe = view.safeCount - view.revealedCount;
    const isBoardAction = (event.kind === 'lup' || event.kind === 'rdown') && Number.isInteger(event.index);
    if (!isBoardAction) return { remSafe };

    const prevOpened = Math.max(0, view.revealedCount - prevRevealedCount);
    prevRevealedCount = view.revealedCount;

    if (view.revealedCount !== lastRevealedCount) {
      const proofView = {
        width: board.width,
        height: board.height,
        mines: board.mines,
        revealed: Array.from(view.revealed, Boolean),
        adjacent: view.adjacent,
      };
      earlier = GuardianAngel.proveLevels(proofView, GuardianAngel.rawClues(proofView), earlier, groupCounts);
      lastRevealedCount = view.revealedCount;
      const stamp = Math.max(0, effStepCounter - 1);
      for (const [idx] of earlier.facts.entries()) {
        if (!view.revealed[idx] && firstProvenStep[idx] === -1) firstProvenStep[idx] = stamp;
      }
    }

    // Track chord-ready step for open numbers whose flags match count
    for (let i = 0; i < cellCount; i++) {
      if (!view.revealed[i] || view.adjacent[i] === 0 || chordReadyStep[i] !== -1) continue;
      const info = mindMapCellInfo(view, i, board.width);
      if (info.rem === 0 && info.cov.length > 0) chordReadyStep[i] = Math.max(0, effStepCounter - 1);
    }

    // Scan newly ready exhaustive 4/5+ numbers
    if (record.outcome === 'win') {
      for (let i = 0; i < view.revealed.length; i++) {
        if (!view.revealed[i] || view.adjacent[i] < 4) continue;
        const info = mindMapCellInfo(view, i, board.width);
        if (info.rem > 0 && info.rem === info.cov.length && !exhSeen.has(i)) {
          exhSeen.set(i, {
            val: info.val,
            fresh: info.flags === 0,
            appearedStep: effStepCounter,
            flaggedStep: null,
          });
        }
      }
    }

    const willFlag = event.kind === 'rdown' && !view.revealed[event.index] && !view.flagged[event.index];
    const willUnflag = event.kind === 'rdown' && !view.revealed[event.index] && view.flagged[event.index];
    const willReveal = event.kind === 'lup' && !view.revealed[event.index] && !view.flagged[event.index];
    let willChord = false;
    let classified = null;
    let easyElsewhere = 0;
    let crop = null;
    let ageSteps = -1;
    let localSafeCounting = 0;
    let pickedCountingFork = null;
    let lightView = null;

    if (willFlag || willReveal) {
      classified = mindMapClassifyStep({ kind: willFlag ? 'flag' : 'reveal', index: event.index }, view, board, earlier);
      easyElsewhere = mindMapCountEasyElsewhere(earlier, view, board, event.index);
      const provenAt = firstProvenStep[event.index];
      ageSteps = provenAt >= 0 ? Math.max(0, effStepCounter - 1 - provenAt) : -1;
      if (options.captureCrops || (classified && (classified.tier === 'coupled' || classified.tier === 'overlap'))) {
        crop = mindMapCrop(view, board, event.index, willFlag ? 'mine' : 'safe');
      }
      if (willFlag && record.outcome === 'win') {
        for (const n of view.around[event.index]) {
          const entry = exhSeen.get(n);
          if (entry && entry.flaggedStep === null) entry.flaggedStep = effStepCounter;
        }
      }
    } else if (event.kind === 'lup' && view.revealed[event.index] && view.adjacent[event.index] > 0) {
      const info = mindMapCellInfo(view, event.index, board.width);
      if (info.cov.length > 0 && info.rem === 0) {
        willChord = true;
        classified = mindMapClassifyStep({ kind: info.cov.length === 1 ? 'chord-single' : 'chord-multi', index: event.index }, view, board, earlier);
        const readyAt = chordReadyStep[event.index];
        ageSteps = readyAt >= 0 ? Math.max(0, effStepCounter - 1 - readyAt) : -1;
      }
    }

    const isEff = willFlag || willUnflag || willReveal || willChord;
    if (isEff && effStepCounter > 0) {
      if (options.scanPointer) {
        localSafeCounting = mindMapCountLocalSafeCounting(earlier, view, board, prevEffIndex);
        if (prevEffIndex !== null) {
          const dist = Math.max(
            Math.abs((prevEffIndex % board.width) - (event.index % board.width)),
            Math.abs(Math.floor(prevEffIndex / board.width) - Math.floor(event.index / board.width)),
          );
          if (dist >= 3) {
            pickedCountingFork = mindMapCheckCountingFork(earlier, view, board, event.index);
          }
        }
        lightView = {
          revealed: new Uint8Array(view.revealed),
          flagged: new Uint8Array(view.flagged),
          adjacent: view.adjacent,
          around: view.around,
        };
        if (willFlag || willReveal || willChord) {
          stepSnapshots.push({
            t: event.t,
            index: event.index,
            view: lightView,
            proof: earlier,
          });
        }
      }
    }

    if (isEff) {
      prevEffIndex = event.index;
      effStepCounter++;
    }
    return { remSafe, classified, easyElsewhere, crop, ageSteps, localSafeCounting, pickedCountingFork, prevOpened, lightView };
  });

  if (replay.status !== 'replayed') return null;

  const layouts = mindMapLayoutsOf(trace, board);
  // Extract exact ldown timestamps for press-to-press & pre-down hover timing
  const ldowns = Array.isArray(trace.events)
    ? trace.events.filter((e) => e.kind === 'ldown' && typeof e.t === 'number').map((e) => e.t)
    : [];
  const hasLdown = ldowns.length > 0;
  let ldPtr = 0;
  const matchLdown = (t) => {
    while (ldPtr + 1 < ldowns.length && ldowns[ldPtr + 1] <= t) ldPtr++;
    return ldPtr < ldowns.length && ldowns[ldPtr] <= t && t - ldowns[ldPtr] <= 2000 ? ldowns[ldPtr] : null;
  };

  const moves = [];
  const noops = { habit: 0, physical: 0, byCause: {}, bursts: 0, postNoopGaps: [], normalGaps: [] };
  const endgame = {
    end5Unused: 0,
    end5Single: 0,
    end5WasteMs: 0,
    last1Flags: 0,
    last1Ms: 0,
    trailingFlags: 0,
    trailingMs: 0,
  };
  const mentation = {
    vel: { hoverMs: 0, driftMs: 0, fastMs: 0, slowOnClueMs: 0, slowOnOtherCovMs: 0, totalMs: 0 },
    localDriftRatios: [],
    detour: { n: 0, totalMs: 0, onCountingMs: 0, onCountingN: 0 },
    chunks: {
      count: 0,
      totalMoves: 0,
      entryGaps: [],
      followGaps: [],
      breakers: {
        noop: { n: 0, ms: 0 },
        patternWall: { n: 0, ms: 0 },
        localStall: { n: 0, ms: 0 },
        dryJump: { n: 0, ms: 0 },
        jumpPastSafe: { n: 0, ms: 0 },
        postOpen: { n: 0, ms: 0 },
      },
    },
    jumps: {
      dryCount: 0,
      dryGaps: [],
      dist4DryN: 0,
      eyesAheadN: 0,
      countingForkN: 0,
      countingPickedN: 0,
    },
    preDown: { reveal: [], chord: [], flag: [] },
    leftHolds: [],
  };

  let curChunk = null;
  const flushChunk = (reason, breakMs) => {
    if (!curChunk) return;
    mentation.chunks.count++;
    mentation.chunks.totalMoves += curChunk.len;
    mentation.chunks.entryGaps.push(curChunk.entryMs);
    for (const fg of curChunk.followMs) mentation.chunks.followGaps.push(fg);
    if (reason && mentation.chunks.breakers[reason]) {
      mentation.chunks.breakers[reason].n++;
      mentation.chunks.breakers[reason].ms += breakMs || 0;
    }
    curChunk = null;
  };

  let flagIdx = 0;
  let lastNoopT = -Infinity;
  let inBurst = false;
  let noopsSincePrevEff = 0;
  let startedAtT = null;
  let prevEffStep = null;
  const stepRecords = [];

  for (let i = 0; i < replay.steps.length; i++) {
    const s = replay.steps[i];
    const isLeftAction = s.kind === 'first-reveal' || s.kind === 'reveal' || s.kind === 'chord-multi' || s.kind === 'chord-single';
    const isRightAction = s.kind === 'flag' || s.kind === 'unflag';
    const downT = isLeftAction
      ? (hasLdown ? matchLdown(s.t) : null)
      : (isRightAction ? s.t : null);

    if (s.kind === 'first-reveal') {
      startedAtT = s.t;
      prevEffStep = { t: s.t, downT, index: s.index, kind: s.kind };
      noopsSincePrevEff = 0;
      continue;
    }
    if (startedAtT === null) continue;

    const isNoop = s.kind.startsWith('noop-');
    if (isNoop) {
      const c = mindMapClassifyNoop(s, replay.steps, i, board);
      noops[c.group]++;
      noops.byCause[c.cause] = (noops.byCause[c.cause] || 0) + 1;
      if (s.t - lastNoopT <= MIND_MAP_BURST_WINDOW_MS) {
        if (!inBurst) {
          noops.bursts++;
          inBurst = true;
        }
      } else {
        inBurst = false;
      }
      lastNoopT = s.t;
      noopsSincePrevEff++;
      continue;
    }

    if (isLeftAction && downT !== null && s.t >= downT) {
      mentation.leftHolds.push(s.t - downT);
    }

    // True press-to-press gap when ldown timestamps exist; trigger gap only on
    // traces without ldown events.
    const rawGapMs = s.gapMs;
    const effGapTrig = prevEffStep ? s.t - prevEffStep.t : null;
    const pressGapMs = hasLdown
      ? (prevEffStep && prevEffStep.downT !== null && downT !== null ? downT - prevEffStep.downT : null)
      : effGapTrig;
    const validGap = pressGapMs !== null && pressGapMs >= MIND_MAP_MIN_GAP_MS && pressGapMs <= MIND_MAP_MAX_GAP_MS;

    if (rawGapMs !== null && rawGapMs >= MIND_MAP_MIN_GAP_MS && rawGapMs <= MIND_MAP_MAX_GAP_MS) {
      if (noopsSincePrevEff > 0) noops.postNoopGaps.push(rawGapMs);
      else noops.normalGaps.push(rawGapMs);
    }

    let endgamePointless = false;
    let endgameUnused = false;
    if (s.kind === 'flag') {
      const ep = replay.flagEpisodes[flagIdx++];
      const remSafe = s.before.remSafe;
      const unused = !ep.removed && ep.multiChordUses === 0 && ep.singleChordUses === 0;
      const singleOnly = !ep.removed && ep.multiChordUses === 0 && ep.singleChordUses > 0;
      if (record.outcome === 'win' && remSafe <= 5 && (unused || singleOnly)) {
        if (unused) endgame.end5Unused++;
        else endgame.end5Single++;
        endgame.end5WasteMs += pressGapMs || rawGapMs || 0;
        endgamePointless = true;
        endgameUnused = unused;
      }
      if (record.outcome === 'win' && remSafe === 1 && !ep.removed) {
        endgame.last1Flags++;
        endgame.last1Ms += pressGapMs || rawGapMs || 0;
        endgamePointless = true;
      }
    }

    const cls = s.before && s.before.classified;
    const dist = prevEffStep
      ? Math.max(
        Math.abs((prevEffStep.index % board.width) - (s.index % board.width)),
        Math.abs(Math.floor(prevEffStep.index / board.width) - Math.floor(s.index / board.width)),
      )
      : 0;

    const dis = prevEffStep && effGapTrig !== null && effGapTrig >= MIND_MAP_MIN_GAP_MS && effGapTrig <= MIND_MAP_MAX_GAP_MS
      ? mindMapDissectInterval(
        trace,
        layouts,
        prevEffStep.t,
        s.t,
        prevEffStep.index,
        s.index,
        downT,
        board,
        s.before ? s.before.lightView : null,
        Boolean(options.scanPointer),
      )
      : {
        valid: false,
        preDownHoverMs: null,
        departMs: null,
        hasDetour: false,
        detourMs: 0,
        hoverMs: 0,
        driftMs: 0,
        fastMs: 0,
        slowOnClueMs: 0,
        slowOnOtherCovMs: 0,
        pathRatio: null,
      };

    const ageSteps = s.before ? s.before.ageSteps : -1;

    if (cls && validGap) {
      const regime = noopsSincePrevEff > 0 ? 'post-noop'
        : dis.hasDetour ? 'detour'
          : dist >= 3 ? 'jump'
            : ageSteps === 0 ? 'fresh'
              : ageSteps >= 1 && ageSteps <= 3 ? 'queued'
                : 'deferred';
      moves.push({
        techId: cls.techId,
        tier: cls.tier,
        isFlag: s.kind === 'flag',
        gapMs: pressGapMs,
        regime,
        ageSteps,
        dist,
        hasDetour: dis.hasDetour,
        easyElsewhere: s.before.easyElsewhere || 0,
        crop: s.before.crop || null,
      });
    }

    // Full Expert mentation aggregation
    if (options.scanPointer && prevEffStep && validGap && dis.valid) {
      mentation.vel.hoverMs += dis.hoverMs;
      mentation.vel.driftMs += dis.driftMs;
      mentation.vel.fastMs += dis.fastMs;
      mentation.vel.slowOnClueMs += dis.slowOnClueMs;
      mentation.vel.slowOnOtherCovMs += dis.slowOnOtherCovMs;
      mentation.vel.totalMs += effGapTrig;

      if (prevEffStep.index !== s.index && dis.preDownHoverMs !== null && dis.preDownHoverMs <= 2000) {
        if (s.kind === 'reveal') mentation.preDown.reveal.push(dis.preDownHoverMs);
        else if (s.kind === 'chord-multi' || s.kind === 'chord-single') mentation.preDown.chord.push(dis.preDownHoverMs);
        else if (s.kind === 'flag') mentation.preDown.flag.push(dis.preDownHoverMs);
      }

      if (dis.hasDetour) {
        mentation.detour.n++;
        mentation.detour.totalMs += dis.detourMs;
        if (cls && cls.tier === 'counting') {
          mentation.detour.onCountingN++;
          mentation.detour.onCountingMs += dis.detourMs;
        }
      }

      if (dist <= 2 && effGapTrig >= MIND_MAP_DRIFT_MIN_GAP_MS && noopsSincePrevEff === 0 && dis.pathRatio !== null) {
        mentation.localDriftRatios.push(dis.pathRatio);
      }

      // Cross-board jumps: eyes-ahead pipelining & counting-first selection
      if (dist >= 3) {
        if (s.before && s.before.pickedCountingFork !== null) {
          mentation.jumps.countingForkN++;
          if (s.before.pickedCountingFork) mentation.jumps.countingPickedN++;
        }
        if (s.before && s.before.localSafeCounting === 0) {
          mentation.jumps.dryCount++;
          mentation.jumps.dryGaps.push(pressGapMs);
          if (dist >= 4) {
            mentation.jumps.dist4DryN++;
            if (dis.departMs !== null && dis.departMs <= MIND_MAP_EYES_AHEAD_DEPART_MS
              && (dis.slowOnClueMs + dis.slowOnOtherCovMs) < 80) {
              mentation.jumps.eyesAheadN++;
            }
          }
        }
      }

      // Cognitive chunking & chunk-breaker taxonomy
      const tier = cls ? cls.tier : 'counting';
      const isFluid = dist <= 2 && noopsSincePrevEff === 0 && pressGapMs <= MIND_MAP_CHUNK_MAX_GAP_MS
        && tier === 'counting' && (dis.slowOnClueMs + dis.slowOnOtherCovMs) < 120;
      if (isFluid && curChunk) {
        curChunk.len++;
        curChunk.followMs.push(pressGapMs);
      } else {
        let reason = 'localStall';
        if (noopsSincePrevEff > 0) reason = 'noop';
        else if (tier !== 'counting') reason = 'patternWall';
        else if (dist >= 3 && s.before && s.before.localSafeCounting === 0) reason = 'dryJump';
        else if (dist >= 3) reason = 'jumpPastSafe';
        else if (s.before && s.before.prevOpened >= 6) reason = 'postOpen';
        flushChunk(reason, effGapTrig);
        curChunk = { len: 1, entryMs: pressGapMs, followMs: [] };
      }
    }

    if (options.buildEpisodes) {
      stepRecords.push({
        stepIndex: i,
        t: s.t,
        gapMs: pressGapMs !== null ? pressGapMs : rawGapMs,
        techId: cls ? cls.techId : null,
        tier: cls ? cls.tier : null,
        ageSteps,
        pathRatio: dis.pathRatio,
        detourMs: dis.detourMs,
        easyElsewhere: s.before ? s.before.easyElsewhere || 0 : 0,
        remSafe: s.before ? s.before.remSafe : 99,
        endgamePointless,
        endgameUnused,
        crop: s.before ? s.before.crop : null,
      });
    }

    prevEffStep = { t: s.t, downT, index: s.index, kind: s.kind };
    noopsSincePrevEff = 0;
  }
  flushChunk(null, 0);

  // Trailing pointless flags immediately before a final reveal or 1-cell chord win
  if (record.outcome === 'win' && replay.steps.length >= 2) {
    const finalStep = replay.steps[replay.steps.length - 1];
    if (finalStep.kind === 'reveal' || finalStep.kind === 'chord-single') {
      for (let i = replay.steps.length - 2; i >= 0; i--) {
        const s = replay.steps[i];
        if (s.kind === 'flag') {
          endgame.trailingFlags++;
          endgame.trailingMs += s.gapMs || 0;
        } else if (!s.kind.startsWith('noop-')) break;
      }
    }
  }

  const exh4Plus = { freshTotal: 0, freshSkipped: 0, partialTotal: 0, partialSkipped: 0 };
  for (const e of exhSeen.values()) {
    const skipped = e.flaggedStep === null || (e.flaggedStep - e.appearedStep) > 1;
    if (e.fresh) {
      exh4Plus.freshTotal++;
      if (skipped) exh4Plus.freshSkipped++;
    } else {
      exh4Plus.partialTotal++;
      if (skipped) exh4Plus.partialSkipped++;
    }
  }

  const pointer = options.scanPointer
    ? mindMapScanPointerBehavior(trace, layouts, stepSnapshots, board)
    : { checks: [], reversals: 0 };

  const episodes = options.buildEpisodes && startedAtT !== null
    ? mindMapBuildEpisodes(stepRecords, pointer.checks, board, startedAtT)
    : null;

  return {
    level: boardSpec.level,
    endedAt: record.endedAt,
    timeMs: record.timeMs,
    bv3: record.bv3,
    bvs: record.bv3 / (record.timeMs / 1000),
    ioe: typeof record.noOpClicks === 'number' && (record.boardChangingClicks + record.noOpClicks) > 0
      ? record.bv3 / (record.boardChangingClicks + record.noOpClicks) : null,
    moves,
    noops,
    endgame,
    exh4Plus,
    mentation,
    checks: pointer.checks,
    reversals: pointer.reversals,
    episodes,
  };
}

// Replay a late Expert loss (>= 20 s) to measure pre-death flow breakdown:
// press-to-press pace, cross-board jumps, and no-op spikes across the final 5
// effective moves leading into the fatal click vs earlier cruising play.
function mindMapAnalyzeLoss(record, trace, boardSpec, deps) {
  if (record.outcome !== 'loss' || record.timeMs < MIND_MAP_LOSS_MIN_MS) return null;
  const board = { width: boardSpec.width, height: boardSpec.height, mines: boardSpec.mines };
  let earlier = undefined;
  let lastRevealedCount = -1;
  const groupCounts = new Map();

  const replay = TrainingCore.replay(trace, 'loss', board, deps, (event, view) => {
    const isBoardAction = (event.kind === 'lup' || event.kind === 'rdown') && Number.isInteger(event.index);
    if (!isBoardAction) return {};
    if (view.revealedCount !== lastRevealedCount) {
      const proofView = {
        width: board.width,
        height: board.height,
        mines: board.mines,
        revealed: Array.from(view.revealed, Boolean),
        adjacent: view.adjacent,
      };
      earlier = GuardianAngel.proveLevels(proofView, GuardianAngel.rawClues(proofView), earlier, groupCounts);
      lastRevealedCount = view.revealedCount;
    }
    let countingSafeCount = 0;
    let anySafeCount = 0;
    if (earlier) {
      for (const [cell, fact] of earlier.facts.entries()) {
        if (fact !== 2 || view.revealed[cell] || view.flagged[cell]) continue;
        anySafeCount++;
        if (earlier.levelOf.get(cell) === 'counting') countingSafeCount++;
      }
    }
    const targetFact = earlier ? earlier.facts.get(event.index) : undefined;
    return {
      countingSafeCount,
      anySafeCount,
      fatalWasProvenMine: targetFact === 1,
    };
  });
  if (replay.status !== 'replayed') return null;

  const ldowns = Array.isArray(trace.events)
    ? trace.events.filter((e) => e.kind === 'ldown' && typeof e.t === 'number').map((e) => e.t)
    : [];
  const hasLdown = ldowns.length > 0;
  let ldPtr = 0;
  const matchLdown = (t) => {
    while (ldPtr + 1 < ldowns.length && ldowns[ldPtr + 1] <= t) ldPtr++;
    return ldPtr < ldowns.length && ldowns[ldPtr] <= t && t - ldowns[ldPtr] <= 2000 ? ldowns[ldPtr] : null;
  };

  let startedAtT = null;
  let prevEff = null;
  let noopsSincePrev = 0;
  const effMoves = [];

  for (const s of replay.steps) {
    const isLeft = s.kind === 'first-reveal' || s.kind === 'reveal' || s.kind === 'chord-multi' || s.kind === 'chord-single';
    const isRight = s.kind === 'flag' || s.kind === 'unflag';
    const downT = isLeft ? (hasLdown ? matchLdown(s.t) : null) : (isRight ? s.t : null);

    if (s.kind === 'first-reveal') {
      startedAtT = s.t;
      prevEff = { t: s.t, downT, index: s.index };
      noopsSincePrev = 0;
      continue;
    }
    if (startedAtT === null) continue;
    if (s.kind.startsWith('noop-')) {
      noopsSincePrev++;
      continue;
    }

    const trigGap = prevEff ? s.t - prevEff.t : null;
    const pressGap = hasLdown
      ? (prevEff && prevEff.downT !== null && downT !== null ? downT - prevEff.downT : trigGap)
      : trigGap;
    const dist = prevEff
      ? Math.max(
        Math.abs((prevEff.index % board.width) - (s.index % board.width)),
        Math.abs(Math.floor(prevEff.index / board.width) - Math.floor(s.index / board.width)),
      )
      : 0;
    effMoves.push({
      gapMs: pressGap,
      dist,
      hadNoop: noopsSincePrev > 0,
      countingSafeCount: s.before ? s.before.countingSafeCount || 0 : 0,
      anySafeCount: s.before ? s.before.anySafeCount || 0 : 0,
      fatalWasProvenMine: s.before ? Boolean(s.before.fatalWasProvenMine) : false,
    });
    prevEff = { t: s.t, downT, index: s.index };
    noopsSincePrev = 0;
  }

  if (effMoves.length < 8) return null;
  const len = effMoves.length;
  const cruising = effMoves.slice(0, len - 6);
  const pre5to3 = effMoves.slice(len - 6, len - 3);
  const pre2to1 = effMoves.slice(len - 3, len - 1);
  const fatal = effMoves[len - 1];
  const pre5All = effMoves.slice(len - 6);

  return {
    endedAt: record.endedAt,
    timeMs: record.timeMs,
    bv3: record.bv3,
    cruisingGaps: cruising.map((m) => m.gapMs).filter((g) => g !== null && g >= MIND_MAP_MIN_GAP_MS && g <= MIND_MAP_MAX_GAP_MS),
    pre5to3Gaps: pre5to3.map((m) => m.gapMs).filter((g) => g !== null && g >= MIND_MAP_MIN_GAP_MS && g <= MIND_MAP_MAX_GAP_MS),
    pre2to1Gaps: pre2to1.map((m) => m.gapMs).filter((g) => g !== null && g >= MIND_MAP_MIN_GAP_MS && g <= MIND_MAP_MAX_GAP_MS),
    fatalGapMs: fatal.gapMs !== null && fatal.gapMs >= MIND_MAP_MIN_GAP_MS && fatal.gapMs <= MIND_MAP_MAX_GAP_MS ? fatal.gapMs : null,
    cruisingN: cruising.length,
    cruisingJumps: cruising.filter((m) => m.dist >= 3).length,
    cruisingNoops: cruising.filter((m) => m.hadNoop).length,
    pre5N: pre5All.length,
    pre5Jumps: pre5All.filter((m) => m.dist >= 3).length,
    pre5Noops: pre5All.filter((m) => m.hadNoop).length,
    fatalHadNoop: fatal.hadNoop,
    fatalSafeAvailable: fatal.anySafeCount > 0,
    fatalCountingSafeAvailable: fatal.countingSafeCount > 0,
    fatalWasProvenMine: fatal.fatalWasProvenMine,
  };
}

function mindMapSummarizePreDeath(lossResults) {
  const n = lossResults.length;
  if (n === 0) return null;
  const cruisingGaps = lossResults.flatMap((l) => l.cruisingGaps);
  const pre5to3Gaps = lossResults.flatMap((l) => l.pre5to3Gaps);
  const pre2to1Gaps = lossResults.flatMap((l) => l.pre2to1Gaps);
  const fatalGaps = lossResults.map((l) => l.fatalGapMs).filter((g) => g !== null);

  const cruisingN = lossResults.reduce((s, l) => s + l.cruisingN, 0);
  const cruisingJumps = lossResults.reduce((s, l) => s + l.cruisingJumps, 0);
  const cruisingNoops = lossResults.reduce((s, l) => s + l.cruisingNoops, 0);
  const pre5N = lossResults.reduce((s, l) => s + l.pre5N, 0);
  const pre5Jumps = lossResults.reduce((s, l) => s + l.pre5Jumps, 0);
  const pre5Noops = lossResults.reduce((s, l) => s + l.pre5Noops, 0);
  const fatalNoops = lossResults.filter((l) => l.fatalHadNoop).length;
  const safeAvail = lossResults.filter((l) => l.fatalSafeAvailable).length;
  const countingSafeAvail = lossResults.filter((l) => l.fatalCountingSafeAvailable).length;

  const cruisingMedMs = cruisingGaps.length > 0 ? Math.round(mindMapMedian(cruisingGaps)) : null;
  const pre5to3MedMs = pre5to3Gaps.length > 0 ? Math.round(mindMapMedian(pre5to3Gaps)) : null;
  const pre2to1MedMs = pre2to1Gaps.length > 0 ? Math.round(mindMapMedian(pre2to1Gaps)) : null;
  const fatalMedMs = fatalGaps.length > 0 ? Math.round(mindMapMedian(fatalGaps)) : null;

  return {
    losses: n,
    cruisingMedMs,
    pre5to3MedMs,
    pre2to1MedMs,
    fatalMedMs,
    slowdownMs: fatalMedMs !== null && cruisingMedMs !== null ? fatalMedMs - cruisingMedMs : null,
    cruisingJumpPct: cruisingN > 0 ? Math.round(100 * cruisingJumps / cruisingN) : null,
    preDeathJumpPct: pre5N > 0 ? Math.round(100 * pre5Jumps / pre5N) : null,
    cruisingNoopPct: cruisingN > 0 ? Math.round(100 * cruisingNoops / cruisingN) : null,
    preDeathNoopPct: pre5N > 0 ? Math.round(100 * pre5Noops / pre5N) : null,
    fatalNoopPct: Math.round(100 * fatalNoops / n),
    safeAvailablePct: Math.round(100 * safeAvail / n),
    countingSafeAvailablePct: Math.round(100 * countingSafeAvail / n),
  };
}

// Mentation claim taxonomy (modelVersion: 'mentation-v1') for interactive
// step-by-step replay inspection and player ground-truth calibration.
const MIND_MAP_CLAIM_TYPES = Object.freeze({
  'eyes-ahead': {
    id: 'eyes-ahead',
    label: 'Eyes-ahead lookahead jump',
    definition: 'Cross-board jump (4+ squares) after finishing a local area where the cursor departs within 45 ms with no mid-flight wandering — your eyes already chose the next target before your hand finished the previous click.',
  },
  'dry-jump-search': {
    id: 'dry-jump-search',
    label: 'Post-click search on dry jump',
    definition: 'Cross-board jump (3+ squares) after zero simple counting-safe moves remained locally, where the cursor waited or searched before locking onto the new area.',
  },
  'slow-bail': {
    id: 'slow-bail',
    label: 'Stayed on slow shape while easy moves waited (bail-first)',
    definition: 'Spent 600 ms or more press-to-press solving an overlap or multi-clue shape while 2 or more simple single-number counting moves were already open elsewhere.',
  },
  'fresh-deduction': {
    id: 'fresh-deduction',
    label: 'Fresh deduction (just became provable)',
    definition: 'Acted on a square that first became provable from your immediately preceding click (information age = 0 steps), measuring true on-the-spot pattern recognition.',
  },
  'queued-execution': {
    id: 'queued-execution',
    label: 'Queued move (already provable 1\u20133 clicks earlier)',
    definition: 'Acted on a square in the same local area that was already provable 1 to 3 clicks earlier, measuring execution pace inside an already-planned group.',
  },
  'fluent-chunk': {
    id: 'fluent-chunk',
    label: 'Fluent local counting burst',
    definition: 'Consecutive local counting action (within 2 squares, 380 ms or less press-to-press, no no-op or slow clue drift) executed as part of one unbroken chain.',
  },
  'cursor-drift': {
    id: 'cursor-drift',
    label: 'Slow cursor reading over open clues',
    definition: 'Cursor drifted slowly (< 3 squares/s) across open clue numbers or traced a looping path (1.6x+ straight-line distance) while reading with the mouse pointer.',
  },
  'mid-flight-detour': {
    id: 'mid-flight-detour',
    label: 'Mid-flight detour to a third area',
    definition: 'Cursor paused for 120 ms or more over a third area (at least 2 squares away from both start and target) before clicking elsewhere.',
  },
  'abandoned-hover': {
    id: 'abandoned-hover',
    label: 'Abandoned frontier hover',
    definition: 'Cursor dwelled 220 ms or more beside a live frontier (such as a ready 4/5/6/7 or counting square) and then moved away without clicking.',
  },
  'noop-habit': {
    id: 'noop-habit',
    label: 'Habit / checking no-op click',
    definition: 'Click that changed nothing on the board caused by testing an unsatisfied number, re-clicking a finished number, or clicking open blank space.',
  },
  'noop-physical': {
    id: 'noop-physical',
    label: 'Physical / aim slip no-op click',
    definition: 'Click that changed nothing on the board caused by a 1-square aim miss, accidental double-tap, or button-release order slip.',
  },
  'endgame-flag': {
    id: 'endgame-flag',
    label: 'Pointless endgame flag',
    definition: 'Placed a flag in the final 5 safe squares that opened zero chords (or only a 1-square chord) when clicking the remaining safe square(s) directly was faster.',
  },
  'pre-death-breakdown': {
    id: 'pre-death-breakdown',
    label: 'Pre-death flow breakdown move',
    definition: 'One of the final 5 moves before a late loss (past 20 s), tracking tempo slowdown, cross-board jumping, no-op spikes, or missed safe moves leading into the fatal click.',
  },
});

const MIND_MAP_FEEDBACK_REASONS = Object.freeze([
  { id: 'eyes-elsewhere', label: 'Eyes were looking elsewhere on the board' },
  { id: 'hand-slip', label: 'Already knew the move \u2014 hand or mouse slip' },
  { id: 'checking-counter', label: 'Checking mine count or top bar' },
  { id: 'genuinely-calculating', label: 'Genuinely calculating this pattern' },
  { id: 'planned-order', label: 'Intentionally deferred / planned click order' },
  { id: 'missed-easier-area', label: 'Did not notice the easier counting area' },
  { id: 'outside-distraction', label: 'Momentary pause or distraction outside the board' },
]);

// Full move-by-move board, cursor trajectory, and plain-English mentation
// claim reconstruction for one traced game (win or loss), used by the
// interactive Mentation Replay Inspector on training.html.
function mindMapInspectGame(record, trace, boardSpec, deps) {
  const board = { width: boardSpec.width, height: boardSpec.height, mines: boardSpec.mines };
  const cellCount = board.width * board.height;
  let earlier = undefined;
  let lastRevealedCount = -1;
  const groupCounts = new Map();
  const firstProvenStep = new Int32Array(cellCount).fill(-1);
  const chordReadyStep = new Int32Array(cellCount).fill(-1);
  let effStepCounter = 0;
  let prevEffIndex = null;

  const stepSnapshots = [];
  const replay = TrainingCore.replay(trace, record.outcome, board, deps, (event, view) => {
    const remSafe = view.safeCount - view.revealedCount;
    const isBoardAction = (event.kind === 'lup' || event.kind === 'rdown') && Number.isInteger(event.index);
    if (!isBoardAction) return { remSafe };

    if (view.revealedCount !== lastRevealedCount) {
      const proofView = {
        width: board.width,
        height: board.height,
        mines: board.mines,
        revealed: Array.from(view.revealed, Boolean),
        adjacent: view.adjacent,
      };
      earlier = GuardianAngel.proveLevels(proofView, GuardianAngel.rawClues(proofView), earlier, groupCounts);
      lastRevealedCount = view.revealedCount;
      const stamp = Math.max(0, effStepCounter - 1);
      for (const [idx] of earlier.facts.entries()) {
        if (!view.revealed[idx] && firstProvenStep[idx] === -1) firstProvenStep[idx] = stamp;
      }
    }

    for (let i = 0; i < cellCount; i++) {
      if (!view.revealed[i] || view.adjacent[i] === 0 || chordReadyStep[i] !== -1) continue;
      const info = mindMapCellInfo(view, i, board.width);
      if (info.rem === 0 && info.cov.length > 0) chordReadyStep[i] = Math.max(0, effStepCounter - 1);
    }

    const revealedBefore = new Uint8Array(view.revealed);
    const flaggedBefore = new Uint8Array(view.flagged);
    const countingSafeCells = [];
    const countingMineCells = [];
    const overlapSafeCells = [];
    const overlapMineCells = [];
    if (earlier) {
      for (const [cell, fact] of earlier.facts.entries()) {
        if (revealedBefore[cell] || flaggedBefore[cell]) continue;
        const lv = earlier.levelOf.get(cell);
        if (fact === 2) {
          if (lv === 'counting') countingSafeCells.push(cell);
          else overlapSafeCells.push(cell);
        } else if (fact === 1) {
          if (lv === 'counting') countingMineCells.push(cell);
          else overlapMineCells.push(cell);
        }
      }
    }

    const willFlag = event.kind === 'rdown' && !view.revealed[event.index] && !view.flagged[event.index];
    const willUnflag = event.kind === 'rdown' && !view.revealed[event.index] && view.flagged[event.index];
    const willReveal = event.kind === 'lup' && !view.revealed[event.index] && !view.flagged[event.index];
    let willChord = false;
    let classified = null;
    let easyElsewhere = 0;
    let ageSteps = -1;
    let localSafeCounting = 0;
    let pickedCountingFork = null;

    if (willFlag || willReveal) {
      classified = mindMapClassifyStep({ kind: willFlag ? 'flag' : 'reveal', index: event.index }, view, board, earlier);
      easyElsewhere = mindMapCountEasyElsewhere(earlier, view, board, event.index);
      const provenAt = firstProvenStep[event.index];
      ageSteps = provenAt >= 0 ? Math.max(0, effStepCounter - 1 - provenAt) : -1;
    } else if (event.kind === 'lup' && view.revealed[event.index] && view.adjacent[event.index] > 0) {
      const info = mindMapCellInfo(view, event.index, board.width);
      if (info.cov.length > 0 && info.rem === 0) {
        willChord = true;
        classified = mindMapClassifyStep({ kind: info.cov.length === 1 ? 'chord-single' : 'chord-multi', index: event.index }, view, board, earlier);
        const readyAt = chordReadyStep[event.index];
        ageSteps = readyAt >= 0 ? Math.max(0, effStepCounter - 1 - readyAt) : -1;
      }
    }

    const isEff = willFlag || willUnflag || willReveal || willChord;
    const lightView = {
      revealed: revealedBefore,
      flagged: flaggedBefore,
      adjacent: view.adjacent,
      around: view.around,
    };

    if (isEff && effStepCounter > 0) {
      localSafeCounting = mindMapCountLocalSafeCounting(earlier, view, board, prevEffIndex);
      if (prevEffIndex !== null) {
        const dist = Math.max(
          Math.abs((prevEffIndex % board.width) - (event.index % board.width)),
          Math.abs(Math.floor(prevEffIndex / board.width) - Math.floor(event.index / board.width)),
        );
        if (dist >= 3) {
          pickedCountingFork = mindMapCheckCountingFork(earlier, view, board, event.index);
        }
      }
      if (willFlag || willReveal || willChord) {
        stepSnapshots.push({
          t: event.t,
          index: event.index,
          view: lightView,
          proof: earlier,
        });
      }
    }
    if (isEff) {
      prevEffIndex = event.index;
      effStepCounter++;
    }

    return {
      remSafe,
      classified,
      easyElsewhere,
      ageSteps,
      localSafeCounting,
      pickedCountingFork,
      lightView,
      countingSafeCells,
      countingMineCells,
      overlapSafeCells,
      overlapMineCells,
      targetFact: earlier ? earlier.facts.get(event.index) : undefined,
      targetLevel: earlier ? earlier.levelOf.get(event.index) : undefined,
    };
  });

  if (replay.status !== 'replayed') return null;

  const layouts = mindMapLayoutsOf(trace, board);
  const pointer = mindMapScanPointerBehavior(trace, layouts, stepSnapshots, board);
  const ldowns = Array.isArray(trace.events)
    ? trace.events.filter((e) => e.kind === 'ldown' && typeof e.t === 'number').map((e) => e.t)
    : [];
  const hasLdown = ldowns.length > 0;
  let ldPtr = 0;
  const matchLdown = (t) => {
    while (ldPtr + 1 < ldowns.length && ldowns[ldPtr + 1] <= t) ldPtr++;
    return ldPtr < ldowns.length && ldowns[ldPtr] <= t && t - ldowns[ldPtr] <= 2000 ? ldowns[ldPtr] : null;
  };

  let startedAtT = null;
  let prevEffStep = null;
  let noopsSincePrevEff = 0;
  let flagIdx = 0;
  let chunkStreak = 0;

  // Identify final 5 effective steps in a late loss
  const effIndices = [];
  for (let i = 0; i < replay.steps.length; i++) {
    const k = replay.steps[i].kind;
    if (k !== 'first-reveal' && !k.startsWith('noop-')) effIndices.push(i);
  }
  const lateLossPreDeathSet = new Set(
    record.outcome === 'loss' && record.timeMs >= MIND_MAP_LOSS_MIN_MS
      ? effIndices.slice(-5)
      : [],
  );

  const steps = [];
  for (let i = 0; i < replay.steps.length; i++) {
    const s = replay.steps[i];
    const b = s.before || {};
    const isLeftAction = s.kind === 'first-reveal' || s.kind === 'reveal' || s.kind === 'chord-multi' || s.kind === 'chord-single';
    const isRightAction = s.kind === 'flag' || s.kind === 'unflag';
    const downT = isLeftAction ? (hasLdown ? matchLdown(s.t) : null) : (isRightAction ? s.t : null);
    const holdMs = isLeftAction && downT !== null && s.t >= downT ? Math.round(s.t - downT) : null;

    if (s.kind === 'first-reveal') {
      startedAtT = s.t;
    }
    const atMs = startedAtT !== null ? Math.max(0, Math.round(s.t - startedAtT)) : 0;

    // Determine which squares opened on this step by comparing with next step's revealedBefore
    const openedCells = [];
    if (s.opened > 0 && b.lightView) {
      const nextRev = i + 1 < replay.steps.length && replay.steps[i + 1].before && replay.steps[i + 1].before.lightView
        ? replay.steps[i + 1].before.lightView.revealed
        : null;
      if (nextRev) {
        for (let c = 0; c < cellCount; c++) {
          if (!b.lightView.revealed[c] && nextRev[c]) openedCells.push(c);
        }
      } else {
        openedCells.push(s.index);
      }
    }

    const isNoop = s.kind.startsWith('noop-');
    const effGapTrig = prevEffStep ? s.t - prevEffStep.t : null;
    const pressGapMs = !isNoop && s.kind !== 'first-reveal'
      ? (hasLdown
        ? (prevEffStep && prevEffStep.downT !== null && downT !== null ? Math.round(downT - prevEffStep.downT) : (effGapTrig !== null ? Math.round(effGapTrig) : null))
        : (effGapTrig !== null ? Math.round(effGapTrig) : null))
      : (s.gapMs !== null ? Math.round(s.gapMs) : null);

    const originIndex = prevEffStep ? prevEffStep.index : null;
    const dist = originIndex !== null
      ? Math.max(
        Math.abs((originIndex % board.width) - (s.index % board.width)),
        Math.abs(Math.floor(originIndex / board.width) - Math.floor(s.index / board.width)),
      )
      : 0;

    const dis = prevEffStep && effGapTrig !== null && effGapTrig >= MIND_MAP_MIN_GAP_MS && effGapTrig <= MIND_MAP_MAX_GAP_MS
      ? mindMapDissectInterval(
        trace,
        layouts,
        prevEffStep.t,
        s.t,
        prevEffStep.index,
        s.index,
        downT,
        board,
        b.lightView || null,
        true,
        true,
      )
      : {
        valid: false,
        preDownHoverMs: null,
        departMs: null,
        hasDetour: false,
        detourMs: 0,
        detourSpot: null,
        hoverMs: 0,
        driftMs: 0,
        fastMs: 0,
        slowOnClueMs: 0,
        slowOnOtherCovMs: 0,
        pathRatio: null,
        points: [],
      };

    // Match any abandoned frontier hover that occurred in [prevEffStep.t, s.t]
    let abandonedHover = null;
    if (prevEffStep && !isNoop) {
      const hit = pointer.checks.find((ch) => ch.t >= prevEffStep.t && ch.t <= s.t && ch.regime !== 'no-local-move');
      if (hit) {
        abandonedHover = {
          durMs: Math.round(hit.durMs),
          regime: hit.regime,
          anchorCell: hit.anchorCell,
        };
      }
    }

    let endgamePointless = false;
    let endgameUnused = false;
    if (s.kind === 'flag') {
      const ep = replay.flagEpisodes[flagIdx++];
      const remSafe = b.remSafe !== undefined ? b.remSafe : 99;
      const unused = !ep.removed && ep.multiChordUses === 0 && ep.singleChordUses === 0;
      const singleOnly = !ep.removed && ep.multiChordUses === 0 && ep.singleChordUses > 0;
      if (record.outcome === 'win' && remSafe <= 5 && (unused || singleOnly)) {
        endgamePointless = true;
        endgameUnused = unused;
      }
    }

    const cls = b.classified || null;
    const tech = cls ? MIND_MAP_TECH_BY_ID.get(cls.techId) : null;
    const ageSteps = b.ageSteps !== undefined ? b.ageSteps : -1;
    const easyElsewhere = b.easyElsewhere || 0;

    // Build structured plain-English mentation claims for this step
    const claims = [];
    const addClaim = (typeId, headline, detail) => {
      const meta = MIND_MAP_CLAIM_TYPES[typeId];
      claims.push({
        modelVersion: MIND_MAP_MODEL_VERSION,
        claimType: typeId,
        typeLabel: meta ? meta.label : typeId,
        typeDefinition: meta ? meta.definition : '',
        headline,
        detail,
      });
    };

    if (s.kind === 'first-reveal') {
      chunkStreak = 1;
    } else if (isNoop) {
      chunkStreak = 0;
      const noopInfo = mindMapClassifyNoop(s, replay.steps, i, board);
      const causeWords = {
        'premature-chord': 'clicked a number one flag short before placing the flag',
        'test-chord': 'clicked an unsatisfied number to test whether it would chord',
        'finished-recheck': 'clicked an already-finished number or open blank square',
        'double-tap': 'double-tapped the same square within 220 ms',
        'button-slip': 'pressed the wrong button on an open or flagged square',
        'one-cell-miss': 'missed an adjacent target square by 1 cell',
      };
      addClaim(
        noopInfo.group === 'habit' ? 'noop-habit' : 'noop-physical',
        `${noopInfo.group === 'habit' ? 'Habit / checking' : 'Physical / aim slip'} no-op (${noopInfo.cause})`,
        `This click changed nothing on the board: model classifies it as ${causeWords[noopInfo.cause] || noopInfo.cause}.`,
      );
    } else {
      const tier = cls ? cls.tier : 'counting';
      const isFluid = dist <= 2 && noopsSincePrevEff === 0 && pressGapMs !== null && pressGapMs <= MIND_MAP_CHUNK_MAX_GAP_MS
        && tier === 'counting' && (dis.slowOnClueMs + dis.slowOnOtherCovMs) < 120;
      if (isFluid) chunkStreak++;
      else chunkStreak = 1;

      if (lateLossPreDeathSet.has(i)) {
        const isFatal = i === replay.steps.length - 1;
        const safeCount = (b.countingSafeCells ? b.countingSafeCells.length : 0) + (b.overlapSafeCells ? b.overlapSafeCells.length : 0);
        addClaim(
          'pre-death-breakdown',
          isFatal
            ? `Fatal click at ${(atMs / 1000).toFixed(1)} s (${pressGapMs || 0} ms press-to-press${safeCount > 0 ? `, ${safeCount} safe squares open elsewhere` : ''})`
            : `Pre-death window move (${pressGapMs || 0} ms press-to-press, ${dist} squares moved)`,
          isFatal
            ? (safeCount > 0
              ? `You clicked a mine while ${b.countingSafeCells.length} simple counting-safe and ${b.overlapSafeCells.length} overlap-safe squares were available on the board.`
              : 'You took an unproven guess that hit a mine when no proven-safe squares were available.')
            : `Inside the final 5 moves before the loss${noopsSincePrevEff > 0 ? ' (immediately after a no-op click)' : ''}.`,
        );
      }

      if (endgamePointless) {
        addClaim(
          'endgame-flag',
          b.remSafe === 1
            ? `Pointless flag with 1 safe square left (${pressGapMs || 0} ms)`
            : `Pointless ${endgameUnused ? 'unused' : '1-square-only'} flag with ${b.remSafe} safe squares left (${pressGapMs || 0} ms)`,
          'At the very end of the board, flagging this mine saved zero clicks compared with left-clicking the remaining safe square(s) directly.',
        );
      }

      if (tier !== 'counting' && tier !== 'guess' && pressGapMs !== null && pressGapMs >= MIND_MAP_SLOW_MS && easyElsewhere >= 2) {
        addClaim(
          'slow-bail',
          `Bail-first opportunity: ${pressGapMs} ms on ${tech ? tech.label : 'overlap shape'} while ${easyElsewhere} simple counting moves waited elsewhere`,
          `This ${tech ? tech.label : 'pattern'} took ${pressGapMs} ms press-to-press (${ageSteps === 0 ? 'fresh: just became provable' : 'already provable earlier'}) while ${easyElsewhere} single-number counting moves were open at least 3 squares away.`,
        );
      } else if (ageSteps === 0 && dist <= 2 && !dis.hasDetour && noopsSincePrevEff === 0 && tech) {
        addClaim(
          'fresh-deduction',
          `Fresh ${tech.label} (${pressGapMs} ms press-to-press)`,
          `This square first became provable from your immediately preceding click (information age = 0 steps), so ${pressGapMs} ms measures true on-the-spot recognition + press.`,
        );
      } else if (ageSteps >= 1 && ageSteps <= 3 && dist <= 2 && !dis.hasDetour && noopsSincePrevEff === 0 && tech) {
        addClaim(
          'queued-execution',
          `Queued ${tech.label} (${pressGapMs} ms press-to-press, provable ${ageSteps} ${ageSteps === 1 ? 'click' : 'clicks'} ago)`,
          `This square was already provable ${ageSteps} ${ageSteps === 1 ? 'click' : 'clicks'} earlier in the same local area, so ${pressGapMs} ms reflects execution inside an already-planned group.`,
        );
      }

      if (dist >= 3 && b.localSafeCounting === 0) {
        const isEyesAhead = dist >= 4 && dis.departMs !== null && dis.departMs <= MIND_MAP_EYES_AHEAD_DEPART_MS
          && (dis.slowOnClueMs + dis.slowOnOtherCovMs) < 80;
        if (isEyesAhead) {
          addClaim(
            'eyes-ahead',
            `Eyes-ahead lookahead jump (${dist} squares, departed in ${Math.round(dis.departMs)} ms, ${pressGapMs} ms total)`,
            'After finishing the local area, your cursor started moving toward this new area within 45 ms with zero mid-flight wandering — your eyes had already found it before your previous click finished.',
          );
        } else {
          addClaim(
            'dry-jump-search',
            `Cross-board dry jump (${dist} squares, departed after ${dis.departMs !== null ? Math.round(dis.departMs) : '?'} ms, ${pressGapMs} ms total)`,
            `After zero simple counting-safe moves remained locally, you jumped ${dist} squares to a new area${b.pickedCountingFork === false ? ' (entered an overlap area while a simple counting area was also open)' : ''}.`,
          );
        }
      }

      if (dis.hasDetour && dis.detourSpot) {
        const dCol = Math.floor(dis.detourSpot.x) + 1;
        const dRow = Math.floor(dis.detourSpot.y) + 1;
        addClaim(
          'mid-flight-detour',
          `Mid-flight detour (+${Math.round(dis.detourMs)} ms paused near col ${dCol}, row ${dRow})`,
          `En route from your previous click to this square, the cursor paused for ${Math.round(dis.detourMs)} ms over a third area before redirecting here.`,
        );
      }

      if (abandonedHover) {
        const ahCol = (abandonedHover.anchorCell % board.width) + 1;
        const ahRow = Math.floor(abandonedHover.anchorCell / board.width) + 1;
        addClaim(
          'abandoned-hover',
          `Abandoned frontier hover (${abandonedHover.durMs} ms near col ${ahCol}, row ${ahRow})`,
          `Cursor hovered ${abandonedHover.durMs} ms beside a live frontier (${abandonedHover.regime.replace(/-/g, ' ')}) and left without clicking it.`,
        );
      }

      if ((dis.slowOnClueMs >= 160) || (dist <= 2 && pressGapMs !== null && pressGapMs >= MIND_MAP_DRIFT_MIN_GAP_MS && dis.pathRatio !== null && dis.pathRatio >= 1.6)) {
        addClaim(
          'cursor-drift',
          `Slow cursor reading on open clues (${Math.round(dis.slowOnClueMs)} ms on clues${dis.pathRatio !== null ? `, ${dis.pathRatio.toFixed(1)}\u00d7 path ratio` : ''})`,
          `Cursor moved slowly (< 3 squares/s) across open clue numbers${dis.pathRatio !== null ? ` and traced ${dis.pathRatio.toFixed(1)}\u00d7 the straight-line distance` : ''} while reading the position.`,
        );
      }

      if (isFluid && chunkStreak >= 2 && claims.length === 0) {
        addClaim(
          'fluent-chunk',
          `Fluent counting burst step #${chunkStreak} (${pressGapMs} ms press-to-press)`,
          'Fast local counting follow-up within 2 squares with direct cursor travel and no hesitation.',
        );
      }

      if (claims.length === 0 && tech) {
        addClaim(
          ageSteps === 0 ? 'fresh-deduction' : 'queued-execution',
          `${tech.label} (${pressGapMs !== null ? pressGapMs + ' ms' : 'start'})`,
          tech.help,
        );
      }
    }

    const notableTypes = new Set([
      'slow-bail', 'mid-flight-detour', 'abandoned-hover', 'cursor-drift',
      'eyes-ahead', 'endgame-flag', 'pre-death-breakdown', 'noop-habit', 'noop-physical',
    ]);
    const isFlaggedEpisode = claims.some((c) => notableTypes.has(c.claimType))
      || (pressGapMs !== null && pressGapMs >= MIND_MAP_SLOW_MS);

    steps.push({
      stepIndex: i,
      t: s.t,
      atMs,
      downT,
      holdMs,
      pressGapMs,
      rawGapMs: s.gapMs !== null ? Math.round(s.gapMs) : null,
      kind: s.kind,
      index: s.index,
      col: (s.index % board.width) + 1,
      row: Math.floor(s.index / board.width) + 1,
      originIndex,
      dist,
      opened: s.opened,
      openedCells,
      remSafe: b.remSafe !== undefined ? b.remSafe : 0,
      techId: cls ? cls.techId : null,
      techLabel: tech ? tech.label : s.kind,
      tier: cls ? cls.tier : (isNoop ? 'noop' : 'counting'),
      ageSteps,
      easyElsewhere,
      localSafeCounting: b.localSafeCounting || 0,
      pickedCountingFork: b.pickedCountingFork,
      endgamePointless,
      revealedBefore: b.lightView ? b.lightView.revealed : new Uint8Array(cellCount),
      flaggedBefore: b.lightView ? b.lightView.flagged : new Uint8Array(cellCount),
      adjacent: b.lightView ? b.lightView.adjacent : [],
      countingSafeCells: b.countingSafeCells || [],
      countingMineCells: b.countingMineCells || [],
      overlapSafeCells: b.overlapSafeCells || [],
      overlapMineCells: b.overlapMineCells || [],
      cursor: {
        valid: dis.valid,
        departMs: dis.departMs !== null ? Math.round(dis.departMs) : null,
        preDownHoverMs: dis.preDownHoverMs !== null ? Math.round(dis.preDownHoverMs) : null,
        hoverMs: Math.round(dis.hoverMs),
        driftMs: Math.round(dis.driftMs),
        fastMs: Math.round(dis.fastMs),
        slowOnClueMs: Math.round(dis.slowOnClueMs),
        pathRatio: dis.pathRatio,
        detourMs: Math.round(dis.detourMs),
        detourSpot: dis.detourSpot,
        abandonedHover,
        points: dis.points || [],
      },
      claims,
      primaryClaim: claims[0] || null,
      isFlaggedEpisode,
    });

    if (!isNoop) {
      prevEffStep = { t: s.t, downT, index: s.index, kind: s.kind };
      noopsSincePrevEff = 0;
    } else {
      noopsSincePrevEff++;
    }
  }

  return {
    modelVersion: MIND_MAP_MODEL_VERSION,
    level: boardSpec.level,
    board,
    endedAt: record.endedAt,
    outcome: record.outcome,
    timeMs: record.timeMs,
    bv3: record.bv3,
    bvs: record.bv3 / (record.timeMs / 1000),
    steps,
  };
}

function mindMapAggregateTechniques(gameList, winsCount) {
  const buckets = new Map();
  for (const t of MIND_MAP_TECHNIQUES) {
    buckets.set(t.id, {
      allGaps: [],
      freshGaps: [],
      queuedGaps: [],
      easyElsewhere: 0,
      slow600: 0,
      extraBailMs: 0,
      sampleCrop: null,
    });
  }
  for (const g of gameList) {
    for (const m of g.moves) {
      const b = buckets.get(m.techId);
      if (!b) continue;
      if (m.regime !== 'post-noop') {
        b.allGaps.push(m.gapMs);
        if (m.easyElsewhere >= 2) {
          b.easyElsewhere++;
          if (m.gapMs > MIND_MAP_BASELINE_MS) b.extraBailMs += (m.gapMs - MIND_MAP_BASELINE_MS);
        }
        if (m.gapMs >= MIND_MAP_SLOW_MS) b.slow600++;
      }
      if (m.regime === 'fresh') b.freshGaps.push(m.gapMs);
      else if (m.regime === 'queued') b.queuedGaps.push(m.gapMs);
      if (!b.sampleCrop && m.crop && (m.gapMs >= MIND_MAP_SLOW_MS || m.tier === 'coupled')) {
        b.sampleCrop = m.crop;
      }
    }
  }

  return MIND_MAP_TECHNIQUES.map((t) => {
    const b = buckets.get(t.id);
    const n = b.allGaps.length;
    const medMs = n > 0 ? Math.round(mindMapMedian(b.allGaps)) : null;
    const freshN = b.freshGaps.length;
    const freshMs = freshN > 0 ? Math.round(mindMapMedian(b.freshGaps)) : null;
    const queuedN = b.queuedGaps.length;
    const queuedMs = queuedN > 0 ? Math.round(mindMapMedian(b.queuedGaps)) : null;
    const p90Ms = n > 0 ? Math.round(mindMapPercentile(b.allGaps, 0.9)) : null;
    const slowPct = n > 0 ? Math.round(100 * b.slow600 / n) : null;
    const easyPct = n > 0 ? Math.round(100 * b.easyElsewhere / Math.max(1, n)) : null;
    const bailSecPerWin = winsCount > 0 ? b.extraBailMs / (winsCount * 1000) : 0;

    // Judge advice from true fresh local recognition whenever enough fresh samples exist
    const judgedMs = freshN >= 5 ? freshMs : medMs;
    let advice = 'low-n';
    if (n >= 5 && judgedMs !== null) {
      if (t.tier !== 'counting' && judgedMs >= MIND_MAP_BAIL_MED_MS && easyPct >= MIND_MAP_BAIL_EASY_PCT) {
        advice = 'bail-first';
      } else if (judgedMs >= 380 || slowPct >= 25) {
        advice = 'drill';
      } else {
        advice = 'fast';
      }
    }

    return {
      id: t.id,
      label: t.label,
      tier: t.tier,
      help: t.help,
      diagram: t.diagram,
      sampleCrop: b.sampleCrop,
      n,
      medMs,
      freshMs,
      freshN,
      queuedMs,
      queuedN,
      p90Ms,
      slowPct,
      easyPct,
      bailSecPerWin,
      advice,
      _sortMs: judgedMs || 0,
    };
  }).filter((row) => row.n > 0)
    .sort((a, b) => {
      const aLow = a.advice === 'low-n' ? 1 : 0;
      const bLow = b.advice === 'low-n' ? 1 : 0;
      if (aLow !== bLow) return aLow - bLow;
      return b._sortMs - a._sortMs;
    })
    .map(({ _sortMs, ...rest }) => rest);
}

function mindMapSummarizeMentation(expGames) {
  const withVel = expGames.filter((g) => g.mentation && g.mentation.vel.totalMs > 0);
  const n = withVel.length;
  if (n === 0) return null;

  const sumSec = (fn) => withVel.reduce((s, g) => s + fn(g), 0) / (n * 1000);
  const totalSec = sumSec((g) => g.mentation.vel.totalMs);
  const hoverSec = sumSec((g) => g.mentation.vel.hoverMs);
  const driftSec = sumSec((g) => g.mentation.vel.driftMs);
  const fastSec = sumSec((g) => g.mentation.vel.fastMs);
  const slowOnClueSec = sumSec((g) => g.mentation.vel.slowOnClueMs);
  const slowOnOtherCovSec = sumSec((g) => g.mentation.vel.slowOnOtherCovMs);

  const localDriftRatios = withVel.flatMap((g) => g.mentation.localDriftRatios);
  const localDriftRatio = localDriftRatios.length >= 5 ? mindMapMedian(localDriftRatios) : null;

  const detoursPerWin = withVel.reduce((s, g) => s + g.mentation.detour.n, 0) / n;
  const detourSecPerWin = sumSec((g) => g.mentation.detour.totalMs);
  const detourOnCountingSecPerWin = sumSec((g) => g.mentation.detour.onCountingMs);

  const dist4DryN = withVel.reduce((s, g) => s + g.mentation.jumps.dist4DryN, 0);
  const eyesAheadN = withVel.reduce((s, g) => s + g.mentation.jumps.eyesAheadN, 0);
  const eyesAheadPct = dist4DryN > 0 ? Math.round(100 * eyesAheadN / dist4DryN) : null;
  const dryJumpsPerWin = withVel.reduce((s, g) => s + g.mentation.jumps.dryCount, 0) / n;
  const dryGaps = withVel.flatMap((g) => g.mentation.jumps.dryGaps);
  const dryJumpMedMs = dryGaps.length > 0 ? Math.round(mindMapMedian(dryGaps)) : null;

  const countingForkN = withVel.reduce((s, g) => s + g.mentation.jumps.countingForkN, 0);
  const countingPickedN = withVel.reduce((s, g) => s + g.mentation.jumps.countingPickedN, 0);
  const countingChoicePct = countingForkN > 0 ? Math.round(100 * countingPickedN / countingForkN) : null;

  const chunkCount = withVel.reduce((s, g) => s + g.mentation.chunks.count, 0);
  const chunkMoves = withVel.reduce((s, g) => s + g.mentation.chunks.totalMoves, 0);
  const meanChunkLen = chunkCount > 0 ? chunkMoves / chunkCount : null;
  const chunkEntryMedMs = mindMapMedian(withVel.flatMap((g) => g.mentation.chunks.entryGaps));
  const chunkFollowMedMs = mindMapMedian(withVel.flatMap((g) => g.mentation.chunks.followGaps));

  const breakerLabels = [
    ['noop', 'No-op clicks'],
    ['patternWall', 'Pattern walls (overlap / multi-clue / guess)'],
    ['localStall', 'Local counting stalls (380 ms+)'],
    ['dryJump', 'Cross-board jumps (local area finished)'],
    ['jumpPastSafe', 'Early jumps past safe local squares'],
    ['postOpen', 'Reading after large openings'],
  ];
  const breakers = breakerLabels.map(([key, label]) => {
    const cnt = withVel.reduce((s, g) => s + g.mentation.chunks.breakers[key].n, 0);
    const ms = withVel.reduce((s, g) => s + g.mentation.chunks.breakers[key].ms, 0);
    return {
      id: key,
      label,
      perWin: cnt / n,
      secPerWin: ms / (n * 1000),
    };
  }).filter((b) => b.perWin > 0)
    .sort((a, b) => b.secPerWin - a.secPerWin);

  const preDownRev = withVel.flatMap((g) => g.mentation.preDown.reveal);
  const preDownCh = withVel.flatMap((g) => g.mentation.preDown.chord);
  const preDownFlg = withVel.flatMap((g) => g.mentation.preDown.flag);
  const leftHolds = withVel.flatMap((g) => g.mentation.leftHolds);

  return {
    wins: n,
    totalSec,
    hoverSec,
    driftSec,
    fastSec,
    hoverPct: totalSec > 0 ? Math.round(100 * hoverSec / totalSec) : 0,
    driftPct: totalSec > 0 ? Math.round(100 * driftSec / totalSec) : 0,
    fastPct: totalSec > 0 ? Math.round(100 * fastSec / totalSec) : 0,
    slowOnClueSec,
    slowOnOtherCovSec,
    localDriftRatio,
    localDriftN: localDriftRatios.length,
    detoursPerWin,
    detourSecPerWin,
    detourOnCountingSecPerWin,
    dist4DryN,
    eyesAheadPct,
    dryJumpsPerWin,
    dryJumpMedMs,
    countingForkN,
    countingChoicePct,
    meanChunkLen,
    chunkEntryMedMs: chunkEntryMedMs !== null ? Math.round(chunkEntryMedMs) : null,
    chunkFollowMedMs: chunkFollowMedMs !== null ? Math.round(chunkFollowMedMs) : null,
    breakers,
    preDownHover: {
      revealMs: preDownRev.length >= 5 ? Math.round(mindMapMedian(preDownRev)) : null,
      chordMs: preDownCh.length >= 5 ? Math.round(mindMapMedian(preDownCh)) : null,
      flagMs: preDownFlg.length >= 5 ? Math.round(mindMapMedian(preDownFlg)) : null,
      leftHoldMs: leftHolds.length >= 5 ? Math.round(mindMapMedian(leftHolds)) : null,
    },
  };
}

function mindMapSummarize(gameResults, expertRecords = [], lossResults = [], inspectableGames = []) {
  const byLevel = {
    all: gameResults,
    Expert: gameResults.filter((g) => g.level === 'Expert'),
    Intermediate: gameResults.filter((g) => g.level === 'Intermediate'),
    Beginner: gameResults.filter((g) => g.level === 'Beginner'),
  };
  const exp = byLevel.Expert;
  const expN = exp.length;

  const techniques = {
    all: mindMapAggregateTechniques(byLevel.all, expN),
    Expert: mindMapAggregateTechniques(byLevel.Expert, expN),
    Intermediate: mindMapAggregateTechniques(byLevel.Intermediate, byLevel.Intermediate.length),
    Beginner: mindMapAggregateTechniques(byLevel.Beginner, byLevel.Beginner.length),
  };

  const mentation = mindMapSummarizeMentation(exp);
  const preDeath = mindMapSummarizePreDeath(lossResults);

  const summarizeEndgame = (list) => {
    const n = list.length;
    if (n === 0) return null;
    const withEnd5 = list.filter((g) => g.endgame.end5Unused + g.endgame.end5Single > 0).length;
    const withLast1 = list.filter((g) => g.endgame.last1Flags > 0).length;
    const withTrailing = list.filter((g) => g.endgame.trailingFlags > 0).length;
    const totalEnd5Flags = list.reduce((s, g) => s + g.endgame.end5Unused + g.endgame.end5Single, 0);
    const totalEnd5Ms = list.reduce((s, g) => s + g.endgame.end5WasteMs, 0);
    const totalLast1Flags = list.reduce((s, g) => s + g.endgame.last1Flags, 0);
    return {
      wins: n,
      withEnd5Pct: Math.round(100 * withEnd5 / n),
      withLast1Pct: Math.round(100 * withLast1 / n),
      withTrailingPct: Math.round(100 * withTrailing / n),
      end5FlagsPerWin: totalEnd5Flags / n,
      end5SecPerWin: totalEnd5Ms / (n * 1000),
      last1FlagsTotal: totalLast1Flags,
    };
  };

  const endgame = {
    Expert: summarizeEndgame(byLevel.Expert),
    Intermediate: summarizeEndgame(byLevel.Intermediate),
    Beginner: summarizeEndgame(byLevel.Beginner),
  };

  const noopHabit = exp.reduce((s, g) => s + g.noops.habit, 0);
  const noopPhysical = exp.reduce((s, g) => s + g.noops.physical, 0);
  const noopTotal = noopHabit + noopPhysical;
  const noopBurstsPerWin = expN > 0 ? exp.reduce((s, g) => s + g.noops.bursts, 0) / expN : 0;
  const postNoopMedMs = mindMapMedian(exp.flatMap((g) => g.noops.postNoopGaps));
  const normalMedMs = mindMapMedian(exp.flatMap((g) => g.noops.normalGaps));
  const postNoopPenaltyMs = postNoopMedMs !== null && normalMedMs !== null ? Math.round(postNoopMedMs - normalMedMs) : null;

  const exhFreshTotal = exp.reduce((s, g) => s + g.exh4Plus.freshTotal, 0);
  const exhFreshSkipped = exp.reduce((s, g) => s + g.exh4Plus.freshSkipped, 0);
  const exhPartialTotal = exp.reduce((s, g) => s + g.exh4Plus.partialTotal, 0);
  const exhPartialSkipped = exp.reduce((s, g) => s + g.exh4Plus.partialSkipped, 0);

  const allChecks = exp.flatMap((g) => g.checks);
  const checkRegimes = { 'no-local-move': 0, 'missed-counting-safe': 0, 'unflagged-exhaustive-4plus': 0, 'unflagged-counting-mine': 0, 'overlap-stumped': 0 };
  let totalCheckMs = 0;
  for (const c of allChecks) {
    checkRegimes[c.regime] = (checkRegimes[c.regime] || 0) + 1;
    totalCheckMs += c.durMs;
  }
  const checksPerWin = expN > 0 ? allChecks.length / expN : 0;
  const checkSecPerWin = expN > 0 ? totalCheckMs / (expN * 1000) : 0;
  const reversalsPerWin = expN > 0 ? exp.reduce((s, g) => s + g.reversals, 0) / expN : 0;

  let bailMoves = 0;
  let bailSlow600 = 0;
  let bailExtraMs = 0;
  for (const g of exp) {
    for (const m of g.moves) {
      if (m.tier !== 'counting' && m.tier !== 'guess' && m.easyElsewhere >= 2) {
        bailMoves++;
        if (m.gapMs >= MIND_MAP_SLOW_MS) bailSlow600++;
        if (m.gapMs > MIND_MAP_BASELINE_MS) bailExtraMs += (m.gapMs - MIND_MAP_BASELINE_MS);
      }
    }
  }
  const bailSecPerWin = expN > 0 ? bailExtraMs / (expN * 1000) : 0;

  const expTechById = new Map(techniques.Expert.map((t) => [t.id, t]));
  const noflagRev = expTechById.get('reveal-counting-noflag');
  const afterFlagRev = expTechById.get('reveal-counting-after-flag');
  const useFreshNoflag = noflagRev && afterFlagRev && noflagRev.freshN >= 10 && afterFlagRev.freshN >= 10;
  const noflagPenaltyMs = useFreshNoflag
    ? noflagRev.freshMs - afterFlagRev.freshMs
    : (noflagRev && afterFlagRev && noflagRev.n >= 10 && afterFlagRev.n >= 10 ? noflagRev.medMs - afterFlagRev.medMs : null);

  const expAllWins = expertRecords.filter((r) => r.outcome === 'win').sort((a, b) => a.endedAt - b.endedAt);
  let peakShareRecent = null;
  let peakShareEarlier = null;
  if (expAllWins.length >= 40) {
    const half = Math.floor(expAllWins.length / 2);
    const early = expAllWins.slice(0, half);
    const late = expAllWins.slice(half);
    peakShareEarlier = Math.round(100 * early.filter((r) => r.bv3 / (r.timeMs / 1000) >= 2.0).length / early.length);
    peakShareRecent = Math.round(100 * late.filter((r) => r.bv3 / (r.timeMs / 1000) >= 2.0).length / late.length);
  }

  // Ranked performance traits (sorted by time cost descending)
  const rankedTraits = [];
  const addTrait = (item) => rankedTraits.push(item);

  if (expN > 0) {
    const medIoe = mindMapMedian(exp.map((g) => g.ioe).filter((v) => v !== null));
    if (medIoe !== null) {
      const gapCost = Math.max(0, (0.91 - medIoe) * 35);
      addTrait({
        id: 'ioe',
        label: 'Click efficiency (IOE)',
        valueNum: medIoe.toFixed(2),
        valueUnit: '',
        benchmark: '0.91+',
        costSec: gapCost,
        status: medIoe >= 0.85 ? 'strong' : medIoe >= 0.72 ? 'watch' : 'bottleneck',
        sample: expN,
        sampleUnit: 'wins',
        help: '3BV divided by all inputs (no-ops included) across recent replayed Expert wins.',
      });
    }

    if (mentation && mentation.slowOnClueSec >= 0.5) {
      const driftNote = mentation.localDriftRatio !== null
        ? ` Local slow moves loop at ${mentation.localDriftRatio.toFixed(1)}\u00d7 straight-line distance (pros: 1.0\u20131.1\u00d7).`
        : '';
      addTrait({
        id: 'clue-reading-drift',
        label: 'Slow cursor reading on open clues',
        valueNum: mentation.slowOnClueSec.toFixed(1),
        valueUnit: 's/win',
        benchmark: '<2.0 s',
        costSec: Math.max(0, mentation.slowOnClueSec - 1.6),
        status: mentation.slowOnClueSec >= 5.0 ? 'bottleneck' : mentation.slowOnClueSec >= 2.5 ? 'watch' : 'strong',
        sample: mentation.wins,
        sampleUnit: 'wins',
        help: 'Seconds per win with the cursor drifting slowly over open clue numbers instead of reading ahead with the eyes.' + driftNote,
      });
    }

    if (mentation && mentation.dist4DryN >= 10 && mentation.eyesAheadPct !== null) {
      const dryCost = mentation.dryJumpMedMs !== null
        ? Math.max(0, ((mentation.dryJumpMedMs - 380) * mentation.dryJumpsPerWin) / 1000)
        : 0;
      addTrait({
        id: 'eyes-ahead',
        label: 'Eyes-ahead lookahead on cross-board jumps',
        valueNum: String(mentation.eyesAheadPct),
        valueUnit: '%',
        benchmark: '35%+',
        costSec: dryCost,
        status: mentation.eyesAheadPct < 15 ? 'bottleneck' : mentation.eyesAheadPct < 30 ? 'watch' : 'strong',
        sample: mentation.dist4DryN,
        sampleUnit: 'jumps',
        help: `Share of 4+ square jumps after finishing a local area where the cursor departs within 45 ms with no mid-flight drift (${mentation.dryJumpsPerWin.toFixed(1)} jumps/win, ${mentation.dryJumpMedMs} ms median).`,
      });
    }

    if (bailMoves >= 10) {
      addTrait({
        id: 'slow-bail',
        label: 'Slow shapes tackled while easy moves wait',
        valueNum: String(Math.round(100 * bailSlow600 / bailMoves)),
        valueUnit: '%',
        benchmark: '<10%',
        costSec: bailSecPerWin,
        status: bailSecPerWin >= 2.5 ? 'bottleneck' : bailSecPerWin >= 1.0 ? 'watch' : 'strong',
        sample: bailMoves,
        sampleUnit: 'moves',
        help: 'Share of overlap and multi-clue moves taking 600 ms+ (press-to-press) while at least two counting moves waited elsewhere.',
      });
    }

    if (allChecks.length >= 5) {
      const missedChecks = checkRegimes['missed-counting-safe'] + checkRegimes['unflagged-exhaustive-4plus'] + checkRegimes['unflagged-counting-mine'];
      addTrait({
        id: 'abandoned-checks',
        label: 'Abandoned frontier hovers',
        valueNum: checkSecPerWin.toFixed(1),
        valueUnit: 's/win',
        benchmark: '<1.5 s',
        costSec: checkSecPerWin,
        status: checkSecPerWin >= 2.5 ? 'bottleneck' : checkSecPerWin >= 1.5 ? 'watch' : 'strong',
        sample: allChecks.length,
        sampleUnit: 'hovers',
        help: `Cursor dwelled 220 ms+ near a frontier then walked away (${missedChecks} passed over a counting move or ready 4/5/6/7).`,
      });
    }

    if (noopTotal >= 10) {
      const noopsPerWin = noopTotal / expN;
      const habitPct = Math.round(100 * noopHabit / noopTotal);
      addTrait({
        id: 'noops-split',
        label: `No-op clicks (${habitPct}% habit, ${100 - habitPct}% physical)`,
        valueNum: noopsPerWin.toFixed(1),
        valueUnit: '/win',
        benchmark: '<5',
        costSec: noopsPerWin * 0.28,
        status: noopsPerWin > 15 ? 'bottleneck' : noopsPerWin > 5 ? 'watch' : 'strong',
        sample: noopTotal,
        sampleUnit: 'clicks',
        help: 'Clicks that change nothing, split into habit test-chords/rechecks versus 1-cell misses and button slips.',
      });
    }

    if (mentation && mentation.countingForkN >= 15 && mentation.countingChoicePct !== null) {
      const nonCountingPerWin = ((100 - mentation.countingChoicePct) / 100) * (mentation.countingForkN / mentation.wins);
      addTrait({
        id: 'counting-first-forks',
        label: 'Counting-first choice on cross-board forks',
        valueNum: String(mentation.countingChoicePct),
        valueUnit: '%',
        benchmark: '90%+',
        costSec: Math.max(0, nonCountingPerWin * 0.35),
        status: mentation.countingChoicePct < 80 ? 'watch' : 'strong',
        sample: mentation.countingForkN,
        sampleUnit: 'forks',
        help: 'When both counting-easy areas and overlap-only areas are open across the board, share of jumps entering a counting-easy area first (sub-60 pros: 92\u201394%).',
      });
    }

    const expEnd = endgame.Expert;
    if (expEnd && expEnd.wins >= 5) {
      addTrait({
        id: 'endgame-flags',
        label: 'Pointless flags in final 5 safe squares',
        valueNum: String(expEnd.withEnd5Pct),
        valueUnit: '%',
        benchmark: '<15%',
        costSec: expEnd.end5SecPerWin,
        status: expEnd.withEnd5Pct >= 50 ? 'bottleneck' : expEnd.withEnd5Pct >= 25 ? 'watch' : 'strong',
        sample: expEnd.wins,
        sampleUnit: 'wins',
        help: `Share of Expert wins placing unused or 1-square-only flags with 5 or fewer safe squares left (${expEnd.withLast1Pct}% flagged with 1 safe square left).`,
      });
    }

    if (exhPartialTotal + exhFreshTotal >= 10) {
      const totalExh = exhPartialTotal + exhFreshTotal;
      const skipPct = Math.round(100 * (exhPartialSkipped + exhFreshSkipped) / totalExh);
      addTrait({
        id: 'exh-4plus',
        label: 'Ready 4, 5, 6, or 7 skipped',
        valueNum: String(skipPct),
        valueUnit: '%',
        benchmark: '<10%',
        costSec: ((exhPartialSkipped + exhFreshSkipped) / expN) * 0.35,
        status: skipPct >= 25 ? 'bottleneck' : skipPct >= 15 ? 'watch' : 'strong',
        sample: totalExh,
        sampleUnit: 'cases',
        help: 'Share of exhaustively complete 4/5/6/7 numbers left unflagged for more than one click.',
      });
    }

    if (noflagPenaltyMs !== null) {
      addTrait({
        id: 'noflag-hesitation',
        label: useFreshNoflag ? 'No-flag counting hesitation (fresh local)' : 'No-flag counting hesitation',
        valueNum: (noflagPenaltyMs >= 0 ? '+' : '\u2212') + Math.abs(noflagPenaltyMs),
        valueUnit: 'ms',
        benchmark: '<60 ms',
        costSec: Math.max(0, (noflagPenaltyMs * (noflagRev.n / expN)) / 1000),
        status: noflagPenaltyMs >= 150 ? 'bottleneck' : noflagPenaltyMs >= 60 ? 'watch' : 'strong',
        sample: useFreshNoflag ? noflagRev.freshN : noflagRev.n,
        sampleUnit: 'moves',
        help: useFreshNoflag
          ? `Extra fresh local press-to-press time on direct counting reveals without flagging (${noflagRev.freshMs} ms) versus after flagging (${afterFlagRev.freshMs} ms).`
          : 'Extra median press-to-press time on direct counting reveals without flagging first compared with reveals after flagging.',
      });
    }

    if (postNoopPenaltyMs !== null) {
      addTrait({
        id: 'post-noop-drag',
        label: 'Slowdown on click after a no-op',
        valueNum: (postNoopPenaltyMs >= 0 ? '+' : '\u2212') + Math.abs(postNoopPenaltyMs),
        valueUnit: 'ms',
        benchmark: '<25 ms',
        costSec: Math.max(0, (postNoopPenaltyMs * (noopTotal / expN)) / 1000),
        status: postNoopPenaltyMs >= 40 ? 'watch' : 'strong',
        sample: noopTotal,
        sampleUnit: 'no-ops',
        help: 'Extra median delay on the first valid move immediately after a no-op click.',
      });
    }
  }

  rankedTraits.sort((a, b) => b.costSec - a.costSec);

  // Automatic notable highlights (strict thresholds so only real signals surface)
  const highlights = [];
  if (endgame.Expert && endgame.Expert.withEnd5Pct >= 40) {
    highlights.push({
      severity: 'bottleneck',
      priority: 100,
      title: 'Pointless endgame flagging',
      metric: `${endgame.Expert.withEnd5Pct}% of Expert wins`,
      detail: `${endgame.Expert.end5FlagsPerWin.toFixed(1)} pointless flags in the final 5 safe squares (${endgame.Expert.end5SecPerWin.toFixed(1)} s/win); ${endgame.Expert.withLast1Pct}% flag when only 1 safe square remains (n=${endgame.Expert.wins}).`,
    });
  }
  if (mentation && mentation.dist4DryN >= 20 && mentation.eyesAheadPct !== null && mentation.eyesAheadPct < 20) {
    highlights.push({
      severity: 'bottleneck',
      priority: 97,
      title: 'Cross-board lookahead is low',
      metric: `${mentation.eyesAheadPct}% eyes-ahead`,
      detail: `Only ${mentation.eyesAheadPct}% of 4+ square jumps after finishing a local area depart within 45 ms (3.0+ 3BV/s pros hit 35\u201356%); ${mentation.dryJumpsPerWin.toFixed(1)} dry jumps/win at ${mentation.dryJumpMedMs} ms median (n=${mentation.dist4DryN}).`,
    });
  }
  const bailTechs = techniques.Expert.filter((t) => t.advice === 'bail-first' && t.n >= 10).slice(0, 3);
  if (bailSecPerWin >= 1.5 && bailTechs.length > 0) {
    highlights.push({
      severity: 'bottleneck',
      priority: 95,
      title: 'Move elsewhere before wrestling slow solvable shapes',
      metric: `${bailSecPerWin.toFixed(1)} s/win extra`,
      detail: `${bailSlow600} slow moves (600 ms+) happened while 2+ counting moves waited elsewhere. Top skip-first shapes: ${bailTechs.map((t) => `${t.label} (${t.freshN >= 5 ? t.freshMs + ' ms fresh' : t.medMs + ' ms'}, n=${t.n})`).join('; ')}.`,
    });
  }
  if (mentation && mentation.slowOnClueSec >= 4.0 && mentation.localDriftRatio !== null && mentation.localDriftRatio >= 1.5) {
    highlights.push({
      severity: 'watch',
      priority: 90,
      title: 'Reading with the cursor instead of the eyes',
      metric: `${mentation.slowOnClueSec.toFixed(1)} s/win on clues`,
      detail: `Local slow moves trace ${mentation.localDriftRatio.toFixed(1)}\u00d7 straight-line distance over nearby numbers (pros: 1.0\u20131.1\u00d7), spending ${mentation.slowOnClueSec.toFixed(1)} s/win hovering slowly over open clues (n=${mentation.wins} wins).`,
    });
  }
  if (checkRegimes['unflagged-exhaustive-4plus'] >= 5 || (exhPartialTotal >= 20 && (exhPartialSkipped / exhPartialTotal) >= 0.2)) {
    const skipPct = exhPartialTotal > 0 ? Math.round(100 * exhPartialSkipped / exhPartialTotal) : 0;
    highlights.push({
      severity: 'watch',
      priority: 85,
      title: 'Ready 4, 5, 6, and 7 numbers passed over',
      metric: `${skipPct}% skipped`,
      detail: `Partially-flagged 4/5/6/7s are left unflagged past the next click ${skipPct}% of the time (n=${exhPartialTotal}), with ${checkRegimes['unflagged-exhaustive-4plus']} cursor hovers right next to one before walking away.`,
    });
  }
  const slowKnown = techniques.Expert.find((t) => (t.id === 'flag-edge-1-2-1' || t.id === 'flag-1-2-interior') && t.n >= 25 && (t.freshN >= 5 ? t.freshMs : t.medMs) >= 450);
  if (slowKnown) {
    const dispMs = slowKnown.freshN >= 5 ? slowKnown.freshMs : slowKnown.medMs;
    const dispLabel = slowKnown.freshN >= 5 ? 'fresh' : 'median';
    highlights.push({
      severity: 'watch',
      priority: 80,
      title: `${slowKnown.label} is not automatic yet`,
      metric: `${dispMs} ms ${dispLabel}`,
      detail: `Takes ${dispMs} ms ${dispLabel} (${slowKnown.queuedMs !== null ? slowKnown.queuedMs + ' ms queued, ' : ''}${slowKnown.p90Ms} ms 90th, n=${slowKnown.n}) compared with ~210 ms on reflexive chords.`,
    });
  }
  if (peakShareRecent !== null && peakShareEarlier !== null && peakShareRecent - peakShareEarlier >= 5) {
    highlights.push({
      severity: 'positive',
      priority: 75,
      title: 'Expert 2.0+ 3BV/s upper tail expanded',
      metric: `${peakShareEarlier}% \u2192 ${peakShareRecent}%`,
      detail: `Share of Expert wins at 2.0+ 3BV/s rose from ${peakShareEarlier}% in the earlier half to ${peakShareRecent}% in the recent half (n=${expAllWins.length} wins).`,
    });
  }
  if (noopTotal >= 30 && postNoopPenaltyMs !== null && postNoopPenaltyMs >= 40) {
    highlights.push({
      severity: 'watch',
      priority: 70,
      title: 'No-ops break rhythm',
      metric: `+${postNoopPenaltyMs} ms next click`,
      detail: `${Math.round(100 * noopHabit / noopTotal)}% habit/checking vs ${Math.round(100 * noopPhysical / noopTotal)}% physical slips (${noopBurstsPerWin.toFixed(1)} burst episodes/win, n=${noopTotal} no-ops).`,
    });
  }
  if (preDeath && preDeath.losses >= 5 && preDeath.slowdownMs !== null && preDeath.slowdownMs >= 80) {
    highlights.push({
      severity: 'watch',
      priority: 88,
      title: 'Pre-death flow breakdown before late losses',
      metric: `${preDeath.cruisingMedMs} \u2192 ${preDeath.fatalMedMs} ms`,
      detail: `Across ${preDeath.losses} Expert losses past 20 s, press-to-press tempo slows from ${preDeath.cruisingMedMs} ms cruising to ${preDeath.pre2to1MedMs || preDeath.fatalMedMs} ms on moves \u22122/\u22121 and ${preDeath.fatalMedMs} ms on the fatal click; no-ops rise from ${preDeath.cruisingNoopPct}% to ${preDeath.fatalNoopPct}% right before death (${preDeath.safeAvailablePct}% died with a safe move open).`,
    });
  }
  highlights.sort((a, b) => b.priority - a.priority);

  // Recent Expert win thinking reconstructions (newest first)
  const recentGames = exp
    .filter((g) => g.episodes !== null)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, MIND_MAP_RECENT_EXPERT_TRACES)
    .map((g) => {
      const m = g.mentation;
      const gEyesAheadPct = m && m.jumps.dist4DryN > 0
        ? Math.round(100 * m.jumps.eyesAheadN / m.jumps.dist4DryN)
        : null;
      const gDrift = m && m.localDriftRatios.length > 0
        ? mindMapMedian(m.localDriftRatios)
        : null;
      return {
        endedAt: g.endedAt,
        timeS: g.timeMs / 1000,
        bv3: g.bv3,
        bvs: g.bvs,
        ioe: g.ioe,
        moves: g.moves.length,
        habitNoops: g.noops.habit,
        physicalNoops: g.noops.physical,
        end5Flags: g.endgame.end5Unused + g.endgame.end5Single,
        last1Flags: g.endgame.last1Flags,
        abandonedChecks: g.checks.length,
        reversals: g.reversals,
        eyesAheadPct: gEyesAheadPct,
        localDriftRatio: gDrift,
        detourSec: m ? m.detour.totalMs / 1000 : 0,
        episodes: g.episodes,
      };
    });

  return {
    modelVersion: MIND_MAP_MODEL_VERSION,
    counts: {
      all: gameResults.length,
      Expert: byLevel.Expert.length,
      Intermediate: byLevel.Intermediate.length,
      Beginner: byLevel.Beginner.length,
      ExpertLosses: lossResults.length,
    },
    highlights: highlights.slice(0, 6),
    rankedTraits,
    techniques,
    mentation,
    preDeath,
    endgame,
    pointer: {
      checksPerWin,
      checkSecPerWin,
      reversalsPerWin,
      checkRegimes,
      preDownHover: mentation ? mentation.preDownHover : null,
    },
    noops: {
      total: noopTotal,
      habit: noopHabit,
      physical: noopPhysical,
      burstsPerWin: noopBurstsPerWin,
      postNoopPenaltyMs,
    },
    recentGames,
    inspectableGames,
  };
}

const MindMap = {
  MODEL_VERSION: MIND_MAP_MODEL_VERSION,
  KEYS: MIND_MAP_KEYS,
  SAMPLE_CAPS: MIND_MAP_SAMPLE_CAPS,
  RECENT_EXPERT_TRACES: MIND_MAP_RECENT_EXPERT_TRACES,
  RECENT_LOSS_TRACES: MIND_MAP_RECENT_LOSS_TRACES,
  LOSS_MIN_MS: MIND_MAP_LOSS_MIN_MS,
  TECHNIQUES: MIND_MAP_TECHNIQUES,
  CLAIM_TYPES: MIND_MAP_CLAIM_TYPES,
  FEEDBACK_REASONS: MIND_MAP_FEEDBACK_REASONS,
  diagram: mindMapDiagram,
  crop: mindMapCrop,
  analyzeGame: mindMapAnalyzeGame,
  analyzeLoss: mindMapAnalyzeLoss,
  summarizePreDeath: mindMapSummarizePreDeath,
  inspectGame: mindMapInspectGame,
  summarize: mindMapSummarize,
};

if (typeof module !== 'undefined' && module.exports) module.exports = MindMap;
