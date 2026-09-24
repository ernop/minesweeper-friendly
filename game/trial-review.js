'use strict';

// The review after a trial session: rank rows, identity summaries, attempt
// charts, and run overlays.

//-------TRIAL REVIEW (rank rows, identity review, run overlays)-------

function trialTimeAgeRow(nowRecord, list) {
  return (i) => {
    const age = relativeAge(nowRecord.endedAt, list[i].endedAt);
    const cells = [
      ['rank-cell', String(i + 1)],
      ['time-cell' + (isMarkless(list[i]) ? ' markless-time' : ''),
        (list[i].timeMs / 1000).toFixed(3) + 's'],
    ];
    if (age.count === 0 && age.unit === 's') {
      cells.push(['age-just-cell age-u-s', 'this']);
    } else {
      cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
      cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
    }
    return cells;
  };
}

function renderTrialMidRanks(record, modeRecords) {
  const wins = modeRecords.filter((r) => r.outcome === 'win')
    .sort((a, b) => a.timeMs - b.timeMs || a.endedAt - b.endedAt);
  if (wins.length === 0) return;
  resultRanks.appendChild(buildRankList(
    playModeLabel() + ' ' + boardKey(),
    wins.length, wins.indexOf(record), 'rank-grid',
    trialTimeAgeRow(record, wins)));
}

const TRIAL_TRANSFORM_LABELS = {
  id: 'upright',
  rot90: 'turned 90°',
  rot180: 'turned 180°',
  rot270: 'turned 270°',
  flipH: 'flipped sideways',
  flipV: 'flipped upside-down',
  flipD: 'flipped on the diagonal',
  flipAD: 'flipped on the other diagonal',
};

function trialTransformLabel(name) {
  const label = TRIAL_TRANSFORM_LABELS[name];
  if (!label) throw new Error('unknown trial transform ' + name);
  return label;
}

function trialDeltaPhrase(seconds, base) {
  if (seconds === null || base === null) return null;
  const abs = Math.abs(seconds);
  if (abs < 0.05 || (base > 0 && abs / base < 0.05)) return 'about even';
  return (seconds > 0 ? abs.toFixed(2) + 's faster' : abs.toFixed(2) + 's slower');
}

function trialRepeatComparisonCopy(sum) {
  if (sum.identitiesWithTwoWins === 0) {
    return 'Not enough wins on the same board twice to compare meetings.';
  }
  const later = trialDeltaPhrase(sum.withinMean, sum.firstMeetings.meanTime);
  if (later === 'about even') {
    return 'Later meetings of the same board were about as fast as the first.';
  }
  return 'Later meetings of the same board were ' + later + ' than the first.';
}

function formatTrialMeetCell(value, kind) {
  if (value === null || value === undefined) return '—';
  if (kind === 'rate') return Math.round(value * 100) + '%';
  if (kind === 'time') return value.toFixed(2) + 's';
  if (kind === 'bvs') return value.toFixed(2);
  return String(value);
}

function appendTrialMeetTable(parent, showings) {
  const table = document.createElement('div');
  table.className = 'trial-meet-table';
  const header = ['', 'games', 'wins', 'mean time', '3BV/s'];
  for (const label of header) {
    const cell = document.createElement('span');
    cell.className = 'trial-meet-head';
    cell.textContent = label;
    table.appendChild(cell);
  }
  for (let i = 0; i < showings.length; i++) {
    const row = showings[i];
    const cells = [
      trialRunOrdinal(i),
      String(row.n),
      String(row.wins),
      formatTrialMeetCell(row.meanTime, 'time'),
      formatTrialMeetCell(row.meanBvS, 'bvs'),
    ];
    for (const text of cells) {
      const cell = document.createElement('span');
      cell.textContent = text;
      table.appendChild(cell);
    }
  }
  parent.appendChild(table);
}

function appendTrialSessionSummary(parent, summary) {
  const wrap = document.createElement('div');
  wrap.className = 'trial-session-summary';
  const head = document.createElement('div');
  head.className = 'overlay-chart-label';
  head.textContent = 'same board, by meeting (light → dark = earlier → later)';
  wrap.appendChild(head);
  appendNamedBars(wrap, 'mean win time (s)',
    summary.showings.map((s) => s.meanTime === null ? undefined : s.meanTime), SPARK_SMALL);
  appendNamedBars(wrap, 'mean win 3BV/s',
    summary.showings.map((s) => s.meanBvS === null ? undefined : s.meanBvS), SPARK_SMALL);
  appendNamedBars(wrap, 'win rate',
    summary.showings.map((s) => s.winRate === null ? undefined : s.winRate), SPARK_SMALL);
  appendTrialMeetTable(wrap, summary.showings);
  parent.appendChild(wrap);
}

function identitySummaryLine(group) {
  const wins = [];
  let losses = 0;
  for (const attempt of group.attempts) {
    if (attempt.outcome === 'win') wins.push(attempt.timeMs / 1000);
    else losses++;
  }
  let line = 'board ' + (group.identityIndex + 1)
    + ' · ' + group.attempts.length + ' meeting'
    + (group.attempts.length === 1 ? '' : 's')
    + ' · ' + wins.length + ' win' + (wins.length === 1 ? '' : 's');
  if (losses > 0) line += ' · ' + losses + ' loss' + (losses === 1 ? '' : 'es');
  if (settings.shownThings.relationshipCharts && wins.length >= 2) {
    const delta = wins[0] - wins[wins.length - 1];
    line += delta > 0.05
      ? ' · last ' + delta.toFixed(2) + 's faster'
      : delta < -0.05
        ? ' · last ' + (-delta).toFixed(2) + 's slower'
        : ' · last matched first';
  }
  return line;
}

function identityStartsOpen(group, playedCount) {
  if (playedCount <= 1) return true;
  for (const attempt of group.attempts) {
    if (attempt.outcome === 'loss') return true;
  }
  const wins = group.attempts.filter((a) => a.outcome === 'win');
  if (wins.length >= 2) {
    const first = wins[0].timeMs;
    const last = wins[wins.length - 1].timeMs;
    if (first > 0 && Math.abs(first - last) / first >= 0.2) return true;
  }
  return false;
}

function renderTrialReview(session) {
  const summary = Trial.sessionSummary(session);
  const copy = document.getElementById('trial-copy');
  const verdict = document.getElementById('trial-verdict');
  copy.hidden = false;
  copy.textContent = playModeLabel(session.playMode || 'trial')
    + ' ' + (session.endedHow === 'completed' ? 'complete' : 'ended')
    + '\n' + session.width + 'x' + session.height + '/' + session.mines
    + '\n' + session.results.length + ' / ' + Trial.gameCount(session);
  verdict.hidden = false;
  verdict.textContent = trialRepeatComparisonCopy(summary);
  resultSummary.textContent = '';
  clearResultStats();
  resultAnalysis.textContent = '';
  resultAnalysis.appendChild(buildReportScopeControl(
    () => renderTrialReview(session)));
  resultRanks.textContent = '';
  appendTrialSessionSummary(resultRanks, summary);
  const pendingOverlays = [];
  const groups = Trial.groupedResults(session);
  const playedCount = groups.filter((g) => g.attempts.length > 0).length;
  for (const group of groups) {
    if (group.attempts.length === 0) continue;
    const details = document.createElement('details');
    details.className = 'trial-identity';
    bindTrialSection(details, `${session.startedAt}:identity:${group.identityIndex}`, identityStartsOpen(group, playedCount));
    const head = document.createElement('summary');
    head.textContent = identitySummaryLine(group);
    details.appendChild(head);
    const body = document.createElement('div');
    body.className = 'trial-identity-body';
    for (let i = 0; i < group.attempts.length; i++) {
      const attempt = group.attempts[i];
      const seconds = attempt.timeMs / 1000;
      const line = document.createElement('div');
      line.textContent = trialRunOrdinal(i) + '  ' + attempt.outcome + '  '
        + seconds.toFixed(3) + 's  3BV ' + attempt.bv3
        + '  ' + (attempt.bv3 / seconds).toFixed(3) + '/s  '
        + trialTransformLabel(attempt.transform);
      body.appendChild(line);
      if (Array.isArray(attempt.actionEvaluations)
          && attempt.actionEvaluations.length > 0) {
        const report = buildVerdictBlocks({
          outcome: attempt.outcome,
          actionEvaluations: attempt.actionEvaluations,
        });
        if (report) {
          const actionDetails = document.createElement('details');
          actionDetails.className = 'trial-action-report';
          bindTrialSection(actionDetails, `${session.startedAt}:action:${attempt.endedAt}`, false);
          const actionHead = document.createElement('summary');
          actionHead.textContent = 'action report';
          actionDetails.append(actionHead, report);
          body.appendChild(actionDetails);
        }
      }
    }
    if (group.attempts.length >= 2) {
      appendOverlayLegend(body, group.attempts);
      appendTrialAttemptCharts(body, group.attempts);
      pendingOverlays.push({ group: group, box: body, details: details });
    }
    details.appendChild(body);
    resultRanks.appendChild(details);
  }
  if (pendingOverlays.length > 0) {
    loadTracesByEndedAt(session.results.map((r) => r.endedAt), (traces) => {
      if (lastTrialReview !== session) return;
      for (const item of pendingOverlays) {
        const fill = () => {
          if (item.filled) return;
          item.filled = true;
          appendTrialOverlays(item.box, session, item.group, traces);
        };
        if (item.details.open) fill();
        else {
          item.details.addEventListener('toggle', () => {
            if (item.details.open) fill();
          });
        }
      }
    });
  }
}

// Light → dark is earlier → later. One hue family so the order is
// readable without the legend.
const TRIAL_RUN_COLORS = ['#e8b84a', '#e07020', '#b82c14', '#2a0e0c'];
const TRIAL_RUN_ORDINALS = ['1st', '2nd', '3rd', '4th'];

function trialAttemptColor(i) {
  return TRIAL_RUN_COLORS[i % TRIAL_RUN_COLORS.length];
}

function trialRunOrdinal(i) {
  return TRIAL_RUN_ORDINALS[i] || String(i + 1);
}

function trialRunAgeLabel(i, lastIndex) {
  if (i === 0) return 'earliest';
  if (i === lastIndex) return 'latest';
  return trialRunOrdinal(i);
}

function appendOverlayLegend(box, attempts) {
  const legend = document.createElement('div');
  legend.className = 'overlay-legend';
  const last = attempts.length - 1;
  for (let i = 0; i < attempts.length; i++) {
    const item = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = 'overlay-swatch';
    swatch.style.background = trialAttemptColor(i);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(
      trialRunAgeLabel(i, last) + '  '
      + trialTransformLabel(attempts[i].transform)
      + '  ' + attempts[i].outcome));
    legend.appendChild(item);
  }
  box.appendChild(legend);
}

function appendNamedBars(box, label, values, size) {
  const name = document.createElement('div');
  name.className = 'overlay-chart-label';
  name.textContent = label;
  box.appendChild(name);
  box.appendChild(buildBarChart(values, size));
}

function winOnly(attempt, value) {
  return attempt.outcome === 'win' ? value : undefined;
}

function appendTrialAttemptCharts(box, attempts) {
  appendNamedBars(box, 'time (s)',
    attempts.map((a) => winOnly(a, a.timeMs / 1000)), SPARK_SMALL);
  appendNamedBars(box, '3BV/s',
    attempts.map((a) => winOnly(a, a.bv3 / (a.timeMs / 1000))), SPARK_SMALL);
  appendNamedBars(box, 'clicks', attempts.map((a) => a.clicks), SPARK_SMALL);
  appendNamedBars(box, 'efficiency',
    attempts.map((a) => winOnly(a, a.clicks > 0 ? a.bv3 / a.clicks : undefined)), SPARK_SMALL);
}

function loadTracesByEndedAt(endedAts, done) {
  if (db === null) storageFailure('trial overlays failed: database is not open');
  const tx = db.transaction(TRACE_STORE);
  tx.onerror = () => storageFailure('trial overlay load failed: ' + tx.error);
  const store = tx.objectStore(TRACE_STORE);
  const traces = new Map();
  for (const endedAt of endedAts) {
    const request = store.get(endedAt);
    request.onsuccess = () => {
      if (request.result !== undefined) traces.set(endedAt, request.result);
    };
  }
  tx.oncomplete = () => done(traces);
}

function presentedBoard(session, attempt) {
  const identity = session.identities[attempt.identityIndex];
  return {
    mines: Trial.applyMines(identity.mines, session.width, session.height, attempt.transform),
    firstClick: Trial.mapIndex(identity.firstClick, session.width, session.height, attempt.transform),
  };
}

function appendTrialOverlays(box, session, group, traces) {
  const runs = [];
  for (let i = 0; i < group.attempts.length; i++) {
    const stored = traces.get(group.attempts[i].endedAt);
    if (stored === undefined) continue;
    const board = presentedBoard(session, group.attempts[i]);
    const progress = Trial.replayProgress(
      session.width, session.height, board.mines, board.firstClick, stored.events,
      { givenOpening: group.attempts[i].givenOpening !== false });
    const samples = {
      t: Array.from(stored.sampleT),
      x: Array.from(stored.sampleX),
      y: Array.from(stored.sampleY),
    };
    const wall = stored.endedAt - stored.startedAt;
    runs.push({
      colorIndex: i,
      progress: progress,
      path: Trial.runningPath(samples.t, samples.x, samples.y),
      speed: Trial.runningSpeed(samples.t, samples.x, samples.y),
      board: Trial.identityBoardSamples(
        samples.t, samples.x, samples.y, stored.events,
        group.attempts[i].transform, session.width, session.height),
      metrics: computeAllTraceMetrics(samples.t, samples.x, samples.y, stored.events, wall),
    });
  }
  if (runs.length < 2) return;

  const overlayHead = document.createElement('div');
  overlayHead.className = 'overlay-chart-label';
  overlayHead.textContent = 'overlaid in time (light = earlier · dark = later)';
  box.appendChild(overlayHead);
  appendOverlayLegend(box, group.attempts);

  const overlay = (label, pick) => {
    const name = document.createElement('div');
    name.className = 'overlay-chart-label';
    name.textContent = label;
    box.appendChild(name);
    box.appendChild(buildOverlaySparkline(runs.map((run) => pick(run)), SPARK_LARGE));
  };
  overlay('open squares', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.opened,
  }));
  overlay('squares unopened', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.unopened,
  }));
  overlay('flags', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.flags,
  }));
  overlay('mines unmarked', (run) => ({
    colorIndex: run.colorIndex, tMs: run.progress.tMs, values: run.progress.unmarked,
  }));
  overlay('cursor path (px)', (run) => ({
    colorIndex: run.colorIndex, tMs: run.path.tMs, values: run.path.values,
  }));
  appendTrialSpeedOverlay(box, runs);
  overlay('cursor x (identity px)', (run) => ({
    colorIndex: run.colorIndex, tMs: run.board.tMs, values: run.board.x,
  }));
  overlay('cursor y (identity px)', (run) => ({
    colorIndex: run.colorIndex, tMs: run.board.tMs, values: run.board.y,
  }));

  for (const groupDef of TRACE_METRIC_GROUPS) {
    const head = document.createElement('div');
    head.className = 'overlay-chart-label';
    head.textContent = groupDef.name;
    box.appendChild(head);
    for (const display of groupDef.displays) {
      const values = runs.map((run) => displayableNumber(display.of(run.metrics)));
      if (values.every((v) => v === undefined)) continue;
      appendNamedBars(box, display.label, values, SPARK_SMALL);
    }
  }
}

function speedOverlayRuns(runs, widthMs) {
  return runs.map((run) => {
    const bucketed = Trial.bucketSeries(run.speed.tMs, run.speed.values, widthMs);
    return { colorIndex: run.colorIndex, tMs: bucketed.tMs, values: bucketed.values };
  });
}

function appendTrialSpeedOverlay(box, runs) {
  const name = document.createElement('div');
  name.className = 'overlay-chart-label';
  name.textContent = 'cursor speed (px/s)';
  box.appendChild(name);
  const controls = document.createElement('div');
  controls.className = 'trial-speed-bucket';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '800';
  slider.step = '25';
  slider.value = String(settings.trialSpeedBucketMs);
  const readout = document.createElement('span');
  const syncReadout = () => {
    readout.textContent = settings.trialSpeedBucketMs === 0
      ? 'raw samples'
      : settings.trialSpeedBucketMs + ' ms average';
  };
  syncReadout();
  controls.append(slider, readout);
  box.appendChild(controls);
  const host = document.createElement('div');
  host.className = 'trial-speed-chart';
  box.appendChild(host);
  const redraw = () => {
    host.textContent = '';
    host.appendChild(buildOverlaySparkline(speedOverlayRuns(runs, settings.trialSpeedBucketMs), SPARK_LARGE));
  };
  slider.addEventListener('input', () => {
    updateSettings({ trialSpeedBucketMs: Number(slider.value) });
    syncReadout();
    redraw();
  });
  redraw();
}

function overlayQuantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Tukey fences, but never tighter than the 5th–95th so a mostly-still
// cursor does not hide ordinary flicks. Extreme sample-to-sample speeds
// (a 13k px/s spike from a tiny dt) stay off the axis.
function overlayAxisBounds(values) {
  const xs = [];
  for (const v of values) {
    if (v === undefined || !Number.isFinite(v)) continue;
    xs.push(v);
  }
  xs.sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length < 8) return { min: xs[0], max: xs[xs.length - 1] };
  const q1 = overlayQuantile(xs, 0.25);
  const q3 = overlayQuantile(xs, 0.75);
  const fence = 1.5 * (q3 - q1);
  let min = Math.min(q1 - fence, overlayQuantile(xs, 0.05));
  let max = Math.max(q3 + fence, overlayQuantile(xs, 0.95));
  min = Math.max(min, xs[0]);
  max = Math.min(max, xs[xs.length - 1]);
  return { min: min, max: max };
}

function buildOverlaySparkline(runs, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'spark-frame');
  frame.setAttribute('x', left);
  frame.setAttribute('y', 1);
  frame.setAttribute('width', width - left - 1);
  frame.setAttribute('height', height - bottom - 2);
  svg.appendChild(frame);

  const pooled = [];
  let tEnd = 0;
  for (const run of runs) {
    if (run.tMs.length > 0 && run.tMs[run.tMs.length - 1] > tEnd) {
      tEnd = run.tMs[run.tMs.length - 1];
    }
    for (const v of run.values) pooled.push(v);
  }
  const bounds = overlayAxisBounds(pooled);
  if (bounds === null) return svg;
  let min = bounds.min;
  let max = bounds.max;
  const labelMin = min;
  const labelMax = max;
  if (min === max) { min -= 0.5; max += 0.5; }

  const yTop = 2;
  const yBot = height - bottom - 2;
  const xOf = (t) => left + (tEnd > 0 ? (t / tEnd) * (width - left - 3) : 0) + 1;
  const yOf = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    const y = yTop + (1 - (clamped - min) / (max - min)) * (yBot - yTop);
    return y;
  };

  for (const run of runs) {
    let d = '';
    let pen = false;
    let lastX = null;
    let lastY = null;
    for (let i = 0; i < run.values.length; i++) {
      if (run.values[i] === undefined) { pen = false; continue; }
      lastX = xOf(run.tMs[i]);
      lastY = yOf(run.values[i]);
      d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
      pen = true;
    }
    if (d === '') continue;
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'spark-line spark-line-' + run.colorIndex);
    line.setAttribute('d', d);
    svg.appendChild(line);
    if (lastX !== null) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'spark-dot spark-dot-' + run.colorIndex);
      dot.setAttribute('cx', lastX.toFixed(1));
      dot.setAttribute('cy', lastY.toFixed(1));
      dot.setAttribute('r', size.dotR);
      svg.appendChild(dot);
    }
  }

  const textAt = (x, y, anchor, content) => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', size.labelClass);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', anchor);
    el.textContent = content;
    svg.appendChild(el);
  };
  textAt(left - 2, 8, 'end', sparkAxisNumber(labelMax));
  textAt(left - 2, height - bottom - 1, 'end', sparkAxisNumber(labelMin));
  textAt(left, height - 1, 'start', '0');
  textAt(width - 2, height - 1, 'end', (tEnd / 1000).toFixed(0) + 's');
  return svg;
}

function buildBarChart(values, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'spark-frame');
  frame.setAttribute('x', left);
  frame.setAttribute('y', 1);
  frame.setAttribute('width', width - left - 1);
  frame.setAttribute('height', height - bottom - 2);
  svg.appendChild(frame);

  let min = 0;
  let max = -Infinity;
  let defined = 0;
  for (const v of values) {
    if (v === undefined) continue;
    defined++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (defined === 0) return svg;
  const labelMax = max;
  if (min === max) { max = min === 0 ? 1 : max * 1.1; }

  const plotLeft = left + 1;
  const plotWidth = width - left - 3;
  const plotTop = 2;
  const plotHeight = height - bottom - 4;
  const yOf = (v) => plotTop + (1 - (v - min) / (max - min)) * plotHeight;
  const baseline = yOf(0);
  const slot = plotWidth / values.length;

  const textAt = (x, y, anchor, content) => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', size.labelClass);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', anchor);
    el.textContent = content;
    svg.appendChild(el);
  };

  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) continue;
    const barW = Math.max(4, slot * 0.6);
    const cx = plotLeft + (i + 0.5) * slot;
    const y = yOf(values[i]);
    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('class', 'spark-bar spark-bar-' + (i % 4));
    bar.setAttribute('x', (cx - barW / 2).toFixed(1));
    bar.setAttribute('y', Math.min(y, baseline).toFixed(1));
    bar.setAttribute('width', barW.toFixed(1));
    bar.setAttribute('height', Math.max(1, Math.abs(baseline - y)).toFixed(1));
    svg.appendChild(bar);
    textAt(cx, height - 1, 'middle', trialRunOrdinal(i));
  }
  textAt(left - 2, 8, 'end', sparkAxisNumber(labelMax));
  textAt(left - 2, height - bottom - 1, 'end', sparkAxisNumber(min));
  return svg;
}
