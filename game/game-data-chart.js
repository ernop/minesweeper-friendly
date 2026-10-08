'use strict';

// The game data chart: the pure ranking of this board's traits and the label
// layout, then the 0–100% band with its distributions, configuration, and
// session-history views.

//-------GAME DATA RANKING (pure: board trait rows, label layout)-------

// Board values use the player's preferred directions. The matching-trait
// solve-time pools still drive the separate tables, not these markers. A
// trait ranks against every board so far with these settings, won or lost.
function boardTraitRankProfile(record, comparisons, records, sessionDefinition) {
  if (record.outcome !== 'win') return [];
  const past = records.filter((r) => r.endedAt <= record.endedAt);
  const session = SessionScope.records(past, sessionDefinition, record.endedAt);
  return comparisons.filter((c) => c.rawValue).flatMap((comparison) => {
    const spec = { id: comparison.measurementId, name: comparison.trait, allOutcomes: true,
      higher: comparison.higher, value: comparison.rawValue, format: comparison.format,
      help: comparison.help(record)[0] };
    const row = GameData.rankedRow(record, past, spec, 'lifetime', {}, 'boards', 'so far');
    if (!row) return [];
    const values = (pool) => pool.map((r) => comparison.rawValue(r)).filter(Number.isFinite);
    return GameData.addDistributions([{ ...row, side: 'board' }], { lifetime: values(past) },
      values(session), comparison.format);
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

const GAME_DATA_POOL_LABELS = { lifetime: 'lifetime', session: 'session', day: 'last 24 hours' };
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

function gameDataPoolLabel(item, scope) {
  return item.side === 'board' ? 'boards' : GAME_DATA_POOL_LABELS[scope];
}

function gameDataRankText(row) {
  if (row.allEqual) return 'all ' + row.total + ' ' + row.counted + ' equal';
  const place = row.firstRank === row.lastRank ? ordinal(row.rank)
    : 'tied ' + row.firstRank + '–' + ordinal(row.lastRank);
  return place + ' of ' + row.total + ' ' + row.counted;
}

// One item per measurement: performance items carry a row per pool.
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
  chip.title = row.helpText[1];
  return chip;
}

// The charts below that plot one measurement; hovering its row outlines them.
function linkGameDataCharts(metricId, linked) {
  for (const chart of resultRanks.querySelectorAll('[data-measurement="' + metricId + '"]')) {
    chart.classList.toggle('game-data-linked', linked);
  }
}

// One pool's histogram on its measurement's lifetime axis: bars count the
// pool's games per value range, colored by those games' mean standing; the
// lifetime pool also ticks the session's games under the axis; the blue line
// is this game. The card size labels its axis; a strip stretches to its cell.
function gameDataHistogram(row, card) {
  const d = row.distribution;
  const width = card ? 320 : 200, height = card ? 118 : 26;
  const base = card ? height - 26 : height - 6;
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
  const most = Math.max(...d.counts);
  const binWidth = width / d.bins;
  d.counts.forEach((count, i) => {
    if (count === 0) return;
    const barHeight = Math.max(1, count / most * (base - 3));
    add('rect', { x: i * binWidth + 0.5, y: base - barHeight, width: Math.max(1, binWidth - 1),
      height: barHeight, fill: standingColor(d.standing[i], STANDING_MARK_STOPS) });
  });
  add('line', { class: 'game-data-histogram-axis', x1: 0, x2: width, y1: base, y2: base });
  const tickEnd = base + (card ? 8 : 5);
  if (row.sessionValues) {
    for (const value of row.sessionValues) {
      if (value < d.lo || value > d.hi) continue;
      add('line', { class: 'game-data-histogram-tick', x1: x(value), x2: x(value), y1: base + 1, y2: tickEnd });
    }
  }
  add('line', { class: 'game-data-histogram-this', x1: x(row.value), x2: x(row.value), y1: 0, y2: tickEnd });
  if (card) {
    for (const [index, label] of d.labels.entries()) {
      const anchor = index === 0 ? 'start' : index === d.labels.length - 1 ? 'end' : 'middle';
      add('text', { x: x(label.value), y: height - 4, 'text-anchor': anchor }).textContent = label.text;
    }
  }
  return svg;
}

// The hover card: this game's ranks in every pool, the lifetime
// distribution, and the definition.
function fillGameDataCard(tip, item) {
  const card = document.createElement('div');
  card.className = 'game-data-card';
  const title = document.createElement('div');
  title.className = 'game-data-card-title';
  title.append(gameDataCell('game-data-name', item.name), ' ', gameDataCell('game-data-value', item.valueText));
  const ranks = document.createElement('div');
  ranks.className = 'game-data-card-ranks';
  for (const [scope, row] of Object.entries(item.pools)) {
    ranks.append(gameDataCell('', gameDataPoolLabel(item, scope)), gameDataCell('', gameDataRankText(row)),
      gameDataCell('game-data-pct', gameDataPercentText(row)));
  }
  const lifetime = item.pools.lifetime;
  const d = lifetime.distribution;
  const key = document.createElement('p');
  key.textContent = 'Bars: ' + lifetime.total + ' ' + lifetime.counted + ' so far by value, green toward the better side ('
    + (lifetime.higher ? 'higher' : 'lower') + ' is better). Ticks: this session’s ' + lifetime.sessionValues.length
    + ' ' + lifetime.counted + '. Blue line: this game.'
    + (d.outside ? ' ' + d.outside + ' beyond the drawn range.' : '');
  card.append(title, ranks, gameDataHistogram(lifetime, true), key);
  const chart = resultRanks.querySelector('[data-measurement="' + item.metricId + '"]');
  if (chart) {
    const link = document.createElement('p');
    link.textContent = 'Chart below: ' + chart.querySelector('h4').firstChild.textContent + ', outlined while you hover.';
    card.appendChild(link);
  }
  const definition = document.createElement('p');
  definition.textContent = lifetime.helpText[0];
  card.appendChild(definition);
  tip.appendChild(card);
}

// The band: each side's rows in aligned single-line columns, joined by
// leaders to dots on the bar's edge at their standing. Columns are measured,
// then the first plan that fits is used: both sides around one bar with both
// percentage columns, then with only the plotted one, then the sides stacked,
// each with its own bar and both sides' rows on its left. When nothing fits,
// the band scrolls sideways.
function buildGameDataBand(rows, pool, valuesShown) {
  const items = gameDataItems(rows);
  const element = document.createElement('div');
  element.className = 'game-data-band';
  const plottedScope = (item) => item.side === 'board' ? 'lifetime' : pool;
  const plotted = items.filter((item) => item.pools[plottedScope(item)]);
  const unplotted = items.filter((item) => !item.pools[plottedScope(item)]);
  const [low, high] = GameData.domain(plotted.map((item) => item.pools[plottedScope(item)]));
  const perfPools = ['session', 'lifetime'].filter((scope) => items.some((item) => item.pools[scope] && item.side === 'performance'));
  let stacked = false;
  const bars = {};

  function poolCell(item, scope) {
    const row = item.pools[scope];
    const cell = gameDataCell('game-data-pct', row ? gameDataPercentText(row) : '');
    cell.dataset.pool = scope;
    cell.classList.toggle('plotted', scope === plottedScope(item));
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
    const wrap = chartHelpButton((tip) => fillGameDataCard(tip, item), item.name,
      (tip, rect) => placeCard(item, tip, rect));
    wrap.classList.add('game-data-row');
    wrap.dataset.side = item.side;
    wrap.dataset.measurement = item.metricId;
    const button = wrap.querySelector('button');
    button.replaceChildren(...(item.side === 'performance'
      ? [gameDataCell('game-data-name', item.name), gameDataCell('game-data-value', item.valueText),
        ...perfPools.map((scope) => poolCell(item, scope))]
      : [poolCell(item, 'lifetime'), gameDataCell('game-data-name', item.name),
        gameDataCell('game-data-value', item.valueText)]));
    button.setAttribute('aria-label', item.name + ' ' + item.valueText + ': ' + Object.entries(item.pools)
      .map(([scope, row]) => gameDataPoolLabel(item, scope) + ' ' + gameDataPercentText(row)).join(', '));
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
      cell.classList.toggle('plotted', scope === pool || scope === 'boards');
    }
    return cell;
  }
  const sides = [['performance', 'your perf'], ['board', 'board traits']].map(([side, text]) => {
    const list = items.filter((item) => item.side === side);
    const title = gameDataCell('game-data-side-title', text);
    const columns = document.createElement('div');
    columns.className = 'game-data-column-heads';
    columns.dataset.side = side;
    columns.append(...(side === 'performance'
      ? [headCell('game-data-name', ''), headCell('game-data-value', 'value'),
        ...perfPools.map((scope) => headCell('game-data-pct', GAME_DATA_POOL_LABELS[scope], scope))]
      : [headCell('game-data-pct', 'boards', 'boards'), headCell('game-data-name', ''), headCell('game-data-value', 'value')]));
    return { side, title, columns, entries: list.filter((item) => item.pools[plottedScope(item)])
      .map((item) => ({ item, row: rowElement(item), percentile: item.pools[plottedScope(item)].percentile })) };
  }).filter((side) => side.entries.length);
  const note = document.createElement('p');
  note.className = 'game-data-unplotted';
  if (unplotted.length) {
    note.textContent = (items.some((item) => item.pools.session) ? 'Not ranked in this session yet: '
      + unplotted.map((item) => item.name).join(', ') : 'No session ranks yet')
      + '. A session rank needs two measured games in the session window.';
  }

  function layout() {
    if (!element.isConnected || element.clientWidth === 0 || sides.length === 0) return;
    element.removeAttribute('data-pool-columns');
    const measuring = document.createElement('div');
    measuring.className = 'game-data-measuring';
    for (const side of sides) {
      for (const node of [side.columns, ...side.entries.map((entry) => entry.row)]) node.removeAttribute('style');
      for (const entry of side.entries) entry.row.querySelector('button').style.gridTemplateColumns = '';
      measuring.append(side.title, side.columns, ...side.entries.map((entry) => entry.row));
    }
    element.replaceChildren(measuring);
    const width = (node) => Math.ceil(node.getBoundingClientRect().width);
    const columnWidths = {};
    for (const side of sides) {
      const holders = [side.columns, ...side.entries.map((entry) => entry.row.querySelector('button'))];
      columnWidths[side.side] = [...side.columns.children].map((_, i) =>
        Math.max(...holders.map((holder) => width(holder.children[i]))));
    }
    const rowHeight = sides[0].entries[0].row.getBoundingClientRect().height;
    const titleHeight = sides[0].title.getBoundingClientRect().height;
    const columnHeadHeight = sides[0].columns.getBoundingClientRect().height;
    const perfWidths = columnWidths.performance, boardWidths = columnWidths.board;
    const pct = Math.max(...(perfWidths ? perfWidths.slice(2) : []), ...(boardWidths ? [boardWidths[0]] : []));
    const span = (list) => list.reduce((sum, w) => sum + w, 0) + GAME_DATA_COLUMN_GAP * (list.length - 1);
    const value = (w) => valuesShown ? [w] : [];
    const columnsOf = (side, k, left) => side === 'performance'
      ? [perfWidths[0], ...value(perfWidths[1]), ...Array(k).fill(pct)]
      : left ? [boardWidths[1], ...value(boardWidths[2]), pct] : [pct, boardWidths[1], ...value(boardWidths[2])];
    const hasPerf = Boolean(perfWidths), hasBoard = Boolean(boardWidths);
    const ks = perfPools.length === 2 ? [2, 1] : [1];
    const sideSpan = (side, k) => span(columnsOf(side, k, stacked));
    const wideWidth = (k) => (hasPerf ? span(columnsOf('performance', k)) + GAME_DATA_LEADER_WIDTH : 0)
      + (hasBoard ? span(columnsOf('board', k, false)) + GAME_DATA_LEADER_WIDTH : 0) + GAME_DATA_BAR_WIDTH;
    const stackedWidth = (k) => Math.max(span(columnsOf('performance', k)), span(columnsOf('board', k, true)))
      + GAME_DATA_LEADER_WIDTH + GAME_DATA_BAR_WIDTH;
    const available = element.clientWidth;
    let plan = ks.map((k) => ({ stacked: false, k })).find((p) => wideWidth(p.k) <= available);
    if (!plan && hasPerf && hasBoard) plan = ks.map((k) => ({ stacked: true, k })).find((p) => stackedWidth(p.k) <= available);
    if (!plan) plan = { stacked: hasPerf && hasBoard, k: ks[ks.length - 1] };
    stacked = plan.stacked;
    if (plan.k === 1) element.dataset.poolColumns = '1';
    const needed = plan.stacked ? stackedWidth(plan.k) : wideWidth(plan.k);
    const contentWidth = Math.max(available, needed);
    const sideCount = plan.stacked ? 1 : sides.length;
    const lead = GAME_DATA_LEADER_WIDTH + Math.min(GAME_DATA_LEADER_EXTRA, (contentWidth - needed) / (2 * sideCount));
    const blockSpan = plan.stacked ? Math.max(sideSpan('performance', plan.k), sideSpan('board', plan.k)) : 0;

    element.replaceChildren();
    if (unplotted.length) element.appendChild(note);
    const headHeight = titleHeight + columnHeadHeight + 4;
    const pad = Math.max(7, rowHeight / 2) + 1;
    const blocks = plan.stacked ? sides.map((side) => [side]) : [sides];
    const rowCount = sides.reduce((sum, side) => sum + side.entries.length, 0);
    const room = element.clientHeight - (unplotted.length ? note.getBoundingClientRect().height : 0);
    const leaderOf = (block) => {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'game-data-leaders');
      svg.setAttribute('aria-hidden', 'true');
      block.appendChild(svg);
      return svg;
    };
    for (const blockSides of blocks) {
      const block = document.createElement('div');
      block.className = 'game-data-block';
      block.dataset.orientation = plan.stacked ? 'left' : 'around';
      const blockRows = Math.max(...blockSides.map((side) => side.entries.length));
      const share = room * blockSides.reduce((sum, side) => sum + side.entries.length, 0) / rowCount;
      const height = Math.max(share, headHeight + blockRows * (rowHeight + 2) + 2 * pad);
      const plotTop = headHeight + pad, plotHeight = height - headHeight - 2 * pad;
      block.style.width = contentWidth + 'px';
      block.style.height = height + 'px';
      // Horizontal positions: left side, bar, right side, centered as a whole.
      const perfSide = blockSides.find((side) => side.side === 'performance');
      const leftSpan = plan.stacked ? blockSpan : (perfSide ? sideSpan('performance', plan.k) : 0);
      const composition = (leftSpan ? leftSpan + lead : 0) + GAME_DATA_BAR_WIDTH
        + (!plan.stacked && hasBoard ? sideSpan('board', plan.k) + lead : 0);
      const margin = (contentWidth - composition) / 2;
      const barX = margin + (leftSpan ? leftSpan + lead : 0);
      const rule = document.createElement('div');
      rule.className = 'game-data-rule';
      Object.assign(rule.style, { left: margin + 'px', width: composition + 'px', top: (headHeight - 2) + 'px' });
      const bar = document.createElement('div');
      bar.className = 'game-data-bar';
      Object.assign(bar.style, { left: barX + 'px', top: plotTop + 'px', width: GAME_DATA_BAR_WIDTH + 'px', height: plotHeight + 'px' });
      const stops = [[low, 0], ...(low < 50 && high > 50 ? [[50, (50 - low) / (high - low) * 100]] : []), [high, 100]];
      bar.style.background = 'linear-gradient(' + stops.map(([p, at]) => standingColor(p, STANDING_BAR_STOPS) + ' ' + at + '%').join(', ') + ')';
      for (let decile = Math.ceil(low / 10) * 10; decile <= high; decile += 10) {
        const label = gameDataCell('game-data-decile', decile + '%');
        const y = (decile - low) / (high - low) * plotHeight;
        label.style.top = Math.max(1, Math.min(plotHeight - 13, y - 6)) + 'px';
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
        const columns = columnsOf(side.side, plan.k, plan.stacked);
        const thisSpan = span(columns);
        const left = onLeft ? barX - lead - thisSpan : barX + GAME_DATA_BAR_WIDTH + lead;
        const template = columns.map((w) => w + 'px').join(' ');
        Object.assign(side.title.style, { left: left + 'px', top: '0px' });
        Object.assign(side.columns.style, { left: left + 'px', top: titleHeight + 'px', width: thisSpan + 'px', gridTemplateColumns: template });
        block.append(side.title, side.columns);
        const laid = boardTraitLabelLayout(side.entries.map((entry) => ({ ...entry, labelHeight: rowHeight })),
          plotTop, plotHeight, 0, [low, high]);
        for (const entry of laid) {
          const button = entry.row.querySelector('button');
          button.style.gridTemplateColumns = template;
          Object.assign(entry.row.style, { left: left + 'px', width: thisSpan + 'px', top: (entry.labelY - rowHeight / 2) + 'px' });
          entry.row.dataset.pointY = entry.pointY;
          entry.row.dataset.percentile = entry.percentile;
          const edge = onLeft ? barX : barX + GAME_DATA_BAR_WIDTH;
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
// against lifetime, the session, and (time only) the last 24 hours, then
// board traits. Rows keep catalog order, so a measurement sits at the same
// place in every section.
function buildGameDataDistributions(rows) {
  const element = document.createElement('div');
  element.className = 'game-data-distributions';
  const items = gameDataItems(rows);
  const sections = [
    ['lifetime', 'lifetime', 'lifetime', 'performance'],
    ['session', 'session', 'session', 'performance'],
    ['day', 'last 24 hours', 'last 24 hours', 'performance'],
    ['lifetime', 'board traits', 'boards', 'board'],
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
      const wrap = chartHelpButton((tip) => fillGameDataCard(tip, item), item.name);
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
  key.textContent = 'Bars: games per value range, green toward the better side. Blue line: this game. '
    + 'Ticks under a lifetime or board strip: this session’s games.';
  element.appendChild(key);
  return element;
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
  function show(next) {
    view = next;
    renderAndFocus(next === 'chart' ? '.game-data-controls button' : 'figcaption > button');
  }
  function checkbox(text, checked, change) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    label.append(input, ' ' + text);
    return label;
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
    const caption = document.createElement('figcaption');
    const heading = document.createElement('h4');
    heading.appendChild(chartHelpButton([
      'Left: this game’s performance ranked against your earlier games. Right: this board’s traits ranked against every earlier board, won or lost, in the direction you prefer. Only games up to this one with the same size, mines, mode, and generator are compared.',
      'Position is the share of the other games that ranked better: 0% at the top is the best, 100% at the bottom the worst. Ties share their average rank, except times, where the earlier game ranks first. If every value is equal, the item sits at 50%.',
      'Lifetime is every game so far; session is the window chosen with the session picker at the upper left (now: ' + SessionScope.choices.find((c) => c.id === settings.sessionDefinition).label + '). The points switch picks which one places the performance dots. Time also ranks against the last 24 hours, shown in its card and in the distributions.',
      'The bar zooms to the shown items; its colors keep their fixed meaning, green better and red worse. Comparisons with fewer than two games are left out. Hover or focus a row for its distribution; its chart below is outlined.',
    ], 'game data'));
    caption.appendChild(heading);
    if (view === 'chart') {
      if (!settings.gameDataDistributions) caption.appendChild(poolSwitch());
      caption.appendChild(checkbox('show distributions', settings.gameDataDistributions, (checked) => {
        settings.gameDataDistributions = checked;
        saveSettings();
        renderAndFocus('figcaption input[type="checkbox"]');
      }));
    } else {
      caption.appendChild(button('back to game data', () => show('chart')));
    }
    profile.appendChild(caption);
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
        const name = document.createElement('td'); name.appendChild(chartHelpButton(metric.help, metric.name)); row.appendChild(name);
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
      configView.appendChild(checkbox('also rank time against the last 24 hours', settings.gameDataDayTime, (checked) => {
        settings.gameDataDayTime = checked; rows = null; saveSettings();
      }));
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
      const choice = SessionScope.choices.find((c) => c.id === settings.sessionDefinition);
      controls.append(label, chartHelpButton('Each row is the session window (' + choice.label
        + ', set with the picker at the upper left) ending at one saved game: the median and middle half of this measurement over that window’s games, with n the games measured. Wins-only measurements skip losses. Windows overlap, so the rows are not separate sessions.'));
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
      pager.append(prev, 'page ' + (historyPage + 1) + ' / ' + Math.max(1, Math.ceil(groups.total / pageSize)), next);
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
        profile.appendChild(buildGameDataDistributions(rows));
      } else {
        const band = buildGameDataBand(rows, settings.gameDataBandPool, settings.gameDataShowValues);
        profile.appendChild(band.element);
        observer = new ResizeObserver(() => {
          if (!profile.isConnected) { observer.disconnect(); return; }
          band.layout();
        });
        observer.observe(band.element);
        requestAnimationFrame(band.layout);
      }
    }
    const footer = document.createElement('div');
    footer.className = 'game-data-controls';
    footer.appendChild(checkbox('show actual value', settings.gameDataShowValues, (checked) => {
      settings.gameDataShowValues = checked; saveSettings();
      renderAndFocus('.game-data-controls input[type="checkbox"]');
    }));
    if (view === 'chart') footer.append(button('configure', () => show('config')), button('session history', () => show('history')));
    profile.appendChild(footer);
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
