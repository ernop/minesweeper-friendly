'use strict';

// The displayed metrics, grouped by measurement system. Each group and each
// display has help: one or two plain sentences shown behind its label (what
// the number is, then only the defining detail or a caveat that prevents a
// likely misreading; docs/product/trace-metrics-panel.md). Each display also
// has of, the numeric extractor over the combined metrics object of
// computeAllTraceMetrics (undefined or NaN = not measurable on this trace,
// rendered as an en dash and a gap in the sparkline), and fmt, the formatter
// for the extracted number. Not everything computed is displayed (the
// clinical system computes more features than shown); per-stage
// configurability of what appears is planned.
const TRACE_METRIC_GROUPS = [
  { key: 'bio', name: 'dynamics',
    help: 'Cursor movement split into bouts: a gap of 100 ms or more between '
      + 'cursor samples starts a new bout. Same definitions as the offline '
      + 'feature extractor.',
    displays: [
      { label: 'strokes',
        help: 'Number of movement bouts in the game.',
        of: (m) => m.bio.strokeCount, fmt: (v) => String(v) },
      { label: 'moving',
        help: 'Total time spent inside movement bouts.',
        of: (m) => m.bio.movementMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'silence',
        help: 'Share of the game with the cursor still, including the time '
          + 'before the first click.',
        of: (m) => m.bio.silenceRatio, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'path',
        help: 'Total cursor travel in pixels, including jumps across pauses.',
        of: (m) => m.bio.totalPathPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'moving speed',
        help: 'Average cursor speed while moving: each bout\u2019s mean speed, '
          + 'averaged over bouts.',
        of: (m) => m.bio.speedMeanPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak speed',
        help: 'The fastest single sample-to-sample cursor speed in the game.',
        of: (m) => m.bio.speedMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'straightness',
        help: 'How straight each bout runs: start-to-end distance over path '
          + 'length, averaged over bouts. 1 is a straight line.',
        of: (m) => m.bio.straightness, fmt: (v) => v.toFixed(2) },
      { label: 'jerk',
        help: 'How abruptly acceleration changes within bouts, averaged over '
          + 'bouts. Sampling noise inflates it.',
        of: (m) => m.bio.jerkMeanPxPerMs3, fmt: (v) => v.toFixed(4) },
      { label: 'turn rate',
        help: 'How fast the movement direction turns within bouts, in radians '
          + 'per millisecond.',
        of: (m) => m.bio.angularVelocityMeanRadPerMs, fmt: (v) => v.toFixed(3) },
      { label: 'left clicks',
        help: 'Completed left clicks (press and release), whether or not they '
          + 'changed the board.',
        of: (m) => m.bio.leftClickCount, fmt: (v) => String(v) },
      { label: 'right clicks',
        help: 'Right-button presses on the board, whatever they did: flag, '
          + 'unflag, part of a chord, or nothing.',
        of: (m) => m.bio.rightClickCount, fmt: (v) => String(v) },
      { label: 'hold',
        help: 'Average time the left button stays down per click.',
        of: (m) => m.bio.clickDurationMeanMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'pause-and-click',
        help: 'Average stillness between the last cursor movement and each '
          + 'press.',
        of: (m) => m.bio.pauseAndClickMeanMs, fmt: (v) => Math.round(v) + 'ms' },
    ] },
  { key: 'waste', name: 'path and no-action events',
    help: 'Whole-game cursor travel, pauses, reversals, and cells visited '
      + 'without a click.',
    displays: [
      { label: 'wander',
        help: 'Total cursor travel divided by the straight-line distance '
          + 'between consecutive clicks. Travel before the first click counts, '
          + 'so 1.0 does not mean a perfectly direct game.',
        of: (m) => m.waste.wanderRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'pauses',
        help: 'Number of gaps of 250 ms or more between cursor samples.',
        of: (m) => m.waste.pauseCount, fmt: (v) => String(v) },
      { label: 'paused',
        help: 'Total time inside those 250 ms-or-longer gaps.',
        of: (m) => m.waste.pausedMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'longest pause',
        help: 'The longest of those gaps.',
        of: (m) => m.waste.longestPauseMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'turnarounds',
        help: 'Direction reversals of more than 90\u00b0 between movement legs of '
          + 'at least 8 px.',
        of: (m) => m.waste.dirChanges, fmt: (v) => String(v) },
      { label: 'feints',
        help: 'Times the cursor stayed on a cell for 300 ms or more and left '
          + 'without clicking it.',
        of: (m) => m.waste.feintCount, fmt: (v) => String(v) },
    ] },
  { key: 'cad', name: 'click timing',
    help: 'Timing between button presses, left and right together, clicks '
      + 'that changed nothing included.',
    displays: [
      { label: 'click gap',
        help: 'Median time between consecutive presses.',
        of: (m) => m.cad.gapMedianMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'cadence spread',
        help: 'How uneven the press timing is: the interquartile range of the '
          + 'gaps divided by their median. 0 is perfectly even.',
        of: (m) => m.cad.gapSpreadRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'fastest gap',
        help: 'The shortest time between two consecutive presses.',
        of: (m) => m.cad.fastestGapMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'peak rate',
        help: 'The most presses within any one-second window.',
        of: (m) => m.cad.peakPressesPerSec, fmt: (v) => v + '/s' },
      { label: 'burst share',
        help: 'Share of press-to-press gaps shorter than 250 ms.',
        of: (m) => m.cad.burstGapShare, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'on the move',
        help: 'Share of presses made while the cursor was still moving (a '
          + 'cursor sample within 100 ms before the press).',
        of: (m) => m.cad.movingPressShare, fmt: (v) => Math.round(v * 100) + '%' },
    ] },
  { key: 'queue', name: 'queued clicks',
    help: 'Clicks on a cell the cursor had paused over earlier (300 ms or '
      + 'more), then left, and came back to at least 500 ms later.',
    displays: [
      { label: 'queued clicks',
        help: 'Number of such clicks.',
        of: (m) => m.queue.queuedClickCount, fmt: (v) => String(v) },
      { label: 'queued share',
        help: 'Queued clicks as a share of all clicks on cells.',
        of: (m) => m.queue.queuedClickShare, fmt: (v) => Math.round(v * 100) + '%' },
      { label: 'queue wait',
        help: 'Median time from leaving the cell to coming back and clicking '
          + 'it.',
        of: (m) => m.queue.queueWaitMedianMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'longest wait',
        help: 'The longest such wait.',
        of: (m) => m.queue.queueWaitMaxMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
    ] },
  { key: 'rec', name: 'pace recovery',
    help: 'How your pace changes right after an action the game flagged as a '
      + 'mistake (a click that changed nothing, a contradiction, a judged '
      + 'guess), compared with the game\u2019s median gap between actions.',
    displays: [
      { label: 'mistakes measured',
        help: 'Flagged mistakes that did not end the game and were followed by '
          + 'another action.',
        of: (m) => m.rec.measuredMistakes, fmt: (v) => String(v) },
      { label: 'post-mistake gap',
        help: 'How long the next action took relative to the median gap, as a '
          + 'median over mistakes. 1.0 means no slowdown.',
        of: (m) => m.rec.postMistakeGapRatio, fmt: (v) => v.toFixed(2) + '\u00d7' },
      { label: 'recovery actions',
        help: 'How many following gaps stayed above 1.5\u00d7 the median before '
          + 'one fell back under it, as a median over mistakes. A slow run '
          + 'still going when the game ended counts as it stood.',
        of: (m) => m.rec.recoveryActionsMedian, fmt: (v) => String(v) },
    ] },
  { key: 'fitts', name: 'aimed movement (Fitts)',
    help: 'Movement time against target difficulty, log2(distance \u00f7 cell '
      + 'width + 1), for each press. You pick targets mid-puzzle, so thinking '
      + 'time is mixed in.',
    displays: [
      { label: 'movements',
        help: 'Presses at least 8 px from the previous press, with cursor '
          + 'movement in between.',
        of: (m) => m.fitts.movementCount, fmt: (v) => String(v) },
      { label: 'throughput',
        help: 'Target difficulty divided by movement time, averaged over those '
          + 'movements, in bits per second.',
        of: (m) => m.fitts.throughputBitsPerSec, fmt: (v) => v.toFixed(2) + ' bit/s' },
    ] },
  { key: 'psych', name: 'trajectory geometry',
    help: 'The shape of each click-to-click cursor path, using the mousetrap '
      + 'package\u2019s formulas, averaged over paths with at least 5 samples.',
    displays: [
      { label: 'segments',
        help: 'Number of click-to-click paths measured.',
        of: (m) => m.psych.segmentCount, fmt: (v) => String(v) },
      { label: 'MAD',
        help: 'Largest sideways distance from the straight line to the click, '
          + 'signed by side and averaged. Bends to opposite sides cancel.',
        of: (m) => m.psych.mad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'AUC',
        help: 'Signed area between the path and the straight line to the '
          + 'click, averaged. Bends to opposite sides cancel.',
        of: (m) => m.psych.auc, fmt: (v) => sparkAxisNumber(v) + 'px\u00b2' },
      { label: 'AD',
        help: 'Average signed distance from the straight line to the click, '
          + 'averaged over paths. Bends to opposite sides cancel.',
        of: (m) => m.psych.ad, fmt: (v) => Math.round(v) + 'px' },
      { label: 'x-flips',
        help: 'Left-right direction reversals per path, averaged.',
        of: (m) => m.psych.xFlips, fmt: (v) => v.toFixed(1) },
      { label: 'y-flips',
        help: 'Up-down direction reversals per path, averaged.',
        of: (m) => m.psych.yFlips, fmt: (v) => v.toFixed(1) },
      { label: 'initiation',
        help: 'Time from the previous click until the cursor starts moving, '
          + 'averaged.',
        of: (m) => m.psych.initiationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'idle',
        help: 'Time per path with the cursor position unchanged, averaged. The '
          + 'browser sends no samples while the cursor rests, so most '
          + 'stillness does not show here.',
        of: (m) => m.psych.idleTimeMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
      { label: 'vel max',
        help: 'Peak cursor speed per path, averaged.',
        of: (m) => m.psych.velMaxPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'acc max',
        help: 'Peak acceleration per path, averaged.',
        of: (m) => m.psych.accMaxPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'entropy',
        help: 'How irregular the left-right movement is over time (sample '
          + 'entropy), averaged over paths. Higher is less regular.',
        of: (m) => m.psych.sampleEntropy, fmt: (v) => v.toFixed(2) },
      { label: 'segment time',
        help: 'Time from one click to the next, averaged over paths.',
        of: (m) => m.psych.rtMs, fmt: (v) => (v / 1000).toFixed(1) + 's' },
    ] },
  { key: 'hev', name: 'movement geometry',
    help: 'Movement features from the Hevelius formulas, measured on each '
      + 'click-to-click movement after resampling to 100 Hz and smoothing at '
      + '7 Hz, then averaged over movements.',
    displays: [
      { label: 'execution',
        help: 'Time from the first to the last cursor movement, excluding time '
          + 'with the button held.',
        of: (m) => m.hev.executionTimeMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'exec no pauses',
        help: 'Execution time minus mid-movement stops of 100 ms or more.',
        of: (m) => m.hev.executionTimeNoPausesMs, fmt: (v) => (v / 1000).toFixed(2) + 's' },
      { label: 'smoothed peak speed',
        help: 'Peak smoothed speed of each movement.',
        of: (m) => m.hev.peakSpeedPxPerMs, fmt: (v) => Math.round(v * 1000) + 'px/s' },
      { label: 'peak accel',
        help: 'Peak smoothed acceleration of each movement.',
        of: (m) => m.hev.peakAccelPxPerMs2, fmt: (v) => v.toFixed(4) },
      { label: 'submovements',
        help: 'Speed pulses per movement: rises past 100 px/s that reach 500 '
          + 'px/s. One pulse is a single smooth motion; more pulses usually '
          + 'mean corrections.',
        of: (m) => m.hev.submovementCount, fmt: (v) => v.toFixed(1) },
      { label: 'main sub',
        help: 'Duration of the speed pulse that contains the movement\u2019s '
          + 'peak speed.',
        of: (m) => m.hev.mainSubmovementMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 'sub end dist',
        help: 'Distance from the clicked cell\u2019s center when that main pulse '
          + 'ends: how close the first fast motion lands.',
        of: (m) => m.hev.mainSubEndDistPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis dev',
        help: 'Largest distance from the straight start-to-end line.',
        of: (m) => m.hev.maxAxisDeviationPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'movement error',
        help: 'Average distance from the straight start-to-end line.',
        of: (m) => m.hev.movementErrorPx, fmt: (v) => Math.round(v) + 'px' },
      { label: 'axis crossings',
        help: 'Times the path crosses its straight start-to-end line.',
        of: (m) => m.hev.axisCrossings, fmt: (v) => v.toFixed(1) },
      { label: 'norm jerk',
        help: 'Smoothness score (normalized jerk, pauses excluded). Lower is '
          + 'smoother.',
        of: (m) => m.hev.normalizedJerkNoPauses, fmt: (v) => sparkAxisNumber(v) },
      { label: 'click slip',
        help: 'How far the cursor moves between pressing and releasing the left '
          + 'button, averaged over clicks.',
        of: (m) => m.hev.clickSlipPx, fmt: (v) => v.toFixed(1) + 'px' },
      { label: 'verification',
        help: 'Time between the last movement inside the clicked cell and the '
          + 'press, for movements that ended inside the cell.',
        of: (m) => m.hev.verificationTimeMs, fmt: (v) => Math.round(v) + 'ms' },
      { label: 're-entries',
        help: 'Times the cursor left the target cell and came back before '
          + 'clicking.',
        of: (m) => m.hev.targetReentries, fmt: (v) => v.toFixed(1) },
    ] },
];

// Series keys must be unique across groups, and a label may repeat in
// another group; group key + label is the identity of a displayed series.
function metricSeriesKey(group, display) {
  return group.key + ':' + display.label;
}

function createMetricSeries() {
  return { tMs: [], byKey: new Map(TRACE_METRIC_GROUPS.flatMap((group) =>
    group.displays.map((display) => [metricSeriesKey(group, display), []]))) };
}

function appendMetricSeries(series, metrics) {
  series.tMs.push(metrics.wallDurationMs);
  for (const group of TRACE_METRIC_GROUPS) {
    for (const display of group.displays) {
      const value = display.of(metrics);
      series.byKey.get(metricSeriesKey(group, display)).push(Number.isNaN(value) ? undefined : value);
    }
  }
}
