'use strict';

// Finishing a game: the saved record (reportResult), the after-game report,
// the result view's section model and rendering, and the High scores view.

//-------STATS (3BV, as measured on minesweeper.online)-------

function compute3BV() {
  return Pregen.board3BV(config.width, config.height, cells.map((cell) => cell.mine));
}

function computeBoardShape() {
  return BoardShape.of(config.width, config.height, cells.map((c) => c.mine));
}

//-------GAME RECORD (the finished game's saved record)-------

function reportResult(outcome, endedAt = Date.now()) {
  const shape = computeBoardShape();
  const mineAt = cells.map((cell) => cell.mine);
  const record = {
    endedAt: endedAt,
    ...observedTimeZone(endedAt),
    outcome: outcome,
    timeMs: Math.round(finalTimeMs),
    // A drill's difficulty is what was actually presented: the remnant's
    // remaining 3BV, not the whole board's. Full-board ZiNi is likewise
    // meaningless for a partial solve, so drill records omit it.
    bv3: endgameDrillActive() && drillCurrent !== null
      ? drillCurrent.remaining3BV : compute3BV(),
    clicks: clickCount,
    chordClicks: chordClicks,
    wastedClicks: wastedClicks,
    misclicks: misclicks,
    flagsPlaced: flagsPlaced,
    flagsRemoved: flagsRemoved,
    ...(outcome === 'win' ? { unusedCorrectFlags: unusedCorrectFlags } : {}),
    mousePathPx: Math.round(mousePathPx),
    states: activeStateNames(),
    justice: justiceEvents,
    justiceEnabled: justiceEnabledForGame,
    seed: gameSeed,
    ...(firstRevealIndex !== null ? { firstRevealIndex } : {}),
    rngVersion: RNG_VERSION,
    boardVersion: BoardGenerators.byId(gameGenerator.id).version,
    justiceVersion: JUSTICE_VERSION,
    maxAdjacent: shape.maxAdjacent,
    hasSeven: shape.hasSeven,
    zeroCount: shape.zeroCount,
    islandCount: shape.islandCount,
    largestIsland: shape.largestIsland,
    playMode: settings.playMode,
    actionEvaluations: actionEvaluations,
  };
  // The non-default board generator this board was placed with; absent =
  // the default uniform generator (matching the key suffix convention).
  if (gameGenerator.id !== BoardGenerators.DEFAULT_ID) {
    record.generator = { id: gameGenerator.id, params: { ...gameGenerator.params } };
  }
  // Music state: true if any sample during this game heard audio playing,
  // false if every sample heard silence; no field at all when the base
  // system's endpoint never answered (not measured).
  if (musicObservations.length > 0) {
    record.musicPlaying = musicObservations.some((heard) => heard);
  }
  if (boardFlagsBlocked) record.flagsBlocked = true;
  if (!oddsUnmeasured && guessLedgerAppliesToMode()) {
    record.guesses = guessEvents.length;
    record.guessIdealRisk = guessEvents.filter((e) => e.idealRisk).length;
    record.guessNonideal = guessEvents.filter((e) => !e.idealRisk).length;
    record.guessPerfect = guessEvents.filter((e) => e.perfectPlay).length;
    record.lifeLost = guessEvents.reduce((sum, e) => sum + e.lifeLost, 0);
    record.lifeNeedless = guessEvents.reduce((sum, e) => sum + e.lifeNeedless, 0);
    record.oddsVersion = Odds.VERSION;
  }
  if (Trial.isPlayMode(settings.playMode) && trialPresentation !== null) {
    record.identityIndex = trialPresentation.identityIndex;
    record.transform = trialPresentation.transform;
    record.trialStartedAt = trialSession.startedAt;
    record.givenOpening = settings.trialGiveOpening;
  }
  if (pregenActive() && pregenBatch !== null && pregenCurrent !== null) {
    pregenBatch.results.push({ run: pregenCurrent.rank, record });
  }
  const modeRecords = appendGameRecord(record);
  // Play statistics must never interrupt a game's end (creator decision
  // 2026-10-11): a failure is logged, never raised.
  try {
    if (window.FusekiStats) window.FusekiStats.game(playStatisticsFields(record));
  } catch (error) {
    console.error(error);
  }
  renderPregenCharts();
  if (Trial.isPlayMode(settings.playMode) && trialIsActive() && trialPresentation !== null) {
    Trial.recordResult(trialSession, {
      identityIndex: trialPresentation.identityIndex,
      transform: trialPresentation.transform,
      givenOpening: record.givenOpening,
      endedAt: record.endedAt,
      outcome: record.outcome,
      timeMs: record.timeMs,
      bv3: record.bv3,
      clicks: record.clicks,
      actionEvaluations: record.actionEvaluations,
    });
    if (trialSession.nextIndex >= Trial.gameCount(trialSession)) endTrial('completed');
    persistUserdata('trial', trialSession);
  }
  // Capture and persist primary facts before returning to input. Everything
  // below the worker boundary uses this game's snapshot, not mutable globals.
  const resultRevision = resultViewRevision;
  const finishedTrace = trace;
  const finishedSeries = metricsSeries;
  const key = modeKey();
  const boardState = { status: 'running' };
  if (!endgameDrillActive()) boardMetricJobs.set(record, boardState);
  renderMotionStats();
  replayStep = replayDecisionCount();
  replayEnabled = false;
  updateSettings({ resultView: 'game', replayPosition: { endedAt: record.endedAt, step: replayStep } });
  renderPathView();
  duringGameSourceId = record.endedAt;
  analysisTask('reports', 'finished-game', {
    width: config.width, height: config.height, mines: mineAt, drill: endgameDrillActive(),
    needZini: true, needBoardMetrics: true, needCadence: true, needMoveHabits: true, needFastclickGap: true,
    gameId: record.endedAt, timeMs: record.timeMs, outcome: record.outcome, justiceEnabled: record.justiceEnabled,
    liveTraceId: liveMetricsGeneration,
    trace: { t: finishedTrace.t, x: finishedTrace.x, y: finishedTrace.y,
      events: finishedTrace.events, wallMs: record.endedAt - finishedTrace.startedAt,
      initialPageState: finishedTrace.initialPageState },
  }).then((result) => {
    Object.assign(record, result.measurements);
    boardState.status = 'done';
    if (history[key]?.includes(record)) persistGameRecord(key, record);
    if (trace !== finishedTrace || resultViewRevision !== resultRevision
        || !['won', 'lost'].includes(gameState)) return;
    appendMetricSeries(finishedSeries, result.metrics);
    finalMotion = { metrics: result.metrics, series: finishedSeries, spatial: result.spatial };
    renderMotionStats();
    renderResult(record, modeRecords);
  }).catch((error) => {
    boardState.status = 'error'; boardState.error = error.message;
    analysisFailure(error);
  });
  // Saved in this same task, so the trace is stored before any analysis
  // reply; after the post, so the worker computes while it is stored.
  saveTrace(record);
}

// The finished game as fuseki-stats.js game fields, sent once from
// reportResult (docs/product/hosting.md, "Play statistics"). Only facts the
// record and the board already hold; a measurement is present exactly where
// the result screen shows it. `m` names the unit within which times compare:
// the top score key's level, play mode, and generator id, in the protocol's
// token alphabet, which lacks the key's own @ + ( = , characters. The
// generator's parameters would overflow the 64-character token, so they
// follow as g_<key> fields in schema order.
function playStatisticsFields(record) {
  const difficulty = difficultyNameOf(config);
  const level = difficulty === undefined
    ? 'custom-' + config.width + 'x' + config.height + '-' + config.mines : difficulty;
  const generator = generatorAppliesToMode(record.playMode) && gameGenerator.id !== BoardGenerators.DEFAULT_ID
    ? BoardGenerators.byId(gameGenerator.id) : null;
  const measured = (key, id, scale = 1) => {
    const value = shownMeasurement(record, id);
    return value === undefined ? {} : { [key]: value * scale };
  };
  return {
    m: level + ':' + record.playMode + (generator === null ? '' : ':' + generator.id),
    r: record.outcome,
    d: record.timeMs / 1000,
    w: config.width,
    h: config.height,
    mines: config.mines,
    ...(generator === null ? {} : Object.fromEntries(
      generator.params.map((param) => ['g_' + param.key, gameGenerator.params[param.key]]))),
    just: record.justiceEnabled,
    bbbv: record.bv3,
    clicks: record.clicks,
    flags: record.flagsPlaced,
    ...measured('bbbvs', 'bvPerSecond'),
    ...measured('eff', 'efficiency', 100),
    ...measured('ioe', 'ioe'),
  };
}

// The result currently on screen ({record, modeRecords}), kept so a
// settings toggle can re-render it in place; null while no result shows.
let renderedResult = null;
let resultViewRevision = 0;

let resultLayoutFrame = null;
if (typeof ResizeObserver !== 'undefined') {
  const resultLayoutObserver = new ResizeObserver(() => {
    if (settings === null || resultLayoutFrame !== null) return;
    resultLayoutFrame = requestAnimationFrame(() => {
      resultLayoutFrame = null;
      syncBoardLayout();
    });
  });
  resultLayoutObserver.observe(mainElement);
  resultLayoutObserver.observe(pageLayout);
  resultLayoutObserver.observe(gameFrame);
}

//-------AFTER-GAME REPORT (verdict blocks within the report scope)-------

function evaluationCellName(cell, width) {
  return 'row ' + (Math.floor(cell / width) + 1) + ', column ' + (cell % width + 1);
}

function buildEvaluationPosition(evaluation) {
  if (evaluation.version !== ACTION_EVALUATION_VERSION || !evaluation.position) return null;
  const position = evaluation.position;
  if (!Number.isInteger(position.width) || !Number.isInteger(position.height)
      || position.width <= 0 || position.height <= 0
      || position.width * position.height > 100000
      || !Array.isArray(position.revealed) || !Array.isArray(position.flagged)) {
    return null;
  }
  const cellSize = 16;
  const crop = evaluationCropBounds(position, evaluation);
  const shownWidth = crop.colTo - crop.colFrom + 1;
  const shownHeight = crop.rowTo - crop.rowFrom + 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'evaluation-board';
  canvas.width = shownWidth * cellSize;
  canvas.height = shownHeight * cellSize;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', crop.cropped
    ? 'Relevant board subset immediately before this action: rows '
      + (crop.rowFrom + 1) + ' through ' + (crop.rowTo + 1)
      + ', columns ' + (crop.colFrom + 1) + ' through ' + (crop.colTo + 1)
    : 'Visible board immediately before this action');
  const ctx = canvas.getContext('2d');
  const revealed = new Map(position.revealed);
  const flagged = new Set(position.flagged);
  const alternatives = new Map();
  for (const alternative of evaluation.alternatives || []) {
    for (const cell of alternative.cells) alternatives.set(cell, alternative.kind);
  }
  const selected = new Set(evaluation.selected || []);
  const numberColors = ['#555555', '#0000ff', '#008000', '#ff0000',
    '#000080', '#800000', '#008080', '#000000', '#808080'];
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let row = crop.rowFrom; row <= crop.rowTo; row++) {
    for (let col = crop.colFrom; col <= crop.colTo; col++) {
      const cell = row * position.width + col;
      const x = (col - crop.colFrom) * cellSize;
      const y = (row - crop.rowFrom) * cellSize;
      ctx.fillStyle = revealed.has(cell) ? '#f7f7f7' : '#c0c0c0';
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      if (revealed.has(cell) && revealed.get(cell) > 0) {
        const number = revealed.get(cell);
        ctx.fillStyle = numberColors[number] || '#000000';
        ctx.fillText(String(number), x + cellSize / 2, y + cellSize / 2 + 0.5);
      } else if (flagged.has(cell)) {
        ctx.fillStyle = '#b3121b';
        ctx.fillText('\u2691', x + cellSize / 2, y + cellSize / 2);
      }
      if (alternatives.has(cell)) {
        const kind = alternatives.get(cell);
        ctx.strokeStyle = kind === 'safe-reveal' ? '#008000'
          : (kind === 'lower-risk-reveal' || kind === 'higher-modeled-life-reveal')
            ? '#0066cc' : '#d17a00';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }
      if (selected.has(cell)) {
        ctx.strokeStyle = '#d00000';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
      }
    }
  }
  const wrap = document.createElement('div');
  wrap.className = 'evaluation-position';
  if (crop.cropped) {
    const note = document.createElement('div');
    note.className = 'evaluation-crop-note';
    note.textContent = 'Relevant subset: rows ' + (crop.rowFrom + 1)
      + '\u2013' + (crop.rowTo + 1) + ', columns ' + (crop.colFrom + 1)
      + '\u2013' + (crop.colTo + 1) + ' of '
      + position.height + ' rows \u00d7 ' + position.width + ' columns.';
    wrap.appendChild(note);
  }
  const scroll = document.createElement('div');
  scroll.className = 'evaluation-board-scroll';
  scroll.appendChild(canvas);
  wrap.appendChild(scroll);
  const legend = document.createElement('div');
  legend.className = 'evaluation-legend';
  const selectedLegend = document.createElement('span');
  selectedLegend.className = 'evaluation-key evaluation-key-selected';
  const shortName = (cell) => 'r' + (Math.floor(cell / position.width) + 1)
    + 'c' + (cell % position.width + 1);
  const selectedCells = [...selected];
  selectedLegend.textContent = 'Selected'
    + (selectedCells.length > 0
      ? ': ' + selectedCells.slice(0, 4).map(shortName).join(', ')
        + (selectedCells.length > 4 ? ', \u2026' : '')
      : '');
  legend.appendChild(selectedLegend);
  for (const alternative of evaluation.alternatives || []) {
    const item = document.createElement('span');
    item.className = 'evaluation-key evaluation-key-' + alternative.kind;
    const alternativeCells = Array.isArray(alternative.cells)
      ? alternative.cells : [];
    const examples = alternativeCells.slice(0, 3).map(shortName);
    item.textContent = evaluationAlternativeLabel(alternative.kind) + ': '
      + alternativeCells.length + (alternativeCells.length === 1 ? ' cell' : ' cells')
      + (examples.length > 0 ? ' \u00b7 e.g. ' + examples.join(', ') : '');
    legend.appendChild(item);
  }
  wrap.appendChild(legend);
  return wrap;
}

function reportCategoryEnabled(category) {
  const scope = settings && settings.reportScope ? settings.reportScope : 'none';
  return reportScopeAllows(scope, category);
}

function evaluationForReport(evaluation) {
  if (reportCategoryEnabled('lifeMaximization')) return evaluation;
  return {
    ...evaluation,
    mistakes: (Array.isArray(evaluation.mistakes) ? evaluation.mistakes : [])
      .filter((kind) => kind !== 'chose-lower-modeled-life'),
    alternatives: (Array.isArray(evaluation.alternatives) ? evaluation.alternatives : [])
      .filter((alternative) => alternative.kind !== 'higher-modeled-life-reveal'),
  };
}

// The action report is grouped by one exclusive primary category per action.
// Severity determines placement; lower-level mistake tags remain evidence.
// The centralized report sits below the board row, and trial reports reuse it.
function buildVerdictBlocks(record) {
  const wrap = document.createElement('div');
  wrap.className = 'result-verdicts';
  const detail = 'positions';
  const sections = new Map();
  const categorySpec = (id) =>
    ACTION_CATEGORY_SPECS.find((candidate) => candidate.id === id);
  const sectionFor = (category) => {
    if (sections.has(category)) return sections.get(category);
    const spec = categorySpec(category);
    const section = document.createElement('section');
    section.className = 'verdict-category verdict-category-' + category;
    const heading = document.createElement('h3');
    heading.className = 'verdict-category-title';
    heading.textContent = spec ? spec.label : category;
    if (spec) heading.title = spec.records;
    section.appendChild(heading);
    sections.set(category, section);
    wrap.appendChild(section);
    return section;
  };
  const appendBody = (box, bodyContent) => {
    if (!bodyContent) return;
    if (Array.isArray(bodyContent)) {
      const facts = document.createElement('div');
      facts.className = 'verdict-facts';
      for (const fact of bodyContent) {
        const line = document.createElement('div');
        line.className = 'verdict-fact';
        const label = document.createElement('span');
        label.className = 'verdict-fact-label';
        label.textContent = fact.label + ':';
        const value = document.createElement('span');
        value.textContent = fact.value;
        line.append(label, value);
        facts.appendChild(line);
      }
      box.appendChild(facts);
      return;
    }
    const body = document.createElement('div');
    body.className = 'verdict-body';
    body.textContent = bodyContent;
    box.appendChild(body);
  };
  const block = (category, kindClass, titleText, bodyContent) => {
    const box = document.createElement('div');
    box.className = 'verdict-block ' + kindClass;
    const title = document.createElement('div');
    title.className = 'verdict-title';
    title.textContent = titleText;
    box.appendChild(title);
    if (detail !== 'summary') appendBody(box, bodyContent);
    sectionFor(category).appendChild(box);
    return box;
  };
  const appendAggregateDisclosure = (entry) => {
    const details = document.createElement('details');
    details.className = 'verdict-block verdict-mistake verdict-aggregate';
    const summary = document.createElement('summary');
    summary.className = 'verdict-title';
    summary.textContent = aggregateReportTitle(entry);
    details.appendChild(summary);
    const instances = document.createElement('div');
    instances.className = 'verdict-aggregate-instances';
    for (const instance of entry.instances) {
      const item = document.createElement('div');
      item.className = 'verdict-aggregate-instance';
      const itemTitle = document.createElement('div');
      itemTitle.className = 'verdict-title';
      itemTitle.textContent = 'Action'
        + (typeof instance.evaluation.actionNumber === 'number'
          ? ' ' + instance.evaluation.actionNumber : '')
        + ': ' + actionEvaluationLabel(instance.shown);
      item.appendChild(itemTitle);
      appendBody(item, actionEvaluationLines(instance.shown));
      const position = detail === 'positions'
        ? buildEvaluationPosition(instance.shown) : null;
      if (position) item.appendChild(position);
      instances.appendChild(item);
    }
    details.appendChild(instances);
    sectionFor(entry.category).appendChild(details);
  };
  const evaluations = record.actionEvaluations || [];
  const fatal = fatalEvaluationOf(record);
  if (fatal && reportCategoryEnabled('gameLoss')) {
    const shown = evaluationForReport(fatal);
    const kind = evaluationEndingKind(fatal);
    // An early-game guess death is the mode's routine entry fee, so
    // below full scope it gets one calm sentence instead of the full
    // evidence ceremony; full analysis keeps every measurement.
    const compactEarly = fatalActionStatusKind(fatal) === 'guess-early'
      && settings.reportScope !== 'full';
    const box = block('gameLoss', 'verdict-' + (kind || 'unjudged'),
      'Fatal action: ' + actionEvaluationLabel(shown),
      compactEarly
        ? 'A forced coinflip before the board opened up came up wrong. '
          + 'Over enough games this ending is part of the mode; full '
          + 'analysis shows the measured odds.'
        : actionEvaluationLines(shown, fatalEvidenceLines(fatal, evaluations)));
    const position = detail === 'positions' && !compactEarly
      ? buildEvaluationPosition(shown) : null;
    if (position) box.appendChild(position);
  } else if (!fatal && record.outcome === 'loss'
      && reportCategoryEnabled('gameLoss')) {
    block('gameLoss', 'verdict-unjudged', 'Fatal action: unjudged',
      'No action evidence was available for this loss.');
  }
  const reportEntries = [];
  for (const evaluation of evaluations) {
    const shown = evaluationForReport(evaluation);
    if (shown.result === 'death' || !evaluationHasMistake(shown)) continue;
    const category = actionEvaluationCategory(shown);
    if (!category || !reportCategoryEnabled(category)) continue;
    reportEntries.push({ evaluation, shown, category });
  }
  for (const entry of orderReportEntries(aggregateReportEntries(reportEntries))) {
    const { evaluation, shown, category } = entry;
    if (entry.aggregateKind !== undefined) {
      appendAggregateDisclosure(entry);
      continue;
    }
    const positionless = shown.position === undefined;
    const title = positionless
      ? aggregateReportTitle(entry)
      : 'Action'
        + (typeof evaluation.actionNumber === 'number'
          ? ' ' + evaluation.actionNumber : '')
        + ': ' + actionEvaluationLabel(shown);
    const body = positionless
      ? (shown.action === 'no-op' ? null : (entry.text || actionEvaluationText(shown)))
      : actionEvaluationLines(shown);
    const box = block(category, 'verdict-mistake', title, body);
    const position = detail === 'positions' ? buildEvaluationPosition(shown) : null;
    if (position) box.appendChild(position);
  }
  if ((record.justice || 0) > 0 && reportCategoryEnabled('measurementNotes')) {
    const box = block('measurementNotes', 'verdict-justice', 'A Just Universe',
      justiceRecapText(record.justice));
    if (detail !== 'summary' && justiceDetails.length === record.justice) {
      const list = document.createElement('div');
      list.className = 'verdict-details';
      justiceDetails.forEach((detail, i) => {
        const line = document.createElement('div');
        line.textContent = justiceEventDetail(detail, i);
        list.appendChild(line);
      });
      box.appendChild(list);
    }
  }
  return wrap.childNodes.length > 0 ? wrap : null;
}

//-------RESULT PRESENTATION MODEL (pure; tests extract this span)-------

// Result surfaces share one semantic sequence. A section's order is product
// meaning, not an accident of DOM append order or the width at which flex
// items happen to wrap. The score viewer deliberately omits post-game-only
// action detail; its reference record is context for the history, not a game
// that just happened.
const RESULT_PRESENTATION_PHASES = Object.freeze([
  { id: 'outcome', order: 10 },
  { id: 'facts', order: 20 },
  { id: 'analysis', order: 30, contexts: ['postGame'] },
  { id: 'tables', order: 50 },
  { id: 'boardTables', order: 60 },
  { id: 'perfCharts', order: 70 },
  { id: 'boardCharts', order: 75 },
  { id: 'relationships', order: 80 },
]);

// A titled section's title opens and closes it, remembered as the panel named
// by its id. The table collection has no title: its tables open and close
// one by one, and its rank tables as one group.
const RESULT_CHART_SECTIONS = Object.freeze([
  { id: 'tables', phase: 'tables', label: 'Game tables', heading: false },
  { id: 'boardTables', phase: 'boardTables', label: 'This board' },
  { id: 'perfCharts', phase: 'perfCharts', label: 'your perf', chartMode: 'perfChartMode' },
  { id: 'boardCharts', phase: 'boardCharts', label: 'board traits', chartMode: 'boardChartMode' },
  { id: 'relationships', phase: 'relationships', label: 'relationships' },
]);

function resultPresentationPhases(context) {
  return RESULT_PRESENTATION_PHASES
    .filter((phase) => phase.contexts === undefined || phase.contexts.includes(context))
    .slice()
    .sort((a, b) => a.order - b.order);
}

function resultChartSections(context) {
  const phaseOrder = new Map(
    resultPresentationPhases(context).map((phase, index) => [phase.id, index]));
  return RESULT_CHART_SECTIONS
    .slice()
    .sort((a, b) => phaseOrder.get(a.phase) - phaseOrder.get(b.phase));
}

//-------RESULT PRESENTATION DISPLAY-------

// Collect first, render second: call sites can compute related data together,
// while the model above remains the one authority for visible section order.
function createResultSectionCollector(context) {
  const specs = resultChartSections(context);
  const nodes = new Map(specs.map((spec) => [spec.id, []]));
  return {
    append(sectionId, node) {
      if (!nodes.has(sectionId)) {
        throw new Error('unknown result section: ' + sectionId);
      }
      nodes.get(sectionId).push(node);
    },
    ready() {
      return Promise.all([...nodes.values()].flat().map((node) => node.analysisReady));
    },
    renderInto(parent) {
      parent.textContent = '';
      for (const spec of specs) {
        const children = nodes.get(spec.id);
        if (children.length === 0) continue;
        const section = document.createElement('section');
        section.className = 'result-chart-section result-chart-section-' + spec.id;
        section.setAttribute('aria-label', spec.label);
        const items = document.createElement('div');
        items.className = 'result-chart-section-items';
        items.append(...children);
        if (spec.heading !== false) {
          const head = resultOpenerHead('h3', spec.id, spec.label, items);
          head.classList.add('result-chart-section-head');
          if (spec.chartMode) head.append(chartModeSelect(spec.chartMode));
          section.appendChild(head);
        }
        section.appendChild(items);
        parent.appendChild(section);
      }
    },
  };
}

function difficultyDisplayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// The named difficulty with exactly these board parameters; undefined for a
// custom board.
function difficultyNameOf(params) {
  return Object.keys(DIFFICULTIES).find((name) => DIFFICULTIES[name].width === params.width
    && DIFFICULTIES[name].height === params.height && DIFFICULTIES[name].mines === params.mines);
}

function boardDisplayLabelOf(params) {
  const name = difficultyNameOf(params);
  return name === undefined
    ? 'Custom ' + params.width + 'x' + params.height + '-' + params.mines : difficultyDisplayName(name);
}

function boardDisplayLabel() {
  return boardDisplayLabelOf(config);
}

// The lifetime list of a no-mark win: "top expert no-mark times". The
// board name is the named difficulty, or the custom size. Mode and
// generator stay in their pickers; the list itself is already that
// history key's no-mark games only.
function noMarkTimeLabel() {
  const name = difficultyNameOf(config);
  const board = name === undefined
    ? 'custom ' + config.width + 'x' + config.height + '-' + config.mines
    : name;
  return 'top ' + board + ' no-mark times';
}

function formatGuesses(record) {
  if (record.guesses === 0) return '0';
  return record.guesses + ' · ' + record.guessIdealRisk + ' ideal · '
    + record.guessNonideal + ' off · ' + record.guessPerfect + ' perfect';
}

function clearResultStats() {
  resultStats.textContent = '';
  hideDuringGameHover();
}

// Only the High scores view has a head line: "High scores" and its board,
// then which game its sections describe. A finished game has none; the
// face and the board tabs already say the outcome and the board.
function setHighScoresSummary(note) {
  const leadNode = document.createElement('span');
  leadNode.className = 'result-summary-lead';
  leadNode.textContent = 'High scores';
  const context = document.createElement('span');
  context.className = 'result-summary-context';
  context.textContent = boardDisplayLabel();
  const noteNode = document.createElement('span');
  noteNode.className = 'result-summary-note';
  noteNode.textContent = note;
  resultSummary.replaceChildren(leadNode, ' ', context, '\n', noteNode);
}

// The title button that opens and closes `body`, its open state the
// remembered panel `panelKey`: every stat section, result section, and
// result table opens and closes through this one control. `help`, in
// chartHelpButton's forms, is the title's tooltip: hovering the title or
// focusing it by keyboard shows it, and the click that opens or closes puts
// it away.
let panelBodyCount = 0;
function panelToggle(panelKey, title, body, help) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ui-button stat-section-toggle';
  toggle.textContent = title;
  body.id = 'panel-body-' + ++panelBodyCount;
  toggle.setAttribute('aria-controls', body.id);
  const show = () => {
    toggle.setAttribute('aria-expanded', String(settings.panels[panelKey]));
    body.hidden = !settings.panels[panelKey];
  };
  toggle.addEventListener('click', () => {
    rememberPanel(panelKey, !settings.panels[panelKey]);
    show();
    scheduleBoardLayout();
  });
  if (help !== undefined) {
    toggle.classList.add('stat-section-toggle-help');
    const hide = () => {
      if (chartHelpOwner === toggle) hideChartHelpTip();
    };
    toggle.addEventListener('mouseenter', () => showChartHelp(toggle, help));
    toggle.addEventListener('mouseleave', () => {
      if (!toggle.matches(':focus-visible')) hide();
    });
    toggle.addEventListener('focus', () => {
      if (toggle.matches(':focus-visible')) showChartHelp(toggle, help);
    });
    toggle.addEventListener('blur', hide);
    toggle.addEventListener('click', hide);
  }
  show();
  return toggle;
}

// A stat section of the details column or the page foot: its title opens
// and closes it.
function buildStatSection(panelKey, title) {
  const section = document.createElement('section');
  section.className = 'stat-section';
  section.dataset.panel = panelKey;
  section.setAttribute('aria-label', title);
  const head = document.createElement('div');
  head.className = 'stat-section-head';
  const body = document.createElement('div');
  body.className = 'stat-section-body';
  const toggle = panelToggle(panelKey, title, body);
  head.append(toggle);
  section.append(head, body);
  return { section, body, toggle };
}

// A result opener's head: a heading (`level`, h3 or h4) holding the title
// that opens and closes `body`.
function resultOpenerHead(level, panelKey, title, body, help) {
  const head = document.createElement('div');
  head.className = 'stat-section-head';
  const heading = document.createElement(level);
  heading.className = 'stat-section-title';
  heading.append(panelToggle(panelKey, title, body, help));
  head.append(heading);
  return head;
}

// A table among the result's tables (the session summary, ranks won, this
// game): its title opens and closes the returned body, which holds the rest.
function resultTableOpener(table, panelKey, title, help) {
  const body = document.createElement('div');
  body.className = 'stat-section-body';
  table.append(resultOpenerHead('h4', panelKey, title, body, help), body);
  return body;
}

// A game data measurement of this record as the result screen shows it: only
// on wins unless it is defined for every outcome (a lost board's 3BV is the
// whole board's, which would flatter a short loss); undefined where it is not
// shown.
function shownMeasurement(record, id) {
  const metric = GameData.metrics.find((item) => item.id === id);
  const value = metric.value(record, config);
  return (metric.allOutcomes || record.outcome === 'win') && Number.isFinite(value) ? value : undefined;
}

// This game's label/value stats, after a loss or a trial game (game data
// shows a regular win's): one table among the result's tables under the
// board, like lifetime or the session summary, as wide as its rows.
function buildGameStats(record) {
  const seconds = secondsOf(record);
  const actionSummary = actionCategorySummary(record.actionEvaluations);
  const fullAnalysis = settings.reportScope === 'full';
  const categoryStatRows = ACTION_CATEGORY_SPECS
    .filter((spec) => fullAnalysis && reportCategoryEnabled(spec.id)
      && actionSummary.counts[spec.id] > 0)
    .map((spec) => [
      spec.id === 'measurementNotes' ? spec.label : spec.label + ' actions',
      String(actionSummary.counts[spec.id]),
    ]);
  const categoryMagnitudeRows = [
    ...(reportCategoryEnabled('gameRisk') && actionSummary.excessRisk > 1e-12
      ? [['Excess game risk',
        (actionSummary.excessRisk * 100).toFixed(1) + 'pp']] : []),
    ...(reportCategoryEnabled('lifeMaximization')
        && actionSummary.modeledLifeGap > 1e-9
      ? [['Modeled life gap',
        actionSummary.modeledLifeGap.toFixed(3)]] : []),
  ];
  const table = document.createElement('div');
  table.className = 'rank-list game-stats';
  const grid = document.createElement('div');
  grid.className = 'game-stats-grid';
  // A game data measurement shows under its game data name and format.
  const measurementRow = (id) => {
    const metric = GameData.metrics.find((item) => item.id === id);
    const value = shownMeasurement(record, id);
    return value === undefined
      ? [] : [[metric.name[0].toUpperCase() + metric.name.slice(1), metric.format(value)]];
  };
  // "Clicks over 3BV" only exists for wins: a lost board was never
  // finished, so the subtraction means nothing.
  for (const [label, value, valueClass] of [
    ['Time', seconds.toFixed(3) + 's', isMarkless(record) ? 'markless-time' : ''],
    ['3BV', String(record.bv3)],
    // ZiNi and human ZiNi are board facts like 3BV (the flaggers'
    // click-count benchmarks); absent on games recorded before they
    // were measured.
    ...(record.zini !== undefined ? [['ZiNi', String(record.zini)]] : []),
    ...(fullAnalysis && record.hzini !== undefined
      ? [['HZiNi', String(record.hzini)]] : []),
    ...(record.maxAdjacent !== undefined ? [['Max number', String(record.maxAdjacent)]] : []),
    ...(record.zeroCount !== undefined ? [['Zeros', String(record.zeroCount)]] : []),
    ...(record.islandCount !== undefined ? [['Islands', String(record.islandCount)]] : []),
    ...(settings.shownThings.largestIsland && record.largestIsland !== undefined
      ? [['Largest island', String(record.largestIsland)]] : []),
    ...measurementRow('bvPerSecond'),
    ['Clicks', String(record.clicks)],
    ...(fullAnalysis ? [['No-op clicks', String(record.wastedClicks)]] : []),
    ...(fullAnalysis && record.misclicks !== undefined
      ? [['Misclicks', String(record.misclicks)]] : []),
    ['Flags placed', isMarkless(record) ? '0 - markless' : String(record.flagsPlaced)],
    ...(fullAnalysis ? [['Flags removed', String(record.flagsRemoved)]] : []),
    // The count leads; the per-mark share (the primary calibration,
    // decided 2026-08-30) rides along whenever the placement count is
    // known, so "2 of 14 placed (14%)" reads at a glance.
    ...(record.outcome === 'win' && typeof record.unusedCorrectFlags === 'number'
        && record.unusedCorrectFlags > 0
      ? [['Unused flags',
          typeof record.flagsPlaced === 'number' && record.flagsPlaced > 0
            ? record.unusedCorrectFlags + ' of ' + record.flagsPlaced
              + ' placed ('
              + Math.round(100 * record.unusedCorrectFlags / record.flagsPlaced)
              + '%)'
            : String(record.unusedCorrectFlags)]] : []),
    ...measurementRow('unflaggedMineShare'),
    // A Justice event is any click "a just universe" covers — a forced
    // coinflip the rule guarantees the player wins.
    ...(fullAnalysis && record.justice !== undefined
      ? [['Forced coinflips won', String(record.justice)]] : []),
    ...(record.outcome === 'win'
      ? [['Clicks over 3BV', String(record.clicks - record.bv3)]]
      : []),
    ...measurementRow('efficiency'),
    ...(chordShareOf(record) !== undefined
      ? [['Chord share', Math.round(chordShareOf(record) * 100) + '%']] : []),
    ...measurementRow('boardChangingClickShare'),
    ...measurementRow('ioe'),
    ...measurementRow('hziniEfficiency'),
    ...(fullAnalysis ? measurementRow('ziniEfficiency') : []),
    ...measurementRow('ios'),
    ...measurementRow('stnb'),
    ...(fullAnalysis && record.lifeLost !== undefined
      ? [['Life lost', record.lifeLost.toFixed(3)]] : []),
    ...(fullAnalysis && record.lifeNeedless !== undefined
      ? [['Life needless', record.lifeNeedless.toFixed(3)]] : []),
    ...(fullAnalysis && record.guesses !== undefined
      ? [['Guesses', formatGuesses(record)]] : []),
    ...categoryStatRows,
    ...categoryMagnitudeRows,
    ['Path', record.mousePathPx + 'px'],
    ...measurementRow('mouseSpeed'),
    // The per-game forms of the session series, derived from stored
    // fields at display time (so they exist on historical games too);
    // fastclick gap and cadence spread are stored measurements.
    ...measurementRow('clickRate'),
    ...(fullAnalysis ? measurementRow('noopRate') : []),
    ...(fullAnalysis ? measurementRow('misclickRate') : []),
    ...measurementRow('flagRate'),
    ...(fullAnalysis ? measurementRow('flagRemovalRate') : []),
    ...measurementRow('fastclickGap'),
    ...measurementRow('cadenceSpread'),
    ...measurementRow('pathPerClick'),
    ...measurementRow('pathPer3bv'),
    // The states row appears only when the game carries at least one state
    // tag; a tagless game shows nothing rather than an empty row.
    ...(record.states.length > 0 ? [['States', record.states.join(', ')]] : []),
    ...(record.musicPlaying !== undefined
      ? [['Music', record.musicPlaying ? 'playing' : 'none']] : []),
    ...(record.flagsBlocked ? [['Flags', 'blocked by a daily limit']] : []),
  ]) {
    const labelCell = document.createElement('span');
    labelCell.className = 'stat-label';
    if (label === 'HZiNi efficiency') {
      labelCell.appendChild(chartHelpButton(
        GameData.metrics.find((metric) => metric.id === 'hziniEfficiency').help, label));
    } else labelCell.textContent = label;
    const valueCell = document.createElement('span');
    valueCell.className = 'stat-value' + (valueClass ? ' ' + valueClass : '');
    valueCell.textContent = value;
    grid.append(labelCell, valueCell);
  }
  resultTableOpener(table, 'gameStats', 'this game').append(grid);
  return table;
}

function renderResult(record, modeRecords, options = {}) {
  const job = renderResultAsync(record, modeRecords, options);
  job.catch(analysisFailure);
  return job;
}

async function renderResultAsync(record, modeRecords, options = {}) {
  const revision = ++resultViewRevision;
  const isCurrent = () => revision === resultViewRevision;
  resultRanks.setAttribute('aria-busy', 'true');
  if (chartHelpOwner && [resultStats, resultRanks].some((el) => el.contains(chartHelpOwner))) hideChartHelpTip();
  renderedResult = { record, modeRecords, options };
  requestBoardMetrics(record);
  if (options.historyView) setHighScoresSummary('Latest win');
  else resultSummary.textContent = '';
  clearResultStats();
  resultAnalysis.textContent = '';
  const historyView = options.historyView === true;
  if (!historyView && settings.reportScope !== 'none') {
    const verdicts = buildVerdictBlocks(record);
    if (verdicts !== null) {
      resultAnalysis.appendChild(verdicts);
    }
  }
  const gameStats = settings.shownThings.gameStats && (record.outcome !== 'win'
    || (Trial.isPlayMode(settings.playMode) && !historyView)) ? buildGameStats(record) : null;

  const resultSections = createResultSectionCollector(
    historyView ? 'scores' : 'postGame');
  const metricStatus = buildBoardMetricStatus(record);
  if (metricStatus) resultSections.append('boardTables', metricStatus);
  resultRanks.classList.toggle(
    'sectioned-results',
    !Trial.isPlayMode(settings.playMode) || historyView);
  // Built now so its analysis runs beside the rank tables'; renderRanks
  // places it above game data in the details column.
  const duringGame = settings.shownThings.duringGame && !historyView && !Trial.isPlayMode(settings.playMode)
    && duringGameAvailable(record) ? buildDuringGameBlock(record, isCurrent) : null;
  if (Trial.isPlayMode(settings.playMode) && !options.historyView) {
    resultRanks.textContent = '';
    if (gameStats !== null) resultRanks.appendChild(gameStats);
    renderTrialChrome();
  } else if (record.outcome === 'win') {
    await renderRanks(record, noMarkComparison(record, modeRecords),
      { ...options, duringGame, ...(isMarkless(record) ? { noMarkTimeLabel: noMarkTimeLabel() } : {}) },
      resultSections, isCurrent);
  } else {
    const latestWin = modeRecords.findLast((game) => game.outcome === 'win');
    await renderRanks(latestWin || record, modeRecords,
      { ...options, duringGame, gameStats, historyView: true, boardRecord: record }, resultSections, isCurrent);
  }
  if (!isCurrent()) return;
  if (!Trial.isPlayMode(settings.playMode) || options.historyView) {
    await resultSections.ready();
    if (!isCurrent()) return;
    resultSections.renderInto(resultRanks);
  }
  resultRanks.removeAttribute('aria-busy');
  syncBoardLayout();
}

function showScoresForCurrentMode() {
  resultViewRevision++;
  rememberPreference('resultView', 'scores');
  const modeRecords = history[modeKey()] || [];
  const wins = modeRecords.filter((record) => record.outcome === 'win');
  if (wins.length === 0) {
    renderedResult = null;
    setHighScoresSummary('No wins yet');
    clearResultStats();
    resultAnalysis.textContent = '';
    resultRanks.textContent = '';
    resultRanks.removeAttribute('aria-busy');
    syncBoardLayout();
    return;
  }
  const latest = wins.reduce((a, b) => a.endedAt > b.endedAt ? a : b);
  return renderResult(latest, modeRecords, { historyView: true });
}
