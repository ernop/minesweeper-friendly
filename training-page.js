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

let activeMindMapWorker = null;
let activeDatabaseInfo = null;
let latestMindMapData = null;
let latestTrainingSummary = null;
let mentationFeedbackState = { version: 1, entries: {} };
let playerGameCellSize = 28;
let problemsDrillSummary = { attempts: 0, lastFlagSolved: 0, pointingRuns: 0, skillDrills: {} };
let inspectorJumpHandler = null;
let inspectorRequestCounter = 0;

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
    location.href = 'index.html';
  }
});

function launchGameMode(playMode, difficulty = 'custom') {
  if (db === null) {
    location.href = 'index.html';
    return;
  }
  const tx = db.transaction(USERDATA_STORE, 'readwrite');
  const store = tx.objectStore(USERDATA_STORE);
  const getReq = store.get('settings');
  getReq.onsuccess = () => {
    const current = (getReq.result && typeof getReq.result === 'object') ? getReq.result : {};
    const updated = playMode === 'standard' && difficulty === 'expert'
      ? { ...current, difficulty: 'expert', playMode: 'standard' }
      : { ...current, difficulty: 'custom', customBoard: { width: 30, height: 16, mines: 99 }, playMode };
    store.put(updated, 'settings');
  };
  tx.oncomplete = () => {
    location.href = 'index.html';
  };
  tx.onerror = () => {
    location.href = 'index.html';
  };
}

for (const btn of document.querySelectorAll('[data-launch-mode]')) {
  btn.addEventListener('click', () => {
    launchGameMode(btn.dataset.launchMode, btn.dataset.launchDiff || 'custom');
  });
}

function showTrainingStatus(text, isError) {
  trainingStatus.textContent = text;
  trainingStatus.classList.toggle('training-error', isError);
  trainingStatus.hidden = false;
}

function storageFailure(what) {
  showTrainingStatus(what, true);
  throw new Error(what);
}

function loadMentationFeedback(onDone) {
  const tx = db.transaction(USERDATA_STORE);
  const store = tx.objectStore(USERDATA_STORE);
  const req = store.get('mentationFeedback');
  req.onsuccess = () => {
    const val = req.result;
    if (val && typeof val === 'object' && val.entries && typeof val.entries === 'object') {
      mentationFeedbackState = val;
    }
  };
  const setReq = store.get('settings');
  setReq.onsuccess = () => {
    const s = setReq.result;
    if (s && typeof s === 'object' && Number.isInteger(s.cellSize) && s.cellSize >= 16 && s.cellSize <= 96) {
      playerGameCellSize = s.cellSize;
    }
  };
  tx.oncomplete = () => onDone();
  tx.onerror = () => onDone();
}

function saveMentationFeedback() {
  persistUserdata('mentationFeedback', mentationFeedbackState);
}

async function loadProblemsDrillProgress() {
  if (typeof indexedDB.databases !== 'function') return;
  const known = await indexedDB.databases();
  if (!known.some((d) => d.name === 'minesweeper-problems')) return;
  await new Promise((resolve) => {
    const req = indexedDB.open('minesweeper-problems');
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const pdb = req.result;
      try {
        const names = pdb.objectStoreNames;
        const stores = ['attempts', 'pointingRuns', 'drillAttempts', 'preferences'].filter((s) => names.contains(s));
        if (stores.length === 0) {
          pdb.close();
          resolve();
          return;
        }
        const tx = pdb.transaction(stores);
        if (names.contains('attempts')) {
          tx.objectStore('attempts').count().onsuccess = (e) => { problemsDrillSummary.attempts = e.target.result || 0; };
        }
        if (names.contains('pointingRuns')) {
          tx.objectStore('pointingRuns').count().onsuccess = (e) => { problemsDrillSummary.pointingRuns = e.target.result || 0; };
        }
        if (names.contains('drillAttempts')) {
          tx.objectStore('drillAttempts').getAll().onsuccess = (e) => {
            const list = e.target.result || [];
            problemsDrillSummary.lastFlagSolved = list.filter((a) => a && a.outcome === 'solved').length;
          };
        }
        if (names.contains('preferences')) {
          tx.objectStore('preferences').get('skillDrills').onsuccess = (e) => {
            if (e.target.result && typeof e.target.result === 'object') {
              problemsDrillSummary.skillDrills = e.target.result;
            }
          };
        }
        tx.oncomplete = () => {
          pdb.close();
          resolve();
        };
        tx.onerror = () => {
          pdb.close();
          resolve();
        };
      } catch (_err) {
        pdb.close();
        resolve();
      }
    };
  });
}

function userdataReady() {
  const database = { name: DB_NAME, version: db.version, recordStore: RECORD_STORE, traceStore: TRACE_STORE };
  activeDatabaseInfo = database;

  loadMentationFeedback(() => {
    loadProblemsDrillProgress().then(() => {
      if (latestMindMapData !== null) renderTrainingMindMap(latestMindMapData);
    });
  });

  const worker = new Worker('training-worker.js?v=20261125-mindmap-1');
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error !== undefined) showTrainingStatus('Training summary failed: ' + data.error, true);
    else if (data.summary === null) showTrainingStatus('No saved Expert games in this browser for this site yet.', false);
    else {
      latestTrainingSummary = data.summary;
      renderTraining(data.summary);
    }
  };
  worker.onerror = (event) => {
    showTrainingStatus('Training worker failed: ' + event.message, true);
  };
  worker.postMessage({ database });

  const mindMapWorker = new Worker('mind-map-worker.js?v=20261127-mentation-2');
  activeMindMapWorker = mindMapWorker;
  mindMapWorker.onmessage = ({ data }) => {
    if (data && data.action === 'inspect') {
      if (typeof window._onMindMapInspectReply === 'function') window._onMindMapInspectReply(data);
      return;
    }
    if (data.error !== undefined) renderTrainingMindMapError('Mind-map failed: ' + data.error);
    else if (data.mindMap !== null) {
      latestMindMapData = data.mindMap;
      renderTrainingMindMap(data.mindMap);
      renderTrainingInspector(data.mindMap);
    }
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
  const methodNote = trainingElement('p', 'training-inline-def',
    'How this table relates to the mind-map above: this table partitions 100% of whole-game clock time from input trigger to input trigger (left-button release to right-button press or next left-button release, which includes the ~62 ms mechanical left-button hold). The mind-map above measures press-to-press decision time (button-down to button-down) so left-click reveals and right-click flags are compared without button-hold bias.');
  content.replaceChildren(trainingElement('p', '', coverageText), methodNote, table, facts);
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

const TRAINING_TRAIT_DRILL_ACTIONS = {
  ioe: { label: 'Coach: No-waste', mode: 'coach-no-waste' },
  'clue-reading-drift': { label: 'Anti-drift drill', href: 'problems.html?drill=anti-drift#mentation-drills' },
  'eyes-ahead': { label: 'Eyes-ahead drill', href: 'problems.html?drill=eyes-ahead#mentation-drills' },
  'slow-bail': { label: 'Bail-vs-solve drill', href: 'problems.html?drill=bail-shape#mentation-drills' },
  'abandoned-checks': { label: 'Ready 4/5/6/7 drill', href: 'problems.html?drill=ready-high#mentation-drills' },
  'noops-split': { label: 'Last-flag & No-waste', href: 'problems.html#problems-drill' },
  'counting-first-forks': { label: 'Coach: Early bail', mode: 'coach-early-bail' },
  'endgame-flags': { label: 'Endgame finish drill', href: 'problems.html?drill=endgame-finish#mentation-drills' },
  'exh-4plus': { label: 'Ready 4/5/6/7 drill', href: 'problems.html?drill=ready-high#mentation-drills' },
  'noflag-hesitation': { label: 'No-flag counting drill', href: 'problems.html?drill=cluttered-counting#mentation-drills' },
  'post-noop-drag': { label: 'Coach: No-waste', mode: 'coach-no-waste' },
};

function createDrillActionControl(spec) {
  if (!spec) return trainingElement('span', '', '\u2013');
  if (spec.mode) {
    const btn = trainingElement('button', 'training-crop-toggle', spec.label);
    btn.type = 'button';
    btn.addEventListener('click', () => launchGameMode(spec.mode, 'custom'));
    return btn;
  }
  const link = trainingElement('a', 'training-drill-link', spec.label);
  link.href = spec.href;
  return link;
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
    nodes.push(trainingElement('p', 'training-inline-def',
      'Each trait below is measured directly from your saved Expert input traces (timed press-to-press from button-down to button-down), ranked by estimated seconds per Expert win left on the table, and paired with its definition and dedicated practice drill.'));
    const table = trainingElement('table', 'training-table');
    const headRow = table.createTHead().insertRow();
    [
      { text: 'trait & plain-English definition' },
      { text: 'now', num: true },
      { text: 'target', num: true },
      { text: 'cost (s/win)', num: true, help: 'Estimated seconds per Expert win left on the table.' },
      { text: 'status' },
      { text: 'count', num: true },
      { text: 'practice drill' },
    ].forEach((col) => {
      const th = trainingElement('th', col.num ? 'training-number' : '', col.text);
      th.scope = 'col';
      if (col.help) th.title = col.help;
      headRow.appendChild(th);
    });
    const body = table.createTBody();
    for (const t of data.rankedTraits) {
      const tr = body.insertRow();
      const labelCell = trainingElement('td', '');
      const titleSpan = trainingElement('div', 'training-trait-title', t.label);
      labelCell.appendChild(titleSpan);
      if (t.help) {
        labelCell.appendChild(trainingElement('div', 'training-trait-def', t.help));
      }
      const nowCell = trainingElement('td', 'training-number');
      nowCell.appendChild(trainingValuePair(t.valueNum, t.valueUnit));
      const targetCell = trainingElement('td', 'training-number', t.benchmark);
      const costCell = trainingElement('td', 'training-number', t.costSec > 0 ? t.costSec.toFixed(1) : '0.0');
      const statusCell = trainingElement('td', '');
      statusCell.appendChild(trainingElement('span', 'training-status-pill training-status-' + t.status, t.status));
      const sampleCell = trainingElement('td', 'training-number');
      sampleCell.appendChild(trainingValuePair(t.sample.toLocaleString(), t.sampleUnit, true));
      const actionCell = trainingElement('td', '');
      actionCell.appendChild(createDrillActionControl(TRAINING_TRAIT_DRILL_ACTIONS[t.id]));
      tr.append(labelCell, nowCell, targetCell, costCell, statusCell, sampleCell, actionCell);
    }
    nodes.push(table);
  }

  content.replaceChildren(...nodes);
  section.dataset.status = 'ready';
  section.hidden = false;
}

function renderTrainingMentation(m, preDeath) {
  const nodes = [];
  if (!m && !preDeath) return nodes;
  nodes.push(trainingElement('h3', 'training-coach-subhead',
    'How your mind moves through Expert games (' + (m ? m.wins + ' traced wins' : '0 traced wins')
    + (preDeath ? ', ' + preDeath.losses + ' traced late losses past 20 s' : '') + ')'));
  nodes.push(trainingElement('p', 'training-inline-def',
    'Definitions are shown directly on each card below so every mentation measurement is self-explanatory. All decision gaps are measured press-to-press (button-down to button-down), separating thinking time from the ~62 ms mechanical finger hold between pressing and releasing the mouse button.'));

  const grid = trainingElement('div', 'training-mentation-grid');
  const addCard = (label, value, detail, definition, drillSpec) => {
    const card = trainingElement('div', 'training-mentation-card');
    card.append(
      trainingElement('span', 'training-card-label', label),
      trainingElement('span', 'training-card-value', value),
      trainingElement('span', 'training-card-detail', detail),
      trainingElement('p', 'training-mentation-def', definition),
    );
    if (drillSpec) {
      const foot = trainingElement('div', 'training-mentation-foot');
      foot.appendChild(createDrillActionControl(drillSpec));
      card.appendChild(foot);
    }
    grid.appendChild(card);
  };

  if (m) {
    addCard(
      'Eyes-ahead lookahead',
      m.eyesAheadPct === null ? '\u2013' : m.eyesAheadPct + '%',
      (m.dryJumpsPerWin.toFixed(1) + ' dry jumps/win'
        + (m.dryJumpMedMs !== null ? ' \u00b7 ' + m.dryJumpMedMs + ' ms med' : '')
        + (m.countingChoicePct !== null ? ' \u00b7 ' + m.countingChoicePct + '% counting-first forks' : '')
        + ' (3.0+ pros: 35%+)'),
      'Definition: on a dry jump (a cross-board jump of 3+ squares after zero simple counting-safe squares remain locally), eyes-ahead lookahead is the share of 4+ square jumps where your cursor departs within 45 ms with no mid-flight wandering \u2014 meaning your eyes spotted the next area before your hand finished clicking the old one. A counting-first fork is a jump when both a simple single-number counting area and an overlap-only area sit open across the board.',
      { label: 'Practice: Two-area eyes-ahead drill', href: 'problems.html?drill=eyes-ahead#mentation-drills' },
    );
    addCard(
      'Slow cursor reading on clues',
      m.slowOnClueSec.toFixed(1) + ' s/win',
      m.hoverPct + '% hover \u00b7 ' + m.driftPct + '% slow drift \u00b7 ' + m.fastPct + '% fast flight'
        + (m.localDriftRatio !== null ? ' \u00b7 ' + m.localDriftRatio.toFixed(1) + '\u00d7 local drift (pros: 1.0\u20131.1\u00d7)' : ''),
      'Definition: time per win spent dragging the cursor slowly (< 3 squares/s) across open clue numbers while deciding, rather than reading with your eyes first and moving the mouse only once the target square is chosen. Local drift is the ratio of cursor path length to straight-line distance on short slow moves (2 squares or less, 450 ms+).',
      { label: 'Practice: Eyes-first anti-drift drill', href: 'problems.html?drill=anti-drift#mentation-drills' },
    );
    addCard(
      'Fluent chunk size',
      m.meanChunkLen === null ? '\u2013' : m.meanChunkLen.toFixed(2) + ' moves',
      'Entry ' + (m.chunkEntryMedMs === null ? '\u2013' : m.chunkEntryMedMs + ' ms')
        + ' \u00b7 follow-up ' + (m.chunkFollowMedMs === null ? '\u2013' : m.chunkFollowMedMs + ' ms')
        + ' (press-to-press)',
      'Definition: how many consecutive local counting moves (within 2 squares, 380 ms or less press-to-press, with no no-ops or slow wandering) you chain together in one unbroken burst before pausing, jumping across the board, hitting an overlap pattern wall, or making a no-op click.',
      { label: 'Practice: Cluttered counting chunks', href: 'problems.html?drill=cluttered-counting#mentation-drills' },
    );
    const pd = m.preDownHover;
    const pdParts = [];
    if (pd && pd.revealMs !== null) pdParts.push('reveal ' + pd.revealMs + ' ms');
    if (pd && pd.chordMs !== null) pdParts.push('chord ' + pd.chordMs + ' ms');
    if (pd && pd.flagMs !== null) pdParts.push('flag ' + pd.flagMs + ' ms');
    addCard(
      'Mid-flight detours & pre-press hover',
      m.detourSecPerWin.toFixed(1) + ' s/win',
      m.detoursPerWin.toFixed(1) + ' detours/win (' + m.detourOnCountingSecPerWin.toFixed(1) + ' s on counting targets)'
        + (pdParts.length > 0 ? ' \u00b7 pre-press hover: ' + pdParts.join(', ') : '')
        + (pd && pd.leftHoldMs !== null ? ' (button hold ' + pd.leftHoldMs + ' ms)' : ''),
      'Definition: a mid-flight detour is a pause of 120 ms or more over a third area (at least 2 squares from both start and target) before clicking elsewhere \u2014 abandoned search time that naive per-click timers falsely blame on the final target. Pre-press hover is time inside the target square before pressing down; button hold is the mechanical finger hold from press to release.',
      { label: 'Inspect detours in replay below', href: '#training-inspector' },
    );
  }

  if (preDeath) {
    addCard(
      'Pre-death flow breakdown',
      (preDeath.cruisingMedMs !== null && preDeath.fatalMedMs !== null)
        ? preDeath.cruisingMedMs + ' \u2192 ' + preDeath.fatalMedMs + ' ms'
        : preDeath.losses + ' late losses',
      'Cruising ' + (preDeath.cruisingMedMs ?? '\u2013') + ' ms \u2192 moves \u22125..\u22123 '
        + (preDeath.pre5to3MedMs ?? '\u2013') + ' ms \u2192 moves \u22122..\u22121 '
        + (preDeath.pre2to1MedMs ?? '\u2013') + ' ms \u2192 fatal ' + (preDeath.fatalMedMs ?? '\u2013') + ' ms'
        + ' \u00b7 pre-death no-ops ' + (preDeath.cruisingNoopPct ?? 0) + '% \u2192 ' + preDeath.fatalNoopPct + '%'
        + ' \u00b7 ' + preDeath.safeAvailablePct + '% had a safe move open',
      'Definition: pre-death flow breakdown is the measurable slowdown and rhythm disruption across the final 5 moves before an Expert loss past 20 seconds \u2014 press-to-press tempo slows down, cross-board jumps rise ('
        + (preDeath.cruisingJumpPct ?? 0) + '% \u2192 ' + (preDeath.preDeathJumpPct ?? 0)
        + '%), and no-op clicks surge right before the fatal click. It proves late deaths come after flow breaks down, not from clicking too fast.',
      { label: 'Practice: Coach Scan shield', mode: 'coach-scan-shield' },
    );
  }
  nodes.push(grid);

  if (m && m.breakers && m.breakers.length > 0) {
    nodes.push(trainingElement('h3', 'training-coach-subhead', 'What breaks your flow (Expert wins)'));
    const breakerDefs = {
      noop: 'A click that changed nothing on the board, breaking a local counting burst and adding hesitation on the next move.',
      patternWall: 'Encountering an overlap, multi-clue, or guess square that cannot be solved by single-number counting.',
      localStall: 'Taking longer than 380 ms press-to-press on a nearby single-number counting move within 2 squares.',
      dryJump: 'Jumping 3+ squares across the board after clearing the last simple counting-safe move in the current area.',
      jumpPastSafe: 'Jumping 3+ squares away while at least one simple counting-safe move still remained within 2 squares.',
      postOpen: 'Pausing to scan the newly exposed border right after a click floods open 6 or more squares.',
    };
    nodes.push(trainingTable(
      [
        { text: 'cause of chunk break' },
        { text: 'plain-English meaning' },
        { text: 'breaks/win' },
        { text: 'time (s/win)' },
      ],
      m.breakers.map((b) => ({
        className: b.secPerWin >= 10 ? 'training-waste' : '',
        cells: [b.label, breakerDefs[b.id] || '', b.perWin.toFixed(1), b.secPerWin.toFixed(1)],
      })),
      [2, 3],
    ));
  }
  return nodes;
}

function renderTrainingSkillDrillMatrix(data) {
  const nodes = [];
  nodes.push(trainingElement('h3', 'training-coach-subhead',
    'Monitored training modes & subgames for each identified skill'));
  nodes.push(trainingElement('p', 'training-inline-def',
    'Every skill identified by your trace mind-map has a monitored, scored practice mode or sub-board drill below. Practicing in Coach modes tracks transfer into Standard Expert automatically; practicing in sub-board drills on the problems page records your reaction time, follow-up tempo, cursor path ratio, and accuracy across rounds.'));

  const sd = problemsDrillSummary.skillDrills || {};
  const fmtDrill = (id) => {
    const rec = sd[id];
    if (!rec || !rec.attempts) return 'not tried yet';
    const pct = Math.round(100 * (rec.solved || 0) / rec.attempts);
    const med = rec.medianMs ? ', ' + Math.round(rec.medianMs) + ' ms med' : '';
    return rec.solved + '/' + rec.attempts + ' (' + pct + '%' + med + ')';
  };
  const coachGamesOf = (modeId) => {
    if (!latestTrainingSummary || !latestTrainingSummary.coaching) return 0;
    const found = latestTrainingSummary.coaching.practice.byMode.find((r) => r.mode === modeId);
    return found ? found.games : 0;
  };

  const m = data.mentation;
  const expEnd = data.endgame && data.endgame.Expert;
  const pre = data.preDeath;
  const expTechs = new Map((data.techniques.Expert || []).map((t) => [t.id, t]));
  const noflag = expTechs.get('reveal-counting-noflag');
  const int12 = expTechs.get('flag-1-2-interior') || expTechs.get('flag-edge-1-2-1');
  const exh4 = expTechs.get('flag-exh-4-partial');

  const skillRows = [
    {
      skill: '1. No-ops & 1.5-click economy',
      what: 'Cut habit test-chords and chain right-press flag -> slide -> left-click chord in one motion (202 ms press-to-press).',
      now: data.noops && data.counts.Expert > 0
        ? (data.noops.total / data.counts.Expert).toFixed(1) + ' no-ops/win'
        : '\u2013',
      target: '<5 no-ops/win',
      monitored: coachGamesOf('coach-no-waste') + ' Coach games \u00b7 ' + problemsDrillSummary.lastFlagSolved + ' Last-flag solved',
      action: { label: 'Last-flag & No-waste', href: 'problems.html#problems-drill' },
    },
    {
      skill: '2. Endgame direct finishing (no pointless flags)',
      what: 'In the final 5 safe squares, left-click remaining safe squares directly instead of placing unused or 1-square-only flags.',
      now: expEnd ? expEnd.withEnd5Pct + '% of wins (' + expEnd.end5SecPerWin.toFixed(1) + ' s/win)' : '\u2013',
      target: '<15% of wins',
      monitored: fmtDrill('endgame-finish'),
      action: { label: 'Start Endgame finish drill', href: 'problems.html?drill=endgame-finish#mentation-drills' },
    },
    {
      skill: '3. Late-game survival & pre-death flow reset',
      what: 'Recognize pre-death slowdown and no-op spikes past 20 s; pause and scan for a proven-safe move before clicking.',
      now: pre ? pre.safeAvailablePct + '% died with safe move open (' + (pre.cruisingMedMs ?? '\u2013') + '\u2192' + (pre.fatalMedMs ?? '\u2013') + ' ms)' : '\u2013',
      target: '<35% avoidable',
      monitored: coachGamesOf('coach-scan-shield') + ' Scan shield games',
      action: { label: 'Launch Coach: Scan shield', mode: 'coach-scan-shield' },
    },
    {
      skill: '4. Bail-first on slow shapes when easy moves wait',
      what: 'Spot within 450 ms whether a cluttered frontier is a slow overlap shape while 2+ easy counting moves sit open elsewhere.',
      now: int12 ? (int12.freshMs ?? int12.medMs) + ' ms fresh (' + int12.easyPct + '% easy elsewhere)' : '\u2013',
      target: 'Bail <450 ms or solve',
      monitored: fmtDrill('bail-shape') + ' \u00b7 ' + coachGamesOf('coach-early-bail') + ' Coach games',
      action: { label: 'Start Bail-vs-solve drill', href: 'problems.html?drill=bail-shape#mentation-drills' },
    },
    {
      skill: '5. Cluttered no-flag counting chunks',
      what: 'Open 2\u20134 direct counting-safe squares in a cluttered 10x10 sub-board without flagging first or making no-op clicks.',
      now: noflag ? (noflag.freshMs ?? noflag.medMs) + ' ms fresh / ' + (noflag.queuedMs ?? '\u2013') + ' ms queued' : '\u2013',
      target: '<420 ms fresh, <250 ms follow',
      monitored: fmtDrill('cluttered-counting'),
      action: { label: 'Start Cluttered counting drill', href: 'problems.html?drill=cluttered-counting#mentation-drills' },
    },
    {
      skill: '6. Ready 4, 5, 6, and 7 pop-out scan',
      what: 'Immediately spot and flag+chord a partially-flagged 4/5/6/7 whose remaining covered neighbors are all mines.',
      now: exh4 ? (exh4.freshMs ?? exh4.medMs) + ' ms when seen' : '\u2013',
      target: '<10% skipped, <550 ms',
      monitored: fmtDrill('ready-high'),
      action: { label: 'Start Ready 4/5/6/7 drill', href: 'problems.html?drill=ready-high#mentation-drills' },
    },
    {
      skill: '7. Two-area eyes-ahead lookahead transition',
      what: 'Look ahead to the second work area while clicking the final square of the first area so your cursor departs within 60 ms.',
      now: m && m.eyesAheadPct !== null ? m.eyesAheadPct + '% eyes-ahead (' + (m.dryJumpMedMs ?? '\u2013') + ' ms jump)' : '\u2013',
      target: '35%+ eyes-ahead',
      monitored: fmtDrill('eyes-ahead'),
      action: { label: 'Start Eyes-ahead jump drill', href: 'problems.html?drill=eyes-ahead#mentation-drills' },
    },
    {
      skill: '8. Eyes-first anti-drift reading',
      what: 'Read cluttered clues with the eyes before moving the mouse so cursor path ratio stays <= 1.25x straight-line distance.',
      now: m ? m.slowOnClueSec.toFixed(1) + ' s/win (' + (m.localDriftRatio ? m.localDriftRatio.toFixed(1) + '\u00d7 drift' : '\u2013') + ')' : '\u2013',
      target: '<= 1.25x path ratio',
      monitored: fmtDrill('anti-drift'),
      action: { label: 'Start Anti-drift reading drill', href: 'problems.html?drill=anti-drift#mentation-drills' },
    },
  ];

  const table = trainingElement('table', 'training-table');
  const head = table.createTHead().insertRow();
  [
    { text: 'skill & what it trains' },
    { text: 'your Expert trace now', num: true },
    { text: 'target', num: true },
    { text: 'monitored drill progress' },
    { text: 'launch' },
  ].forEach((col) => {
    const th = trainingElement('th', col.num ? 'training-number' : '', col.text);
    th.scope = 'col';
    head.appendChild(th);
  });
  const body = table.createTBody();
  for (const r of skillRows) {
    const tr = body.insertRow();
    const skillTd = trainingElement('td', '');
    skillTd.append(
      trainingElement('div', 'training-trait-title', r.skill),
      trainingElement('div', 'training-trait-def', r.what),
    );
    const nowTd = trainingElement('td', 'training-number', r.now);
    const targetTd = trainingElement('td', 'training-number', r.target);
    const monTd = trainingElement('td', '', r.monitored);
    const actTd = trainingElement('td', '');
    actTd.appendChild(createDrillActionControl(r.action));
    tr.append(skillTd, nowTd, targetTd, monTd, actTd);
  }
  nodes.push(table);
  return nodes;
}

function renderTrainingMindMap(data) {
  renderTrainingHighlightsAndTraits(data);

  const section = document.getElementById('training-mind-map');
  const content = document.getElementById('training-mind-map-content');
  const nodes = [];

  // 0) Mentation profile (how thinking, scanning, chunking, cursor reading, and pre-death breakdown unfold)
  nodes.push(...renderTrainingMentation(data.mentation, data.preDeath));

  // 0b) Monitored training modes & subgames for each identified skill
  nodes.push(...renderTrainingSkillDrillMatrix(data));

  // 1) Technique speed catalog with inline classic visual diagrams + size filter
  nodes.push(trainingElement('h3', 'training-coach-subhead',
    'Technique speed & skip-first map (press-to-press, pooled across ' + data.counts.all + ' traced Standard wins)'));
  nodes.push(trainingElement('p', 'training-inline-def',
    'Column definitions: fresh (ms) = press-to-press median when the square first became provable from your immediately preceding click (true on-the-spot recognition, local move, no detour or no-op); queued (ms) = press-to-press median when the square was already provable 1\u20133 clicks earlier in the same local area (execution inside an already-read cluster); all (ms) = overall press-to-press median across all non-post-no-op moves; easy elsewhere (%) = share of moves where 2+ simple single-number counting moves sat open at least 3 squares away; bail first = slow solvable shape (450 ms+ fresh) where easy counting moves usually wait elsewhere.'));

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
      { text: 'technique & rule' },
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

      const nameTd = trainingElement('td', '');
      nameTd.appendChild(trainingElement('div', 'training-trait-title', r.label));
      if (r.help) {
        nameTd.appendChild(trainingElement('div', 'training-trait-def', r.help));
      }
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
    nodes.push(trainingElement('p', 'training-inline-def',
      'Definition: a pointless endgame flag is a flag placed when 5 or fewer safe squares remain on the board that either never gets used by any chord or is used only by a 1-square chord (where left-clicking that 1 safe square directly costs the same 1 click without needing a flag).'));
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
    nodes.push(trainingElement('p', 'training-inline-def',
      'Click "Inspect on full board" on any episode below to jump the interactive Mentation Replay Inspector straight to that exact move, view the full board and cursor trail, check whether the model\u2019s interpretation matches your thinking, and record your verdict.'));
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
        if (typeof ep.stepIndex === 'number') {
          const jumpBtn = trainingElement('button', 'training-crop-toggle', 'Inspect on full board \u2193');
          jumpBtn.type = 'button';
          jumpBtn.addEventListener('click', () => {
            if (typeof inspectorJumpHandler === 'function') {
              inspectorJumpHandler(g.endedAt, ep.stepIndex);
            }
          });
          row.appendChild(jumpBtn);
        }
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

//-------INTERACTIVE MENTATION REPLAY INSPECTOR & GROUND-TRUTH CALIBRATION-------

const INSPECTOR_FEEDBACK_REASONS = [
  { id: 'eyes-elsewhere', label: 'Eyes were looking elsewhere on the board' },
  { id: 'hand-slip', label: 'Already knew the move \u2014 hand or mouse slip' },
  { id: 'checking-counter', label: 'Checking mine count or top bar' },
  { id: 'genuinely-calculating', label: 'Genuinely calculating this pattern' },
  { id: 'planned-order', label: 'Intentionally deferred / planned click order' },
  { id: 'missed-easier-area', label: 'Did not notice the easier counting area' },
  { id: 'outside-distraction', label: 'Momentary pause or distraction outside the board' },
];

const INSPECTOR_CLAIM_LABELS = {
  'eyes-ahead': 'Eyes-ahead lookahead jump',
  'dry-jump-search': 'Post-click search on dry jump',
  'slow-bail': 'Bail-first on slow shape while easy moves waited',
  'fresh-deduction': 'Fresh pattern deduction (age = 0)',
  'queued-execution': 'Queued move (age 1\u20133 clicks)',
  'fluent-chunk': 'Fluent local counting burst',
  'cursor-drift': 'Slow cursor reading over open clues',
  'mid-flight-detour': 'Mid-flight detour to a third area',
  'abandoned-hover': 'Abandoned frontier hover',
  'noop-habit': 'Habit / checking no-op click',
  'noop-physical': 'Physical / aim slip no-op click',
  'endgame-flag': 'Pointless endgame flag',
  'pre-death-breakdown': 'Pre-death flow breakdown move',
};

function renderInspectorScoreboard(container) {
  const entries = Object.values(mentationFeedbackState.entries || {});
  const total = entries.length;
  const accurate = entries.filter((e) => e.verdict === 'accurate').length;
  const partly = entries.filter((e) => e.verdict === 'partly').length;
  const wrong = entries.filter((e) => e.verdict === 'wrong').length;
  const gamesSet = new Set(entries.map((e) => e.endedAt));

  const box = trainingElement('div', 'training-inspector-scoreboard');
  const head = trainingElement('div', 'training-inspector-score-head');
  const title = trainingElement('h3', 'training-coach-subhead',
    'Model accuracy & ground-truth calibration scoreboard (model: mentation-v1)');
  head.appendChild(title);

  const summaryText = total === 0
    ? 'Base-case calibration status: 0 moves reviewed so far. Step through any game below (or click "Next flagged episode") and mark whether the model\u2019s interpretation is Accurate, Partly right, or Wrong. Once you label 20\u201340 episodes across 3\u20135 games, click "Export feedback JSON" or "Copy feedback summary for chat" to share the data so we can calibrate mentation-v2.'
    : 'Reviewed ' + total + (total === 1 ? ' move' : ' moves') + ' across ' + gamesSet.size
      + (gamesSet.size === 1 ? ' game' : ' games') + ' \u00b7 '
      + Math.round(100 * accurate / total) + '% Accurate (' + accurate + ') \u00b7 '
      + Math.round(100 * partly / total) + '% Partly right (' + partly + ') \u00b7 '
      + Math.round(100 * wrong / total) + '% Wrong (' + wrong + ')';
  const summaryPara = trainingElement('p', 'training-inspector-score-summary', summaryText);

  const actionsRow = trainingElement('div', 'training-filter-row');
  const exportBtn = trainingElement('button', 'training-filter-btn', 'Export feedback JSON (mentation-feedback.json)');
  exportBtn.type = 'button';
  const downloadLink = trainingElement('a', '', '');
  downloadLink.hidden = true;
  const copyBtn = trainingElement('button', 'training-filter-btn', 'Copy feedback summary for chat');
  copyBtn.type = 'button';
  const importLabel = trainingElement('label', 'training-filter-btn', 'Import feedback JSON ');
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.hidden = true;
  importLabel.appendChild(importInput);
  const actionStatus = trainingElement('span', 'training-game-meta', '');

  exportBtn.addEventListener('click', () => {
    const payload = {
      format: 'minesweeper-friendly-mentation-feedback',
      formatVersion: 1,
      modelVersion: 'mentation-v1',
      exportedAt: Date.now(),
      totals: {
        reviewed: total,
        games: gamesSet.size,
        accurate,
        partly,
        wrong,
        accuratePct: total > 0 ? Math.round(100 * accurate / total) : null,
      },
      entries: Object.values(mentationFeedbackState.entries || {}).sort((a, b) => a.endedAt - b.endedAt || a.stepIndex - b.stepIndex),
    };
    if (downloadLink.href) URL.revokeObjectURL(downloadLink.href);
    downloadLink.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    downloadLink.download = 'mentation-feedback-' + new Date().toISOString().slice(0, 10) + '.json';
    downloadLink.click();
    actionStatus.textContent = 'Exported ' + total + ' labeled episodes.';
  });

  copyBtn.addEventListener('click', async () => {
    const list = Object.values(mentationFeedbackState.entries || {}).sort((a, b) => a.endedAt - b.endedAt || a.stepIndex - b.stepIndex);
    const lines = [
      `Mentation calibration feedback (mentation-v1): ${total} moves across ${gamesSet.size} games — ${accurate} Accurate, ${partly} Partly right, ${wrong} Wrong.`,
      ...list.map((e) => `- [${e.verdict.toUpperCase()}] game ${e.endedAt} step #${e.stepIndex} (${(e.atMs / 1000).toFixed(1)}s, ${e.claimType}): "${e.claimHeadline}"`
        + (e.reasons && e.reasons.length > 0 ? ` | reasons: ${e.reasons.join(', ')}` : '')
        + (e.note ? ` | note: ${e.note}` : '')),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      actionStatus.textContent = 'Copied ' + total + ' labeled episodes to clipboard.';
    } catch (_err) {
      actionStatus.textContent = 'Use Export feedback JSON to save the file.';
    }
  });

  importInput.addEventListener('change', async () => {
    const [file] = importInput.files;
    importInput.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed.entries) ? parsed.entries : [];
      let added = 0;
      for (const item of incoming) {
        if (!item || typeof item.endedAt !== 'number' || typeof item.stepIndex !== 'number') continue;
        const key = item.endedAt + ':' + item.stepIndex;
        mentationFeedbackState.entries[key] = item;
        added++;
      }
      saveMentationFeedback();
      renderInspectorScoreboard(container);
      actionStatus.textContent = 'Imported ' + added + ' feedback entries.';
    } catch (err) {
      actionStatus.textContent = 'Import failed: ' + err.message;
    }
  });

  actionsRow.append(exportBtn, downloadLink, copyBtn, importLabel, actionStatus);
  box.append(head, summaryPara, actionsRow);

  if (total > 0) {
    const byType = new Map();
    for (const e of entries) {
      const k = e.claimType || 'other';
      if (!byType.has(k)) byType.set(k, { total: 0, accurate: 0, partly: 0, wrong: 0, reasons: {} });
      const b = byType.get(k);
      b.total++;
      if (e.verdict === 'accurate') b.accurate++;
      else if (e.verdict === 'partly') b.partly++;
      else if (e.verdict === 'wrong') b.wrong++;
      for (const r of e.reasons || []) b.reasons[r] = (b.reasons[r] || 0) + 1;
    }
    const rows = [...byType.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([typeId, b]) => {
        const topReason = Object.entries(b.reasons).sort((x, y) => y[1] - x[1])[0];
        const reasonLabel = topReason
          ? (INSPECTOR_FEEDBACK_REASONS.find((r) => r.id === topReason[0])?.label || topReason[0]) + ' (' + topReason[1] + ')'
          : '\u2013';
        return {
          className: b.wrong > b.accurate ? 'training-unmet' : b.accurate === b.total ? 'training-met' : '',
          cells: [
            INSPECTOR_CLAIM_LABELS[typeId] || typeId,
            String(b.total),
            Math.round(100 * b.accurate / b.total) + '% (' + b.accurate + ')',
            Math.round(100 * b.partly / b.total) + '% (' + b.partly + ')',
            Math.round(100 * b.wrong / b.total) + '% (' + b.wrong + ')',
            reasonLabel,
          ],
        };
      });
    box.appendChild(trainingTable(
      [
        { text: 'mentation claim type' },
        { text: 'reviewed' },
        { text: 'accurate' },
        { text: 'partly right' },
        { text: 'wrong' },
        { text: 'most frequent correction reason' },
      ],
      rows,
      [1, 2, 3, 4],
    ));
  }

  container.replaceChildren(box);
}

function renderTrainingInspector(data) {
  const section = document.getElementById('training-inspector');
  const content = document.getElementById('training-inspector-content');
  if (!section || !content) return;

  const games = data.inspectableGames || [];
  if (games.length === 0) {
    section.hidden = true;
    return;
  }

  const lead = trainingElement('p', 'training-inline-def',
    'Step through any traced win or late loss below to see the exact board state before each click, the bevel-calibrated cursor path (red-orange = hover < 2 squares/s, blue = slow drift 2\u201310 squares/s, green = fast flight 10+ squares/s), and what the mentation model claims you were thinking. Mark each claim Accurate, Partly right, or Wrong to track model accuracy over time and generate calibration data.');

  const scoreboardSlot = trainingElement('div', '');
  renderInspectorScoreboard(scoreboardSlot);

  // Game selector & transport bar
  const topBar = trainingElement('div', 'training-inspector-topbar');
  const gameSelect = trainingElement('select', 'training-game-picker');
  gameSelect.id = 'inspector-game-select';
  gameSelect.setAttribute('aria-label', 'Choose a traced game to inspect on the full board');
  games.forEach((g, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    const outcomeTag = g.outcome === 'loss' ? 'LOSS at ' : 'WIN ';
    opt.textContent = g.spec.level + ' ' + outcomeTag + (g.timeMs / 1000).toFixed(1) + ' s \u00b7 '
      + trainingDate(g.endedAt) + ' (' + g.bvs.toFixed(2) + ' 3BV/s, 3BV ' + g.bv3 + ')';
    gameSelect.appendChild(opt);
  });

  const transport = trainingElement('div', 'training-inspector-transport');
  const mkBtn = (text, title) => {
    const b = trainingElement('button', 'training-filter-btn', text);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  };
  const firstBtn = mkBtn('|<< First', 'First move');
  const prevFlagBtn = mkBtn('<< Prev flagged', 'Previous notable mentation episode');
  const prevBtn = mkBtn('< Prev', 'Previous move');
  const playBtn = mkBtn('Play', 'Play move by move');
  const nextBtn = mkBtn('Next >', 'Next move');
  const nextFlagBtn = mkBtn('Next flagged >>', 'Next notable mentation episode');
  const lastBtn = mkBtn('Last >>|', 'Final move');

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'training-inspector-slider';
  slider.min = '0';
  slider.max = '0';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Move index in inspected game');

  const INSPECTOR_TILE_CHOICES = [16, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64];
  let tilePx = Number.isInteger(mentationFeedbackState.tilePx) && INSPECTOR_TILE_CHOICES.includes(mentationFeedbackState.tilePx)
    ? mentationFeedbackState.tilePx
    : (INSPECTOR_TILE_CHOICES.includes(playerGameCellSize) ? playerGameCellSize : 28);

  const sizeWrap = trainingElement('label', 'training-game-meta', 'Square size ');
  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'training-game-select';
  sizeSelect.setAttribute('aria-label', 'Inspector board square size');
  for (const sz of INSPECTOR_TILE_CHOICES) {
    const opt = document.createElement('option');
    opt.value = String(sz);
    opt.textContent = sz + ' px' + (sz === playerGameCellSize ? ' (game)' : '');
    opt.selected = sz === tilePx;
    sizeSelect.appendChild(opt);
  }
  sizeWrap.appendChild(sizeSelect);

  const stepReadout = trainingElement('span', 'training-game-meta', 'Loading trace\u2026');
  transport.append(firstBtn, prevFlagBtn, prevBtn, playBtn, nextBtn, nextFlagBtn, lastBtn, slider, sizeWrap, stepReadout);
  topBar.append(gameSelect, transport);

  // Main 2-column stage: Left = Full board + cursor canvas + legend; Right = Claim & Ground-Truth Verdict Card
  const stage = trainingElement('div', 'training-inspector-stage');
  const boardCol = trainingElement('div', 'training-inspector-board-col');
  const boardWrap = trainingElement('div', 'training-inspector-board-wrap');
  const boardEl = trainingElement('div', 'training-mini-board training-inspector-board');
  const canvasEl = document.createElement('canvas');
  canvasEl.className = 'training-inspector-canvas';
  boardWrap.append(boardEl, canvasEl);

  const legend = trainingElement('p', 'training-key-line');
  legend.innerHTML = '<strong>Board &amp; cursor key:</strong> '
    + '<span class="training-key-chip training-key-safe"></span>target / newly opened '
    + '<span class="training-key-chip training-key-mine"></span>flag / mine '
    + '<span class="training-key-chip training-key-chord"></span>chord / counting-safe open elsewhere '
    + '<span class="training-key-chip training-key-guess"></span>detour / abandoned hover '
    + ' \u00b7 <strong>Cursor trail:</strong> red-orange = hover (&lt;2 sq/s), blue = slow drift (2\u201310 sq/s), green = fast flight (10+ sq/s), O = start, X = click';
  boardCol.append(boardWrap);

  const claimCol = trainingElement('div', 'training-inspector-claim-col');
  stage.append(boardCol, claimCol);

  content.replaceChildren(lead, scoreboardSlot, topBar, legend, stage);
  section.dataset.status = 'ready';
  section.hidden = false;

  let currentInspection = null;
  let currentStepIdx = 0;
  let playTimer = null;
  let tileEls = [];

  sizeSelect.addEventListener('change', () => {
    const nextSz = Number(sizeSelect.value);
    if (!INSPECTOR_TILE_CHOICES.includes(nextSz)) return;
    tilePx = nextSz;
    mentationFeedbackState.tilePx = tilePx;
    saveMentationFeedback();
    boardEl.style.setProperty('--insp-tile', tilePx + 'px');
    drawStep(currentStepIdx);
  });

  const stopPlay = () => {
    if (playTimer !== null) {
      clearTimeout(playTimer);
      playTimer = null;
      playBtn.textContent = 'Play';
    }
  };

  const drawStep = (idx) => {
    if (!currentInspection || currentInspection.steps.length === 0) return;
    currentStepIdx = Math.max(0, Math.min(currentInspection.steps.length - 1, idx));
    slider.value = String(currentStepIdx);
    const step = currentInspection.steps[currentStepIdx];
    const { width, height } = currentInspection.board;
    const flagMarkup = typeof flagSvg === 'function' ? flagSvg('classic', 100) : 'F';

    stepReadout.textContent = 'Move ' + (currentStepIdx + 1) + ' of ' + currentInspection.steps.length
      + ' \u00b7 ' + (step.atMs / 1000).toFixed(2) + ' s'
      + ' \u00b7 ' + step.remSafe + ' safe left'
      + (step.isFlaggedEpisode ? ' \u00b7 [flagged episode]' : '');

    // Rebuild board grid if dimensions changed
    boardEl.style.setProperty('--insp-tile', tilePx + 'px');
    if (tileEls.length !== width * height) {
      boardEl.style.setProperty('--insp-w', String(width));
      boardEl.style.setProperty('--insp-h', String(height));
      tileEls = [];
      boardEl.replaceChildren();
      for (let i = 0; i < width * height; i++) {
        const cell = trainingElement('span', 'training-mini-tile');
        cell.addEventListener('click', () => {
          // Clicking a square jumps to the first step that acted on that square
          if (!currentInspection) return;
          const hit = currentInspection.steps.findIndex((st, sIdx) => sIdx > currentStepIdx && st.index === i);
          const anyHit = hit !== -1 ? hit : currentInspection.steps.findIndex((st) => st.index === i);
          if (anyHit !== -1) {
            stopPlay();
            drawStep(anyHit);
          }
        });
        boardEl.appendChild(cell);
        tileEls.push(cell);
      }
    }

    const openedSet = new Set(step.openedCells || []);
    const countingSafeSet = new Set(step.countingSafeCells || []);
    const overlapSafeSet = new Set(step.overlapSafeCells || []);

    for (let i = 0; i < width * height; i++) {
      const tile = tileEls[i];
      tile.className = 'training-mini-tile';
      tile.textContent = '';
      tile.innerHTML = '';
      if (step.revealedBefore[i]) {
        tile.classList.add('training-mini-open');
        const num = step.adjacent[i] || 0;
        if (num > 0) {
          tile.classList.add('training-mini-n' + num);
          tile.textContent = String(num);
        }
      } else if (step.flaggedBefore[i]) {
        tile.classList.add('training-mini-covered');
        tile.innerHTML = flagMarkup;
      } else {
        tile.classList.add('training-mini-covered');
        if (openedSet.has(i) && i !== step.index) {
          tile.classList.add('training-insp-opened');
        } else if (countingSafeSet.has(i) && i !== step.index) {
          tile.classList.add('training-insp-easy-safe');
        } else if (overlapSafeSet.has(i) && i !== step.index) {
          tile.classList.add('training-insp-overlap-safe');
        }
      }
      if (i === step.index) {
        const markKind = step.kind === 'flag' || step.kind === 'unflag' ? 'mine'
          : (step.kind === 'chord-multi' || step.kind === 'chord-single') ? 'chord'
            : step.kind.startsWith('noop-') ? 'guess' : 'safe';
        tile.classList.add('training-mini-mark', 'training-mini-mark-' + markKind);
      }
    }

    // Draw cursor trajectory on overlay canvas
    const dpr = window.devicePixelRatio || 1;
    const cw = width * tilePx;
    const ch = height * tilePx;
    canvasEl.width = cw * dpr;
    canvasEl.height = ch * dpr;
    canvasEl.style.width = cw + 'px';
    canvasEl.style.height = ch + 'px';
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const pts = step.cursor && step.cursor.points ? step.cursor.points : [];
    if (pts.length >= 2) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        ctx.beginPath();
        ctx.moveTo(p0.x * tilePx, p0.y * tilePx);
        ctx.lineTo(p1.x * tilePx, p1.y * tilePx);
        ctx.lineWidth = p1.band === 'hover' ? 3.2 : p1.band === 'drift' ? 2.4 : 1.8;
        ctx.strokeStyle = p1.band === 'hover'
          ? 'rgba(210, 45, 25, 0.92)'
          : p1.band === 'drift'
            ? 'rgba(25, 105, 210, 0.88)'
            : 'rgba(20, 150, 60, 0.78)';
        ctx.stroke();
      }
      // Start point 'O'
      const s0 = pts[0];
      ctx.beginPath();
      ctx.arc(s0.x * tilePx, s0.y * tilePx, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      // End click point 'X'
      const sEnd = pts[pts.length - 1];
      const ex = sEnd.x * tilePx;
      const ey = sEnd.y * tilePx;
      ctx.beginPath();
      ctx.moveTo(ex - 4, ey - 4);
      ctx.lineTo(ex + 4, ey + 4);
      ctx.moveTo(ex + 4, ey - 4);
      ctx.lineTo(ex - 4, ey + 4);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }

    if (step.cursor && step.cursor.detourSpot) {
      const ds = step.cursor.detourSpot;
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.arc(ds.x * tilePx, ds.y * tilePx, tilePx * 0.85, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b45f06';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (step.cursor && step.cursor.abandonedHover) {
      const ah = step.cursor.abandonedHover;
      const ax = ((ah.anchorCell % width) + 0.5) * tilePx;
      const ay = (Math.floor(ah.anchorCell / width) + 0.5) * tilePx;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.arc(ax, ay, tilePx * 0.95, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6e22a8';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Render Right Column: Move Kinematics + Model Claim Card + Ground-Truth Verdict Form
    const claimNodes = [];
    const ageText = step.ageSteps === 0 ? 'fresh (0 steps old)'
      : step.ageSteps > 0 ? 'queued (' + step.ageSteps + (step.ageSteps === 1 ? ' step' : ' steps') + ' old)'
        : 'n/a';
    const kinText = [
      'Action: ' + step.kind + ' at col ' + step.col + ', row ' + step.row,
      'Press-to-press: ' + (step.pressGapMs !== null ? step.pressGapMs + ' ms' : 'start'),
      step.cursor.departMs !== null ? 'Departure: ' + step.cursor.departMs + ' ms' : '',
      step.cursor.preDownHoverMs !== null ? 'Pre-press hover: ' + step.cursor.preDownHoverMs + ' ms' : '',
      step.holdMs !== null ? 'Button hold: ' + step.holdMs + ' ms' : '',
      'Move distance: ' + step.dist + ' sq',
      step.cursor.pathRatio !== null ? 'Path ratio: ' + step.cursor.pathRatio.toFixed(2) + '\u00d7' : '',
      'Info age: ' + ageText,
      'Easy counting elsewhere: ' + step.easyElsewhere,
    ].filter(Boolean).join(' \u00b7 ');
    claimNodes.push(trainingElement('p', 'training-inspector-kinematics', kinText));

    for (const c of step.claims) {
      const cBox = trainingElement('div', 'training-inspector-claim-card');
      cBox.append(
        trainingElement('div', 'training-trait-title', 'Model claim (' + c.modelVersion + ' \u00b7 ' + c.typeLabel + '): ' + c.headline),
        trainingElement('p', 'training-inspector-claim-detail', c.detail),
      );
      if (c.typeDefinition) {
        cBox.appendChild(trainingElement('p', 'training-trait-def', 'Term definition: ' + c.typeDefinition));
      }
      claimNodes.push(cBox);
    }

    // Ground-Truth Verdict & Correction Form
    const fbKey = currentInspection.endedAt + ':' + step.stepIndex;
    const existing = mentationFeedbackState.entries[fbKey] || null;
    const primary = step.primaryClaim || {
      modelVersion: 'mentation-v1',
      claimType: step.tier || 'other',
      headline: step.techLabel + ' (' + (step.pressGapMs ?? 0) + ' ms)',
    };

    const fbBox = trainingElement('div', 'training-inspector-feedback-box');
    fbBox.appendChild(trainingElement('div', 'training-trait-title',
      'Check & calibrate: did the model understand what you were thinking on this move?'));

    const verdictRow = trainingElement('div', 'training-filter-row');
    const savedBadge = trainingElement('span', 'training-game-meta',
      existing ? 'Saved verdict: ' + existing.verdict.toUpperCase() : 'Not reviewed yet');

    let currentVerdict = existing ? existing.verdict : null;
    const selectedReasons = new Set(existing && Array.isArray(existing.reasons) ? existing.reasons : []);
    let noteInput = null;

    const persistCurrentFeedback = () => {
      if (!currentVerdict) return;
      mentationFeedbackState.entries[fbKey] = {
        endedAt: currentInspection.endedAt,
        level: currentInspection.level,
        outcome: currentInspection.outcome,
        stepIndex: step.stepIndex,
        atMs: step.atMs,
        kind: step.kind,
        col: step.col,
        row: step.row,
        pressGapMs: step.pressGapMs,
        dist: step.dist,
        ageSteps: step.ageSteps,
        easyElsewhere: step.easyElsewhere,
        pathRatio: step.cursor.pathRatio !== null ? Number(step.cursor.pathRatio.toFixed(2)) : null,
        detourMs: step.cursor.detourMs,
        slowOnClueMs: step.cursor.slowOnClueMs,
        departMs: step.cursor.departMs,
        preDownHoverMs: step.cursor.preDownHoverMs,
        modelVersion: primary.modelVersion || 'mentation-v1',
        claimType: primary.claimType,
        claimHeadline: primary.headline,
        verdict: currentVerdict,
        reasons: [...selectedReasons],
        note: noteInput ? noteInput.value.trim() : '',
        updatedAt: Date.now(),
      };
      saveMentationFeedback();
      savedBadge.textContent = 'Saved verdict: ' + currentVerdict.toUpperCase();
      renderInspectorScoreboard(scoreboardSlot);
    };

    const verdictButtons = [
      ['accurate', 'Accurate (model is right)'],
      ['partly', 'Partly right'],
      ['wrong', 'Wrong (misread my thinking)'],
    ].map(([vId, vLabel]) => {
      const btn = trainingElement('button', 'training-filter-btn', vLabel);
      btn.type = 'button';
      btn.dataset.verdict = vId;
      btn.setAttribute('aria-pressed', currentVerdict === vId ? 'true' : 'false');
      btn.addEventListener('click', () => {
        currentVerdict = vId;
        for (const b of verdictButtons) {
          b.setAttribute('aria-pressed', b.dataset.verdict === currentVerdict ? 'true' : 'false');
        }
        persistCurrentFeedback();
      });
      return btn;
    });
    verdictRow.append(...verdictButtons, savedBadge);

    const reasonsGrid = trainingElement('div', 'training-inspector-reasons');
    for (const r of INSPECTOR_FEEDBACK_REASONS) {
      const lbl = trainingElement('label', 'training-inspector-reason-label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedReasons.has(r.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedReasons.add(r.id);
        else selectedReasons.delete(r.id);
        if (!currentVerdict) {
          currentVerdict = 'partly';
          for (const b of verdictButtons) {
            b.setAttribute('aria-pressed', b.dataset.verdict === currentVerdict ? 'true' : 'false');
          }
        }
        persistCurrentFeedback();
      });
      lbl.append(cb, ' ' + r.label);
      reasonsGrid.appendChild(lbl);
    }

    noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'training-inspector-note';
    noteInput.placeholder = 'Optional note: what were you actually thinking or looking at on this move?';
    noteInput.value = existing && existing.note ? existing.note : '';
    noteInput.addEventListener('change', () => {
      if (!currentVerdict && noteInput.value.trim() !== '') {
        currentVerdict = 'partly';
        for (const b of verdictButtons) {
          b.setAttribute('aria-pressed', b.dataset.verdict === currentVerdict ? 'true' : 'false');
        }
      }
      persistCurrentFeedback();
    });

    fbBox.append(verdictRow, reasonsGrid, noteInput);
    claimNodes.push(fbBox);
    claimCol.replaceChildren(...claimNodes);
  };

  firstBtn.addEventListener('click', () => { stopPlay(); drawStep(0); });
  prevBtn.addEventListener('click', () => { stopPlay(); drawStep(currentStepIdx - 1); });
  nextBtn.addEventListener('click', () => { stopPlay(); drawStep(currentStepIdx + 1); });
  lastBtn.addEventListener('click', () => {
    stopPlay();
    if (currentInspection) drawStep(currentInspection.steps.length - 1);
  });
  prevFlagBtn.addEventListener('click', () => {
    stopPlay();
    if (!currentInspection) return;
    for (let i = currentStepIdx - 1; i >= 0; i--) {
      if (currentInspection.steps[i].isFlaggedEpisode) {
        drawStep(i);
        return;
      }
    }
    drawStep(0);
  });
  nextFlagBtn.addEventListener('click', () => {
    stopPlay();
    if (!currentInspection) return;
    for (let i = currentStepIdx + 1; i < currentInspection.steps.length; i++) {
      if (currentInspection.steps[i].isFlaggedEpisode) {
        drawStep(i);
        return;
      }
    }
    drawStep(currentInspection.steps.length - 1);
  });
  slider.addEventListener('input', () => {
    stopPlay();
    drawStep(Number(slider.value));
  });
  playBtn.addEventListener('click', () => {
    if (playTimer !== null) {
      stopPlay();
      return;
    }
    if (!currentInspection) return;
    if (currentStepIdx >= currentInspection.steps.length - 1) drawStep(0);
    playBtn.textContent = 'Pause';
    const tick = () => {
      if (!currentInspection || currentStepIdx >= currentInspection.steps.length - 1) {
        stopPlay();
        return;
      }
      drawStep(currentStepIdx + 1);
      const nextStep = currentInspection.steps[currentStepIdx + 1];
      const delay = nextStep && nextStep.pressGapMs ? Math.min(1200, Math.max(120, nextStep.pressGapMs)) : 300;
      playTimer = setTimeout(tick, delay);
    };
    playTimer = setTimeout(tick, 250);
  });

  const requestGameInspection = (gameIdx, targetStepIdx = null) => {
    stopPlay();
    const g = games[gameIdx];
    if (!g || !activeMindMapWorker || !activeDatabaseInfo) return;
    const reqId = ++inspectorRequestCounter;
    stepReadout.textContent = 'Reconstructing board & cursor trace\u2026';
    window._onMindMapInspectReply = (reply) => {
      if (reply.requestId !== reqId) return;
      if (reply.error) {
        stepReadout.textContent = reply.error;
        return;
      }
      currentInspection = reply.inspection;
      slider.max = String(Math.max(0, currentInspection.steps.length - 1));
      if (targetStepIdx !== null) {
        drawStep(targetStepIdx);
      } else {
        const firstFlagged = currentInspection.steps.findIndex((st) => st.isFlaggedEpisode);
        drawStep(firstFlagged !== -1 ? firstFlagged : 0);
      }
    };
    activeMindMapWorker.postMessage({
      action: 'inspect',
      requestId: reqId,
      database: activeDatabaseInfo,
      record: g,
      spec: g.spec,
    });
  };

  gameSelect.addEventListener('change', () => {
    requestGameInspection(Number(gameSelect.value), null);
  });

  inspectorJumpHandler = (endedAt, stepIndex) => {
    const idx = games.findIndex((g) => g.endedAt === endedAt);
    if (idx === -1) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (Number(gameSelect.value) === idx && currentInspection && currentInspection.endedAt === endedAt) {
      stopPlay();
      drawStep(stepIndex);
    } else {
      gameSelect.value = String(idx);
      requestGameInspection(idx, stepIndex);
    }
  };

  requestGameInspection(0, null);
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
