'use strict';

// Chart building blocks: the SVG namespace, displayed numbers, sparkline
// sizes, axis ticks, Theil–Sen trend lines, the shared (?) help tip, scatter
// plots, and the average-time charts.

//-------CHART BASICS (SVG namespace, displayed numbers, sparkline sizes)-------

// A displayed number: NaN means a formula was computed but degenerated
// (e.g. sample entropy with no matching windows) — for display both are
// one thing: not measurable here.
function displayableNumber(v) {
  return v === undefined || Number.isNaN(v) ? undefined : v;
}

// Compact numeric form for sparkline axis labels; the units live in the
// value column of the same row.
function sparkAxisNumber(v) {
  if (Math.abs(v) >= 10000) return (v / 1000).toPrecision(3) + 'k';
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (v === 0) return '0';
  return v.toPrecision(2);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Chart geometries: small for the live panel's rows, large for the
// after-game charts inline at the page bottom.
const SPARK_SMALL = { width: 150, height: 46, left: 34, bottom: 11, dotR: 1.7, labelClass: 'spark-label' };
const SPARK_LARGE = { width: 230, height: 130, left: 40, bottom: 14, dotR: 2.5, labelClass: 'spark-label spark-label-big' };

//-------CHART AXES (tick placement)-------

// Tick positions for a scatter axis: a 1/2/5*10^k step sized to give at
// most `count` ticks across the range.
function niceTicks(min, max, count) {
  const span = max - min;
  if (span <= 0) return [min];
  const mag = Math.pow(10, Math.floor(Math.log10(span / count)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step) ticks.push(v);
  return ticks;
}

// Minor tick positions between the labeled majors, so the inner divisions
// of a step are visible. Each major step splits into round parts — 4 for
// a 2·10^k or 4·10^k step, else 5 — and minors also extend past the
// outermost majors to the padded range edges. Major positions themselves
// are excluded.
function minorTicks(ticks, min, max) {
  if (ticks.length < 2) return [];
  const step = ticks[1] - ticks[0];
  const mant = Math.round(step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9)));
  const perMajor = (mant === 2 || mant === 4) ? 4 : 5;
  const sub = step / perMajor;
  const first = Math.ceil((min - ticks[0]) / sub - 1e-9);
  const last = Math.floor((max - ticks[0]) / sub + 1e-9);
  const minors = [];
  for (let i = first; i <= last; i++) {
    if (((i % perMajor) + perMajor) % perMajor === 0) continue;
    minors.push(ticks[0] + i * sub);
  }
  return minors;
}

// Ticks for a date x-axis (epoch ms): a calendar step from minutes up to
// days, aligned to local wall-clock multiples, labeled HH:mm below a day
// and M/D from a day up. At most 5 ticks: HH:mm labels are the widest kind
// at the title-sized tick font, so more would collide.
function timeTicks(min, max) {
  const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
  const steps = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR,
    12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];
  const span = Math.max(max - min, 1);
  const step = steps.find((s) => span / s <= 5) || 365 * DAY;
  const offMs = new Date(min).getTimezoneOffset() * 60e3;
  const ticks = [];
  for (let t = Math.ceil((min - offMs) / step) * step + offMs; t <= max; t += step) ticks.push(t);
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (t) => {
    const d = new Date(t);
    return step < DAY
      ? pad2(d.getHours()) + ':' + pad2(d.getMinutes())
      : (d.getMonth() + 1) + '/' + d.getDate();
  };
  return { ticks, fmt };
}

//-------TREND LINE (Theil–Sen, chosen 2026-08-22 from a fit sampling)-------

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Theil–Sen line y = a + b·x: the median slope over all point pairs,
// then the median intercept. Outlier games barely move it, unlike least
// squares. Returns null when no pair has distinct x.
function fitTheilSen(pairs) {
  const slopes = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const dx = pairs[j][0] - pairs[i][0];
      if (dx !== 0) slopes.push((pairs[j][1] - pairs[i][1]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  const b = median(slopes);
  return { a: median(pairs.map(([x, y]) => y - b * x)), b };
}

// The chart's trend lines, both dashed and colored by the existing
// color:recency sense of the age palette: the all-data fit in the
// deep-history teal (the years unit), today's fit in the hours blue.
// Either is omitted when its data can't support the fit. Each line
// carries its data's x-extent: a fit is never drawn beyond its own data
// (today's fit on a calendar axis is a segment at today, not a line
// extrapolated across the whole history).
function trendLinesFor(pairs, todayPairs) {
  const lines = [];
  for (const [data, cls] of [[pairs, 'trend-all'], [todayPairs, 'trend-today']]) {
    if (data.length < 2) continue;
    const fit = fitTheilSen(data);
    if (fit === null) continue;
    const xs = data.map((p) => p[0]);
    lines.push({ ...fit, cls, xMin: Math.min(...xs), xMax: Math.max(...xs) });
  }
  return lines;
}

// Unique ids for the per-chart SVG clip paths of the trend lines.
let trendClipSeq = 0;

// A small "(?)" that rides right after a chart's name. Hovering it (or
// focusing/clicking, for keyboards and touch) shows a plain-language
// explanation of what the chart's metric means. `help` is a string, an
// array of paragraph strings, or a function that fills the tip element
// itself (used where an explanation carries a visual board example).
// One shared body-level tip serves every button (the session game
// tooltip's pattern): the buttons live inside the scrollable metrics
// panel and narrow chart headings, where an inline absolute tip would be
// clipped, and a single element can never accumulate across re-renders.
let chartHelpTipEl = null;
let chartHelpOwner = null;

function getChartHelpTip() {
  if (chartHelpTipEl === null) {
    chartHelpTipEl = document.createElement('div');
    chartHelpTipEl.className = 'chart-help-tip';
    chartHelpTipEl.setAttribute('popover', 'manual');
    chartHelpTipEl.setAttribute('role', 'tooltip');
    chartHelpTipEl.hidden = true;
    document.body.appendChild(chartHelpTipEl);
  }
  return chartHelpTipEl;
}

function hideChartHelpTip() {
  if (chartHelpTipEl === null) return;
  if (chartHelpTipEl.matches(':popover-open')) chartHelpTipEl.hidePopover();
  chartHelpTipEl.hidden = true;
  chartHelpOwner = null;
}

function chartHelpButton(help, label) {
  const wrap = document.createElement('span');
  wrap.className = label ? 'chart-help-wrap chart-help-label-wrap' : 'chart-help-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = label ? 'chart-help chart-help-label' : 'chart-help';
  btn.textContent = label || '?';
  btn.setAttribute('aria-label', label ? 'About ' + label : 'what does this chart mean?');
  const show = () => {
    const tip = getChartHelpTip();
    chartHelpOwner = btn;
    tip.replaceChildren();
    if (typeof help === 'function') {
      help(tip);
    } else {
      for (const text of Array.isArray(help) ? help : [help]) {
        const p = document.createElement('p');
        p.textContent = text;
        tip.appendChild(p);
      }
    }
    tip.hidden = false;
    // The compact game sidebar lives in the top layer. Help must share
    // that layer to remain visible above its chart and configuration.
    if (!tip.matches(':popover-open')) tip.showPopover();
    // Fixed positioning clamped to the viewport: below the button where
    // room allows, above it otherwise, never off either side edge.
    const rect = btn.getBoundingClientRect();
    const left = Math.max(4, Math.min(rect.left - 10,
      window.innerWidth - tip.offsetWidth - 6));
    const below = rect.bottom + 5;
    const top = below + tip.offsetHeight + 6 <= window.innerHeight
      ? below
      : Math.max(4, rect.top - tip.offsetHeight - 5);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  const hide = () => {
    if (chartHelpOwner !== btn) return;
    hideChartHelpTip();
  };
  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', () => { if (document.activeElement !== btn) hide(); });
  btn.addEventListener('focus', show);
  btn.addEventListener('blur', hide);
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    if (getChartHelpTip().hidden) show(); else hide();
  });
  wrap.append(btn);
  return wrap;
}

// Small inline-SVG scatter plot: every win is a dot colored by its age unit
// (the same palette as rank-list ages, so time trends are scannable) and
// faded within that color by how deep into the unit it sits (a 6-day-old
// dot is paler than a 1-day-old one); this game is the black-ringed dot
// labeled with its today-rank. Shows relationships (e.g. does moving the
// mouse faster actually win games faster?) rather than rankings. There is
// no chart title: the terse axis labels, rendered at title size along
// with the tick values, name the chart. opts.timeAxis renders x as a local
// date/time axis; opts.idealLine draws the y = x diagonal (used where y has
// a hard floor at x, e.g. clicks can never beat 3BV). opts.trendLines
// (trendLinesFor output) draws each y = a + b·x entry clipped to the plot
// rect (a today-only fit can exit the all-data frame).
// ageInfoOf maps a win to its {unit, frac} age (see ageInfo).
// opts.trimY drops y-outliers above the Tukey fence (Q3 + 1.5·IQR — the
// box-plot whisker rule: scale-free, and quartiles barely move when an
// outlier appears) so one freak slow win can't stretch the whole axis.
// The me-dot is never dropped, and a corner note counts what's hidden.
function buildScatter(wins, me, fx, fy, xLabel, yLabel, meLabel, ageInfoOf, opts = {}) {
  const W = 270, H = 210, L = 54, R = 10, T = 10, B = 36;
  let shown = wins;
  let hiddenCount = 0;
  let hiddenMax = 0;
  // Quartiles need a few points to mean anything; below 8 wins the fence
  // is noise, so everything shows.
  if (opts.trimY && wins.length >= 8) {
    const sorted = wins.map(fy).sort((a, b) => a - b);
    const q = (p) => {
      const at = (sorted.length - 1) * p;
      const lo = Math.floor(at);
      return sorted[lo] + (at - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
    };
    const fence = q(0.75) + 1.5 * (q(0.75) - q(0.25));
    const keep = (s) => fy(s) <= fence || s === me;
    shown = wins.filter(keep);
    hiddenCount = wins.length - shown.length;
    if (hiddenCount > 0) {
      hiddenMax = Math.max(...wins.filter((s) => !keep(s)).map(fy));
    }
  }
  const xs = shown.map(fx), ys = shown.map(fy);
  const pad = (min, max) => {
    const p = (max - min) * 0.04;
    return [min - p, max + p];
  };
  const [x0, x1] = opts.xDomain || pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = opts.yDomain || pad(Math.min(...ys), Math.max(...ys));
  const px = (v) => x1 === x0 ? (L + W - R) / 2 : L + (v - x0) / (x1 - x0) * (W - L - R);
  const py = (v) => y1 === y0 ? (T + H - B) / 2 : H - B - (v - y0) / (y1 - y0) * (H - T - B);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'scatter-svg');
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'scatter-plot' });
  const tickFmt = (ticks) => {
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
    const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return (v) => v.toFixed(dec);
  };
  // x caps at 6 ticks (the labels are title-sized, so a 7-tick x-axis can
  // collide with itself); y stacks vertically and takes the full 7.
  let xTicks, fmtX;
  if (opts.xTicks) {
    xTicks = opts.xTicks;
    fmtX = opts.formatX || tickFmt(xTicks);
  } else if (opts.timeAxis) {
    ({ ticks: xTicks, fmt: fmtX } = timeTicks(x0, x1));
  } else {
    xTicks = niceTicks(x0, x1, 6);
    fmtX = tickFmt(xTicks);
  }
  for (const v of xTicks) {
    el('line', { x1: px(v), y1: T, x2: px(v), y2: H - B, class: 'scatter-grid' });
    el('text', { x: px(v), y: H - B + 14, class: 'scatter-tick tick-x' }, fmtX(v) + (opts.xTickUnit || ''));
  }
  const yTicks = niceTicks(y0, y1, 7), fmtY = tickFmt(yTicks);
  for (const v of yTicks) {
    el('line', { x1: L, y1: py(v), x2: W - R, y2: py(v), class: 'scatter-grid' });
    el('text', { x: L - 4, y: py(v) + 4, class: 'scatter-tick tick-y' },
      fmtY(v) + (opts.yTickUnit || ''));
  }
  // Minor tickmarks on the axis edges between the labeled divisions.
  // Skipped on the date axis, whose calendar steps (15 min, 3 h, 7 d...)
  // don't subdivide into round parts.
  if (!opts.timeAxis) {
    for (const v of minorTicks(xTicks, x0, x1)) {
      el('line', { x1: px(v), y1: H - B, x2: px(v), y2: H - B + 4, class: 'scatter-minor' });
    }
  }
  for (const v of minorTicks(yTicks, y0, y1)) {
    el('line', { x1: L - 4, y1: py(v), x2: L, y2: py(v), class: 'scatter-minor' });
  }
  if (opts.idealLine) {
    const t0 = Math.max(x0, y0);
    const t1 = Math.min(x1, y1);
    if (t0 < t1) {
      el('line', {
        x1: px(t0).toFixed(1), y1: py(t0).toFixed(1),
        x2: px(t1).toFixed(1), y2: py(t1).toFixed(1),
        class: 'scatter-ideal',
      });
    }
  }
  if (opts.trendLines && opts.trendLines.length > 0) {
    const clipId = 'trend-clip-' + trendClipSeq++;
    const make = (tag) => document.createElementNS(svgNS, tag);
    const defs = make('defs');
    const clip = make('clipPath');
    clip.setAttribute('id', clipId);
    const crect = make('rect');
    for (const [k, v] of Object.entries(
      { x: L, y: T, width: W - L - R, height: H - T - B })) crect.setAttribute(k, v);
    clip.appendChild(crect);
    defs.appendChild(clip);
    svg.appendChild(defs);
    const group = make('g');
    group.setAttribute('clip-path', 'url(#' + clipId + ')');
    svg.appendChild(group);
    for (const t of opts.trendLines) {
      const lo = Math.max(x0, t.xMin);
      const hi = Math.min(x1, t.xMax);
      if (lo >= hi) continue;
      const node = make('line');
      node.setAttribute('x1', px(lo).toFixed(1));
      node.setAttribute('y1', py(t.a + t.b * lo).toFixed(1));
      node.setAttribute('x2', px(hi).toFixed(1));
      node.setAttribute('y2', py(t.a + t.b * hi).toFixed(1));
      node.setAttribute('class', 'scatter-trend ' + t.cls);
      group.appendChild(node);
    }
  }
  const dot = (s, cls, r, opacity) => el('circle', {
    cx: px(fx(s)).toFixed(1), cy: py(fy(s)).toFixed(1), r, class: cls,
    'fill-opacity': opacity,
  });
  // The deeper into its age unit a win sits, the more washed-out its dot:
  // full color on entering the unit, fading to 30% at the far edge.
  for (const s of shown) {
    if (s === me) continue;
    if (opts.neutralDots) {
      dot(s, 'scatter-dot average-dot', '2.8', '0.8');
    } else {
      const age = ageInfoOf(s);
      dot(s, 'scatter-dot age-dot-' + age.unit, '2.2', (1 - 0.7 * age.frac).toFixed(2));
    }
  }
  if (me !== null) {
    const meClass = opts.neutralDots ? 'scatter-me average-dot' :
      'scatter-me age-dot-' + ageInfoOf(me).unit;
    dot(me, meClass, '3.5', '1');
    // Today-rank tag beside the me-dot; flips to the left near the right edge.
    if (meLabel) {
      const meX = px(fx(me));
      const flipLeft = meX > W - R - 50;
      el('text', {
        x: (flipLeft ? meX - 6 : meX + 6).toFixed(1),
        y: Math.max(T + 9, py(fy(me)) - 5).toFixed(1),
        class: 'scatter-me-label' + (flipLeft ? ' flip-left' : ''),
      }, meLabel);
    }
  }
  el('text', { x: L + (W - L - R) / 2, y: H - 4, class: 'scatter-axis-label' }, '\u2192 ' + xLabel);
  // A titled chart names its quantity in the header, and its y ticks
  // carry the unit — the rotated y caption would repeat both, so it only
  // renders on untitled charts (2026-08-30).
  if (!opts.title) {
    el('text', {
      transform: 'translate(12 ' + (T + (H - T - B) / 2) + ') rotate(-90)',
      class: 'scatter-axis-label',
    }, '\u2192 ' + yLabel);
  }
  if (hiddenCount > 0) {
    el('text', { x: W - R - 3, y: T + 11, class: 'scatter-outlier-note' },
      '\u2191 ' + hiddenCount + ' outlier' + (hiddenCount === 1 ? '' : 's')
      + ', max ' + hiddenMax.toFixed(1));
  }

  const list = document.createElement('div');
  list.className = 'rank-list scatter';
  if (opts.title) {
    const heading = document.createElement('h4');
    heading.textContent = opts.title;
    if (opts.headControl) heading.appendChild(opts.headControl);
    if (opts.help) heading.appendChild(chartHelpButton(opts.help));
    list.appendChild(heading);
  }
  list.append(svg);
  return list;
}

// Property charts group games by a measurement, then plot that value against
// average win time, every win's time, or win percentage. Two groups match
// the game-data sides. Integer measurements group exactly. Continuous ones
// use a fixed step so one game cannot become its own bucket. `has` keeps
// legacy records that predate a measurement off that chart. `setting` hides
// a board chart when its tablechart switch is off. `winBound` sits a
// win-only measurement out of winrate, which would otherwise read 100%.
function roundTo(value, step) {
  const decimals = (String(step).split('.')[1] || '').length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function steppedMetric(id, step, extra = {}) {
  const metric = GameData.metrics.find((item) => item.id === id);
  const read = (record) => metric.value(record, config);
  return {
    label: metric.name,
    value: (record) => {
      const value = read(record);
      return Number.isFinite(value) ? roundTo(value, step) : undefined;
    },
    has: (record) => Number.isFinite(read(record)),
    ...extra,
  };
}

const PERF_CHART_SPECS = [
  { label: 'clicks', value: (s) => s.clicks },
  { label: 'mouse path', value: (s) => Math.round(s.mousePathPx / 100) * 100 },
  { label: 'clicks over 3BV', value: (s) => s.clicks - s.bv3 },
  steppedMetric('misclickRate', 0.1),
  steppedMetric('fastclickGap', 10),
  steppedMetric('bvPerSecond', 0.1),
  steppedMetric('clickRate', 0.1),
  steppedMetric('noopRate', 0.1),
  steppedMetric('efficiency', 0.01, { winBound: true }),
  {
    label: 'path / 3BV',
    value: (s) => s.bv3 > 0 ? Math.round((s.mousePathPx / s.bv3) / 10) * 10 : undefined,
    has: (s) => s.bv3 > 0,
  },
  {
    label: 'path / click',
    value: (s) => s.clicks > 0 ? Math.round((s.mousePathPx / s.clicks) / 10) * 10 : undefined,
    has: (s) => s.clicks > 0,
  },
  steppedMetric('correctness', 0.01),
  steppedMetric('ioe', 0.01, { winBound: true }),
  steppedMetric('ziniEfficiency', 0.01, { winBound: true }),
  steppedMetric('hziniEfficiency', 0.01, { winBound: true }),
  {
    label: 'IOS',
    value: (s) => iosOf(s) === undefined ? undefined : Number(iosOf(s).toFixed(2)),
    has: (s) => iosOf(s) !== undefined,
    winBound: true,
  },
  steppedMetric('stnb', 1, { winBound: true }),
  steppedMetric('mouseSpeed', 50),
  steppedMetric('cadenceSpread', 0.1),
  steppedMetric('unusedMarkShare', 0.05),
];

const BOARD_CHART_SPECS = [
  { label: '3BV', value: (s) => s.bv3, setting: 'exact3BV' },
  {
    label: 'ZiNi', value: (s) => s.zini, setting: 'exactZiNi',
    has: (s) => typeof s.zini === 'number',
  },
  {
    label: 'HZiNi', value: (s) => s.hzini, setting: 'exactHZiNi',
    has: (s) => typeof s.hzini === 'number',
  },
  {
    label: '3BV spread', setting: 'workSpreadTable',
    value: (s) => boardSpreadGroup(s),
    has: (s) => boardSpreadGroup(s) !== undefined,
  },
  {
    label: 'max number', setting: 'exactMaxNumber',
    value: (s) => s.maxAdjacent,
    has: (s) => typeof s.maxAdjacent === 'number',
  },
  {
    label: 'islands', setting: 'boardShapeTables',
    value: (s) => s.islandCount,
    has: (s) => typeof s.islandCount === 'number',
  },
  {
    label: 'largest island', setting: 'largestIsland',
    value: (s) => s.largestIsland,
    has: (s) => typeof s.largestIsland === 'number',
  },
  {
    label: 'zeros', setting: 'boardShapeTables',
    value: (s) => s.zeroCount,
    has: (s) => typeof s.zeroCount === 'number',
  },
  {
    label: '0–1 share', setting: 'zeroOneShareTable', xTickUnit: '%',
    value: (s) => boardShareGroup(s, 'zeroOpenedZeroOneCells'),
    has: (s) => boardFractionOf(s, 'zeroOpenedZeroOneCells') !== undefined,
  },
  {
    label: 'zero-opening coverage', setting: 'zeroOpeningTable', xTickUnit: '%',
    value: (s) => boardShareGroup(s, 'zeroOpenedCells'),
    has: (s) => boardFractionOf(s, 'zeroOpenedCells') !== undefined,
  },
];

// A chart's eligible wins. The finite check is a final guard against
// malformed ratios reaching SVG axis math.
function averageEligibleWins(spec, wins) {
  return wins.filter((win) =>
    (!spec.has || spec.has(win)) && Number.isFinite(spec.value(win)));
}

// Bucket eligible wins by the spec's value and average each bucket's solve
// time: the points the average charts plot.
function averagePoints(spec, wins) {
  const groups = new Map();
  for (const win of averageEligibleWins(spec, wins)) {
    const key = spec.value(win);
    const group = groups.get(key) || {
      x: key, totalSeconds: 0, count: 0, newestEndedAt: -Infinity,
    };
    group.totalSeconds += secondsOf(win);
    group.count += 1;
    group.newestEndedAt = Math.max(group.newestEndedAt, win.endedAt);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    x: group.x,
    averageSeconds: group.totalSeconds / group.count,
    endedAt: group.newestEndedAt,
  }));
}

// Bucket all finished games (wins AND losses) by the spec's value and
// compute each bucket's win percentage: the winrate mode's points.
function winratePoints(spec, records) {
  const groups = new Map();
  for (const r of records) {
    if (spec.has && !spec.has(r)) continue;
    const value = spec.value(r);
    if (!Number.isFinite(value)) continue;
    const group = groups.get(value)
      || { x: value, wins: 0, games: 0, newestEndedAt: -Infinity };
    group.games += 1;
    if (r.outcome === 'win') group.wins += 1;
    group.newestEndedAt = Math.max(group.newestEndedAt, r.endedAt);
    groups.set(value, group);
  }
  return [...groups.values()].map((group) => ({
    x: group.x,
    winratePct: 100 * group.wins / group.games,
    endedAt: group.newestEndedAt,
  }));
}

// The property charts' three vertical readings (requested 2026-08-30):
// bucket-average win time, every win's time, and win percentage per value.
// Each game-data side has its own saved mode, chosen once on that section.
// AVERAGE_CHART_MODES lives with its setting in settings-core.js.

function chartModeSelect(modeField) {
  const select = document.createElement('select');
  select.className = 'avg-mode-select';
  select.setAttribute('aria-label',
    (modeField === 'perfChartMode' ? 'your perf' : 'board traits') + ' chart mode');
  select.title = 'average win time per value, every individual win time, '
    + 'or the share of games won per value';
  for (const [id, label] of AVERAGE_CHART_MODES) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = settings[modeField];
  select.addEventListener('change', () => {
    settings[modeField] = select.value;
    saveSettings();
    if (renderedResult !== null) {
      renderResult(renderedResult.record, renderedResult.modeRecords, renderedResult.options);
    }
  });
  return select;
}

function averageChartHelp(spec, mode) {
  if (mode === 'winrate') {
    return ['Every finished game \u2014 wins and losses \u2014 is grouped by '
      + 'its ' + spec.label + ' value. Each dot\u2019s height is the '
      + 'percentage of that group\u2019s games you won.',
    'Values seen in only a game or two swing to 0% or 100% easily; trust '
      + 'the middle of the chart, where the groups are big.'];
  }
  if (mode === 'distribution') {
    return ['Every win is its own dot: across is the game\u2019s '
      + spec.label + ' value, up is that game\u2019s solve time in seconds. '
      + 'Unlike the average view, this shows the full spread of times at '
      + 'each value.',
    'Dot color is the win\u2019s age (see the legend at the bottom of the '
      + 'relationship charts); dashed lines are outlier-resistant trend '
      + 'fits \u2014 teal over all wins, blue over today\u2019s.'];
  }
  return ['Wins are grouped by their ' + spec.label + ' value; each '
    + 'dot\u2019s height is that group\u2019s average solve time in seconds.',
  'Dot color is the group\u2019s newest win\u2019s age; dashed lines are '
    + 'outlier-resistant Theil\u2013Sen trend fits \u2014 teal over all '
    + 'wins, blue over today\u2019s only.'];
}

// One property chart in the selected mode: "time by X" (bucket averages
// plus the Theil–Sen trend pair), "times by X" (every win's own time),
// or "winrate by X" (percent of all finished games won per value).
function buildAverageScatter(spec, wins, allRecords, record, historyView, modeField) {
  const mode = settings[modeField];
  const referenceMs = historyView ? Date.now() : record.endedAt;
  const todayStart = startOfDay(referenceMs);
  const shared = {
    help: averageChartHelp(spec, mode),
    xTickUnit: spec.xTickUnit,
  };
  if (mode === 'winrate') {
    if (spec.winBound) return null;
    const points = winratePoints(spec, allRecords);
    if (points.length < 2) return null;
    const current = historyView
      || averageEligibleWins(spec, [record]).length === 0
      ? null
      : points.find((point) => point.x === spec.value(record)) || null;
    return buildScatter(
      points, current, (point) => point.x, (point) => point.winratePct,
      spec.label, 'winrate', '',
      (point) => ageInfo(referenceMs, point.endedAt),
      { title: 'winrate by ' + spec.label, yTickUnit: '%', ...shared });
  }
  const eligibleWins = averageEligibleWins(spec, wins);
  if (eligibleWins.length < 2) return null;
  if (mode === 'distribution') {
    const me = historyView || averageEligibleWins(spec, [record]).length === 0
      ? null : record;
    const asPairs = (list) => list.map((s) => [spec.value(s), secondsOf(s)]);
    return buildScatter(
      eligibleWins, me, (s) => spec.value(s), secondsOf,
      spec.label, 'time', '',
      (s) => ageInfo(referenceMs, s.endedAt),
      { title: 'times by ' + spec.label, yTickUnit: 's', trimY: true,
        trendLines: trendLinesFor(
          asPairs(eligibleWins),
          asPairs(eligibleWins.filter((w) => w.endedAt >= todayStart))),
        ...shared });
  }
  const points = averagePoints(spec, eligibleWins);
  const current = historyView || averageEligibleWins(spec, [record]).length === 0
    ? null
    : points.find((point) => point.x === spec.value(record)) || null;
  const asPairs = (pts) => pts.map((p) => [p.x, p.averageSeconds]);
  const todayPairs = asPairs(
    averagePoints(spec, eligibleWins.filter((w) => w.endedAt >= todayStart)));
  return buildScatter(
    points, current, (point) => point.x, (point) => point.averageSeconds,
    spec.label, 'average time', '',
    (point) => ageInfo(referenceMs, point.endedAt),
    { title: 'time by ' + spec.label, yTickUnit: 's',
      trendLines: trendLinesFor(asPairs(points), todayPairs),
      ...shared });
}
