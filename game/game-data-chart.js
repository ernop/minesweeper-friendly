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
      help: comparison.selfEvident ? undefined : comparison.help(record)[0] };
    // Session boards are a subset of lifetime, so a session row implies a lifetime row.
    const poolRows = [['lifetime', past], ['session', session]]
      .map(([scope, pool]) => GameData.rankedRow(record, pool, spec, scope, {}, 'boards'))
      .filter((row) => row !== null).map((row) => ({ ...row, side: 'board' }));
    if (poolRows.length === 0) return [];
    const values = (pool) => pool.map((r) => comparison.rawValue(r)).filter(Number.isFinite);
    return GameData.addDistributions(poolRows, { lifetime: values(past), session: values(session) }, values(session),
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
// Each side title's help says what its percentages are, which nothing else
// on the panel says.
const GAME_DATA_SIDE_HELP = {
  performance: 'Each percentage is the share of your other games that ranked better, a tie counting as half: 0% is your best, 100% your worst.',
  board: 'Each percentage is the share of the other boards that ranked better, better meaning each trait’s preferred end: a declared preference, not a measured difficulty.',
};
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

// A chart heading's copy of this game's value and lifetime standing.
function gameDataChartChip(row) {
  const chip = gameDataCell('game-data-chart-chip', 'this ' + row.valueText + ' · ' + gameDataPercentText(row));
  chip.style.setProperty('--standing', standingColor(row.percentile, STANDING_MARK_STOPS));
  chip.title = GAME_DATA_POOL_LABELS[row.scope] + ': ' + row.standingText;
  return chip;
}

// The charts below that plot one measurement; hovering its row outlines them.
function linkGameDataCharts(metricId, linked) {
  for (const chart of resultRanks.querySelectorAll('[data-measurement="' + metricId + '"]')) {
    chart.classList.toggle('game-data-linked', linked);
  }
}

// One pool's histogram on its measurement's lifetime axis: bars count the
// pool's games per value range, colored by those games' mean standing. A
// card draws a small pool (one that carries its values) as one dot per game
// at its exact value instead, colored by that game's own standing, so a few
// games read as a few games rather than as bars of height one. The lifetime
// pool also ticks the session's games under the axis; the green line is this
// game, edged in black like the charts' this-game dot. The card size names
// its better end and labels its axis; a strip stretches to its cell.
function gameDataHistogram(row, card) {
  const d = row.distribution;
  const width = card ? 320 : 200, height = card ? 132 : 26;
  const top = card ? 14 : 0;
  const base = card ? height - 26 : height - 6;
  const dots = card && d.values !== undefined;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'game-data-histogram');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.size = card ? 'card' : 'strip';
  if (!card) svg.setAttribute('preserveAspectRatio', 'none');
  const add = (name, attributes) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    svg.appendChild(node);
    return node;
  };
  const x = (value) => (value - d.lo) / (d.hi - d.lo) * width;
  if (dots) {
    // Each dot rests on the lowest level where it touches no earlier dot; a
    // stack too tall for the plot shrinks every dot.
    const n = d.values.length;
    const standing = (v) => {
      if (d.values.every((other) => other === v)) return 50;
      const better = d.values.filter((other) => row.higher ? other > v : other < v).length;
      return 100 * (better + (d.values.filter((other) => other === v).length - 1) / 2) / (n - 1);
    };
    const stack = (size) => {
      const placed = [];
      for (const value of d.values) {
        let level = 0;
        while (placed.some((dot) => dot.level === level && Math.abs(dot.x - x(value)) < size)) level++;
        placed.push({ value, x: x(value), level });
      }
      return placed;
    };
    let size = 8, placed = stack(size);
    while (size > 3 && (Math.max(...placed.map((dot) => dot.level)) + 1) * size > base - top - 3) placed = stack(--size);
    for (const dot of placed) {
      add('circle', { class: 'game-data-histogram-dot', cx: Math.max(size / 2, Math.min(width - size / 2, dot.x)),
        cy: base - 1 - size * (dot.level + 0.5), r: size / 2 - 0.3, fill: standingColor(standing(dot.value), STANDING_MARK_STOPS) });
    }
  } else {
    const most = Math.max(...d.counts);
    const binWidth = width / d.bins;
    d.counts.forEach((count, i) => {
      if (count === 0) return;
      const barHeight = Math.max(1, count / most * (base - top - 3));
      add('rect', { x: i * binWidth + 0.5, y: base - barHeight, width: Math.max(1, binWidth - 1), height: barHeight,
        fill: standingColor(d.standing[i], STANDING_MARK_STOPS) });
    });
  }
  add('line', { class: 'game-data-histogram-axis', x1: 0, x2: width, y1: base, y2: base });
  const tickEnd = base + (card ? 8 : 5);
  if (row.sessionValues) {
    for (const value of row.sessionValues) {
      if (value < d.lo || value > d.hi) continue;
      add('line', { class: 'game-data-histogram-tick', x1: x(value), x2: x(value), y1: base + 1, y2: tickEnd });
    }
  }
  for (const part of ['game-data-histogram-this-edge', 'game-data-histogram-this']) {
    add('line', { class: part, x1: x(row.value), x2: x(row.value), y1: top, y2: tickEnd });
  }
  if (card) {
    add('text', { class: 'game-data-histogram-better', x: row.higher ? width : 0, y: 10,
      'text-anchor': row.higher ? 'end' : 'start' }).textContent = row.higher ? 'better →' : '← better';
    for (const label of d.labels) {
      const at = x(label.value);
      const anchor = at < 18 ? 'start' : at > width - 18 ? 'end' : 'middle';
      add('text', { x: at, y: height - 4, 'text-anchor': anchor }).textContent = label.text;
    }
  }
  return svg;
}

// The hover card for one pool, the one whose standing placed the row's point
// (or whose strip was hovered). It holds only what the row and the panel do
// not already show or say (creator 2026-10-08: "just cut all the fluff"):
// the pool's rank, its games on the measurement's axis with a one-line key,
// and, last, a definition where the name leaves the measurement open.
function fillGameDataCard(tip, item, scope) {
  const card = document.createElement('div');
  card.className = 'game-data-card';
  card.dataset.pool = scope;
  const paragraph = (className, text) => {
    const node = document.createElement('p');
    node.className = className;
    node.textContent = text;
    return node;
  };
  const standing = (poolScope) => {
    const node = paragraph('game-data-card-standing', '');
    node.append(gameDataCell('game-data-card-pool', GAME_DATA_POOL_LABELS[poolScope] + ':'), ' ',
      item.pools[poolScope].standingText);
    return node;
  };
  const row = item.pools[scope], d = row.distribution;
  const one = row.counted.slice(0, -1);
  const key = [d.values !== undefined ? 'One dot per ' + one + '.' : d.binText,
    ...(row.sessionValues ? ['Ticks: this session’s ' + row.counted + '.'] : []),
    'Green line: this ' + (item.side === 'board' ? 'board' : 'game') + '.',
    ...(d.outside ? [d.outside + ' ' + (d.outside === 1 ? one + ' beyond the 1st–99th percentiles is'
      : row.counted + ' beyond the 1st–99th percentiles are') + ' not drawn.'] : [])];
  card.append(standing(scope), gameDataHistogram(row, true), paragraph('game-data-card-key', key.join(' ')));
  if (row.definition) card.appendChild(paragraph('game-data-card-definition', row.definition));
  tip.appendChild(card);
}

// The band: each side's rows in aligned single-line columns, joined by
// leaders to dots on the bar's edge at their standing, under its title
// centered over them. Columns are measured, then plans are tried in order:
// both sides around one bar with both percentage columns, then with only the
// plotted one, then the sides stacked, each with its own bar and both sides'
// rows on its left. The band never scrolls: the plan that needs the least
// shrinking wins (the earlier one on a tie), and the whole band scales to fit
// its box.
function buildGameDataBand(rows, pool, valuesShown) {
  const items = gameDataItems(rows);
  const element = document.createElement('div');
  element.className = 'game-data-band';
  // Both sides plot the switch's pool; a row without a rank there is listed
  // in the note instead.
  const plotted = items.filter((item) => item.pools[pool]);
  const unplotted = items.filter((item) => !item.pools[pool]);
  const [low, high] = GameData.domain(plotted.map((item) => item.pools[pool]));
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
    const wrap = chartHelpButton((tip) => fillGameDataCard(tip, item, pool), item.name,
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
      .map(([scope, row]) => GAME_DATA_POOL_LABELS[scope] + ' ' + gameDataPercentText(row)).join(', '));
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
  const sides = [['performance', 'your perf'], ['board', 'board traits']].map(([side, text]) => {
    const list = items.filter((item) => item.side === side);
    const title = document.createElement('div');
    title.className = 'game-data-side-title';
    title.dataset.side = side;
    title.appendChild(chartHelpButton(GAME_DATA_SIDE_HELP[side], text));
    const columns = document.createElement('div');
    columns.className = 'game-data-column-heads';
    columns.dataset.side = side;
    columns.append(...(side === 'performance'
      ? [headCell('game-data-name', ''), headCell('game-data-value', 'value'),
        ...perfPools.map((scope) => headCell('game-data-pct', GAME_DATA_POOL_LABELS[scope], scope))]
      : [headCell('game-data-pct', '', pool), headCell('game-data-name', ''), headCell('game-data-value', 'value')]));
    return { side, title, columns, entries: list.filter((item) => item.pools[pool])
      .map((item) => ({ item, row: rowElement(item), percentile: item.pools[pool].percentile })) };
  }).filter((side) => side.entries.length);
  const note = document.createElement('p');
  note.className = 'game-data-unplotted';
  if (unplotted.length) {
    note.textContent = (plotted.length ? 'Not ranked in this session yet: '
      + unplotted.map((item) => item.name).join(', ') : 'No session ranks yet')
      + '. A session rank needs two measured games in the session window.';
  }

  const hasPerf = sides.some((side) => side.side === 'performance');
  const hasBoard = sides.some((side) => side.side === 'board');
  const plans = [...(perfPools.length === 2 ? [2, 1] : [1]).map((k) => ({ stacked: false, k })),
    ...(hasPerf && hasBoard ? (perfPools.length === 2 ? [2, 1] : [1]).map((k) => ({ stacked: true, k })) : [])];
  // Every size at one scale: measured text, and the fixed geometry scaled.
  function measure(scale) {
    element.style.setProperty('--game-data-scale', String(scale));
    element.removeAttribute('data-pool-columns');
    const measuring = document.createElement('div');
    measuring.className = 'game-data-measuring';
    for (const side of sides) {
      for (const node of [side.title, side.columns, ...side.entries.map((entry) => entry.row)]) node.removeAttribute('style');
      for (const entry of side.entries) entry.row.querySelector('button').style.gridTemplateColumns = '';
      measuring.append(side.title, side.columns, ...side.entries.map((entry) => entry.row));
    }
    element.replaceChildren(...(unplotted.length ? [note] : []), measuring);
    const width = (node) => Math.ceil(node.getBoundingClientRect().width);
    const columnWidths = {}, titleWidths = {};
    for (const side of sides) {
      const holders = [side.columns, ...side.entries.map((entry) => entry.row.querySelector('button'))];
      columnWidths[side.side] = [...side.columns.children].map((_, i) =>
        Math.max(...holders.map((holder) => width(holder.children[i]))));
      titleWidths[side.side] = width(side.title);
    }
    return { scale, columnWidths, titleWidths,
      rowHeight: sides[0].entries[0].row.getBoundingClientRect().height,
      titleHeight: sides[0].title.getBoundingClientRect().height,
      columnHeadHeight: sides[0].columns.getBoundingClientRect().height,
      noteHeight: unplotted.length ? note.getBoundingClientRect().height : 0 };
  }
  // A plan's columns and the width and height it needs at a measured scale.
  function geometry(m, plan) {
    const gap = GAME_DATA_COLUMN_GAP * m.scale;
    const perfWidths = m.columnWidths.performance, boardWidths = m.columnWidths.board;
    const pct = Math.max(...(perfWidths ? perfWidths.slice(2) : []), ...(boardWidths ? [boardWidths[0]] : []));
    const span = (list) => list.reduce((sum, w) => sum + w, 0) + gap * (list.length - 1);
    const value = (w) => valuesShown ? [w] : [];
    const columnsOf = (side) => side === 'performance'
      ? [perfWidths[0], ...value(perfWidths[1]), ...Array(plan.k).fill(pct)]
      : plan.stacked ? [boardWidths[1], ...value(boardWidths[2]), pct] : [pct, boardWidths[1], ...value(boardWidths[2])];
    const sideSpan = (side) => span(columnsOf(side));
    const barWidth = GAME_DATA_BAR_WIDTH * m.scale, leader = GAME_DATA_LEADER_WIDTH * m.scale;
    const needWidth = plan.stacked
      ? Math.max(...sides.map((side) => sideSpan(side.side))) + leader + barWidth
      : sides.reduce((sum, side) => sum + sideSpan(side.side) + leader, 0) + barWidth;
    const headHeight = m.titleHeight + m.columnHeadHeight + 4 * m.scale;
    const pad = Math.max(7 * m.scale, m.rowHeight / 2) + 1;
    const blocks = plan.stacked ? sides.map((side) => [side]) : [sides];
    const blockNeed = (blockSides) => headHeight + Math.max(...blockSides.map((side) => side.entries.length))
      * (m.rowHeight + 2) + 2 * pad;
    return { ...plan, m, columnsOf, sideSpan, span, barWidth, leader, needWidth, headHeight, pad, blocks, blockNeed,
      needHeight: blocks.reduce((sum, blockSides) => sum + blockNeed(blockSides), 0) };
  }

  function layout() {
    if (!element.isConnected || element.clientWidth === 0) return;
    if (sides.length === 0) {
      element.replaceChildren(note);
      return;
    }
    const available = element.clientWidth;
    const base = measure(1);
    const room = element.clientHeight - base.noteHeight;
    const fit = (g) => Math.min(1, available / g.needWidth, room / g.needHeight);
    const ranked = plans.map((plan) => ({ plan, fit: fit(geometry(base, plan)) }));
    const best = Math.max(...ranked.map((entry) => entry.fit));
    const plan = ranked.find((entry) => entry.fit >= best - 0.001).plan;
    let g = geometry(base, plan);
    // Text sizes scale almost, not exactly, with the font: correct until the
    // measured band fits.
    for (let scale = fit(g), pass = 0; scale < 1 && pass < 4; pass++) {
      g = geometry(measure(scale), plan);
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
    const blockSpan = plan.stacked ? Math.max(...sides.map((side) => g.sideSpan(side.side))) : 0;

    element.replaceChildren();
    if (unplotted.length) element.appendChild(note);
    const { headHeight, pad, blocks, barWidth } = g;
    const rowHeight = m.rowHeight;
    const rowCount = sides.reduce((sum, side) => sum + side.entries.length, 0);
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
      const height = g.blockNeed(blockSides) + spare * blockSides.reduce((sum, side) => sum + side.entries.length, 0) / rowCount;
      const plotTop = headHeight + pad, plotHeight = height - headHeight - 2 * pad;
      block.style.width = contentWidth + 'px';
      block.style.height = height + 'px';
      // Horizontal positions: left side, bar, right side, centered as a whole.
      const perfSide = blockSides.find((side) => side.side === 'performance');
      const leftSpan = plan.stacked ? blockSpan : (perfSide ? g.sideSpan('performance') : 0);
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
        bars[side.side] = bar;
        const onLeft = plan.stacked || side.side === 'performance';
        const columns = g.columnsOf(side.side);
        const thisSpan = g.span(columns);
        const left = onLeft ? barX - lead - thisSpan : barX + barWidth + lead;
        const template = columns.map((w) => w + 'px').join(' ');
        const titleLeft = Math.max(0, Math.min(contentWidth - m.titleWidths[side.side], left + (thisSpan - m.titleWidths[side.side]) / 2));
        Object.assign(side.title.style, { left: titleLeft + 'px', top: '0px' });
        Object.assign(side.columns.style, { left: left + 'px', top: m.titleHeight + 'px', width: thisSpan + 'px', gridTemplateColumns: template });
        block.append(side.title, side.columns);
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

// Every measurement's distribution as a strip, in sections: performance
// against lifetime, then the session, then board traits. Rows keep catalog order, so a measurement sits at the same
// place in every section. A row's card shows its own section's pool. Like
// the band it never scrolls: `layout` shortens the strips first, then the
// text, to fit its box.
const GAME_DATA_STRIP_HEIGHTS = [10, 26];
function buildGameDataDistributions(rows) {
  const element = document.createElement('div');
  element.className = 'game-data-distributions';
  const items = gameDataItems(rows);
  const sections = [
    ['lifetime', 'lifetime', 'lifetime', 'performance'],
    ['session', 'session', 'session', 'performance'],
    ['lifetime', 'board traits', 'lifetime', 'board'],
  ];
  for (const [scope, titleText, columnText, side] of sections) {
    const shown = items.filter((item) => item.side === side && item.pools[scope]);
    if (!shown.length) continue;
    const section = document.createElement('section');
    section.className = 'game-data-dist-section';
    section.dataset.pool = side === 'board' ? 'boards' : scope;
    const head = document.createElement('div');
    head.className = 'game-data-dist-head';
    head.append(gameDataCell('game-data-side-title', titleText), gameDataCell('game-data-value', 'value'),
      gameDataCell('game-data-strip-head', 'your games'), gameDataCell('game-data-pct', columnText));
    section.appendChild(head);
    for (const item of shown) {
      const row = item.pools[scope];
      const wrap = chartHelpButton((tip) => fillGameDataCard(tip, item, scope), item.name);
      wrap.classList.add('game-data-dist-row');
      wrap.dataset.measurement = item.metricId;
      const button = wrap.querySelector('button');
      const strip = document.createElement('span');
      strip.className = 'game-data-strip';
      strip.appendChild(gameDataHistogram(row, false));
      button.replaceChildren(gameDataCell('game-data-name', item.name), gameDataCell('game-data-value', item.valueText),
        strip, gameDataCell('game-data-pct', gameDataPercentText(row)));
      button.setAttribute('aria-label', item.name + ' ' + item.valueText + ': ' + columnText + ' ' + gameDataPercentText(row));
      wrap.addEventListener('mouseenter', () => linkGameDataCharts(item.metricId, true));
      wrap.addEventListener('mouseleave', () => linkGameDataCharts(item.metricId, false));
      section.appendChild(wrap);
    }
    element.appendChild(section);
  }
  const key = document.createElement('p');
  key.className = 'game-data-dist-key';
  key.textContent = 'Green line: this game. Ticks under a lifetime or board strip: this session’s games.';
  element.appendChild(key);
  function layout() {
    if (!element.isConnected || element.clientWidth === 0) return;
    const [shortest, tallest] = GAME_DATA_STRIP_HEIGHTS;
    const set = (strip, scale) => {
      element.style.setProperty('--game-data-strip', strip + 'px');
      element.style.setProperty('--game-data-scale', String(scale));
    };
    set(tallest, 1);
    const room = element.clientHeight, available = element.clientWidth;
    let scale = 1, strip = tallest;
    for (let pass = 0; pass < 4 && element.scrollWidth > available; pass++) {
      scale *= available / element.scrollWidth * 0.99;
      set(strip, scale);
    }
    if (element.scrollHeight <= room) return;
    const atTallest = element.scrollHeight;
    set(shortest, scale);
    const atShortest = element.scrollHeight;
    if (atShortest <= room) {
      // A row is never shorter than its text, so the height is not linear in
      // the strip: step down from the estimate until it fits.
      strip = Math.floor(shortest + (tallest - shortest) * (room - atShortest) / (atTallest - atShortest));
      for (set(strip, scale); element.scrollHeight > room && strip > shortest; set(--strip, scale));
      return;
    }
    for (let pass = 0; pass < 6 && element.scrollHeight > room; pass++) {
      scale *= room / element.scrollHeight * 0.99;
      set(shortest, scale);
    }
  }
  return { element, layout };
}

function buildBoardTimeRankProfile(record, records) {
  if (record.outcome !== 'win') return null;
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
  function poolSwitch() {
    const group = document.createElement('span');
    group.className = 'game-data-pool-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'points');
    group.append('points: ');
    for (const scope of ['lifetime', 'session']) {
      const choice = button(scope, () => {
        settings.gameDataBandPool = scope;
        saveSettings();
        renderAndFocus('.game-data-pool-switch [aria-pressed="true"]');
      });
      choice.setAttribute('aria-pressed', String(settings.gameDataBandPool === scope));
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
      const title = document.createElement('h4');
      title.textContent = 'performance measurements';
      configView.appendChild(title);
      const inputs = [];
      let all;
      function sync() {
        for (const { input, id } of inputs) input.checked = settings.gameDataMetrics[id];
        const values = Object.values(settings.gameDataMetrics);
        all.checked = values.every(Boolean);
        all.indeterminate = values.some(Boolean) && !all.checked;
      }
      const allLabel = checkbox('all performance measurements', false, (checked) => {
        settings.gameDataMetrics = Object.fromEntries(GameData.metrics.map((m) => [m.id, checked]));
        rows = null; saveSettings(); sync();
      });
      all = allLabel.querySelector('input');
      configView.appendChild(allLabel);
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const text of ['measurement', 'shown']) {
        const cell = document.createElement('th'); cell.textContent = text; headRow.appendChild(cell);
      }
      head.appendChild(headRow);
      const body = document.createElement('tbody');
      for (const metric of GameData.metrics) {
        const row = document.createElement('tr');
        const name = document.createElement('td');
        name.append(metric.help ? chartHelpButton(metric.help, metric.name) : metric.name);
        row.appendChild(name);
        const cell = document.createElement('td');
        const input = document.createElement('input'); input.type = 'checkbox';
        input.setAttribute('aria-label', metric.name);
        input.addEventListener('change', () => {
          settings.gameDataMetrics[metric.id] = input.checked; rows = null; saveSettings(); sync();
        });
        inputs.push({ input, id: metric.id }); cell.appendChild(input); row.appendChild(cell);
        body.appendChild(row);
      }
      table.append(head, body); configView.appendChild(table); sync();
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
      const groups = await analysisTask('rankings', 'game-data-history', { records: records.map(analysisRecord), endedAt: record.endedAt,
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
        const computed = await analysisTask('rankings', 'game-data', { ...analysisRecordSnapshot(record, records), preferences: settings, config });
        if (generation !== viewGeneration) return;
        rows = computed;
      }
      host.rows = rows;
      if (rows.length === 0) {
        profile.appendChild(gameDataCell('game-data-unplotted', 'Nothing to rank yet: every comparison needs at least two measured games.'));
      } else if (settings.gameDataDistributions) {
        const distributions = buildGameDataDistributions(rows);
        profile.appendChild(distributions.element);
        observeFit(distributions);
      } else {
        const band = buildGameDataBand(rows, settings.gameDataBandPool, settings.gameDataShowValues);
        profile.appendChild(band.element);
        observeFit(band);
      }
      // Every chart option in one small row at the bottom, out of the data's way.
      const footer = document.createElement('div');
      footer.className = 'game-data-controls';
      if (!settings.gameDataDistributions) footer.appendChild(poolSwitch());
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
