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
  const worker = new Worker('training-worker.js?v=20260926-chord-buttons');
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error !== undefined) showTrainingStatus('Training summary failed: ' + data.error, true);
    else if (data.summary === null) showTrainingStatus('No saved Expert games in this browser for this site yet.', false);
    else renderTraining(data.summary);
  };
  worker.onerror = (event) => {
    showTrainingStatus('Training worker failed: ' + event.message, true);
  };
  worker.postMessage({ database: { name: DB_NAME, version: db.version, recordStore: RECORD_STORE,
    traceStore: TRACE_STORE } });
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
      coverage.diverged ? coverage.diverged + ' changed by a Justice redraw' : '',
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

function renderTrainingWeeks(summary) {
  const content = document.getElementById('training-weeks-content');
  const table = trainingTable([
    { text: 'week of' }, { text: 'games' }, { text: 'wins' }, { text: 'best' }, { text: 'median win' },
    { text: '3BV/s' }, { text: 'IOE', help: '3BV divided by all inputs, no-ops included.' }, { text: 'seconds per input' },
    { text: 'games reaching 20 s won', help: 'Wins among the games that lasted at least 20 seconds.' },
  ], summary.weeks.map((week) => ({
    cells: [trainingDate(week.weekStartMs), String(week.games), String(week.wins),
      week.bestMs === null ? '' : (week.bestMs / 1000).toFixed(3) + ' s',
      week.medianWinS === null ? '' : week.medianWinS.toFixed(1) + ' s',
      week.median3bvPerS === null ? '' : week.median3bvPerS.toFixed(2),
      week.medianIoe === null ? '' : week.medianIoe.toFixed(2),
      week.medianSecondsPerInput === null ? '' : week.medianSecondsPerInput.toFixed(3),
      week.conversion === null ? '' : Math.round(week.conversion * 100) + '% of ' + week.runs],
  })), [1, 2, 3, 4, 5, 6, 7, 8]);
  table.classList.add('training-weeks-table');
  content.replaceChildren(table);
}

function renderTraining(summary) {
  renderTrainingNow(summary);
  renderTrainingStages(summary);
  renderTrainingBudget(summary);
  renderTrainingWeeks(summary);
  for (const id of ['training-now', 'training-stages', 'training-budget', 'training-weeks']) {
    document.getElementById(id).hidden = false;
  }
  const at = new Date();
  showTrainingStatus('Computed from ' + summary.games + ' saved Expert games at '
    + String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0')
    + '. Reload after playing to update.', false);
}
