'use strict';

// The left stats panel: its session heading, live trace-metric rows and
// sparklines, the after-game motion charts, and update scheduling.

//-------TRACE METRICS: DISPLAY (the #metrics-panel column)-------

const metricsPanel = document.getElementById('metrics-panel');
const metricsPanelContent = document.getElementById('metrics-panel-content');

// The displayed metrics, grouped by measurement system. Each display:
// label; calc (how the value is computed, exactly); records (a literal
// description of the observation, without assigning a cause); of, the numeric extractor over
// the combined metrics object of computeAllTraceMetrics (undefined or
// NaN = not measurable on this trace, rendered as an en dash and a gap
// in the sparkline); fmt, the formatter for the extracted number. calc
// and records appear together as the row's hover tooltip. Not everything
// computed is displayed (the clinical system computes more features than
// shown); per-stage configurability of what appears is planned.
const TRACE_METRIC_GROUPS = [
  { key: 'bio', name: 'dynamics', definition:
      'behavioral-biometrics session features over movement bouts '
      + '(same definitions as the offline extractor)',
    displays: [
      { label: 'strokes',
        calc: 'number of movement bouts: consecutive cursor samples chain into '
          + 'one bout, and a gap of 100ms or more between samples starts the next',
        records: 'how many movement bouts the 100ms gap rule divided the sampled '
          + 'cursor path into; it does not identify why gaps occurred',
        of: (m) => m.bio.strokeCount, fmt: (v) => String(v) },
      { label: 'moving',
        calc: 'sum of bout durations (first to last sample of each bout)',
        records: 'the sampled time spanned by movement bouts; time outside those '
          + 'bouts is excluded, without assigning either span a cognitive cause',
        of: (m) => m.bio.movementMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'silence',
        calc: '1 minus moving time over wall-clock game time',
        records: 'the fraction of wall-clock game time outside movement bouts; '
          + 'the trace does not reveal what the player was doing during that time',
        of: (m) => m.bio.silenceRatio, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'path',
        calc: 'sum of distances between every consecutive pair of cursor '
          + 'samples, jumps across pauses included — fruitless travel counts',
        records: 'total cursor travel in viewport pixels over the sampled trace; '
          + 'the value alone does not identify why it differs between games',
        of: (m) => m.bio.totalPathPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'speed',
        calc: 'each bout\u2019s mean of its sample-to-sample speeds, then the '
          + 'mean over bouts',
        records: 'the mean sampled cursor speed within bouts, first averaged per '
          + 'bout and then across bouts; it is descriptive, not causal',
        of: (m) => m.bio.speedMeanPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak speed',
        calc: 'the single fastest sample-to-sample speed in any bout',
        records: 'the largest single sample-to-sample cursor speed observed in '
          + 'any measured bout of this game',
        of: (m) => m.bio.speedMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'straightness',
        calc: 'per bout, straight-line distance from its start to its end '
          + 'divided by the distance actually traveled (1 = a perfect line); '
          + 'mean over bouts',
        records: 'the geometric directness of each bout from its sampled start '
          + 'to end; it does not identify planning, searching, or fatigue',
        of: (m) => m.bio.straightness, fmt: (v) => v.toFixed(2) },
      { label: 'jerk',
        calc: 'per bout, the mean absolute rate of change of acceleration '
          + '(third derivative of position along the path, px/ms\u00b3, from '
          + 'segment-midpoint speeds); mean over bouts',
        records: 'the mean absolute third-derivative quantity computed from the '
          + 'sampled path; this app does not infer its cause or diagnose tremor',
        of: (m) => m.bio.jerkMeanPxPerMs3, fmt: (v) => v.toFixed(4) },
      { label: 'turn rate',
        calc: 'per bout, the mean absolute change of movement heading per ms '
          + '(rad/ms) between successive moving steps; mean over bouts',
        records: 'the mean absolute rate at which sampled movement heading '
          + 'changed within bouts; no identity or hardware conclusion is implied',
        of: (m) => m.bio.angularVelocityMeanRadPerMs, fmt: (v) => v.toFixed(3) },
      { label: 'left clicks',
        calc: 'completed left clicks: a press and its release both on the trace',
        records: 'completed left-button press/release pairs found in the trace; '
          + 'this is independent of whether the board state changed',
        of: (m) => m.bio.leftClickCount, fmt: (v) => String(v) },
      { label: 'right clicks',
        calc: 'right-button presses (flag actions)',
        records: 'right-button presses found in the trace, including presses '
          + 'whether or not their board effect was later undone',
        of: (m) => m.bio.rightClickCount, fmt: (v) => String(v) },
      { label: 'hold',
        calc: 'mean time from left-button press to its release',
        records: 'mean elapsed time from left-button press to release; this '
          + 'game does not use it to infer cognition, health, or diagnosis',
        of: (m) => m.bio.clickDurationMeanMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'pause-and-click',
        calc: 'for each press, the stillness between the last cursor movement '
          + 'and the press; mean over presses',
        records: 'mean elapsed time from the last sampled cursor movement to '
          + 'the following press; the reason for stillness is not observed',
        of: (m) => m.bio.pauseAndClickMeanMs, fmt: (v) => Math.round(v) + 'ms' },
    ] },
  { key: 'waste', name: 'path and no-action events', definition:
      'whole-game path ratios, sample gaps, direction reversals, and cell '
      + 'dwell-without-click counts',
    displays: [
      { label: 'wander',
        calc: 'total cursor travel divided by the sum of straight lines '
          + 'between consecutive click positions (1.0 = perfectly direct '
          + 'all game)',
        records: 'sampled cursor distance relative to straight lines between '
          + 'successive click positions; the excess distance has no assigned cause',
        of: (m) => m.waste.wanderRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'pauses',
        calc: 'count of gaps of 250ms or more between consecutive cursor '
          + 'samples over the whole game',
        records: 'the number of consecutive cursor-sample gaps at least 250ms '
          + 'long; it does not identify why the gaps occurred',
        of: (m) => m.waste.pauseCount, fmt: (v) => String(v) },
      { label: 'paused',
        calc: 'total time inside those 250ms-or-longer gaps',
        records: 'the summed duration of cursor-sample gaps at least 250ms long',
        of: (m) => m.waste.pausedMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'longest pause',
        calc: 'the single longest such gap',
        records: 'the longest cursor-sample gap of at least 250ms in the game; '
          + 'the trace does not identify what happened during it',
        of: (m) => m.waste.longestPauseMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'turnarounds',
        calc: 'heading reversals of more than 90\u00b0 between consecutive '
          + 'movement legs of at least 8px each (the length floor keeps pixel '
          + 'jitter out)',
        records: 'the count of qualifying sampled heading reversals; a reversal '
          + 'does not by itself establish a changed plan or confusion',
        of: (m) => m.waste.dirChanges, fmt: (v) => String(v) },
      { label: 'feints',
        calc: 'times the cursor entered a board cell, stayed 300ms or more, '
          + 'then left it without any click during the stay',
        records: 'cell visits lasting at least 300ms that ended without a click '
          + 'in that cell; intention and hesitation are not observed',
        of: (m) => m.waste.feintCount, fmt: (v) => String(v) },
    ] },
  { key: 'cad', name: 'click timing', definition:
      'press-to-press rhythm over all button presses, left and right '
      + 'together; wasted presses count the same as effective ones — the '
      + 'trace records the hand, not the board effect',
    displays: [
      { label: 'click gap',
        calc: 'median time between consecutive button presses over the '
          + 'whole game',
        records: 'the median elapsed time between consecutive button presses; '
          + 'it does not separate reading, deciding, and movement',
        of: (m) => m.cad.gapMedianMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'gap spread',
        calc: 'interquartile range of those gaps divided by their median',
        records: 'the spread of press gaps relative to their median: 0 means '
          + 'the measured gaps are equal, and larger values mean more dispersion',
        of: (m) => m.cad.gapSpreadRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'fastest gap',
        calc: 'the single shortest press-to-press gap of the game',
        records: 'the shortest elapsed time observed between two consecutive '
          + 'button presses in this game',
        of: (m) => m.cad.fastestGapMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'peak rate',
        calc: 'the most presses inside any rolling 1-second window',
        records: 'the largest number of button presses observed in any rolling '
          + 'one-second interval of this game',
        of: (m) => m.cad.peakPressesPerSec, fmt: (v) => v + '/s' },
      { label: 'burst share',
        calc: 'share of press-to-press gaps under 250ms',
        records: 'the fraction of measured press-to-press gaps shorter than '
          + '250ms; it does not establish fluency or intent',
        of: (m) => m.cad.burstGapShare, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'on the move',
        calc: 'share of presses with a cursor sample in the 100ms before '
          + 'the press (samples exist only while the cursor moves)',
        records: 'the fraction of presses preceded by a cursor-movement sample '
          + 'within 100ms; it does not identify the reason for that timing',
        of: (m) => m.cad.movingPressShare, fmt: (v) => Math.round(v * 100) + '%' },
    ] },
  { key: 'queue', name: 'queued clicks', definition:
      'clicks whose cell the cursor had already dwelt over earlier (the '
      + 'feint rule: a clickless stay of 300ms or more), left, and later '
      + 'came back to click — the observable hover-then-later-click queue',
    displays: [
      { label: 'queued clicks',
        calc: 'board actions whose cell had an earlier completed clickless '
          + 'dwell of 300ms or more that ended at least 500ms before the click',
        records: 'how many actions returned to a previously dwelt-over cell; '
          + 'whether the cell was already provable then is not measured',
        of: (m) => m.queue.queuedClickCount, fmt: (v) => String(v) },
      { label: 'queued share',
        calc: 'queued clicks over all board actions with a target cell',
        records: 'the fraction of cell-targeted actions that were queued by '
          + 'the dwell rule above',
        of: (m) => m.queue.queuedClickShare, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'queue wait',
        calc: 'per queued click, the time from leaving the dwelt-over cell '
          + 'to clicking it; median over queued clicks',
        records: 'the median leave-to-click interval of queued clicks; the '
          + 'reason for the delay is not observed',
        of: (m) => m.queue.queueWaitMedianMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'longest wait',
        calc: 'the single longest leave-to-click interval among queued clicks',
        records: 'the longest measured queue wait of this game',
        of: (m) => m.queue.queueWaitMaxMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
    ] },
  { key: 'rec', name: 'pace recovery', definition:
      'how the action pace responds to this game\u2019s own recorded '
      + 'surviving mistakes (no-op clicks, misclicks, judged guesses '
      + '\u2014 whatever the evaluator tagged), measured over accepted '
      + 'board actions against the game\u2019s median action gap',
    displays: [
      { label: 'mistakes measured',
        calc: 'surviving mistake-tagged actions with at least one later '
          + 'action to time (deaths have no post-pace and are excluded)',
        records: 'how many mistakes contribute to the recovery numbers below',
        of: (m) => m.rec.measuredMistakes, fmt: (v) => String(v) },
      { label: 'post-mistake gap',
        calc: 'per measured mistake, the next action gap divided by the '
          + 'game\u2019s median action gap; median over mistakes',
        records: 'how much longer than typical the action after a mistake '
          + 'took; 1.0 means no measurable slowdown, higher means slower',
        of: (m) => m.rec.postMistakeGapRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'recovery actions',
        calc: 'per measured mistake, how many consecutive following gaps '
          + 'exceeded 1.5\u00d7 the median gap before one returned within '
          + 'it; median over mistakes',
        records: 'the median number of actions pace stayed elevated after a '
          + 'mistake; 0 means the very next gap was already back at pace',
        of: (m) => m.rec.recoveryActionsMedian, fmt: (v) => String(v) },
    ] },
  { key: 'fitts', name: 'aimed movement (Fitts)', definition:
      'Fitts\u2019 law over the game\u2019s aimed movements: index of '
      + 'difficulty log2(distance/cell size + 1) per press against its '
      + 'movement time (first cursor sample after the previous press to '
      + 'the press); wasted presses count the same as effective ones',
    displays: [
      { label: 'movements',
        calc: 'presses at least 8px from the previous press with at least '
          + 'one cursor sample between them',
        records: 'how many aimed movements the Fitts measures below cover',
        of: (m) => m.fitts.movementCount, fmt: (v) => String(v) },
      { label: 'throughput',
        calc: 'per movement, index of difficulty over movement time; mean '
          + 'over movements (bits per second)',
        records: 'the mean per-movement Fitts throughput; it describes this '
          + 'game\u2019s aimed movements, not the player\u2019s capacity',
        of: (m) => m.fitts.throughputBitsPerSec, fmt: (v) => v.toFixed(2) + ' bit/s' },
    ] },
  { key: 'psych', name: 'trajectory geometry', definition:
      'mousetrap-formula trajectory measures per inter-click segment '
      + '(exact port of the R package), reported as means over segments; '
      + 'the game does not infer mental states from them',
    displays: [
      { label: 'segments',
        calc: 'number of inter-click trajectories measured: previous click to '
          + 'next click, needing at least 5 trajectory points',
        records: 'the number of qualifying inter-click trajectories included '
          + 'in the trajectory and movement means below',
        of: (m) => m.psych.segmentCount, fmt: (v) => String(v) },
      { label: 'MAD',
        calc: 'per segment, the signed maximum deviation of the path from the '
          + 'ideal straight line joining segment start to its click; mean over '
          + 'segments',
        records: 'the signed largest deviation from the start-to-click line, '
          + 'averaged over segments; conflict or attraction is not inferred',
        of: (m) => m.psych.mad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'AUC',
        calc: 'per segment, the signed area enclosed between the actual path '
          + 'and that ideal line (shoelace formula, negative when the path '
          + 'bows the other way); mean over segments',
        records: 'the signed area between each sampled segment and its '
          + 'start-to-click line, averaged over segments',
        of: (m) => m.psych.auc, fmt: (v) => sparkAxisNumber(v) + 'px\u00b2' },
      { label: 'AD',
        calc: 'per segment, the mean signed deviation over all path points; '
          + 'mean over segments',
        records: 'the signed mean deviation from the start-to-click line over '
          + 'all path samples, averaged over segments',
        of: (m) => m.psych.ad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'x-flips',
        calc: 'per segment, reversals of horizontal movement direction '
          + '(consecutive moves merge into same-direction runs; flips = runs '
          + 'minus 1); mean over segments',
        records: 'horizontal direction-run reversals in each sampled segment, '
          + 'averaged over segments; they do not prove a change of mind',
        of: (m) => m.psych.xFlips, fmt: (v) => v.toFixed(1) },
      { label: 'y-flips',
        calc: 'the same, vertically',
        records: 'vertical direction-run reversals in each sampled segment, '
          + 'averaged over segments',
        of: (m) => m.psych.yFlips, fmt: (v) => v.toFixed(1) },
      { label: 'initiation',
        calc: 'per segment, time from the segment\u2019s start until the '
          + 'cursor first moves; mean over segments',
        records: 'elapsed time from the segment start to its first sampled '
          + 'cursor movement; the app cannot partition its causes',
        of: (m) => m.psych.initiationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'idle',
        calc: 'per segment, total time of steps where the position did not '
          + 'change; mean over segments',
        records: 'sampled no-position-change time inside each segment, averaged '
          + 'over segments',
        of: (m) => m.psych.idleTimeMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'vel max',
        calc: 'per segment, the peak point-to-point velocity; mean over '
          + 'segments',
        records: 'the maximum point-to-point cursor speed in each segment, '
          + 'averaged over segments',
        of: (m) => m.psych.velMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'acc max',
        calc: 'per segment, the peak increase of velocity per ms; mean over '
          + 'segments',
        records: 'the maximum sampled increase in velocity per millisecond in '
          + 'each segment, averaged over segments',
        of: (m) => m.psych.accMaxPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'entropy',
        calc: 'per segment, sample entropy (m=3) of the differenced x '
          + 'trajectory after resampling to 101 equal time steps; the '
          + 'tolerance r is 0.2 \u00d7 the SD pooled over this game\u2019s '
          + 'segments; mean over segments',
        records: 'sample entropy of the resampled differenced x trajectory, '
          + 'averaged over segments; it does not diagnose restlessness',
        of: (m) => m.psych.sampleEntropy, fmt: (v) => v.toFixed(2) },
      { label: 'segment time',
        calc: 'per segment, time from its start to its click (mousetrap\u2019s '
          + 'RT); mean over segments',
        records: 'total elapsed time from one click to the next for qualifying '
          + 'segments; movement and nonmovement time are not separated',
        of: (m) => m.psych.rtMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
    ] },
  { key: 'hev', name: 'movement geometry', definition:
      'Hevelius-formula movement features per inter-click movement '
      + '(100Hz resample, 7Hz low-pass; see reference/hevelius/FEATURES.md), '
      + 'reported as means over movements; this game makes no clinical inference',
    displays: [
      { label: 'execution',
        calc: 'per movement, time from its first to its last mousemove, with '
          + 'time the button was held excluded; mean over movements',
        records: 'elapsed time from the first to last sampled movement, with '
          + 'button-hold time excluded, averaged over movements',
        of: (m) => m.hev.executionTimeMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'exec no pauses',
        calc: 'execution time with mid-movement stops of 100ms or more also '
          + 'subtracted',
        records: 'execution time after subtracting sampled gaps of at least '
          + '100ms; the app does not assign those gaps a cause',
        of: (m) => m.hev.executionTimeNoPausesMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'peak speed*',
        calc: 'per movement, the maximum of the smoothed speed (trajectory '
          + 'resampled at 100Hz, speed low-passed at 7Hz); mean over movements',
        records: 'the maximum low-pass-filtered speed in each movement, '
          + 'averaged over movements',
        of: (m) => m.hev.peakSpeedPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak accel',
        calc: 'per movement, the maximum of the smoothed acceleration; mean '
          + 'over movements',
        records: 'the maximum low-pass-filtered acceleration in each movement, '
          + 'averaged over movements',
        of: (m) => m.hev.peakAccelPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'submovements',
        calc: 'per movement, count of speed pulses that cross 100px/s and '
          + 'reach at least 500px/s before dropping back; mean over movements',
        records: 'the number of speed pulses meeting the stated thresholds in '
          + 'each movement, averaged over movements; no cause is assigned',
        of: (m) => m.hev.submovementCount, fmt: (v) => v.toFixed(1) },
      { label: 'main sub',
        calc: 'duration of the submovement containing the movement\u2019s '
          + 'peak speed; mean over movements',
        records: 'the duration of the threshold-defined speed pulse containing '
          + 'peak speed, averaged over movements',
        of: (m) => m.hev.mainSubmovementMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'sub end dist',
        calc: 'distance from the clicked cell\u2019s center at the moment the '
          + 'main submovement ends; mean over movements',
        records: 'distance from the clicked cell center when the main '
          + 'threshold-defined speed pulse ended, averaged over movements',
        of: (m) => m.hev.mainSubEndDistPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis dev',
        calc: 'per movement, the maximum distance of the path from the task '
          + 'axis (the straight line joining the movement\u2019s start and '
          + 'end); mean over movements',
        records: 'the maximum sampled perpendicular distance from the '
          + 'start-to-end axis, averaged over movements',
        of: (m) => m.hev.maxAxisDeviationPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'movement error',
        calc: 'per movement, the average absolute distance of the path from '
          + 'the task axis; mean over movements',
        records: 'the mean absolute sampled distance from the start-to-end '
          + 'axis in each movement, averaged over movements',
        of: (m) => m.hev.movementErrorPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis crossings',
        calc: 'per movement, times the path crossed the task axis; mean over '
          + 'movements',
        records: 'the number of sampled crossings of the start-to-end axis in '
          + 'each movement, averaged over movements; no cause is assigned',
        of: (m) => m.hev.axisCrossings, fmt: (v) => v.toFixed(1) },
      { label: 'norm jerk',
        calc: 'per movement, dimensionless (execution time without '
          + 'pauses)\u00b3 \u00f7 peak speed\u00b2 \u00d7 the integral of '
          + 'squared jerk, pause spans excluded from the integral; mean over '
          + 'movements',
        records: 'the stated dimensionless jerk integral after excluding '
          + 'pause spans, averaged over movements; it is not a diagnosis',
        of: (m) => m.hev.normalizedJerkNoPauses, fmt: (v) => sparkAxisNumber(v) },
      { label: 'click slip',
        calc: 'distance the cursor slid between button press and release; '
          + 'mean over completed left clicks',
        records: 'cursor distance between left-button press and release, '
          + 'averaged over completed left clicks',
        of: (m) => m.hev.clickSlipPx, fmt: (v) => v.toFixed(1) + 'px' },
      { label: 'verification',
        calc: 'time between the last movement inside the clicked cell and the '
          + 'button press; mean over movements where the cursor ended inside '
          + 'the cell',
        records: 'elapsed time from the last sampled movement inside the '
          + 'clicked cell to its button press; purpose is not observed',
        of: (m) => m.hev.verificationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 're-entries',
        calc: 'times the pointer left the clicked cell and came back before '
          + 'the click; mean over movements with a known target cell',
        records: 'the number of times the pointer left and re-entered the '
          + 'eventual clicked cell before the click, averaged over movements',
        of: (m) => m.hev.targetReentries, fmt: (v) => v.toFixed(1) },
    ] },
];

// Series keys must be unique across groups (labels repeat, e.g. "peak
// speed"); group key + label is the identity of a displayed series.
function metricSeriesKey(group, display) {
  return group.key + ':' + display.label;
}

// The per-game history of every displayed value, sampled on coalesced input
// and active-game clock changes, plus the final measurement.
// Display-side state only: nothing here is stored anywhere.
let metricsSeries = null;

function beginTraceMetricsSeries() {
  cancelMetricsUpdate();
  lastLiveMetrics = null;
  sessionChartsDirty = true;
  const byKey = new Map();
  for (const group of TRACE_METRIC_GROUPS) {
    for (const display of group.displays) {
      byKey.set(metricSeriesKey(group, display), []);
    }
  }
  metricsSeries = { tMs: [], byKey: byKey };
  liveSegmentCache = { clickEvents: -1, psych: null, hev: null };
}

function setMetricText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setMetricAttribute(element, name, value) {
  const text = String(value);
  if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}

function setMetricHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

// A tallish per-metric chart of the value over the game: y axis labeled
// with the series min and max, x axis from 0 to the latest elapsed
// seconds. Gaps (spans where the value was not yet measurable) break the
// line rather than being bridged.
function buildSparkline(tMs, values, size) {
  const { width, height, left, bottom } = size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const add = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
    return node;
  };
  add('rect', {
    class: 'spark-frame', x: left, y: 1,
    width: width - left - 1, height: height - bottom - 2,
  });
  const line = add('path', { class: 'spark-line' });
  const dot = add('circle', { class: 'spark-dot', r: size.dotR });
  const labels = [
    [left - 2, 8, 'end'],
    [left - 2, height - bottom - 1, 'end'],
    [left, height - 1, 'start'],
    [width - 2, height - 1, 'end'],
  ].map(([x, y, anchor]) => add('text', {
    class: size.labelClass, x, y, 'text-anchor': anchor,
  }));

  // Retain the SVG and its nodes: live samples change geometry and labels,
  // never the row or the scroll container that owns it.
  svg.updateSeries = (times, samples) => {
    let min = Infinity;
    let max = -Infinity;
    for (const value of samples) {
      if (value === undefined) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const empty = min === Infinity;
    for (const node of [line, dot, ...labels]) {
      setMetricAttribute(node, 'visibility', empty ? 'hidden' : 'visible');
    }
    if (empty) return;
    const labelMin = min;
    const labelMax = max;
    if (min === max) { min -= 0.5; max += 0.5; }
    const tEnd = times[times.length - 1];
    const xOf = (t) => left + (tEnd > 0 ? (t / tEnd) * (width - left - 3) : 0) + 1;
    const yOf = (v) => 1 + (1 - (v - min) / (max - min)) * (height - bottom - 4) + 1;
    let d = '';
    let pen = false;
    let lastX;
    let lastY;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] === undefined) { pen = false; continue; }
      lastX = xOf(times[i]);
      lastY = yOf(samples[i]);
      d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
      pen = true;
    }
    setMetricAttribute(line, 'd', d);
    setMetricAttribute(dot, 'cx', lastX.toFixed(1));
    setMetricAttribute(dot, 'cy', lastY.toFixed(1));
    const text = [sparkAxisNumber(labelMax), sparkAxisNumber(labelMin),
      '0', (tEnd / 1000).toFixed(0) + 's'];
    labels.forEach((label, i) => setMetricText(label, text[i]));
  };
  svg.updateSeries(tMs, values);
  return svg;
}

function appendTraceMetricsSeries(metrics) {
  metricsSeries.tMs.push(metrics.wallDurationMs);
  for (const group of TRACE_METRIC_GROUPS) {
    for (const display of group.displays) {
      metricsSeries.byKey.get(metricSeriesKey(group, display))
        .push(displayableNumber(display.of(metrics)));
    }
  }
}

// One metric as label + current value + chart of its series.
function buildMetricRow(group, display, metrics, series, size, rowClass) {
  const row = document.createElement('div');
  row.className = rowClass;
  const head = document.createElement('div');
  head.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = display.label;
  const valueEl = document.createElement('span');
  valueEl.className = 'metric-value';
  head.append(labelEl, valueEl);
  row.appendChild(head);
  const spark = buildSparkline(
    series.tMs, series.byKey.get(metricSeriesKey(group, display)), size);
  row.appendChild(spark);
  row.updateMetrics = (current, currentSeries) => {
    const value = displayableNumber(display.of(current));
    setMetricText(valueEl, value === undefined ? '\u2013' : display.fmt(value));
    spark.updateSeries(currentSeries.tMs,
      currentSeries.byKey.get(metricSeriesKey(group, display)));
  };
  row.updateMetrics(metrics, series);
  return row;
}

// The section header naming a measurement system, shared by the live
// panel and the after-game charts.
function buildMetricsGroupHead(group) {
  const head = document.createElement('div');
  head.className = 'metrics-group-head';
  head.textContent = group.name;
  return head;
}

// The metrics of the latest render, so toggler clicks and settings
// changes can update the panel without taking another input sample.
let lastLiveMetrics = null;

// Controls and live rows retain their DOM identity for the page session.
// Data updates never clear the scroll container or trigger board layout;
// ResizeObserver handles actual changes in the panel's dimensions.
let metricsPanelView = null;
let sessionChartsDirty = true;

function renderMetricsPanel(metrics) {
  if (!tracing()) cancelMetricsUpdate();
  renderMetricsPanelContent(metrics);
}

function renderMetricsPanelContent(metrics) {
  const showSession = settings.showSessionStats;
  const showLive = settings.showMotionStatsDuringGame
    && metrics !== null && tracing();
  if (metricsPanelView === null) {
    const head = document.createElement('div');
    head.className = 'metrics-panel-head';
    const phase = document.createElement('span');
    phase.className = 'metric-phase';
    phase.textContent = 'live';
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'metrics-toggle';
    hide.textContent = '\u00d7';
    hide.title = 'collapse the stats panel; this choice is saved';
    hide.addEventListener('click', () => {
      updateSettings({ metricsPanelCollapsed: true });
      refreshMetricsPanel();
    });
    head.append(phase, hide);
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'metrics-toggle';
    restore.textContent = 'stats \u25b8';
    restore.title = 'show the session / live motion stats panel again';
    restore.addEventListener('click', () => {
      updateSettings({ metricsPanelCollapsed: false });
      refreshMetricsPanel();
    });
    // The session heading holds the page's one session picker, so it stays in
    // every panel state, collapsed or with session stats switched off: ranks
    // won and game data still use the session. The panel never disappears.
    const sessionHead = buildMetricsGroupHead(SESSION_GROUP);
    sessionHead.classList.add('session-scope-head');
    sessionHead.appendChild(buildSessionScopeSelect());
    const session = document.createElement('div');
    const live = document.createElement('div');
    const grip = buildMetricsResizeGrip();
    metricsPanelContent.append(restore, head, sessionHead, session, live);
    metricsPanel.appendChild(grip);
    setMetricHidden(metricsPanel, false);
    metricsPanelView = {
      head, phase, restore, session, live, grip,
      sessionControlsKey: null, sessionCharts: null, liveRows: [], metrics: null,
    };
  }
  const view = metricsPanelView;
  metricsPanel.classList.toggle('collapsed', settings.metricsPanelCollapsed);
  const width = settings.metricsPanelCollapsed ? '' : settings.metricsPanelWidth + 'px';
  if (metricsPanel.style.width !== width) metricsPanel.style.width = width;
  setMetricHidden(view.restore, !settings.metricsPanelCollapsed);
  setMetricHidden(view.head, settings.metricsPanelCollapsed);
  setMetricHidden(view.grip, settings.metricsPanelCollapsed);
  setMetricHidden(view.phase, !showLive);
  setMetricHidden(view.session, settings.metricsPanelCollapsed || !showSession);
  setMetricHidden(view.live, settings.metricsPanelCollapsed || !showLive);
  setMetricAttribute(view.grip, 'aria-valuenow', settings.metricsPanelWidth);
  if (settings.metricsPanelCollapsed) return;

  if (showSession) {
    const controlsKey = JSON.stringify([
      settings.sessionAggregation, settings.sessionRateBasis,
      settings.sessionLookbackGames, settings.sessionLookbackSeconds,
      settings.sessionModeScope, settings.sessionDefinition,
    ]);
    if (view.sessionControlsKey !== controlsKey) {
      // Only an explicit settings change alters the control structure. A new
      // session definition rebuilds here too, not through the hover-deferred
      // path: the picker's option list closes over these charts, and charts
      // of the previous window must not linger under the pointer.
      const content = document.createDocumentFragment();
      view.sessionCharts = appendSessionSection(content);
      view.session.replaceChildren(content);
      view.sessionControlsKey = controlsKey;
      const resumeCharts = () => {
        if (sessionChartsDirty) scheduleMetricsUpdate({ session: true });
      };
      view.sessionCharts.addEventListener('mouseleave', resumeCharts);
      view.sessionCharts.addEventListener('focusout', resumeCharts);
      sessionChartsDirty = false;
    } else if (sessionChartsDirty
        && !view.sessionCharts.matches(':hover')
        && !view.sessionCharts.contains(document.activeElement)) {
      const content = document.createDocumentFragment();
      appendSessionCharts(content);
      hideSessionGameTooltip();
      const scrollTop = metricsPanelContent.scrollTop;
      view.sessionCharts.replaceChildren(content);
      metricsPanelContent.scrollTop = scrollTop;
      sessionChartsDirty = false;
    }
  }
  if (showLive && view.metrics !== metrics) {
    if (view.liveRows.length === 0) {
      const content = document.createDocumentFragment();
      for (const group of TRACE_METRIC_GROUPS) {
        content.appendChild(buildMetricsGroupHead(group));
        for (const display of group.displays) {
          const row = buildMetricRow(
            group, display, metrics, metricsSeries, SPARK_SMALL, 'metric-row');
          view.liveRows.push(row);
          content.appendChild(row);
        }
      }
      view.live.appendChild(content);
    } else {
      for (const row of view.liveRows) row.updateMetrics(metrics, metricsSeries);
    }
    view.metrics = metrics;
  }
}

// The panel's right-edge drag grip and its listeners survive data updates.
// Width and chart geometry both follow the pointer on the next animation
// frame; release persists the final width.
function buildMetricsResizeGrip() {
  const grip = document.createElement('div');
  grip.className = 'metrics-resize';
  grip.title = 'drag to resize the stats panel';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-label', 'resize stats panel');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-valuemin', String(METRICS_PANEL_WIDTH_MIN));
  grip.setAttribute('aria-valuemax', String(METRICS_PANEL_WIDTH_MAX));
  grip.setAttribute('aria-valuenow', String(settings.metricsPanelWidth));
  grip.tabIndex = 0;
  grip.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    settings.metricsPanelWidth = Math.min(METRICS_PANEL_WIDTH_MAX,
      Math.max(METRICS_PANEL_WIDTH_MIN, settings.metricsPanelWidth + direction * 10));
    saveSettings();
    refreshMetricsPanel();
  });
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = settings.metricsPanelWidth;
    let renderFrame = null;
    const move = (ev) => {
      settings.metricsPanelWidth = Math.min(METRICS_PANEL_WIDTH_MAX,
        Math.max(METRICS_PANEL_WIDTH_MIN, Math.round(startWidth + ev.clientX - startX)));
      metricsPanel.style.width = settings.metricsPanelWidth + 'px';
      if (renderFrame === null) {
        renderFrame = requestAnimationFrame(() => {
          renderFrame = null;
          refreshMetricsPanel();
        });
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (renderFrame !== null) cancelAnimationFrame(renderFrame);
      saveSettings();
      refreshMetricsPanel();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  return grip;
}

// The finished game's canonical metrics and its full series, snapshotted
// at game end for the after-game charts (see buildMotionStatsCharts);
// null while no finished game is on screen. beginTrace replaces
// metricsSeries with a fresh object, so these references stay the ended
// game's own.
let finalMotion = null;

// The after-game display: one semantic subgroup per measurement system.
// Each subgroup owns its heading and responsive chart row, so viewport
// wrapping can never mix the tail of one system with the next one.
// Canonical values: same computation as live, complete trace.
function buildMotionStatsCharts() {
  const nodes = [];
  for (const group of TRACE_METRIC_GROUPS) {
    const section = document.createElement('section');
    section.className = 'motion-metric-group';
    section.appendChild(buildMetricsGroupHead(group));
    const items = document.createElement('div');
    items.className = 'motion-metric-group-items';
    for (const display of group.displays) {
      items.appendChild(buildMetricRow(
        group, display, finalMotion.metrics, finalMotion.series, SPARK_LARGE,
        'metric-row motion-chart'));
    }
    section.appendChild(items);
    nodes.push(section);
  }
  const fittsChart = buildFittsCurveSection(finalMotion.metrics.fitts);
  if (fittsChart !== null) nodes.push(fittsChart);
  const spatialChart = buildSpatialBiasSection(finalMotion.spatial);
  if (spatialChart !== null) nodes.push(spatialChart);
  return nodes;
}

// The Fitts curve: this game's aimed movements as (index of difficulty,
// movement time) dots with the robust fit line. Under 8 movements a fit
// is noise, so the section is omitted.
function buildFittsCurveSection(fitts) {
  if (!fitts || !Array.isArray(fitts.pairs) || fitts.pairs.length < 8) return null;
  const section = document.createElement('section');
  section.className = 'motion-metric-group';
  section.appendChild(buildMetricsGroupHead({ name: 'Fitts curve' }));
  const idOf = (p) => p.id;
  const mtOf = (p) => p.mtMs;
  section.appendChild(buildScatter(
    fitts.pairs, null, idOf, mtOf,
    'difficulty (bits)', 'movement ms', null, null,
    {
      trimY: true,
      neutralDots: true,
      trendLines: trendLinesFor(fitts.pairs.map((p) => [p.id, p.mtMs]), []),
    }));
  return section;
}

// The spatial-bias heatmap: per board region (a 3x3 grid over the board),
// the median gap residual after the distance fit — how much slower (+ms,
// warm) or faster (-ms, cool) actions into that region ran than travel
// distance alone predicts. Distance normalization is what disentangles
// the region effect from where the previous click (or the opening square)
// happened to be.
function buildSpatialBiasSection(spatial) {
  if (!spatial || !Array.isArray(spatial.regions)) return null;
  const measured = spatial.regions.filter(
    (region) => region.medianResidualMs !== undefined);
  if (measured.length < 2) return null;
  const section = document.createElement('section');
  section.className = 'motion-metric-group';
  section.appendChild(buildMetricsGroupHead({ name: 'spatial pace bias' }));
  const grid = document.createElement('div');
  grid.className = 'spatial-bias-grid';
  const maxAbs = Math.max(
    1, ...measured.map((region) => Math.abs(region.medianResidualMs)));
  for (let rr = 0; rr < SPATIAL_REGIONS; rr++) {
    for (let rc = 0; rc < SPATIAL_REGIONS; rc++) {
      const region = spatial.regions[rr * SPATIAL_REGIONS + rc];
      const cell = document.createElement('div');
      cell.className = 'spatial-bias-cell';
      const value = document.createElement('span');
      value.className = 'spatial-bias-value';
      const count = document.createElement('span');
      count.className = 'spatial-bias-count';
      if (region.medianResidualMs === undefined) {
        value.textContent = '\u2013';
        count.textContent = region.count + ' clicks';
      } else {
        const ms = Math.round(region.medianResidualMs);
        value.textContent = (ms > 0 ? '+' : '') + ms + 'ms';
        count.textContent = region.count + (region.count === 1 ? ' click' : ' clicks');
        const strength = Math.min(1, Math.abs(ms) / maxAbs) * 0.55;
        cell.style.background = ms > 0
          ? 'rgba(211, 47, 47, ' + strength.toFixed(3) + ')'
          : 'rgba(46, 125, 50, ' + strength.toFixed(3) + ')';
      }
      cell.title = 'board region row ' + (rr + 1) + ', column ' + (rc + 1)
        + ': median gap residual over ' + region.count + ' action(s)';
      cell.append(value, count);
      grid.appendChild(cell);
    }
  }
  section.appendChild(grid);
  const caption = document.createElement('p');
  caption.className = 'spatial-bias-caption';
  caption.textContent = 'median action-gap residual after the robust '
    + 'gap-vs-distance fit (' + spatial.pairCount + ' action pairs; '
    + Math.round(spatial.bMsPerPx * 100) / 100 + ' ms/px): +ms = actions '
    + 'into this board region ran slower than travel distance predicts, '
    + '\u2212ms = faster. Regions follow the board, not the screen.';
  section.appendChild(caption);
  return section;
}

// Settings and resize actions invalidate the chart view.
// Ordinary samples leave the controls and panel structure mounted.
function refreshMetricsPanel() {
  sessionChartsDirty = true;
  renderMetricsPanel(tracing() ? lastLiveMetrics : null);
}

// Input can arrive much faster than these full-trace computations should
// run. A single trailing task coalesces bursts; it never schedules itself.
// The existing game clock supplies elapsed-time changes only during play.
const METRICS_SAMPLE_MIN_MS = 250;
let metricsUpdateFrame = null;
let metricsUpdateTimeout = null;
let metricsTraceDirty = false;
let metricsElapsedDirty = false;
let lastMetricsSampleAt = -Infinity;

function cancelMetricsUpdate() {
  if (metricsUpdateFrame !== null) cancelAnimationFrame(metricsUpdateFrame);
  if (metricsUpdateTimeout !== null) clearTimeout(metricsUpdateTimeout);
  metricsUpdateFrame = null;
  metricsUpdateTimeout = null;
}

function scheduleMetricsUpdate(changed = {}) {
  if (changed.trace) metricsTraceDirty = true;
  if (changed.elapsed) metricsElapsedDirty = true;
  if (changed.session || (changed.elapsed && sessionPlayFrom !== null
      && settings.sessionRateBasis === 'time')) sessionChartsDirty = true;
  if (document.hidden || metricsUpdateFrame !== null || metricsUpdateTimeout !== null) return;
  const requestFrame = () => {
    metricsUpdateTimeout = null;
    metricsUpdateFrame = requestAnimationFrame(flushMetricsUpdate);
  };
  const delay = Math.max(0, METRICS_SAMPLE_MIN_MS - (performance.now() - lastMetricsSampleAt));
  if (delay > 0) metricsUpdateTimeout = setTimeout(requestFrame, delay);
  else requestFrame();
}

function flushMetricsUpdate() {
  metricsUpdateFrame = null;
  if (document.hidden) return;
  const inputChanged = metricsTraceDirty;
  const elapsedChanged = metricsElapsedDirty;
  metricsTraceDirty = false;
  metricsElapsedDirty = false;
  if (tracing() && (inputChanged || elapsedChanged)) {
    renderLiveTraceMetrics(inputChanged);
  } else {
    renderMetricsPanel(tracing() ? lastLiveMetrics : null);
  }
}

// Completed inter-click segments change only on a click. Whole-trace
// computations change on input; an elapsed-only update reuses both and
// derives the silence share from the newly elapsed time.
let liveSegmentCache = { clickEvents: -1, psych: null, hev: null };

function renderLiveTraceMetrics(inputChanged = true) {
  const wallMs = Date.now() - trace.startedAt;
  let metrics;
  if (inputChanged || lastLiveMetrics === null) {
    let clickEvents = 0;
    for (const ev of trace.events) {
      if (ev.kind === 'lup' || ev.kind === 'rdown') clickEvents++;
    }
    if (clickEvents !== liveSegmentCache.clickEvents) {
      liveSegmentCache = {
        clickEvents,
        psych: computePsychometrics(trace.t, trace.x, trace.y, trace.events),
        hev: computeHevelius(trace.t, trace.x, trace.y, trace.events),
      };
    }
    metrics = {
      wallDurationMs: wallMs,
      bio: computeTraceMetrics(trace.t, trace.x, trace.y, trace.events, wallMs),
      psych: liveSegmentCache.psych,
      hev: liveSegmentCache.hev,
      waste: computeWasteMetrics(trace.t, trace.x, trace.y, trace.events),
      cad: computeClickCadence(trace.t, trace.events),
      queue: computeQueueMetrics(trace.t, trace.x, trace.y, trace.events),
      rec: computeRecoveryMetrics(trace.events),
      fitts: computeFittsMetrics(trace.t, trace.x, trace.y, trace.events),
    };
  } else {
    metrics = {
      ...lastLiveMetrics,
      wallDurationMs: wallMs,
      bio: {
        ...lastLiveMetrics.bio,
        wallDurationMs: wallMs,
        silenceRatio: traceSilenceRatio(lastLiveMetrics.bio.movementMs, wallMs),
      },
    };
  }
  appendTraceMetricsSeries(metrics);
  lastLiveMetrics = metrics;
  lastMetricsSampleAt = performance.now();
  renderMetricsPanel(metrics);
}
