'use strict';

// Live perf charts: the block at the head of the game data column
// (docs/product/during-game.md). The analysis worker builds the rows' series
// from the finished game's trace (during-game.js); this file draws them as
// three framed charts on one time axis, progress, the moves available, and
// every other line against its whole-game value, with the event tracks
// between the second and the third; lets each legend
// choose its lines; shows the value of the line under the pointer while the
// board shows that moment; keeps the replay there on a click; and chooses
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
      return ['moved on after ' + duringGameSeconds(event.gapMs) + ': ' + jump(event),
        ...(event.nearestSafeSquares === undefined ? []
          : ['nearest proven-safe square ' + countPhrase(event.nearestSafeSquares, 'square', 'squares') + ' away'])];
    case 'left-hard-work':
    case 'left-easy-work':
      return [(event.type === 'left-easy-work' ? 'left easy work' : 'left hard work') + ' after '
        + duringGameSeconds(event.gapMs) + ': ' + countPhrase(event.leftSafe, 'proven-safe square', 'proven-safe squares')
        + ' unopened, ' + (event.leftByCounting === 0 ? 'none' : event.leftByCounting) + ' by counting',
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

//-------DURING THE GAME: THE CARD (floating)-------

const DURING_GAME_CARD_GAP_PX = 14;

// A body-level popover, so it also shows above the compact details popover;
// one serves every block.
let duringGameCardEl = null;

// The window less its scrollbars, which would cover a fixed popover's edge.
function duringGameRoom() {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}

function duringGameCard() {
  if (duringGameCardEl === null) {
    duringGameCardEl = document.createElement('div');
    duringGameCardEl.className = 'during-game-card';
    duringGameCardEl.setAttribute('popover', 'manual');
    document.body.appendChild(duringGameCardEl);
  }
  return duringGameCardEl;
}

// Beside the pointer: right of it, away from the board left of the column,
// unless the window has no room there; above it where there is room, else
// below.
function placeDuringGameCard(card, event) {
  const room = duringGameRoom();
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const right = event.clientX + DURING_GAME_CARD_GAP_PX;
  const left = right + width <= room.width - 4 ? right : event.clientX - DURING_GAME_CARD_GAP_PX - width;
  const above = event.clientY - DURING_GAME_CARD_GAP_PX - height;
  const top = above >= 4 ? above : event.clientY + DURING_GAME_CARD_GAP_PX;
  card.style.left = Math.max(4, Math.min(left, room.width - width - 4)) + 'px';
  card.style.top = Math.max(4, Math.min(top, room.height - height - 4)) + 'px';
}

// Closes the card and returns the board to the replay's own position.
function hideDuringGameHover() {
  if (duringGameCardEl !== null && duringGameCardEl.matches(':popover-open')) duringGameCardEl.hidePopover();
  endReplayPreview();
}

//-------DURING THE GAME: LEGEND PICKS (per game)-------

// The rows each legend has picked (DuringGame.legendPick), by part: the
// two charts and the event tracks. They hold while the same game is shown,
// through every redraw of its block (its result renders again as its
// measurements finish; averaging, scale, and configure redraw it), and
// start over, every row shown, with another game.
const DURING_GAME_TRACKS_ID = 'events';
// The parts top to bottom (creator 2026-10-21: the chart against the whole
// game, the one with 3BV/s, under the event tracks). The moves available
// (2026-10-26) sit right above the tracks, so a pause or a jump lines up
// with what the board offered then.
const DURING_GAME_PARTS = ['progress', 'moves', DURING_GAME_TRACKS_ID, 'relative'];
let duringGamePicks = { endedAt: null, byPart: null };

function duringGamePicksFor(endedAt) {
  if (duringGamePicks.endedAt !== endedAt) {
    duringGamePicks = { endedAt, byPart: Object.fromEntries(DURING_GAME_PARTS.map((id) => [id, new Set()])) };
  }
  return duringGamePicks.byPart;
}

//-------DURING THE GAME: CHARTS (one time axis)-------

// Heights in px: progress labels its fixed 0-100% scale every 20%; the
// moves chart draws small counts (mines near the last move) under large
// ones (safe squares known after an opening), and the relative chart holds
// every pace, board, and report line. `top` keeps the top tick's label
// inside the chart.
const DURING_GAME_LAYOUT = {
  plots: { progress: 90, moves: 120, relative: 120 }, track: 18, top: 6, xLabels: 16, bottom: 4, right: 8, minLeft: 32,
};
// The moves chart's tick ladder: at most this many steps above 0.
const DURING_GAME_COUNT_STEPS = 4;
// What the values in a legend are, where the scale alone does not say: the
// 1x each line is measured against, or the counts' averages over the game.
const DURING_GAME_LEGEND_LEADS = { relative: 'whole game (1\u00d7)', count: 'game average' };
// On the log scale, the relative chart spans at most this many doublings
// each way of the whole-game value; a value past them draws on the edge, and
// the card gives it exactly.
const DURING_GAME_RELATIVE_DOUBLINGS = 3;
const DURING_GAME_RATIO_LABELS = {
  '-3': '\u215b\u00d7', '-2': '\u00bc\u00d7', '-1': '\u00bd\u00d7', 0: '1\u00d7', 1: '2\u00d7', 2: '4\u00d7', 3: '8\u00d7',
};
// The linear scale's top: its lines' farthest value, within these, so it
// never reaches past the log scale's farthest; a value above it draws on
// the edge.
const DURING_GAME_LINEAR_TOP = { min: 2, max: 2 ** DURING_GAME_RELATIVE_DOUBLINGS };
// Hover reaches raw marks this many pixels from the pointer.
const DURING_GAME_HOVER_PX = 6;
// The tick labels' and track names' fonts (style.css), for measuring.
const DURING_GAME_TICK_FONT = 'bold 12px Arial, sans-serif';
const DURING_GAME_NAME_FONT = '12px Arial, sans-serif';

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

// Where a part's plot ends, in px from its top: a chart's plot height under
// the top margin, or one row per event track. Heights never depend on the
// width, so a part has its full height before its first layout and drawing
// it on a resize changes no element's size (inside a ResizeObserver callback
// that would be the browser's "ResizeObserver loop" error).
function duringGamePlotBottom(part) {
  return part.id === DURING_GAME_TRACKS_ID
    ? 1 + part.used.length * DURING_GAME_LAYOUT.track
    : DURING_GAME_LAYOUT.top + part.plotHeight;
}

// The first and last parts carry the seconds under their plots.
function duringGamePartHeight(part, labeled) {
  return duringGamePlotBottom(part) + (labeled ? DURING_GAME_LAYOUT.xLabels : DURING_GAME_LAYOUT.bottom);
}

// Every value a row draws: steps, raw marks, and averages.
function duringGameRowValues(row) {
  return [...(row.steps || []), ...(row.points || []), ...(row.buckets || []), ...(row.line || [])]
    .map((item) => item.value).filter((value) => Number.isFinite(value));
}

// The values a row's line draws (steps, buckets, rolling points), or its raw
// marks where it draws no line. The linear scale fits these: one far raw
// incident would flatten every line under it.
function duringGameLineValues(row) {
  const line = [...(row.steps || []), ...(row.buckets || []), ...(row.line || [])];
  return (line.length > 0 ? line : row.points || []).map((item) => item.value)
    .filter((value) => Number.isFinite(value));
}

// A line on the relative chart needs a whole-game value to compare with.
function duringGameComparable(row) {
  return Number.isFinite(row.summary) && row.summary > 0;
}

const duringGameShareLabel = (value) => Math.round(value * 100) + '%';
const duringGameLinearLabel = (ratio) => Number(ratio.toFixed(1)) + '\u00d7';
const duringGameCountLabel = (count) => String(count);

// The moves chart's ticks: whole numbers from 0, a step of the 1-2-5 ladder
// at least 1, up to the first at or above the highest count (at least 1).
function duringGameCountTicks(highest) {
  const top = Math.max(1, highest);
  const ladder = niceTicks(0, top, DURING_GAME_COUNT_STEPS);
  const step = Math.max(1, ladder[1] - ladder[0]);
  const ticks = [0];
  while (ticks[ticks.length - 1] < top) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// A chart's y scale: `at` maps a value (on the relative chart, a ratio to
// the line's whole-game value) to its share of the plot's height. Progress
// is a fixed 0 to 1. The moves chart counts from 0 to its lines' highest
// count (duringGameCountTicks). On the log scale, the relative chart runs as many
// doublings each way of 1x as its farthest value needs, at least one and at
// most DURING_GAME_RELATIVE_DOUBLINGS, with zero on the floor. On the linear
// scale it runs from 0 to its lines' farthest value within
// DURING_GAME_LINEAR_TOP, rounded up to a tick of the 1-2-5 ladder, with 1x
// always among the ticks. Null when the rows draw no values (rates in raw
// are ticks).
function duringGameScale(chart, rows, relativeScale) {
  if (chart.scale === 'share') {
    const ticks = niceTicks(0, 1, 5);
    return { at: (value) => value, ticks, minors: minorTicks(ticks, 0, 1), label: duringGameShareLabel };
  }
  if (chart.scale === 'count') {
    const counts = rows.flatMap(duringGameRowValues);
    if (counts.length === 0) return null;
    const ticks = duringGameCountTicks(Math.max(...counts));
    const top = ticks[ticks.length - 1];
    return { at: (value) => value / top, ticks, minors: [], label: duringGameCountLabel };
  }
  const comparable = rows.filter(duringGameComparable);
  if (relativeScale === 'linear') {
    const ratios = comparable.flatMap((row) => duringGameLineValues(row).map((value) => value / row.summary));
    if (ratios.length === 0) return null;
    const farthest = Math.min(DURING_GAME_LINEAR_TOP.max, Math.max(DURING_GAME_LINEAR_TOP.min, ...ratios));
    const ticks = niceTicks(0, farthest, 5);
    if (ticks[ticks.length - 1] < farthest) ticks.push(ticks[ticks.length - 1] + ticks[1] - ticks[0]);
    if (!ticks.includes(1)) ticks.splice(1, 0, 1);
    const top = ticks[ticks.length - 1];
    return { at: (ratio) => Math.max(0, Math.min(top, ratio)) / top, ticks, minors: [], reference: 1,
      label: duringGameLinearLabel };
  }
  const ratios = comparable.flatMap((row) => duringGameRowValues(row).map((value) => value / row.summary))
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

// Every y label a chart can draw, on either relative scale, as ratios or in
// any of its lines' values (labelDuringGameTicks). The moves chart's widest
// are those of all its rows shown: fewer shown lines can only lower its top,
// and the tick font's digits are all one width.
function duringGameScaleLabels(chart, rows) {
  if (chart.scale === 'share') return niceTicks(0, 1, 5).map(duringGameShareLabel);
  if (chart.scale === 'count') {
    const counts = rows.flatMap(duringGameRowValues);
    return counts.length === 0 ? [] : duringGameCountTicks(Math.max(...counts)).map(duringGameCountLabel);
  }
  const linear = Array.from({ length: 2 * DURING_GAME_LINEAR_TOP.max + 1 }, (_, k) => k / 2);
  const ticks = [...Object.keys(DURING_GAME_RATIO_LABELS).map((doublings) => 2 ** Number(doublings)), ...linear];
  const values = rows.filter(duringGameComparable)
    .flatMap((row) => ticks.map((tick) => DuringGame.rowById(row.id).format(tick * row.summary)));
  return [...Object.values(DURING_GAME_RATIO_LABELS), ...linear.map(duringGameLinearLabel), ...values];
}

// The plots' shared left edge: room for every y label a chart can draw and
// every track name, so all plots start at the same x whichever lines the
// legends show and whichever scale is chosen.
function duringGameLeftMargin(charts, tracks) {
  let width = DURING_GAME_LAYOUT.minLeft;
  for (const part of charts) {
    for (const label of duringGameScaleLabels(part.chart, part.members.map((member) => member.row))) {
      width = Math.max(width, chartTextWidth(label, DURING_GAME_TICK_FONT) + 8);
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

// Draws the members its legend shows on a scale fitted to them. Sets each
// member's `y`, its value's height in the svg, or null where the member
// draws no line (its legend hides it, or it has nothing to compare with);
// keeps the scale, its y labels, and the `lines` drawn against it (rates in
// raw draw only ticks).
function drawDuringGameChart(chart, axis, labeled, relativeScale) {
  const { svg, plotHeight } = chart;
  const shown = chart.members.filter((member) => !member.hidden);
  const scale = duringGameScale(chart.chart, shown.map((member) => member.row), relativeScale);
  const relative = chart.chart.scale === 'relative';
  const plotTop = DURING_GAME_LAYOUT.top;
  const plotBottom = duringGamePlotBottom(chart);
  duringGameSize(svg, axis.width, duringGamePartHeight(chart, labeled));
  duringGameShape(svg, 'rect', { x: axis.left, y: plotTop, width: axis.right - axis.left, height: plotHeight, class: 'scatter-plot' });
  drawDuringGameTimeAxis(svg, axis, plotTop, plotBottom, labeled);
  const y = scale === null ? null : (value) => plotBottom - scale.at(value) * plotHeight;
  chart.scale = scale;
  chart.tickLabels = [];
  if (scale !== null) {
    for (const tick of scale.ticks) {
      duringGameShape(svg, 'line', { x1: axis.left, y1: y(tick), x2: axis.right, y2: y(tick),
        class: tick === scale.reference ? 'scatter-grid during-game-reference' : 'scatter-grid' });
      chart.tickLabels.push({ tick, node: duringGameShape(svg, 'text',
        { x: axis.left - 4, y: y(tick) + 4, class: 'scatter-tick tick-y' }, scale.label(tick)) });
    }
    for (const minor of scale.minors) {
      duringGameShape(svg, 'line', { x1: axis.left - 4, y1: y(minor), x2: axis.left, y2: y(minor), class: 'scatter-minor' });
    }
  }
  for (const member of chart.members) {
    member.nodes.length = 0;
    member.y = null;
  }
  // Raw marks first, then every line over them.
  for (const member of shown) {
    const { row, spec, nodes } = member;
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
  for (const member of shown) {
    if (member.y === null) continue;
    const d = duringGameSeriesPath(member.row, axis, member.y);
    if (d !== '') member.nodes.push(duringGameShape(svg, 'path', { d, stroke: member.spec.color, class: 'end-line' }));
  }
  chart.lines = shown.filter((member) => member.y !== null && duringGameRowValues(member.row).length > 0);
}

// The relative chart's y labels in one line's values, or its ratios for
// null. Each line is drawn at its value over its whole-game value, so the
// tick at r is exactly r times that value.
function labelDuringGameTicks(chart, member) {
  for (const { tick, node } of chart.tickLabels) {
    node.textContent = member === null ? chart.scale.label(tick) : member.spec.format(tick * member.row.summary);
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
  arrowRightOutline: { filled: false, d: (x, y, p) => 'M' + p(x - 3.5) + ' ' + p(y - 4) + 'l7.5 4l-7.5 4z' },
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
  const plotBottom = duringGamePlotBottom(tracks);
  names.style.width = axis.left + 'px';
  duringGameSize(svg, axis.width, duringGamePartHeight(tracks, labeled));
  duringGameShape(svg, 'rect', { x: axis.left, y: 1, width: axis.right - axis.left, height: plotBottom - 1, class: 'scatter-plot' });
  drawDuringGameTimeAxis(svg, axis, 1, plotBottom, labeled);
  used.forEach((track, i) => {
    const top = 1 + i * height;
    if (i > 0) duringGameShape(svg, 'line', { x1: axis.left, y1: top, x2: axis.right, y2: top, class: 'scatter-grid' });
    for (const member of track.members) {
      member.nodes.length = 0;
      if (member.hidden || member.row.kind === 'unrecorded') continue;
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

//-------DURING THE GAME: DRAWING, LEGENDS, AND HOVER-------

// Focuses the drawn charts' series showing any of the given catalog
// measurements, or none for []; null while no charts are drawn
// (linkMeasurements).
let duringGameSpotlight = null;

// The catalog measurements a row shows (DuringGame.ROWS, `measurements`).
function duringGameMeasurementsOf(spec) {
  return spec.measurements === undefined ? [] : spec.measurements;
}

// A row's name, its definition behind it where the row has one.
function duringGameRowName(spec) {
  if (spec.help !== undefined) return chartHelpButton(spec.help, spec.name);
  const name = document.createElement('span');
  name.className = 'during-game-row-name';
  name.textContent = spec.name;
  return name;
}

// Draws `view` into `charts` and wires the legends, the hover, and the
// replay link. `picks` holds each legend's picked rows (duringGamePicksFor).
// Returns the layout, which redraws at the charts' width.
function renderDuringGameCharts(charts, view, { raw, relativeScale, picks }) {
  hideDuringGameHover();
  duringGameSpotlight = null;
  charts.replaceChildren();
  const empty = (text) => {
    charts.classList.add('during-game-empty');
    charts.textContent = text;
    return () => {};
  };
  if (!view.recorded) return empty('This game\u2019s trace holds no recorded actions.');
  if (view.timeMs === 0) return empty('This game ended at its first click: there is no time to plot.');
  // The hover shows replay steps by action index.
  const frames = pathDecisionEvents(trace.events);
  if (frames.length !== view.actions.length) {
    throw new Error('during the game: the page holds ' + frames.length + ' replay frames for '
      + view.actions.length + ' analyzed actions');
  }
  if (view.rows.length === 0) return empty('No rows chosen: choose them with configure.');

  // The series in focus: the line or legend entry under the pointer, or
  // those showing a measurement hovered in game summary perf. Everything
  // else in their charts fades.
  let focused = [];
  // The relative chart's y labels give the values of its line in focus, else
  // of the one line it draws, else its ratios (creator 2026-10-26). Only the
  // labels change, so nothing moves under the pointer.
  const labelTicks = (part) => {
    const inFocus = focused.filter((member) => part.lines.includes(member));
    labelDuringGameTicks(part, inFocus.length === 1 ? inFocus[0] : part.lines.length === 1 ? part.lines[0] : null);
  };
  const focus = (next) => {
    if (next.length === focused.length && next.every((member, i) => member === focused[i])) return;
    for (const member of focused) {
      member.part.svg.classList.remove('series-focus');
      for (const node of member.nodes) node.classList.remove('hot');
    }
    focused = next;
    for (const member of focused) {
      member.part.svg.classList.add('series-focus');
      for (const node of member.nodes) node.classList.add('hot');
    }
    for (const part of drawnCharts) if (part.chart.scale === 'relative') labelTicks(part);
  };
  // The pointer's series also links what it measures across the page.
  let pointed = null;
  const pointFocus = (member) => {
    if (member === pointed) return;
    pointed = member;
    focus(member === null || member.hidden ? [] : [member]);
    linkMeasurements(member === null ? [] : duringGameMeasurementsOf(member.spec), 'duringGame');
  };
  // A legend entry spotlights its series while the pointer is on it, and a
  // click shows or hides the series (DuringGame.legendPick).
  const applyPicks = (part) => {
    const rowIds = part.members.map((member) => member.row.id);
    for (const member of part.members) {
      member.hidden = DuringGame.legendHides(picks[part.id], member.row.id, rowIds);
      member.entry.classList.toggle('during-game-legend-off', member.hidden);
    }
  };
  const legendEntry = (part, member, mark, valueText) => {
    const entry = document.createElement('span');
    entry.className = 'end-legend-item during-game-legend-item series-hotspot';
    entry.dataset.row = member.row.id;
    const value = document.createElement('span');
    value.className = 'during-game-legend-value';
    value.textContent = valueText;
    entry.append(mark, duringGameRowName(member.spec), value);
    entry.addEventListener('mouseenter', () => pointFocus(member));
    entry.addEventListener('mouseleave', () => pointFocus(null));
    entry.addEventListener('click', () => {
      picks[part.id] = DuringGame.legendPick(picks[part.id], member.row.id, part.members.map((item) => item.row.id));
      pointFocus(null);
      applyPicks(part);
      if (axis !== null) drawPart(part);
      pointFocus(member);
    });
    member.entry = entry;
    return entry;
  };

  const members = view.rows.map((row) => ({ row, spec: DuringGame.rowById(row.id), nodes: [], y: null,
    hidden: false, entry: null, part: null }));
  const drawnCharts = [];
  for (const chart of DuringGame.CHARTS) {
    const chartMembers = members.filter((member) => member.spec.chart === chart.id);
    if (chartMembers.length === 0) continue;
    const element = document.createElement('div');
    element.className = 'during-game-chart';
    element.dataset.chart = chart.id;
    const legend = document.createElement('div');
    legend.className = 'during-game-legend';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'during-game-chart-svg' + (raw ? ' during-game-raw' : ''));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', chart.name + ' during this game');
    const part = { id: chart.id, chart, members: chartMembers, plotHeight: DURING_GAME_LAYOUT.plots[chart.id],
      element, svg, scale: null, tickLabels: [], lines: [] };
    for (const member of chartMembers) member.part = part;
    if (DURING_GAME_LEGEND_LEADS[chart.scale] !== undefined) {
      const lead = document.createElement('span');
      lead.className = 'during-game-legend-lead';
      lead.textContent = DURING_GAME_LEGEND_LEADS[chart.scale];
      legend.appendChild(lead);
    }
    for (const member of chartMembers) {
      const swatch = document.createElement('span');
      swatch.className = 'end-swatch';
      swatch.style.background = member.spec.color;
      legend.appendChild(legendEntry(part, member, swatch,
        member.row.summary === undefined ? 'not measured' : member.spec.format(member.row.summary)));
    }
    applyPicks(part);
    // Each legend under what it names, as the tracks' is (creator 2026-10-26).
    element.append(svg, legend);
    drawnCharts.push(part);
  }
  const trackMembers = members.filter((member) => member.spec.track !== undefined);
  let tracks = null;
  if (trackMembers.length > 0) {
    const element = document.createElement('div');
    element.className = 'during-game-chart during-game-tracks';
    element.dataset.chart = DURING_GAME_TRACKS_ID;
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
    legend.className = 'during-game-legend';
    tracks = { id: DURING_GAME_TRACKS_ID, element, names, svg, used, members: trackMembers };
    for (const member of trackMembers) member.part = tracks;
    for (const track of used) {
      for (const member of track.members) {
        legend.appendChild(legendEntry(tracks, member, duringGameLegendMark(member.spec),
          member.row.kind === 'unrecorded' ? 'not recorded' : member.spec.format(member.row.summary)));
      }
    }
    applyPicks(tracks);
    element.append(names, svg, legend);
  }
  const built = [...drawnCharts, ...(tracks === null ? [] : [tracks])];
  const parts = DURING_GAME_PARTS.flatMap((id) => built.filter((part) => part.id === id));
  // The first and last parts carry the seconds.
  const labeledPart = (part) => part === parts[0] || part === parts[parts.length - 1];
  for (const part of parts) {
    part.svg.setAttribute('height', duringGamePartHeight(part, labeledPart(part)));
    charts.appendChild(part.element);
  }
  const line = document.createElement('div');
  line.className = 'during-game-line';
  line.hidden = true;
  charts.appendChild(line);
  duringGameSpotlight = (metricIds) => focus(members.filter((member) => !member.hidden
    && duringGameMeasurementsOf(member.spec).some((id) => metricIds.includes(id))));

  const left = duringGameLeftMargin(drawnCharts, tracks);
  let axis = null;
  function drawPart(part) {
    if (part === tracks) drawDuringGameTracks(tracks, axis, labeledPart(part));
    else {
      drawDuringGameChart(part, axis, labeledPart(part), relativeScale);
      if (part.chart.scale === 'relative') labelTicks(part);
    }
  }
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
    const kept = focused;
    focus([]);
    parts.forEach(drawPart);
    focus(kept);
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
      if (!member.hidden && member.row.kind === 'unrecorded') cardRow(member.spec.name + ': not recorded for this game');
    }
    if (events.length === 0) cardRow('none at this moment');
    for (const event of events) for (const text of duringGameEventLines(event)) cardRow(text);
  }

  function hide() {
    line.hidden = true;
    pointFocus(null);
    hideDuringGameHover();
  }
  // The board shows the moment under the pointer anywhere along the time
  // axis, through the replay's own frames.
  charts.addEventListener('pointermove', (event) => {
    // Over a legend entry its series stays in focus, also where the entry
    // sits left of the plots, outside the time axis.
    const onLegendEntry = event.target.closest('.during-game-legend-item') !== null;
    const moment = momentAt(event);
    if (moment === null) {
      line.hidden = true;
      if (!onLegendEntry) pointFocus(null);
      hideDuringGameHover();
      return;
    }
    line.style.left = axis.x(moment.atMs) + 'px';
    line.hidden = false;
    previewReplayStep(stepAt(moment));
    const part = partAt(event.clientY);
    // Over a name, its definition shows instead of the card.
    if (part === null || event.target.closest('.chart-help-wrap')) {
      if (!onLegendEntry) pointFocus(null);
      if (card.matches(':popover-open')) card.hidePopover();
      return;
    }
    const events = part.track ? part.track.members.filter((member) => !member.hidden)
      .flatMap((member) => duringGameEventsAt(member.row, moment.atMs, moment.toleranceMs))
      .sort((a, b) => a.atMs - b.atMs) : [];
    const nearest = part.chart ? lineAt(part.chart, moment, event.clientY) : null;
    pointFocus(nearest === null ? null : nearest.member);
    fillCard(moment.atMs, part, nearest, events);
    if (!card.matches(':popover-open')) card.showPopover();
    placeDuringGameCard(card, event);
  });
  charts.addEventListener('pointerleave', hide);
  // A click on a plot or track keeps its moment as the replay's position. The
  // compact details popover covers the board, so it closes to show it.
  charts.addEventListener('click', (event) => {
    const moment = momentAt(event);
    if (moment === null || partAt(event.clientY) === null) return;
    setReplayStep(stepAt(moment));
    if (gameSidebar.matches(':popover-open')) {
      gameSidebar.hidePopover();
      hide();
    }
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

  const picks = duringGamePicksFor(record.endedAt);
  // The view drawn last, with the averaging it was built for. The scale only
  // changes the drawing, so it redraws this view without the worker.
  let drawn = null;
  function draw() {
    const charts = document.createElement('div');
    charts.className = 'during-game-charts';
    body.replaceChildren(charts);
    layout = renderDuringGameCharts(charts, drawn.view, { raw: drawn.averagingId === 'raw',
      relativeScale: settings.duringGameRelativeScale, picks });
    layout();
  }

  function refresh() {
    const current = ++generation;
    const rowIds = DuringGame.ROWS.filter((row) => settings.duringGameRows[row.id]).map((row) => row.id);
    const averagingId = settings.duringGameAveraging;
    const job = analysisTask('reports', 'during-game', { gameId: record.endedAt, timeMs: record.timeMs,
      outcome: record.outcome, rows: rowIds, average: averagingId }).then((view) => {
      if (current !== generation || !isCurrent() || configuring) return;
      drawn = { view, averagingId };
      draw();
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
        name.appendChild(duringGameRowName(row));
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
  const logScale = document.createElement('input');
  logScale.type = 'checkbox';
  logScale.checked = settings.duringGameRelativeScale === 'log';
  logScale.addEventListener('change', () => {
    updateSettings({ duringGameRelativeScale: logScale.checked ? 'log' : 'linear' });
    if (!configuring && drawn !== null) draw();
  });
  const logScaleLabel = document.createElement('label');
  logScaleLabel.append(logScale, ' log scale');
  const configure = button('configure', () => {
    if (configuring) showRows();
    else showConfigure();
  });
  configure.setAttribute('aria-pressed', 'false');
  controls.append(averagingLabel, logScaleLabel, configure);
  host.analysisReady = refresh();
  return host;
}
