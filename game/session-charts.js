'use strict';

// Session stats display: the page's one session picker, the session
// controls, the "when this play happened" strip, and every session chart.

//-------SESSION STATS: DISPLAY (top section of the left panel)-------

const SESSION_GROUP = {
  name: 'session',
};

// Session stats, ranks won, and game data share this setting; rebuild only
// their own content so selecting a window never resets the board or replay.
function setSessionDefinition(value) {
  settings.sessionDefinition = value;
  saveSettings();
  for (const view of document.querySelectorAll('[data-session-scope-view]')) view.dispatchEvent(new Event('session-scope-change'));
  sessionChartsDirty = true;
  refreshMetricsPanel();
}

// The page's only session picker, built once for the stats panel's session
// heading at the upper left. Ranks won and game data only say "session".
function buildSessionScopeSelect() {
  const select = document.createElement('select');
  select.id = 'session-definition-select';
  select.className = 'session-scope-select';
  select.setAttribute('aria-label', 'session');
  select.title = 'The one page-wide session: these session stats, ranks won in session, and game data’s (session) comparisons all use this wall-clock window. “today” starts at local midnight; it is not the last 24 hours.';
  for (const choice of SessionScope.choices) select.add(new Option(choice.label, choice.id));
  select.value = settings.sessionDefinition;
  select.addEventListener('change', () => setSessionDefinition(select.value));
  return select;
}

// Titles carry the unit (decided 2026-08-23, afternoon): "mouse speed
// px/s" sits flush on its plot and says everything the removed rotated
// y-axis caption used to say, without the sideways read or the lost
// horizontal space. Series with distinct units keep solo charts; the six
// legacy action rates share two unit-grouped plots, and all report
// categories share a third per-minute plot. Session diagnostics are
// independent of the after-game report display scope.
// Mouse speed and the fastclick gap share one two-line chart
// (2026-08-30, replacing their solo rows): their magnitudes live in the
// same few-hundreds range, and each endpoint label names its own series
// and unit ("mouse speed 916px/s", "fastclick gap 240ms"), so a shared
// bare numeric axis stays readable. Both series measure the same way on
// either rate basis, so the basis mapping is skipped (rawSpecs).
const SESSION_SPEED_GAP_SPECS = [
  { label: 'mouse speed', unit: '', color: '#3949ab',
    calc: 'cursor px traveled while a game was in progress over the '
      + 'trailing lookback of play, divided by its in-progress seconds; '
      + 'abandoned games count, between-game movement never does',
    records: 'cursor travel per in-progress second, averaged over the '
      + 'trailing lookback; a change in the series has no assigned cause',
    of: (b, i) => b.speedPxPerSec[i], fmt: (v) => Math.round(v) + 'px/s' },
  { label: 'fastclick gap', unit: '', color: '#e8710a',
    calc: 'median gap between consecutive useful presses of the same game '
      + 'when the press was made on the move (cursor moving within 100ms '
      + 'before it) and the gap was under 1s',
    records: 'the median qualifying press-to-press interval within the '
      + 'trailing lookback; only the timing rule above is observed',
    of: (b, i) => b.fastclickGapMs[i], fmt: (v) => Math.round(v) + 'ms' },
];

const SESSION_METRIC_SPECS = [
  { label: 'cadence spread \u00d7',
    calc: 'interquartile range of useful-press gaps within the trailing '
      + 'lookback divided by their median (games recorded before this page '
      + 'load cannot contribute raw gaps); per-game aggregation instead '
      + 'medians each game\u2019s stored spread, which is measured over all '
      + 'button presses of that game',
    records: 'press-rhythm dispersion: 0 means metronomic, larger means '
      + 'burstier; losses and wins both contribute, and no cause for a '
      + 'change is inferred',
    of: (b, i) => b.cadenceSpreadRatio[i], fmt: (v) => v.toFixed(2) + '\u00d7' },
  { label: 'excess game risk pp/m', category: 'gameRisk',
    calc: 'sum of the extra immediate loss probability chosen by survived '
      + 'game-risk actions over the trailing played-time lookback, divided '
      + 'by played minutes; protection rules are applied before comparing',
    records: 'percentage points of additional immediate loss probability '
      + 'per played minute; it is a probability sum, not observed deaths',
    of: (b, i) => b.excessRiskPctPerMin[i],
    fmt: (v) => v.toFixed(2) + 'pp/m',
    gameLabel: 'excess game risk pp/game',
    gameOf: (b, i) => b.excessRiskPctPerGame[i],
    gameFmt: (v) => v.toFixed(2) + 'pp/game' },
  { label: 'modeled life gap /m', category: 'lifeMaximization',
    calc: 'sum of the one-ply best-minus-selected expected-remaining-life '
      + 'gaps over the trailing played-time lookback, divided by played minutes',
    records: 'the optional model-relative expected-life gap per played minute; '
      + 'it is not a claim about player intent or long-horizon optimality',
    of: (b, i) => b.modeledLifeGapPerMin[i],
    fmt: (v) => v.toFixed(3) + '/m',
    gameLabel: 'modeled life gap /game',
    gameOf: (b, i) => b.modeledLifeGapPerGame[i],
    gameFmt: (v) => v.toFixed(3) + '/game' },
];

// The action-rates charts (combined 2026-08-23 afternoon; split by unit
// that evening): the six per-play-time rates draw as two shared plots —
// every /m series in one chart, every /s series in another — so lines
// on a chart are directly comparable and neither unit's scale squashes
// the other's. Each series keeps the unit that gives it a meaty,
// visible value under the stated choose-what-reads-best rule. No-op
// clicks moved /m -> /s on 2026-08-23 (user call, "to improve
// distribution"): its ~19/m line towered over the other /m rates and
// squashed them against the floor, while as ~0.3/s it sits comfortably
// on the /s chart's 0..1 scale next to click rate. fmt is the bare
// number; displays append the unit.
const SESSION_RATE_SPECS = [
  { label: 'flag removals', unit: '/m', color: '#00838f',
    calc: 'flags taken back per in-progress minute (win auto-flagging and '
      + 'flags left standing are not counted, only the removal itself)',
    records: 'flags removed per in-progress minute over the trailing lookback; '
      + 'the record does not reveal why a flag was removed',
    of: (b, i) => b.mismarksPerMin[i],
    gameOf: (b, i) => b.mismarksPerGame[i], fmt: (v) => v.toFixed(1) },
  { label: 'unused mine marks (wins)', unit: '/m', color: '#ad1457',
    calc: 'among won games only, correct mine-flag placements removed or '
      + 'left standing without ever contributing to an accepted chord, per '
      + 'minute played in those wins',
    records: 'a win-only observable no-chord-use proxy for unnecessary '
      + 'marking; losses are unmeasured, and mental use remains unknowable',
    of: (b, i) => b.unusedMarksPerMin[i],
    gameOf: (b, i) => b.unusedMarksPerGame[i], fmt: (v) => v.toFixed(1) },
  { label: 'mine marking', unit: '/s', color: '#388e3c',
    calc: 'flags placed per in-progress second (removals don\u2019t '
      + 'subtract; the win\u2019s auto-flagging is not yours and never '
      + 'counts)',
    records: 'flags placed per in-progress second over the trailing lookback; '
      + 'confidence, caution, and intent are not observed',
    of: (b, i) => b.flagsPerSec[i],
    gameOf: (b, i) => b.flagsPerGame[i], fmt: (v) => v.toFixed(2) },
  { label: 'misclicks', unit: '/m', color: '#d32f2f',
    calc: 'board-changing actions contradicted by facts provable from the '
      + 'visible board at click time, per in-progress minute: opening a proven '
      + 'mine, flagging a proven safe, removing a proven-mine flag, or chording '
      + 'through a visible contradiction',
    records: 'visible-board contradictions, independently of outcome; a fatal '
      + 'fatal visible contradiction also appears in deaths with mistakes, while a wrong flag can be nonfatal',
    of: (b, i) => b.misclicksPerMin[i],
    gameOf: (b, i) => b.misclicksPerGame[i], fmt: (v) => v.toFixed(1) },
  { label: 'no-op clicks', unit: '/s', color: '#e8a000',
    calc: 'board clicks that changed nothing (chords on unsatisfied or '
      + 'empty numbers, left-clicks on flags, right-clicks on revealed '
      + 'cells), per in-progress second',
    records: 'clicks that changed no board state per in-progress second; '
      + 'the record does not distinguish among possible causes',
    // The series stores per-minute; the spec converts for display.
    of: (b, i) => b.wastedPerMin[i] === undefined
      ? undefined : b.wastedPerMin[i] / 60,
    gameOf: (b, i) => b.wastedPerGame[i],
    fmt: (v) => v.toFixed(2) },
  { label: 'deaths with mistakes', unit: '/m', color: '#7b1fa2',
    calc: 'deaths whose fatal action carries at least one recorded mistake '
      + 'tag (for example, opening a proven mine, guessing while a safe move '
      + 'was available, or choosing higher risk), per in-progress minute',
    records: 'fatal actions with one or more evidence-backed mistake tags '
      + 'per in-progress minute; it does not identify intent or mental state',
    of: (b, i) => b.avoidablePerMin[i],
    gameOf: (b, i) => b.avoidablePerGame[i], fmt: (v) => v.toFixed(2) },
  { label: 'click rate', unit: '/s', color: '#1565c0',
    calc: 'board clicks that changed something (reveals, flags, chords) '
      + 'per in-progress second; no-op clicks are excluded — they have '
      + 'their own line',
    records: 'board-changing clicks per in-progress second over the trailing '
      + 'lookback; it does not measure decisions or identify why the rate changed',
    of: (b, i) => b.clicksPerSec[i],
    gameOf: (b, i) => b.usefulPerGame[i], fmt: (v) => v.toFixed(2) },
];

const SESSION_CATEGORY_RATE_SPECS = [
  { category: 'gameLoss', label: 'game loss', unit: '/m', color: '#8f1f0e',
    calc: 'fatal actions per played minute, whether avoidable, forced, protected, or unjudged',
    records: 'games ending in a fatal action per played minute; the category does not itself call the action a mistake',
    of: (b, i) => b.categoryPerMin.gameLoss[i],
    gameOf: (b, i) => b.categoryPerGame.gameLoss[i], fmt: (v) => v.toFixed(2) },
  { category: 'gameRisk', label: 'game risk', unit: '/m', color: '#d06a00',
    calc: 'survived actions that added actual immediate loss probability under the active rules, per played minute',
    records: 'nonfatal risk-increasing actions per played minute; magnitude has its own excess-game-risk chart',
    of: (b, i) => b.categoryPerMin.gameRisk[i],
    gameOf: (b, i) => b.categoryPerGame.gameRisk[i], fmt: (v) => v.toFixed(2) },
  { category: 'earlyGuess', label: 'early guess', unit: '/m', color: '#c9a227',
    calc: 'survived non-optimal guesses before a tenth of the safe squares were revealed, per played minute',
    records: 'early opening gambles, reported below mid-game risk and excluded from excess-game-risk magnitude',
    of: (b, i) => b.categoryPerMin.earlyGuess[i],
    gameOf: (b, i) => b.categoryPerGame.earlyGuess[i], fmt: (v) => v.toFixed(2) },
  { category: 'timeLoss', label: 'time loss', unit: '/m', color: '#1682b8',
    calc: 'no-progress inputs, visible board-state regressions, and win-only '
      + 'correct mine marks never consumed by a chord, per played minute',
    records: 'classified time-loss actions per played minute; no duration, '
      + 'mental use, or intent is inferred',
    of: (b, i) => b.categoryPerMin.timeLoss[i],
    gameOf: (b, i) => b.categoryPerGame.timeLoss[i], fmt: (v) => v.toFixed(2) },
  { category: 'lifeMaximization', label: 'life maximization', unit: '/m', color: '#8651ad',
    calc: 'actions with a positive one-ply expected-remaining-life gap per played minute',
    records: 'optional model-relative opportunities per played minute; magnitude has its own modeled-life-gap chart',
    of: (b, i) => b.categoryPerMin.lifeMaximization[i],
    gameOf: (b, i) => b.categoryPerGame.lifeMaximization[i], fmt: (v) => v.toFixed(2) },
  { category: 'measurementNotes', label: 'measurement notes', unit: '/m', color: '#777777', textColor: '#000000',
    calc: 'actions whose stored evidence is legacy or incomplete, per played minute',
    records: 'unclassified evidence notes per played minute, not mistakes',
    of: (b, i) => b.categoryPerMin.measurementNotes[i],
    gameOf: (b, i) => b.categoryPerGame.measurementNotes[i], fmt: (v) => v.toFixed(2) },
];

function sessionRateSpecsForBasis(specs) {
  if (settings.sessionRateBasis !== 'game') return specs;
  // Per-game values are whole-game magnitudes, so one decimal reads
  // fine (user call 2026-08-30; the /s rates keep their two decimals).
  return specs.map((spec) => ({
    ...spec, unit: '/game', of: spec.gameOf, fmt: (v) => v.toFixed(1),
  }));
}

function sessionMetricSpecForBasis(spec) {
  if (settings.sessionRateBasis !== 'game' || !spec.gameOf) return spec;
  return { ...spec, label: spec.gameLabel, of: spec.gameOf, fmt: spec.gameFmt };
}

// The game-endings lines: one cumulative percent line per ending kind,
// in one chart (docs/product/game-end-evaluation.md). The chart carries its
// own compact labels (2026-08-30): every death ending starts with
// "died: " so the losses read as one family, while the classification
// kinds stay exactly the report's fatal-action kinds — the report keeps
// its sentence wording (FATAL_STATUS_LABELS), and the two can never
// disagree because both derive from fatalActionStatusKind.
// Legacy-imported verdicts keep their old five-way lines as dashed
// provenance; 'win' leads. The "percent of mines unmarked when winning"
// line is a different quantity on the same percent axis (see
// appendSessionEndingsRow), drawn dotted in a deliberately un-endings
// blue so it can't be misread as an ending share. The color travels
// inline (line stroke, last-point dot fill, legend swatch), so the three
// can never disagree. `textChip` marks colors under 4.5:1 on white: the
// marker tooltip sets their text on a black chip, like the seconds age unit.
const SESSION_END_SPECS = [
  { kind: 'win', label: 'win', color: '#2e7d32' },
  { kind: 'win-unmarked', label: 'percent of mines unmarked when winning',
    color: '#1565c0', dash: '2 3', series: (b) => b.winUnmarkedFraction },
  // The per-mark calibration of unused correct marks — the primary
  // reading (decided 2026-08-30; see sessionUnusedMarkShare). The /m and
  // /game views on the rate charts remain as volume/time companions.
  { kind: 'win-unused-marks', label: 'percent of placed marks unused when winning',
    color: '#7b1fa2', dash: '2 3', series: (b) => b.unusedMarkShareFraction },
  { kind: 'likely-misclick', label: 'died: likely misclick',
    color: '#c2185b', dash: '4 2', series: (b) => b.likelyMisclickFraction },
  { kind: 'guess-early', label: 'died: early-game guess', color: '#c9a227', textChip: true },
  { kind: 'guess-min', label: 'died: minimum-risk forced guess', color: '#b8860b', textChip: true },
  { kind: 'guess-higher', label: 'died: higher-risk forced guess', color: '#d95f02', textChip: true },
  { kind: 'guess-unmeasured', label: 'died: forced guess (risk unmeasured)', color: '#9a6b2f' },
  { kind: 'guess-safe', label: 'died: guessed despite available safe move', color: '#c62828' },
  { kind: 'mine-safe', label: 'died: clicked forced mine despite available safe move', color: '#8e1111' },
  { kind: 'mine-forced', label: 'died: clicked forced mine when a guess was required', color: '#b71c1c' },
  { kind: 'proof-safe', label: 'died: Proof-or-die rule (safe move available)', color: '#8e1111' },
  { kind: 'proof-forced', label: 'died: Proof-or-die rule (no safe move)', color: '#d95f02', textChip: true },
  { kind: 'angel', label: 'died: ' + DEATH_KIND_LABELS.angel + ' (legacy)', color: '#b8860b', dash: '6 3', textChip: true },
  { kind: 'forced', label: 'died: ' + DEATH_KIND_LABELS.forced + ' (legacy)', color: '#b8860b', dash: '6 3', textChip: true },
  { kind: 'needless', label: 'died: ' + DEATH_KIND_LABELS.needless + ' (legacy)', color: '#c62828', dash: '6 3' },
  { kind: 'mine', label: 'died: ' + DEATH_KIND_LABELS.mine + ' (legacy)', color: '#8e1111', dash: '6 3' },
  { kind: 'chord', label: 'died: ' + DEATH_KIND_LABELS.chord + ' (legacy)', color: '#a51e36', dash: '6 3' },
  { kind: 'other', label: 'died: unjudged', color: '#999999', textColor: '#000000' },
];

// A session chart is a real chart, not a sparkline (decided 2026-08-22):
// the scatter plots' visual grammar — light gridlines, 1/2/5-step y
// ticks with minor tickmarks, played-time x ticks — at panel width.
// Neither axis carries a caption (x dropped earlier 2026-08-23, the
// rotated y caption that afternoon): the "-15m … now" x ticks already
// say "played time ago", and the row title carries the unit ("mouse
// speed px/s") sitting flush on the plot's top edge (T is the few px
// that keep a top gridline label inside the svg). The y range follows
// the measured values with modest padding rather than being forced to
// start at 0; x is the fixed played-time window ending at the current
// cumulative play coordinate. Breaks have already been removed.
// Unmeasurable points break the line, never bridged. Width follows the
// panel's dragged width (its grip, see
// buildMetricsResizeGrip): the chart fills the panel's content box —
// width minus the 16px padding and 2px border of the border-box panel.
const SESSION_CHART = { H: 150, L: 54, R: 8, T: 5, B: 22 };

// X-tick label for "this long of accumulated play ago". Whole hours stay
// whole; a 3h window's quarter ticks need the decimal (-2.3h, -1.5h).
function sessionAgoLabel(agoMs) {
  if (agoMs < 1) return 'now';
  if (agoMs >= 60 * 60 * 1000) {
    const hours = agoMs / (60 * 60 * 1000);
    return '-' + (Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)) + 'h';
  }
  return '-' + Math.round(agoMs / 60000) + 'm';
}

//-------SESSION STATS: REAL-WORLD PROVENANCE STRIP-------

function sessionDayLabel(wallMs, nowMs) {
  const dayStart = sessionLocalDayStart(wallMs);
  const today = new Date(sessionLocalDayStart(nowMs));
  if (dayStart === today.getTime()) return 'today';
  const yesterday = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime();
  if (dayStart === yesterday) return 'yesterday';
  return new Date(dayStart).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function sessionClockLabel(wallMs) {
  return new Date(wallMs).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sessionPlayedLabel(ms) {
  if (ms < 60 * 1000) return Math.round(ms / 1000) + 's';
  if (ms < 60 * 60 * 1000) return Math.round(ms / 60000) + 'm';
  const hours = ms / (60 * 60 * 1000);
  return (Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)) + 'h';
}

function sessionBreakLabel(ms) {
  if (ms < 60 * 60 * 1000) return Math.round(ms / 60000) + 'm';
  const hours = ms / (60 * 60 * 1000);
  return (hours >= 10 || Number.isInteger(hours)
    ? Math.round(hours).toFixed(0) : hours.toFixed(1)) + 'h';
}

// Section fills cycle per distinct local day, so every day's play shares
// one hue and a day change is an obvious color change.
const SESSION_DAY_FILLS = ['#d3e7f5', '#fbe3c3', '#d8efd8', '#f3ddf0', '#f5f0c8'];

function sessionSectionsForBuckets(buckets) {
  const x1 = buckets.playNowMs;
  const x0 = x1 - buckets.windowMs;
  return sessionWallSections(buckets.playSpans, x0, x1);
}

function sessionSectionDay(section) {
  return sessionLocalDayStart(Math.max(section.wallFrom, section.wallTo - 1));
}

// Dashed vertical marks on every session chart where the visible play
// crosses into another calendar day, aligned with the provenance strip.
function appendSessionDayBoundaries(svg, buckets, px, top, bottom) {
  const sections = sessionSectionsForBuckets(buckets);
  for (let i = 1; i < sections.length; i++) {
    if (sessionSectionDay(sections[i]) === sessionSectionDay(sections[i - 1])) {
      continue;
    }
    const line = document.createElementNS(SVG_NS, 'line');
    const x = px(sections[i].playFrom).toFixed(1);
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    line.setAttribute('y1', top);
    line.setAttribute('y2', bottom);
    line.setAttribute('class', 'session-day-boundary');
    svg.appendChild(line);
  }
}

// The "when was this played" strip: same width, margins, and x mapping as
// the session charts below it, so its sections line up column-for-column.
// Each block is one contiguous real-world stretch (new block after a
// ≥15m break or at midnight), filled per day, labeled inside when it
// fits; the summary row underneath always carries every section's full
// day, wall-clock range, played amount, and the break before it.
function appendSessionWhenRow(container, buckets) {
  // Sub-second slivers (a window edge clipping an old span to almost
  // nothing) would list as "0s played" noise; the strip states where the
  // meaningful play came from.
  const sections = sessionSectionsForBuckets(buckets)
    .filter((section) => section.playTo - section.playFrom >= 1000);
  const nowMs = Date.now();
  const { L, R } = SESSION_CHART;
  const W = settings.metricsPanelWidth - 18;
  const H = 26;
  const row = document.createElement('div');
  row.className = 'metric-row session-metric-row session-when-row';
  const headRow = document.createElement('div');
  headRow.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = 'when this play happened';
  labelEl.appendChild(chartHelpButton([
    'The charts below share a compressed x axis: only played time '
      + 'advances it, and real-world breaks take no width. This strip '
      + 'maps that axis back to the real world — each block is one '
      + 'continuous stretch of wall-clock time (a new block starts after '
      + 'a break of 15 minutes or more, and always at midnight).',
    'Blocks from the same calendar day share a color. The dashed '
      + 'vertical line drawn through every chart below marks where the '
      + 'play crosses into another day.',
  ]));
  headRow.appendChild(labelEl);
  row.appendChild(headRow);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-when-strip');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  const x1 = buckets.playNowMs;
  const x0 = x1 - buckets.windowMs;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  el('rect', {
    x: L, y: 2, width: W - L - R, height: H - 4, class: 'scatter-plot',
  });
  const fillOfDay = new Map();
  const fillFor = (day) => {
    if (!fillOfDay.has(day)) {
      fillOfDay.set(day, SESSION_DAY_FILLS[fillOfDay.size % SESSION_DAY_FILLS.length]);
    }
    return fillOfDay.get(day);
  };
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const bx = px(section.playFrom);
    const bw = px(section.playTo) - bx;
    el('rect', {
      x: bx.toFixed(1),
      y: 2,
      width: Math.max(0.5, bw).toFixed(1),
      height: H - 4,
      class: 'session-when-block',
      fill: fillFor(sessionSectionDay(section)),
    });
    if (i > 0 && sessionSectionDay(section) !== sessionSectionDay(sections[i - 1])) {
      const x = bx.toFixed(1);
      el('line', {
        x1: x, x2: x, y1: 0, y2: H, class: 'session-day-boundary',
      });
    }
    const day = sessionDayLabel(section.wallFrom, nowMs);
    const range = sessionClockLabel(section.wallFrom)
      + '–' + sessionClockLabel(section.wallTo);
    const full = day + ' ' + range;
    const startOnly = sessionClockLabel(section.wallFrom);
    // ~6.2px per character at this size; drop to times-only, then to the
    // start time, then to nothing, as the block narrows. The summary
    // underneath always has the rest.
    const text = bw >= full.length * 6.2 + 8 ? full
      : bw >= range.length * 6.2 + 8 ? range
        : bw >= startOnly.length * 6.2 + 8 ? startOnly : '';
    if (text !== '') {
      el('text', {
        x: (bx + bw / 2).toFixed(1),
        y: H / 2 + 4,
        class: 'session-when-label',
        'text-anchor': 'middle',
      }, text);
    }
  }
  row.appendChild(svg);

  const summary = document.createElement('div');
  summary.className = 'session-when-summary';
  if (sections.length === 0) summary.textContent = 'No played time yet';
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const item = document.createElement('span');
    item.className = 'session-when-item';
    const swatch = document.createElement('span');
    swatch.className = 'session-when-swatch';
    swatch.style.background = fillFor(sessionSectionDay(section));
    const text = document.createElement('span');
    let note = sessionDayLabel(section.wallFrom, nowMs) + ' '
      + sessionClockLabel(section.wallFrom) + '–' + sessionClockLabel(section.wallTo)
      + ' · ' + sessionPlayedLabel(section.playTo - section.playFrom) + ' played';
    if (i > 0) {
      const breakMs = section.wallFrom - sections[i - 1].wallTo;
      // A section that only exists because the clock crossed midnight is
      // continuous play, not a break.
      note += breakMs < SESSION_SECTION_BREAK_MS
        ? ' (continues past midnight)'
        : ' (after ' + sessionBreakLabel(breakMs) + ' away)';
    }
    text.textContent = note;
    item.append(swatch, text);
    summary.appendChild(item);
  }
  row.appendChild(summary);
  container.appendChild(row);
}

let sessionGameTooltip = null;
let sessionGameTooltipChart = null;

function sessionGamePlacement(game, records) {
  if (game.end !== 'win' || typeof game.timeMs !== 'number') return undefined;
  const wins = (records || []).filter((record) =>
    record.outcome === 'win' && typeof record.timeMs === 'number');
  let candidate = wins.find((record) => record.endedAt === game.endedAt);
  let ranked = wins;
  if (candidate === undefined) {
    candidate = { outcome: 'win', timeMs: game.timeMs, endedAt: game.endedAt };
    ranked = [...wins, candidate];
  }
  ranked = ranked.sort((a, b) =>
    a.timeMs - b.timeMs || a.endedAt - b.endedAt);
  const rank = ranked.indexOf(candidate) + 1;
  const total = ranked.length;
  return {
    rank,
    total,
    accolade: rank === 1 ? 'PB'
      : total >= 10 && rank / total <= 0.1 ? 'top 10%' : undefined,
  };
}

function sessionGameTimeOfDay(endedAt) {
  return new Date(endedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getSessionGameTooltip() {
  if (sessionGameTooltip !== null) return sessionGameTooltip;
  sessionGameTooltip = document.createElement('div');
  sessionGameTooltip.className = 'session-game-tooltip';
  sessionGameTooltip.hidden = true;
  document.body.appendChild(sessionGameTooltip);
  return sessionGameTooltip;
}

function hideSessionGameTooltip(chart) {
  if (chart !== undefined && sessionGameTooltipChart !== chart) return;
  if (sessionGameTooltip !== null) sessionGameTooltip.hidden = true;
  sessionGameTooltipChart = null;
}

// Thin game-end lines are shared by every session chart. Wins are green;
// losses reuse the endings chart's correctness-aware colors. Hover is handled
// once by the SVG, with nearest-line lookup for deterministic overlaps.
function appendSessionGameMarkers(svg, buckets, geometry, px) {
  const gameEnds = Array.isArray(buckets.gameEnds)
    ? buckets.gameEnds
    : (Array.isArray(buckets.wins)
      ? buckets.wins.map((win) => ({ ...win, end: 'win' })) : []);
  if (gameEnds.length === 0) return;
  const endingSpec = (end) => SESSION_END_SPECS.find(
    (spec) => spec.kind === end && spec.series === undefined)
      || SESSION_END_SPECS.find((spec) => spec.kind === 'other');
  const lines = gameEnds.map((game) => {
    const line = document.createElementNS(SVG_NS, 'line');
    const x = px(game.playAt).toFixed(1);
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    line.setAttribute('y1', geometry.top);
    line.setAttribute('y2', geometry.bottom);
    line.setAttribute('class', 'session-game-line');
    line.setAttribute('stroke', endingSpec(game.end).color);
    svg.appendChild(line);
    return line;
  });
  let active = -1;
  const clearActive = () => {
    if (active >= 0) lines[active].classList.remove('active');
    active = -1;
  };
  svg.addEventListener('pointermove', (event) => {
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = (event.clientX - bounds.left) * geometry.width / bounds.width;
    const y = (event.clientY - bounds.top) * geometry.height / bounds.height;
    if (x < geometry.left || x > geometry.right
        || y < geometry.top || y > geometry.bottom) {
      clearActive();
      hideSessionGameTooltip(svg);
      return;
    }
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let i = 0; i < gameEnds.length; i++) {
      const distance = Math.abs(px(gameEnds[i].playAt) - x);
      if (distance < nearestDistance) {
        nearest = i;
        nearestDistance = distance;
      }
    }
    // Six screen pixels is easy to acquire without turning the whole chart
    // into a tooltip trigger when game-end lines are sparse.
    const hitDistance = 6 * geometry.width / bounds.width;
    if (nearest < 0 || nearestDistance > hitDistance) {
      clearActive();
      hideSessionGameTooltip(svg);
      return;
    }
    if (active !== nearest) {
      clearActive();
      active = nearest;
      lines[active].classList.add('active');
      const game = gameEnds[active];
      const spec = endingSpec(game.end);
      const placement = sessionGamePlacement(
        game, history === null ? [] : history[game.modeKey]);
      const tooltip = getSessionGameTooltip();
      const primary = document.createElement('div');
      primary.className = 'session-game-tooltip-primary';
      const time = document.createElement('span');
      time.className = 'session-game-tooltip-time';
      time.textContent = typeof game.timeMs === 'number'
        ? (game.timeMs / 1000).toFixed(3) + 's' : '\u2013';
      const rank = document.createElement('span');
      rank.className = 'session-game-tooltip-rank';
      rank.style.color = spec.textColor ?? spec.color;
      if (spec.textChip) rank.classList.add('session-game-tooltip-rank-chip');
      rank.textContent = placement === undefined
        ? spec.label + ' \u00b7 unranked'
        : '#' + placement.rank + ' / ' + placement.total + ' lifetime';
      primary.append(time, rank);
      if (placement !== undefined && placement.accolade !== undefined) {
        const accolade = document.createElement('span');
        accolade.className = 'session-game-tooltip-accolade';
        accolade.textContent = placement.accolade;
        primary.appendChild(accolade);
      }
      if (game.likelyMisclick) {
        const inference = document.createElement('span');
        inference.className = 'session-game-tooltip-inference';
        inference.textContent = 'likely misclick';
        primary.appendChild(inference);
      }
      tooltip.replaceChildren(primary);
      if (typeof game.endedAt === 'number') {
        const when = document.createElement('div');
        when.className = 'session-game-tooltip-when';
        when.textContent = sessionGameTimeOfDay(game.endedAt);
        tooltip.appendChild(when);
      }
      tooltip.hidden = false;
      sessionGameTooltipChart = svg;
    }
    const tooltip = getSessionGameTooltip();
    const gap = 9;
    const left = Math.min(event.clientX + gap,
      window.innerWidth - tooltip.offsetWidth - 5);
    const top = Math.max(5, event.clientY - tooltip.offsetHeight - gap);
    tooltip.style.left = Math.max(5, left) + 'px';
    tooltip.style.top = top + 'px';
  });
  svg.addEventListener('pointerleave', () => {
    clearActive();
    hideSessionGameTooltip(svg);
  });
}

function buildSessionChart(buckets, spec) {
  const { H, L, R, T, B } = SESSION_CHART;
  const W = settings.metricsPanelWidth - 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-chart');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });

  const values = buckets.centers.map((_, i) => displayableNumber(spec.of(buckets, i)));

  const x0 = buckets.playNowMs - buckets.windowMs;
  const x1 = buckets.playNowMs;
  const yDomain = sessionYDomain(values);
  const y0 = yDomain.min;
  const y1 = yDomain.max;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const py = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);

  const xTicks = Array.from({ length: 5 },
    (_, i) => x0 + (x1 - x0) * i / 4);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    // A tick near the right edge keeps its centered label inside the svg.
    el('text', { x: Math.min(px(v), W - 17), y: H - B + 13, class: 'scatter-tick tick-x' },
      sessionAgoLabel(x1 - v));
  }
  const yTicks = niceTicks(y0, y1, 4);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const yDec = yStep >= 1 ? 0 : yStep >= 0.1 ? 1 : 2;
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' }, v.toFixed(yDec));
  }
  for (const v of minorTicks(yTicks, y0, y1)) {
    el('line', { x1: L - 4, y1: py(v), x2: L, y2: py(v), class: 'scatter-minor' });
  }
  appendSessionDayBoundaries(svg, buckets, px, T, H - B);
  appendSessionGameMarkers(svg, buckets, {
    width: W, height: H, left: L, right: W - R, top: T, bottom: H - B,
  }, px);

  let d = '';
  let pen = false;
  let lastX = null;
  let lastY = null;
  let lastValue = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) { pen = false; continue; }
    lastX = px(buckets.centers[i]);
    lastY = py(values[i]);
    lastValue = values[i];
    d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
    pen = true;
  }
  if (lastX !== null) {
    el('path', { class: 'spark-line', d: d });
    el('circle', { class: 'spark-dot', cx: lastX.toFixed(1), cy: lastY.toFixed(1), r: 3 });
    const putLeft = lastX > W - 80;
    const labelY = lastY < T + 14 ? lastY + 16 : lastY - 6;
    el('text', {
      x: (lastX + (putLeft ? -7 : 7)).toFixed(1),
      y: labelY.toFixed(1),
      class: 'session-point-value',
      'text-anchor': putLeft ? 'end' : 'start',
    }, spec.fmt(lastValue));
  }
  return svg;
}

// The game-endings chart: the session chart's visual grammar with one
// line per ending kind. The y axis auto-ranges to just above the highest
// plotted rate (2026-08-30, replacing the fixed 0–100% domain: a session
// whose lines all sit under 50% was wasting half the chart). Kinds that
// never occurred
// in the window stay off the chart (a page of flat zeros hides the real
// lines); 'win' always draws once any game has ended, because a 0% win
// line is itself the reading. The legend below the chart carries each
// drawn kind's color and current percentage, and hovering a legend entry
// highlights its line in the plot.
function buildSessionEndingsChart(buckets) {
  const { H, L, R, T, B } = SESSION_CHART;
  const W = settings.metricsPanelWidth - 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-chart');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });

  // First pass: which series draw, and how high any of them reaches.
  // The y domain tops out a bit above the highest plotted percentage
  // (never past 100), so low-rate sessions use the full plot height.
  const anyGames = buckets.endGames.some((count) => count > 0);
  const shown = [];
  let maxPct = 0;
  for (const spec of SESSION_END_SPECS) {
    const series = spec.series ? spec.series(buckets) : buckets.endFractions[spec.kind];
    const latest = latestDefined(buckets, (b, i) => series[i]);
    const occurred = series.some((value) => typeof value === 'number' && value > 0);
    // Never-occurred endings stay off the chart, except the win line,
    // which draws once any game ended (a 0% win line is itself the
    // reading) — and likewise the two win-only marking lines draw once
    // any win measured them (flagging every mine, or having every
    // placed mark do chord work, is a reading too).
    const show = anyGames && (spec.kind === 'win'
      || (spec.kind === 'win-unmarked' || spec.kind === 'win-unused-marks'
        ? latest !== undefined
        : occurred));
    if (!show) continue;
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(series[i]);
      if (v !== undefined) maxPct = Math.max(maxPct, v * 100);
    }
    shown.push({ spec, series, latest });
  }
  const yMax = Math.min(100, Math.max(10, maxPct * 1.08));

  const x0 = buckets.playNowMs - buckets.windowMs;
  const x1 = buckets.playNowMs;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const py = (pct) => H - B - (pct / yMax) * (H - T - B);

  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + (x1 - x0) * i / 4);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: Math.min(px(v), W - 17), y: H - B + 13, class: 'scatter-tick tick-x' },
      sessionAgoLabel(x1 - v));
  }
  for (const pct of niceTicks(0, yMax, 4)) {
    el('line', { x1: L, y1: py(pct), x2: W - R, y2: py(pct), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(pct) + 4, class: 'scatter-tick tick-y' },
      String(Math.round(pct * 10) / 10));
  }
  appendSessionDayBoundaries(svg, buckets, px, T, H - B);
  appendSessionGameMarkers(svg, buckets, {
    width: W, height: H, left: L, right: W - R, top: T, bottom: H - B,
  }, px);
  const drawn = [];
  for (const { spec, series, latest } of shown) {
    let d = '';
    let pen = false;
    let lastX = null;
    let lastY = null;
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(series[i]);
      if (v === undefined) { pen = false; continue; }
      lastX = px(buckets.centers[i]);
      lastY = py(v * 100);
      d += (pen ? 'L' : 'M') + lastX.toFixed(1) + ' ' + lastY.toFixed(1);
      pen = true;
    }
    if (lastX === null) continue;
    const pathAttrs = { class: 'end-line', stroke: spec.color, d: d };
    if (spec.dash) pathAttrs['stroke-dasharray'] = spec.dash;
    const path = el('path', pathAttrs);
    // A last-point dot keeps a one-bucket series visible (a path with a
    // single point draws nothing).
    const dot = el('circle', {
      class: 'end-dot', fill: spec.color, r: 2.5,
      cx: lastX.toFixed(1), cy: lastY.toFixed(1),
    });
    drawn.push({ spec, latest, nodes: [path, dot] });
  }
  return { svg, drawn };
}

// Hovering a series' legend entry or in-plot value label highlights that
// series (requested 2026-08-30, for every multi-line chart): the chart's
// other lines fade while the hovered series thickens to full strength.
function bindSeriesHighlight(svg, hotspot, nodes) {
  hotspot.classList.add('series-hotspot');
  hotspot.addEventListener('mouseenter', () => {
    svg.classList.add('series-focus');
    for (const node of nodes) node.classList.add('hot');
  });
  hotspot.addEventListener('mouseleave', () => {
    svg.classList.remove('series-focus');
    for (const node of nodes) node.classList.remove('hot');
  });
}

// An action-rates chart: every SESSION_RATE_SPECS series of one unit in
// one plot. The shared numeric scale auto-ranges around all measured
// lines, with readable 1/2/5 ticks labeled with the chart's unit. Each
// line ends in a dot with its current value floating to the point's
// left in the line's own color (nudged apart when lines end close
// together).
const SESSION_RATES_CHART = { H: 170, L: 54, R: 8, T: 5, B: 22 };

// Place long current-value labels throughout the plot rather than stacking
// every one against the right edge. Candidate boxes are scored for overlap,
// covered data points, leader length, and repeated horizontal position.
function sessionRateLabelLayout(labels, bounds) {
  const textHeight = 12;
  const plotWidth = bounds.right - bounds.left;
  const allPoints = labels.flatMap((label) => label.points);
  const placed = [];
  const overlapArea = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  for (const [order, label] of [...labels].sort((a, b) => a.y - b.y).entries()) {
    const width = Math.min(plotWidth - 4, label.text.length * 6.15);
    const candidates = [];
    const preferredBaseline = clamp(label.y + 4, bounds.top + textHeight, bounds.bottom);
    const baselines = [preferredBaseline];
    for (let y = bounds.top + textHeight; y <= bounds.bottom; y += textHeight + 1) {
      baselines.push(y);
    }
    const targetCenter = bounds.left + plotWidth
      * (0.2 + ((order * 0.37) % 0.6));
    for (const baseline of new Set(baselines.map(Math.round))) {
      for (let step = 0; step <= 6; step++) {
        const center = bounds.left + width / 2
          + (plotWidth - width) * step / 6;
        const box = {
          left: center - width / 2,
          right: center + width / 2,
          top: baseline - textHeight,
          bottom: baseline + 2,
        };
        const collision = placed.reduce(
          (sum, prior) => sum + overlapArea(box, prior.box), 0);
        const coveredPoints = allPoints.filter((point) =>
          point.x >= box.left - 2 && point.x <= box.right + 2
            && point.y >= box.top - 2 && point.y <= box.bottom + 2).length;
        const connectorX = clamp(label.x, box.left, box.right);
        const connectorY = clamp(label.y, box.top, box.bottom);
        const leaderLength = Math.hypot(
          connectorX - label.x, connectorY - label.y);
        const repeatedX = placed.reduce((sum, prior) =>
          sum + Math.max(0, 70 - Math.abs(center - prior.center)), 0);
        candidates.push({
          x: center,
          y: baseline,
          anchor: 'middle',
          box,
          center,
          connectorX,
          connectorY,
          score: collision * 1e6 + coveredPoints * 1800
            + leaderLength * 0.7 + Math.abs(center - targetCenter) * 0.08
            + Math.abs(baseline - label.y) * 0.15 + repeatedX * 0.4,
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    placed.push({ ...label, ...candidates[0] });
  }
  return placed;
}

function buildSessionRatesChart(buckets, specs, unit) {
  const { H, L, R, T, B } = SESSION_RATES_CHART;
  const W = settings.metricsPanelWidth - 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'session-chart');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });

  const values = [];
  for (const spec of specs) {
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(spec.of(buckets, i));
      if (v !== undefined) values.push(v);
    }
  }
  const yDomain = sessionYDomain(values);
  const y0 = yDomain.min;
  const y1 = yDomain.max;

  const x0 = buckets.playNowMs - buckets.windowMs;
  const x1 = buckets.playNowMs;
  const px = (t) => L + ((Math.min(Math.max(t, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const py = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);

  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + (x1 - x0) * i / 4);
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: Math.min(px(v), W - 17), y: H - B + 13, class: 'scatter-tick tick-x' },
      sessionAgoLabel(x1 - v));
  }
  const yTicks = niceTicks(y0, y1, 5);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const yDec = Math.min(6, Math.max(0, -Math.floor(Math.log10(yStep) + 1e-9)));
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    const shown = Math.abs(v) < Math.pow(10, -yDec) / 2 ? 0 : v;
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' },
      shown.toFixed(yDec) + unit);
  }
  for (const v of minorTicks(yTicks, y0, y1)) {
    el('line', { x1: L - 4, y1: py(v), x2: L, y2: py(v), class: 'scatter-minor' });
  }
  appendSessionDayBoundaries(svg, buckets, px, T, H - B);
  appendSessionGameMarkers(svg, buckets, {
    width: W, height: H, left: L, right: W - R, top: T, bottom: H - B,
  }, px);

  const drawn = [];
  const pointLabels = [];
  for (const spec of specs) {
    const points = [];
    let d = '';
    let pen = false;
    for (let i = 0; i < buckets.centers.length; i++) {
      const v = displayableNumber(spec.of(buckets, i));
      if (v === undefined) { pen = false; continue; }
      const x = px(buckets.centers[i]);
      const y = py(v);
      points.push({ x, y, v });
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      pen = true;
    }
    const lastPoint = points[points.length - 1];
    drawn.push({ spec, latest: lastPoint === undefined ? undefined : lastPoint.v });
    if (lastPoint === undefined) continue;
    const path = el('path', { class: 'end-line', stroke: spec.color, d: d });
    const dot = el('circle', {
      class: 'end-dot', fill: spec.color, r: 2.5,
      cx: lastPoint.x.toFixed(1), cy: lastPoint.y.toFixed(1),
    });
    pointLabels.push({
      x: lastPoint.x, y: lastPoint.y, spec,
      points,
      seriesNodes: [path, dot],
      text: spec.label + ' ' + spec.fmt(lastPoint.v) + spec.unit,
    });
  }

  // Current values remain direct labels in their series colors, but a
  // collision/occlusion pass distributes them across open parts of the plot.
  // Fine leader lines keep every moved value explicitly tied to its endpoint.
  // Hovering a value label highlights its whole series.
  for (const lab of sessionRateLabelLayout(pointLabels, {
    left: L + 2, right: W - R - 2, top: T + 1, bottom: H - B - 2,
  })) {
    const leader = el('line', {
      x1: lab.x.toFixed(1), y1: (lab.y - 4).toFixed(1),
      x2: lab.connectorX.toFixed(1), y2: lab.connectorY.toFixed(1),
      stroke: lab.spec.color, class: 'rate-label-leader',
    });
    const labelNode = el('text', {
      x: lab.x.toFixed(1),
      y: lab.y.toFixed(1),
      fill: lab.spec.textColor ?? lab.spec.color,
      class: 'rate-point-value',
      'text-anchor': lab.anchor,
    }, lab.text);
    bindSeriesHighlight(svg, labelNode,
      [...lab.seriesNodes, leader, labelNode]);
  }
  return { svg, drawn };
}

// A tiny real-looking board fragment for help tips: classic covered
// bevels, the digit palette, and the real mine glyph. Each cell is
// {kind: 'covered'|'number'|'mine'|'blank', n, note} — `note` prints
// small bold text over the cell (used for mine probabilities).
function helpBoardExample(rows, caption) {
  const wrap = document.createElement('div');
  wrap.className = 'help-board-wrap';
  const board = document.createElement('div');
  board.className = 'help-board';
  board.style.gridTemplateColumns = 'repeat(' + rows[0].length + ', 26px)';
  for (const row of rows) {
    for (const cell of row) {
      const el = document.createElement('span');
      el.className = 'help-cell help-' + cell.kind;
      if (cell.kind === 'number' && cell.n > 0) {
        el.classList.add('help-n' + cell.n);
        el.textContent = String(cell.n);
      } else if (cell.kind === 'mine') {
        el.innerHTML = MINE_SVG;
      }
      if (cell.note) {
        const note = document.createElement('span');
        note.className = 'help-cell-note';
        note.textContent = cell.note;
        el.appendChild(note);
      }
      board.appendChild(el);
    }
  }
  wrap.appendChild(board);
  if (caption) {
    const cap = document.createElement('div');
    cap.className = 'help-board-caption';
    cap.textContent = caption;
    wrap.appendChild(cap);
  }
  return wrap;
}

// The excess-game-risk explainer (requested 2026-08-30): plain words plus
// a realistic board example, because "pp" alone explains nothing.
function excessRiskHelp(unitNote) {
  return (tip) => {
    const p = (text) => {
      const el = document.createElement('p');
      el.textContent = text;
      tip.appendChild(el);
    };
    p('Every covered cell has a knowable chance of being a mine, computed '
      + 'from the visible numbers. When you open a cell that is riskier '
      + 'than the safest cell you could have opened instead, the extra '
      + 'chance of dying is excess game risk, in percentage points (pp).');
    tip.appendChild(helpBoardExample([
      [{ kind: 'covered', note: '17%' }, { kind: 'covered', note: '33%' },
        { kind: 'mine' }],
      [{ kind: 'number', n: 1 }, { kind: 'number', n: 2 },
        { kind: 'number', n: 2 }],
    ], 'These frontier cells hid a mine 17%, 33%, and 50% of the time. '
      + 'The 50% cell was opened \u2014 and it really was a mine. The '
      + 'safest available choice risked only 17%, so that click '
      + 'volunteered 33 extra percentage points: +33pp excess game risk.'));
    p('The chart sums those percentage points over the risky actions you '
      + 'survived in the lookback, ' + unitNote + '. It measures risk '
      + 'taken on, not deaths \u2014 deaths have their own lines on the '
      + 'game endings chart.');
  };
}

// The modeled-life-gap explainer: the same treatment for the one-ply
// expected-remaining-life measure.
function modeledLifeGapHelp(unitNote) {
  return (tip) => {
    const p = (text) => {
      const el = document.createElement('p');
      el.textContent = text;
      tip.appendChild(el);
    };
    p('Before each of your moves, a one-move-deep model scores every '
      + 'available move by the chance you survive it: a proven-safe cell '
      + 'scores 1.00, a cell that is a mine 25% of the time scores 0.75.');
    tip.appendChild(helpBoardExample([
      [{ kind: 'covered', note: '1.00' }, { kind: 'mine', note: '0.75' }],
      [{ kind: 'number', n: 1 }, { kind: 'number', n: 3 }],
    ], 'The left cell was proven safe (survival score 1.00). The right '
      + 'cell was opened instead at a 25% mine chance (score 0.75) \u2014 '
      + 'and this time it was a mine. Best score minus chosen score: a '
      + '0.25 life gap, a quarter of a game given away.'));
    p('The chart sums these gaps over the lookback, ' + unitNote + '. It '
      + 'is one move deep and model-relative: it does not price the '
      + 'information a bolder click can buy, and it makes no claim about '
      + 'your intent.');
  };
}

// Default help for a measured metric: its measurement rule and what the
// series does (and does not) record, straight from the spec.
function sessionMetricHelp(spec) {
  const unitNote = settings.sessionRateBasis === 'game'
    ? 'shown per finished game' : 'shown per played minute';
  if (spec.category === 'gameRisk') return excessRiskHelp(unitNote);
  if (spec.category === 'lifeMaximization') return modeledLifeGapHelp(unitNote);
  return ['What it measures: ' + spec.calc + '.',
    'What it records: ' + spec.records + '.'];
}

// Help for a multi-series chart: one entry per drawn series, naming the
// series in bold and giving its measurement rule.
function ratesHelpBuilder(specs) {
  return (tip) => {
    for (const spec of specs) {
      const p = document.createElement('p');
      const name = document.createElement('b');
      name.textContent = spec.label;
      p.appendChild(name);
      p.appendChild(document.createTextNode(' \u2014 ' + spec.calc + '.'));
      tip.appendChild(p);
    }
  };
}

// An action-rates row: one unit's chart, each line naming itself at its
// endpoint (hover a value label to spotlight its line), with a (?) that
// explains every drawn series.
function appendSessionRatesRow(
  container, buckets, unit, sourceSpecs = SESSION_RATE_SPECS,
  label = 'action rates', options = {}) {
  // rawSpecs charts (mouse speed & fastclick gap) measure identically on
  // either rate basis, so they skip the basis remap and unit filter.
  const specs = options.rawSpecs
    ? sourceSpecs
    : sessionRateSpecsForBasis(sourceSpecs)
      .filter((spec) => spec.unit === unit);
  if (specs.length === 0) return;
  const row = document.createElement('div');
  row.className = 'metric-row session-metric-row';
  const headRow = document.createElement('div');
  headRow.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = options.headLabel || (label + unit);
  // Inside the label span, so the (?) rides directly after the name
  // (the head row itself is a space-between flex).
  labelEl.appendChild(chartHelpButton(options.help || ratesHelpBuilder(specs)));
  headRow.appendChild(labelEl);
  row.appendChild(headRow);
  const { svg, drawn } = buildSessionRatesChart(buckets, specs, unit);
  row.appendChild(svg);
  // Every drawn line names itself at its endpoint, so there is no
  // legend; an empty window still explains itself.
  {
    const empty = document.createElement('div');
    empty.className = 'session-end-legend session-end-empty';
    empty.textContent = 'nothing measurable in the window yet';
    empty.style.visibility = drawn.some(({ latest }) => latest !== undefined) ? 'hidden' : 'visible';
    row.appendChild(empty);
  }
  container.appendChild(row);
}

// The shown number is the newest measurable sample's value: the running
// average ending at the current play position.
function latestDefined(buckets, of) {
  for (let i = buckets.centers.length - 1; i >= 0; i--) {
    const v = displayableNumber(of(buckets, i));
    if (v !== undefined) return v;
  }
  return undefined;
}

function appendSessionSection(container) {
  const controls = document.createElement('div');
  controls.className = 'session-controls';
  const choice = (ariaLabel, options, value, onChange) => {
    const select = document.createElement('select');
    select.className = 'session-control';
    select.setAttribute('aria-label', ariaLabel);
    for (const [id, label] of options) {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = String(value);
    select.addEventListener('change', () => onChange(select.value));
    controls.appendChild(select);
  };
  choice('Session grouping method', [
    ['average', 'running average'],
    ['raw', 'raw buckets'],
  ], settings.sessionAggregation, (value) => {
    settings.sessionAggregation = value;
    saveSettings();
    refreshMetricsPanel();
  });
  choice('Session rate basis', [
    ['time', 'per played time'],
    ['game', 'per game'],
  ], settings.sessionRateBasis, (value) => {
    settings.sessionRateBasis = value;
    saveSettings();
    refreshMetricsPanel();
  });
  if (settings.sessionRateBasis === 'game') {
    choice('Completed-game grouping length',
      SESSION_GAME_LOOKBACK_CHOICES.map((games) => [
        games, games + (games === 1 ? ' game' : ' games'),
      ]),
      settings.sessionLookbackGames, (value) => {
        settings.sessionLookbackGames = Number(value);
        saveSettings();
        refreshMetricsPanel();
      });
  } else {
    const intervalOptions = [];
    for (const seconds of SESSION_LOOKBACK_CHOICES) {
      intervalOptions.push([seconds,
        (seconds < 60 ? seconds + 's' : (seconds / 60) + 'm') + ' groups']);
    }
    choice('Played-time grouping length', intervalOptions,
      settings.sessionLookbackSeconds, (value) => {
        settings.sessionLookbackSeconds = Number(value);
        saveSettings();
        refreshMetricsPanel();
      });
  }
  choice('Session mode scope', [
    ['current', 'this mode'],
    ['all', 'all modes'],
  ], settings.sessionModeScope, (value) => {
    settings.sessionModeScope = value;
    saveSettings();
    refreshMetricsPanel();
  });
  container.appendChild(controls);

  const charts = document.createElement('div');
  charts.className = 'session-charts';
  appendSessionCharts(charts);
  container.appendChild(charts);
  return charts;
}

function appendSessionCharts(container) {
  const now = Date.now();
  sessionPrune(now);
  const exactModeKey = modeKey();
  const scopedEvents = sessionEventsForMode(
    sessionEvents, exactModeKey, settings.sessionModeScope);
  const includeOpenPlay = sessionPlayFrom !== null
    && (settings.sessionModeScope === 'all' || sessionPlayModeKey === exactModeKey);
  const wallFromMs = SessionScope.bounds(settings.sessionDefinition, now).from;
  const seriesOptions = {
    nowMs: now,
    wallFromMs,
    windowMs: Math.max(1, scopedEvents.filter((ev) => ev.kind === 'play' || ev.kind === 'game')
      .reduce((sum, ev) => sum + Math.max(0, Math.min(now, ev.to)
        - Math.max(wallFromMs, ev.from)), 0)
      + (includeOpenPlay ? now - Math.max(sessionPlayFrom, wallFromMs) : 0)),
    openPlayFrom: includeOpenPlay ? sessionPlayFrom : undefined,
    playOffsetMs: sessionPlayOffsetMs,
  };
  const buckets = settings.sessionRateBasis === 'game'
    ? sessionGameSeries(scopedEvents, {
      ...seriesOptions,
      aggregation: settings.sessionAggregation,
      lookbackGames: settings.sessionLookbackGames,
    })
    : settings.sessionAggregation === 'raw'
      ? sessionRawSeries(scopedEvents, {
        ...seriesOptions,
        bucketMs: settings.sessionLookbackSeconds * 1000,
      })
      : sessionRunningSeries(scopedEvents, {
        ...seriesOptions,
        stepMs: SESSION_STEP_MS,
        lookbackMs: settings.sessionLookbackSeconds * 1000,
      });
  appendSessionWhenRow(container, buckets);
  appendSessionEndingsRow(container, buckets);
  if (settings.sessionRateBasis === 'game') {
    appendSessionRatesRow(container, buckets, '/game');
  } else {
    appendSessionRatesRow(container, buckets, '/m');
    appendSessionRatesRow(container, buckets, '/s');
  }
  const categorySpecs = SESSION_CATEGORY_RATE_SPECS;
  appendSessionRatesRow(container, buckets,
    settings.sessionRateBasis === 'game' ? '/game' : '/m',
    categorySpecs, 'report categories');
  // Mouse speed and the fastclick gap share one chart (2026-08-30);
  // each endpoint label carries its own unit, so the axis stays bare.
  appendSessionRatesRow(container, buckets, '', SESSION_SPEED_GAP_SPECS,
    'mouse speed & fastclick gap',
    { rawSpecs: true, headLabel: 'mouse speed & fastclick gap' });
  for (const sourceSpec of SESSION_METRIC_SPECS) {
    const spec = sessionMetricSpecForBasis(sourceSpec);
    const row = document.createElement('div');
    row.className = 'metric-row session-metric-row';
    const headRow = document.createElement('div');
    headRow.className = 'metric-head';
    const labelEl = document.createElement('span');
    labelEl.className = 'metric-label';
    labelEl.textContent = spec.label;
    labelEl.appendChild(chartHelpButton(sessionMetricHelp(sourceSpec)));
    headRow.appendChild(labelEl);
    row.appendChild(headRow);
    row.appendChild(buildSessionChart(buckets, spec));
    container.appendChild(row);
  }
}

// The game-endings row: cumulative percentages in running-average mode,
// independent bucket percentages in raw mode, with a semantic color legend.
// Hovering a legend entry highlights that line in the chart.
function appendSessionEndingsRow(container, buckets) {
  const row = document.createElement('div');
  row.className = 'metric-row session-metric-row session-endings-row';
  const headRow = document.createElement('div');
  headRow.className = 'metric-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'metric-label';
  labelEl.textContent = 'game endings %';
  headRow.appendChild(labelEl);
  labelEl.appendChild(chartHelpButton([
    'Of the games finished inside the lookback, the percentage that '
      + 'ended each way. "win" is every win; each "died:" line is one '
      + 'exclusive reason the fatal action was judged to have lost the '
      + 'game, so the died-lines plus the win line cover all finished games.',
    'The dotted blue and purple lines are different quantities on the '
      + 'same percent axis, measured on wins only: how many of the '
      + 'board\u2019s mines you never marked, and how many of your placed '
      + 'marks never did chord work.',
    'The y axis stretches to just above the highest line rather than '
      + 'always showing 0\u2013100. Hover a legend entry to spotlight its '
      + 'line.',
  ]));
  row.appendChild(headRow);
  const { svg, drawn } = buildSessionEndingsChart(buckets);
  row.appendChild(svg);
  if (drawn.length > 0) {
    const legend = document.createElement('div');
    legend.className = 'session-end-legend';
    for (const { spec, latest, nodes } of drawn) {
      const item = document.createElement('span');
      item.className = 'end-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'end-swatch';
      swatch.style.background = spec.color;
      const text = document.createElement('span');
      text.textContent = spec.label + ' '
        + (latest === undefined ? '0' : Math.round(latest * 100)) + '%';
      item.append(swatch, text);
      bindSeriesHighlight(svg, item, nodes);
      legend.appendChild(item);
    }
    row.appendChild(legend);
  } else {
    const empty = document.createElement('div');
    empty.className = 'session-end-legend session-end-empty';
    empty.textContent = 'no finished games in the window yet';
    row.appendChild(empty);
  }
  container.appendChild(row);
}
