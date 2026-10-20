'use strict';

// The game data chart: the pure ranking of this board's traits and the label
// layout, then the 0–100% band with its distributions, configuration, and
// session-history views.

//-------GAME DATA RANKING (pure: board trait rows, label layout)-------

// Board values use the player's preferred directions. The matching-trait
// solve-time pools still drive the separate tables, not these markers. A
// trait ranks against every board so far with these settings, won or lost,
// and against the session's boards, the two pools the points switch picks.
function boardTraitRankProfile(record, comparisons, records, sessionDefinition) {
  if (record.outcome !== 'win') return [];
  const past = records.filter((r) => r.endedAt <= record.endedAt);
  const session = SessionScope.records(past, sessionDefinition, record.endedAt);
  return comparisons.filter((c) => c.rawValue).flatMap((comparison) => {
    const spec = { id: comparison.measurementId, name: comparison.trait, allOutcomes: true,
      higher: comparison.higher, value: comparison.rawValue, format: comparison.format,
      help: BOARD_TRAIT_DEFINITIONS[comparison.measurementId] };
    // Session boards are a subset of lifetime, so a session row implies a lifetime row.
    const poolRows = [['lifetime', past], ['session', session]]
      .map(([scope, pool]) => GameData.rankedRow(record, pool, spec, scope, {}, 'boards'))
      .filter((row) => row !== null).map((row) => ({ ...row, side: 'board' }));
    if (poolRows.length === 0) return [];
    const values = (pool) => pool.map((r) => comparison.rawValue(r)).filter(Number.isFinite);
    return GameData.addDistributions(poolRows, { lifetime: values(past), session: values(session) },
      comparison.format, comparison.step?.(record));
  });
}

// Fit labels near their exact points with a minimum gap. Pool-adjacent-
// violators minimizes squared displacement while preserving rank order;
// subtracting the gaps turns label spacing into a monotonicity constraint.
function boardTraitLabelLayout(rows, top, height, gap, domain = [0, 100]) {
  const sorted = rows.slice().sort((a, b) => a.percentile - b.percentile);
  const offsets = [0];
  for (let i = 1; i < sorted.length; i++) {
    const spacing = sorted[i].labelHeight === undefined ? gap
      : (sorted[i - 1].labelHeight + sorted[i].labelHeight) / 2 + 2;
    offsets[i] = offsets[i - 1] + spacing;
  }
  const pointY = (row) => top + (row.percentile - domain[0]) / (domain[1] - domain[0]) * height;
  const blocks = [];
  for (const [index, row] of sorted.entries()) {
    blocks.push({ sum: pointY(row) - offsets[index], start: index, count: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.sum / a.count <= b.sum / b.count) break;
      blocks.splice(-2, 2, { sum: a.sum + b.sum, start: a.start, count: a.count + b.count });
    }
  }
  const positions = [];
  for (const block of blocks) {
    const base = Math.max(top, Math.min(top + height - offsets[sorted.length - 1], block.sum / block.count));
    for (let i = block.start; i < block.start + block.count; i++) {
      positions.push({ ...sorted[i], pointY: pointY(sorted[i]), labelY: base + offsets[i] });
    }
  }
  return positions;
}

//-------GAME DATA CHART (the 0–100% band)-------

// One standing scale for the whole report (docs/product/ui-doctrine.md):
// green is better, red is worse. Marks on white fade through a light
// neutral; the bar fades through white behind its black decile labels.
const STANDING_MARK_STOPS = [[79, 184, 119], [214, 214, 214], [224, 112, 110]];
const STANDING_BAR_STOPS = [[143, 214, 160], [255, 255, 255], [243, 166, 166]];

function standingColor(percentile, stops) {
  const [from, to, fraction] = percentile <= 50 ? [stops[0], stops[1], percentile / 50]
    : [stops[1], stops[2], (percentile - 50) / 50];
  return 'rgb(' + from.map((value, i) => Math.round(value + (to[i] - value) * fraction)).join(', ') + ')';
}

const GAME_DATA_POOL_LABELS = { lifetime: 'lifetime', session: 'session' };
// A no-mark win's game data ranks only no-mark games, so the pool names
// say that instead of the shared "lifetime" / "session".
let gameDataNoMark = false;
function gameDataPoolLabel(scope) {
  if (!gameDataNoMark) return GAME_DATA_POOL_LABELS[scope];
  if (scope === 'lifetime') return 'no-mark';
  if (scope === 'session') return 'no-mark session';
  return GAME_DATA_POOL_LABELS[scope];
}
// The two sides of the one chart. Each side's title opens and closes it,
// remembered across games; a closed side keeps only its title.
const GAME_DATA_SIDES = [
  { side: 'performance', panel: 'gamePerformance', title: 'game summary perf' },
  { side: 'board', panel: 'boardTraits', title: 'board traits' },
];
function gameDataSideOpen(side) {
  return settings.panels[GAME_DATA_SIDES.find((entry) => entry.side === side).panel];
}
// A side's title: the button that opens and closes the side.
function gameDataSideTitle({ side, panel, title: text }, toggled) {
  const title = document.createElement('div');
  title.className = 'game-data-side-title';
  title.dataset.side = side;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'stat-section-toggle';
  toggle.textContent = text;
  toggle.setAttribute('aria-expanded', String(settings.panels[panel]));
  toggle.addEventListener('click', () => {
    rememberPanel(panel, !settings.panels[panel]);
    toggle.setAttribute('aria-expanded', String(settings.panels[panel]));
    toggled();
  });
  title.append(toggle);
  return title;
}
// Moving a laid-out view's nodes drops the page focus; give it back.
function restoreGameDataFocus(focused) {
  if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
}
// Band geometry at full size; the band scales all of it, with its text,
// by --game-data-scale when it would not otherwise fit its box.
const GAME_DATA_BAR_WIDTH = 32;
// The narrowest leader run between a side's rows and the bar; spare width
// lengthens it by up to GAME_DATA_LEADER_EXTRA before centering the rest.
const GAME_DATA_LEADER_WIDTH = 14;
const GAME_DATA_LEADER_EXTRA = 26;
const GAME_DATA_COLUMN_GAP = 8;

function gameDataCell(className, text) {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function gameDataPercentText(row) {
  return Math.round(row.percentile) + '%';
}

// One item per measurement, with a row per pool it ranks in.
function gameDataItems(rows) {
  const items = [];
  for (const row of rows) {
    let item = items.find((i) => i.side === row.side && i.metricId === row.metricId);
    if (!item) {
      item = { side: row.side, metricId: row.metricId, name: row.name, valueText: row.valueText, pools: {} };
      items.push(item);
    }
    item.pools[row.scope] = row;
  }
  return items;
}

// Session games are lifetime games, so only a session rank can be missing.
// Both views list the measurements without one instead of dropping them.
function gameDataUnrankedNote(items) {
  const unranked = items.filter((item) => !item.pools.session);
  if (!unranked.length) return null;
  const note = document.createElement('p');
  note.className = 'game-data-unplotted';
  note.textContent = (unranked.length < items.length ? 'Not ranked in this session yet: '
    + unranked.map((item) => item.name).join(', ') : 'No session ranks yet')
    + '. A session rank needs two measured games in the session window.';
  return note;
}

// A chart heading's copy of this game's value and lifetime standing.
function gameDataChartChip(row) {
  const chip = gameDataCell('game-data-chart-chip', 'this ' + row.valueText + ' · ' + gameDataPercentText(row));
  chip.style.setProperty('--standing', standingColor(row.percentile, STANDING_MARK_STOPS));
  chip.title = gameDataPoolLabel(row.scope) + ': ' + row.standingText;
  return chip;
}

// The charts below that plot one measurement; hovering its row outlines them.
function linkGameDataCharts(metricId, linked) {
  for (const chart of resultRanks.querySelectorAll('[data-measurement="' + metricId + '"]')) {
    chart.classList.toggle('game-data-linked', linked);
  }
}

// One pool's games on its measurement's lifetime axis, drawn at its box's
// size in px with x ticks, so it is the whole drawing (creator 2026-10-20:
// "why not just always show the better version"). A pool that carries its
// values (at most 30 games) is one dot per game at its exact value, touching
// dots stacked, each colored by that game's standing in the pool, when its
// tallest stack fits the strip; otherwise, and for a larger pool, bars count
// its games per value range, colored by their mean standing, none wider than
// a few labels' width, so a pool of one value is not one bar across the
// strip. This game's dot or bar takes the this-game color under a pin at
// its value; a game past the fence pins the axis end, and the value column
// has its number. Better is always on the left, so a higher-is-better
// measurement's axis runs from its highest value at the left to its lowest
// at the right. A tick label that would crowd the one to its left is left
// out, with its tick. Sizes are px at scale 1.
const GAME_DATA_STRIP = { pin: 5, pinWidth: 8, plotMin: 7, dot: 8, smallestDot: 4, barWidest: 24,
  tick: 3, labelGap: 1, label: 9, labelSpace: 6 };
const GAME_DATA_STRIP_SHORTEST = GAME_DATA_STRIP.pin + GAME_DATA_STRIP.plotMin + GAME_DATA_STRIP.tick
  + GAME_DATA_STRIP.labelGap + GAME_DATA_STRIP.label;
function gameDataStrip(row, width, height, scale) {
  const d = row.distribution;
  const px = (size) => size * scale;
  const labelPx = px(GAME_DATA_STRIP.label);
  const base = height - px(GAME_DATA_STRIP.tick + GAME_DATA_STRIP.labelGap) - labelPx;
  const top = px(GAME_DATA_STRIP.pin);
  const room = base - top;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'game-data-histogram');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('aria-hidden', 'true');
  const add = (name, attributes) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    svg.appendChild(node);
    return node;
  };
  const x = (value) => (row.higher ? d.hi - value : value - d.lo) / (d.hi - d.lo) * width;
  // Each dot rests on the lowest level where it touches no earlier dot; a
  // stack too tall for the plot shrinks every dot, down to the smallest.
  const stack = (size) => {
    const placed = [];
    for (const value of d.values) {
      let level = 0;
      while (placed.some((dot) => dot.level === level && Math.abs(dot.x - x(value)) < size)) level++;
      placed.push({ value, x: x(value), level });
    }
    return placed;
  };
  const fits = (placed, size) => (Math.max(...placed.map((dot) => dot.level)) + 1) * size <= room;
  let size = Math.min(px(GAME_DATA_STRIP.dot), room);
  let placed = d.values === undefined ? null : stack(size);
  while (placed !== null && size > GAME_DATA_STRIP.smallestDot && !fits(placed, size)) placed = stack(--size);
  if (placed !== null && fits(placed, size)) {
    const n = d.values.length;
    const standing = (v) => {
      if (d.values.every((other) => other === v)) return 50;
      const better = d.values.filter((other) => row.higher ? other > v : other < v).length;
      return 100 * (better + (d.values.filter((other) => other === v).length - 1) / 2) / (n - 1);
    };
    const mine = placed.find((dot) => dot.value === row.value);
    for (const dot of placed) {
      add('circle', { class: dot === mine ? 'game-data-histogram-dot game-data-strip-this' : 'game-data-histogram-dot',
        cx: Math.max(size / 2, Math.min(width - size / 2, dot.x)), cy: base - size * (dot.level + 0.5), r: size / 2 - 0.3,
        ...(dot === mine ? {} : { fill: standingColor(standing(dot.value), STANDING_MARK_STOPS) }) });
    }
  } else {
    const most = Math.max(...d.counts);
    // A point mass (half the games at one rate, the rest spread thin) would
    // otherwise draw every other bar at 1px. The tallest stays the tallest.
    // When it is at least 6× the next, that next bar is drawn at half height
    // and the shorter bars keep their ratios to it.
    const next = d.counts.reduce((best, count) => count < most ? Math.max(best, count) : best, 0);
    const peakGap = next > 0 && most / next >= 6;
    const binWidth = width / d.bins;
    const barWidth = Math.max(1, Math.min(binWidth - 1, px(GAME_DATA_STRIP.barWidest)));
    const valueBin = row.value >= d.lo && row.value <= d.hi
      ? Math.min(d.bins - 1, Math.floor((row.value - d.lo) / (d.hi - d.lo) * d.bins)) : -1;
    d.counts.forEach((count, i) => {
      if (count === 0) return;
      const share = peakGap && count < most ? 0.5 * count / next : count / most;
      const barHeight = Math.max(1, share * room);
      const slot = row.higher ? d.bins - 1 - i : i;
      add('rect', { x: slot * binWidth + (binWidth - barWidth) / 2, y: base - barHeight, width: barWidth, height: barHeight,
        ...(i === valueBin ? { class: 'game-data-strip-this' } : { fill: standingColor(d.standing[i], STANDING_MARK_STOPS) }) });
    });
  }
  const half = px(GAME_DATA_STRIP.pinWidth) / 2;
  const pinX = Math.max(half, Math.min(width - half, x(row.value)));
  add('path', { class: 'game-data-strip-pin',
    d: 'M ' + (pinX - half) + ' 0 L ' + (pinX + half) + ' 0 L ' + pinX + ' ' + top + ' Z' });
  add('line', { class: 'game-data-histogram-axis', x1: 0, x2: width, y1: base, y2: base });
  const font = labelPx + 'px Arial, Helvetica, sans-serif';
  let right = -Infinity;
  for (const label of d.labels.map((entry) => ({ ...entry, at: x(entry.value) })).sort((a, b) => a.at - b.at)) {
    const textWidth = chartTextWidth(label.text, font);
    const left = Math.max(0, Math.min(width - textWidth, label.at - textWidth / 2));
    if (left < right + px(GAME_DATA_STRIP.labelSpace)) continue;
    right = left + textWidth;
    add('line', { class: 'game-data-histogram-tick', x1: label.at, x2: label.at, y1: base, y2: base + px(GAME_DATA_STRIP.tick) });
    add('text', { x: left, y: height - labelPx * 0.2, 'font-size': labelPx }).textContent = label.text;
  }
  return svg;
}

//-------GAME DATA CARD (rank, strip, example board, definition)-------

// The example boards of the game whose game data is on the page (creator
// 2026-10-20: "visible UI examples of what the number or trait means", drawn
// in the player's board style), from the reports worker, which holds the
// latest finished or restored game's board and trace. Only that game's board
// is on the page to draw them from; an Endgame drill measures only its
// remnant, so it has none.
let gameDataGameId = null;
let gameDataExamples = null;
function requestGameDataExamples(record) {
  gameDataGameId = record.endedAt;
  if (!duringGameAvailable(record) || record.playMode === 'endgame-drill') return;
  if (gameDataExamples !== null && gameDataExamples.gameId === record.endedAt) return;
  const request = { gameId: record.endedAt, byMeasurement: null };
  gameDataExamples = request;
  analysisTask('reports', 'game-data-examples', { gameId: record.endedAt, timeMs: record.timeMs, outcome: record.outcome })
    .then((byMeasurement) => { request.byMeasurement = byMeasurement; })
    .catch(analysisFailure);
}

// A performance measurement's example is the board fact or the clicks it
// counts; a board trait's is its own.
const GAME_DATA_EXAMPLE_OF = {
  bvPerSecond: 'bv3', efficiency: 'bv3', ioe: 'bv3', ios: 'bv3', stnb: 'bv3', pathPer3bv: 'bv3',
  ziniEfficiency: 'zini', hziniEfficiency: 'hzini', misclickRate: 'misclickRate', noopRate: 'noopRate',
  correctness: 'noopRate', unusedMarkShare: 'unusedMarkShare', unusedFlagRate: 'unusedMarkShare',
  unflaggedMineShare: 'unflaggedMineShare', moveTime: 'moves', easyWorkLeftShare: 'easyWorkLeft',
  nearestAreaShare: 'forks',
};
function gameDataExampleFor(item) {
  if (gameDataExamples === null || gameDataExamples.byMeasurement === null
      || gameDataExamples.gameId !== gameDataGameId || gameDataGameId !== duringGameSourceId) return undefined;
  return gameDataExamples.byMeasurement[item.side === 'board' ? item.metricId : GAME_DATA_EXAMPLE_OF[item.metricId]];
}

// The counts an example's marks stand for, each after its mark, where the
// measurement's name and value do not already give them.
const gameDataZiniCounts = (example) => [
  ['ring', countPhrase(example.marks.ring.length, 'click', 'clicks')],
  ['dot', countPhrase(example.marks.dot.length, 'chord', 'chords')],
  ['shade', countPhrase(example.marks.shade.length, 'flag', 'flags')]];
const gameDataShareCounts = (example) => [
  ['shade', example.marks.shade.length + ' of ' + countPhrase(example.of, 'safe square', 'safe squares')]];
const GAME_DATA_EXAMPLE_COUNTS = {
  bv3: (example) => [['shade', countPhrase(example.openings, 'opening', 'openings')],
    ['ring', countPhrase(example.marks.ring.length, 'number outside them', 'numbers outside them')]],
  zini: gameDataZiniCounts,
  hzini: gameDataZiniCounts,
  zeroOneShare: gameDataShareCounts,
  zeroOpeningCoverage: gameDataShareCounts,
  workSpread: (example) => [['point', countPhrase(example.spread.points.length, 'work point', 'work points')],
    ['circle', 'their spread around the center']],
  misclickRate: (example) => [['ring', countPhrase(example.clicks, 'misclick', 'misclicks')]],
  noopRate: (example) => [['ring', countPhrase(example.clicks, 'no-op click', 'no-op clicks')]],
  unusedMarkShare: (example) => [['shade', countPhrase(example.marks.shade.length, 'unused flag', 'unused flags')]],
  unflaggedMineShare: (example) => [['shade', example.marks.shade.length + ' of '
    + countPhrase(example.of, 'mine', 'mines') + ' unflagged']],
  moves: (example) => [['ring', countPhrase(example.marks.ring.length, 'move', 'moves')]],
  easyWorkLeft: (example) => [['ring', countPhrase(example.marks.ring.length, 'move leaving easy work', 'moves leaving easy work')],
    ['shade', countPhrase(example.marks.shade.length, 'proven-safe square left', 'proven-safe squares left')]],
  forks: (example) => [['ring', countPhrase(example.marks.ring.length, 'fork', 'forks')]],
};

// The finished board as the game board shows it, in the player's board
// style, with every mine no flag covers shown as a mine, and the example's
// marks over its squares; its squares fit the card.
const GAME_DATA_EXAMPLE_FIT = { width: 314, height: 200, smallest: 5, largest: 20 };
function gameDataExampleBoard(example) {
  const { width, height } = config;
  const cellPx = Math.max(GAME_DATA_EXAMPLE_FIT.smallest, Math.min(GAME_DATA_EXAMPLE_FIT.largest,
    Math.floor(Math.min(GAME_DATA_EXAMPLE_FIT.width / width, GAME_DATA_EXAMPLE_FIT.height / height))));
  const grid = document.createElement('div');
  grid.className = 'game-data-example-board';
  grid.style.setProperty('--cell-size', cellPx + 'px');
  grid.style.gridTemplateColumns = 'repeat(' + width + ', var(--cell-size))';
  const marked = new Map();
  for (const [kind, squares] of Object.entries(example.marks || {})) {
    for (const square of squares) marked.set(square, [...(marked.get(square) || []), kind]);
  }
  const mine = mineSvg(settings.mineStyle);
  finishedBoardCells().forEach((source, i) => {
    const cell = document.createElement('div');
    if (cells[i].mine && !cells[i].flagged && !source.classList.contains('revealed')) {
      cell.className = 'cell revealed';
      cell.innerHTML = mine;
    } else {
      cell.className = source.className;
      cell.innerHTML = source.innerHTML;
    }
    for (const kind of marked.get(i) || []) {
      if (kind === 'dot') cell.appendChild(gameDataCell('game-data-example-dot-mark', ''));
      else cell.classList.add('game-data-example-' + kind);
    }
    grid.appendChild(cell);
  });
  if (example.spread) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'game-data-example-spread');
    svg.setAttribute('width', width * cellPx);
    svg.setAttribute('height', height * cellPx);
    const at = (value) => (value + 0.5) * cellPx;
    const add = (name, attributes) => {
      const node = document.createElementNS(SVG_NS, name);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      svg.appendChild(node);
    };
    for (const point of example.spread.points) {
      add('circle', { class: 'game-data-example-point', cx: at(point.x), cy: at(point.y), r: Math.max(2, cellPx * 0.18) });
    }
    add('circle', { class: 'game-data-example-circle', cx: at(example.spread.center.x), cy: at(example.spread.center.y),
      r: example.spread.radius * cellPx });
    grid.appendChild(svg);
  }
  return grid;
}

function gameDataExampleKey(counts) {
  const key = document.createElement('p');
  key.className = 'game-data-example-key';
  for (const [kind, text] of counts) {
    const entry = document.createElement('span');
    entry.className = 'game-data-example-key-entry';
    entry.append(gameDataCell('game-data-example-swatch game-data-example-swatch-' + kind, ''), text);
    key.appendChild(entry);
  }
  return key;
}

// The hover card for one pool, the one whose standing placed the row's point
// (or whose strip was hovered). It holds only what the row and the panel do
// not already show (creator 2026-10-08: "just cut all the fluff"): the pool's
// rank; its games on the measurement's axis when the row has no strip; this
// game's board showing what the measurement counts, in the player's board
// style; and, last, a definition where the name leaves the measurement open.
const GAME_DATA_CARD_STRIP = { width: 314, height: 72 };
function fillGameDataCard(tip, item, scope, withStrip) {
  const card = document.createElement('div');
  card.className = 'game-data-card';
  card.dataset.pool = scope;
  const paragraph = (className, text) => {
    const node = document.createElement('p');
    node.className = className;
    node.textContent = text;
    return node;
  };
  const row = item.pools[scope];
  const standing = paragraph('game-data-card-standing', '');
  standing.append(gameDataCell('game-data-card-pool', gameDataPoolLabel(scope) + ':'), ' ', row.standingText);
  card.appendChild(standing);
  if (withStrip) card.appendChild(gameDataStrip(row, GAME_DATA_CARD_STRIP.width, GAME_DATA_CARD_STRIP.height, 1));
  const example = gameDataExampleFor(item);
  if (example !== undefined) {
    const key = item.side === 'board' ? item.metricId : GAME_DATA_EXAMPLE_OF[item.metricId];
    card.appendChild(gameDataExampleBoard(example));
    if (GAME_DATA_EXAMPLE_COUNTS[key]) card.appendChild(gameDataExampleKey(GAME_DATA_EXAMPLE_COUNTS[key](example)));
  }
  if (row.definition) card.appendChild(paragraph('game-data-card-definition', row.definition));
  tip.appendChild(card);
}

// The band: each side's rows in aligned single-line columns, joined by
// leaders to dots on the bar's edge at their standing, under its title
// centered over them. Both sides share the bar, so their standings read on
// one scale. A closed side, or one with no rank in the plotted pool, keeps
// only its title (`titles`, one per side with rows). Columns are measured,
// then plans are tried in order: both sides around one bar with both
// percentage columns, then with only the plotted one, then, with both sides
// drawn, the sides stacked, each with its own bar and both sides' rows on its
// left. The band never scrolls: the plan that needs the least shrinking wins
// (the earlier one on a tie), and the whole band scales to fit its box. The
// name columns have no head: the board is the one the preset links or the
// mode options name, and every pool holds its games alone (creator
// 2026-10-20: never copy a fact visible in its canonical place).
function buildGameDataBand(rows, pool, valuesShown, titles) {
  const items = gameDataItems(rows);
  const element = document.createElement('div');
  element.className = 'game-data-band';
  const perfPools = ['session', 'lifetime'].filter((scope) => items.some((item) => item.pools[scope] && item.side === 'performance'));
  let stacked = false;
  const bars = {};

  function poolCell(item, scope) {
    const row = item.pools[scope];
    const cell = gameDataCell('game-data-pct', row ? gameDataPercentText(row) : '');
    cell.dataset.pool = scope;
    cell.classList.toggle('plotted', scope === pool);
    return cell;
  }
  // The card opens across the bar from its row, so it never covers that
  // side's rows, and stays inside the viewport.
  function placeCard(item, tip, rect) {
    const bar = bars[item.side].getBoundingClientRect();
    const right = item.side === 'performance' || stacked;
    const left = right ? bar.right + 10 : bar.left - 10 - tip.offsetWidth;
    return {
      left: Math.max(4, Math.min(left, window.innerWidth - tip.offsetWidth - 6)),
      top: Math.max(4, Math.min(rect.top + rect.height / 2 - tip.offsetHeight / 2,
        window.innerHeight - tip.offsetHeight - 4)),
    };
  }
  function rowElement(item) {
    const wrap = chartHelpButton((tip) => fillGameDataCard(tip, item, pool, true), item.name,
      (tip, rect) => placeCard(item, tip, rect));
    wrap.classList.add('game-data-row');
    wrap.dataset.side = item.side;
    wrap.dataset.measurement = item.metricId;
    const button = wrap.querySelector('button');
    button.replaceChildren(...(item.side === 'performance'
      ? [gameDataCell('game-data-name', item.name), gameDataCell('game-data-value', item.valueText),
        ...perfPools.map((scope) => poolCell(item, scope))]
      : [poolCell(item, pool), gameDataCell('game-data-name', item.name),
        gameDataCell('game-data-value', item.valueText)]));
    button.setAttribute('aria-label', item.name + ' ' + item.valueText + ': ' + Object.entries(item.pools)
      .filter(([scope]) => item.side === 'performance' || scope === pool)
      .map(([scope, row]) => gameDataPoolLabel(scope) + ' ' + gameDataPercentText(row)).join(', '));
    wrap.addEventListener('mouseenter', () => linkGameDataCharts(item.metricId, true));
    wrap.addEventListener('mouseleave', () => linkGameDataCharts(item.metricId, false));
    button.addEventListener('focus', () => linkGameDataCharts(item.metricId, true));
    button.addEventListener('blur', () => linkGameDataCharts(item.metricId, false));
    return wrap;
  }
  function headCell(className, text, scope) {
    const cell = gameDataCell(className, text);
    if (scope) {
      cell.dataset.pool = scope;
      cell.classList.toggle('plotted', scope === pool);
    }
    return cell;
  }
  const sides = GAME_DATA_SIDES.filter(({ side }) => titles[side]).map(({ side }) => {
    const columns = document.createElement('div');
    columns.className = 'game-data-column-heads';
    columns.dataset.side = side;
    columns.append(...(side === 'performance'
      ? [headCell('game-data-name', ''), headCell('game-data-value', 'value'),
        ...perfPools.map((scope) => headCell('game-data-pct', gameDataPoolLabel(scope), scope))]
      : [headCell('game-data-pct', '', pool), headCell('game-data-name', ''), headCell('game-data-value', 'value')]));
    // Both sides plot the switch's pool; a row without a rank there is
    // listed in the note instead.
    return { side, title: titles[side], columns, entries: items.filter((item) => item.side === side && item.pools[pool])
      .map((item) => ({ item, row: rowElement(item), percentile: item.pools[pool].percentile })) };
  });

  // Every size at one scale: measured text, and the fixed geometry scaled.
  // Closed sides measure only their titles.
  function measure(scale, drawn, note) {
    element.style.setProperty('--game-data-scale', String(scale));
    element.removeAttribute('data-pool-columns');
    const measuring = document.createElement('div');
    measuring.className = 'game-data-measuring';
    for (const side of sides) {
      const nodes = [side.title, ...(drawn.includes(side) ? [side.columns, ...side.entries.map((entry) => entry.row)] : [])];
      for (const node of nodes) node.removeAttribute('style');
      for (const entry of side.entries) entry.row.querySelector('button').style.gridTemplateColumns = '';
      measuring.append(...nodes);
    }
    element.replaceChildren(...(note ? [note] : []), measuring);
    const width = (node) => Math.ceil(node.getBoundingClientRect().width);
    const columnWidths = {}, titleWidths = {};
    for (const side of sides) {
      titleWidths[side.side] = width(side.title);
      if (!drawn.includes(side)) continue;
      const holders = [side.columns, ...side.entries.map((entry) => entry.row.querySelector('button'))];
      columnWidths[side.side] = [...side.columns.children].map((_, i) =>
        Math.max(...holders.map((holder) => width(holder.children[i]))));
    }
    return { scale, columnWidths, titleWidths,
      rowHeight: drawn[0].entries[0].row.getBoundingClientRect().height,
      titleHeight: sides[0].title.getBoundingClientRect().height,
      columnHeadHeight: drawn[0].columns.getBoundingClientRect().height,
      noteHeight: note ? note.getBoundingClientRect().height : 0 };
  }
  // A plan's columns and the width and height it needs at a measured scale.
  function geometry(m, plan, drawn) {
    const gap = GAME_DATA_COLUMN_GAP * m.scale;
    const perfWidths = m.columnWidths.performance, boardWidths = m.columnWidths.board;
    const pct = Math.max(...(perfWidths ? perfWidths.slice(2) : []), ...(boardWidths ? [boardWidths[0]] : []));
    const span = (list) => list.reduce((sum, w) => sum + w, 0) + gap * (list.length - 1);
    const value = (w) => valuesShown ? [w] : [];
    const columnsOf = (side) => side === 'performance'
      ? [perfWidths[0], ...value(perfWidths[1]), ...Array(plan.k).fill(pct)]
      : plan.stacked ? [boardWidths[1], ...value(boardWidths[2]), pct] : [pct, boardWidths[1], ...value(boardWidths[2])];
    const isDrawn = (side) => drawn.some((entry) => entry.side === side);
    const sideSpan = (side) => isDrawn(side) ? span(columnsOf(side)) : m.titleWidths[side];
    const barWidth = GAME_DATA_BAR_WIDTH * m.scale, leader = GAME_DATA_LEADER_WIDTH * m.scale;
    const blockSpan = plan.stacked ? Math.max(...drawn.map((side) => sideSpan(side.side))) : 0;
    // A title wider than its columns, centered over them, reaches past the
    // composition's outer edge; the composition is centered, so the band
    // keeps that much room on both sides.
    const overhang = Math.max(0, ...drawn.map((side) => (m.titleWidths[side.side] - sideSpan(side.side)) / 2
      - (plan.stacked ? blockSpan - sideSpan(side.side) : 0)));
    const needWidth = 2 * overhang + (plan.stacked
      ? blockSpan + leader + barWidth
      : sides.reduce((sum, side) => sum + sideSpan(side.side) + leader, 0) + barWidth);
    const headHeight = m.titleHeight + m.columnHeadHeight + 4 * m.scale;
    const pad = Math.max(7 * m.scale, m.rowHeight / 2) + 1;
    const blocks = plan.stacked ? drawn.map((side) => [side]) : [sides];
    const rowsIn = (blockSides) => blockSides.filter((side) => isDrawn(side.side)).map((side) => side.entries.length);
    const blockNeed = (blockSides) => headHeight + Math.max(...rowsIn(blockSides)) * (m.rowHeight + 2) + 2 * pad;
    return { ...plan, m, columnsOf, isDrawn, sideSpan, span, barWidth, leader, blockSpan, needWidth, headHeight, pad, blocks, rowsIn, blockNeed,
      needHeight: blocks.reduce((sum, blockSides) => sum + blockNeed(blockSides), 0) };
  }

  function layout() {
    if (!element.isConnected || element.clientWidth === 0) return;
    const focused = element.contains(document.activeElement) ? document.activeElement : null;
    const drawn = sides.filter((side) => side.entries.length && gameDataSideOpen(side.side));
    const note = pool === 'session' ? gameDataUnrankedNote(items.filter((item) => gameDataSideOpen(item.side))) : null;
    if (drawn.length) layoutDrawn(drawn, note);
    else layoutTitles(note);
    restoreGameDataFocus(focused);
  }
  // Nothing to plot: the titles share one wrapping line.
  function layoutTitles(note) {
    element.style.setProperty('--game-data-scale', '1');
    const line = document.createElement('div');
    line.className = 'game-data-titles';
    for (const side of sides) {
      side.title.removeAttribute('style');
      line.appendChild(side.title);
    }
    element.replaceChildren(...(note ? [note] : []), line);
  }
  function layoutDrawn(drawn, note) {
    const [low, high] = GameData.domain(drawn.flatMap((side) => side.entries.map((entry) => entry.item.pools[pool])));
    const ks = drawn.some((side) => side.side === 'performance') && perfPools.length === 2 ? [2, 1] : [1];
    const plans = [...ks.map((k) => ({ stacked: false, k })), ...(drawn.length === 2 ? ks.map((k) => ({ stacked: true, k })) : [])];
    const available = element.clientWidth;
    const base = measure(1, drawn, note);
    const room = element.clientHeight - base.noteHeight;
    const fit = (g) => Math.min(1, available / g.needWidth, room / g.needHeight);
    const ranked = plans.map((plan) => ({ plan, fit: fit(geometry(base, plan, drawn)) }));
    const best = Math.max(...ranked.map((entry) => entry.fit));
    const plan = ranked.find((entry) => entry.fit >= best - 0.001).plan;
    let g = geometry(base, plan, drawn);
    // Text sizes scale almost, not exactly, with the font: correct until the
    // measured band fits.
    for (let scale = fit(g), pass = 0; scale < 1 && pass < 4; pass++) {
      g = geometry(measure(scale, drawn, note), plan, drawn);
      const over = Math.max(g.needWidth / available, g.needHeight / room);
      if (over <= 1) break;
      scale /= over * 1.01;
    }
    const { m } = g;
    stacked = plan.stacked;
    if (plan.k === 1) element.dataset.poolColumns = '1';
    const contentWidth = Math.max(available, g.needWidth);
    const sideCount = plan.stacked ? 1 : sides.length;
    const lead = g.leader + Math.min(GAME_DATA_LEADER_EXTRA * m.scale, (contentWidth - g.needWidth) / (2 * sideCount));
    const { blockSpan } = g;
    const hasPerf = sides.some((side) => side.side === 'performance');
    const hasBoard = sides.some((side) => side.side === 'board');

    element.replaceChildren();
    if (note) element.appendChild(note);
    const { headHeight, pad, blocks, barWidth } = g;
    const rowHeight = m.rowHeight;
    const rowCount = drawn.reduce((sum, side) => sum + side.entries.length, 0);
    const leaderOf = (block) => {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'game-data-leaders');
      svg.setAttribute('aria-hidden', 'true');
      block.appendChild(svg);
      return svg;
    };
    // Each block gets what it needs plus a share of the spare room by rows,
    // so the blocks together fill the room exactly.
    const spare = Math.max(0, room - g.needHeight);
    for (const blockSides of blocks) {
      const block = document.createElement('div');
      block.className = 'game-data-block';
      block.dataset.orientation = plan.stacked ? 'left' : 'around';
      const height = g.blockNeed(blockSides) + spare * g.rowsIn(blockSides).reduce((sum, n) => sum + n, 0) / rowCount;
      const plotTop = headHeight + pad, plotHeight = height - headHeight - 2 * pad;
      block.style.width = contentWidth + 'px';
      block.style.height = height + 'px';
      // Horizontal positions: left side, bar, right side, centered as a whole.
      const leftSpan = plan.stacked ? blockSpan : (hasPerf ? g.sideSpan('performance') : 0);
      const composition = (leftSpan ? leftSpan + lead : 0) + barWidth
        + (!plan.stacked && hasBoard ? g.sideSpan('board') + lead : 0);
      const margin = (contentWidth - composition) / 2;
      const barX = margin + (leftSpan ? leftSpan + lead : 0);
      const rule = document.createElement('div');
      rule.className = 'game-data-rule';
      Object.assign(rule.style, { left: margin + 'px', width: composition + 'px', top: (headHeight - 2) + 'px' });
      const bar = document.createElement('div');
      bar.className = 'game-data-bar';
      Object.assign(bar.style, { left: barX + 'px', top: plotTop + 'px', width: barWidth + 'px', height: plotHeight + 'px' });
      const stops = [[low, 0], ...(low < 50 && high > 50 ? [[50, (50 - low) / (high - low) * 100]] : []), [high, 100]];
      bar.style.background = 'linear-gradient(' + stops.map(([p, at]) => standingColor(p, STANDING_BAR_STOPS) + ' ' + at + '%').join(', ') + ')';
      for (let decile = Math.ceil(low / 10) * 10; decile <= high; decile += 10) {
        const label = gameDataCell('game-data-decile', decile + '%');
        const y = (decile - low) / (high - low) * plotHeight;
        label.style.top = Math.max(1, Math.min(plotHeight - 13 * m.scale, y - 6 * m.scale)) + 'px';
        bar.appendChild(label);
      }
      block.append(rule, bar);
      const svg = leaderOf(block);
      svg.setAttribute('width', contentWidth);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', '0 0 ' + contentWidth + ' ' + height);
      for (const side of blockSides) {
        const onLeft = plan.stacked || side.side === 'performance';
        const thisSpan = g.sideSpan(side.side);
        const left = onLeft ? barX - lead - thisSpan : barX + barWidth + lead;
        const titleLeft = Math.max(0, Math.min(contentWidth - m.titleWidths[side.side], left + (thisSpan - m.titleWidths[side.side]) / 2));
        Object.assign(side.title.style, { left: titleLeft + 'px', top: '0px' });
        block.appendChild(side.title);
        if (!g.isDrawn(side.side)) continue;
        bars[side.side] = bar;
        const template = g.columnsOf(side.side).map((w) => w + 'px').join(' ');
        Object.assign(side.columns.style, { left: left + 'px', top: m.titleHeight + 'px', width: thisSpan + 'px', gridTemplateColumns: template });
        block.appendChild(side.columns);
        const laid = boardTraitLabelLayout(side.entries.map((entry) => ({ ...entry, labelHeight: rowHeight })),
          plotTop, plotHeight, 0, [low, high]);
        for (const entry of laid) {
          const button = entry.row.querySelector('button');
          button.style.gridTemplateColumns = template;
          Object.assign(entry.row.style, { left: left + 'px', width: thisSpan + 'px', top: (entry.labelY - rowHeight / 2) + 'px' });
          entry.row.dataset.pointY = entry.pointY;
          entry.row.dataset.percentile = entry.percentile;
          const edge = onLeft ? barX : barX + barWidth;
          const start = onLeft ? left + thisSpan + 2 : left - 2;
          const step = onLeft ? 3 : -3;
          const leader = document.createElementNS(SVG_NS, 'path');
          leader.setAttribute('class', 'game-data-leader');
          leader.setAttribute('d', 'M ' + start + ' ' + entry.labelY + ' L ' + (start + step) + ' ' + entry.labelY
            + ' L ' + (edge - step) + ' ' + entry.pointY + ' L ' + edge + ' ' + entry.pointY);
          leader.dataset.displaced = String(Math.abs(entry.labelY - entry.pointY) > 8);
          svg.appendChild(leader);
          const dot = gameDataCell('game-data-dot', '');
          Object.assign(dot.style, { left: edge + 'px', top: entry.pointY + 'px' });
          block.append(entry.row, dot);
        }
      }
      element.appendChild(block);
    }
  }
  return { element, layout };
}

// Every measurement's distribution as a strip: your performance's groups,
// then board traits', one per pool the pools switch shows (lifetime,
// session, or both), each side under its title. All groups share one set of
// columns, so every strip lines up. Rows keep catalog order, so a
// measurement sits at the same place in every group. A row's card shows its
// own group's pool. A closed side keeps only its title. Like the band it
// never scrolls, and the strips take all the height the rows leave (creator
// 2026-10-08: "if i remove items then the remaining ones should expand
// vertically to fill the space"): `layout` gives them the tallest height that
// fits its box, and only below the shortest strip does it shrink the text.
// Each group's pool is named only by its percent column's head.
function buildGameDataDistributions(rows, pools, titles) {
  const element = document.createElement('div');
  element.className = 'game-data-distributions';
  const items = gameDataItems(rows);
  const strips = [];
  const sides = GAME_DATA_SIDES.filter(({ side }) => titles[side]).map(({ side }) => {
    const groups = [];
    for (const scope of pools) {
      const shown = items.filter((item) => item.side === side && item.pools[scope]);
      if (!shown.length) continue;
      const section = document.createElement('section');
      section.className = 'game-data-dist-section';
      section.dataset.side = side;
      section.dataset.pool = scope;
      const head = document.createElement('div');
      head.className = 'game-data-dist-head';
      head.append(gameDataCell('game-data-name', ''), gameDataCell('game-data-value', 'value'),
        gameDataCell('game-data-strip-head', ''), gameDataCell('game-data-pct', gameDataPoolLabel(scope)));
      section.appendChild(head);
      for (const item of shown) {
        const row = item.pools[scope];
        const wrap = chartHelpButton((tip) => fillGameDataCard(tip, item, scope, false), item.name);
        wrap.classList.add('game-data-dist-row');
        wrap.dataset.measurement = item.metricId;
        const button = wrap.querySelector('button');
        const strip = document.createElement('span');
        strip.className = 'game-data-strip';
        strips.push({ strip, row, side, drawn: null });
        button.replaceChildren(gameDataCell('game-data-name', item.name), gameDataCell('game-data-value', item.valueText),
          strip, gameDataCell('game-data-pct', gameDataPercentText(row)));
        button.setAttribute('aria-label', item.name + ' ' + item.valueText + ': ' + gameDataPoolLabel(scope) + ' ' + gameDataPercentText(row));
        wrap.addEventListener('mouseenter', () => linkGameDataCharts(item.metricId, true));
        wrap.addEventListener('mouseleave', () => linkGameDataCharts(item.metricId, false));
        section.appendChild(wrap);
      }
      groups.push(section);
    }
    return { side, title: titles[side], groups };
  });
  // The open sides' groups under their titles; rebuilt only when a side
  // opens or closes.
  let arranged = null;
  function arrange() {
    const key = sides.map((side) => gameDataSideOpen(side.side)).join();
    if (key === arranged) return;
    arranged = key;
    const focused = element.contains(document.activeElement) ? document.activeElement : null;
    // Without the lifetime groups, a measurement with no session rank would
    // vanish, so the note lists it, as the band's does in session mode.
    const note = pools.includes('lifetime') ? null : gameDataUnrankedNote(items.filter((item) => gameDataSideOpen(item.side)));
    const children = note ? [note] : [];
    for (const side of sides) {
      children.push(side.title);
      if (gameDataSideOpen(side.side)) children.push(...side.groups);
    }
    element.replaceChildren(...children);
    restoreGameDataFocus(focused);
  }
  const set = (strip, scale) => {
    element.style.setProperty('--game-data-strip', strip + 'px');
    element.style.setProperty('--game-data-scale', String(scale));
  };
  // Only the open sides' strips are drawn, at the px size of their column,
  // which every strip shares; each keeps the size it was drawn at.
  function draw(strip, scale) {
    const open = strips.filter((entry) => gameDataSideOpen(entry.side));
    if (!open.length) return;
    const width = open[0].strip.clientWidth;
    if (width === 0) return;
    const size = width + ' ' + strip + ' ' + scale;
    for (const entry of open) {
      if (entry.drawn === size) continue;
      entry.drawn = size;
      entry.strip.replaceChildren(gameDataStrip(entry.row, width, strip, scale));
    }
  }
  set(GAME_DATA_STRIP_SHORTEST, 1);
  arrange();
  function layout() {
    if (!element.isConnected || element.clientWidth === 0) return;
    arrange();
    if (!sides.some((side) => side.groups.length && gameDataSideOpen(side.side))) {
      set(GAME_DATA_STRIP_SHORTEST, 1);
      return;
    }
    let scale = 1;
    const shortest = () => Math.ceil(GAME_DATA_STRIP_SHORTEST * scale);
    let strip = shortest();
    set(strip, scale);
    const room = element.clientHeight, available = element.clientWidth;
    // The box's height never follows its content (its column sizes it), and
    // its scrollHeight never reports less than the box, so the content's own
    // height is measured from the box's top, which counts a first child's
    // margin, to its last child.
    const contentHeight = () => element.lastElementChild.getBoundingClientRect().bottom
      - element.getBoundingClientRect().top - element.clientTop;
    for (let pass = 0; pass < 4 && element.scrollWidth > available; pass++) {
      scale *= available / element.scrollWidth * 0.99;
      strip = shortest();
      set(strip, scale);
    }
    if (contentHeight() > room) {
      for (let pass = 0; pass < 6 && contentHeight() > room; pass++) {
        scale *= room / contentHeight() * 0.99;
        strip = shortest();
        set(strip, scale);
      }
    } else {
      // A row is never shorter than its text, so the content height is only
      // nondecreasing in the strip, not linear: search for the tallest strip
      // that fits.
      let tooTall = room + 1;
      while (tooTall - strip > 1) {
        const middle = Math.floor((strip + tooTall) / 2);
        set(middle, scale);
        if (contentHeight() <= room) strip = middle;
        else tooTall = middle;
      }
      set(strip, scale);
    }
    draw(strip, scale);
  }
  return { element, layout };
}

// The report-category measurements read each game's action summary, which
// the worker cannot derive: the records it gets carry no action evaluations.
// A summary is made once per record for the page session and sent only while
// one of those measurements is asked for. A game with any action filed under
// measurement notes (older or incomplete evidence) has none: its counts were
// not measured.
const GAME_DATA_ACTION_SUMMARIES = new WeakMap();
function gameDataActionSummary(record) {
  if (!GAME_DATA_ACTION_SUMMARIES.has(record)) {
    const measured = record.actionEvaluations.every((evaluation) =>
      actionEvaluationCategory(evaluation) !== 'measurementNotes');
    GAME_DATA_ACTION_SUMMARIES.set(record, measured ? actionCategorySummary(record.actionEvaluations) : null);
  }
  return GAME_DATA_ACTION_SUMMARIES.get(record);
}
function gameDataAnalysisRecords(records, metricIds) {
  const analysed = records.map(analysisRecord);
  if (!GameData.metrics.some((metric) => metric.actionSummary && metricIds.includes(metric.id))) return analysed;
  return analysed.map((fact, i) => {
    const summary = gameDataActionSummary(records[i]);
    return summary === null ? fact : { ...fact, actionSummary: summary };
  });
}

function buildBoardTimeRankProfile(record, records) {
  gameDataNoMark = record.outcome === 'win' && isMarkless(record);
  if (record.outcome !== 'win') return null;
  requestGameDataExamples(record);
  const host = document.createElement('div');
  host.className = 'board-time-profile-host';
  const profile = document.createElement('figure');
  profile.className = 'board-time-profile';
  profile.setAttribute('aria-label', 'game data');
  host.appendChild(profile);
  let observer;
  let view = 'chart', historyMetric = 'time', historyPage = 0;
  // The worker's rows for the current settings; null when they must be
  // computed again (the session window or the shown measurements changed).
  let rows = null;
  const button = (text, action) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    node.addEventListener('click', action);
    return node;
  };
  function renderAndFocus(selector) {
    const job = render();
    const generation = viewGeneration;
    job.then(() => {
      if (generation === viewGeneration && profile.isConnected) profile.querySelector(selector).focus();
    }).catch(analysisFailure);
  }
  // Back on the chart, focus returns to the button that opened the subview.
  function show(next) {
    const previous = view;
    view = next;
    renderAndFocus(next === 'chart' ? '.game-data-controls [data-view="' + previous + '"]' : 'figcaption > button');
  }
  function checkbox(text, checked, change, option) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    if (option) input.dataset.option = option;
    input.addEventListener('change', () => change(input.checked));
    label.append(input, ' ' + text);
    return label;
  }
  function observeFit(fitted) {
    observer = new ResizeObserver(() => {
      if (!profile.isConnected) { observer.disconnect(); return; }
      fitted.layout();
    });
    observer.observe(fitted.element);
    requestAnimationFrame(fitted.layout);
  }
  // The band's points switch picks the one pool it plots; the distributions'
  // pools switch picks which pools get strip groups.
  function poolSwitch(label, field, choices) {
    const group = document.createElement('span');
    group.className = 'game-data-pool-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    group.append(label + ': ');
    for (const value of choices) {
      const choice = button(value === 'both' ? 'both' : gameDataPoolLabel(value), () => {
        settings[field] = value;
        saveSettings();
        renderAndFocus('.game-data-pool-switch [aria-pressed="true"]');
      });
      choice.setAttribute('aria-pressed', String(settings[field] === value));
      group.appendChild(choice);
    }
    return group;
  }
  let viewGeneration = 0;
  function render() {
    const job = renderView();
    host.analysisReady = job;
    job.catch(analysisFailure);
    return job;
  }
  async function renderView() {
    const generation = ++viewGeneration;
    profile.setAttribute('aria-busy', 'true');
    observer?.disconnect();
    if (chartHelpOwner && profile.contains(chartHelpOwner)) hideChartHelpTip();
    profile.replaceChildren();
    profile.dataset.screen = view;
    profile.classList.toggle('game-data-values-hidden', !settings.gameDataShowValues);
    // The chart starts with its data; the subviews keep a way back at the top
    // and the bottom.
    if (view !== 'chart') {
      const caption = document.createElement('figcaption');
      caption.appendChild(button('back to game data', () => show('chart')));
      profile.appendChild(caption);
    }
    if (view === 'config') {
      const configView = document.createElement('div');
      configView.className = 'game-data-config';
      // One list per side of the chart, in its row order, with a box that
      // sets the whole list; `field` is that side's saved selection.
      function selectionList(titleText, allText, nameHead, field, entries) {
        const title = document.createElement('h4');
        title.textContent = titleText;
        const inputs = [];
        let all;
        function sync() {
          for (const { input, id } of inputs) input.checked = settings[field][id];
          const values = Object.values(settings[field]);
          all.checked = values.every(Boolean);
          all.indeterminate = values.some(Boolean) && !all.checked;
        }
        const allLabel = checkbox(allText, false, (checked) => {
          settings[field] = Object.fromEntries(entries.map((entry) => [entry.id, checked]));
          rows = null; saveSettings(); sync();
        });
        all = allLabel.querySelector('input');
        const table = document.createElement('table');
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (const text of [nameHead, 'shown']) {
          const cell = document.createElement('th'); cell.textContent = text; headRow.appendChild(cell);
        }
        head.appendChild(headRow);
        const body = document.createElement('tbody');
        for (const entry of entries) {
          const row = document.createElement('tr');
          const name = document.createElement('td');
          name.append(entry.help ? chartHelpButton(entry.help, entry.name) : entry.name);
          row.appendChild(name);
          const cell = document.createElement('td');
          const input = document.createElement('input'); input.type = 'checkbox';
          input.setAttribute('aria-label', entry.name);
          input.addEventListener('change', () => {
            settings[field][entry.id] = input.checked; rows = null; saveSettings(); sync();
          });
          inputs.push({ input, id: entry.id }); cell.appendChild(input); row.appendChild(cell);
          body.appendChild(row);
        }
        table.append(head, body);
        configView.append(title, allLabel, table);
        sync();
      }
      selectionList('performance measurements', 'all performance measurements', 'measurement',
        'gameDataMetrics', GameData.metrics);
      const switchCostLabel = 'switch cost, this game and over the session, the latest ' + SwitchCost.WINDOW_GAMES
        + ', and the earlier ' + SwitchCost.WINDOW_GAMES + ' standard games';
      configView.appendChild(checkbox(switchCostLabel, settings.gameDataSwitchCost, (checked) => {
        settings.gameDataSwitchCost = checked; saveSettings();
      }, 'switch-cost'));
      selectionList('board traits', 'all board traits', 'trait', 'gameDataBoardTraits',
        Object.keys(GAME_DATA_BOARD_TRAIT_DEFAULTS).map((id) =>
          ({ id, name: BOARD_TRAIT_NAMES[id], help: BOARD_TRAIT_DEFINITIONS[id] })));
      const historyButton = button('session history', () => show('history'));
      configView.appendChild(historyButton);
      profile.append(configView, button('back to game data', () => show('chart')));
    } else if (view === 'history') {
      const controls = document.createElement('div');
      controls.className = 'game-data-history-controls';
      const label = document.createElement('label');
      label.textContent = 'measurement ';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'measurement');
      for (const metric of GameData.metrics) select.add(new Option(metric.name, metric.id));
      select.value = historyMetric;
      select.addEventListener('change', () => {
        historyMetric = select.value; historyPage = 0;
        renderAndFocus('[aria-label="measurement"]');
      });
      label.appendChild(select);
      controls.append(label, chartHelpButton('Windows overlap, so the rows are not separate sessions. Wins-only measurements skip losses.'));
      profile.appendChild(controls);
      const pageSize = 20;
      const groups = await analysisTask('rankings', 'game-data-history', { records: gameDataAnalysisRecords(records, [historyMetric]), endedAt: record.endedAt,
        sessionDefinition: settings.sessionDefinition, page: historyPage, pageSize, metric: historyMetric, config });
      if (generation !== viewGeneration) return;
      const spec = GameData.metrics.find((m) => m.id === historyMetric);
      const scroll = document.createElement('div');
      scroll.className = 'game-data-history';
      const table = document.createElement('table');
      const cap = document.createElement('caption');
      cap.textContent = 'session windows ending at each game';
      const head = document.createElement('thead');
      const tr = document.createElement('tr');
      for (const text of ['ended', 'wins / games', 'measured n', 'median', 'middle 50%']) {
        const th = document.createElement('th'); th.textContent = text; tr.appendChild(th);
      }
      head.appendChild(tr);
      const body = document.createElement('tbody');
      for (const group of groups.windows) {
        const stats = group.stats;
        const row = document.createElement('tr');
        for (const text of [new Date(group.endedAt).toLocaleString(), stats.wins + ' / ' + stats.games,
          stats.measured, stats.median === null ? 'unmeasured' : spec.format(stats.median),
          stats.median === null ? '—' : spec.format(stats.lower) + '–' + spec.format(stats.upper)]) {
          const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell);
        }
        body.appendChild(row);
      }
      table.append(cap, head, body); scroll.appendChild(table); profile.appendChild(scroll);
      const pager = document.createElement('div'); pager.className = 'game-data-history-controls';
      const prev = button('newer', () => { historyPage--; render(); }); prev.disabled = historyPage === 0;
      const next = button('older', () => { historyPage++; render(); }); next.disabled = (historyPage + 1) * pageSize >= groups.total;
      pager.append(prev, 'page ' + (historyPage + 1) + ' / ' + Math.max(1, Math.ceil(groups.total / pageSize)), next,
        button('back to game data', () => show('chart')));
      profile.appendChild(pager);
    } else {
      if (rows === null) {
        const shownIds = Object.keys(settings.gameDataMetrics).filter((id) => settings.gameDataMetrics[id]);
        const facts = gameDataAnalysisRecords(records, shownIds);
        const at = records.indexOf(record);
        const computed = await analysisTask('rankings', 'game-data', {
          record: at === -1 ? gameDataAnalysisRecords([record], shownIds)[0] : facts[at], records: facts,
          preferences: settings, config });
        if (generation !== viewGeneration) return;
        rows = computed;
      }
      host.rows = rows;
      if (rows.length === 0) {
        const chosen = [settings.gameDataMetrics, settings.gameDataBoardTraits]
          .some((selection) => Object.values(selection).some(Boolean));
        profile.appendChild(gameDataCell('game-data-unplotted', chosen
          ? 'Nothing to rank yet: every comparison needs at least two measured games.'
          : 'Nothing chosen to rank: choose measurements or board traits with configure.'));
      }
      const sides = GAME_DATA_SIDES.filter(({ side }) => rows.some((row) => row.side === side));
      if (sides.length) {
        // One chart for both sides; it takes the column's room while either
        // side is open, and only its titles' line while both are closed.
        const section = document.createElement('div');
        section.className = 'game-data-section';
        let fitted = null;
        const syncOpen = () => {
          const open = sides.filter(({ side }) => gameDataSideOpen(side)).length;
          section.dataset.openSides = String(open);
          section.classList.toggle('open', open > 0);
        };
        const titles = Object.fromEntries(sides.map((entry) => [entry.side, gameDataSideTitle(entry, () => {
          syncOpen();
          fitGameDataToSidebar();
          fitted.layout();
          scheduleBoardLayout();
        })]));
        const pools = settings.gameDataDistributionPools === 'both' ? ['lifetime', 'session'] : [settings.gameDataDistributionPools];
        fitted = settings.gameDataDistributions
          ? buildGameDataDistributions(rows, pools, titles)
          : buildGameDataBand(rows, settings.gameDataBandPool, settings.gameDataShowValues, titles);
        syncOpen();
        section.appendChild(fitted.element);
        profile.appendChild(section);
        observeFit(fitted);
      }
      if (settings.gameDataSwitchCost) profile.appendChild(buildSwitchCostLine(record));
      // Every chart option in one small row at the bottom, out of the data's way.
      const footer = document.createElement('div');
      footer.className = 'game-data-controls';
      footer.appendChild(settings.gameDataDistributions
        ? poolSwitch('pools', 'gameDataDistributionPools', ['lifetime', 'session', 'both'])
        : poolSwitch('points', 'gameDataBandPool', ['lifetime', 'session']));
      footer.append(checkbox('show distributions', settings.gameDataDistributions, (checked) => {
        settings.gameDataDistributions = checked; saveSettings();
        renderAndFocus('.game-data-controls input[data-option="distributions"]');
      }, 'distributions'), checkbox('show values', settings.gameDataShowValues, (checked) => {
        settings.gameDataShowValues = checked; saveSettings();
        renderAndFocus('.game-data-controls input[data-option="values"]');
      }, 'values'));
      for (const [text, next] of [['configure', 'config'], ['session history', 'history']]) {
        const opener = button(text, () => show(next));
        opener.dataset.view = next;
        footer.appendChild(opener);
      }
      profile.appendChild(footer);
    }
    profile.removeAttribute('aria-busy');
  }
  profile.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view !== 'chart') { event.preventDefault(); event.stopPropagation(); show('chart'); }
  });
  profile.dataset.sessionScopeView = '';
  profile.addEventListener('session-scope-change', () => { historyPage = 0; rows = null; render(); });
  render();
  return host;
}
