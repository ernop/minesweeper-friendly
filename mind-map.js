'use strict';

// Cross-size trace mind-map, visual technique catalog, ranked performance
// traits, automatic notable highlights, and single-game thinking
// reconstruction (creator direction 2026-11-25; docs/product/training.md).
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
});

const MIND_MAP_RECENT_EXPERT_TRACES = 12;
const MIND_MAP_MIN_GAP_MS = 40;
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
    help: 'When one 1 sits inside another 1’s covered squares away from the edge, the extra square is safe.',
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
  const { revealed, flagged, adjacent, around } = view;
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

  // Check 1-3-1 inner corner (effective rem 3 corner wedged between two orthogonal rem 1 arms)
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

  // Straight-edge 1-2-1 and 1-2-2-1 check (horizontal or vertical line of open numbers)
  const at = (x, y) => (x >= 0 && x < width && y >= 0 && y < height ? clusterMap.get(y * width + x) : undefined);
  for (const a of adjNums) {
    if (a.rem !== 1 && a.rem !== 2) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      // Check 1-2-2-1 centered around a
      for (const shift of [-3, -2, -1, 0]) {
        const c0 = at(a.x + shift * dx, a.y + shift * dy);
        const c1 = at(a.x + (shift + 1) * dx, a.y + (shift + 1) * dy);
        const c2 = at(a.x + (shift + 2) * dx, a.y + (shift + 2) * dy);
        const c3 = at(a.x + (shift + 3) * dx, a.y + (shift + 3) * dy);
        if (c0 && c1 && c2 && c3 && c0.rem === 1 && c1.rem === 2 && c2.rem === 2 && c3.rem === 1) {
          if (isFlag) return 'flag-edge-1-2-2-1';
        }
      }
      // Check 1-2-1 centered around a
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

  // Pairwise 2-clue overlap rules (1-1 and 1-2, wall vs interior)
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
      // Flagging a mine in onlyA because A.rem - B.rem === onlyA.length
      if (isFlag && onlyA.includes(targetIdx) && A.rem - B.rem === onlyA.length) {
        return wall ? 'flag-1-2-wall' : 'flag-1-2-interior';
      }
      // Revealing a safe square in onlyA because B.rem - A.rem === onlyB.length (or A.rem === B.rem & onlyB empty)
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
    // Reveal proved at counting tier: check whether any adjacent number already has its flags placed
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

function mindMapLayoutsOf(trace, board) {
  if (!trace || !Array.isArray(trace.events)) return [];
  const layouts = [];
  for (const e of trace.events) {
    if (e.kind === 'layout' && e.width > 0 && e.height > 0) {
      layouts.push({
        t: e.t,
        left: e.left,
        top: e.top,
        cellW: e.width / (e.boardWidth || board.width),
        cellH: e.height / (e.boardHeight || board.height),
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

// Compute cursor hover dwell (ms before click inside target cell) and movement
// reaction time using pointer samples (typed or plain arrays) and layout rects.
function mindMapPointerTiming(trace, layouts, prevT, curT, targetIdx, board) {
  const st = trace.sampleT;
  const sx = trace.sampleX;
  const sy = trace.sampleY;
  if (!st || !sx || !sy || st.length < 4 || layouts.length === 0) {
    return { hoverMs: null, reactMs: null };
  }
  const layout = mindMapLayoutAt(layouts, curT);
  if (!layout) return { hoverMs: null, reactMs: null };
  const tx = targetIdx % board.width;
  const ty = Math.floor(targetIdx / board.width);
  let lo = 0;
  let hi = st.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (st[mid] < prevT) lo = mid + 1;
    else hi = mid;
  }
  let end = lo;
  while (end < st.length && st[end] <= curT) end++;
  if (end - lo < 2) return { hoverMs: null, reactMs: null };

  // Hover: continuous time inside the target square leading up to curT
  let hoverStart = curT;
  for (let i = end - 1; i >= lo; i--) {
    const cx = Math.floor((sx[i] - layout.left) / layout.cellW);
    const cy = Math.floor((sy[i] - layout.top) / layout.cellH);
    if (cx === tx && cy === ty) hoverStart = st[i];
    else break;
  }
  // Reaction: time after prevT before cursor moves >= 6 px from starting point
  const x0 = sx[lo];
  const y0 = sy[lo];
  let reactMs = null;
  for (let i = lo + 1; i < end; i++) {
    const dist = Math.hypot(sx[i] - x0, sy[i] - y0);
    if (dist >= 6) {
      reactMs = st[i] - prevT;
      break;
    }
  }
  return { hoverMs: curT - hoverStart, reactMs };
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

  // 1) Mid-flight direction reversals between consecutive clicks
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

  // 2) Abandoned frontier hovers between clicks (only inside gaps >= 350 ms)
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
      const cx = (sx[i] - layout.left) / layout.cellW;
      const cy = (sy[i] - layout.top) / layout.cellH;
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
// so the player can inspect what they were doing, in order, and why.
function mindMapBuildEpisodes(stepRecords, checks, board, startedAtT) {
  const episodes = [];
  let streak = null;
  const flushStreak = () => {
    if (!streak) return;
    if (streak.count >= 3) {
      episodes.push({
        kind: 'streak',
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
    // Notable slow solvable pattern while easy work existed elsewhere
    if (s.tier && s.tier !== 'counting' && s.tier !== 'guess' && s.gapMs >= MIND_MAP_SLOW_MS && s.easyElsewhere >= 2) {
      flushStreak();
      const tech = MIND_MAP_TECH_BY_ID.get(s.techId);
      episodes.push({
        kind: 'slow-bail',
        atMs,
        durMs: Math.round(s.gapMs),
        label: `Spent ${Math.round(s.gapMs)} ms on ${tech.label} while ${s.easyElsewhere} counting moves sat open elsewhere`,
        techId: s.techId,
        crop: s.crop,
      });
      continue;
    }
    // Endgame pointless flag
    if (s.endgamePointless) {
      flushStreak();
      episodes.push({
        kind: 'endgame-flag',
        atMs,
        durMs: Math.round(s.gapMs || 0),
        label: s.remSafe === 1
          ? `Flagged mine with 1 safe square left (${Math.round(s.gapMs || 0)} ms) instead of clicking to win`
          : `Placed ${s.endgameUnused ? 'unused' : '1-square-only'} flag with ${s.remSafe} safe squares left (${Math.round(s.gapMs || 0)} ms)`,
        crop: s.crop,
      });
      continue;
    }
    // Unproven guess while safe moves existed
    if (s.techId === 'unproven-guess' && s.easyElsewhere >= 1 && s.gapMs >= 350) {
      flushStreak();
      episodes.push({
        kind: 'guess-past-safe',
        atMs,
        durMs: Math.round(s.gapMs),
        label: `Unproven guess (${Math.round(s.gapMs)} ms) while ${s.easyElsewhere} counting moves were open`,
        crop: s.crop,
      });
      continue;
    }
    // Fast counting streak
    if (s.tier === 'counting' && s.gapMs !== null && s.gapMs < MIND_MAP_SLOW_MS) {
      if (!streak) streak = { startMs: atMs, count: 0, totalMs: 0 };
      streak.count++;
      streak.totalMs += s.gapMs;
    } else {
      flushStreak();
    }
  }
  flushStreak();

  // Merge abandoned visual checks where a move was missed or exhaustive 4+ was passed over
  for (const ch of checks) {
    if (ch.regime === 'no-local-move') continue;
    const atMs = Math.max(0, Math.round(ch.t - startedAtT));
    const desc = ch.regime === 'unflagged-exhaustive-4plus' ? 'Hovered near ready 4/5/6/7 and walked away'
      : ch.regime === 'missed-counting-safe' ? 'Hovered near counting-safe square and walked away'
        : ch.regime === 'unflagged-counting-mine' ? 'Hovered near counting mine and walked away'
          : 'Hovered near solvable overlap shape and walked away';
    episodes.push({
      kind: 'abandoned-hover',
      atMs,
      durMs: Math.round(ch.durMs),
      label: `${desc} (${Math.round(ch.durMs)} ms)`,
      crop: ch.crop,
    });
  }

  episodes.sort((a, b) => a.atMs - b.atMs);
  return episodes.slice(0, 40);
}

// Replay and analyze one traced Standard game across all mind-map dimensions.
function mindMapAnalyzeGame(record, trace, boardSpec, deps, options = {}) {
  const board = { width: boardSpec.width, height: boardSpec.height, mines: boardSpec.mines };
  let earlier = undefined;
  let lastRevealedCount = -1;
  const groupCounts = new Map();

  // Track newly visible exhaustive 4 and 5+ numbers (first time they appear with rem === cov.length)
  const exhSeen = new Map(); // cellIdx -> { val, fresh, appearedStep, flaggedStep, appearedT, flaggedT }
  let stepCounter = 0;

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
            appearedStep: stepCounter,
            appearedT: event.t,
            flaggedStep: null,
            flaggedT: null,
          });
        }
      }
    }

    const willFlag = event.kind === 'rdown' && !view.revealed[event.index] && !view.flagged[event.index];
    const willReveal = event.kind === 'lup' && !view.revealed[event.index] && !view.flagged[event.index];
    let classified = null;
    let easyElsewhere = 0;
    let crop = null;

    if (willFlag || willReveal) {
      classified = mindMapClassifyStep({ kind: willFlag ? 'flag' : 'reveal', index: event.index }, view, board, earlier);
      easyElsewhere = mindMapCountEasyElsewhere(earlier, view, board, event.index);
      if (options.captureCrops || (classified && (classified.tier === 'coupled' || classified.tier === 'overlap'))) {
        crop = mindMapCrop(view, board, event.index, willFlag ? 'mine' : 'safe');
      }
      if (willFlag && record.outcome === 'win') {
        for (const n of view.around[event.index]) {
          const entry = exhSeen.get(n);
          if (entry && entry.flaggedStep === null) {
            entry.flaggedStep = stepCounter;
            entry.flaggedT = event.t;
          }
        }
      }
    } else if (event.kind === 'lup' && view.revealed[event.index] && view.adjacent[event.index] > 0) {
      const info = mindMapCellInfo(view, event.index, board.width);
      if (info.cov.length > 0 && info.rem === 0) {
        classified = mindMapClassifyStep({ kind: info.cov.length === 1 ? 'chord-single' : 'chord-multi', index: event.index }, view, board, earlier);
      }
    }

    // Store lightweight snapshot for pointer hover-check classification on Expert games
    if (options.scanPointer && (willFlag || willReveal || (classified && classified.techId.startsWith('chord-')))) {
      stepSnapshots.push({
        t: event.t,
        index: event.index,
        view: {
          revealed: new Uint8Array(view.revealed),
          flagged: new Uint8Array(view.flagged),
          adjacent: view.adjacent,
          around: view.around,
        },
        proof: earlier,
      });
    }

    stepCounter++;
    return { remSafe, classified, easyElsewhere, crop };
  });

  if (replay.status !== 'replayed') return null;

  const layouts = mindMapLayoutsOf(trace, board);
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

  let flagIdx = 0;
  let lastNoopT = -Infinity;
  let inBurst = false;
  let prevWasNoop = false;
  let startedAtT = null;
  const stepRecords = [];

  for (let i = 0; i < replay.steps.length; i++) {
    const s = replay.steps[i];
    if (s.kind === 'first-reveal') {
      startedAtT = s.t;
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
      prevWasNoop = true;
      continue;
    }

    if (s.gapMs !== null && s.gapMs >= MIND_MAP_MIN_GAP_MS && s.gapMs <= MIND_MAP_MAX_GAP_MS) {
      if (prevWasNoop) noops.postNoopGaps.push(s.gapMs);
      else noops.normalGaps.push(s.gapMs);
    }
    prevWasNoop = false;

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
        endgame.end5WasteMs += s.gapMs || 0;
        endgamePointless = true;
        endgameUnused = unused;
      }
      if (record.outcome === 'win' && remSafe === 1 && !ep.removed) {
        endgame.last1Flags++;
        endgame.last1Ms += s.gapMs || 0;
        endgamePointless = true;
      }
    }

    const cls = s.before && s.before.classified;
    if (cls && s.gapMs !== null && s.gapMs >= MIND_MAP_MIN_GAP_MS && s.gapMs <= MIND_MAP_MAX_GAP_MS) {
      const prevStep = replay.steps[i - 1];
      const ptr = prevStep ? mindMapPointerTiming(trace, layouts, prevStep.t, s.t, s.index, board) : { hoverMs: null, reactMs: null };
      moves.push({
        techId: cls.techId,
        tier: cls.tier,
        isFlag: s.kind === 'flag',
        gapMs: s.gapMs,
        hoverMs: ptr.hoverMs,
        reactMs: ptr.reactMs,
        easyElsewhere: s.before.easyElsewhere || 0,
        crop: s.before.crop || null,
      });
    }

    if (options.buildEpisodes) {
      stepRecords.push({
        t: s.t,
        gapMs: s.gapMs,
        techId: cls ? cls.techId : null,
        tier: cls ? cls.tier : null,
        easyElsewhere: s.before ? s.before.easyElsewhere || 0 : 0,
        remSafe: s.before ? s.before.remSafe : 99,
        endgamePointless,
        endgameUnused,
        crop: s.before ? s.before.crop : null,
      });
    }
  }

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
    checks: pointer.checks,
    reversals: pointer.reversals,
    episodes,
  };
}

function mindMapAggregateTechniques(gameList, expertWinsCount) {
  const buckets = new Map();
  for (const t of MIND_MAP_TECHNIQUES) {
    buckets.set(t.id, { gaps: [], hovers: [], easyElsewhere: 0, slow600: 0, fluent: 0, extraBailMs: 0, sampleCrop: null });
  }
  for (const g of gameList) {
    for (const m of g.moves) {
      const b = buckets.get(m.techId);
      if (!b) continue;
      b.gaps.push(m.gapMs);
      if (m.hoverMs !== null && m.hoverMs >= 0 && m.hoverMs <= 5000) b.hovers.push(m.hoverMs);
      if (m.easyElsewhere >= 2) {
        b.easyElsewhere++;
        if (m.gapMs > MIND_MAP_BASELINE_MS) b.extraBailMs += (m.gapMs - MIND_MAP_BASELINE_MS);
      }
      if (m.gapMs >= MIND_MAP_SLOW_MS) b.slow600++;
      if (m.gapMs <= MIND_MAP_FLUENT_MS) b.fluent++;
      if (!b.sampleCrop && m.crop && (m.gapMs >= MIND_MAP_SLOW_MS || m.tier === 'coupled')) {
        b.sampleCrop = m.crop;
      }
    }
  }

  return MIND_MAP_TECHNIQUES.map((t) => {
    const b = buckets.get(t.id);
    const n = b.gaps.length;
    const medMs = n > 0 ? Math.round(mindMapMedian(b.gaps)) : null;
    const p90Ms = n > 0 ? Math.round(mindMapPercentile(b.gaps, 0.9)) : null;
    const hoverMs = b.hovers.length >= 5 ? Math.round(mindMapMedian(b.hovers)) : null;
    const slowPct = n > 0 ? Math.round(100 * b.slow600 / n) : null;
    const easyPct = n > 0 ? Math.round(100 * b.easyElsewhere / n) : null;
    const bailSecPerWin = expertWinsCount > 0 ? b.extraBailMs / (expertWinsCount * 1000) : 0;

    let advice = 'low-n';
    if (n >= 5) {
      if (t.tier !== 'counting' && medMs >= MIND_MAP_BAIL_MED_MS && easyPct >= MIND_MAP_BAIL_EASY_PCT) {
        advice = 'bail-first';
      } else if (medMs >= 380 || slowPct >= 25) {
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
      p90Ms,
      hoverMs,
      slowPct,
      easyPct,
      bailSecPerWin,
      advice,
    };
  }).filter((row) => row.n > 0)
    .sort((a, b) => (b.medMs || 0) - (a.medMs || 0));
}

function mindMapSummarize(gameResults, expertRecords = []) {
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

  // Endgame pointless flagging summary on Expert (and all levels)
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

  // No-op root cause & rhythm disruption on Expert
  const noopHabit = exp.reduce((s, g) => s + g.noops.habit, 0);
  const noopPhysical = exp.reduce((s, g) => s + g.noops.physical, 0);
  const noopTotal = noopHabit + noopPhysical;
  const noopBurstsPerWin = expN > 0 ? exp.reduce((s, g) => s + g.noops.bursts, 0) / expN : 0;
  const postNoopMedMs = mindMapMedian(exp.flatMap((g) => g.noops.postNoopGaps));
  const normalMedMs = mindMapMedian(exp.flatMap((g) => g.noops.normalGaps));
  const postNoopPenaltyMs = postNoopMedMs !== null && normalMedMs !== null ? Math.round(postNoopMedMs - normalMedMs) : null;

  // Exhaustive 4/5+ summary on Expert
  const exhFreshTotal = exp.reduce((s, g) => s + g.exh4Plus.freshTotal, 0);
  const exhFreshSkipped = exp.reduce((s, g) => s + g.exh4Plus.freshSkipped, 0);
  const exhPartialTotal = exp.reduce((s, g) => s + g.exh4Plus.partialTotal, 0);
  const exhPartialSkipped = exp.reduce((s, g) => s + g.exh4Plus.partialSkipped, 0);

  // Pointer abandoned visual checks & reversals on Expert
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

  // Slow solvable patterns while easy counting moves existed elsewhere (Expert)
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

  // Left vs right hover asymmetry on Expert
  const leftHovers = exp.flatMap((g) => g.moves.filter((m) => !m.isFlag && m.hoverMs !== null && m.hoverMs <= 2000).map((m) => m.hoverMs));
  const rightHovers = exp.flatMap((g) => g.moves.filter((m) => m.isFlag && m.hoverMs !== null && m.hoverMs <= 2000).map((m) => m.hoverMs));
  const leftHoverMs = leftHovers.length >= 20 ? Math.round(mindMapMedian(leftHovers)) : null;
  const rightHoverMs = rightHovers.length >= 20 ? Math.round(mindMapMedian(rightHovers)) : null;

  // Expert technique lookups for traits & highlights
  const expTechById = new Map(techniques.Expert.map((t) => [t.id, t]));
  const noflagRev = expTechById.get('reveal-counting-noflag');
  const afterFlagRev = expTechById.get('reveal-counting-after-flag');
  const noflagPenaltyMs = noflagRev && afterFlagRev && noflagRev.n >= 10 && afterFlagRev.n >= 10
    ? noflagRev.medMs - afterFlagRev.medMs : null;

  // Upper-tail 3BV/s breakout from all Expert wins
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

  // Ranked performance traits (sorted by impact cost descending so top bottlenecks come first)
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
        help: 'Share of overlap and multi-clue moves taking 600 ms+ while at least two counting moves were open elsewhere.',
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
        label: 'No-flag counting hesitation',
        valueNum: (noflagPenaltyMs >= 0 ? '+' : '\u2212') + Math.abs(noflagPenaltyMs),
        valueUnit: 'ms',
        benchmark: '<40 ms',
        costSec: Math.max(0, (noflagPenaltyMs * (noflagRev.n / expN)) / 1000),
        status: noflagPenaltyMs >= 80 ? 'bottleneck' : noflagPenaltyMs >= 40 ? 'watch' : 'strong',
        sample: noflagRev.n,
        sampleUnit: 'moves',
        help: 'Extra median time on direct counting reveals without flagging first compared with reveals after flagging.',
      });
    }

    if (leftHoverMs !== null && rightHoverMs !== null) {
      const diff = leftHoverMs - rightHoverMs;
      addTrait({
        id: 'left-hover',
        label: 'Left-click hover over right-click',
        valueNum: (diff >= 0 ? '+' : '\u2212') + Math.abs(diff),
        valueUnit: 'ms',
        benchmark: '<30 ms',
        costSec: Math.max(0, diff * 0.08),
        status: diff >= 50 ? 'watch' : 'strong',
        sample: leftHovers.length,
        sampleUnit: 'clicks',
        help: `Median dwell inside the target square before left-click release (${leftHoverMs} ms) versus right-click press (${rightHoverMs} ms).`,
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

  // Automatic notable highlights (strict thresholds so only genuine findings surface)
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
  const bailTechs = techniques.Expert.filter((t) => t.advice === 'bail-first' && t.n >= 10).slice(0, 3);
  if (bailSecPerWin >= 1.5 && bailTechs.length > 0) {
    highlights.push({
      severity: 'bottleneck',
      priority: 95,
      title: 'Move elsewhere before wrestling slow solvable shapes',
      metric: `${bailSecPerWin.toFixed(1)} s/win extra`,
      detail: `${bailSlow600} slow moves (600 ms+) happened while 2+ counting moves sat open elsewhere. Top skip-first shapes: ${bailTechs.map((t) => `${t.label} (${t.medMs} ms, n=${t.n})`).join('; ')}.`,
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
  const slowKnown = techniques.Expert.find((t) => (t.id === 'flag-edge-1-2-1' || t.id === 'flag-1-2-interior') && t.n >= 25 && t.medMs >= 420);
  if (slowKnown) {
    highlights.push({
      severity: 'watch',
      priority: 80,
      title: `${slowKnown.label} is not automatic yet`,
      metric: `${slowKnown.medMs} ms median`,
      detail: `Takes ${slowKnown.medMs} ms median (${slowKnown.p90Ms} ms 90th, ${slowKnown.slowPct}% at 600 ms+, n=${slowKnown.n}) compared with ~260 ms on memorized counting moves.`,
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
  highlights.sort((a, b) => b.priority - a.priority);

  // Recent Expert win thinking reconstructions (newest first)
  const recentGames = exp
    .filter((g) => g.episodes !== null)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, MIND_MAP_RECENT_EXPERT_TRACES)
    .map((g) => ({
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
      episodes: g.episodes,
    }));

  return {
    counts: {
      all: gameResults.length,
      Expert: byLevel.Expert.length,
      Intermediate: byLevel.Intermediate.length,
      Beginner: byLevel.Beginner.length,
    },
    highlights: highlights.slice(0, 6),
    rankedTraits,
    techniques,
    endgame,
    pointer: {
      checksPerWin,
      checkSecPerWin,
      reversalsPerWin,
      checkRegimes,
      leftHoverMs,
      rightHoverMs,
    },
    noops: {
      total: noopTotal,
      habit: noopHabit,
      physical: noopPhysical,
      burstsPerWin: noopBurstsPerWin,
      postNoopPenaltyMs,
    },
    recentGames,
  };
}

const MindMap = {
  KEYS: MIND_MAP_KEYS,
  SAMPLE_CAPS: MIND_MAP_SAMPLE_CAPS,
  RECENT_EXPERT_TRACES: MIND_MAP_RECENT_EXPERT_TRACES,
  TECHNIQUES: MIND_MAP_TECHNIQUES,
  diagram: mindMapDiagram,
  crop: mindMapCrop,
  analyzeGame: mindMapAnalyzeGame,
  summarize: mindMapSummarize,
};

if (typeof module !== 'undefined' && module.exports) module.exports = MindMap;
