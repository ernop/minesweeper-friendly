'use strict';

// Live perf charts: the block at the head of the game data column
// (docs/product/during-game.md). The analysis worker builds the rows' series
// from the finished game's trace (during-game.js); this file draws them as
// two framed charts on one time axis, progress and every other line against
// its whole-game value, with the event tracks under them; shows the value of
// the line under the pointer and, beside the block, the board at that
// moment; opens the replay there; and chooses the rows.

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

// One line per fact of an event, in words.
function duringGameEventLines(event) {
  const percent = (p) => (p * 100).toFixed(1) + '%';
  const jump = (e) => 'jumped ' + countPhrase(e.squares, 'square', 'squares') + (e.guess ? ' to a guess' : '');
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
          : countPhrase(event.known, 'proven-safe square', 'proven-safe squares') + ' known: '
            + event.countingKnown + ' by counting, ' + event.nearKnown + ' near the click before',
        ...(event.noOps > 0 ? [countPhrase(event.noOps, 'no-op click', 'no-op clicks') + ' inside'] : []),
        ...(event.windowLeft ? ['the window was left during it'] : [])];
    case 'moved-on':
      return ['moved on: ' + jump(event),
        ...(event.nearestSafeSquares === undefined ? []
          : ['nearest proven-safe square ' + countPhrase(event.nearestSafeSquares, 'square', 'squares') + ' away'])];
    case 'left-work':
      return ['left work: ' + countPhrase(event.leftSafe, 'proven-safe square', 'proven-safe squares') + ' unopened',
        jump(event)];
    case 'fork':
      return ['fork: ' + event.areas + ' places with proven-safe squares',
        !event.toArea ? 'went to none of them'
          : event.toNearestArea ? 'went to the nearest'
            : 'went past the nearest, ' + countPhrase(event.nearestSafeSquares, 'square', 'squares') + ' away'];
    case 'came-back': return ['came back after ' + duringGameSeconds(event.awayMs)];
    case 'opening': return ['opening: ' + countPhrase(event.opened, 'square', 'squares') + ' opened'];
    case 'window-left': return ['window left for ' + duringGameSeconds(event.endMs - event.atMs)];
    case 'unused-flag': return ['correct flag no chord used' + (event.removed ? '; removed later' : '')];
    default: throw new Error('during the game: unknown event ' + event.type);
  }
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

//-------DURING THE GAME: CHARTS (one time axis)-------

// Heights in px: progress labels its fixed 0-100% scale every 20%, and the
// relative chart holds every pace, board, and report line. `top` keeps the
// top tick's label inside the chart.
const DURING_GAME_LAYOUT = {
  plots: { progress: 90, relative: 120 }, track: 18, top: 6, xLabels: 16, bottom: 4, right: 8, minLeft: 32,
};
// The relative chart spans at most this many doublings each way of the
// whole-game value; a value past them draws on the edge, and the card gives
// it exactly.
const DURING_GAME_RELATIVE_DOUBLINGS = 3;
const DURING_GAME_RATIO_LABELS = {
  '-3': '\u215b\u00d7', '-2': '\u00bc\u00d7', '-1': '\u00bd\u00d7', 0: '1\u00d7', 1: '2\u00d7', 2: '4\u00d7', 3: '8\u00d7',
};
// Hover reaches raw marks this many pixels from the pointer.
const DURING_GAME_HOVER_PX = 6;
// The tick labels', track names', and board head's fonts (style.css), for
// measuring.
const DURING_GAME_TICK_FONT = 'bold 12px Arial, sans-serif';
const DURING_GAME_NAME_FONT = '12px Arial, sans-serif';
const DURING_GAME_HEAD_TIME_FONT = 'bold 15px Arial, Helvetica, sans-serif';
const DURING_GAME_HEAD_FONT = '12px Arial, Helvetica, sans-serif';

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

function duringGameRowValues(row) {
  return [...(row.steps || []), ...(row.points || []), ...(row.buckets || []), ...(row.line || [])]
    .map((item) => item.value).filter((value) => Number.isFinite(value));
}

// A line on the relative chart needs a whole-game value to compare with.
function duringGameComparable(row) {
  return Number.isFinite(row.summary) && row.summary > 0;
}

// A chart's y scale: `at` maps a value (on the relative chart, a ratio to
// the line's whole-game value) to its share of the plot's height. Progress
// is a fixed 0 to 1. The relative chart runs as many doublings each way of
// 1x as its farthest value needs, at least one and at most
// DURING_GAME_RELATIVE_DOUBLINGS, with zero on the floor. Null when the rows
// draw no values (rates in raw are ticks).
function duringGameScale(chart, rows) {
  if (chart.scale === 'share') {
    const ticks = niceTicks(0, 1, 5);
    return { at: (value) => value, ticks, minors: minorTicks(ticks, 0, 1),
      label: (value) => Math.round(value * 100) + '%' };
  }
  const ratios = rows.filter(duringGameComparable)
    .flatMap((row) => duringGameRowValues(row).map((value) => value / row.summary))
    .filter((ratio) => ratio > 0);
  if (ratios.length === 0) return null;
  const farthest = Math.max(...ratios.map((ratio) => Math.abs(Math.log2(ratio))));
  const span = Math.min(DURING_GAME_RELATIVE_DOUBLINGS, Math.max(1, Math.ceil(farthest - 1e-9)));
  const ticks = [];
  for (let k = -span; k <= span; k++) ticks.push(2 ** k);
  return {
    at: (ratio) => (Math.max(-span, Math.min(span, ratio > 0 ? Math.log2(ratio) : -span)) + span) / (2 * span),
    ticks, minors: [], reference: 1, label: (ratio) => DURING_GAME_RATIO_LABELS[Math.round(Math.log2(ratio))],
  };
}

// The plots' shared left edge: room for every y tick label and every track
// name, so all plots start at the same x.
function duringGameLeftMargin(charts, tracks) {
  let width = DURING_GAME_LAYOUT.minLeft;
  for (const { scale } of charts) {
    if (scale === null) continue;
    for (const tick of scale.ticks) {
      width = Math.max(width, chartTextWidth(scale.label(tick), DURING_GAME_TICK_FONT) + 8);
    }
  }
  for (const track of tracks === null ? [] : tracks.used) {
    width = Math.max(width, chartTextWidth(track.name, DURING_GAME_NAME_FONT) + 8);
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

// Sets each member's `y`, its value's height in the svg, or null where the
// member draws no line.
function drawDuringGameChart(chart, axis, labeled) {
  const { svg, scale, plotHeight } = chart;
  const relative = chart.chart.scale === 'relative';
  const plotTop = DURING_GAME_LAYOUT.top;
  const plotBottom = plotTop + plotHeight;
  duringGameSize(svg, axis.width, plotBottom + (labeled ? DURING_GAME_LAYOUT.xLabels : DURING_GAME_LAYOUT.bottom));
  duringGameShape(svg, 'rect', { x: axis.left, y: plotTop, width: axis.right - axis.left, height: plotHeight, class: 'scatter-plot' });
  drawDuringGameTimeAxis(svg, axis, plotTop, plotBottom, labeled);
  const y = scale === null ? null : (value) => plotBottom - scale.at(value) * plotHeight;
  if (scale !== null) {
    for (const tick of scale.ticks) {
      duringGameShape(svg, 'line', { x1: axis.left, y1: y(tick), x2: axis.right, y2: y(tick),
        class: tick === scale.reference ? 'scatter-grid during-game-reference' : 'scatter-grid' });
      duringGameShape(svg, 'text', { x: axis.left - 4, y: y(tick) + 4, class: 'scatter-tick tick-y' }, scale.label(tick));
    }
    for (const minor of scale.minors) {
      duringGameShape(svg, 'line', { x1: axis.left - 4, y1: y(minor), x2: axis.left, y2: y(minor), class: 'scatter-minor' });
    }
  }
  // Raw marks first, then every line over them.
  for (const member of chart.members) {
    const { row, spec, nodes } = member;
    nodes.length = 0;
    for (const tick of row.ticks || []) {
      const height = Math.min(10, 3 + 2 * tick.weight);
      nodes.push(duringGameShape(svg, 'rect', { x: (axis.x(tick.atMs) - 0.5).toFixed(1), y: plotBottom - height,
        width: 1, height, fill: spec.color, class: 'during-game-tick' }));
    }
    member.y = y === null || (relative && !duringGameComparable(row)) ? null
      : relative ? (value) => y(value / row.summary) : y;
    if (member.y === null) continue;
    for (const point of row.points || []) {
      nodes.push(duringGameShape(svg, 'circle', { cx: axis.x(point.atMs).toFixed(1), cy: member.y(point.value).toFixed(1),
        r: 1.6, fill: spec.color, class: 'during-game-dot' }));
    }
  }
  for (const member of chart.members) {
    if (member.y === null) continue;
    const d = duringGameSeriesPath(member.row, axis, member.y);
    if (d !== '') member.nodes.push(duringGameShape(svg, 'path', { d, stroke: member.spec.color, class: 'end-line' }));
  }
}

//-------DURING THE GAME: EVENT TRACKS (marks by shape, one legend)-------

// An instant's mark, centered on its moment and its track's middle: filled
// shapes, or outlines drawn with the mark's color. Spans are a band through
// the track or a bar along its top.
const DURING_GAME_MARKS = {
  ring: { filled: false, d: (x, y, p) => 'M' + p(x - 3.5) + ' ' + p(y) + 'a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0' },
  cross: { filled: false, d: (x, y, p) => 'M' + p(x - 3.5) + ' ' + p(y - 3.5) + 'l7 7m0 -7l-7 7' },
  down: { filled: true, d: (x, y, p) => 'M' + p(x - 4) + ' ' + p(y - 3) + 'h8l-4 7z' },
  up: { filled: true, d: (x, y, p) => 'M' + p(x - 4) + ' ' + p(y + 3) + 'h8l-4 -7z' },
  upOutline: { filled: false, d: (x, y, p) => 'M' + p(x - 4) + ' ' + p(y + 3) + 'h8l-4 -7z' },
  diamond: { filled: true, d: (x, y, p) => 'M' + p(x) + ' ' + p(y - 4.5) + 'l4.5 4.5l-4.5 4.5l-4.5 -4.5z' },
  square: { filled: true, d: (x, y, p) => 'M' + p(x - 3.5) + ' ' + p(y - 3.5) + 'h7v7h-7z' },
  chevronRight: { filled: false, d: (x, y, p) => 'M' + p(x - 2) + ' ' + p(y - 4) + 'l4.5 4l-4.5 4' },
  chevronLeft: { filled: false, d: (x, y, p) => 'M' + p(x + 2) + ' ' + p(y - 4) + 'l-4.5 4l4.5 4' },
  arrowRight: { filled: true, d: (x, y, p) => 'M' + p(x - 3.5) + ' ' + p(y - 4) + 'l7.5 4l-7.5 4z' },
  fork: { filled: false, d: (x, y, p) => 'M' + p(x - 4) + ' ' + p(y) + 'h4l4 -4m-4 4l4 4' },
};

function duringGameMark(svg, spec, at) {
  if (spec.mark === 'band' || spec.mark === 'bar') {
    const band = spec.mark === 'band';
    return duringGameShape(svg, 'rect', { x: at.x.toFixed(1), y: band ? at.top + 4 : at.top + 1,
      width: Math.max(1, at.to - at.x).toFixed(1), height: band ? at.height - 8 : 3, fill: spec.color, class: 'during-game-mark' });
  }
  const mark = DURING_GAME_MARKS[spec.mark];
  return duringGameShape(svg, 'path', { d: mark.d(at.x, at.y, (value) => Number(value.toFixed(1))), class: 'during-game-mark',
    fill: mark.filled ? spec.color : 'none', stroke: mark.filled ? 'none' : spec.color });
}

// The mark alone, for the legend.
function duringGameLegendMark(spec) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'during-game-legend-mark');
  svg.setAttribute('width', 12);
  svg.setAttribute('height', 12);
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  duringGameMark(svg, spec, { x: spec.mark === 'band' || spec.mark === 'bar' ? 1 : 6, to: 11, y: 6, top: 0, height: 14 });
  return svg;
}

function drawDuringGameTracks(tracks, axis, labeled) {
  const { svg, names, used } = tracks;
  const height = DURING_GAME_LAYOUT.track;
  const plotBottom = 1 + used.length * height;
  names.style.width = axis.left + 'px';
  duringGameSize(svg, axis.width, plotBottom + (labeled ? DURING_GAME_LAYOUT.xLabels : DURING_GAME_LAYOUT.bottom));
  duringGameShape(svg, 'rect', { x: axis.left, y: 1, width: axis.right - axis.left, height: plotBottom - 1, class: 'scatter-plot' });
  drawDuringGameTimeAxis(svg, axis, 1, plotBottom, labeled);
  used.forEach((track, i) => {
    const top = 1 + i * height;
    if (i > 0) duringGameShape(svg, 'line', { x1: axis.left, y1: top, x2: axis.right, y2: top, class: 'scatter-grid' });
    for (const member of track.members) {
      member.nodes.length = 0;
      if (member.row.kind === 'unrecorded') continue;
      for (const event of member.row.events) {
        member.nodes.push(duringGameMark(svg, member.spec, event.endMs === undefined
          ? { x: axis.x(event.atMs), y: top + height / 2 }
          : { x: axis.x(event.atMs), to: axis.x(event.endMs), top, height }));
      }
    }
  });
}

// An event row's events at a moment: the instants within the hover reach
// and the spans holding it.
function duringGameEventsAt(row, atMs, toleranceMs) {
  if (!row.events) return [];
  return row.events.filter((event) => (event.endMs !== undefined
    ? atMs >= event.atMs && atMs <= event.endMs
    : Math.abs(event.atMs - atMs) <= toleranceMs));
}

//-------DURING THE GAME: DRAWING AND HOVER-------

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

  // One series in focus at a time: the line under the pointer, or the
  // legend entry under it. Everything else in its chart fades.
  let focused = null;
  const focus = (svg, member) => {
    if (focused !== null && focused.member === member) return;
    if (focused !== null) {
      focused.svg.classList.remove('series-focus');
      for (const node of focused.member.nodes) node.classList.remove('hot');
      focused = null;
    }
    if (member === null) return;
    svg.classList.add('series-focus');
    for (const node of member.nodes) node.classList.add('hot');
    focused = { svg, member };
  };
  const legendEntry = (svg, member, mark, valueText) => {
    const entry = document.createElement('span');
    entry.className = 'end-legend-item during-game-legend-item series-hotspot';
    entry.dataset.row = member.row.id;
    const value = document.createElement('span');
    value.className = 'during-game-legend-value';
    value.textContent = valueText;
    entry.append(mark, chartHelpButton(member.spec.help, member.spec.name), value);
    entry.addEventListener('mouseenter', () => focus(svg, member));
    entry.addEventListener('mouseleave', () => focus(null, null));
    return entry;
  };

  const shown = view.rows.map((row) => ({ row, spec: DuringGame.rowById(row.id), nodes: [], y: null }));
  const drawnCharts = [];
  for (const chart of DuringGame.CHARTS) {
    const members = shown.filter((member) => member.spec.chart === chart.id);
    if (members.length === 0) continue;
    const element = document.createElement('div');
    element.className = 'during-game-chart';
    element.dataset.chart = chart.id;
    const legend = document.createElement('div');
    legend.className = 'during-game-legend';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'during-game-chart-svg' + (raw ? ' during-game-raw' : ''));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', chart.name + ' during this game');
    if (chart.scale === 'relative') {
      const lead = document.createElement('span');
      lead.className = 'during-game-legend-lead';
      lead.textContent = 'whole game (1\u00d7)';
      legend.appendChild(lead);
    }
    for (const member of members) {
      const swatch = document.createElement('span');
      swatch.className = 'end-swatch';
      swatch.style.background = member.spec.color;
      legend.appendChild(legendEntry(svg, member, swatch,
        member.row.summary === undefined ? 'not measured' : member.spec.format(member.row.summary)));
    }
    element.append(legend, svg);
    charts.appendChild(element);
    drawnCharts.push({ chart, members, plotHeight: DURING_GAME_LAYOUT.plots[chart.id], element, svg,
      scale: duringGameScale(chart, members.map((member) => member.row)) });
  }
  const trackMembers = shown.filter((member) => member.spec.track !== undefined);
  let tracks = null;
  if (trackMembers.length > 0) {
    const element = document.createElement('div');
    element.className = 'during-game-chart during-game-tracks';
    element.dataset.chart = 'events';
    const used = DuringGame.TRACKS.map(([id, name]) => ({ id, name,
      members: trackMembers.filter((member) => member.spec.track === id) }))
      .filter((track) => track.members.length > 0);
    const names = document.createElement('div');
    names.className = 'during-game-track-names';
    for (const track of used) {
      const name = document.createElement('div');
      name.className = 'during-game-track-name';
      name.dataset.track = track.id;
      name.textContent = track.name;
      names.appendChild(name);
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'during-game-tracks-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'events during this game');
    const legend = document.createElement('div');
    legend.className = 'during-game-legend during-game-track-legend';
    for (const track of used) {
      for (const member of track.members) {
        legend.appendChild(legendEntry(svg, member, duringGameLegendMark(member.spec),
          member.row.kind === 'unrecorded' ? 'not recorded' : member.spec.format(member.row.summary)));
      }
    }
    element.append(names, svg, legend);
    charts.appendChild(element);
    tracks = { element, names, svg, used };
  }
  const line = document.createElement('div');
  line.className = 'during-game-line';
  line.hidden = true;
  charts.appendChild(line);

  const left = duringGameLeftMargin(drawnCharts, tracks);
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
    const parts = [...drawnCharts, ...(tracks === null ? [] : [tracks])];
    parts.forEach((part, i) => {
      const labeled = i === 0 || i === parts.length - 1;
      if (part === tracks) drawDuringGameTracks(tracks, axis, labeled);
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
  // The chart plot or event track under the pointer; null over legends and
  // between parts.
  const partAt = (clientY) => {
    for (const chart of drawnCharts) {
      const rect = chart.svg.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) return { chart };
    }
    if (tracks === null) return null;
    const index = Math.floor((clientY - tracks.svg.getBoundingClientRect().top - 1) / DURING_GAME_LAYOUT.track);
    return index >= 0 && index < tracks.used.length ? { track: tracks.used[index] } : null;
  };
  // The chart's line nearest the pointer at a moment, with its value then.
  const lineAt = (chart, moment, clientY) => {
    const top = chart.svg.getBoundingClientRect().top;
    let nearest = null;
    for (const member of chart.members) {
      if (member.y === null) continue;
      const value = DuringGame.valueAt(member.row, moment.atMs, moment.toleranceMs);
      if (value === undefined) continue;
      const distance = Math.abs(top + member.y(value) - clientY);
      if (nearest === null || distance < nearest.distance) nearest = { member, value, distance };
    }
    return nearest;
  };
  const card = duringGameCard();
  let boardSide = 'right';
  // Room for this game's longest head line (its last second, the longest
  // action, the last square's name), so the board's width and place never
  // change while the pointer moves.
  const headWidth = Math.ceil(chartTextWidth(duringGameSeconds(view.timeMs), DURING_GAME_HEAD_TIME_FONT)
    + Math.max(...Object.values(DURING_GAME_ACTION_PHRASES).map((phrase) => chartTextWidth(' \u00b7 next: '
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

  function fillCard(atMs, part, nearest, events) {
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
      if (nearest === null) {
        cardRow('nothing measured at this moment');
        return;
      }
      const swatch = document.createElement('span');
      swatch.className = 'end-swatch';
      swatch.style.background = nearest.member.spec.color;
      const shownValue = document.createElement('span');
      shownValue.className = 'during-game-card-value';
      shownValue.textContent = nearest.member.spec.format(nearest.value);
      cardRow(swatch, ' ' + nearest.member.spec.name + ' ', shownValue);
      return;
    }
    const name = document.createElement('span');
    name.className = 'during-game-card-track';
    name.textContent = part.track.name;
    cardRow(name);
    for (const member of part.track.members) {
      if (member.row.kind === 'unrecorded') cardRow(member.spec.name + ': not recorded for this game');
    }
    if (events.length === 0) cardRow('none at this moment');
    for (const event of events) for (const text of duringGameEventLines(event)) cardRow(text);
  }

  function hide() {
    line.hidden = true;
    focus(null, null);
    hideDuringGameHover();
  }
  charts.addEventListener('pointermove', (event) => {
    const moment = momentAt(event);
    if (moment === null) { hide(); return; }
    line.style.left = axis.x(moment.atMs) + 'px';
    line.hidden = false;
    const part = partAt(event.clientY);
    const events = part !== null && part.track ? part.track.members
      .flatMap((member) => duringGameEventsAt(member.row, moment.atMs, moment.toleranceMs))
      .sort((a, b) => a.atMs - b.atMs) : [];
    showBoard(moment, events, event.clientY);
    // Over a name, its definition shows instead of the card; over a legend
    // entry, its series stays in focus.
    if (part === null || event.target.closest('.chart-help-wrap')) {
      if (!event.target.closest('.during-game-legend-item')) focus(null, null);
      if (card.matches(':popover-open')) card.hidePopover();
      return;
    }
    const nearest = part.chart ? lineAt(part.chart, moment, event.clientY) : null;
    focus(nearest === null ? null : part.chart.svg, nearest === null ? null : nearest.member);
    fillCard(moment.atMs, part, nearest, events);
    if (!card.matches(':popover-open')) card.showPopover();
    placeDuringGameCard(card, event, boardSide);
  });
  charts.addEventListener('pointerleave', hide);
  charts.addEventListener('click', (event) => {
    const moment = momentAt(event);
    if (moment === null || event.target.closest('button')) return;
    hide();
    setReplayStep(stepAt(moment));
    gameFrame.scrollIntoView({ block: 'nearest' });
  });
  return layout;
}

//-------DURING THE GAME: BLOCK (title, options row, configure)-------

const DURING_GAME_TITLE = 'live perf charts';

function buildDuringGameBlock(record, isCurrent) {
  const { section: host, body: sectionBody } = buildStatSection('duringGame', DURING_GAME_TITLE);
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
    const averagingId = settings.duringGameAveraging;
    const job = analysisTask('reports', 'during-game', { gameId: record.endedAt, timeMs: record.timeMs,
      outcome: record.outcome, rows: rowIds, average: averagingId }).then((view) => {
      if (current !== generation || !isCurrent() || configuring) return;
      const charts = document.createElement('div');
      charts.className = 'during-game-charts';
      body.replaceChildren(charts);
      layout = renderDuringGameCharts(charts, view, host, averagingId === 'raw');
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
    const back = () => button('back to live perf charts', () => {
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

  const averaging = document.createElement('select');
  averaging.className = 'avg-mode-select';
  for (const [id, label] of DuringGame.AVERAGES) averaging.add(new Option(label, id));
  averaging.value = settings.duringGameAveraging;
  averaging.addEventListener('change', () => {
    updateSettings({ duringGameAveraging: averaging.value });
    if (!configuring) refresh();
  });
  const averagingLabel = document.createElement('label');
  averagingLabel.append('averaging ', averaging);
  const configure = button('configure', () => {
    if (configuring) showRows();
    else showConfigure();
  });
  configure.setAttribute('aria-pressed', 'false');
  controls.append(averagingLabel, configure);
  host.analysisReady = refresh();
  return host;
}
