'use strict';

// Training page (docs/product/training.md): the measured state of the
// Expert under-60-seconds plan. storage.js opens the saved-game database;
// training-worker.js reads, replays, and summarizes; this file renders.

const TRAINING_INPUT_LABELS = {
  reveal: 'left click on a covered cell',
  'chord-multi': 'chord that opened two or more cells',
  'chord-single': 'chord that opened one cell',
  flag: 'flag placed',
  unflag: 'flag removed',
  'noop-missing-flag': 'click on a number still missing a flag',
  'noop-extra-flag': 'click on a number with too many flags',
  'noop-finished': 'click on a number with nothing left to open',
  'noop-blank': 'click on an open blank cell',
  'noop-on-flag': 'left click on a flag',
  'noop-right-on-open': 'right click on an open cell',
  'noop-chord-on-unopened': 'both-button release over an unopened cell',
};

const trainingStatus = document.getElementById('training-status');

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') location.href = 'index.html';
});

function showTrainingStatus(text, isError) {
  trainingStatus.textContent = text;
  trainingStatus.classList.toggle('training-error', isError);
  trainingStatus.hidden = false;
}

function storageFailure(what) {
  showTrainingStatus(what, true);
  throw new Error(what);
}

function userdataReady() {
  const database = { name: DB_NAME, version: db.version, recordStore: RECORD_STORE, traceStore: TRACE_STORE };
  const worker = new Worker('training-worker.js?v=20261125-mindmap-1');
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error !== undefined) showTrainingStatus('Training summary failed: ' + data.error, true);
    else if (data.summary === null) showTrainingStatus('No saved Expert games in this browser for this site yet.', false);
    else renderTraining(data.summary);
  };
  worker.onerror = (event) => {
    showTrainingStatus('Training worker failed: ' + event.message, true);
  };
  worker.postMessage({ database });

  const mindMapWorker = new Worker('mind-map-worker.js?v=20261126-mentation-1');
  mindMapWorker.onmessage = ({ data }) => {
    mindMapWorker.terminate();
    if (data.error !== undefined) renderTrainingMindMapError('Mind-map failed: ' + data.error);
    else if (data.mindMap !== null) renderTrainingMindMap(data.mindMap);
  };
  mindMapWorker.onerror = (event) => {
    renderTrainingMindMapError('Mind-map worker failed: ' + event.message);
  };
  mindMapWorker.postMessage({ database });

  const switchWorker = new Worker('switch-cost-worker.js?v=20261125-mindmap-1');
  switchWorker.onmessage = ({ data }) => {
    switchWorker.terminate();
    if (data.error !== undefined) renderTrainingSwitchCostError('Button switch cost failed: ' + data.error);
    else renderTrainingSwitchCost(data.switchCost);
  };
  switchWorker.onerror = (event) => {
    renderTrainingSwitchCostError('Button switch cost worker failed: ' + event.message);
  };
  switchWorker.postMessage({ database });
}

function trainingElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function trainingDate(ms) {
  const date = new Date(ms);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
    + '-' + String(date.getDate()).padStart(2, '0');
}

function trainingNumber(value, digits) {
  return value === null ? 'not measured' : value.toFixed(digits);
}

function trainingSeconds(value, digits) {
  return value === null ? 'not measured' : value.toFixed(digits) + ' s';
}

function trainingSignedSeconds(value) {
  return (value > 0 ? '+' : value < 0 ? '\u2212' : '') + Math.abs(value).toFixed(1) + ' s';
}

function trainingSignedNumber(value, digits) {
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? '\u2212' : '+') + text;
}

function trainingSignedMs(value) {
  return trainingSignedNumber(value, 0) + ' ms';
}

function trainingSignedBoardSeconds(ms) {
  return trainingSignedNumber(ms / 1000, Math.abs(ms) < 9995 ? 2 : 1) + ' s';
}

function trainingPercent(value) {
  return value === null ? 'not measured' : Math.round(value * 100) + '%';
}

function trainingCriterionText(criterion, value) {
  return criterion.percent ? trainingPercent(value) : trainingNumber(value, criterion.digits);
}

function trainingTable(headings, rows, numericColumns) {
  const table = trainingElement('table', 'training-table');
  const head = table.createTHead().insertRow();
  headings.forEach((heading, i) => {
    const cell = trainingElement('th', numericColumns.includes(i) ? 'training-number' : '', heading.text);
    cell.scope = 'col';
    if (heading.help) cell.title = heading.help;
    head.appendChild(cell);
  });
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    if (row.className) tr.className = row.className;
    row.cells.forEach((value, i) => {
      tr.appendChild(trainingElement('td', numericColumns.includes(i) ? 'training-number' : '', value));
    });
  }
  return table;
}

function renderTrainingNow(summary) {
  const cards = document.getElementById('training-now-cards');
  const stageIndex = summary.stages.findIndex((stage) => stage.id === summary.currentStageId);
  const items = [
    { label: 'best Expert win', value: summary.best === null ? 'no wins yet' : (summary.best.timeMs / 1000).toFixed(3) + ' s',
      detail: summary.best === null ? '' : '3BV ' + summary.best.bv3 + ', ' + trainingDate(summary.best.endedAt) },
    { label: 'median win', value: trainingSeconds(summary.pace.medianWinS, 1),
      detail: 'latest ' + summary.pace.wins + ' wins' },
    { label: '3BV/s', value: trainingNumber(summary.pace.median3bvPerS, 2), detail: 'median, latest ' + summary.pace.wins + ' wins' },
    { label: 'IOE', value: trainingNumber(summary.pace.medianIoe, 2),
      detail: '3BV per input, median, ' + summary.pace.inputMeasuredWins + ' wins' },
    { label: 'seconds per input', value: trainingNumber(summary.pace.medianSecondsPerInput, 3),
      detail: 'median, ' + summary.pace.inputMeasuredWins + ' wins' },
    { label: 'wins under 60 s', value: String(summary.goalWins), detail: 'of ' + summary.wins + ' wins, ' + summary.games + ' games' },
    { label: 'current stage', value: stageIndex === -1 ? 'all complete' : (stageIndex + 1) + ' of ' + summary.stages.length,
      detail: stageIndex === -1 ? '' : summary.stages[stageIndex].title },
  ];
  cards.replaceChildren(...items.map((item) => {
    const card = trainingElement('div', 'training-card');
    card.append(trainingElement('span', 'training-card-label', item.label),
      trainingElement('span', 'training-card-value', item.value),
      trainingElement('span', 'training-card-detail', item.detail));
    return card;
  }));
}

function renderTrainingStages(summary) {
  const list = document.getElementById('training-stage-list');
  list.replaceChildren(...summary.stages.map((stage, i) => {
    const block = trainingElement('div', 'training-stage');
    const state = stage.complete ? 'complete' : stage.id === summary.currentStageId ? 'current' : 'later';
    block.classList.add('training-stage-' + state);
    const heading = trainingElement('h3', '', (i + 1) + '. ' + stage.title);
    heading.appendChild(trainingElement('span', 'training-stage-state', state === 'later' ? 'not started' : state));
    block.appendChild(heading);
    block.appendChild(trainingTable(
      [{ text: 'measure' }, { text: 'now' }, { text: 'target' }, { text: 'met' }, { text: 'measured over' }],
      stage.criteria.map((c) => ({
        className: c.met ? 'training-met' : 'training-unmet',
        cells: [c.label, trainingCriterionText(c, c.value),
          (c.better === 'lower' ? 'at most ' : 'at least ') + trainingCriterionText(c, c.target),
          c.met ? 'yes' : 'no', c.sampleSize],
      })), [1, 2]));
    return block;
  }));
  for (const block of document.querySelectorAll('.training-plan-block')) {
    block.classList.toggle('training-plan-current', block.id === 'training-plan-' + summary.currentStageId);
  }
}

function renderTrainingBudget(summary) {
  const content = document.getElementById('training-budget-content');
  const budget = summary.budget;
  const coverage = summary.replayStatus;
  const notReplayed = summary.pace.wins - coverage.replayed;
  const coverageText = 'Replayed ' + coverage.replayed + ' of the latest ' + summary.pace.wins + ' wins from their saved inputs'
    + (notReplayed === 0 ? '.' : ' (' + [
      coverage['no-trace'] ? coverage['no-trace'] + ' without a saved trace' : '',
      coverage['no-layout'] ? coverage['no-layout'] + ' without a rebuildable board' : '',
      coverage.diverged ? coverage.diverged + ' changed by Guardian Angel' : '',
      coverage['no-reveal'] ? coverage['no-reveal'] + ' without a recorded reveal' : '',
    ].filter(Boolean).join(', ') + ').');
  if (budget === null) {
    content.replaceChildren(trainingElement('p', '', coverageText));
    return;
  }
  const total = budget.secondsPerWin;
  const rows = budget.kinds.filter((k) => k.countPerWin > 0).map((k) => ({
    className: k.kind.startsWith('noop-') ? 'training-waste' : '',
    cells: [TRAINING_INPUT_LABELS[k.kind], k.countPerWin.toFixed(1), k.secondsPerWin.toFixed(1),
      Math.round(100 * k.secondsPerWin / total) + '%'],
  }));
  rows.push({ className: 'training-total', cells: ['all inputs', budget.inputsPerWin.toFixed(1), total.toFixed(1), '100%'] });
  const table = trainingTable([
    { text: 'input' },
    { text: 'per win' },
    { text: 'seconds per win', help: 'The time before each input, grouped by what the input did.' },
    { text: 'share of time' },
  ], rows, [1, 2, 3]);
  const flags = budget.flagsPerWin;
  const facts = trainingElement('dl', 'training-facts');
  const fact = (term, value, help) => {
    const dt = trainingElement('dt', '', term);
    if (help) dt.title = help;
    facts.append(dt, trainingElement('dd', '', value));
  };
  fact('pauses over 1 s', budget.pausesPerWin.toFixed(1) + ' per win, ' + budget.pauseSecondsPerWin.toFixed(1) + ' s',
    'Gaps longer than one second before an input: reading, deciding, or looking for the next move.');
  fact('flags per win', flags.usedByMultiChord.toFixed(1) + ' used by a chord that opened two or more cells, '
    + flags.usedOnlyBySingleChord.toFixed(1) + ' used only by one-cell chords, ' + flags.neverUsed.toFixed(1)
    + ' never used, ' + flags.removed.toFixed(1) + ' removed again (' + flags.onSafeCell.toFixed(1) + ' on safe cells)');
  fact('removable inputs', budget.removableInputsPerWin.toFixed(1) + ' per win, ' + budget.removableSecondsPerWin.toFixed(1) + ' s',
    'Every no-op click, every flag removed again together with its removal, every flag no chord used, and every flag used only by chords that opened one cell (clicking that cell directly costs the same one input).');
  fact('the same wins without those inputs\u2019 time', 'median ' + budget.medianWithoutRemovableS.toFixed(1) + ' s; '
    + budget.withoutRemovableUnderGoal + ' of ' + budget.wins + ' under 60 s',
    'Each win\u2019s time minus the gaps before its removable inputs. Arithmetic on the recorded games, not a prediction: it assumes nothing else about the game changes.');
  content.replaceChildren(trainingElement('p', '', coverageText), table, facts);
}

const TRAINING_SWITCH_COST_BOARDS = [
  ['Beginner', '9x9/10@standard'],
  ['Intermediate', '16x16/40@standard'],
  ['Expert', '30x16/99@standard'],
];

function renderTrainingSwitchCostError(message) {
  const section = document.getElementById('training-switch-cost');
  const content = document.getElementById('training-switch-cost-content');
  section.dataset.status = 'error';
  content.replaceChildren(trainingElement('p', 'training-error', message));
  section.hidden = false;
}

function trainingSwitchCostVerdict(data) {
  const { latest, earlier, comparison, windowGames, minGames } = data;
  if (latest.status === 'too-few-games') {
    return 'Needs at least ' + minGames + ' flagged standard games with a saved trace and short-range '
      + 'flag/chord pairs before estimating a switch cost (' + latest.games + ' measured so far).';
  }
  if (latest.status === 'not-measurable') {
    return 'The latest ' + latest.games + ' flagged standard games do not have enough varied short-range '
      + 'flag/chord pairs to separate a button switch cost yet.';
  }
  if (comparison.status !== 'compared') {
    return 'Latest ' + latest.games + ' flagged standard games: ' + trainingSignedMs(latest.msPerSwitch)
      + ' per short-range button switch (95% interval ' + trainingSignedNumber(latest.msPerSwitchLow, 0) + ' to '
      + trainingSignedNumber(latest.msPerSwitchHigh, 0) + ' ms). Earlier ' + windowGames + ' needs at least ' + minGames
      + ' older measured games before comparing (' + earlier.games + ' so far).';
  }
  const deltaText = trainingSignedMs(comparison.deltaMs) + ' per switch ('
    + trainingSignedNumber(comparison.deltaPercent, 1) + ' percentage points)';
  const outcome = !comparison.changed
    ? 'within the 95% uncertainty interval, so no reliable change yet.'
    : comparison.direction === 'faster'
      ? 'faster beyond the 95% uncertainty interval.'
      : 'slower beyond the 95% uncertainty interval.';
  return 'Change from earlier ' + earlier.games + ' to latest ' + latest.games + ' games: '
    + deltaText + ' \u2014 ' + outcome;
}

function renderTrainingSwitchCost(data) {
  const section = document.getElementById('training-switch-cost');
  const content = document.getElementById('training-switch-cost-content');
  if (data.totalFlaggedGames === 0) {
    section.dataset.status = 'empty';
    section.hidden = true;
    return;
  }
  const lead = trainingElement('p', '',
    'Extra time when switching between right-click flags and left-click chords on short-range pairs (at most '
    + data.maxCells + ' squares apart) across standard games that placed at least one flag (no-mark games excluded). '
    + 'Controlled for move type, cursor travel, cells opened, and board progress.');
  const { latest, earlier, windowGames } = data;
  const cell = (fit, format) => (fit.status === 'measured' ? format(fit) : 'not measured');
  const boardRow = ([name, key]) => {
    const hasBoard = (latest.perGame !== null && latest.perGame[key] !== undefined)
      || (earlier.perGame !== null && earlier.perGame[key] !== undefined);
    if (!hasBoard) return [];
    const of = (fit) => (fit.perGame !== null && fit.perGame[key] !== undefined
      ? trainingSignedBoardSeconds(fit.perGame[key].meanMs) : '\u2013');
    return [{ cells: ['per ' + name + ' flagged game', of(latest), of(earlier)] }];
  };
  const rows = [
    { cells: ['extra time per switch',
      cell(latest, (f) => trainingSignedMs(f.msPerSwitch) + ' (95% ' + trainingSignedNumber(f.msPerSwitchLow, 0) + ' to ' + trainingSignedNumber(f.msPerSwitchHigh, 0) + ' ms)'),
      cell(earlier, (f) => trainingSignedMs(f.msPerSwitch) + ' (95% ' + trainingSignedNumber(f.msPerSwitchLow, 0) + ' to ' + trainingSignedNumber(f.msPerSwitchHigh, 0) + ' ms)')] },
    { cells: ['relative change',
      cell(latest, (f) => trainingSignedNumber(f.percent, 1) + '% (95% ' + trainingSignedNumber(f.percentLow, 1) + ' to ' + trainingSignedNumber(f.percentHigh, 1) + '%)'),
      cell(earlier, (f) => trainingSignedNumber(f.percent, 1) + '% (95% ' + trainingSignedNumber(f.percentLow, 1) + ' to ' + trainingSignedNumber(f.percentHigh, 1) + '%)')] },
    { cells: ['median switched gap',
      cell(latest, (f) => Math.round(f.medianSwitchMs) + ' ms'),
      cell(earlier, (f) => Math.round(f.medianSwitchMs) + ' ms')] },
    { cells: ['short-range pairs that switch',
      cell(latest, (f) => Math.round(f.switchShare * 100) + '%'),
      cell(earlier, (f) => Math.round(f.switchShare * 100) + '%')] },
    ...TRAINING_SWITCH_COST_BOARDS.flatMap(boardRow),
    { cells: ['measured flagged games',
      latest.games + ' (' + latest.transitions.toLocaleString() + ' pairs)',
      earlier.games + ' (' + earlier.transitions.toLocaleString() + ' pairs)'] },
  ];
  const table = trainingTable([
    { text: 'measure' },
    { text: 'latest ' + windowGames },
    { text: 'earlier ' + windowGames },
  ], rows, [1, 2]);
  const verdict = trainingElement('p', 'training-switch-cost-verdict', trainingSwitchCostVerdict(data));
  const scopeNote = data.totalStandardGames > data.totalFlaggedGames
    ? [trainingElement('p', '',
      'Counted ' + data.totalFlaggedGames + ' flagged standard games; skipped '
      + (data.totalStandardGames - data.totalFlaggedGames) + ' no-mark or flag-blocked standard games.')]
    : [];
  content.replaceChildren(lead, table, verdict, ...scopeNote);
  section.dataset.status = 'ready';
  section.hidden = false;
}

function renderTrainingOpenings(summary) {
  const content = document.getElementById('training-openings-content');
  const o = summary.openings;
  if (o.starts === 0) {
    content.replaceChildren(trainingElement('p', '', 'Games record their first click from 2026-09-27 on; no Expert game here has it yet.'));
    return;
  }
  const share = (part, whole) => (whole === 0 ? 'not measured' : trainingPercent(part / whole));
  const table = trainingTable([{ text: 'measure' }, { text: 'share' }, { text: 'of games' }], [
    { cells: ['first click in a corner', share(o.cornerStarts, o.starts), String(o.starts)] },
    { cells: ['corner first clicks that opened a zero', share(o.cornerOpened, o.cornerStarts), String(o.cornerStarts)] },
    { cells: ['won after an opening', share(o.openedWins, o.openedStarts), String(o.openedStarts)] },
    { cells: ['won after a numbered start', share(o.numberedWins, o.numberedStarts), String(o.numberedStarts)] },
  ], [1, 2]);
  const notes = [
    'A corner click opens a zero about half the time by chance. The plan restarts a numbered start with Space;'
      + ' a restarted game is not recorded, so the ' + o.numberedStarts + ' numbered starts above were played on.',
  ];
  if (o.notRebuildable > 0) notes.push(o.notRebuildable + ' games on boards from other generators are not counted.');
  content.replaceChildren(table, ...notes.map((text) => trainingElement('p', '', text)));
}

function renderTrainingWeeks(summary) {
  const content = document.getElementById('training-weeks-content');
  const table = trainingTable([
    { text: 'week of' }, { text: 'games' }, { text: 'wins' }, { text: 'best' }, { text: 'median win' },
    { text: '3BV/s' }, { text: 'top-3 3BV/s', help: 'Average of the 3 fastest 3BV/s Expert wins in that week (shown when 3+ wins).' },
    { text: 'IOE', help: '3BV divided by all inputs, no-ops included.' }, { text: 'sec/input' },
    { text: '20 s+ runs', help: 'Games lasting at least 20 seconds.' },
    { text: '20 s+ won', help: 'Share of games lasting at least 20 seconds that ended in a win.' },
  ], summary.weeks.map((week) => ({
    cells: [trainingDate(week.weekStartMs), String(week.games), String(week.wins),
      week.bestMs === null ? '' : (week.bestMs / 1000).toFixed(1) + ' s',
      week.medianWinS === null ? '' : week.medianWinS.toFixed(1) + ' s',
      week.median3bvPerS === null ? '' : week.median3bvPerS.toFixed(2),
      week.top3BvPerS === null ? '' : week.top3BvPerS.toFixed(2),
      week.medianIoe === null ? '' : week.medianIoe.toFixed(2),
      week.medianSecondsPerInput === null ? '' : week.medianSecondsPerInput.toFixed(2),
      week.runs === 0 ? '' : String(week.runs),
      week.conversion === null ? '' : Math.round(week.conversion * 100) + '%'],
  })), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  table.classList.add('training-weeks-table');
  content.replaceChildren(table);
}

function trainingRuleText(comparison) {
  const rule = comparison.rule;
  if (rule === null) {
    return 'Block rule: ' + comparison.comparablePairs + ' of the ' + comparison.rulePairs
      + ' block pairs it needs so far (a pair counts when both blocks have a win).';
  }
  const verdict = rule.stateBetter === null ? 'undecided: one side has no game reaching 20 s'
    : rule.stateBetter ? 'better with the state' : 'not better with the state';
  return 'Block rule, decided on the first ' + comparison.rulePairs + ' pairs: faster with the state in '
    + rule.faster + ' of ' + comparison.rulePairs + '; games reaching 20 s won ' + trainingPercent(rule.lateWith)
    + ' with, ' + trainingPercent(rule.lateWithout) + ' without. Result: ' + verdict + '.';
}

function renderTrainingStates(summary) {
  const list = document.getElementById('training-states-list');
  if (summary.stateComparisons.length === 0) {
    list.replaceChildren(trainingElement('p', '', 'No Expert game carries a state yet.'));
    return;
  }
  list.replaceChildren(...summary.stateComparisons.map((comparison) => {
    const block = trainingElement('div', 'training-state');
    const heading = trainingElement('h3', '', comparison.state);
    heading.appendChild(trainingElement('span', 'training-stage-state',
      comparison.days + (comparison.days === 1 ? ' day, ' : ' days, ') + comparison.blocks + ' blocks'));
    const row = (label, value) => ({ cells: [label, value(comparison.without), value(comparison.with)] });
    const table = trainingTable([{ text: 'measure' }, { text: 'without' }, { text: 'with' }], [
      row('games', (s) => String(s.games)),
      row('wins', (s) => String(s.wins)),
      row('median win', (s) => trainingSeconds(s.medianWinS, 1)),
      row('3BV/s', (s) => trainingNumber(s.median3bvPerS, 2)),
      row('IOE', (s) => trainingNumber(s.medianIoe, 2)),
      row('seconds per input', (s) => trainingNumber(s.medianSecondsPerInput, 3)),
      row('flags per win', (s) => trainingNumber(s.medianFlagsPerWin, 0)),
      row('chords one flag short, per game', (s) => trainingNumber(s.meanShortChordsPerGame, 1)),
      row('games reaching 20 s won', (s) => (s.conversion === null ? 'not measured' : trainingPercent(s.conversion) + ' of ' + s.runs)),
    ], [1, 2]);
    const difference = comparison.winTimeDifference;
    const differenceText = difference === null
      ? 'Median win time with the state minus without, per block pair: needs 3 pairs with a win on both sides.'
      : 'Median win time with the state minus without, per block pair: ' + trainingSignedSeconds(difference.meanS)
        + ' (95% interval ' + trainingSignedSeconds(difference.lowS) + ' to ' + trainingSignedSeconds(difference.highS)
        + ', ' + difference.pairs + ' pairs).';
    block.append(heading, table, trainingElement('p', '', differenceText),
      trainingElement('p', '', trainingRuleText(comparison)));
    return block;
  }));
}

function trainingCoachTrendPart(label, overall, earlier, latest, format) {
  if (earlier !== null && latest !== null && earlier !== undefined && latest !== undefined) {
    return label + ': ' + format(earlier) + ' \u2192 ' + format(latest);
  }
  return overall === null || overall === undefined ? null : label + ': ' + format(overall);
}

function trainingCoachModeSummary(row) {
  const parts = [];
  const f = row.features;
  const o = row.overall;
  const e = row.earlier;
  const l = row.latest;
  const add = (label, key, format) => {
    const text = trainingCoachTrendPart(label, o[key], e === null ? null : e[key], l === null ? null : l[key], format);
    if (text !== null) parts.push(text);
  };
  if (f.noWaste) {
    add('no-ops/game', 'noopsPerGame', (v) => v.toFixed(1));
    add('1-cell flags/game', 'lowValueFlagsPerGame', (v) => v.toFixed(1));
    if (o.flagChordPairs > 0) add('1.5-click', 'click15Share', (v) => Math.round(v * 100) + '%');
  }
  if (f.earlyBail) {
    if (o.earlyBailOpportunities > 0) add('fast bail', 'fastBailShare', (v) => Math.round(v * 100) + '%');
    if (o.queuedMoves > 0) add('lookahead', 'lookaheadFastShare', (v) => Math.round(v * 100) + '%');
    add('blind spots/game', 'blindSpotsPerGame', (v) => v.toFixed(1));
  }
  if (f.scanShield) {
    add('shield saves/game', 'shieldSavesPerGame', (v) => v.toFixed(1));
    add('wrong-flag warnings/game', 'wrongFlagWarningsPerGame', (v) => v.toFixed(1));
  }
  return parts.join(' \u00b7 ');
}

function trainingSignedDelta(after, before, format) {
  if (after === null || before === null || after === undefined || before === undefined) return '\u2013';
  const diff = after - before;
  return format(diff);
}

function renderTrainingCoach(summary) {
  const content = document.getElementById('training-coach-content');
  const { practice, transfer, stateSamples } = summary.coaching;
  const nodes = [];

  const rec = transfer.recommendation;
  const recBox = trainingElement('div', 'training-coach-rec');
  const recTitle = trainingElement('p', 'training-coach-rec-title',
    'Recommended next drill: ' + rec.label);
  const recBody = trainingElement('p', '', rec.reason + ' Choose it from other modes on the game page, play a short block (5\u201310 games), then play Standard Expert so transfer is measured automatically.');
  recBox.append(recTitle, recBody);
  nodes.push(recBox);

  if (practice.totalGames > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead', 'Practice drills played ('
      + practice.totalGames + ' games, ' + practice.totalMinutes.toFixed(1) + ' min)'));
    nodes.push(trainingTable(
      [{ text: 'drill' }, { text: 'games' }, { text: 'wins' }, { text: 'minutes' },
        { text: 'in-drill trend (earlier \u2192 latest half)' }],
      practice.byMode.map((row) => ({
        cells: [
          row.label,
          String(row.games),
          String(row.wins),
          row.activeMinutes.toFixed(1),
          trainingCoachModeSummary(row),
        ],
      })),
      [1, 2, 3],
    ));

    if (practice.slowPatternTotal > 0) {
      nodes.push(trainingElement('h3', 'training-coach-subhead',
        'Slow overlap patterns (\u2265 450 ms, ' + practice.slowPatternTotal + ' captured)'));
      nodes.push(trainingTable(
        [{ text: 'pattern family' }, { text: 'slow moves' }, { text: 'share' }],
        practice.slowPatterns.map((entry) => ({
          cells: [
            entry.label,
            String(entry.count),
            Math.round(100 * entry.count / practice.slowPatternTotal) + '%',
          ],
        })),
        [1, 2],
      ));
    }

    nodes.push(trainingElement('h3', 'training-coach-subhead', 'Transfer to Standard Expert'));
    const statusText = transfer.status === 'collecting'
      ? 'First Coach game: ' + trainingDate(transfer.firstCoachAt)
        + '. Needs at least ' + transfer.minPostWins + ' post-coach Standard Expert wins to judge transfer ('
        + transfer.post.wins + ' so far).'
      : 'First Coach game: ' + trainingDate(transfer.firstCoachAt)
        + '. Comparing ' + transfer.baseline.wins + ' pre-coach Standard Expert wins against '
        + transfer.post.wins + ' post-coach wins.';
    nodes.push(trainingElement('p', 'training-coach-verdict', statusText));

    const b = transfer.baseline;
    const p = transfer.post;
    const cd = transfer.coachDays;
    const ncd = transfer.nonCoachDays;
    const fmt = (v, fn) => (v === null || v === undefined ? '\u2013' : fn(v));
    const transferRows = [
      { cells: ['wins (of games)', b.wins + ' / ' + b.games, p.wins + ' / ' + p.games, '\u2013',
        cd.wins + ' / ' + cd.games, ncd.wins + ' / ' + ncd.games] },
      { cells: ['median 3BV/s', fmt(b.median3bvPerS, (v) => v.toFixed(2)), fmt(p.median3bvPerS, (v) => v.toFixed(2)),
        trainingSignedDelta(p.median3bvPerS, b.median3bvPerS, (d) => trainingSignedNumber(d, 2)),
        fmt(cd.median3bvPerS, (v) => v.toFixed(2)), fmt(ncd.median3bvPerS, (v) => v.toFixed(2))] },
      { cells: ['median win', fmt(b.medianWinS, (v) => v.toFixed(1) + ' s'), fmt(p.medianWinS, (v) => v.toFixed(1) + ' s'),
        trainingSignedDelta(p.medianWinS, b.medianWinS, trainingSignedSeconds),
        fmt(cd.medianWinS, (v) => v.toFixed(1) + ' s'), fmt(ncd.medianWinS, (v) => v.toFixed(1) + ' s')] },
      { cells: ['median IOE', fmt(b.medianIoe, (v) => v.toFixed(2)), fmt(p.medianIoe, (v) => v.toFixed(2)),
        trainingSignedDelta(p.medianIoe, b.medianIoe, (d) => trainingSignedNumber(d, 2)),
        fmt(cd.medianIoe, (v) => v.toFixed(2)), fmt(ncd.medianIoe, (v) => v.toFixed(2))] },
      { cells: ['no-ops per win', fmt(b.medianNoopsPerWin, (v) => v.toFixed(1)), fmt(p.medianNoopsPerWin, (v) => v.toFixed(1)),
        trainingSignedDelta(p.medianNoopsPerWin, b.medianNoopsPerWin, (d) => trainingSignedNumber(d, 1)),
        fmt(cd.medianNoopsPerWin, (v) => v.toFixed(1)), fmt(ncd.medianNoopsPerWin, (v) => v.toFixed(1))] },
      { cells: ['flags per 3BV', fmt(b.medianFlagsPer3bv, (v) => v.toFixed(2)), fmt(p.medianFlagsPer3bv, (v) => v.toFixed(2)),
        trainingSignedDelta(p.medianFlagsPer3bv, b.medianFlagsPer3bv, (d) => trainingSignedNumber(d, 2)),
        fmt(cd.medianFlagsPer3bv, (v) => v.toFixed(2)), fmt(ncd.medianFlagsPer3bv, (v) => v.toFixed(2))] },
      { cells: ['flag\u2192chord gap', fmt(b.medianFlagChordGapMs, (v) => Math.round(v) + ' ms'),
        fmt(p.medianFlagChordGapMs, (v) => Math.round(v) + ' ms'),
        trainingSignedDelta(p.medianFlagChordGapMs, b.medianFlagChordGapMs, trainingSignedMs),
        fmt(cd.medianFlagChordGapMs, (v) => Math.round(v) + ' ms'),
        fmt(ncd.medianFlagChordGapMs, (v) => Math.round(v) + ' ms')] },
      { cells: ['move gap', fmt(b.medianMoveGapMs, (v) => Math.round(v) + ' ms'),
        fmt(p.medianMoveGapMs, (v) => Math.round(v) + ' ms'),
        trainingSignedDelta(p.medianMoveGapMs, b.medianMoveGapMs, trainingSignedMs),
        fmt(cd.medianMoveGapMs, (v) => Math.round(v) + ' ms'),
        fmt(ncd.medianMoveGapMs, (v) => Math.round(v) + ' ms')] },
      { cells: ['left hard work per win', fmt(b.meanLeftHardWorkPerWin, (v) => v.toFixed(2)),
        fmt(p.meanLeftHardWorkPerWin, (v) => v.toFixed(2)),
        trainingSignedDelta(p.meanLeftHardWorkPerWin, b.meanLeftHardWorkPerWin, (d) => trainingSignedNumber(d, 2)),
        fmt(cd.meanLeftHardWorkPerWin, (v) => v.toFixed(2)), fmt(ncd.meanLeftHardWorkPerWin, (v) => v.toFixed(2))] },
      { cells: ['games reaching 20 s won', fmt(b.runConversion, trainingPercent), fmt(p.runConversion, trainingPercent),
        trainingSignedDelta(p.runConversion, b.runConversion, (d) => trainingSignedNumber(d * 100, 1) + ' pp'),
        fmt(cd.runConversion, trainingPercent), fmt(ncd.runConversion, trainingPercent)] },
      { cells: ['avoidable losses past 20 s', fmt(b.avoidableShare, trainingPercent), fmt(p.avoidableShare, trainingPercent),
        trainingSignedDelta(p.avoidableShare, b.avoidableShare, (d) => trainingSignedNumber(d * 100, 1) + ' pp'),
        fmt(cd.avoidableShare, trainingPercent), fmt(ncd.avoidableShare, trainingPercent)] },
    ];
    nodes.push(trainingTable(
      [{ text: 'Standard Expert measure' }, { text: 'pre-coach' }, { text: 'post-coach' },
        { text: 'change' }, { text: 'coach days' }, { text: 'non-coach days' }],
      transferRows,
      [1, 2, 3, 4, 5],
    ));
  }

  if (stateSamples.totalSampledGames > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead',
      'Sampled state vs Standard Expert (' + stateSamples.totalSampledGames + ' sampled games)'));
    const stateRows = [...stateSamples.byFocus, ...stateSamples.byPace].map((row) => ({
      cells: [
        row.label,
        String(row.games),
        String(row.wins),
        row.median3bvPerS === null ? '\u2013' : row.median3bvPerS.toFixed(2),
        row.medianIoe === null ? '\u2013' : row.medianIoe.toFixed(2),
        row.runConversion === null ? '\u2013' : trainingPercent(row.runConversion) + ' of ' + row.runs,
      ],
    }));
    nodes.push(trainingTable(
      [{ text: 'state sample' }, { text: 'games' }, { text: 'wins' }, { text: 'median 3BV/s' },
        { text: 'median IOE' }, { text: 'games reaching 20 s won' }],
      stateRows,
      [1, 2, 3, 4, 5],
    ));
  }

  content.replaceChildren(...nodes);
}

function renderTrainingMiniBoard(diagram, large) {
  const board = trainingElement('div', 'training-mini-board' + (large ? ' training-mini-board-lg' : ''));
  board.style.setProperty('--mini-w', String(diagram.width));
  board.style.setProperty('--mini-h', String(diagram.height));
  for (const wall of diagram.walls || []) board.classList.add('wall-' + wall);
  const flagMarkup = typeof flagSvg === 'function' ? flagSvg('classic', 100) : '';
  for (const cell of diagram.cells) {
    const tile = trainingElement('span', 'training-mini-tile');
    if (cell.kind === 'open') {
      tile.classList.add('training-mini-open');
      if (cell.num > 0) {
        tile.classList.add('training-mini-n' + cell.num);
        tile.textContent = String(cell.num);
      }
    } else if (cell.kind === 'flag') {
      tile.classList.add('training-mini-covered');
      tile.innerHTML = flagMarkup;
    } else {
      tile.classList.add('training-mini-covered');
    }
    if (cell.mark) {
      tile.classList.add('training-mini-mark', 'training-mini-mark-' + cell.mark);
    }
    board.appendChild(tile);
  }
  return board;
}

function trainingValuePair(numText, unitText, wide) {
  const wrap = trainingElement('span', 'training-val-pair' + (wide ? ' training-val-pair-wide' : ''));
  wrap.append(
    trainingElement('span', 'training-val-num', numText),
    trainingElement('span', 'training-val-unit', unitText),
  );
  return wrap;
}

function renderTrainingMindMapError(message) {
  for (const [secId, contentId] of [['training-traits', 'training-traits-content'], ['training-mind-map', 'training-mind-map-content']]) {
    const section = document.getElementById(secId);
    const content = document.getElementById(contentId);
    section.dataset.status = 'error';
    content.replaceChildren(trainingElement('p', 'training-error', message));
    section.hidden = false;
  }
}

function renderTrainingHighlightsAndTraits(data) {
  const section = document.getElementById('training-traits');
  const content = document.getElementById('training-traits-content');
  const nodes = [];

  if (data.highlights.length > 0) {
    const grid = trainingElement('div', 'training-highlights-grid');
    for (const h of data.highlights) {
      const card = trainingElement('div', 'training-highlight training-highlight-' + h.severity);
      const head = trainingElement('div', 'training-highlight-head');
      head.append(
        trainingElement('span', 'training-highlight-title', h.title),
        trainingElement('span', 'training-highlight-metric', h.metric),
      );
      card.append(head, trainingElement('p', 'training-highlight-detail', h.detail));
      grid.appendChild(card);
    }
    nodes.push(grid);
  }

  if (data.rankedTraits.length > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead',
      'All measured Expert traits, ordered by time cost (' + data.counts.Expert + ' traced wins)'));
    const table = trainingElement('table', 'training-table');
    const headRow = table.createTHead().insertRow();
    [
      { text: 'trait' },
      { text: 'now', num: true },
      { text: 'target', num: true },
      { text: 'cost (s/win)', num: true, help: 'Estimated seconds per Expert win left on the table.' },
      { text: 'status' },
      { text: 'count', num: true },
    ].forEach((col) => {
      const th = trainingElement('th', col.num ? 'training-number' : '', col.text);
      th.scope = 'col';
      if (col.help) th.title = col.help;
      headRow.appendChild(th);
    });
    const body = table.createTBody();
    for (const t of data.rankedTraits) {
      const tr = body.insertRow();
      const labelCell = trainingElement('td', '', t.label);
      if (t.help) labelCell.title = t.help;
      const nowCell = trainingElement('td', 'training-number');
      nowCell.appendChild(trainingValuePair(t.valueNum, t.valueUnit));
      const targetCell = trainingElement('td', 'training-number', t.benchmark);
      const costCell = trainingElement('td', 'training-number', t.costSec > 0 ? t.costSec.toFixed(1) : '0.0');
      const statusCell = trainingElement('td', '');
      statusCell.appendChild(trainingElement('span', 'training-status-pill training-status-' + t.status, t.status));
      const sampleCell = trainingElement('td', 'training-number');
      sampleCell.appendChild(trainingValuePair(t.sample.toLocaleString(), t.sampleUnit, true));
      tr.append(labelCell, nowCell, targetCell, costCell, statusCell, sampleCell);
    }
    nodes.push(table);
  }

  content.replaceChildren(...nodes);
  section.dataset.status = 'ready';
  section.hidden = false;
}

function renderTrainingMentation(m) {
  const nodes = [];
  if (!m) return nodes;
  nodes.push(trainingElement('h3', 'training-coach-subhead',
    'How your mind moves through Expert wins (' + m.wins + ' traced wins)'));

  const grid = trainingElement('div', 'training-mentation-grid');
  const addCard = (label, value, detail) => {
    const card = trainingElement('div', 'training-card');
    card.append(
      trainingElement('span', 'training-card-label', label),
      trainingElement('span', 'training-card-value', value),
      trainingElement('span', 'training-card-detail', detail),
    );
    grid.appendChild(card);
  };

  addCard(
    'Eyes-ahead lookahead',
    m.eyesAheadPct === null ? '\u2013' : m.eyesAheadPct + '%',
    (m.dryJumpsPerWin.toFixed(1) + ' dry jumps/win'
      + (m.dryJumpMedMs !== null ? ' \u00b7 ' + m.dryJumpMedMs + ' ms med' : '')
      + (m.countingChoicePct !== null ? ' \u00b7 ' + m.countingChoicePct + '% counting-first forks' : '')
      + ' (3.0+ pros: 35%+)'),
  );
  addCard(
    'Slow cursor reading on clues',
    m.slowOnClueSec.toFixed(1) + ' s/win',
    m.hoverPct + '% hover \u00b7 ' + m.driftPct + '% slow drift \u00b7 ' + m.fastPct + '% fast flight'
      + (m.localDriftRatio !== null ? ' \u00b7 ' + m.localDriftRatio.toFixed(1) + '\u00d7 local drift (pros: 1.0\u20131.1\u00d7)' : ''),
  );
  addCard(
    'Fluent chunk size',
    m.meanChunkLen === null ? '\u2013' : m.meanChunkLen.toFixed(2) + ' moves',
    'Entry ' + (m.chunkEntryMedMs === null ? '\u2013' : m.chunkEntryMedMs + ' ms')
      + ' \u00b7 follow-up ' + (m.chunkFollowMedMs === null ? '\u2013' : m.chunkFollowMedMs + ' ms')
      + ' (press-to-press)',
  );
  const pd = m.preDownHover;
  const pdParts = [];
  if (pd && pd.revealMs !== null) pdParts.push('reveal ' + pd.revealMs + ' ms');
  if (pd && pd.chordMs !== null) pdParts.push('chord ' + pd.chordMs + ' ms');
  if (pd && pd.flagMs !== null) pdParts.push('flag ' + pd.flagMs + ' ms');
  addCard(
    'Mid-flight detours',
    m.detourSecPerWin.toFixed(1) + ' s/win',
    m.detoursPerWin.toFixed(1) + ' detours/win (' + m.detourOnCountingSecPerWin.toFixed(1) + ' s on counting targets)'
      + (pdParts.length > 0 ? ' \u00b7 pre-press hover: ' + pdParts.join(', ') : '')
      + (pd && pd.leftHoldMs !== null ? ' (left hold ' + pd.leftHoldMs + ' ms)' : ''),
  );
  nodes.push(grid);

  if (m.breakers && m.breakers.length > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead', 'What breaks your flow (Expert wins)'));
    nodes.push(trainingTable(
      [
        { text: 'cause of chunk break' },
        { text: 'breaks/win' },
        { text: 'time (s/win)' },
      ],
      m.breakers.map((b) => ({
        className: b.secPerWin >= 10 ? 'training-waste' : '',
        cells: [b.label, b.perWin.toFixed(1), b.secPerWin.toFixed(1)],
      })),
      [1, 2],
    ));
  }
  return nodes;
}

function renderTrainingMindMap(data) {
  renderTrainingHighlightsAndTraits(data);

  const section = document.getElementById('training-mind-map');
  const content = document.getElementById('training-mind-map-content');
  const nodes = [];

  // 0) Mentation profile (how thinking, scanning, chunking, and cursor reading unfold)
  nodes.push(...renderTrainingMentation(data.mentation));

  // 1) Technique speed catalog with inline classic visual diagrams + size filter
  nodes.push(trainingElement('h3', 'training-coach-subhead',
    'Technique speed & skip-first map (press-to-press, pooled across ' + data.counts.all + ' traced Standard wins)'));

  const filterRow = trainingElement('div', 'training-filter-row');
  const tableHolder = trainingElement('div', '');
  const levels = [
    { key: 'all', label: 'All sizes (' + data.counts.all + ')' },
    { key: 'Expert', label: 'Expert (' + data.counts.Expert + ')' },
    { key: 'Intermediate', label: 'Intermediate (' + data.counts.Intermediate + ')' },
    { key: 'Beginner', label: 'Beginner (' + data.counts.Beginner + ')' },
  ];
  let activeLevel = data.counts.Expert > 0 ? 'all' : 'all';

  const keyLine = trainingElement('p', 'training-key-line');
  keyLine.innerHTML = '<span class="training-key-chip training-key-safe"></span>safe = open'
    + '<span class="training-key-chip training-key-mine"></span>mine = flag'
    + '<span class="training-key-chip training-key-chord"></span>chord = both buttons'
    + '<span class="training-key-chip training-key-guess"></span>guess = unproven'
    + ' \u00b7 thick border = board edge';

  const drawTechniqueTable = (levelKey) => {
    activeLevel = levelKey;
    for (const btn of filterRow.querySelectorAll('button')) {
      btn.setAttribute('aria-pressed', btn.dataset.level === levelKey ? 'true' : 'false');
    }
    const rows = data.techniques[levelKey] || [];
    if (rows.length === 0) {
      tableHolder.replaceChildren(trainingElement('p', '', 'No traced wins measured for this size yet.'));
      return;
    }
    const table = trainingElement('table', 'training-table');
    const head = table.createTHead().insertRow();
    [
      { text: 'shape' },
      { text: 'technique' },
      { text: 'count', num: true },
      { text: 'fresh (ms)', num: true, help: 'Press-to-press median when the square first became provable from the immediately prior click (local, no detour, no no-op).' },
      { text: 'queued (ms)', num: true, help: 'Press-to-press median when the square was already provable 1\u20133 clicks earlier in the same local area.' },
      { text: 'all (ms)', num: true, help: 'Overall press-to-press median across all non-post-no-op moves.' },
      { text: '90th (ms)', num: true },
      { text: 'slow (%)', num: true, help: 'Share of moves taking 600 ms or longer press-to-press.' },
      { text: 'easy elsewhere (%)', num: true, help: 'Share of moves where 2+ counting moves sat open at least 3 squares away.' },
      { text: 'action', help: 'bail first = slow solvable shape (450 ms+ fresh) where easy counting moves usually wait elsewhere.' },
    ].forEach((col) => {
      const th = trainingElement('th', col.num ? 'training-number' : '', col.text);
      th.scope = 'col';
      if (col.help) th.title = col.help;
      head.appendChild(th);
    });
    const body = table.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      const shapeTd = trainingElement('td', '');
      const wrap = trainingElement('div', 'training-mini-cell-wrap');
      const boardSlot = trainingElement('span', '');
      boardSlot.appendChild(renderTrainingMiniBoard(r.diagram, false));
      wrap.appendChild(boardSlot);
      if (r.sampleCrop) {
        let showingReal = false;
        const toggle = trainingElement('button', 'training-crop-toggle', 'yours');
        toggle.type = 'button';
        toggle.title = 'Switch between canonical diagram and a real 5x5 position from your games';
        toggle.addEventListener('click', () => {
          showingReal = !showingReal;
          boardSlot.replaceChildren(renderTrainingMiniBoard(showingReal ? r.sampleCrop : r.diagram, false));
          toggle.textContent = showingReal ? 'shape' : 'yours';
        });
        wrap.appendChild(toggle);
      }
      shapeTd.appendChild(wrap);

      const nameTd = trainingElement('td', '', r.label);
      if (r.help) nameTd.title = r.help;
      const countTd = trainingElement('td', 'training-number', r.n.toLocaleString());
      const freshTd = trainingElement('td', 'training-number', r.freshMs === null ? '\u2013' : String(r.freshMs));
      if (r.freshN > 0) freshTd.title = 'n = ' + r.freshN + ' fresh local moves';
      const queuedTd = trainingElement('td', 'training-number', r.queuedMs === null ? '\u2013' : String(r.queuedMs));
      if (r.queuedN > 0) queuedTd.title = 'n = ' + r.queuedN + ' queued local moves';
      const medTd = trainingElement('td', 'training-number', r.medMs === null ? '\u2013' : String(r.medMs));
      const p90Td = trainingElement('td', 'training-number', r.p90Ms === null ? '\u2013' : String(r.p90Ms));
      const slowTd = trainingElement('td', 'training-number', r.slowPct === null ? '\u2013' : r.slowPct + '%');
      const easyTd = trainingElement('td', 'training-number', r.easyPct === null ? '\u2013' : r.easyPct + '%');
      const adviceTd = trainingElement('td', '');
      const adviceLabel = r.advice === 'bail-first' ? 'bail first' : r.advice === 'low-n' ? 'low n' : r.advice;
      adviceTd.appendChild(trainingElement('span', 'training-advice-pill training-advice-' + r.advice, adviceLabel));
      tr.append(shapeTd, nameTd, countTd, freshTd, queuedTd, medTd, p90Td, slowTd, easyTd, adviceTd);
    }
    tableHolder.replaceChildren(table);
  };

  for (const lv of levels) {
    const btn = trainingElement('button', 'training-filter-btn', lv.label);
    btn.type = 'button';
    btn.dataset.level = lv.key;
    btn.setAttribute('aria-pressed', lv.key === activeLevel ? 'true' : 'false');
    btn.addEventListener('click', () => drawTechniqueTable(lv.key));
    filterRow.appendChild(btn);
  }
  drawTechniqueTable(activeLevel);
  nodes.push(filterRow, keyLine, tableHolder);

  // 2) Endgame pointless flagging (separate clean rows by board size, no triple-slash cells)
  const endgameRows = ['Expert', 'Intermediate', 'Beginner']
    .map((lvl) => ({ lvl, e: data.endgame[lvl] }))
    .filter((entry) => entry.e !== null);
  if (endgameRows.length > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead', 'Endgame pointless flagging (final 5 safe squares)'));
    nodes.push(trainingTable(
      [
        { text: 'level' },
        { text: 'wins' },
        { text: 'wins with pointless flag (%)' },
        { text: 'flags/win' },
        { text: 'time (s/win)' },
        { text: 'flagged at 1 safe left (%)', help: 'Share of wins that placed a flag when only one safe square remained.' },
      ],
      endgameRows.map(({ lvl, e }) => ({
        className: e.withEnd5Pct >= 50 ? 'training-waste' : '',
        cells: [
          lvl,
          String(e.wins),
          e.withEnd5Pct + '%',
          e.end5FlagsPerWin.toFixed(1),
          e.end5SecPerWin.toFixed(1),
          e.withLast1Pct + '%',
        ],
      })),
      [1, 2, 3, 4, 5],
    ));
  }

  // 3) Single-game thinking reconstruction (latest replayed Expert wins)
  if (data.recentGames.length > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead', 'Single-game thinking trace (latest Expert wins)'));
    const pickerRow = trainingElement('div', 'training-game-picker-row');
    const select = trainingElement('select', 'training-game-picker');
    select.setAttribute('aria-label', 'Choose a recent Expert win to inspect');
    data.recentGames.forEach((g, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = trainingDate(g.endedAt) + ' \u00b7 ' + g.timeS.toFixed(1) + ' s (' + g.bvs.toFixed(2) + ' 3BV/s, 3BV ' + g.bv3 + ')';
      select.appendChild(opt);
    });
    const meta = trainingElement('span', 'training-game-meta');
    const epList = trainingElement('div', 'training-episode-list');

    const drawGameEpisodes = (idx) => {
      const g = data.recentGames[idx];
      meta.textContent = 'IOE ' + (g.ioe === null ? '\u2013' : g.ioe.toFixed(2))
        + ' \u00b7 no-ops ' + g.habitNoops + ' habit / ' + g.physicalNoops + ' physical'
        + ' \u00b7 endgame flags ' + g.end5Flags
        + (g.eyesAheadPct !== null ? ' \u00b7 eyes-ahead ' + g.eyesAheadPct + '%' : '')
        + (g.localDriftRatio !== null ? ' \u00b7 local drift ' + g.localDriftRatio.toFixed(1) + '\u00d7' : '')
        + ' \u00b7 detours ' + g.detourSec.toFixed(1) + ' s'
        + ' \u00b7 hovers ' + g.abandonedChecks
        + ' \u00b7 reversals ' + g.reversals;
      if (g.episodes.length === 0) {
        epList.replaceChildren(trainingElement('p', '', 'No slow decisions or notable interruptions in this win.'));
        return;
      }
      epList.replaceChildren(...g.episodes.map((ep) => {
        const row = trainingElement('div', 'training-episode training-episode-' + ep.kind);
        row.append(
          trainingElement('span', 'training-episode-time', (ep.atMs / 1000).toFixed(1) + ' s'),
          trainingElement('span', 'training-episode-text', ep.label),
        );
        if (ep.crop) row.appendChild(renderTrainingMiniBoard(ep.crop, true));
        return row;
      }));
    };

    select.addEventListener('change', () => drawGameEpisodes(Number(select.value)));
    pickerRow.append(select, meta);
    drawGameEpisodes(0);
    nodes.push(pickerRow, epList);
  }

  content.replaceChildren(...nodes);
  section.dataset.status = 'ready';
  section.hidden = false;
}

function renderTraining(summary) {
  renderTrainingNow(summary);
  renderTrainingStages(summary);
  renderTrainingCoach(summary);
  renderTrainingBudget(summary);
  renderTrainingOpenings(summary);
  renderTrainingWeeks(summary);
  renderTrainingStates(summary);
  for (const id of ['training-now', 'training-stages', 'training-coach', 'training-budget', 'training-openings', 'training-weeks', 'training-states']) {
    document.getElementById(id).hidden = false;
  }
  const at = new Date();
  showTrainingStatus('Computed from ' + summary.games + ' saved Expert games'
    + (summary.coaching.practice.totalGames > 0
      ? ' and ' + summary.coaching.practice.totalGames + ' Coach practice games' : '')
    + ' at ' + String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0')
    + '. Reload after playing to update.', false);
}
