'use strict';

// Coaching practice modes on the game page (pure engine in coach.js):
// mode bar controls (flag cap, bail cue delay, state check-in link), live
// zero-reflow board highlights and cues, Scan shield interception, slow-pattern
// bookmarking, and the post-game coach recap with replay step jumps.

//-------COACH STATE & DOM-------

let coachCounters = null;
let coachMoments = [];
let coachMomentsEndedAt = null;
let coachAnalysisState = null;
let coachPrevKnownFacts = null;
let coachLastActionAtMs = null;
let coachLastFlag = null;
let coachPendingStateB = null;
let coachBailTimer = null;
let coachBlindSpotTimer = null;
let coachScheduleTimer = null;
let coachCueClearTimer = null;
let coachBoardMarks = [];

const coachBar = document.getElementById('coach-bar');
const coachFlagBudgetWrap = document.getElementById('coach-flag-budget-wrap');
const coachFlagBudgetSelect = document.getElementById('coach-flag-budget-select');
const coachBailDelayWrap = document.getElementById('coach-bail-delay-wrap');
const coachBailDelaySelect = document.getElementById('coach-bail-delay-select');
const coachBudgetStatus = document.getElementById('coach-budget-status');
const coachCheckInBtn = document.getElementById('coach-checkin-btn');
const coachStateReadout = document.getElementById('coach-state-readout');
const coachLiveCue = document.getElementById('coach-live-cue');

const COACH_MARK_CLASSES = [
  'coach-noop',
  'coach-warn',
  'coach-wrong-flag',
  'coach-bail-target',
  'coach-easy-local',
  'coach-shield-safe',
];

const COACH_NOOP_LABELS = {
  'chord-short-of-flags': 'chord short of flags',
  'chord-too-many-flags': 'chord has too many flags',
  'chord-nothing-to-open': 'number already finished',
  'chord-over-covered': 'both-button release on covered square',
  'left-clicked-flag': 'left click on a flag',
  'flagged-revealed-cell': 'right click on an open square',
};

function coachActive() {
  return settings !== null && Coach.isPlayMode(settings.playMode);
}

function coachFeatures() {
  return Coach.featuresOf(settings.playMode);
}

function coachStopTimers() {
  if (coachBailTimer !== null) { clearTimeout(coachBailTimer); coachBailTimer = null; }
  if (coachBlindSpotTimer !== null) { clearTimeout(coachBlindSpotTimer); coachBlindSpotTimer = null; }
  if (coachScheduleTimer !== null) { clearTimeout(coachScheduleTimer); coachScheduleTimer = null; }
  if (coachCueClearTimer !== null) { clearTimeout(coachCueClearTimer); coachCueClearTimer = null; }
}

function coachClearBoardMarks() {
  if (coachBoardMarks.length === 0) return;
  for (const index of coachBoardMarks) {
    const el = cellElements[index];
    if (el !== undefined) el.classList.remove(...COACH_MARK_CLASSES);
  }
  coachBoardMarks = [];
}

function coachMarkCells(entries, durationMs) {
  clearPresses();
  coachClearBoardMarks();
  if (gameState !== 'playing' && gameState !== 'ready') return;
  for (const { index, className } of entries) {
    const el = cellElements[index];
    if (el === undefined) continue;
    el.classList.add(className);
    coachBoardMarks.push(index);
  }
  if (durationMs > 0) {
    clearTimeout(coachCueClearTimer);
    coachCueClearTimer = setTimeout(() => {
      coachCueClearTimer = null;
      coachClearBoardMarks();
    }, durationMs);
  }
}

function coachSetCue(text) {
  coachLiveCue.textContent = text;
}

function coachCurrentDecisionCount() {
  if (trace === null) return 0;
  let count = 0;
  for (const event of trace.events) {
    if (event.kind === 'decision') count++;
  }
  return count;
}

function coachAddMoment(kind, label, cell, targetCells) {
  if (coachMoments.length >= 40) return;
  coachMoments.push({
    step: coachCurrentDecisionCount(),
    atMs: Math.round(elapsedMs()),
    kind,
    label,
    cell,
    targetCells,
  });
}

function coachBuildControls() {
  coachFlagBudgetSelect.replaceChildren(...Coach.FLAG_BUDGET_CHOICES.map((cap) => {
    const option = document.createElement('option');
    option.value = cap === null ? 'unlimited' : String(cap);
    option.textContent = cap === null ? 'unlimited' : cap === 0 ? '0 (no flags)' : String(cap);
    return option;
  }));
  coachFlagBudgetSelect.addEventListener('change', () => {
    const cap = coachFlagBudgetSelect.value === 'unlimited' ? null : Number(coachFlagBudgetSelect.value);
    updateSettings({ coachFlagBudget: cap });
    newGame();
  });

  coachBailDelaySelect.replaceChildren(...Coach.BAIL_DELAY_CHOICES.map((ms) => {
    const option = document.createElement('option');
    option.value = String(ms);
    option.textContent = ms + ' ms';
    return option;
  }));
  coachBailDelaySelect.addEventListener('change', () => {
    updateSettings({ coachBailDelayMs: Number(coachBailDelaySelect.value) });
    if (coachCounters !== null && coachFeatures().earlyBail) {
      coachCounters.bailDelayMs = settings.coachBailDelayMs;
    }
  });

  coachCheckInBtn.addEventListener('click', () => {
    setStatesMenuOpen(true);
  });
}

function renderCoachBudgetStatus() {
  if (!coachActive() || !coachFeatures().noWaste || settings.coachFlagBudget === null) {
    coachBudgetStatus.hidden = true;
    coachBudgetStatus.textContent = '';
    coachBudgetStatus.classList.remove('coach-budget-hit');
    return;
  }
  const cap = settings.coachFlagBudget;
  coachBudgetStatus.hidden = false;
  coachBudgetStatus.textContent = 'flags ' + flagsPlaced + '/' + cap;
  coachBudgetStatus.classList.toggle('coach-budget-hit', flagsPlaced >= cap);
}

function renderCoachStatePrompt() {
  if (!coachActive()) {
    coachCheckInBtn.hidden = true;
    coachStateReadout.hidden = true;
    return;
  }
  const sample = freshStateCheckIn(Date.now());
  if (sample === null) {
    coachCheckInBtn.hidden = false;
    coachStateReadout.hidden = true;
    coachStateReadout.textContent = '';
    return;
  }
  const ageMs = Date.now() - sample.sampledAt;
  const stale = ageMs >= Coach.STATE_SAMPLE_REMIND_AGE_MS;
  coachCheckInBtn.hidden = !stale;
  coachStateReadout.hidden = false;
  coachStateReadout.textContent = 'state: ' + formatStateCheckIn(sample);
}

function renderCoachBar() {
  const active = coachActive();
  if (!active) {
    if (!coachBar.hidden) {
      coachBar.hidden = true;
      coachLiveCue.textContent = '';
    }
    return;
  }
  coachBar.hidden = false;
  const features = coachFeatures();
  coachFlagBudgetWrap.hidden = !features.noWaste;
  if (features.noWaste) {
    coachFlagBudgetSelect.value = settings.coachFlagBudget === null ? 'unlimited' : String(settings.coachFlagBudget);
  }
  coachBailDelayWrap.hidden = !features.earlyBail;
  if (features.earlyBail) {
    coachBailDelaySelect.value = String(settings.coachBailDelayMs);
  }
  renderCoachBudgetStatus();
  renderCoachStatePrompt();
}

function coachReset() {
  if (!coachActive() && coachCounters === null && coachBar.hidden && coachBoardMarks.length === 0) return;
  coachStopTimers();
  coachClearBoardMarks();
  coachAnalysisState = null;
  coachPrevKnownFacts = null;
  coachLastActionAtMs = null;
  coachLastFlag = null;
  coachPendingStateB = null;
  coachMoments = [];
  coachMomentsEndedAt = null;
  coachCounters = coachActive()
    ? Coach.emptyCounters(settings.playMode, {
      flagBudget: settings.coachFlagBudget,
      bailDelayMs: settings.coachBailDelayMs,
    })
    : null;
  coachSetCue('');
  renderCoachBar();
}

function coachFlagBudgetBlocks() {
  if (!coachActive() || !coachFeatures().noWaste || settings.coachFlagBudget === null) return false;
  return flagsPlaced >= settings.coachFlagBudget;
}

function coachOnFlagBudgetRefused() {
  if (coachCounters === null) return;
  coachCounters.flagBudgetRefusals++;
  renderCoachBudgetStatus();
  coachSetCue('flag cap reached (' + flagsPlaced + '/' + settings.coachFlagBudget + ') \u2014 reveal directly');
}

function coachOnNoOp(index, reason) {
  if (!coachActive() || coachCounters === null || !coachFeatures().noWaste) return;
  coachCounters.noOpCues++;
  const label = COACH_NOOP_LABELS[reason] || reason;
  coachMarkCells([{ index, className: 'coach-noop' }], 700);
  coachSetCue('no-op: ' + label + ' (' + coachCounters.noOpCues + ')');
}

function coachInterceptReveal(index) {
  if (!coachActive() || coachCounters === null || !coachFeatures().scanShield) return false;
  if (!minesPlaced || gameState !== 'playing') return false;
  const shield = Coach.checkScanShield(playerView(), index);
  if (!shield.block) return false;
  coachStopTimers();
  coachCounters.shieldSaves++;
  if (shield.clickedWasMine) coachCounters.shieldMineSaves++;
  const marks = [{ index, className: 'coach-warn' },
    ...shield.safeCells.map((cell) => ({ index: cell, className: 'coach-shield-safe' }))];
  coachMarkCells(marks, 1500);
  const tierLabel = shield.tier === 'counting' ? 'easy' : shield.tier;
  const cue = shield.reason === 'missed-safe'
    ? 'shield saved: ' + tierLabel + ' safe move elsewhere (' + coachCounters.shieldSaves + ')'
    : 'shield saved: that square is a proven mine (' + coachCounters.shieldSaves + ')';
  coachSetCue(cue);
  coachAddMoment('shield-save', cue, index, shield.safeCells);
  return true;
}

function coachBeforeAction(kind, index, extraTargets, isChordGesture) {
  if (!coachActive() || coachCounters === null) return;
  const features = coachFeatures();
  const nowMs = elapsedMs();
  const gapMs = coachLastActionAtMs === null ? null : Math.max(0, nowMs - coachLastActionAtMs);
  coachStopTimers();
  coachClearBoardMarks();

  if (kind === 'chord' && features.noWaste && coachLastFlag !== null) {
    if (squareDistance(config.width, coachLastFlag.index, index) <= 2
        && (nowMs - coachLastFlag.atMs) <= 1500) {
      coachCounters.flagChordPairs++;
      if (isChordGesture) {
        coachCounters.flagChord15Clicks++;
        coachSetCue('1.5-click (' + coachCounters.flagChord15Clicks + '/' + coachCounters.flagChordPairs + ')');
      }
    }
  }
  if (kind !== 'flag') coachLastFlag = null;

  if (features.earlyBail && coachPendingStateB !== null) {
    const hitRemote = coachPendingStateB.remoteSet.has(index)
      || (Array.isArray(extraTargets) && extraTargets.some((c) => coachPendingStateB.remoteSet.has(c)));
    if (!coachPendingStateB.triggered && hitRemote) {
      coachCounters.earlyBailFastJumps++;
      const bailMs = Math.round(nowMs - coachPendingStateB.startedAtMs);
      coachSetCue('fast bail (' + bailMs + ' ms \u00b7 '
        + coachCounters.earlyBailFastJumps + '/' + coachCounters.earlyBailOpportunities + ')');
    }
    coachPendingStateB = null;
  }

  if (features.earlyBail && coachPrevKnownFacts !== null) {
    let wasQueued = false;
    if (kind === 'reveal') {
      wasQueued = coachPrevKnownFacts.countingSafe.has(index);
    } else if (kind === 'flag') {
      wasQueued = coachPrevKnownFacts.countingMines.has(index);
    } else if (kind === 'chord') {
      wasQueued = coachPrevKnownFacts.readyChords.has(index)
        || (Array.isArray(extraTargets) && extraTargets.length > 0
          && extraTargets.every((c) => coachPrevKnownFacts.countingSafe.has(c)));
    }
    if (wasQueued) {
      coachCounters.queuedMoves++;
      if (gapMs !== null && gapMs <= Coach.LOOKAHEAD_FAST_MS) coachCounters.fastQueuedMoves++;
    }
  }

  if (coachAnalysisState !== null && gapMs !== null && gapMs >= Coach.SLOW_PATTERN_MIN_MS) {
    const candidates = kind === 'chord' && Array.isArray(extraTargets) ? extraTargets : [index];
    const overlapCell = candidates.find((c) =>
      coachAnalysisState.overlapFacts.has(c) && !coachAnalysisState.countingFacts.has(c));
    if (overlapCell !== undefined) {
      const family = Coach.classifyPatternAt(playerView(), overlapCell,
        coachAnalysisState.countingFacts, coachAnalysisState.overlapFacts);
      if (family !== null) {
        coachCounters.slowPatterns[family]++;
        coachAddMoment('slow-pattern',
          'slow ' + Coach.PATTERN_LABELS[family] + ' (' + Math.round(gapMs) + ' ms)',
          overlapCell, [overlapCell]);
      }
    }
  }

  coachLastActionAtMs = nowMs;
  if (coachAnalysisState !== null) {
    coachPrevKnownFacts = {
      countingSafe: new Set(coachAnalysisState.countingSafe),
      countingMines: new Set(coachAnalysisState.countingMines),
      readyChords: new Set(coachAnalysisState.readyChords),
    };
  }
}

function coachOnFirstReveal(index) {
  if (!coachActive() || coachCounters === null) return;
  coachLastActionAtMs = elapsedMs();
  if (cells[index].adjacent > 0) {
    coachCounters.numberedStartNoted = true;
    coachSetCue('numbered start \u00b7 Space to restart');
  }
  coachScheduleAnalysis([index]);
}

function coachOnFlagPlaced(index) {
  if (!coachActive() || coachCounters === null) return;
  const features = coachFeatures();
  renderCoachBudgetStatus();
  if (!minesPlaced || gameState !== 'playing') return;
  coachLastFlag = { index, atMs: elapsedMs() };

  if (features.scanShield || features.noWaste) {
    const res = Coach.evaluateFlagPlacement(playerView(), cells.map((c) => c.flagged), index);
    if (features.scanShield && res.wrongFlag) {
      coachCounters.wrongFlagWarnings++;
      const marks = [{ index, className: 'coach-wrong-flag' },
        ...res.overflaggedNumbers.map((n) => ({ index: n, className: 'coach-wrong-flag' }))];
      coachMarkCells(marks, 1600);
      const cue = 'wrong flag \u2014 remove before chording (' + coachCounters.wrongFlagWarnings + ')';
      coachSetCue(cue);
      coachAddMoment('wrong-flag', cue, index, res.overflaggedNumbers);
    } else if (features.noWaste && res.lowValueFlag) {
      coachCounters.lowValueFlagCues++;
      coachMarkCells([{ index, className: 'coach-warn' }], 900);
      const cue = res.lowValueReason === 'no-chord-target'
        ? 'unused flag \u2014 no chord target (' + coachCounters.lowValueFlagCues + ')'
        : '1-cell flag \u2014 direct click saves 1 input (' + coachCounters.lowValueFlagCues + ')';
      coachSetCue(cue);
    }
  }
  coachScheduleAnalysis([index]);
}

function coachOnFlagRemoved() {
  if (!coachActive()) return;
  renderCoachBudgetStatus();
}

function coachOnChordComplete(index, openedTargets) {
  if (!coachActive() || coachCounters === null) return;
  if (coachFeatures().noWaste) {
    const res = Coach.evaluateChordEfficiency(playerView(), index, openedTargets);
    if (res.oneCellChord) {
      coachCounters.oneCellChordCues++;
      if (res.onOpeningRim) coachCounters.openingRimOneCellChords++;
      coachMarkCells([{ index, className: 'coach-warn' }], 900);
      coachSetCue(res.onOpeningRim
        ? '1-cell chord on opening rim \u2014 direct click is faster (' + coachCounters.oneCellChordCues + ')'
        : '1-cell chord \u2014 direct click is faster (' + coachCounters.oneCellChordCues + ')');
    }
  }
  coachScheduleAnalysis([index, ...openedTargets]);
}

function coachAfterReveal(openedCells) {
  if (!coachActive() || gameState !== 'playing') return;
  coachScheduleAnalysis(openedCells);
}

// Runs fast local counting + overlap analysis off the click frame so click
// latency stays untouched even during Coach modes.
function coachScheduleAnalysis(anchorCells) {
  if (!coachActive() || gameState !== 'playing') return;
  clearTimeout(coachScheduleTimer);
  clearTimeout(coachBailTimer);
  clearTimeout(coachBlindSpotTimer);
  coachBailTimer = null;
  coachBlindSpotTimer = null;
  const scheduledTrace = trace;
  const anchors = anchorCells.slice();
  coachScheduleTimer = setTimeout(() => {
    coachScheduleTimer = null;
    if (gameState !== 'playing' || !coachActive() || trace !== scheduledTrace) return;
    const state = Coach.analyzeBoardState(playerView(), cells.map((c) => c.flagged), anchors);
    coachAnalysisState = { ...state, anchorCells: anchors, computedAtMs: elapsedMs() };
    if (!coachFeatures().earlyBail || coachCounters === null) return;

    if (state.regime === 'state-b') {
      coachCounters.earlyBailOpportunities++;
      const remoteSet = new Set();
      for (const c of state.countingSafe) {
        if (anchors.every((a) => squareDistance(config.width, c, a) > 2)) remoteSet.add(c);
      }
      for (const c of state.readyChords) {
        if (anchors.every((a) => squareDistance(config.width, c, a) > 2)) remoteSet.add(c);
      }
      const pending = { startedAtMs: elapsedMs(), triggered: false, remoteSet };
      coachPendingStateB = pending;
      coachBailTimer = setTimeout(() => {
        coachBailTimer = null;
        if (gameState !== 'playing' || trace !== scheduledTrace || coachPendingStateB !== pending) return;
        pending.triggered = true;
        coachCounters.earlyBailNudges++;
        coachMarkCells(state.remoteClusterCells.map((c) => ({ index: c, className: 'coach-bail-target' })), 0);
        const cue = 'bail: easy move elsewhere (' + coachCounters.earlyBailFastJumps + ' fast / '
          + coachCounters.earlyBailOpportunities + ')';
        coachSetCue(cue);
        coachAddMoment('early-bail', 'bail cue (easy move elsewhere)', state.remoteClusterCells[0],
          state.remoteClusterCells);
      }, settings.coachBailDelayMs);
    } else if (state.regime === 'easy-local') {
      coachPendingStateB = null;
      coachBlindSpotTimer = setTimeout(() => {
        coachBlindSpotTimer = null;
        if (gameState !== 'playing' || trace !== scheduledTrace) return;
        coachCounters.blindSpotNudges++;
        coachMarkCells(state.localHintCells.map((c) => ({ index: c, className: 'coach-easy-local' })), 0);
        const cue = 'easy move right here (' + coachCounters.blindSpotNudges + ')';
        coachSetCue(cue);
        coachAddMoment('blind-spot', 'easy local move >' + Coach.BLIND_SPOT_DELAY_MS + ' ms',
          state.localHintCells[0], state.localHintCells);
      }, Coach.BLIND_SPOT_DELAY_MS);
    } else {
      coachPendingStateB = null;
    }
  }, 0);
}

function coachRecordForGame(endedAt) {
  if (!coachActive() || coachCounters === null) return undefined;
  coachMomentsEndedAt = endedAt;
  return structuredClone(coachCounters);
}

//-------POST-GAME COACH RECAP (with 1-click replay jumps)-------

function coachSummaryItems(coach) {
  const features = Coach.featuresOf(coach.mode);
  const items = [];
  if (features.noWaste) {
    items.push(['No-op cues', String(coach.noOpCues)]);
    items.push(['1-cell / unused flags', String(coach.lowValueFlagCues)]);
    items.push(['1-cell chords', coach.oneCellChordCues + (coach.openingRimOneCellChords > 0
      ? ' (' + coach.openingRimOneCellChords + ' on opening rim)' : '')]);
    if (coach.flagChordPairs > 0) {
      const pct = Math.round(100 * coach.flagChord15Clicks / coach.flagChordPairs);
      items.push(['1.5-clicks', coach.flagChord15Clicks + '/' + coach.flagChordPairs + ' (' + pct + '%)']);
    }
    if (coach.flagBudget !== undefined && coach.flagBudget !== null) {
      items.push(['Flag cap', String(coach.flagBudget) + (coach.flagBudgetRefusals > 0
        ? ' (' + coach.flagBudgetRefusals + ' blocked)' : '')]);
    }
  }
  if (features.earlyBail) {
    if (coach.earlyBailOpportunities > 0) {
      const pct = Math.round(100 * coach.earlyBailFastJumps / coach.earlyBailOpportunities);
      items.push(['Fast bails (<' + coach.bailDelayMs + ' ms)',
        coach.earlyBailFastJumps + '/' + coach.earlyBailOpportunities + ' (' + pct + '%)']);
    } else {
      items.push(['Early bail chances', '0']);
    }
    items.push(['Easy local blind spots', String(coach.blindSpotNudges)]);
    if (coach.queuedMoves > 0) {
      const pct = Math.round(100 * coach.fastQueuedMoves / coach.queuedMoves);
      items.push(['Queued lookahead', coach.fastQueuedMoves + '/' + coach.queuedMoves + ' (' + pct + '%)']);
    }
  }
  if (features.scanShield) {
    items.push(['Shield saves', coach.shieldSaves + (coach.shieldMineSaves > 0
      ? ' (' + coach.shieldMineSaves + ' proven mine)' : '')]);
    items.push(['Wrong-flag warnings', String(coach.wrongFlagWarnings)]);
  }
  const slowParts = Coach.PATTERN_FAMILIES
    .filter((f) => (coach.slowPatterns[f] || 0) > 0)
    .map((f) => Coach.PATTERN_LABELS[f] + ': ' + coach.slowPatterns[f]);
  if (slowParts.length > 0) items.push(['Slow overlap patterns', slowParts.join(', ')]);
  return items;
}

function buildCoachRecap(record) {
  if (record.coach === undefined) return null;
  const wrap = document.createElement('section');
  wrap.className = 'coach-recap';
  wrap.setAttribute('aria-label', 'Coach recap');

  const head = document.createElement('div');
  head.className = 'coach-recap-head';
  const title = document.createElement('h3');
  title.className = 'coach-recap-title';
  title.textContent = Coach.specOf(record.coach.mode).label + ' recap';
  const link = document.createElement('a');
  link.className = 'ui-button coach-recap-training-link';
  link.href = 'training.html#training-coach';
  link.textContent = 'track transfer on training page';
  head.append(title, link);
  wrap.appendChild(head);

  const grid = document.createElement('dl');
  grid.className = 'coach-recap-grid';
  for (const [label, value] of coachSummaryItems(record.coach)) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    grid.append(dt, dd);
  }
  wrap.appendChild(grid);

  if (record.endedAt === coachMomentsEndedAt && coachMoments.length > 0 && pathViewAvailable()) {
    const momentsBox = document.createElement('div');
    momentsBox.className = 'coach-recap-moments';
    const heading = document.createElement('span');
    heading.className = 'coach-recap-moments-label';
    heading.textContent = 'Jump replay to moment:';
    momentsBox.appendChild(heading);
    for (const moment of coachMoments.slice(0, 12)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ui-button coach-moment-btn';
      btn.textContent = (moment.atMs / 1000).toFixed(1) + 's ' + moment.label;
      btn.addEventListener('click', () => {
        setReplayStep(moment.step);
      });
      momentsBox.appendChild(btn);
    }
    wrap.appendChild(momentsBox);
  }
  return wrap;
}
