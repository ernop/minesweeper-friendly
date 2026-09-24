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
    outcome: outcome,
    timeMs: Math.round(finalTimeMs),
    // A drill's difficulty is what was actually presented: the remnant's
    // remaining 3BV, not the whole board's. Full-board ZiNi is likewise
    // meaningless for a partial solve, so drill records omit it.
    bv3: endgameDrillActive() && drillCurrent !== null
      ? drillCurrent.remaining3BV : compute3BV(),
    ...(endgameDrillActive() ? {} : {
      zini: Zini.zini(config.width, config.height, mineAt),
      hzini: Zini.hzini(config.width, config.height, mineAt),
    }),
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
  // Fastclick gap: the game's median gap between consecutive useful
  // presses made on the move with gaps under 1s (the session series'
  // qualification, over this one game). Absent when no gap qualified.
  const gameFastGap = sessionMedian(gameFastclickGaps);
  if (gameFastGap !== undefined) {
    record.fastclickGapMs = Math.round(gameFastGap);
  }
  // Cadence spread: the trace cadence system's gap-spread ratio (press
  // gap interquartile range over the median gap, all button presses,
  // wasted included), stored per game for wins and losses alike so
  // rhythm consistency is chartable across games. Absent when the game
  // had under two measurable presses or a zero median.
  const gameCadence = computeClickCadence(trace.t, trace.events);
  if (typeof gameCadence.gapSpreadRatio === 'number'
      && Number.isFinite(gameCadence.gapSpreadRatio)) {
    record.cadenceSpread = Number(gameCadence.gapSpreadRatio.toFixed(3));
  }
  if (!oddsFailed && guessLedgerAppliesToMode()) {
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
  // The canonical metrics: the same computation the live panel runs, over
  // the now-complete trace, with the same wall-time definition the stored
  // trace carries (endedAt - startedAt). Snapshotted for the after-game
  // charts; the live panel's game is over, so it goes away.
  const finalMetrics = computeAllTraceMetrics(
    trace.t, trace.x, trace.y, trace.events, record.endedAt - trace.startedAt);
  appendTraceMetricsSeries(finalMetrics);
  finalMotion = {
    metrics: finalMetrics,
    series: metricsSeries,
    // Spatial bias is an after-game chart only (the fit is meaningless
    // mid-game and quadratic in actions), so it is computed once here
    // rather than in the live tick's computeAllTraceMetrics.
    spatial: computeSpatialBias(trace.events),
  };
  saveTrace(record);
  if (!endgameDrillActive()) requestBoardMetrics(record, {
    width: config.width, height: config.height, mines: mineAt,
  });
  // The live per-game rows go away with their game; the session section
  // stays (it spans games), so the panel re-renders rather than hiding.
  renderMetricsPanel(null);
  renderResult(record, modeRecords);
  // The inspection controls appear with the finished board; a view left on
  // from the previous game renders this game's trace immediately. The
  // game-history slider starts at its end: every action done, this board.
  replayStep = replayDecisionCount();
  replayEnabled = false;
  updateSettings({ resultView: 'game', replayPosition: { endedAt: record.endedAt, step: replayStep } });
  renderPathView();
}

// The result currently on screen ({record, modeRecords}), kept so a
// settings toggle can re-render it in place; null while no result shows.
let renderedResult = null;

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

//-------AFTER-GAME REPORT (verdict blocks, report scope, review display)-------

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
  const scope = settings && settings.reportScope ? settings.reportScope : 'fatal';
  return reportScopeAllows(scope, category);
}

// Recheck the one proof-derived mistake that an older, deliberately
// incomplete prover could falsely assign. The saved position contains every
// revealed clue needed for a hidden-layout-independent correction.
function proofCorrectedEvaluation(evaluation) {
  if (!evaluation || evaluation.version !== ACTION_EVALUATION_VERSION
      || !evaluation.position || !Array.isArray(evaluation.mistakes)
      || !Array.isArray(evaluation.selected) || evaluation.selected.length === 0
      || !evaluation.mistakes.includes('opened-unproven-with-safe-move')) {
    return evaluation;
  }
  const position = evaluation.position;
  const size = position.width * position.height;
  const revealed = new Array(size).fill(false);
  const adjacent = new Array(size).fill(0);
  for (const pair of position.revealed || []) {
    if (!Array.isArray(pair) || !Number.isInteger(pair[0])
        || pair[0] < 0 || pair[0] >= size) return evaluation;
    revealed[pair[0]] = true;
    adjacent[pair[0]] = pair[1];
  }
  try {
    const facts = Justice.proveFacts({
      width: position.width,
      height: position.height,
      mines: position.mines,
      revealed,
      adjacent,
    }, Justice.rawClues({
      width: position.width,
      height: position.height,
      mines: position.mines,
      revealed,
      adjacent,
    }));
    if (!facts.complete
        || !(evaluation.selected || []).every((cell) => facts.get(cell) === 2)) {
      return evaluation;
    }
    return {
      ...evaluation,
      mistakes: evaluation.mistakes.filter(
        (mistake) => mistake !== 'opened-unproven-with-safe-move'),
      evidence: {
        ...(evaluation.evidence || {}),
        factsMeasured: true,
        knowledge: 'proven-safe',
        proofVersion: Justice.PROOF_VERSION,
        proofCorrection: 'rechecked-saved-position',
      },
    };
  } catch (err) {
    return evaluation;
  }
}

function evaluationForReport(evaluation) {
  const corrected = proofCorrectedEvaluation(evaluation);
  if (reportCategoryEnabled('lifeMaximization')) return corrected;
  return {
    ...corrected,
    mistakes: (Array.isArray(corrected.mistakes) ? corrected.mistakes : [])
      .filter((kind) => kind !== 'chose-lower-modeled-life'),
    alternatives: (Array.isArray(corrected.alternatives) ? corrected.alternatives : [])
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
        : actionEvaluationLines(shown));
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

function buildReportScopeControl(onChange) {
  const label = document.createElement('label');
  label.className = 'report-scope-control';
  const text = document.createElement('span');
  text.textContent = 'After each game, show me:';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'After each game, show me');
  for (const [value, optionLabel, description] of REPORT_SCOPE_CHOICES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel;
    option.title = description;
    option.selected = settings.reportScope === value;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    settings.reportScope = select.value;
    // Keep old exports understandable, but reportScope is now authoritative.
    settings.shownThings.endVerdict = select.value !== 'none';
    saveSettings();
    onChange();
  });
  label.append(text, select);
  return label;
}

// The display panel remains in one place for every analysis scope. Update
// the report without rebuilding the focused controls or closing the panel.
function renderReviewDisplay(onChange) {
  const host = document.getElementById('review-display-content');
  host.reviewChange = onChange;
  if (host.childElementCount > 0) {
    host.querySelector('select').value = settings.reportScope;
    for (const input of host.querySelectorAll('input')) {
      input.checked = input.dataset.shownThing
        ? settings.shownThings[input.dataset.shownThing] : settings[input.dataset.setting];
    }
    return;
  }
  host.appendChild(buildReportScopeControl(() => host.reviewChange()));
  const options = document.createElement('div');
  options.className = 'review-display-options';
  const add = (key, name, description, shownThing) => {
    const label = document.createElement('label');
    label.title = description;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset[shownThing ? 'shownThing' : 'setting'] = key;
    input.checked = shownThing ? settings.shownThings[key] : settings[key];
    input.addEventListener('change', () => {
      (shownThing ? settings.shownThings : settings)[key] = input.checked;
      saveSettings();
      host.reviewChange();
      scheduleBoardLayout();
    });
    label.append(input, name);
    options.appendChild(label);
  };
  for (const [key, name, description] of SHOWN_THINGS_OPTIONS) add(key, name, description, true);
  add('showMotionStatsAfterGame', 'motion charts', 'Motion measurements over the completed game', false);
  add('collapseDuplicateCharts', 'collapse duplicate tablecharts', 'Combine time windows containing the same wins', false);
  host.appendChild(options);
}

//-------RESULT PRESENTATION MODEL (pure; tests extract this span)-------

// Result surfaces share one semantic sequence. A section's order is product
// meaning, not an accident of DOM append order or the width at which flex
// items happen to wrap. The score viewer deliberately omits post-game-only
// action and motion detail; its reference record is context for the history,
// not a game that just happened.
const RESULT_PRESENTATION_PHASES = Object.freeze([
  { id: 'outcome', order: 10 },
  { id: 'facts', order: 20 },
  { id: 'analysis', order: 30, contexts: ['postGame'] },
  { id: 'tables', order: 50 },
  { id: 'boardTables', order: 60 },
  { id: 'averages', order: 70 },
  { id: 'relationships', order: 80 },
  { id: 'diagnostics', order: 90, contexts: ['postGame'] },
]);

const RESULT_CHART_SECTIONS = Object.freeze([
  { id: 'tables', phase: 'tables', label: 'Game tables', heading: false },
  { id: 'boardTables', phase: 'boardTables', label: 'This board' },
  { id: 'averages', phase: 'averages', label: 'average time' },
  { id: 'relationships', phase: 'relationships', label: 'relationships' },
  {
    id: 'diagnostics',
    phase: 'diagnostics',
    label: 'motion diagnostics',
    contexts: ['postGame'],
  },
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
    .filter((section) =>
      section.contexts === undefined || section.contexts.includes(context))
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
    appendAll(sectionId, additions) {
      for (const node of additions) this.append(sectionId, node);
    },
    renderInto(parent) {
      parent.textContent = '';
      for (const spec of specs) {
        const children = nodes.get(spec.id);
        if (children.length === 0) continue;
        const section = document.createElement('section');
        section.className = 'result-chart-section result-chart-section-' + spec.id;
        section.setAttribute('aria-label', spec.label);
        if (spec.heading !== false) {
          const heading = document.createElement('h3');
          heading.className = 'result-chart-section-title';
          heading.textContent = spec.label;
          section.appendChild(heading);
        }
        const items = document.createElement('div');
        items.className = 'result-chart-section-items';
        items.append(...children);
        section.appendChild(items);
        parent.appendChild(section);
      }
    },
  };
}

function difficultyDisplayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function boardDisplayLabel() {
  let board = 'Custom ' + config.width + 'x' + config.height + '-' + config.mines;
  for (const [name, d] of Object.entries(DIFFICULTIES)) {
    if (d.width === config.width && d.height === config.height && d.mines === config.mines) {
      board = difficultyDisplayName(name);
      break;
    }
  }
  return board;
}

function formatDate(timestampMs) {
  const d = new Date(timestampMs);
  const pad = (n) => String(n).padStart(2, '0');
  return WEEKDAY_NAMES[d.getDay()] + ' '
    + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function formatGuesses(record) {
  if (record.guesses === 0) return '0';
  return record.guesses + ' · ' + record.guessIdealRisk + ' ideal · '
    + record.guessNonideal + ' off · ' + record.guessPerfect + ' perfect';
}

function clearResultStats() {
  resultStats.textContent = '';
  gameDataColumn.textContent = '';
}

// Two lines: the outcome with its board, mode, and generator, then when.
function setResultSummary(lead, generatorLabel, when) {
  const leadNode = document.createElement('span');
  leadNode.className = 'result-summary-lead';
  leadNode.textContent = lead;
  const context = document.createElement('span');
  context.className = 'result-summary-context';
  context.textContent = [boardDisplayLabel(), playModeLabel(), generatorLabel]
    .filter((part) => part !== null).join(' \u00b7 ');
  const whenNode = document.createElement('span');
  whenNode.className = 'result-summary-when';
  whenNode.textContent = when;
  resultSummary.replaceChildren(leadNode, ' ', context, '\n', whenNode);
}

function renderResult(record, modeRecords, options = {}) {
  if (chartHelpOwner && [resultStats, gameDataColumn, resultRanks].some((el) => el.contains(chartHelpOwner))) hideChartHelpTip();
  renderedResult = { record, modeRecords, options };
  requestBoardMetrics(record);
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
  const summaryLead = options.historyView
    ? 'High scores'
    : (record.outcome === 'win' ? 'Win' : 'Loss');
  setResultSummary(summaryLead,
    record.generator === undefined ? null : BoardGenerators.displayLabel(record.generator),
    (options.historyView ? 'Latest win · ' : '') + formatDate(record.endedAt));
  clearResultStats();
  resultAnalysis.textContent = '';
  const historyView = options.historyView === true;
  if (!historyView) {
    renderReviewDisplay(() => renderResult(record, modeRecords, options));
    if (settings.reportScope !== 'none') {
      const verdicts = buildVerdictBlocks(record);
      if (verdicts !== null) {
        resultAnalysis.appendChild(verdicts);
      }
    }
  }
  const statsGrid = document.createElement('div');
  statsGrid.id = 'stats-grid';
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
    ['3BV/s', bvPerSecond(record).toFixed(4)],
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
      ? [['Unused mine marks',
          typeof record.flagsPlaced === 'number' && record.flagsPlaced > 0
            ? record.unusedCorrectFlags + ' of ' + record.flagsPlaced
              + ' placed ('
              + Math.round(100 * record.unusedCorrectFlags / record.flagsPlaced)
              + '%)'
            : String(record.unusedCorrectFlags)]] : []),
    // A Justice event is any qualifying sealed-pocket entry — a forced
    // coinflip the rule guarantees the player wins.
    ...(fullAnalysis && record.justice !== undefined
      ? [['Justice', String(record.justice)]] : []),
    ...(record.outcome === 'win'
      ? [['Clicks over 3BV', String(record.clicks - record.bv3)]]
      : []),
    ['Efficiency', efficiencyPercent(record) + '%'],
    ...(chordShareOf(record) !== undefined
      ? [['Chord share', Math.round(chordShareOf(record) * 100) + '%']] : []),
    ...(correctnessPercent(record) !== undefined
      ? [['Correctness', correctnessPercent(record) + '%']] : []),
    ...(throughputOf(record) !== undefined
      ? [['Throughput', throughputOf(record).toFixed(4)]] : []),
    ...(ioeOf(record) !== undefined
      ? [['IOE', ioeOf(record).toFixed(4)]] : []),
    ...(hziniEfficiencyOf(record) !== undefined
      ? [['HZiNi efficiency', (100 * hziniEfficiencyOf(record)).toFixed(1) + '%']] : []),
    ...(fullAnalysis && zniEfficiencyOf(record) !== undefined
      ? [['ZiNi efficiency', zniEfficiencyOf(record).toFixed(4)]] : []),
    ...(iosOf(record) !== undefined
      ? [['IOS', iosOf(record).toFixed(4)]] : []),
    ...(stnbOf(record, config) !== undefined
      ? [['STNB', stnbOf(record, config).toFixed(1)]] : []),
    ...(fullAnalysis && record.lifeLost !== undefined
      ? [['Life lost', record.lifeLost.toFixed(3)]] : []),
    ...(fullAnalysis && record.lifeNeedless !== undefined
      ? [['Life needless', record.lifeNeedless.toFixed(3)]] : []),
    ...(fullAnalysis && record.guesses !== undefined
      ? [['Guesses', formatGuesses(record)]] : []),
    ...categoryStatRows,
    ...categoryMagnitudeRows,
    ['Mouse path', record.mousePathPx + 'px'],
    ['Mouse speed', Math.round(record.mousePathPx / seconds) + 'px/s'],
    // The per-game forms of the session series, derived from stored
    // fields at display time (so they exist on historical games too);
    // fastclick gap is the one stored measurement among them.
    ...(seconds > 0
      ? [['Click rate', (record.clicks / seconds).toFixed(2) + '/s']] : []),
    // Per second since 2026-08-23, matching the session chart's unit
    // move; derived from the stored count, so every record old or new
    // shows the same unit with no migration.
    ...(fullAnalysis && seconds > 0 && 'wastedClicks' in record
      ? [['No-op rate', (record.wastedClicks / seconds).toFixed(2) + '/s']] : []),
    ...(fullAnalysis && seconds > 0 && record.misclicks !== undefined
      ? [['Misclick rate', (record.misclicks / (seconds / 60)).toFixed(1) + '/min']] : []),
    ...(seconds > 0 && record.flagsPlaced !== undefined
      ? [['Mark rate', (record.flagsPlaced / seconds).toFixed(2) + '/s']] : []),
    ...(fullAnalysis && seconds > 0 && record.flagsRemoved !== undefined
      ? [['Flag-removal rate', (record.flagsRemoved / (seconds / 60)).toFixed(1) + '/min']] : []),
    ...(record.fastclickGapMs !== undefined
      ? [['Fastclick gap', Math.round(record.fastclickGapMs) + 'ms']] : []),
    ...(record.cadenceSpread !== undefined
      ? [['Cadence spread', record.cadenceSpread.toFixed(2) + '\u00d7']] : []),
    ['Path per click', Math.round(record.mousePathPx / record.clicks) + 'px'],
    ['Path per 3BV', Math.round(record.mousePathPx / record.bv3) + 'px'],
    // The states row appears only when the game carries at least one state
    // tag; a tagless game shows nothing rather than an empty row.
    ...(record.states.length > 0 ? [['States', record.states.join(', ')]] : []),
    ...(record.musicPlaying !== undefined
      ? [['Music', record.musicPlaying ? 'playing' : 'none']] : []),
  ]) {
    const labelCell = document.createElement('span');
    labelCell.className = 'stat-label';
    if (label === 'HZiNi efficiency') {
      labelCell.appendChild(chartHelpButton('100 × the board’s HZiNi count divided by your board-changing clicks. A performance measure for completed wins; it can exceed 100% when your play beats the fixed HZiNi procedure. This is not a board characteristic or a time-rank percentile.', label));
    } else labelCell.textContent = label;
    const valueCell = document.createElement('span');
    valueCell.className = 'stat-value' + (valueClass ? ' ' + valueClass : '');
    valueCell.textContent = value;
    statsGrid.append(labelCell, valueCell);
  }
  if (settings.shownThings.gameStats && (record.outcome !== 'win'
      || (Trial.isPlayMode(settings.playMode) && !historyView))) {
    if (historyView) {
      const heading = document.createElement('h3');
      heading.className = 'latest-win-stats-title';
      heading.textContent = 'latest win stats';
      resultStats.appendChild(heading);
    }
    resultStats.appendChild(statsGrid);
  }

  const resultSections = createResultSectionCollector(
    historyView ? 'scores' : 'postGame');
  const metricStatus = buildBoardMetricStatus(record);
  if (metricStatus) resultSections.append('boardTables', metricStatus);
  resultRanks.classList.toggle(
    'sectioned-results',
    !Trial.isPlayMode(settings.playMode) || historyView);
  if (Trial.isPlayMode(settings.playMode) && !options.historyView) {
    resultRanks.textContent = '';
    renderTrialChrome();
  } else if (record.outcome === 'win') {
    renderRanks(record, modeRecords, options, resultSections);
  } else {
    resultRanks.textContent = '';
    const latestWin = modeRecords.findLast((game) => game.outcome === 'win');
    renderRanks(latestWin || record, modeRecords,
      { ...options, historyView: true, boardRecord: record }, resultSections);
  }
  // The after-game motion charts, jammed inline after whatever other
  // bottom charts the outcome produced. Losses retain prior win history;
  // motion describes the just-finished game either way. Trial review has its own charts.
  if (settings.showMotionStatsAfterGame && finalMotion !== null && !options.historyView
      && !Trial.isPlayMode(settings.playMode)) {
    resultSections.appendAll('diagnostics', buildMotionStatsCharts());
  }
  if (!Trial.isPlayMode(settings.playMode) || options.historyView) {
    resultSections.renderInto(resultRanks);
  }
  syncBoardLayout();
}

function showScoresForCurrentMode() {
  rememberPreference('resultView', 'scores');
  const modeRecords = history[modeKey()] || [];
  const wins = modeRecords.filter((record) => record.outcome === 'win');
  if (wins.length === 0) {
    renderedResult = null;
    setResultSummary('High scores',
      gameGenerator.id === BoardGenerators.DEFAULT_ID ? null : BoardGenerators.displayLabel(gameGenerator),
      'No wins yet');
    clearResultStats();
    resultAnalysis.textContent = '';
    resultRanks.textContent = '';
    syncBoardLayout();
    return;
  }
  const latest = wins.reduce((a, b) => a.endedAt > b.endedAt ? a : b);
  renderResult(latest, modeRecords, { historyView: true });
}
