'use strict';

// Trace metrics, pure: every measurement system computed from the raw
// trace, shared by the live panel and the after-game charts.

//-------TRACE METRICS: COMPUTATION (pure; shared by live and final)-------

// The session-level mouse-dynamics features, computed in-page from the
// trace. Definitions and literature sources are those of
// analysis/biometrics/extract_features.py — the two implementations are
// kept in step (tests/metrics-biometrics-parity.js compares them on the
// synthetic trace), so a number shown here means exactly what the offline
// pipeline would compute for it.
//
// The same computations serve two views:
// - live: input changes sample the trace for the stats panel; the active
//   game clock advances elapsed-only values using cached input metrics;
// - final: once from reportResult, over the finished trace, for the
//   canonical after-game charts. Same functions,
//   complete data: live and final can never disagree in definition,
//   only in how much of the game they have seen.
//
// A value whose formula needs more data than the trace has yet (no
// strokes, no completed click, zero wall time) is undefined, rendered as
// an en dash — "not yet measurable", never a made-up zero.

// A stroke is a movement bout: event-driven mousemove sampling emits
// nothing while the cursor rests, so a gap >= STROKE_GAP_MS between
// consecutive samples separates two bouts.
const STROKE_GAP_MS = 100;

function traceMetricsMean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Map an angle difference into (-pi, pi] (JS % keeps the sign, so the
// negative branch needs the extra turn).
function wrapAngle(a) {
  let r = (a + Math.PI) % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  return r - Math.PI;
}

// Features of one movement bout, samples [a, b). A feature whose formula
// needs more points (or displacement) than the bout has is absent.
function strokeMetrics(t, x, y, a, b) {
  const count = b - a;
  const m = { durationMs: t[b - 1] - t[a] };
  if (count < 2) return m;

  let path = 0;
  const speeds = [];     // px/ms per segment
  const tMid = [];       // segment midpoint times, for the kinematic chain
  const thetas = [];     // heading per moving (nonzero-length) segment
  const thetaTMid = [];
  for (let i = a + 1; i < b; i++) {
    const dt = t[i] - t[i - 1];
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    const len = Math.hypot(dx, dy);
    path += len;
    speeds.push(len / dt);
    tMid.push((t[i] + t[i - 1]) / 2);
    if (len > 0) {
      thetas.push(Math.atan2(dy, dx));
      thetaTMid.push((t[i] + t[i - 1]) / 2);
    }
  }
  m.pathLengthPx = path;
  // Gamboa & Fred 2004: straightness = chord / path, in [0, 1].
  const chord = Math.hypot(x[b - 1] - x[a], y[b - 1] - y[a]);
  if (path > 0) m.straightness = chord / path;
  m.speedMeanPxPerMs = traceMetricsMean(speeds);
  let speedMax = 0;
  for (const s of speeds) if (s > speedMax) speedMax = s;
  m.speedMaxPxPerMs = speedMax;

  // Kinematic chain on segment midpoints: a_i = dv/dt, j_i = da/dt.
  if (count >= 3) {
    const accels = [];
    const accelTMid = [];
    for (let i = 1; i < speeds.length; i++) {
      accels.push((speeds[i] - speeds[i - 1]) / (tMid[i] - tMid[i - 1]));
      accelTMid.push((tMid[i] + tMid[i - 1]) / 2);
    }
    if (count >= 4) {
      const jerks = [];
      for (let i = 1; i < accels.length; i++) {
        jerks.push(Math.abs((accels[i] - accels[i - 1]) / (accelTMid[i] - accelTMid[i - 1])));
      }
      m.jerkMeanPxPerMs3 = traceMetricsMean(jerks);
    }
  }

  // Angular velocity over headings; defined only where the cursor displaced.
  if (thetas.length >= 2) {
    const omegas = [];
    for (let i = 1; i < thetas.length; i++) {
      omegas.push(Math.abs(wrapAngle(thetas[i] - thetas[i - 1]) / (thetaTMid[i] - thetaTMid[i - 1])));
    }
    m.angularVelocityMeanRadPerMs = traceMetricsMean(omegas);
  }
  return m;
}

// Mean over strokes of a per-stroke feature, over the strokes where it is
// defined; undefined when no stroke measured it.
function strokesMean(strokes, key) {
  const values = [];
  for (const s of strokes) if (s[key] !== undefined) values.push(s[key]);
  return values.length > 0 ? traceMetricsMean(values) : undefined;
}

function traceSilenceRatio(movementMs, wallDurationMs) {
  return wallDurationMs > 0 ? 1 - movementMs / wallDurationMs : undefined;
}

function computeTraceMetrics(sampleT, sampleX, sampleY, events, wallDurationMs) {
  const n = sampleT.length;

  const strokes = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || sampleT[i] - sampleT[i - 1] >= STROKE_GAP_MS) {
      strokes.push(strokeMetrics(sampleT, sampleX, sampleY, start, i));
      start = i;
    }
  }

  let movementMs = 0;
  for (const s of strokes) movementMs += s.durationMs;
  // Total path over ALL consecutive samples — the jumps across stroke gaps
  // are travel too (the measurement principle: fruitless motion existed).
  let totalPathPx = 0;
  for (let i = 1; i < n; i++) {
    totalPathPx += Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]);
  }
  let speedMaxPxPerMs;
  for (const s of strokes) {
    if (s.speedMaxPxPerMs !== undefined
        && (speedMaxPxPerMs === undefined || s.speedMaxPxPerMs > speedMaxPxPerMs)) {
      speedMaxPxPerMs = s.speedMaxPxPerMs;
    }
  }

  // Click features from the button-event stream. Pairing rule: each
  // 'ldown' matches the next 'lup'; an 'lup' with no open 'ldown' began
  // off the board cells and completes no measured click. Pause-and-click
  // (Zheng et al. CCS 2011): stillness between the last movement sample
  // and each press, left and right pooled.
  let leftClickCount = 0;
  let rightClickCount = 0;
  const holdsMs = [];
  const pausesMs = [];
  let openLdownT = null;
  let si = 0; // events and samples are both time-ordered
  for (const ev of events) {
    if (ev.kind === 'layout') continue;
    if (ev.kind === 'ldown' || ev.kind === 'rdown') {
      while (si < n && sampleT[si] <= ev.t) si++;
      if (si > 0) pausesMs.push(ev.t - sampleT[si - 1]);
    }
    if (ev.kind === 'ldown') {
      openLdownT = ev.t;
    } else if (ev.kind === 'lup') {
      if (openLdownT !== null) {
        holdsMs.push(ev.t - openLdownT);
        openLdownT = null;
        leftClickCount++;
      }
    } else if (ev.kind === 'rdown') {
      rightClickCount++;
    }
  }

  return {
    wallDurationMs: wallDurationMs,
    sampleCount: n,
    strokeCount: strokes.length,
    movementMs: movementMs,
    // Survey vocabulary (arXiv:2208.09061): share of the game spent with
    // the cursor still.
    silenceRatio: traceSilenceRatio(movementMs, wallDurationMs),
    totalPathPx: totalPathPx,
    speedMeanPxPerMs: strokesMean(strokes, 'speedMeanPxPerMs'),
    speedMaxPxPerMs: speedMaxPxPerMs,
    straightness: strokesMean(strokes, 'straightness'),
    jerkMeanPxPerMs3: strokesMean(strokes, 'jerkMeanPxPerMs3'),
    angularVelocityMeanRadPerMs: strokesMean(strokes, 'angularVelocityMeanRadPerMs'),
    leftClickCount: leftClickCount,
    rightClickCount: rightClickCount,
    clickDurationMeanMs: holdsMs.length > 0 ? traceMetricsMean(holdsMs) : undefined,
    pauseAndClickMeanMs: pausesMs.length > 0 ? traceMetricsMean(pausesMs) : undefined,
  };
}

// Sample standard deviation (n-1 denominator, R's sd()); NaN below two
// values, like R.
function traceMetricsSampleSd(values) {
  const n = values.length;
  if (n < 2) return NaN;
  const mean = traceMetricsMean(values);
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  return Math.sqrt(ss / (n - 1));
}

// Mean over segments/movements of a per-item feature, over the items
// where it is defined; undefined when none measured it. NaN values (an
// item measured it but the formula degenerated, e.g. sample entropy with
// no matching windows) propagate into the mean, exactly as R's mean()
// does — the display layer renders NaN as "not measurable".
function itemsMean(items, key) {
  const values = [];
  for (const it of items) if (it[key] !== undefined) values.push(it[key]);
  return values.length > 0 ? traceMetricsMean(values) : undefined;
}

//-------TRACE METRICS: SEGMENTATION (inter-click movements)-------

// The psychometric and clinical systems both analyze inter-click
// segments: the trajectory from the previous click (or trace start) to
// the next click, the click being the segment's response. This is the
// exact trial construction of analysis/mousetrap/trace_measures.R: a
// click is an 'lup' or 'rdown' event; the segment gets the previous
// click's point prepended (that is where the cursor stood) and the
// click's own point appended unless a sample already sits on that
// instant; segments with fewer than SEGMENT_MIN_SAMPLES points carry too
// little trajectory to measure and are skipped, like the R script skips
// them.
const SEGMENT_MIN_SAMPLES = 5;

function traceSegments(sampleT, sampleX, sampleY, events) {
  const segments = [];
  let lower = -Infinity;
  let prev = null;
  let si = 0; // events and samples are both time-ordered
  for (const ev of events) {
    if (ev.kind !== 'lup' && ev.kind !== 'rdown') continue;
    const t = [];
    const x = [];
    const y = [];
    const rawT = []; // actual mousemove times in the window, for pauses
    let rawOffset = 0; // index in t/x/y where the raw samples start
    if (prev !== null) { t.push(prev.t); x.push(prev.x); y.push(prev.y); rawOffset = 1; }
    while (si < sampleT.length && sampleT[si] <= ev.t) {
      if (sampleT[si] > lower) {
        t.push(sampleT[si]);
        x.push(sampleX[si]);
        y.push(sampleY[si]);
        rawT.push(sampleT[si]);
      }
      si++;
    }
    if (t.length === 0 || t[t.length - 1] < ev.t) {
      t.push(ev.t);
      x.push(ev.x);
      y.push(ev.y);
    }
    if (t.length >= SEGMENT_MIN_SAMPLES) {
      const t0 = t[0];
      segments.push({
        startT: t0,                      // trace time of the segment start
        t: t.map((v) => v - t0),         // segment-relative, like mousetrap
        x: x,
        y: y,
        rawT: rawT,                      // trace time (not rebased)
        rawOffset: rawOffset,            // rawT[i] is the point at t/x/y[rawOffset + i]
        click: ev,
      });
    }
    lower = ev.t;
    prev = ev;
  }
  return segments;
}

//-------TRACE METRICS: PSYCHOMETRIC (mousetrap measures per segment)-------

// An exact port of the mousetrap R package pipeline (Kieslich et al.) as
// analysis/mousetrap/trace_measures.R applies it: mt_derivatives ->
// mt_measures -> mt_time_normalize -> mt_sample_entropy, per inter-click
// segment, then per-game means. Ported from the installed package source
// (mousetrap 3.2.x), verified value-for-value against Rscript on the
// synthetic trace (tests/metrics-mousetrap-parity.js).

// Signed deviation of each point from the idealized straight line from
// the first to the last point (mt_deviations / points_on_ideal): distance
// to the orthogonal projection on the infinite line, negative where the
// ideal point lies below the actual one in y, all negated when the
// trajectory runs downward in y.
function mtDevIdeal(x, y) {
  const n = x.length;
  const dev = new Array(n);
  const sx = x[0];
  const sy = y[0];
  const ex = x[n - 1];
  const ey = y[n - 1];
  if (sx === ex && sy === ey) { dev.fill(0); return dev; }
  const dx = ex - sx;
  const dy = ey - sy;
  const len2 = dx * dx + dy * dy;
  for (let i = 0; i < n; i++) {
    const u = ((x[i] - sx) * dx + (y[i] - sy) * dy) / len2;
    const ix = sx + u * dx;
    const iy = sy + u * dy;
    let d = Math.hypot(ix - x[i], iy - y[i]);
    if (iy > y[i]) d = -d;
    dev[i] = d;
  }
  if (sy > ey) for (let i = 0; i < n; i++) dev[i] = -dev[i];
  return dev;
}

// mousetrap:::count_changes with threshold 0: merge consecutive nonzero
// position changes into same-sign runs; flips = runs - 1 (0 when the
// coordinate never moved).
function mtCountFlips(pos) {
  let runs = 0;
  let lastSign = 0;
  for (let i = 1; i < pos.length; i++) {
    const d = pos[i] - pos[i - 1];
    if (d === 0) continue;
    const sign = d > 0 ? 1 : -1;
    if (sign !== lastSign) { runs++; lastSign = sign; }
  }
  return runs > 0 ? runs - 1 : 0;
}

// mt_measures + mt_derivatives on one segment (rebased t). Includes the
// leading padded zero mousetrap stores in the vel/acc columns, hence the
// maxima never go below 0.
function mtSegmentMeasures(t, x, y) {
  const n = t.length;
  const dev = mtDevIdeal(x, y);

  let madIdx = 0;
  let adSum = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(dev[i]) > Math.abs(dev[madIdx])) madIdx = i;
    adSum += dev[i];
  }

  // AUC: pracma::polyarea's shoelace over the closed point polygon
  // (counterclockwise positive), then mousetrap's orientation flip so
  // that curvature away from the ideal line is positive.
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += x[i] * y[j] - x[j] * y[i];
  }
  let auc = area2 / 2;
  if ((y[n - 1] > y[0] && x[n - 1] > x[0]) || (y[n - 1] < y[0] && x[n - 1] < x[0])) {
    auc = -auc;
  }

  // initiation_time: timestamp of the sample before the first one that
  // has moved away from the start; RT when nothing ever moved.
  let initiationTimeMs = t[n - 1];
  for (let i = 1; i < n; i++) {
    if (x[i] !== x[0] || y[i] !== y[0]) { initiationTimeMs = t[i - 1]; break; }
  }

  // idle_time over position-constant steps; mousetrap's two degenerate
  // branches (never idle -> first timestamp, which is 0 after rebasing;
  // always idle -> RT).
  let constCount = 0;
  let idleSum = 0;
  for (let i = 1; i < n; i++) {
    if (x[i] === x[i - 1] && y[i] === y[i - 1]) {
      constCount++;
      idleSum += t[i] - t[i - 1];
    }
  }
  let idleTimeMs;
  if (constCount === 0) idleTimeMs = t[0];
  else if (constCount === n - 1) idleTimeMs = t[n - 1];
  else idleTimeMs = idleSum;

  // mt_derivatives: vel over each step; acc = diff(vel) over the step
  // times (not midpoints — mousetrap's own convention).
  const vel = [];
  for (let i = 1; i < n; i++) {
    vel.push(Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) / (t[i] - t[i - 1]));
  }
  let velMax = 0;
  for (const v of vel) if (v > velMax) velMax = v;
  let accMax = 0;
  for (let i = 1; i < vel.length; i++) {
    const a = (vel[i] - vel[i - 1]) / (t[i] - t[i - 1]);
    if (a > accMax) accMax = a;
  }

  return {
    mad: dev[madIdx],
    ad: adSum / n,
    auc: auc,
    xFlips: mtCountFlips(x),
    yFlips: mtCountFlips(y),
    initiationTimeMs: initiationTimeMs,
    idleTimeMs: idleTimeMs,
    velMaxPxPerMs: velMax,
    accMaxPxPerMs2: accMax,
    rtMs: t[n - 1],
  };
}

// mt_time_normalize: linear interpolation at nsteps equally spaced
// timestamps from first to last (R's approx(..., n = nsteps)).
function mtTimeNormalize(t, vals, nsteps) {
  const n = t.length;
  const out = new Array(nsteps);
  const t0 = t[0];
  const t1 = t[n - 1];
  let j = 0;
  for (let s = 0; s < nsteps; s++) {
    const tt = t0 + ((t1 - t0) * s) / (nsteps - 1);
    while (j < n - 2 && t[j + 1] < tt) j++;
    out[s] = vals[j] + (vals[j + 1] - vals[j]) * ((tt - t[j]) / (t[j + 1] - t[j]));
  }
  return out;
}

// mt_sample_entropy (m = 3, use_diff = TRUE) on a time-normalized x
// series: window-match counting over the first differences, dropping the
// last m-window exactly like the package does. NaN when no m-windows
// match within r (R's -log(0/0)).
function mtSampleEntropy(tnX, r, m) {
  const dx = [];
  for (let i = 1; i < tnX.length; i++) dx.push(tnX[i] - tnX[i - 1]);
  const windows = dx.length - m; // (length - m + 1) minus the dropped last
  let matchesM = 0;
  let matchesM1 = 0;
  for (let i = 0; i < windows - 1; i++) {
    for (let j = i + 1; j < windows; j++) {
      let maxd = 0;
      for (let k = 0; k < m; k++) {
        const d = Math.abs(dx[i + k] - dx[j + k]);
        if (d > maxd) maxd = d;
      }
      if (maxd <= r) {
        matchesM++;
        if (Math.max(maxd, Math.abs(dx[i + m] - dx[j + m])) <= r) matchesM1++;
      }
    }
  }
  return -Math.log(matchesM1 / matchesM);
}

const MT_TIME_NORMALIZE_STEPS = 101;
const MT_SAMPLE_ENTROPY_M = 3;

// Per-game means of the key mousetrap measures over the game's
// inter-click segments (the same key list trace_measures.R aggregates).
// The entropy tolerance radius r pools the time-normalized x-differences
// of this game's segments (0.2 * their sample SD) — the game is the
// pooling unit, in-page and offline alike, so a game's value never
// depends on which other games happen to sit in the same export.
function computePsychometrics(sampleT, sampleX, sampleY, events) {
  const segments = traceSegments(sampleT, sampleX, sampleY, events);
  if (segments.length === 0) return { segmentCount: 0 };
  const per = segments.map((seg) => mtSegmentMeasures(seg.t, seg.x, seg.y));

  const tn = segments.map((seg) => mtTimeNormalize(seg.t, seg.x, MT_TIME_NORMALIZE_STEPS));
  const pooledDiffs = [];
  for (const xs of tn) {
    for (let i = 1; i < xs.length; i++) pooledDiffs.push(xs[i] - xs[i - 1]);
  }
  const r = 0.2 * traceMetricsSampleSd(pooledDiffs);
  for (let i = 0; i < per.length; i++) {
    per[i].sampleEntropy = mtSampleEntropy(tn[i], r, MT_SAMPLE_ENTROPY_M);
  }

  return {
    segmentCount: segments.length,
    mad: itemsMean(per, 'mad'),
    ad: itemsMean(per, 'ad'),
    auc: itemsMean(per, 'auc'),
    xFlips: itemsMean(per, 'xFlips'),
    yFlips: itemsMean(per, 'yFlips'),
    initiationTimeMs: itemsMean(per, 'initiationTimeMs'),
    idleTimeMs: itemsMean(per, 'idleTimeMs'),
    velMaxPxPerMs: itemsMean(per, 'velMaxPxPerMs'),
    accMaxPxPerMs2: itemsMean(per, 'accMaxPxPerMs2'),
    sampleEntropy: itemsMean(per, 'sampleEntropy'),
    rtMs: itemsMean(per, 'rtMs'),
  };
}

//-------TRACE METRICS: CLINICAL (Hevelius-style movement features)-------

// The cursor-only subset of the Hevelius 32 (Gajos et al., Movement
// Disorders 2020; definitions and mapping in reference/hevelius/
// FEATURES.md), per inter-click movement (assumption A1: the same
// segments as the psychometric system), aggregated as per-game means over
// the movements where each feature is defined.
//
// Kinematic pipeline, deliberately close to Hevelius's published one:
// resample the trajectory at 100 Hz by linear interpolation, derive
// speed, then acceleration, then jerk, each low-pass filtered at 7 Hz
// with a Kaiser-window FIR (40 dB stopband, the published spec). One
// documented deviation: Hevelius additionally smooths positions with a
// Kalman filter whose parameters the papers do not state, so positions
// here go unsmoothed and the 7 Hz FIR carries all the smoothing.
//
// Not computed in-page: the block-variability features (CoV/SD across
// movements of equal difficulty — our movements have continuously varying
// distance, so those need difficulty residualization first, a modeling
// layer that belongs offline), and click duration (feature 24), which is
// the biometrics set's "hold" row already.
const HEVELIUS_DT_MS = 10;              // 100 Hz resample grid
const HEVELIUS_PAUSE_MS = 100;          // a pause: >= 100 ms between raw events
const HEVELIUS_SUB_START_PXMS = 0.1;    // submovement starts: speed crosses 100 px/s
const HEVELIUS_SUB_QUALIFY_PXMS = 0.5;  // ... and counts only if it reaches 500 px/s

// Modified Bessel function I0 by power series (converges fast for the
// small arguments a Kaiser window uses).
function besselI0(v) {
  let sum = 1;
  let term = 1;
  for (let k = 1; k <= 25; k++) {
    term *= (v / (2 * k)) * (v / (2 * k));
    sum += term;
  }
  return sum;
}

// Windowed-sinc low-pass FIR taps, Kaiser window, normalized to unity DC
// gain. Beta 3.3953 is the Kaiser formula's value for 40 dB stopband
// attenuation; 21 taps spans 0.2 s at 100 Hz.
function kaiserLowpassTaps(numTaps, cutoffHz, sampleHz, beta) {
  const taps = new Array(numTaps);
  const mid = (numTaps - 1) / 2;
  const fc = cutoffHz / sampleHz;
  const denom = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < numTaps; i++) {
    const k = i - mid;
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const frac = k / mid;
    taps[i] = sinc * (besselI0(beta * Math.sqrt(1 - frac * frac)) / denom);
    sum += taps[i];
  }
  for (let i = 0; i < numTaps; i++) taps[i] /= sum;
  return taps;
}

const HEVELIUS_FIR = kaiserLowpassTaps(21, 7, 100, 3.3953);

// Zero-phase FIR by symmetric convolution, holding the endpoints past the
// edges (replicate padding) so short movements are not shortened.
function firFilter(values, taps) {
  const n = values.length;
  const half = (taps.length - 1) / 2;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < taps.length; k++) {
      let idx = i + k - half;
      if (idx < 0) idx = 0;
      else if (idx >= n) idx = n - 1;
      acc += values[idx] * taps[k];
    }
    out[i] = acc;
  }
  return out;
}

// Linear resample of (t, x, y) onto a uniform dtMs grid from t[0].
function resampleUniform(t, x, y, dtMs) {
  const n = t.length;
  const steps = Math.max(2, Math.floor((t[n - 1] - t[0]) / dtMs) + 1);
  const xs = new Array(steps);
  const ys = new Array(steps);
  let j = 0;
  for (let s = 0; s < steps; s++) {
    const tt = t[0] + s * dtMs;
    while (j < n - 2 && t[j + 1] < tt) j++;
    const frac = Math.min(1, Math.max(0, (tt - t[j]) / (t[j + 1] - t[j])));
    xs[s] = x[j] + (x[j + 1] - x[j]) * frac;
    ys[s] = y[j] + (y[j + 1] - y[j]) * frac;
  }
  return { xs, ys, steps };
}

// The board cell rect for a click, from the latest layout snapshot at or
// before the click; null when the click hit no cell or no layout with
// nonzero cell size is known.
function cellRectAt(layout, index) {
  if (layout === null || index === null || index === undefined) return null;
  if (!(layout.width > 0) || !(layout.height > 0)) return null;
  const cellW = layout.width / layout.boardWidth;
  const cellH = layout.height / layout.boardHeight;
  const col = index % layout.boardWidth;
  const row = Math.floor(index / layout.boardWidth);
  return {
    left: layout.left + col * cellW,
    top: layout.top + row * cellH,
    width: cellW,
    height: cellH,
  };
}

// Merge intervals and total their overlap with [lo, hi].
function overlapMs(intervals, lo, hi) {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let curLo = null;
  let curHi = null;
  for (const [a, b] of clipped) {
    if (curLo === null || a > curHi) {
      if (curLo !== null) total += curHi - curLo;
      curLo = a;
      curHi = b;
    } else if (b > curHi) {
      curHi = b;
    }
  }
  if (curLo !== null) total += curHi - curLo;
  return total;
}

// Features of one movement. seg times are segment-relative except rawT
// (trace time); helper inputs carry the segment's button intervals and
// press event (trace time) and the target rect at click time.
function heveliusMovement(seg, buttonIntervals, pressT, targetRect) {
  const m = {};
  const relT = seg.t;
  const n = relT.length;
  m.movementTimeMs = relT[n - 1]; // feature 1 (A4: includes deduction time)

  // Pauses (>= 100 ms between raw mousemove events) within the movement:
  // features 31, 32. Hevelius defines the longest pause as 0 when none
  // occurred, so these exist whenever the movement has raw samples.
  const pauses = []; // [startT, endT] in trace time
  for (let i = 1; i < seg.rawT.length; i++) {
    if (seg.rawT[i] - seg.rawT[i - 1] >= HEVELIUS_PAUSE_MS) {
      pauses.push([seg.rawT[i - 1], seg.rawT[i]]);
    }
  }
  if (seg.rawT.length > 0) {
    m.pauseCount = pauses.length;
    m.longestPauseMs = 0;
    for (const [a, b] of pauses) if (b - a > m.longestPauseMs) m.longestPauseMs = b - a;
  }

  // Execution time (3): first to last raw mousemove, minus time the left
  // button was held; without pauses (4): additionally minus the union of
  // pause intervals (a pause while the button was held counts once).
  let execMs;
  let execNoPauseMs;
  if (seg.rawT.length >= 2) {
    const first = seg.rawT[0];
    const last = seg.rawT[seg.rawT.length - 1];
    execMs = last - first - overlapMs(buttonIntervals, first, last);
    execNoPauseMs = last - first
      - overlapMs(buttonIntervals.concat(pauses), first, last);
    m.executionTimeMs = execMs;
    m.executionTimeNoPausesMs = execNoPauseMs;
  }

  // Kinematics on the 100 Hz resampled, 7 Hz low-passed chain.
  const { xs, ys, steps } = resampleUniform(relT, seg.x, seg.y, HEVELIUS_DT_MS);
  const speedRaw = new Array(steps - 1);
  for (let i = 1; i < steps; i++) {
    speedRaw[i - 1] = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / HEVELIUS_DT_MS;
  }
  const speed = firFilter(speedRaw, HEVELIUS_FIR);
  let peakIdx = 0;
  for (let i = 1; i < speed.length; i++) if (speed[i] > speed[peakIdx]) peakIdx = i;
  m.peakSpeedPxPerMs = speed[peakIdx]; // feature 7

  let accel = [];
  let jerk = [];
  if (speed.length >= 2) {
    const accelRaw = new Array(speed.length - 1);
    for (let i = 1; i < speed.length; i++) {
      accelRaw[i - 1] = (speed[i] - speed[i - 1]) / HEVELIUS_DT_MS;
    }
    accel = firFilter(accelRaw, HEVELIUS_FIR);
    let accMax = accel[0];
    for (const a of accel) if (a > accMax) accMax = a;
    m.peakAccelPxPerMs2 = accMax; // feature 9
    if (accel.length >= 2) {
      const jerkRaw = new Array(accel.length - 1);
      for (let i = 1; i < accel.length; i++) {
        jerkRaw[i - 1] = (accel[i] - accel[i - 1]) / HEVELIUS_DT_MS;
      }
      jerk = firFilter(jerkRaw, HEVELIUS_FIR);
    }
  }

  // Submovement decomposition (fig S2 thresholds) on the smoothed speed.
  const subs = []; // {start, end} as speed indices (end exclusive)
  let subStart = null;
  let subPeak = 0;
  for (let i = 0; i < speed.length; i++) {
    if (subStart === null) {
      if (speed[i] >= HEVELIUS_SUB_START_PXMS) { subStart = i; subPeak = speed[i]; }
    } else {
      if (speed[i] > subPeak) subPeak = speed[i];
      if (speed[i] < HEVELIUS_SUB_START_PXMS) {
        if (subPeak >= HEVELIUS_SUB_QUALIFY_PXMS) subs.push({ start: subStart, end: i });
        subStart = null;
        subPeak = 0;
      }
    }
  }
  if (subStart !== null && subPeak >= HEVELIUS_SUB_QUALIFY_PXMS) {
    subs.push({ start: subStart, end: speed.length });
  }
  m.submovementCount = subs.length; // Table S4's 33rd input
  let main = null;
  for (const sub of subs) {
    if (peakIdx >= sub.start && peakIdx < sub.end) { main = sub; break; }
  }
  if (main !== null) {
    // Feature 21's numeric value is unstated in the papers (see
    // FEATURES.md "Definition status"); this uses its duration.
    m.mainSubmovementMs = (main.end - main.start) * HEVELIUS_DT_MS;
    // Fraction of the main submovement spent accelerating (30), read on
    // the smoothed speed within the submovement.
    let speedPeakInSub = main.start;
    for (let i = main.start; i < main.end; i++) {
      if (speed[i] > speed[speedPeakInSub]) speedPeakInSub = i;
    }
    if (main.end - main.start > 0) {
      m.mainSubAcceleratingFraction =
        (speedPeakInSub - main.start) / (main.end - main.start);
    }
    if (targetRect !== null) {
      const cx = targetRect.left + targetRect.width / 2;
      const cy = targetRect.top + targetRect.height / 2;
      // The sub's end index in position space: speed[i] spans positions
      // i..i+1, so the submovement ends at position index main.end.
      const endPos = Math.min(main.end, steps - 1);
      const startPos = Math.min(main.start, steps - 1);
      m.mainSubEndDistPx = Math.hypot(xs[endPos] - cx, ys[endPos] - cy); // feature 11
      // Fraction of the remaining distance to the target covered along
      // the task axis (12); can exceed 1 on overshoot.
      const ax = seg.x[n - 1] - seg.x[0];
      const ay = seg.y[n - 1] - seg.y[0];
      const axisLen = Math.hypot(ax, ay);
      if (axisLen > 0) {
        const ux = ax / axisLen;
        const uy = ay / axisLen;
        const proj = (px, py) => px * ux + py * uy;
        const remaining = proj(cx, cy) - proj(xs[startPos], ys[startPos]);
        if (remaining !== 0) {
          m.mainSubFractionCovered =
            (proj(xs[endPos], ys[endPos]) - proj(xs[startPos], ys[startPos])) / remaining;
        }
      }
    }
  }

  // Task-axis path statistics (13-17, 19, 20) on the actual pointer
  // samples; the axis is the start-to-end cursor line, signed deviation
  // as in mtDevIdeal.
  const dev = mtDevIdeal(seg.x, seg.y);
  let maxDev = 0;
  let absSum = 0;
  let devSum = 0;
  for (const d of dev) {
    if (Math.abs(d) > maxDev) maxDev = Math.abs(d);
    absSum += Math.abs(d);
    devSum += d;
  }
  m.maxAxisDeviationPx = maxDev;                    // 13
  m.movementVariabilityPx = traceMetricsSampleSd(dev); // 14 (SD of deviations)
  m.movementErrorPx = absSum / n;                   // 15
  m.movementOffsetPx = devSum / n;                  // 16
  let crossings = 0;
  let lastSide = 0;
  for (const d of dev) {
    if (d === 0) continue;
    const side = d > 0 ? 1 : -1;
    if (lastSide !== 0 && side !== lastSide) crossings++;
    lastSide = side;
  }
  m.axisCrossings = crossings;                      // 17
  m.directionChanges = mtCountFlips(dev);           // 19 (orthogonal component)
  const axisProj = new Array(n);
  {
    const ax = seg.x[n - 1] - seg.x[0];
    const ay = seg.y[n - 1] - seg.y[0];
    const axisLen = Math.hypot(ax, ay);
    for (let i = 0; i < n; i++) {
      axisProj[i] = axisLen > 0
        ? ((seg.x[i] - seg.x[0]) * ax + (seg.y[i] - seg.y[0]) * ay) / axisLen
        : 0;
    }
  }
  m.orthogonalDirectionChanges = mtCountFlips(axisProj); // 20 (parallel component)

  // Target re-entries (18) and verification time (22), when the target
  // rect is known. Verification: last raw move at or before the press
  // that sat inside the target, to the press.
  if (targetRect !== null) {
    const inside = (px, py) => px >= targetRect.left
      && px < targetRect.left + targetRect.width
      && py >= targetRect.top
      && py < targetRect.top + targetRect.height;
    let entries = 0;
    let wasInside = false;
    for (let i = 0; i < n; i++) {
      const now = inside(seg.x[i], seg.y[i]);
      if (now && !wasInside) entries++;
      wasInside = now;
    }
    if (entries > 0) m.targetReentries = entries - 1; // re-entries exclude the first entry
    if (pressT !== null) {
      let lastMoveT = null;
      let lastInside = false;
      for (let i = 0; i < seg.rawT.length; i++) {
        if (seg.rawT[i] > pressT) break;
        lastMoveT = seg.rawT[i];
        const pi = seg.rawOffset + i;
        lastInside = inside(seg.x[pi], seg.y[pi]);
      }
      if (lastMoveT !== null && lastInside) m.verificationTimeMs = pressT - lastMoveT;
    }
  }

  // Normalized jerk (28) and without pauses (29): (ET_np)^3 / v_peak^2
  // times the integral of squared jerk; 29 drops integrand samples lying
  // inside a pause. ET is execution time without pauses in both, per the
  // published formula.
  if (jerk.length > 0 && execNoPauseMs !== undefined && m.peakSpeedPxPerMs > 0) {
    let integral = 0;
    let integralNoPause = 0;
    for (let i = 0; i < jerk.length; i++) {
      const contrib = jerk[i] * jerk[i] * HEVELIUS_DT_MS;
      integral += contrib;
      // jerk[i] sits at resample step i (trace time seg.startT + i*dt,
      // up to the chain's small alignment); paused spans contribute no
      // real motion, so 29 excludes them.
      const tAbs = seg.startT + i * HEVELIUS_DT_MS;
      let paused = false;
      for (const [a, b] of pauses) {
        if (tAbs >= a && tAbs <= b) { paused = true; break; }
      }
      if (!paused) integralNoPause += contrib;
    }
    const scale = Math.pow(execNoPauseMs, 3) / (m.peakSpeedPxPerMs * m.peakSpeedPxPerMs);
    m.normalizedJerk = scale * integral;
    m.normalizedJerkNoPauses = scale * integralNoPause;
  }

  return m;
}

function computeHevelius(sampleT, sampleX, sampleY, events) {
  const segments = traceSegments(sampleT, sampleX, sampleY, events);
  if (segments.length === 0) return { movementCount: 0 };

  // Walk events once, tracking the current layout and pairing each
  // segment's ending click with its press and the button-held intervals
  // inside the segment window.
  const per = [];
  for (const seg of segments) {
    const windowLo = seg.startT;
    const windowHi = seg.click.t;
    let layout = null;
    let pressT = null;
    const buttonIntervals = [];
    let openDown = null;
    for (const ev of events) {
      if (ev.t > windowHi) break;
      if (ev.kind === 'layout') { layout = ev; continue; }
      if (ev.kind === 'ldown') {
        openDown = ev.t;
        if (seg.click.kind === 'lup' && ev.t >= windowLo) pressT = ev.t;
      } else if (ev.kind === 'lup' && openDown !== null) {
        buttonIntervals.push([openDown, ev.t]);
        openDown = null;
      } else if (ev.kind === 'rdown' && ev === seg.click) {
        pressT = ev.t;
      }
    }
    if (openDown !== null) buttonIntervals.push([openDown, windowHi]);
    const targetRect = cellRectAt(layout, seg.click.index);
    per.push(heveliusMovement(seg, buttonIntervals, pressT, targetRect));
  }

  // Click slip (26): distance between press and release of each completed
  // left click, from the event stream directly (independent of segments).
  const slips = [];
  let down = null;
  for (const ev of events) {
    if (ev.kind === 'ldown') down = ev;
    else if (ev.kind === 'lup' && down !== null) {
      slips.push(Math.hypot(ev.x - down.x, ev.y - down.y));
      down = null;
    }
  }

  return {
    movementCount: segments.length,
    movementTimeMs: itemsMean(per, 'movementTimeMs'),
    executionTimeMs: itemsMean(per, 'executionTimeMs'),
    executionTimeNoPausesMs: itemsMean(per, 'executionTimeNoPausesMs'),
    peakSpeedPxPerMs: itemsMean(per, 'peakSpeedPxPerMs'),
    peakAccelPxPerMs2: itemsMean(per, 'peakAccelPxPerMs2'),
    submovementCount: itemsMean(per, 'submovementCount'),
    mainSubmovementMs: itemsMean(per, 'mainSubmovementMs'),
    mainSubEndDistPx: itemsMean(per, 'mainSubEndDistPx'),
    mainSubFractionCovered: itemsMean(per, 'mainSubFractionCovered'),
    mainSubAcceleratingFraction: itemsMean(per, 'mainSubAcceleratingFraction'),
    maxAxisDeviationPx: itemsMean(per, 'maxAxisDeviationPx'),
    movementVariabilityPx: itemsMean(per, 'movementVariabilityPx'),
    movementErrorPx: itemsMean(per, 'movementErrorPx'),
    movementOffsetPx: itemsMean(per, 'movementOffsetPx'),
    axisCrossings: itemsMean(per, 'axisCrossings'),
    directionChanges: itemsMean(per, 'directionChanges'),
    orthogonalDirectionChanges: itemsMean(per, 'orthogonalDirectionChanges'),
    targetReentries: itemsMean(per, 'targetReentries'),
    verificationTimeMs: itemsMean(per, 'verificationTimeMs'),
    normalizedJerk: itemsMean(per, 'normalizedJerk'),
    normalizedJerkNoPauses: itemsMean(per, 'normalizedJerkNoPauses'),
    pauseCount: itemsMean(per, 'pauseCount'),
    longestPauseMs: itemsMean(per, 'longestPauseMs'),
    clickSlipPx: slips.length > 0 ? traceMetricsMean(slips) : undefined,
  };
}

//-------TRACE METRICS: WASTE (survey Tier 1/2 whole-game measures)-------

// The survey's own proposals (reference/mouse-motion-metrics.md, Tier
// 1/2), computed over the whole trace rather than per segment. The
// threshold constants are definitional parts of each metric.
const WASTE_PAUSE_MS = 250;      // a whole-game pause: >= 250 ms between samples
const WASTE_TURN_LEG_PX = 8;     // heading legs must displace this far
const FEINT_DWELL_MS = 300;      // a feint: dwell this long, then leave clickless

function computeWasteMetrics(sampleT, sampleX, sampleY, events) {
  const n = sampleT.length;

  // Pauses over the whole game (>= 250 ms between consecutive samples):
  // count, total, longest. Distinct from the Hevelius per-movement 100 ms
  // pauses — this is the "time paused" the survey proposed.
  let pauseCount = 0;
  let pausedMs = 0;
  let longestPauseMs = 0;
  for (let i = 1; i < n; i++) {
    const gap = sampleT[i] - sampleT[i - 1];
    if (gap >= WASTE_PAUSE_MS) {
      pauseCount++;
      pausedMs += gap;
      if (gap > longestPauseMs) longestPauseMs = gap;
    }
  }

  // Wander ratio: total cursor travel over the sum of straight lines
  // between consecutive clicks (1.0 = perfectly direct all game). The
  // fruitless travel stays in the numerator — that is the point.
  let totalPathPx = 0;
  for (let i = 1; i < n; i++) {
    totalPathPx += Math.hypot(sampleX[i] - sampleX[i - 1], sampleY[i] - sampleY[i - 1]);
  }
  let clickTravelPx = 0;
  let prevClick = null;
  for (const ev of events) {
    if (ev.kind !== 'lup' && ev.kind !== 'rdown') continue;
    if (prevClick !== null) {
      clickTravelPx += Math.hypot(ev.x - prevClick.x, ev.y - prevClick.y);
    }
    prevClick = ev;
  }

  // Direction changes: heading reversals of more than 90 degrees between
  // consecutive movement legs of >= 8 px each (the length floor keeps
  // pixel jitter out) — the x-flips analog on an open 2D board.
  let dirChanges = 0;
  let legDx = 0;
  let legDy = 0;
  let prevLegDx = null;
  let prevLegDy = null;
  for (let i = 1; i < n; i++) {
    legDx += sampleX[i] - sampleX[i - 1];
    legDy += sampleY[i] - sampleY[i - 1];
    if (Math.hypot(legDx, legDy) >= WASTE_TURN_LEG_PX) {
      if (prevLegDx !== null && prevLegDx * legDx + prevLegDy * legDy < 0) {
        dirChanges++;
      }
      prevLegDx = legDx;
      prevLegDy = legDy;
      legDx = 0;
      legDy = 0;
    }
  }

  // Feints: the cursor enters a board cell, stays over it for >= 300 ms
  // (entry to exit, exit observed), and no click happens during the
  // stay — approached, did nothing, left. An unfinished stay at trace end
  // has no exit and is not counted. The survey draft said "hidden cell";
  // the trace does not carry cell reveal state, so this counts dwells
  // over any board cell (the deviation is documented in the survey file).
  let feintCount = 0;
  {
    let layout = null;
    let li = 0; // next event to process for layout/click bookkeeping
    let curCell = null;
    let enterT = 0;
    let clickedDuring = false;
    for (let i = 0; i < n; i++) {
      // Events up to this sample: track layout changes and clicks.
      while (li < events.length && events[li].t <= sampleT[i]) {
        const ev = events[li];
        if (ev.kind === 'layout') layout = ev;
        else if (ev.kind === 'lup' || ev.kind === 'rdown') clickedDuring = true;
        li++;
      }
      let cell = null;
      if (layout !== null && layout.width > 0 && layout.height > 0) {
        const col = Math.floor((sampleX[i] - layout.left) / (layout.width / layout.boardWidth));
        const row = Math.floor((sampleY[i] - layout.top) / (layout.height / layout.boardHeight));
        if (col >= 0 && col < layout.boardWidth && row >= 0 && row < layout.boardHeight) {
          cell = row * layout.boardWidth + col;
        }
      }
      if (cell !== curCell) {
        if (curCell !== null && !clickedDuring && sampleT[i] - enterT >= FEINT_DWELL_MS) {
          feintCount++;
        }
        curCell = cell;
        enterT = sampleT[i];
        clickedDuring = false;
      }
    }
  }

  return {
    pauseCount: pauseCount,
    pausedMs: pausedMs,
    longestPauseMs: longestPauseMs,
    wanderRatio: clickTravelPx > 0 ? totalPathPx / clickTravelPx : undefined,
    dirChanges: dirChanges,
    feintCount: feintCount,
  };
}

//-------TRACE METRICS: CLICK CADENCE (press-to-press timing)-------

// Click-timing measures over button presses ('ldown' and 'rdown' — the
// motor acts; a release belongs to the same act). Wasted presses count
// the same as effective ones (the measurement principle) — the trace
// records the hand, not the board effect. The threshold constants are
// definitional parts of each metric.
const CADENCE_BURST_GAP_MS = 250;     // a burst gap: successive presses closer than this
const CADENCE_MOVING_WINDOW_MS = 100; // on the move: a cursor sample within this window before the press
const CADENCE_PEAK_WINDOW_MS = 1000;  // the rolling window for peak press rate

function computeClickCadence(sampleT, events) {
  const presses = [];
  for (const ev of events) {
    if (ev.kind === 'ldown' || ev.kind === 'rdown') presses.push(ev.t);
  }
  const m = {};
  if (presses.length > 0) {
    // Peak rate: the most presses inside any rolling window, two-pointer
    // over the chronological press times.
    let peak = 1;
    let lo = 0;
    for (let hi = 0; hi < presses.length; hi++) {
      while (presses[hi] - presses[lo] > CADENCE_PEAK_WINDOW_MS) lo++;
      if (hi - lo + 1 > peak) peak = hi - lo + 1;
    }
    m.peakPressesPerSec = peak / (CADENCE_PEAK_WINDOW_MS / 1000);
    // On the move: samples exist only while the cursor moves, so a press
    // with a sample inside the window before it was made mid-motion.
    let moving = 0;
    let si = 0;
    for (const t of presses) {
      while (si < sampleT.length && sampleT[si] <= t) si++;
      if (si > 0 && t - sampleT[si - 1] <= CADENCE_MOVING_WINDOW_MS) moving++;
    }
    m.movingPressShare = moving / presses.length;
  }
  if (presses.length >= 2) {
    const gaps = [];
    for (let i = 1; i < presses.length; i++) gaps.push(presses[i] - presses[i - 1]);
    gaps.sort((a, b) => a - b);
    // Quartiles by linear interpolation; p <= 0.75 and 2+ gaps keep the
    // interpolation index strictly inside the array.
    const q = (p) => {
      const at = (gaps.length - 1) * p;
      const lo2 = Math.floor(at);
      return gaps[lo2] + (at - lo2) * (gaps[lo2 + 1] - gaps[lo2]);
    };
    const median = q(0.5);
    m.gapMedianMs = median;
    // Two presses at one timestamp (both buttons in the same ms) can zero
    // the median; a ratio over zero is genuinely not measurable.
    m.gapSpreadRatio = median > 0 ? (q(0.75) - q(0.25)) / median : undefined;
    m.fastestGapMs = gaps[0];
    m.burstGapShare = gaps.filter((g) => g < CADENCE_BURST_GAP_MS).length / gaps.length;
  }
  return m;
}

//-------TRACE METRICS: QUEUE (hover-then-later-click waits)-------

// A queued click: the cursor dwelt over a cell (the feint rule: entered,
// stayed >= 300ms, left without clicking), moved away, and the player later
// clicked that same cell. The wait between leaving and clicking is the
// queue wait — the observable "noticed it, banked it, came back" interval.
// This is the observational cousin of the solver-replay queue metric
// (deducible-since timestamps), which remains unbuilt; no claim is made
// that the cell was already provable during the dwell.
const QUEUE_DWELL_MS = FEINT_DWELL_MS; // the same dwell rule feints use
const QUEUE_LEAD_MS = 500;             // dwell must end this long before the click

// Completed clickless cell dwells >= QUEUE_DWELL_MS, in trace order:
// {cell, enterT, exitT}. The same walk the feint counter runs, kept
// separate so the waste metrics' known answers stay untouched.
function collectClicklessDwells(sampleT, sampleX, sampleY, events) {
  const dwells = [];
  let layout = null;
  let li = 0;
  let curCell = null;
  let enterT = 0;
  let clickedDuring = false;
  for (let i = 0; i < sampleT.length; i++) {
    while (li < events.length && events[li].t <= sampleT[i]) {
      const ev = events[li];
      if (ev.kind === 'layout') layout = ev;
      else if (ev.kind === 'lup' || ev.kind === 'rdown') clickedDuring = true;
      li++;
    }
    let cell = null;
    if (layout !== null && layout.width > 0 && layout.height > 0) {
      const col = Math.floor((sampleX[i] - layout.left) / (layout.width / layout.boardWidth));
      const row = Math.floor((sampleY[i] - layout.top) / (layout.height / layout.boardHeight));
      if (col >= 0 && col < layout.boardWidth && row >= 0 && row < layout.boardHeight) {
        cell = row * layout.boardWidth + col;
      }
    }
    if (cell !== curCell) {
      if (curCell !== null && !clickedDuring && sampleT[i] - enterT >= QUEUE_DWELL_MS) {
        dwells.push({ cell: curCell, enterT: enterT, exitT: sampleT[i] });
      }
      curCell = cell;
      enterT = sampleT[i];
      clickedDuring = false;
    }
  }
  return dwells;
}

function computeQueueMetrics(sampleT, sampleX, sampleY, events) {
  const dwells = collectClicklessDwells(sampleT, sampleX, sampleY, events);
  // Board actions with a target cell: the left release and the right
  // press (the events that carry the cell the action landed on).
  const presses = events.filter((ev) =>
    (ev.kind === 'lup' || ev.kind === 'rdown') && ev.index !== null
    && ev.index !== undefined);
  const waits = [];
  for (const press of presses) {
    // The most recent prior dwell over the clicked cell that ended at
    // least QUEUE_LEAD_MS before the click (so the final approach's own
    // hover never counts as its queue).
    let wait;
    for (const dwell of dwells) {
      if (dwell.cell !== press.index) continue;
      if (dwell.exitT > press.t - QUEUE_LEAD_MS) break;
      wait = press.t - dwell.exitT;
    }
    if (wait !== undefined) waits.push(wait);
  }
  const m = { queuedClickCount: waits.length };
  if (presses.length > 0) m.queuedClickShare = waits.length / presses.length;
  if (waits.length > 0) {
    const sorted = [...waits].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    m.queueWaitMedianMs = sorted.length % 2 === 1
      ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    m.queueWaitMaxMs = sorted[sorted.length - 1];
  }
  return m;
}

//-------TRACE METRICS: RECOVERY (pace after measured mistakes)-------

// How the click pace responds to the player's own recorded mistakes:
// after each surviving mistake-tagged action (a no-op click, misclick,
// judged guess, and so on — anything the evaluator tagged), how long was
// the next action gap relative to the game's typical gap, and how many
// actions did it take to get back within pace? Deaths are excluded — a
// fatal action has no post-pace to measure. Timing runs over accepted
// board actions (the events decisions attach to), not raw button-downs.
const RECOVERY_PACE_RATIO = 1.5; // back at pace: a gap within 1.5x the median

function computeRecoveryMetrics(events) {
  const actions = events.filter((ev) =>
    (ev.kind === 'lup' || ev.kind === 'rdown') && ev.index !== null
    && ev.index !== undefined);
  const m = {};
  if (actions.length < 3) return m;
  const gaps = [];
  for (let i = 1; i < actions.length; i++) gaps.push(actions[i].t - actions[i - 1].t);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const baseline = sorted.length % 2 === 1
    ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (!(baseline > 0)) return m;
  const mistakes = events.filter((ev) => ev.kind === 'decision'
    && ev.evaluation && Array.isArray(ev.evaluation.mistakes)
    && ev.evaluation.mistakes.length > 0
    && ev.evaluation.result !== 'death');
  const nextGapRatios = [];
  const recoveryCounts = [];
  for (const mistake of mistakes) {
    // The decision's t is its input action's t; find that action.
    let k = -1;
    for (let i = 0; i < actions.length; i++) {
      if (actions[i].t <= mistake.t) k = i;
      else break;
    }
    if (k < 0 || k + 1 >= actions.length) continue;
    nextGapRatios.push((actions[k + 1].t - actions[k].t) / baseline);
    let over = 0;
    for (let i = k + 1; i < actions.length; i++) {
      if (actions[i].t - actions[i - 1].t <= RECOVERY_PACE_RATIO * baseline) break;
      over++;
    }
    recoveryCounts.push(over);
  }
  m.measuredMistakes = nextGapRatios.length;
  if (nextGapRatios.length > 0) {
    const med = (values) => {
      const s = [...values].sort((a, b) => a - b);
      const at = Math.floor(s.length / 2);
      return s.length % 2 === 1 ? s[at] : (s[at - 1] + s[at]) / 2;
    };
    m.postMistakeGapRatio = med(nextGapRatios);
    m.recoveryActionsMedian = med(recoveryCounts);
  }
  return m;
}

//-------TRACE METRICS: FITTS (aimed-movement difficulty vs time)-------

// Fitts' law data over the game's aimed movements: for each button press
// with a preceding press, the index of difficulty ID = log2(D/W + 1)
// (Shannon form; D the straight-line distance between the two press
// positions, W the board cell size from the layout) against the movement
// time from the first cursor sample after the previous press to the
// press. Stationary re-presses (no sample between, or D under the floor)
// are not aimed movements and stay out. Wasted presses count the same as
// effective ones — the trace records the hand, not the board effect.
const FITTS_MIN_DISTANCE_PX = 8; // jittery re-presses are not aimed movements

function computeFittsMetrics(sampleT, sampleX, sampleY, events) {
  let layout = null;
  let prevPress = null;
  const pairs = [];
  let si = 0;
  for (const ev of events) {
    if (ev.kind === 'layout') {
      layout = ev;
      continue;
    }
    if (ev.kind !== 'ldown' && ev.kind !== 'rdown') continue;
    const press = ev;
    if (prevPress !== null && layout !== null && layout.boardWidth > 0) {
      const cellW = layout.width / layout.boardWidth;
      const d = Math.hypot(press.x - prevPress.x, press.y - prevPress.y);
      // First cursor sample after the previous press: movement start.
      while (si < sampleT.length && sampleT[si] <= prevPress.t) si++;
      if (d >= FITTS_MIN_DISTANCE_PX && cellW > 0
          && si < sampleT.length && sampleT[si] < press.t) {
        pairs.push({
          id: Math.log2(d / cellW + 1),
          mtMs: press.t - sampleT[si],
        });
      }
    }
    prevPress = press;
  }
  const m = { pairs: pairs, movementCount: pairs.length };
  if (pairs.length > 0) {
    // Mean-of-ratios throughput (bits per second), the per-movement form.
    m.throughputBitsPerSec = pairs.reduce(
      (sum, p) => sum + (p.mtMs > 0 ? p.id / (p.mtMs / 1000) : 0), 0) / pairs.length;
  }
  return m;
}

//-------TRACE METRICS: SPATIAL BIAS (distance-normalized pace by region)-------

// Does the hand run slower or faster toward some parts of the board than
// travel distance alone predicts? The board's rules are the same in every
// row and column, but a mouse is not a uniform device — this measures the
// difference instead of assuming it away. Every consecutive pair of board
// actions contributes (distance between the two press positions, gap
// time); a robust Theil-Sen line fits gap ~ a + b*distance, and each
// action's residual (measured gap minus the fit's prediction at its
// distance) lands in the board region (a 3x3 grid of the board) holding
// its target cell. A region's median residual is its pace bias in ms:
// positive = slower than distance predicts. Fitting on distance-to-
// previous-press is what normalizes away the opening square and the
// geometry of where the previous click happened to be — only the part of
// the gap that distance cannot explain is attributed to the region.
const SPATIAL_REGIONS = 3;      // 3x3 board regions
const SPATIAL_MIN_PAIRS = 8;    // below this, a fit is noise

// Small local Theil-Sen (median of pairwise slopes, median intercept),
// kept inside the trace-metrics section so it stays pure and sliceable.
function spatialTheilSen(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j][0] - points[i][0];
      if (dx !== 0) slopes.push((points[j][1] - points[i][1]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  const med = (values) => {
    const s = [...values].sort((a, b) => a - b);
    const at = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[at] : (s[at - 1] + s[at]) / 2;
  };
  const b = med(slopes);
  const a = med(points.map(([x, y]) => y - b * x));
  return { a, b };
}

function computeSpatialBias(events) {
  let layout = null;
  const actions = [];
  for (const ev of events) {
    if (ev.kind === 'layout') layout = ev;
    else if ((ev.kind === 'lup' || ev.kind === 'rdown')
        && ev.index !== null && ev.index !== undefined && layout !== null) {
      actions.push({ ev: ev, boardWidth: layout.boardWidth, boardHeight: layout.boardHeight });
    }
  }
  const points = [];
  for (let i = 1; i < actions.length; i++) {
    const prev = actions[i - 1].ev;
    const cur = actions[i].ev;
    points.push({
      d: Math.hypot(cur.x - prev.x, cur.y - prev.y),
      gapMs: cur.t - prev.t,
      cell: cur.index,
      boardWidth: actions[i].boardWidth,
      boardHeight: actions[i].boardHeight,
    });
  }
  if (points.length < SPATIAL_MIN_PAIRS) return { pairCount: points.length };
  const fit = spatialTheilSen(points.map((p) => [p.d, p.gapMs]));
  if (fit === null) return { pairCount: points.length };
  const residualsByRegion = Array.from(
    { length: SPATIAL_REGIONS * SPATIAL_REGIONS }, () => []);
  for (const p of points) {
    const col = p.cell % p.boardWidth;
    const row = Math.floor(p.cell / p.boardWidth);
    const rc = Math.min(SPATIAL_REGIONS - 1,
      Math.floor(col * SPATIAL_REGIONS / p.boardWidth));
    const rr = Math.min(SPATIAL_REGIONS - 1,
      Math.floor(row * SPATIAL_REGIONS / p.boardHeight));
    residualsByRegion[rr * SPATIAL_REGIONS + rc]
      .push(p.gapMs - (fit.a + fit.b * p.d));
  }
  const med = (values) => {
    const s = [...values].sort((a, b) => a - b);
    const at = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[at] : (s[at - 1] + s[at]) / 2;
  };
  return {
    pairCount: points.length,
    aMs: fit.a,
    bMsPerPx: fit.b,
    regions: residualsByRegion.map((residuals) => ({
      count: residuals.length,
      medianResidualMs: residuals.length > 0 ? med(residuals) : undefined,
    })),
  };
}

//-------TRACE METRICS: ALL SYSTEMS COMBINED-------

// The object the display layer consumes: all four measurement systems
// over the same trace. The psychometric and clinical systems only see
// completed inter-click segments, so their values change only when a
// click lands — the live schedule exploits that (renderLiveTraceMetrics
// caches them between clicks).
function computeAllTraceMetrics(sampleT, sampleX, sampleY, events, wallDurationMs) {
  return {
    wallDurationMs: wallDurationMs,
    bio: computeTraceMetrics(sampleT, sampleX, sampleY, events, wallDurationMs),
    psych: computePsychometrics(sampleT, sampleX, sampleY, events),
    hev: computeHevelius(sampleT, sampleX, sampleY, events),
    waste: computeWasteMetrics(sampleT, sampleX, sampleY, events),
    cad: computeClickCadence(sampleT, events),
    queue: computeQueueMetrics(sampleT, sampleX, sampleY, events),
    rec: computeRecoveryMetrics(events),
    fitts: computeFittsMetrics(sampleT, sampleX, sampleY, events),
  };
}
