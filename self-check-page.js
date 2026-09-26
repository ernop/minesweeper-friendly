'use strict';

//-------THE SELF-CHECK PAGE (self-check.html)-------

// A frozen reference check for comparison over years: a sleepiness rating
// paired with a 3-minute alertness test (docs/product/self-check.md). While
// the test runs the page shows only the test box and does no other work, so
// nothing competes with the frame that displays each stimulus.

const selfCheckStatus = document.getElementById('self-check-status');
const selfCheckSections = {
  start: document.getElementById('self-check-start'),
  checkin: document.getElementById('self-check-checkin'),
  instructions: document.getElementById('self-check-instructions'),
  test: document.getElementById('self-check-test'),
  result: document.getElementById('self-check-result'),
  history: document.getElementById('self-check-history'),
  transfer: document.getElementById('self-check-transfer'),
};
const SELF_CHECK_VIEWS = {
  home: ['start', 'history', 'transfer'],
  checkin: ['checkin'],
  instructions: ['instructions'],
  test: ['test'],
  result: ['result', 'start', 'history', 'transfer'],
};

let selfChecks = [];      // every stored check, oldest first
let selfCheckView = null;
let pendingCheck = null;  // the check being taken: identity, context, answers
let vigilanceRun = null;  // the running test's live state

function storageFailure(what) {
  selfCheckStatus.hidden = false;
  selfCheckStatus.textContent = what;
  throw new Error(what);
}

function showSelfCheckView(view) {
  selfCheckView = view;
  for (const [name, section] of Object.entries(selfCheckSections)) {
    const shown = SELF_CHECK_VIEWS[view].includes(name)
      && (name !== 'history' || selfChecks.length > 0);
    section.hidden = !shown;
  }
  document.body.classList.toggle('vigilance-running', view === 'test');
}

function userdataReady() {
  const request = db.transaction(SELF_CHECK_STORE).objectStore(SELF_CHECK_STORE).getAll();
  request.onerror = () => storageFailure('self-checks failed to load: ' + request.error);
  request.onsuccess = () => {
    const malformed = request.result.find((check) => !validSelfCheck(check));
    if (malformed !== undefined) {
      storageFailure('stored self-check ' + malformed.startedAt + ' is malformed');
    }
    selfChecks = request.result;
    renderSelfCheckHistory();
    showSelfCheckView('home');
    loadArchive(renderSelfCheckArchive);
  };
}

//-------CHECK-IN (sleepiness rating and optional context)-------

const sleepinessChoices = document.getElementById('sleepiness-choices');
const sleepHoursInput = document.getElementById('self-check-sleep-hours');
const noteInput = document.getElementById('self-check-note');
const checkinError = document.getElementById('self-check-checkin-error');
const checkinContinue = document.getElementById('self-check-checkin-continue');

document.getElementById('sleepiness-question').textContent = SLEEPINESS_SCALE.question;
SLEEPINESS_SCALE.labels.forEach((label, i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sleepiness-choice';
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', 'false');
  button.dataset.rating = String(i + 1);
  const number = document.createElement('b');
  number.textContent = String(i + 1);
  const text = document.createElement('span');
  text.textContent = label;
  button.append(number, text);
  button.addEventListener('click', () => selectSleepiness(i + 1));
  sleepinessChoices.appendChild(button);
});

function selectSleepiness(rating) {
  pendingCheck.sleepinessRating = rating;
  for (const button of sleepinessChoices.children) {
    button.setAttribute('aria-checked', String(Number(button.dataset.rating) === rating));
  }
  checkinContinue.disabled = false;
}

function beginSelfCheck(occasion) {
  const startedAt = Date.now();
  pendingCheck = { startedAt, ...observedTimeZone(startedAt), occasion, sleepinessRating: null };
  for (const button of sleepinessChoices.children) button.setAttribute('aria-checked', 'false');
  sleepHoursInput.value = '';
  noteInput.value = '';
  checkinError.hidden = true;
  checkinContinue.disabled = true;
  showSelfCheckView('checkin');
}

function cancelSelfCheck() {
  pendingCheck = null;
  showSelfCheckView('home');
}

document.getElementById('self-check-start-routine').addEventListener('click', () => beginSelfCheck('routine'));
document.getElementById('self-check-start-extra').addEventListener('click', () => beginSelfCheck('extra'));
document.getElementById('self-check-checkin-cancel').addEventListener('click', cancelSelfCheck);
document.getElementById('vigilance-cancel').addEventListener('click', cancelSelfCheck);

checkinContinue.addEventListener('click', () => {
  const hoursText = sleepHoursInput.value.trim();
  const hours = Number(hoursText);
  if (sleepHoursInput.validity.badInput
      || (hoursText !== '' && !(Number.isFinite(hours) && hours >= 0 && hours <= 24))) {
    checkinError.textContent = 'Sleep must be a number of hours from 0 to 24, or left empty.';
    checkinError.hidden = false;
    return;
  }
  if (hoursText === '') delete pendingCheck.sleepHoursPast24h;
  else pendingCheck.sleepHoursPast24h = hours;
  const note = noteInput.value.trim();
  if (note === '') delete pendingCheck.note;
  else pendingCheck.note = note;
  showSelfCheckView('instructions');
});

//-------ALERTNESS TEST (frame-timed stimulus, event-timed response)-------

const vigilanceCounter = document.getElementById('vigilance-counter');

function vigilanceUnitRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

document.getElementById('vigilance-begin').addEventListener('click', (event) => {
  startVigilance(event.timeStamp);
});

function startVigilance(startT) {
  vigilanceRun = {
    startT,
    plannedEndT: startT + VIGILANCE_PROTOCOL.durationMs,
    environment: observedEnvironment(),
    trials: [],
    earlyPresses: [],
    trial: null,
    isiMs: 0,
    nextOnsetT: 0,
    feedbackUntilT: 0,
    lastFrameT: null,
    frameIntervalsMs: [],
    frameCount: 0,
    frameRequest: 0,
    interruption: undefined,
  };
  suspendArchiveSync();
  scheduleNextStimulus(startT, '');
  // Keys cannot answer, so no control may keep focus inside the test.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  showSelfCheckView('test');
  document.addEventListener('pointerdown', onVigilancePointerDown, true);
  document.addEventListener('keydown', onVigilanceKeyDown, true);
  document.addEventListener('contextmenu', preventVigilanceContextMenu, true);
  document.addEventListener('visibilitychange', onVigilanceVisibilityChange);
  window.addEventListener('blur', onVigilanceBlur);
  window.addEventListener('pagehide', onVigilancePageHide);
  vigilanceRun.frameRequest = requestAnimationFrame(onVigilanceFrame);
}

// Each interval runs from the event that ended the previous one: a response,
// a timeout, an early press, or the start.
function scheduleNextStimulus(anchorT, feedbackText) {
  vigilanceRun.trial = null;
  vigilanceRun.isiMs = drawVigilanceIsiMs(vigilanceUnitRandom());
  vigilanceRun.nextOnsetT = anchorT + vigilanceRun.isiMs;
  vigilanceRun.feedbackUntilT = anchorT + VIGILANCE_PROTOCOL.feedbackMs;
  vigilanceCounter.textContent = feedbackText;
}

// A stimulus is dated by the frame callback that first draws it: the moment
// the browser began producing the frame that shows it. The following frame's
// time is kept too, so a delayed presentation stays visible in the record.
function onVigilanceFrame(frameT) {
  const run = vigilanceRun;
  if (run.lastFrameT !== null) run.frameIntervalsMs.push(frameT - run.lastFrameT);
  run.lastFrameT = frameT;
  run.frameCount++;
  const trial = run.trial;
  if (trial !== null) {
    if (trial.nextFrameT === undefined && frameT > trial.onsetT) trial.nextFrameT = frameT;
    const shownMs = frameT - trial.onsetT;
    if (shownMs >= VIGILANCE_PROTOCOL.timeoutMs) {
      trial.timedOut = true;
      scheduleNextStimulus(trial.onsetT + VIGILANCE_PROTOCOL.timeoutMs, 'no response');
    } else {
      vigilanceCounter.textContent = String(Math.floor(shownMs));
    }
  } else {
    if (frameT >= run.feedbackUntilT && vigilanceCounter.textContent !== '') {
      vigilanceCounter.textContent = '';
    }
    if (run.nextOnsetT >= run.plannedEndT) {
      if (frameT >= run.plannedEndT) {
        finishVigilance('complete', frameT);
        return;
      }
    } else if (frameT >= run.nextOnsetT) {
      run.trial = { isiMs: run.isiMs, onsetT: frameT };
      run.trials.push(run.trial);
      vigilanceCounter.textContent = '0';
    }
  }
  run.frameRequest = requestAnimationFrame(onVigilanceFrame);
}

function onVigilancePointerDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const receiptT = performance.now();
  const run = vigilanceRun;
  const trial = run.trial;
  if (trial !== null) {
    trial.responseT = event.timeStamp;
    trial.receiptT = receiptT;
    trial.pointerType = event.pointerType;
    const reactionMs = event.timeStamp - trial.onsetT;
    scheduleNextStimulus(event.timeStamp,
      reactionMs < VIGILANCE_PROTOCOL.falseStartBelowMs ? 'early' : String(Math.round(reactionMs)));
  } else if (event.timeStamp < run.plannedEndT) {
    run.earlyPresses.push({ t: event.timeStamp, receiptT });
    scheduleNextStimulus(event.timeStamp, 'early');
  }
}

function onVigilanceKeyDown(event) {
  if (event.key === 'Escape') interruptVigilance('escape', event.timeStamp);
}

function preventVigilanceContextMenu(event) {
  event.preventDefault();
}

function onVigilanceVisibilityChange(event) {
  if (document.visibilityState === 'hidden') interruptVigilance('visibilitychange', event.timeStamp);
}

function onVigilanceBlur(event) {
  interruptVigilance('blur', event.timeStamp);
}

function onVigilancePageHide(event) {
  interruptVigilance('pagehide', event.timeStamp);
}

function interruptVigilance(type, t) {
  vigilanceRun.interruption = { type, t };
  finishVigilance('interrupted', performance.now());
}

// A test closed with its page may never reach disk: the write starts here but
// the browser does not wait for it after pagehide.
function finishVigilance(status, endT) {
  const run = vigilanceRun;
  vigilanceRun = null;
  cancelAnimationFrame(run.frameRequest);
  document.removeEventListener('pointerdown', onVigilancePointerDown, true);
  document.removeEventListener('keydown', onVigilanceKeyDown, true);
  document.removeEventListener('contextmenu', preventVigilanceContextMenu, true);
  document.removeEventListener('visibilitychange', onVigilanceVisibilityChange);
  window.removeEventListener('blur', onVigilanceBlur);
  window.removeEventListener('pagehide', onVigilancePageHide);
  vigilanceCounter.textContent = '';
  const check = {
    startedAt: pendingCheck.startedAt,
    endedAt: Date.now(),
    timeZone: pendingCheck.timeZone,
    utcOffsetMin: pendingCheck.utcOffsetMin,
    occasion: pendingCheck.occasion,
    sleepiness: { scale: SLEEPINESS_SCALE.id, rating: pendingCheck.sleepinessRating },
    ...(pendingCheck.sleepHoursPast24h === undefined
      ? {} : { sleepHoursPast24h: pendingCheck.sleepHoursPast24h }),
    ...(pendingCheck.note === undefined ? {} : { note: pendingCheck.note }),
    environment: run.environment,
    vigilance: {
      protocol: VIGILANCE_PROTOCOL.id,
      status,
      ...(run.interruption === undefined ? {} : { interruption: run.interruption }),
      timeOriginMs: performance.timeOrigin,
      startT: run.startT,
      endT,
      trials: run.trials,
      earlyPresses: run.earlyPresses,
      frameCount: run.frameCount,
      ...(run.frameIntervalsMs.length === 0
        ? {} : { frameIntervalMedianMs: selfCheckMedian(run.frameIntervalsMs) }),
    },
  };
  pendingCheck = null;
  if (!validSelfCheck(check)) {
    storageFailure('self-check ' + check.startedAt + ' failed validation before saving');
  }
  const tx = db.transaction(SELF_CHECK_STORE, 'readwrite');
  tx.objectStore(SELF_CHECK_STORE).add(check);
  tx.onerror = () => storageFailure('self-check not saved: ' + tx.error);
  tx.oncomplete = () => {
    selfChecks.push(check);
    renderSelfCheckHistory();
    showSelfCheckResult(check);
    // Queued while still suspended, so release runs exactly one sync.
    requestArchiveSync();
    releaseArchiveSync();
  };
  tx.commit();
}

//-------RESULT AND HISTORY-------

const EN_DASH = '\u2013';

function formatReactionMs(value) {
  return value === undefined ? EN_DASH : Math.round(value) + ' ms';
}

function formatSpeedPerSec(value) {
  return value === undefined ? EN_DASH : value.toFixed(2) + ' /s';
}

// Baseline medians of counts can fall halfway between integers.
function formatCount(value) {
  if (value === undefined) return EN_DASH;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function tableRow(cells, header) {
  const row = document.createElement('tr');
  for (const cell of cells) {
    const el = document.createElement(header ? 'th' : 'td');
    if (typeof cell === 'string') {
      el.textContent = cell;
    } else {
      el.textContent = cell.text;
      if (cell.className) el.className = cell.className;
      if (cell.title) el.title = cell.title;
    }
    row.appendChild(el);
  }
  return row;
}

const RESULT_MEASURES = [
  { name: 'median reaction', key: 'medianReactionMs', format: formatReactionMs },
  { name: 'response speed', key: 'meanResponseSpeedPerSec', format: formatSpeedPerSec,
    title: 'Mean of 1 / reaction time over reactions of 100 ms or more.' },
  { name: 'lapses (355 ms or slower)', key: 'lapseCount', format: formatCount,
    title: 'Reactions of 355 ms or more, plus stimuli left unanswered for 30 s.' },
  { name: 'false starts', key: 'falseStartCount', format: formatCount,
    title: 'Presses while no counter showed, plus reactions under 100 ms.' },
  { name: 'stimuli', key: 'stimulusCount', format: formatCount },
];

const resultHeading = document.getElementById('self-check-result-heading');
const resultNote = document.getElementById('self-check-result-note');
const resultTable = document.getElementById('self-check-result-table');

function showSelfCheckResult(check) {
  const vigilance = check.vigilance;
  resultTable.textContent = '';
  if (vigilance.status === 'interrupted') {
    resultHeading.textContent = 'Test stopped: ' + VIGILANCE_INTERRUPTIONS[vigilance.interruption.type];
    resultNote.textContent = 'Saved as stopped. Stopped tests are not scored or compared.';
    resultNote.hidden = false;
    resultTable.hidden = true;
  } else {
    resultHeading.textContent = 'Result';
    resultNote.hidden = true;
    const score = scoreVigilance(vigilance);
    const baseline = routineBaseline(selfChecks, check.startedAt);
    const compared = baseline.checkCount > 0;
    const head = ['', 'this check'];
    if (compared) head.push('earlier routine checks (median of ' + baseline.checkCount + ')');
    resultTable.appendChild(tableRow(head, true));
    for (const measure of RESULT_MEASURES) {
      const cells = [{ text: measure.name, title: measure.title },
        { text: measure.format(score[measure.key]), className: 'self-check-value' }];
      if (compared) {
        cells.push({ text: measure.format(baseline[measure.key]), className: 'self-check-value' });
      }
      resultTable.appendChild(tableRow(cells, false));
    }
    resultTable.hidden = false;
  }
  showSelfCheckView('result');
}

const SELF_CHECK_HISTORY_ROWS = 60;
const historyCount = document.getElementById('self-check-history-count');
const historyTable = document.getElementById('self-check-history-table');

// Local time in the zone where the check happened; the zone is named when it
// differs from the viewer's.
function formatCheckTime(check) {
  const text = new Date(check.startedAt).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: check.timeZone,
  });
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return check.timeZone === viewerZone ? text : text + ' (' + check.timeZone + ')';
}

function renderSelfCheckHistory() {
  const total = selfChecks.length;
  historyCount.textContent = total <= SELF_CHECK_HISTORY_ROWS
    ? total + (total === 1 ? ' check' : ' checks')
    : 'The ' + SELF_CHECK_HISTORY_ROWS + ' most recent of ' + total + ' checks';
  historyTable.textContent = '';
  historyTable.appendChild(tableRow(['when', 'occasion', 'sleepiness', 'sleep',
    'median reaction', 'response speed', 'lapses', 'false starts', 'stimuli', 'status', 'note'], true));
  const newestFirst = selfChecks.slice(-SELF_CHECK_HISTORY_ROWS).reverse();
  for (const check of newestFirst) {
    const vigilance = check.vigilance;
    const complete = vigilance.status === 'complete';
    const score = complete ? scoreVigilance(vigilance) : null;
    const scored = (key, format) => ({
      text: complete ? format(score[key]) : EN_DASH, className: 'self-check-value',
    });
    historyTable.appendChild(tableRow([
      formatCheckTime(check),
      check.occasion,
      { text: String(check.sleepiness.rating), className: 'self-check-value',
        title: SLEEPINESS_SCALE.labels[check.sleepiness.rating - 1] },
      { text: check.sleepHoursPast24h === undefined ? EN_DASH : check.sleepHoursPast24h + ' h',
        className: 'self-check-value' },
      scored('medianReactionMs', formatReactionMs),
      scored('meanResponseSpeedPerSec', formatSpeedPerSec),
      scored('lapseCount', formatCount),
      scored('falseStartCount', formatCount),
      scored('stimulusCount', formatCount),
      complete ? 'complete' : 'stopped: ' + VIGILANCE_INTERRUPTIONS[vigilance.interruption.type],
      check.note === undefined ? '' : check.note,
    ], false));
  }
}

//-------BACKUP (export and import of self-checks, archive status)-------

const selfCheckArchiveStatus = document.getElementById('self-check-archive-status');
const selfCheckArchiveNow = document.getElementById('self-check-archive-now');

function renderSelfCheckArchive() {
  const status = archiveState.status;
  selfCheckArchiveStatus.textContent = status === 'not-chosen'
    ? 'Archive: no folder chosen. Choose one on the settings page.'
    : 'Archive: ' + archiveStatusText();
  selfCheckArchiveNow.hidden = status !== 'needs-permission' && status !== 'error';
  selfCheckArchiveNow.textContent = status === 'error' ? 'Try the archive again' : 'Allow archive writing';
}

selfCheckArchiveNow.addEventListener('click', () => {
  if (archiveState.status === 'needs-permission') resumeArchive();
  else runArchiveSync();
});

const transferStatus = document.getElementById('self-check-transfer-status');
const selfCheckDownload = document.getElementById('self-check-download');

function showTransferStatus(text) {
  transferStatus.textContent = text;
  transferStatus.hidden = false;
}

document.getElementById('self-check-export').addEventListener('click', () => {
  const json = JSON.stringify(selfCheckFile(selfChecks, Date.now()));
  if (selfCheckDownload.href) URL.revokeObjectURL(selfCheckDownload.href);
  selfCheckDownload.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  selfCheckDownload.download = 'minesweeper-friendly-self-checks-'
    + new Date().toISOString().slice(0, 10) + '.json';
  selfCheckDownload.hidden = false;
  showTransferStatus(selfChecks.length + (selfChecks.length === 1 ? ' self-check' : ' self-checks')
    + ' ready to save');
});

document.getElementById('self-check-import').addEventListener('change', (event) => {
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (file !== undefined) file.text().then(importSelfChecks);
});

// Merges by startedAt: a check already stored, or repeated within the file,
// is kept once.
function importSelfChecks(text) {
  let read;
  try {
    read = readSelfCheckFile(JSON.parse(text));
  } catch (error) {
    showTransferStatus('import failed: ' + error.message);
    return;
  }
  const seen = new Set(selfChecks.map((check) => check.startedAt));
  const added = [];
  for (const check of read.selfChecks) {
    if (seen.has(check.startedAt)) continue;
    seen.add(check.startedAt);
    added.push(check);
  }
  const tx = db.transaction(SELF_CHECK_STORE, 'readwrite');
  const store = tx.objectStore(SELF_CHECK_STORE);
  for (const check of added) store.add(check);
  tx.onerror = () => storageFailure('self-check import failed: ' + tx.error);
  tx.oncomplete = () => {
    selfChecks.push(...added);
    selfChecks.sort((a, b) => a.startedAt - b.startedAt);
    renderSelfCheckHistory();
    showSelfCheckView(selfCheckView);
    requestArchiveSync();
    showTransferStatus('imported ' + added.length + ' new; '
      + (read.selfChecks.length - added.length) + ' already present'
      + (read.rejectedCount > 0 ? '; ' + read.rejectedCount + ' invalid checks rejected' : ''));
  };
  tx.commit();
}
