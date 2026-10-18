'use strict';

// During this game, second by second: the block at the head of the game data
// column (docs/product/during-game.md). The analysis worker builds the rows'
// series from the finished game's trace (during-game.js); this file draws
// them as charts in the session stats' grammar on one time axis, with the
// event lanes under them, shows a moment's values by the pointer and the
// board at that moment beside the block, opens the replay there, and chooses
// the rows.

//-------DURING THE GAME: SOURCE (the game the reports worker holds)-------

// The endedAt of the game whose trace and board went to the reports worker
// last, when a game finished or a saved game was restored, while the page
// still holds that game's trace (a new game clears it); the rows exist for
// that game only.
let duringGameSourceId = null;

function duringGameAvailable(record) {
  return duringGameSourceId === record.endedAt;
}

//-------DURING THE GAME: EVENT WORDS (hover card)-------

const DURING_GAME_MISCLICK_PHRASES = {
  'opened-proven-mine': 'opened a proven mine',
  'flagged-proven-safe': 'flagged a proven-safe square',
  'removed-proven-mine-flag': 'removed a proven mine\u2019s flag',
  'chord-visible-contradiction': 'chorded against the visible proof',
};

const DURING_GAME_ACTION_PHRASES = {
  reveal: 'a reveal', 'proof-open': 'a reveal', chord: 'a chord',
  'flag-place': 'a flag', 'flag-remove': 'a flag removal', 'no-op': 'a click that changed nothing',
};

function duringGameSeconds(ms) {
  return (ms / 1000).toFixed(1) + ' s';
}

function duringGamePlural(count, one, many) {
  return count + ' ' + (count === 1 ? one : many);
}

// One line per fact of an event, in words.
function duringGameEventLines(event) {
  const percent = (p) => (p * 100).toFixed(1) + '%';
  const jump = (e) => 'jumped ' + duringGamePlural(e.squares, 'square', 'squares') + (e.guess ? ' to a guess' : '');
  switch (event.type) {
    case 'no-op': return ['no-op: ' + NO_OP_REASON_PHRASES[event.reason]];
    case 'misclick': return ['misclick: ' + DURING_GAME_MISCLICK_PHRASES[event.mistake]];
    case 'flag-removed':
      return ['flag removed' + (event.stoodMs === undefined ? ''
        : ' ' + duringGameSeconds(event.stoodMs) + ' after placing it' + (event.quickUndo ? ': a quick undo' : ''))];
    case 'wrong-flag': return ['flag on a safe square'];
    case 'guess':
      return ['guess' + (event.risk === undefined ? '' : ': ' + percent(event.risk) + ' mine risk')
        + (event.bestRisk === undefined ? '' : ', lowest available ' + percent(event.bestRisk)),
      ...(event.safeAvailable ? ['a proven-safe square was available'] : []),
      ...(event.died ? ['the square was a mine'] : [])];
    case 'long-gap':
      return [duringGameSeconds(event.endMs - event.atMs) + ' pause, ended by ' + DURING_GAME_ACTION_PHRASES[event.endedBy],
        event.known === null
          ? 'proof stopped at its work limit; ' + event.countingKnown + ' safe by counting'
          : duringGamePlural(event.known, 'proven-safe square', 'proven-safe squares') + ' known: '
            + event.countingKnown + ' by counting, ' + event.nearKnown + ' near the click before',
        ...(event.noOps > 0 ? [duringGamePlural(event.noOps, 'no-op click', 'no-op clicks') + ' inside'] : []),
        ...(event.windowLeft ? ['the window was left during it'] : [])];
    case 'moved-on':
      return ['moved on: ' + jump(event),
        ...(event.nearestSafeSquares === undefined ? []
          : ['nearest proven-safe square ' + duringGamePlural(event.nearestSafeSquares, 'square', 'squares') + ' away'])];
    case 'left-work':
      return ['left work: ' + duringGamePlural(event.leftSafe, 'proven-safe square', 'proven-safe squares') + ' unopened',
        jump(event)];
    case 'fork':
      return ['fork: ' + event.areas + ' places with proven-safe squares',
        !event.toArea ? 'went to none of them'
          : event.toNearestArea ? 'went to the nearest'
            : 'went past the nearest, ' + duringGamePlural(event.nearestSafeSquares, 'square', 'squares') + ' away'];
    case 'came-back': return ['came back after ' + duringGameSeconds(event.awayMs)];
    case 'opening': return ['opening: ' + duringGamePlural(event.opened, 'square', 'squares') + ' opened'];
    case 'window-left': return ['window left for ' + duringGameSeconds(event.endMs - event.atMs)];
    case 'unused-flag': return ['correct flag no chord used' + (event.removed ? '; removed later' : '')];
    default: throw new Error('during the game: unknown event ' + event.type);
  }
}

// An event lane's events at a moment: the instants within the hover reach
// and the spans holding it.
function duringGameEventsAt(row, atMs, toleranceMs) {
  if (!row.events) return [];
  return row.events.filter((event) => (event.endMs !== undefined
    ? atMs >= event.atMs && atMs <= event.endMs
    : Math.abs(event.atMs - atMs) <= toleranceMs));
}

//-------DURING THE GAME: THE BOARD AT A MOMENT AND THE CARD (floating)-------

// The board's squares fit this box, each between these sizes.
const DURING_GAME_BOARD_BOX = { width: 400, height: 300 };
const DURING_GAME_CELL_PX = { min: 6, max: 24 };
const DURING_GAME_FLOAT_GAP_PX = 8;
const DURING_GAME_CARD_GAP_PX = 14;

// Both are body-level popovers, so they also show above the compact details
// popover; one of each serves every block.
let duringGameBoardPanel = null;
let duringGameCardEl = null;

function duringGamePopover(className) {
  const element = document.createElement('div');
  element.className = className;
  element.setAttribute('popover', 'manual');
  document.body.appendChild(element);
  return element;
}

// The window less its scrollbars, which would cover a fixed popover's edge.
function duringGameRoom() {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}

// Real board squares, so the number display, flags, and mines follow the
// player's board settings as the board itself does. A narrow window
// narrows the box.
function duringGameBoard(width, height) {
  if (duringGameBoardPanel === null) {
    const element = duringGamePopover('during-game-board');
    const head = document.createElement('div');
    head.className = 'during-game-board-head';
    const grid = document.createElement('div');
    grid.className = 'during-game-board-grid';
    element.append(head, grid);
    duringGameBoardPanel = { element, head, grid, cells: [], width: 0, height: 0, cellPx: 0, painted: null };
  }
  const board = duringGameBoardPanel;
  if (board.width !== width || board.height !== height) {
    board.grid.style.gridTemplateColumns = 'repeat(' + width + ', var(--cell-size))';
    board.cells = Array.from({ length: width * height }, () => document.createElement('div'));
    board.grid.replaceChildren(...board.cells);
    board.width = width;
    board.height = height;
    board.painted = null;
  }
  const boxWidth = Math.min(DURING_GAME_BOARD_BOX.width, duringGameRoom().width - 40);
  const cellPx = Math.max(DURING_GAME_CELL_PX.min, Math.min(DURING_GAME_CELL_PX.max,
    Math.floor(Math.min(boxWidth / width, DURING_GAME_BOARD_BOX.height / height))));
  if (board.cellPx !== cellPx) {
    board.grid.style.setProperty('--cell-size', cellPx + 'px');
    board.cellPx = cellPx;
  }
  return board;
}

// The replay's frame at `step`: the position before that action with the
// action's squares shaded, and `marked` squares ringed as proven safe; past
// the last action, the finished board as the game board shows it.
function paintDuringGameBoard(board, frames, step, marked) {
  if (step === frames.length) {
    finishedBoardCells().forEach((cell, i) => {
      board.cells[i].className = cell.className;
      board.cells[i].innerHTML = cell.innerHTML;
    });
    return;
  }
  const model = replayFrameModel(frames[step].evaluation, null, settings.replayOverlays);
  for (const cell of model.cells) {
    for (const key of cell.marks) if (key !== 'selected') cell.marks.delete(key);
  }
  for (const index of marked) {
    if (!model.cells[index].revealed) model.cells[index].marks.add('safe');
  }
  paintReplayFrame(model, board.cells);
}

// Beside the block, level with its top: right when the window has room, else
// left. It never follows the pointer. A window too narrow for either puts it
// at the window's top or bottom, whichever half the pointer is not in, so it
// never covers the chart being read.
function placeDuringGameBoard(board, block, clientY) {
  const room = duringGameRoom();
  const rect = block.getBoundingClientRect();
  const width = board.element.offsetWidth;
  const height = board.element.offsetHeight;
  const right = rect.right + DURING_GAME_FLOAT_GAP_PX;
  const left = rect.left - DURING_GAME_FLOAT_GAP_PX - width;
  const side = right + width <= room.width - 4 ? 'right' : left >= 4 ? 'left'
    : clientY > room.height / 2 ? 'top' : 'bottom';
  board.element.dataset.side = side;
  if (side === 'right' || side === 'left') {
    board.element.style.left = (side === 'right' ? right : left) + 'px';
    board.element.style.top = Math.max(4, Math.min(rect.top, room.height - height - 4)) + 'px';
  } else {
    board.element.style.left = Math.max(4, (room.width - width) / 2) + 'px';
    board.element.style.top = (side === 'top' ? 4 : room.height - height - 4) + 'px';
  }
  return side;
}

function duringGameCard() {
  if (duringGameCardEl === null) duringGameCardEl = duringGamePopover('during-game-card');
  return duringGameCardEl;
}

// By the pointer on the side away from the board, so it never covers it;
// beside the block, above the pointer where there is room.
function placeDuringGameCard(card, event, boardSide) {
  const room = duringGameRoom();
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const left = boardSide === 'left' ? event.clientX + DURING_GAME_CARD_GAP_PX
    : event.clientX - DURING_GAME_CARD_GAP_PX - width;
  const above = event.clientY - DURING_GAME_CARD_GAP_PX - height;
  const below = event.clientY + DURING_GAME_CARD_GAP_PX;
  const top = boardSide === 'top' ? below : boardSide === 'bottom' ? above : above >= 4 ? above : below;
  card.style.left = Math.max(4, Math.min(left, room.width - width - 4)) + 'px';
  card.style.top = Math.max(4, Math.min(top, room.height - height - 4)) + 'px';
}

function hideDuringGameHover() {
  if (duringGameBoardPanel !== null) {
    if (duringGameBoardPanel.element.matches(':popover-open')) duringGameBoardPanel.element.hidePopover();
    duringGameBoardPanel.painted = null;
  }
  if (duringGameCardEl !== null && duringGameCardEl.matches(':popover-open')) duringGameCardEl.hidePopover();
}

//-------DURING THE GAME: CHARTS (session stats grammar, one time axis)-------

// Heights in px. The progress chart is taller: its fixed 0-100% scale is
// labeled every 20%. `top` keeps the top tick's label inside the chart.
const DURING_GAME_LAYOUT = {
  progressPlot: 90, plot: 48, lane: 14, top: 6, xLabels: 16, bottom: 4, right: 8, minLeft: 40,
};
// Hover reaches raw marks this many pixels from the pointer.
const DURING_GAME_HOVER_PX = 6;
// The tick labels', lane names', and board head's fonts (style.css), for
// measuring.
const DURING_GAME_TICK_FONT = 'bold 12px Arial, sans-serif';
const DURING_GAME_NAME_FONT = '12px Arial, sans-serif';
const DURING_GAME_HEAD_TIME_FONT = 'bold 15px Arial, Helvetica, sans-serif';
const DURING_GAME_HEAD_FONT = '12px Arial, Helvetica, sans-serif';

let duringGameMeasureContext = null;
function duringGameTextWidth(text, font) {
  if (duringGameMeasureContext === null) duringGameMeasureContext = document.createElement('canvas').getContext('2d');
  duringGameMeasureContext.font = font;
  return duringGameMeasureContext.measureText(text).width;
}

function duringGameShape(svg, name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  svg.appendChild(node);
  return node;
}

function duringGameSize(svg, width, height) {
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.replaceChildren();
}

// The smallest 1, 2, or 5 times a power of ten at or above a positive value.
function duringGameRoundUp(value) {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((step) => step >= value * (1 - 1e-12));
}

function duringGameRowValues(row) {
  return [...(row.steps || []), ...(row.points || []), ...(row.buckets || []), ...(row.line || [])]
    .map((item) => item.value).filter((value) => Number.isFinite(value));
}

function duringGameTickLabel(chart) {
  if (chart.percent) return (value) => Math.round(value * 100) + '%';
  if (chart.scale === 'log') {
    return (value) => (value < 1000 ? Math.round(value) + 'ms' : Number((value / 1000).toPrecision(3)) + 's');
  }
  return (value) => Number(value.toPrecision(6)) + chart.unit;
}

// A chart's y scale over its rows' drawn values: `at` maps a value to its
// share of the plot's height. A fixed 0 to 1 for shares, decades for the log
// chart, else 0 up to the 1-2-5-10 ladder's next step, as in the session
// stats, labeled at zero, the middle, and the top, all a short plot holds.
// Null when the rows draw no values (rate ticks in raw).
function duringGameScale(chart, rows) {
  const label = duringGameTickLabel(chart);
  if (chart.scale === 'share') {
    const ticks = niceTicks(0, 1, 5);
    return { at: (value) => value, ticks, minors: minorTicks(ticks, 0, 1), label };
  }
  const values = rows.flatMap(duringGameRowValues);
  if (values.length === 0) return null;
  if (chart.scale === 'log') {
    // A zero gap draws on the floor, the decade under the shortest gap.
    const positive = values.filter((value) => value > 0);
    const low = positive.length > 0 ? Math.pow(10, Math.floor(Math.log10(Math.min(...positive)))) : 1;
    const high = Math.max(low * 10, duringGameRoundUp(Math.max(low, ...positive)));
    const span = Math.log(high) - Math.log(low);
    const ticks = [];
    for (let decade = low; decade <= high * (1 + 1e-9); decade *= 10) ticks.push(decade);
    const minors = ticks.flatMap((decade) => [2, 3, 4, 5, 6, 7, 8, 9].map((k) => decade * k))
      .filter((value) => value < high * (1 - 1e-9));
    return { at: (value) => (Math.log(Math.max(value, low)) - Math.log(low)) / span, ticks, minors, label };
  }
  const highest = Math.max(...values);
  // An all-zero series still needs an axis: 0 to 1.
  const top = highest > 0 ? duringGameRoundUp(highest) : 1;
  const ticks = [0, top / 2, top];
  return { at: (value) => value / top, ticks, minors: minorTicks(ticks, 0, top), label };
}

function duringGameLaneCount(row, spec) {
  return row.summary === undefined ? '' : spec.format(row.summary);
}

// The plots' shared left edge: room for every y tick label and every lane's
// name and count, so all plots start at the same x.
function duringGameLeftMargin(charts, laneRows) {
  let width = DURING_GAME_LAYOUT.minLeft;
  for (const { scale } of charts) {
    if (scale === null) continue;
    for (const tick of scale.ticks) {
      width = Math.max(width, duringGameTextWidth(scale.label(tick), DURING_GAME_TICK_FONT) + 8);
    }
  }
  for (const { row, spec } of laneRows) {
    width = Math.max(width, duringGameTextWidth(spec.name, DURING_GAME_NAME_FONT) + 8
      + duringGameTextWidth(duringGameLaneCount(row, spec), DURING_GAME_TICK_FONT) + 8);
  }
  return Math.ceil(width);
}

// Gridlines at the axis's seconds through one plot, labeled under it when
// `labeled`.
function drawDuringGameTimeAxis(svg, axis, plotTop, plotBottom, labeled) {
  for (const tick of axis.ticks) {
    const at = axis.x(tick * 1000);
    duringGameShape(svg, 'line', { x1: at, y1: plotTop, x2: at, y2: plotBottom, class: 'scatter-grid' });
    if (!labeled) continue;
    const label = duringGameShape(svg, 'text', { x: at, y: plotBottom + 13, class: 'scatter-tick tick-x' },
      Number(tick.toFixed(3)) + 's');
    if (at > axis.right - 12) label.setAttribute('style', 'text-anchor: end');
  }
}

// A drawn row's line: steps for progress and board states, bucket averages
// as steps joined where buckets meet, or the rolling average.
function duringGameSeriesPath(row, axis, y) {
  const f = (value) => value.toFixed(1);
  let d = '';
  let open = false;
  if (row.steps) {
    row.steps.forEach((step, i) => {
      if (step.value === null) { open = false; return; }
      const end = i + 1 < row.steps.length ? row.steps[i + 1].atMs : axis.endMs;
      d += (open ? 'V' + f(y(step.value)) : 'M' + f(axis.x(step.atMs)) + ' ' + f(y(step.value))) + 'H' + f(axis.x(end));
      open = true;
    });
  } else if (row.buckets) {
    let previousEnd = null;
    for (const bucket of row.buckets) {
      if (bucket.value === undefined) { open = false; continue; }
      d += (open && previousEnd === bucket.fromMs ? 'V' + f(y(bucket.value))
        : 'M' + f(axis.x(bucket.fromMs)) + ' ' + f(y(bucket.value))) + 'H' + f(axis.x(bucket.toMs));
      open = true;
      previousEnd = bucket.toMs;
    }
  } else if (row.line) {
    for (const point of row.line) {
      if (point.value === undefined) { open = false; continue; }
      d += (open ? 'L' : 'M') + f(axis.x(point.atMs)) + ' ' + f(y(point.value));
      open = true;
    }
  }
  return d;
}

function drawDuringGameChart(chart, axis, labeled) {
  const { svg, scale, plotHeight } = chart;
  const plotTop = DURING_GAME_LAYOUT.top;
  const plotBottom = plotTop + plotHeight;
  duringGameSize(svg, axis.width, plotBottom + (labeled ? DURING_GAME_LAYOUT.xLabels : DURING_GAME_LAYOUT.bottom));
  duringGameShape(svg, 'rect', { x: axis.left, y: plotTop, width: axis.right - axis.left, height: plotHeight, class: 'scatter-plot' });
  drawDuringGameTimeAxis(svg, axis, plotTop, plotBottom, labeled);
  const y = scale === null ? null : (value) => plotBottom - scale.at(value) * plotHeight;
  if (scale !== null) {
    for (const tick of scale.ticks) {
      duringGameShape(svg, 'line', { x1: axis.left, y1: y(tick), x2: axis.right, y2: y(tick), class: 'scatter-grid' });
      duringGameShape(svg, 'text', { x: axis.left - 4, y: y(tick) + 4, class: 'scatter-tick tick-y' }, scale.label(tick));
    }
    for (const minor of scale.minors) {
      duringGameShape(svg, 'line', { x1: axis.left - 4, y1: y(minor), x2: axis.left, y2: y(minor), class: 'scatter-minor' });
    }
  }
  // Raw marks first, then every line over them.
  for (const { row, spec, nodes } of chart.members) {
    nodes.length = 0;
    for (const tick of row.ticks || []) {
      const height = Math.min(10, 3 + 2 * tick.weight);
      nodes.push(duringGameShape(svg, 'rect', { x: (axis.x(tick.atMs) - 0.5).toFixed(1), y: plotBottom - height,
        width: 1, height, fill: spec.color, class: 'during-game-tick' }));
    }
    if (y === null) continue;
    for (const point of row.points || []) {
      nodes.push(duringGameShape(svg, 'circle', { cx: axis.x(point.atMs).toFixed(1), cy: y(point.value).toFixed(1),
        r: 1.6, fill: spec.color, class: 'during-game-dot' }));
    }
  }
  if (y === null) return;
  for (const { row, spec, nodes } of chart.members) {
    const d = duringGameSeriesPath(row, axis, y);
    if (d !== '') nodes.push(duringGameShape(svg, 'path', { d, stroke: spec.color, class: 'end-line' }));
  }
}

function drawDuringGameLanes(lanes, axis, labeled) {
  const { svg, names, rows } = lanes;
  const lane = DURING_GAME_LAYOUT.lane;
  const plotBottom = 1 + rows.length * lane;
  names.style.width = axis.left + 'px';
  duringGameSize(svg, axis.width, plotBottom + (labeled ? DURING_GAME_LAYOUT.xLabels : DURING_GAME_LAYOUT.bottom));
  duringGameShape(svg, 'rect', { x: axis.left, y: 1, width: axis.right - axis.left, height: plotBottom - 1, class: 'scatter-plot' });
  drawDuringGameTimeAxis(svg, axis, 1, plotBottom, labeled);
  rows.forEach(({ row }, i) => {
    const top = 1 + i * lane;
    if (i > 0) duringGameShape(svg, 'line', { x1: axis.left, y1: top, x2: axis.right, y2: top, class: 'scatter-grid' });
    if (row.kind === 'unrecorded') {
      duringGameShape(svg, 'text', { x: axis.left + 4, y: top + lane - 3, class: 'during-game-unrecorded' }, 'not recorded for this game');
      return;
    }
    for (const event of row.events) {
      if (event.endMs !== undefined) {
        duringGameShape(svg, 'rect', { x: axis.x(event.atMs).toFixed(1), y: top + 3,
          width: Math.max(1, axis.x(event.endMs) - axis.x(event.atMs)).toFixed(1), height: lane - 6, class: 'during-game-span' });
      } else {
        duringGameShape(svg, 'rect', { x: (axis.x(event.atMs) - 1).toFixed(1), y: top + 2, width: 2, height: lane - 4,
          class: event.died ? 'during-game-mark during-game-mark-death' : 'during-game-mark' });
      }
    }
  });
}

// Draws `view` into `charts` inside `block` and wires the hover and the
// replay link. Returns the layout, which redraws at the charts' width.
function renderDuringGameCharts(charts, view, block, raw) {
  hideDuringGameHover();
  charts.replaceChildren();
  const empty = (text) => {
    charts.classList.add('during-game-empty');
    charts.textContent = text;
    return () => {};
  };
  if (!view.recorded) return empty('This game\u2019s trace holds no recorded actions.');
  if (view.timeMs === 0) return empty('This game ended at its first click: there is no time to plot.');
  const frames = pathDecisionEvents(trace.events);
  if (frames.length !== view.actions.length) {
    throw new Error('during the game: the page holds ' + frames.length + ' replay frames for '
      + view.actions.length + ' analyzed actions');
  }
  if (view.rows.length === 0) return empty('No rows chosen: choose them with configure.');

  const shown = view.rows.map((row) => ({ row, spec: DuringGame.rowById(row.id), nodes: [] }));
  const drawnCharts = [];
  for (const chart of DuringGame.CHARTS) {
    const members = shown.filter((member) => member.spec.chart === chart.id);
    if (members.length === 0) continue;
    const plotHeight = chart.id === 'progress' ? DURING_GAME_LAYOUT.progressPlot : DURING_GAME_LAYOUT.plot;
    const element = document.createElement('div');
    element.className = 'during-game-chart';
    element.dataset.chart = chart.id;
    const legend = document.createElement('div');
    legend.className = 'during-game-legend';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'during-game-chart-svg' + (raw ? ' during-game-raw' : ''));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', chart.name + ' during this game');
    for (const member of members) {
      const entry = document.createElement('span');
      entry.className = 'end-legend-item during-game-legend-item';
      entry.dataset.row = member.row.id;
      const swatch = document.createElement('span');
      swatch.className = 'end-swatch';
      swatch.style.background = member.spec.color;
      const value = document.createElement('span');
      value.className = 'during-game-legend-value';
      value.textContent = member.row.summary === undefined ? 'not measured' : member.spec.format(member.row.summary);
      entry.append(swatch, chartHelpButton(member.spec.help, member.spec.name), value);
      bindSeriesHighlight(svg, entry, member.nodes);
      legend.appendChild(entry);
    }
    element.append(legend, svg);
    charts.appendChild(element);
    drawnCharts.push({ chart, members, plotHeight, element, svg,
      scale: duringGameScale(chart, members.map((member) => member.row)) });
  }
  const laneRows = shown.filter((member) => member.spec.chart === undefined);
  let lanes = null;
  if (laneRows.length > 0) {
    const element = document.createElement('div');
    element.className = 'during-game-chart during-game-lanes';
    element.dataset.chart = 'events';
    const names = document.createElement('div');
    names.className = 'during-game-lane-names';
    for (const { row, spec } of laneRows) {
      const name = document.createElement('div');
      name.className = 'during-game-lane-name';
      name.dataset.row = row.id;
      const count = document.createElement('span');
      count.className = 'during-game-lane-count';
      count.textContent = duringGameLaneCount(row, spec);
      name.append(chartHelpButton(spec.help, spec.name), count);
      names.appendChild(name);
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'during-game-lanes-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'events during this game');
    element.append(names, svg);
    charts.appendChild(element);
    lanes = { element, names, svg, rows: laneRows };
  }
  const line = document.createElement('div');
  line.className = 'during-game-line';
  line.hidden = true;
  charts.appendChild(line);

  const left = duringGameLeftMargin(drawnCharts, laneRows);
  let axis = null;
  function layout() {
    const width = Math.floor(charts.clientWidth);
    if (width <= left + DURING_GAME_LAYOUT.right + 40 || (axis !== null && axis.width === width)) return;
    const right = width - DURING_GAME_LAYOUT.right;
    const plotWidth = right - left;
    axis = {
      width, left, right, endMs: view.timeMs,
      x: (atMs) => left + Math.min(1, Math.max(0, atMs / view.timeMs)) * plotWidth,
      ticks: niceTicks(0, view.timeMs / 1000, Math.max(2, Math.floor(plotWidth / 56))),
    };
    const parts = [...drawnCharts, ...(lanes === null ? [] : [lanes])];
    parts.forEach((part, i) => {
      const labeled = i === 0 || i === parts.length - 1;
      if (part === lanes) drawDuringGameLanes(lanes, axis, labeled);
      else drawDuringGameChart(part, axis, labeled);
    });
  }

  // The replay step showing the board at a moment: the first action after
  // it. The last click ends the game, so the finished board is everything
  // within hover reach of the end.
  const stepAt = (moment) => {
    if (moment.atMs >= view.timeMs - moment.toleranceMs) return view.actions.length;
    const next = view.actions.findIndex((action) => action.atMs > moment.atMs);
    return next === -1 ? view.actions.length : next;
  };
  const momentAt = (event) => {
    if (axis === null) return null;
    const chartsX = event.clientX - charts.getBoundingClientRect().left;
    if (chartsX < axis.left || chartsX > axis.right) return null;
    const plotWidth = axis.right - axis.left;
    return { atMs: (chartsX - axis.left) / plotWidth * view.timeMs, toleranceMs: DURING_GAME_HOVER_PX / plotWidth * view.timeMs };
  };
  // The chart or event lane under the pointer; null between them.
  const partAt = (clientY) => {
    for (const chart of drawnCharts) {
      const rect = chart.element.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) return { chart };
    }
    if (lanes === null) return null;
    const index = Math.floor((clientY - lanes.svg.getBoundingClientRect().top - 1) / DURING_GAME_LAYOUT.lane);
    return index >= 0 && index < lanes.rows.length ? { lane: lanes.rows[index] } : null;
  };
  const card = duringGameCard();
  let boardSide = 'right';
  // Room for this game's longest head line (its last second, the longest
  // action, the last square's name), so the board's width and place never
  // change while the pointer moves.
  const headWidth = Math.ceil(duringGameTextWidth(duringGameSeconds(view.timeMs), DURING_GAME_HEAD_TIME_FONT)
    + Math.max(...Object.values(DURING_GAME_ACTION_PHRASES).map((phrase) => duringGameTextWidth(' \u00b7 next: '
      + phrase + ' at ' + evaluationCellName(view.width * view.height - 1, view.width), DURING_GAME_HEAD_FONT))));

  function showBoard(moment, events, clientY) {
    const board = duringGameBoard(view.width, view.height);
    board.head.style.minWidth = headWidth + 'px';
    const step = stepAt(moment);
    const marked = events.flatMap((event) => event.safeCells || []);
    const key = step + '|' + marked.join(',');
    if (board.painted !== key) {
      paintDuringGameBoard(board, frames, step, marked);
      board.painted = key;
    }
    const time = document.createElement('span');
    time.className = 'during-game-board-time';
    time.textContent = duringGameSeconds(moment.atMs);
    const next = step < view.actions.length ? view.actions[step] : null;
    board.head.replaceChildren(time, next === null ? ' \u00b7 the finished board'
      : ' \u00b7 next: ' + DURING_GAME_ACTION_PHRASES[next.kind]
        + (next.cell === null ? '' : ' at ' + evaluationCellName(next.cell, view.width)));
    if (!board.element.matches(':popover-open')) board.element.showPopover();
    boardSide = placeDuringGameBoard(board, block, clientY);
  }

  function fillCard(atMs, toleranceMs, part, events) {
    const time = document.createElement('div');
    time.className = 'during-game-card-time';
    time.textContent = duringGameSeconds(atMs);
    card.replaceChildren(time);
    const cardRow = (...children) => {
      const row = document.createElement('div');
      row.className = 'during-game-card-row';
      row.append(...children);
      card.appendChild(row);
    };
    if (part.chart) {
      let measured = 0;
      for (const { row, spec } of part.chart.members) {
        const value = DuringGame.valueAt(row, atMs, toleranceMs);
        if (value === undefined) continue;
        measured++;
        const swatch = document.createElement('span');
        swatch.className = 'end-swatch';
        swatch.style.background = spec.color;
        const shownValue = document.createElement('span');
        shownValue.className = 'during-game-card-value';
        shownValue.textContent = spec.format(value);
        cardRow(swatch, ' ' + spec.name + ' ', shownValue);
      }
      if (measured === 0) cardRow('nothing measured at this moment');
      return;
    }
    const name = document.createElement('span');
    name.className = 'during-game-card-lane';
    name.textContent = part.lane.spec.name;
    cardRow(name);
    if (part.lane.row.kind === 'unrecorded') cardRow('not recorded for this game');
    else if (events.length === 0) cardRow('none at this moment');
    else for (const event of events) for (const text of duringGameEventLines(event)) cardRow(text);
  }

  function hide() {
    line.hidden = true;
    hideDuringGameHover();
  }
  charts.addEventListener('pointermove', (event) => {
    const moment = momentAt(event);
    if (moment === null) { hide(); return; }
    line.style.left = axis.x(moment.atMs) + 'px';
    line.hidden = false;
    const part = partAt(event.clientY);
    const events = part !== null && part.lane ? duringGameEventsAt(part.lane.row, moment.atMs, moment.toleranceMs) : [];
    showBoard(moment, events, event.clientY);
    // Over a name, its definition shows instead of the card.
    if (part === null || event.target.closest('.chart-help-wrap')) {
      if (card.matches(':popover-open')) card.hidePopover();
      return;
    }
    fillCard(moment.atMs, moment.toleranceMs, part, events);
    if (!card.matches(':popover-open')) card.showPopover();
    placeDuringGameCard(card, event, boardSide);
  });
  charts.addEventListener('pointerleave', hide);
  charts.addEventListener('click', (event) => {
    const moment = momentAt(event);
    if (moment === null || event.target.closest('button')) return;
    hide();
    // The review panel follows its remembered state on every replay render.
    rememberPanel('replay', true);
    setReplayStep(stepAt(moment));
    gameFrame.scrollIntoView({ block: 'nearest' });
  });
  return layout;
}

//-------DURING THE GAME: BLOCK (title, options row, configure)-------

const DURING_GAME_TITLE = 'during this game, second by second';

function buildDuringGameBlock(record, isCurrent) {
  const { section: host, body: sectionBody } = buildStatSection('duringGame', DURING_GAME_TITLE, [
    'Each chart follows this game on one time axis, from the first click to the end; rows that share a unit share a chart, and the event lanes run under them.',
    'Point at a moment for the values then and, beside this block, the board as it was; click to open the replay there.',
  ]);
  host.classList.add('during-game');
  const body = document.createElement('div');
  body.className = 'during-game-body';
  const controls = document.createElement('div');
  controls.className = 'game-data-controls during-game-controls';
  sectionBody.append(body, controls);
  let configuring = false;
  let generation = 0;
  let layout = () => {};
  new ResizeObserver(() => {
    if (host.isConnected) layout();
  }).observe(body);
  const button = (text, action) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    node.addEventListener('click', action);
    return node;
  };

  function refresh() {
    const current = ++generation;
    const rowIds = DuringGame.ROWS.filter((row) => settings.duringGameRows[row.id]).map((row) => row.id);
    const averageId = settings.duringGameAverage;
    const job = analysisTask('reports', 'during-game', { gameId: record.endedAt, timeMs: record.timeMs,
      outcome: record.outcome, rows: rowIds, average: averageId }).then((view) => {
      if (current !== generation || !isCurrent() || configuring) return;
      const charts = document.createElement('div');
      charts.className = 'during-game-charts';
      body.replaceChildren(charts);
      layout = renderDuringGameCharts(charts, view, host, averageId === 'raw');
      layout();
    });
    job.catch(analysisFailure);
    return job;
  }

  function showRows() {
    configuring = false;
    configure.setAttribute('aria-pressed', 'false');
    return refresh();
  }

  function showConfigure() {
    configuring = true;
    configure.setAttribute('aria-pressed', 'true');
    layout = () => {};
    hideDuringGameHover();
    const view = document.createElement('div');
    view.className = 'during-game-config';
    const back = () => button('back to during this game', () => {
      showRows().then(() => configure.focus());
    });
    view.appendChild(back());
    for (const [groupId, groupName] of DuringGame.GROUPS) {
      const groupTitle = document.createElement('h4');
      groupTitle.textContent = groupName;
      const table = document.createElement('table');
      const tableBody = document.createElement('tbody');
      for (const row of DuringGame.ROWS.filter((item) => item.group === groupId)) {
        const tr = document.createElement('tr');
        const name = document.createElement('td');
        name.appendChild(chartHelpButton(row.help, row.name));
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = settings.duringGameRows[row.id];
        input.setAttribute('aria-label', row.name);
        input.addEventListener('change', () => {
          updateSettings({ duringGameRows: { ...settings.duringGameRows, [row.id]: input.checked } });
        });
        cell.appendChild(input);
        tr.append(name, cell);
        tableBody.appendChild(tr);
      }
      table.appendChild(tableBody);
      view.append(groupTitle, table);
    }
    view.appendChild(back());
    view.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      showRows().then(() => configure.focus());
    });
    body.replaceChildren(view);
    view.querySelector('button').focus();
  }

  const average = document.createElement('select');
  average.className = 'avg-mode-select';
  for (const [id, label] of DuringGame.AVERAGES) average.add(new Option(label, id));
  average.value = settings.duringGameAverage;
  average.addEventListener('change', () => {
    updateSettings({ duringGameAverage: average.value });
    if (!configuring) refresh();
  });
  const averageLabel = document.createElement('label');
  averageLabel.append('averaging ', average);
  const configure = button('configure', () => {
    if (configuring) showRows();
    else showConfigure();
  });
  configure.setAttribute('aria-pressed', 'false');
  controls.append(averageLabel, configure);
  host.analysisReady = refresh();
  return host;
}
