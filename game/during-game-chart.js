'use strict';

// During the game: the result section's view (docs/product/during-game.md).
// The analysis worker builds the rows' series from the finished game's trace
// (during-game.js); this file draws them on one time axis, shows the hover
// card with the board at that moment, opens the replay there, and chooses
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

//-------DURING THE GAME: BOARD AT A MOMENT (hover card)-------

const DURING_GAME_NUMBER_COLORS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];

// The board as the replay shows it at a step: the saved position before the
// step's action, or the finished board after the last one; the action's
// square outlined and an event's squares marked.
function drawDuringGameBoard(canvas, width, height, frames, step, marked, nextCell) {
  const size = Math.max(4, Math.min(16, Math.floor(Math.min(300 / width, 180 / height))));
  canvas.width = width * size;
  canvas.height = height * size;
  const ctx = canvas.getContext('2d');
  const revealedAdjacent = new Map();
  const flagged = new Set();
  if (step < frames.length) {
    const position = frames[step].evaluation.position;
    for (const [cell, adjacent] of position.revealed) revealedAdjacent.set(cell, adjacent);
    for (const cell of position.flagged) flagged.add(cell);
  } else {
    cells.forEach((cell, index) => {
      if (cell.revealed) revealedAdjacent.set(index, cell.adjacent);
      if (cell.flagged) flagged.add(index);
    });
  }
  const markedSet = new Set(marked);
  for (let cell = 0; cell < width * height; cell++) {
    const x = (cell % width) * size;
    const y = Math.floor(cell / width) * size;
    const adjacent = revealedAdjacent.get(cell);
    ctx.fillStyle = adjacent !== undefined ? '#ffffff' : markedSet.has(cell) ? REPLAY_ENCODINGS.safe.color : '#a0a0a0';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#7b7b7b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    if (flagged.has(cell)) {
      ctx.fillStyle = FLAG_COLOR;
      ctx.fillRect(x + size * 0.25, y + size * 0.25, size * 0.5, size * 0.5);
    } else if (adjacent > 0 && size >= 9) {
      ctx.fillStyle = DURING_GAME_NUMBER_COLORS[adjacent];
      ctx.font = 'bold ' + (size - 2) + 'px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(adjacent), x + size / 2, y + size / 2 + 1);
    }
  }
  if (nextCell !== null) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect((nextCell % width) * size + 1, Math.floor(nextCell / width) * size + 1, size - 2, size - 2);
  }
}

let duringGameCardEl = null;
function duringGameCard() {
  if (duringGameCardEl === null) {
    duringGameCardEl = document.createElement('div');
    duringGameCardEl.className = 'during-game-card';
    duringGameCardEl.hidden = true;
    document.body.appendChild(duringGameCardEl);
  }
  return duringGameCardEl;
}

//-------DURING THE GAME: ROWS (one time axis, hover, replay link)-------

const DURING_GAME_ROW_HEIGHT = 40;
const DURING_GAME_LANE_HEIGHT = 14;
const DURING_GAME_AXIS_HEIGHT = 18;
// Inner margin so marks at the game's first and last moment stay whole.
const DURING_GAME_PLOT_PAD = 4;
// Hover reaches marks this many pixels from the pointer.
const DURING_GAME_HOVER_PX = 6;

function duringGameSvg(width, height) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  return svg;
}

function duringGameShape(svg, name, attributes) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  svg.appendChild(node);
  return node;
}

// The smallest 1, 2, or 5 times a power of ten at or above a positive value.
function duringGameRoundUp(value) {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((step) => step >= value * (1 - 1e-12));
}

// A row's y scale: linear from 0 up to a round top, or log for action gaps
// (which run from tens of milliseconds to many seconds). Null when the row
// draws no values (rate ticks alone), so it has no scale to label.
function duringGameScale(row, height) {
  const values = [
    ...(row.steps || []).map((s) => s.value),
    ...(row.points || []).map((p) => p.value),
    ...(row.buckets || []).map((b) => b.value),
    ...(row.line || []).map((p) => p.value),
  ].filter((value) => Number.isFinite(value));
  const top = 3;
  const bottom = height - 3;
  if (row.kind === 'progress') return { y: (v) => bottom - v * (bottom - top), max: 1 };
  if (values.length === 0) return null;
  const highest = Math.max(...values);
  if (row.logScale) {
    // The scale's floor is at least 10; anything below it draws at the bottom.
    const positive = values.filter((v) => v > 0);
    const min = positive.length > 0 ? Math.max(10, Math.min(...positive)) : 10;
    const max = duringGameRoundUp(Math.max(min * 10, highest));
    const span = Math.log(max) - Math.log(min);
    return { y: (v) => bottom - (Math.log(Math.max(v, min)) - Math.log(min)) / span * (bottom - top), max };
  }
  // All zeros: any range draws them on the baseline.
  const max = highest > 0 ? duringGameRoundUp(highest) : 1;
  return { y: (v) => bottom - v / max * (bottom - top), max };
}

function drawDuringGameRow(row, spec, x, plotWidth) {
  const lane = row.kind === 'events' || row.kind === 'unrecorded';
  const height = lane ? DURING_GAME_LANE_HEIGHT : DURING_GAME_ROW_HEIGHT;
  const svg = duringGameSvg(plotWidth, height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', spec.name + ' during the game');
  if (row.kind === 'unrecorded') {
    const note = duringGameShape(svg, 'text', { x: 2, y: height - 3, class: 'during-game-scale' });
    note.textContent = 'not recorded for this game';
    return svg;
  }
  duringGameShape(svg, 'line', { x1: 0, x2: plotWidth, y1: height - 0.5, y2: height - 0.5, class: 'during-game-baseline' });
  if (lane) {
    for (const event of row.events) {
      if (event.endMs !== undefined) {
        duringGameShape(svg, 'rect', { x: x(event.atMs), y: 3, width: Math.max(1, x(event.endMs) - x(event.atMs)),
          height: height - 6, class: 'during-game-span' });
      } else {
        duringGameShape(svg, 'rect', { x: x(event.atMs) - 1, y: 1, width: 2, height: height - 2,
          class: event.died ? 'during-game-mark during-game-mark-death' : 'during-game-mark' });
      }
    }
    return svg;
  }
  const scale = duringGameScale(row, height);
  if (scale !== null) {
    const label = duringGameShape(svg, 'text', { x: 2, y: 10, class: 'during-game-scale' });
    // The top of the scale is a round number; its zeros after the point say nothing.
    label.textContent = row.kind === 'progress' ? '100%'
      : spec.format(scale.max).replace(/\.(\d*?)0+(?!\d)/, (match, kept) => (kept ? '.' + kept : ''));
  }
  if (row.steps) {
    let d = '';
    let open = false;
    row.steps.forEach((step, i) => {
      const end = i + 1 < row.steps.length ? row.steps[i + 1].atMs : null;
      if (step.value === null) { open = false; return; }
      const y = scale.y(step.value);
      d += (open ? 'L' : 'M') + x(step.atMs) + ' ' + y + 'H' + (end === null ? x(Infinity) : x(end));
      open = true;
    });
    duringGameShape(svg, 'path', { d, class: 'during-game-step' });
    return svg;
  }
  if (row.ticks) {
    for (const tick of row.ticks) {
      const tickHeight = Math.min(height - 4, 4 + 3 * tick.weight);
      duringGameShape(svg, 'rect', { x: x(tick.atMs) - 0.5, y: height - tickHeight, width: 1, height: tickHeight,
        class: 'during-game-tick' });
    }
  }
  for (const point of row.points || []) {
    duringGameShape(svg, 'circle', { cx: x(point.atMs), cy: scale.y(point.value), r: 1.6, class: 'during-game-dot' });
  }
  for (const bucket of row.buckets || []) {
    if (bucket.value === undefined) continue;
    const y = scale.y(bucket.value);
    duringGameShape(svg, 'line', { x1: x(bucket.fromMs) + 1, x2: x(bucket.toMs) - 1, y1: y, y2: y, class: 'during-game-average' });
  }
  if (row.line) {
    let d = '';
    let open = false;
    for (const point of row.line) {
      if (point.value === undefined) { open = false; continue; }
      d += (open ? 'L' : 'M') + x(point.atMs) + ' ' + scale.y(point.value);
      open = true;
    }
    duringGameShape(svg, 'path', { d, class: 'during-game-average during-game-rolling' });
  }
  return svg;
}

function drawDuringGameAxis(timeMs, x, plotWidth) {
  const svg = duringGameSvg(plotWidth, DURING_GAME_AXIS_HEIGHT);
  svg.setAttribute('aria-hidden', 'true');
  const seconds = timeMs / 1000;
  for (const tick of niceTicks(0, seconds, Math.max(2, Math.floor(plotWidth / 60)))) {
    const at = x(tick * 1000);
    duringGameShape(svg, 'line', { x1: at, x2: at, y1: DURING_GAME_AXIS_HEIGHT - 4, y2: DURING_GAME_AXIS_HEIGHT, class: 'during-game-axis-tick' });
    const text = duringGameShape(svg, 'text', { x: at, y: DURING_GAME_AXIS_HEIGHT - 6, class: 'during-game-axis-label',
      'text-anchor': at < 16 ? 'start' : at > plotWidth - 16 ? 'end' : 'middle' });
    text.textContent = Number(tick.toFixed(3)) + (tick === 0 ? ' s' : '');
  }
  return svg;
}

// Draws the rows for `view` into `grid` at the plot column's current width
// and wires the hover line, the hover card, and the replay link.
function renderDuringGameRows(grid, view) {
  grid.replaceChildren();
  if (!view.recorded) {
    grid.classList.add('during-game-empty');
    grid.textContent = 'This game\u2019s trace holds no recorded actions.';
    return () => {};
  }
  const frames = pathDecisionEvents(trace.events);
  if (frames.length !== view.actions.length) {
    throw new Error('during the game: the page holds ' + frames.length + ' replay frames for '
      + view.actions.length + ' analyzed actions');
  }
  if (view.rows.length === 0) {
    grid.textContent = 'No rows chosen: choose them with configure.';
    return () => {};
  }
  const specs = view.rows.map((row) => DuringGame.rowById(row.id));
  const corner = document.createElement('span');
  const axisCell = document.createElement('span');
  axisCell.className = 'during-game-plot';
  const valueHead = document.createElement('span');
  valueHead.className = 'during-game-value-head';
  valueHead.textContent = 'game';
  grid.append(corner, axisCell, valueHead);
  const plotCells = [];
  const valueCells = [];
  let group = null;
  view.rows.forEach((row, i) => {
    const spec = specs[i];
    const name = document.createElement('span');
    name.className = 'during-game-name';
    if (spec.group !== group && group !== null) name.classList.add('during-game-group-start');
    name.appendChild(chartHelpButton(spec.help, spec.name));
    const plot = document.createElement('span');
    plot.className = 'during-game-plot';
    const value = document.createElement('span');
    value.className = 'during-game-value';
    value.textContent = row.summary === undefined ? '' : spec.format(row.summary);
    if (name.classList.contains('during-game-group-start')) {
      plot.classList.add('during-game-group-start');
      value.classList.add('during-game-group-start');
    }
    group = spec.group;
    plotCells.push(plot);
    valueCells.push(value);
    grid.append(name, plot, value);
  });
  const line = document.createElement('div');
  line.className = 'during-game-line';
  line.hidden = true;
  grid.appendChild(line);

  let plotWidth = 0;
  let x = null;
  function layout() {
    const width = Math.floor(axisCell.getBoundingClientRect().width);
    if (width <= 2 * DURING_GAME_PLOT_PAD || width === plotWidth) return;
    plotWidth = width;
    const inner = plotWidth - 2 * DURING_GAME_PLOT_PAD;
    x = (atMs) => DURING_GAME_PLOT_PAD + Math.min(1, Math.max(0, atMs / view.timeMs)) * inner;
    axisCell.replaceChildren(drawDuringGameAxis(view.timeMs, x, plotWidth));
    view.rows.forEach((row, i) => plotCells[i].replaceChildren(drawDuringGameRow(row, specs[i], x, plotWidth)));
  }

  // The replay step showing the board at a moment: the first action after it.
  const stepAt = (atMs) => {
    const next = view.actions.findIndex((action) => action.atMs > atMs);
    return next === -1 ? view.actions.length : next;
  };
  const card = duringGameCard();
  const momentAt = (event) => {
    const rect = axisCell.getBoundingClientRect();
    const inner = rect.width - 2 * DURING_GAME_PLOT_PAD;
    if (inner <= 0 || event.clientX < rect.left || event.clientX > rect.right) return null;
    const share = Math.min(1, Math.max(0, (event.clientX - rect.left - DURING_GAME_PLOT_PAD) / inner));
    return { atMs: share * view.timeMs, toleranceMs: DURING_GAME_HOVER_PX / inner * view.timeMs, left: rect.left };
  };
  function restore() {
    line.hidden = true;
    card.hidden = true;
    valueHead.textContent = 'game';
    view.rows.forEach((row, i) => {
      valueCells[i].textContent = row.summary === undefined ? '' : specs[i].format(row.summary);
    });
  }
  grid.addEventListener('pointermove', (event) => {
    const moment = momentAt(event);
    if (moment === null || x === null) { restore(); return; }
    const gridRect = grid.getBoundingClientRect();
    line.style.left = (moment.left - gridRect.left + x(moment.atMs)) + 'px';
    line.hidden = false;
    valueHead.textContent = 'at ' + duringGameSeconds(moment.atMs);
    const events = [];
    view.rows.forEach((row, i) => {
      const value = DuringGame.valueAt(row, moment.atMs, moment.toleranceMs);
      valueCells[i].textContent = value === undefined ? '' : specs[i].format(value);
      if (row.events) {
        for (const item of row.events) {
          const inside = item.endMs !== undefined
            ? moment.atMs >= item.atMs && moment.atMs <= item.endMs
            : Math.abs(item.atMs - moment.atMs) <= moment.toleranceMs;
          if (inside) events.push(item);
        }
      }
    });
    const step = stepAt(moment.atMs);
    const next = step < view.actions.length ? view.actions[step] : null;
    card.replaceChildren();
    const head = document.createElement('div');
    head.className = 'during-game-card-head';
    const time = document.createElement('span');
    time.className = 'during-game-card-time';
    time.textContent = duringGameSeconds(moment.atMs);
    head.append(time, next === null ? ' the finished board'
      : ' next: ' + DURING_GAME_ACTION_PHRASES[next.kind] + (next.cell === null ? '' : ' at ' + evaluationCellName(next.cell, view.width)));
    card.appendChild(head);
    const marked = [];
    for (const item of events) {
      for (const text of duringGameEventLines(item)) {
        const factLine = document.createElement('div');
        factLine.className = 'during-game-card-fact';
        factLine.textContent = text;
        card.appendChild(factLine);
      }
      if (item.safeCells) marked.push(...item.safeCells);
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'during-game-card-board';
    drawDuringGameBoard(canvas, view.width, view.height, frames, step, marked, next === null ? null : next.cell);
    card.appendChild(canvas);
    card.hidden = false;
    const cardRect = card.getBoundingClientRect();
    // Toward the plot's far half, so the card leaves the value column, which
    // answers the same moment, in view.
    const plotRect = axisCell.getBoundingClientRect();
    const left = event.clientX > plotRect.left + plotRect.width / 2
      ? event.clientX - 16 - cardRect.width : event.clientX + 16;
    const top = Math.min(window.innerHeight - cardRect.height - 4, Math.max(4, event.clientY - cardRect.height / 2));
    card.style.left = Math.min(window.innerWidth - cardRect.width - 4, Math.max(4, left)) + 'px';
    card.style.top = top + 'px';
  });
  grid.addEventListener('pointerleave', restore);
  grid.addEventListener('click', (event) => {
    const moment = momentAt(event);
    if (moment === null || event.target.closest('button')) return;
    restore();
    // The review panel follows its remembered state on every replay render.
    rememberPanel('replay', true);
    setReplayStep(stepAt(moment.atMs));
    gameFrame.scrollIntoView({ block: 'nearest' });
  });
  return layout;
}

//-------DURING THE GAME: SECTION (head controls, configure)-------

function buildDuringGameSection(record, isCurrent) {
  const host = document.createElement('div');
  host.className = 'during-game';
  host.setAttribute('aria-label', 'during the game');
  let configuring = false;
  let generation = 0;
  let layout = () => {};
  new ResizeObserver(() => {
    if (host.isConnected) layout();
  }).observe(host);
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
    const job = analysisTask('reports', 'during-game', { gameId: record.endedAt, timeMs: record.timeMs,
      outcome: record.outcome, rows: rowIds, average: settings.duringGameAverage }).then((view) => {
      if (current !== generation || !isCurrent() || configuring) return;
      const grid = document.createElement('div');
      grid.className = 'during-game-grid';
      host.replaceChildren(grid);
      layout = renderDuringGameRows(grid, view);
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
    const view = document.createElement('div');
    view.className = 'during-game-config';
    const back = () => button('back to during the game', () => {
      showRows().then(() => configure.focus());
    });
    view.appendChild(back());
    for (const [groupId, groupName] of DuringGame.GROUPS) {
      const title = document.createElement('h4');
      title.textContent = groupName;
      const table = document.createElement('table');
      const body = document.createElement('tbody');
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
        body.appendChild(tr);
      }
      table.appendChild(body);
      view.append(title, table);
    }
    view.appendChild(back());
    view.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      showRows().then(() => configure.focus());
    });
    host.replaceChildren(view);
    view.querySelector('button').focus();
  }

  const average = document.createElement('select');
  average.className = 'avg-mode-select';
  average.setAttribute('aria-label', 'during the game averaging');
  for (const [id, label] of DuringGame.AVERAGES) average.add(new Option(label, id));
  average.value = settings.duringGameAverage;
  average.addEventListener('change', () => {
    updateSettings({ duringGameAverage: average.value });
    if (!configuring) refresh();
  });
  const configure = button('configure', () => {
    if (configuring) showRows();
    else showConfigure();
  });
  configure.setAttribute('aria-pressed', 'false');
  host.headControls = [average, configure, chartHelpButton([
    'Each row follows one measurement through this game, on one time axis from the first click to the end.',
    'Point at a moment to see every row\u2019s value then and the board as it was; click to open the replay there.',
  ])];
  host.analysisReady = refresh();
  return host;
}
