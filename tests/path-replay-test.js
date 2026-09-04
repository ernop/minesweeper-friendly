'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const start = source.indexOf('//-------PATH REPLAY: COMPUTATION');
const end = source.indexOf('//-------PATH REPLAY: DISPLAY');
if (start < 0 || end <= start) throw new Error('path replay markers not found');
vm.runInThisContext(source.slice(start, end));

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

{
  const range = pathDisplayRange([1, 2, 3, 4, 5, 6, 7]);
  check('small samples keep every value',
    range.min === 1 && range.max === 7 && range.trimmed === 0);
}

{
  const range = pathDisplayRange([0, 10, 11, 12, 13, 14, 15, 16, 17, 1000]);
  check('Tukey display range trims both speed extremes',
    range.min === 10 && range.max === 17 && range.trimmed === 2);
}

check('empty range is explicitly unmeasured',
  pathDisplayRange([undefined, NaN]) === undefined);

{
  const range = pathDisplayRange([0, 0, 0]);
  check('constant nonnegative range does not invent a negative endpoint',
    range.min === 0 && range.max === 0 && range.trimmed === 0);
  check('constant range has a stable heat color',
    pathHeatColor(0, range) === pathHeatColor(1, range));
}

{
  const decision = {
    evaluation: {
      position: {
        width: 5,
        height: 4,
        mines: 5,
        revealed: [[0, 0], [1, 1], [2, 1]],
      },
      mistakes: [],
    },
  };
  check('progress is uncovered share of safe cells',
    pathDecisionProgress(decision) === 3 / 15);
  check('a reasonable fatal guess is not called less useful',
    pathDecisionIsLessUseful(decision) === false);
  decision.evaluation.mistakes.push('no-op-click');
  check('measured mistake marks a less-useful decision',
    pathDecisionIsLessUseful(decision) === true);
}

{
  const events = [
    { kind: 'layout', t: 0 },
    { kind: 'decision', t: 2, evaluation: {} },
    {
      kind: 'decision',
      t: 1,
      evaluation: { position: { width: 1, height: 1, mines: 0, revealed: [] } },
    },
  ];
  const decisions = pathDecisionEvents(events);
  check('only replayable decision events remain', decisions.length === 1);
  check('decision order is chronological', decisions[0].t === 1);
}

{
  const clicks = pathClickEvents([
    { kind: 'mousemove', t: 0, x: 1, y: 1 },
    { kind: 'rdown', t: 3, x: 30, y: 40 },
    { kind: 'lup', t: 2, x: 20, y: 25 },
  ]);
  check('raw click locations include left and right inputs', clicks.length === 2);
  check('raw click locations are chronological',
    clicks[0].kind === 'lup' && clicks[1].kind === 'rdown');
}

check('heat scale gives different endpoint colors',
  pathHeatColor(0, { min: 0, max: 1 })
    !== pathHeatColor(1, { min: 0, max: 1 }));

check('only an exact half risk is called 50/50',
  pathRiskLabel(0.5) === '50/50' && pathRiskLabel(0.499) !== '50/50');
check('uncertain endpoint risks are not rounded to certainty',
  pathRiskLabel(0.004) === '0.4% mine'
    && pathRiskLabel(0.996) === '99.6% mine');

{
  const useful = () => ({ evaluation: { mistakes: [] } });
  const less = () => ({ evaluation: { mistakes: ['no-op-click'] } });
  const roles = pathLessUsefulRoles([
    useful(), less(), less(), useful(), useful(), useful(), less(), useful(),
  ]);
  check('less-useful run keeps its prior useful boundary', roles[0].before);
  check('every mistake-tagged action is in the episode',
    roles[1].less && roles[2].less && roles[6].less);
  check('less-useful run keeps its next useful boundary',
    roles[3].after && roles[7].after);
  check('unrelated useful actions remain outside episodes',
    !roles[4].before && !roles[4].less && !roles[4].after);
}

{
  const evaluation = {
    position: { width: 5, height: 4, mines: 4 },
    choices: [
      { kind: 'minimum-risk-reveal', risk: 0.5, cells: [0, 1, 6, 19] },
      { kind: 'guaranteed-safe-reveal', risk: 0, cells: [10] },
    ],
  };
  const areas = pathChoiceAreas(evaluation);
  check('uncertain neighboring choices form one area',
    areas.length === 2 && areas[0].cells.join(',') === '0,1,6');
  check('disconnected uncertain choice gets its own side label',
    areas[1].cells.join(',') === '19');
  check('proven-safe choices are not called coinflips',
    areas.every((area) => area.risk === 0.5));
}

{
  const t = [0, 100, 900, 1000, 1700];
  const x = [0, 10, 300, 305, 306];
  const y = [0, 0, 0, 0, 0];
  const gaps = pathTraceGaps(t, x, y);
  check('short sample gaps are not data gaps', gaps.length === 2);
  check('a silent stretch ending far away is an off-screen gap',
    gaps[0].kind === 'away' && gaps[0].dtMs === 800 && gaps[0].travelPx === 290);
  check('a silent stretch ending in place is a rest',
    gaps[1].kind === 'rest' && gaps[1].dtMs === 700);
}

{
  // Steady 100 px/s rightward movement, with one crawling segment and one
  // hard reversal in the middle.
  const t = [];
  const x = [];
  const y = [];
  let now = 0;
  let pos = 0;
  const push = (dt, dx) => {
    now += dt;
    pos += dx;
    t.push(now);
    x.push(pos);
    y.push(0);
  };
  push(0, 0);
  for (let i = 0; i < 6; i++) push(50, 5);
  push(50, 0.05); // segment 7: ~1 px/s, far below the median pace
  push(50, -10);  // segment 8: hard reversal
  for (let i = 0; i < 6; i++) push(50, 5);
  const rough = pathRoughSegments(t, x, y);
  check('steady movement is not rough', rough[3] === false && rough[12] === false);
  check('crawling far below median pace is rough', rough[7] === true);
  check('a hard direction reversal is rough', rough[8] === true);
}

{
  const events = [
    { kind: 'lup', t: 5, x: 1, y: 1 },
    { kind: 'decision', t: 5, evaluation: { action: 'chord' } },
    { kind: 'lup', t: 9, x: 2, y: 2 },
    { kind: 'decision', t: 9, evaluation: { action: 'reveal' } },
    { kind: 'rdown', t: 12, x: 3, y: 3 },
    { kind: 'lup', t: 20, x: 4, y: 4 },
  ];
  const clicks = pathClickActions(events);
  check('a chord-accepting left release is detected as a chord',
    clicks[0].action === 'chord');
  check('a plain reveal release is not a chord', clicks[1].action === 'reveal');
  check('an input with no accepted decision has no action kind',
    clicks[2].action === null && clicks[3].action === null);
}

{
  const bins = pathValueBins({ min: 0, max: 60 }, 6);
  check('legend bins cover the display range in equal classes',
    bins.length === 6 && bins[0].min === 0 && bins[0].max === 10
      && bins[5].min === 50 && bins[5].max === 60);
  check('bin lookup places values in their class',
    pathBinIndex(bins, 5) === 0 && pathBinIndex(bins, 59) === 5);
  check('bin lookup clamps values outside the trimmed display range',
    pathBinIndex(bins, -4) === 0 && pathBinIndex(bins, 1000) === 5);
  check('a degenerate range yields no bins',
    pathValueBins({ min: 3, max: 3 }, 6).length === 0
      && pathValueBins(undefined, 6).length === 0);
}

{
  // A 1-2-1 wall over a covered row: mines under both 1s, safe under the 2.
  const view = {
    width: 3,
    height: 2,
    revealed: [true, true, true, false, false, false],
    adjacent: [1, 2, 1, 0, 0, 0],
  };
  const facts = new Map([[3, 1], [4, 2], [5, 1]]);

  const bare = replayMoveOptions(view, new Set(), facts);
  check('nothing is chordable before any mark', bare.chords.length === 0);
  check('every number is chordable after marking its proven mines',
    bare.flagChords.length === 3
      && bare.flagChords.every((c) => c.safe && c.opens.join(',') === '4'));
  check('the combo names the exact mines to mark first',
    bare.flagChords[0].needFlags.join(',') === '3'
      && bare.flagChords[1].needFlags.join(',') === '3,5'
      && bare.flagChords[2].needFlags.join(',') === '5');

  const oneMark = replayMoveOptions(view, new Set([3]), facts);
  check('a placed mark turns its combo into a chord-now',
    oneMark.chords.length === 1 && oneMark.chords[0].cell === 0
      && oneMark.chords[0].safe && oneMark.chords[0].opens.join(',') === '4');
  check('remaining combos still name only the unmarked mine',
    oneMark.flagChords.length === 2
      && oneMark.flagChords.every((c) => c.needFlags.join(',') === '5'));

  const wrongMark = replayMoveOptions(view, new Set([4]), facts);
  check('a chord satisfied by a wrong flag is never called safe',
    wrongMark.chords.length === 2
      && wrongMark.chords.every((c) => !c.safe)
      && wrongMark.flagChords.length === 0);
}

check('mark-then-chord numbers and mini mark-mine flags have styles',
  css.includes('.cell.replay-chord-after-marks::after')
    && css.includes('.cell.replay-chord-after-marks-single::after')
    && css.includes('.replay-flag-hint'));
check('only the cell\'s own glyph dims on a proven mine, not the mark-mine hint',
  css.includes('.cell.replay-mine > svg')
    && !/\.cell\.replay-mine svg\s*\{/.test(css));

{
  // Every encoding the model can emit has a stylesheet rule reading its
  // published color variable, a legend swatch form, and complete wording.
  const cellKeys = ['choice', 'trigger', 'selected', 'safe', 'chord-now',
    'chord-after-marks', 'chord-after-marks-single', 'chord-open', 'mine'];
  for (const key of cellKeys) {
    check(`encoding ${key} is styled through its variable`,
      css.includes(`.replay-${key}`) && css.includes(`var(--replay-${key})`));
  }
  for (const [key, encoding] of Object.entries(REPLAY_ENCODINGS)) {
    check(`encoding ${key} names its color, form, and meaning`,
      /^#[0-9a-f]{6}$/.test(encoding.color)
        && typeof encoding.form === 'string'
        && encoding.label.includes('=') || key === 'area');
    check(`encoding ${key} legend wording is a complete sentence fragment`,
      encoding.label.length >= 20 && !encoding.label.includes('…'));
  }
  check('measured choices are no longer a second green',
    REPLAY_ENCODINGS.choice.color !== REPLAY_ENCODINGS.safe.color
      && REPLAY_ENCODINGS.choice.color === REPLAY_ENCODINGS.area.color);
  check('the canvas painter reads marker colors from the table',
    source.includes('REPLAY_ENCODINGS.pointless.color')
      && source.includes('REPLAY_ENCODINGS.movement.color')
      && source.includes('REPLAY_ENCODINGS.crosshair.color'));
}

{
  // A 3x2 frame: the top row is revealed 1-2-1, the bottom row covered with
  // mines under both 1s and a safe cell under the 2. The player chords the
  // left 1 after flagging its mine; the evaluation's measured choices are
  // the safe cell plus the (already flagged) right mine.
  const evaluation = {
    action: 'chord',
    atMs: 1770,
    triggerCell: 0,
    selected: [4],
    choices: [{ kind: 'guaranteed-safe-reveal', risk: 0, cells: [4] }],
    position: {
      width: 3, height: 2, mines: 2,
      revealed: [[0, 1], [1, 2], [2, 1]],
      flagged: [3],
    },
  };
  const facts = new Map([[3, 1], [4, 2], [5, 1]]);
  const view = {
    width: 3, height: 2,
    revealed: [true, true, true, false, false, false],
    adjacent: [1, 2, 1, 0, 0, 0],
  };
  const { chords, flagChords } = replayMoveOptions(view, new Set([3]), facts);
  const solver = {
    measured: true,
    pMine: [0, 0, 0, 1, 0, 1],
    facts,
    provenMines: [3, 5],
    provenSafe: [4],
    chords,
    flagChords,
  };
  const all = { moves: true, mines: true, probs: true };
  const model = replayFrameModel(evaluation, solver, all);
  const marks = (cell) => [...model.cells[cell].marks].sort().join(',');
  check('frame model keeps the stored board state',
    model.cells[0].revealed && model.cells[0].adjacent === 1
      && !model.cells[3].revealed && model.cells[3].flagged
      && !model.cells[4].flagged);
  check('the chorded number is the trigger and a chord-now',
    model.triggerCell === 0 && marks(0) === 'chord-now,trigger');
  check('a flagged proven mine keeps its flag and gets no mark-mine hint',
    marks(3) === 'mine');
  check('an unflagged proven mine offers the mark-mine move',
    marks(5) === 'mark-mine,mine');
  check('the safe cell is a proven-safe choice the chord opens and changed',
    marks(4) === 'choice,chord-open,safe,selected');
  check('single-cell mark-then-chord combos are kept but marked dominated',
    marks(2) === 'chord-after-marks-single' && marks(1) === 'chord-after-marks-single');
  check('proven cells already ringed show no probability badge',
    model.cells.every((cell) => cell.badge === null));
  check('measured choice count and exact solver state are reported',
    model.choiceCount === 1 && model.solverState === 'exact');

  const probsOnly = replayFrameModel(evaluation, solver, { moves: false, mines: false, probs: true });
  check('with rings off, proven cells read 0 and 100',
    probsOnly.cells[3].badge === '100' && probsOnly.cells[4].badge === '0'
      && probsOnly.cells[5].badge === '100');
  check('with solver layers off, only player marks remain',
    [...probsOnly.cells[4].marks].sort().join(',') === 'choice,selected');

  const none = replayFrameModel(evaluation, null, all);
  check('no solver read means no solver marks and state off',
    none.solverState === 'off'
      && none.cells.every((cell) => ![...cell.marks].some((key) =>
        ['safe', 'mine', 'chord-now', 'mark-mine'].includes(key))));

  const bounded = replayFrameModel(evaluation,
    { ...solver, measured: false, pMine: null }, all);
  check('an over-budget position still marks proofs but no probabilities',
    bounded.solverState === 'bounded' && bounded.cells[5].marks.has('mine')
      && bounded.cells.every((cell) => cell.badge === null));

  const status = replayStatusParts(7, 19, evaluation);
  check('status parts carry the values separately from the words',
    status.done === '7' && status.count === '19' && status.time === '1.77 s'
      && status.action === 'chord' && status.choices === '1 measured choice');
  const end = replayEndStatusParts(19, 9620);
  check('the end position reports every action done and the final time',
    end.done === '19' && end.count === '19' && end.time === '9.62 s');
}

{
  const rows = replayLegendRows({ moves: true, mines: true, probs: true,
    pointless: false, purposeful: true, movement: false }, 'exact');
  check('legend rows follow the active overlays',
    rows.map((row) => row.title).join('|')
      === 'decision-time board|available moves|forced mines|mine %|purposeful clicks');
  check('legend rows only name real encodings',
    rows.every((row) => row.keys.every((key) => key in REPLAY_ENCODINGS)));
  check('the board row splits ring, wash, and crosshair into separate items',
    rows[0].keys.includes('trigger') && rows[0].keys.includes('selected')
      && rows[0].keys.includes('crosshair'));
  const boundedRows = replayLegendRows({ moves: false, mines: true, probs: true }, 'bounded');
  check('the enumeration caveat rides on the first solver row shown',
    boundedRows[1].note !== undefined && boundedRows[2].keys.length === 0
      && boundedRows[2].note === 'position too complex for exact probabilities');
}

check('solver reads are never silently replaced by a fallback',
  !/function replaySolverRead[\s\S]*?catch[\s\S]*?function replaySolverAt/.test(source));
check('solver reads are precomputed off the input path',
  source.includes('function scheduleReplayPrecompute')
    && source.includes('cancelReplayPrecompute();\n  replaySolverCache.clear();'));
{
  // The side-plan and reserve rules are pure functions in the layout
  // section; run them from their source text.
  const grab = (name) => {
    const match = source.match(new RegExp('(?:const [A-Z_]+ = \\d+;\\n)*function ' + name + '\\([\\s\\S]*?\\n\\}\\n'));
    if (!match) throw new Error('missing ' + name);
    return match[0];
  };
  const consts = source.match(/const LEGEND_BESIDE_GAP[\s\S]*?const RESULTS_GUTTER_MARGIN = \d+;\n/)[0];
  vm.runInThisContext(consts + grab('afterGameSidePlan') + grab('navReserves'));
  check('no legend: stats float exactly when the gutter holds them',
    afterGameSidePlan(336, false, 320).resultsFloat === true
      && afterGameSidePlan(335, false, 320).resultsFloat === false
      && afterGameSidePlan(2000, false, 320).legendBeside === false);
  check('legend goes below the board when the gutter is under its minimum width',
    afterGameSidePlan(255, true, 320).legendBeside === false
      && afterGameSidePlan(256, true, 320).legendBeside === true);
  check('legend beside the board takes precedence over floating stats',
    JSON.stringify(afterGameSidePlan(400, true, 320))
      === JSON.stringify({ legendBeside: true, legendWidth: 340, resultsFloat: false }));
  check('with room for both, the legend narrows toward its minimum before the stats drop',
    JSON.stringify(afterGameSidePlan(620, true, 320))
      === JSON.stringify({ legendBeside: true, legendWidth: 258, resultsFloat: true })
      && JSON.stringify(afterGameSidePlan(1000, true, 320))
      === JSON.stringify({ legendBeside: true, legendWidth: 340, resultsFloat: true }));
  check('control rows mirror the right reserve only while the slider keeps 480px',
    JSON.stringify(navReserves(1400, 271)) === JSON.stringify({ right: 271, left: 271 })
      && JSON.stringify(navReserves(816, 267)) === JSON.stringify({ right: 267, left: 69 })
      && JSON.stringify(navReserves(700, 267)) === JSON.stringify({ right: 267, left: 0 }));
}
check('the legend stands beside the board and the control rows keep clear of the gutter',
  css.includes('#game-area.legend-beside #path-view-legend:not([hidden])')
    && /#scores-nav\s*\{[^}]*padding-right:\s*var\(--nav-reserve-right/.test(css)
    && source.includes("classList.toggle('legend-beside'")
    && source.includes("setProperty('--legend-left'")
    && source.includes("setProperty('--nav-reserve-right'"));
check('the legend is a vertical key: meaning headline, look and detail beneath',
  /\.path-legend-row\s*\{[^}]*flex-direction:\s*column/.test(css)
    && source.includes("headline.textContent = key.means || key.label")
    && Object.values(REPLAY_ENCODINGS).every((e) => e.means && e.look
      && e.label === e.look + ' = ' + e.means + (e.detail ? ' \u2014 ' + e.detail : '')));
check('the slider shows its current value at the thumb',
  html.includes('id="replay-slider-value"') && css.includes('#replay-slider-value'));

check('review mode exposes a game-history slider',
  html.includes('id="replay-slider"'));
for (const id of [
  'moves', 'mines', 'probs', 'pointless', 'purposeful', 'movement',
]) {
  check(`replay overlay control exposes ${id} toggle`,
    html.includes(`data-replay-overlay="${id}"`));
}
check('slider scale shows notch marks and numeric labels',
  css.includes('.replay-slider-notch') && css.includes('.replay-slider-label'));

check('path controls contain no select dropdown',
  !/<select[^>]+(?:path-view|replay)/i.test(html));
for (const id of [
  'off', 'raw-path', 'click-locations', 'movement-speed',
  'click-speed', 'progress', 'less-useful',
]) {
  check(`path control exposes ${id} button`,
    html.includes(`data-path-view="${id}"`));
}
check('the game-history slider needs no toggle and is not a path mode',
  !html.includes('id="replay-toggle"')
    && !html.includes('id="review-control"')
    && !html.includes('data-path-view="replay"')
    && source.includes('replayControls.hidden = !available')
    && source.includes('replayOverlayControl.hidden = !available'));
{
  const navStart = html.indexOf('id="scores-nav"');
  const navEnd = html.indexOf('</nav>', navStart);
  const nav = html.slice(navStart, navEnd);
  check('the slider row comes first under the board, then overlays, path, scores',
    nav.indexOf('id="replay-controls"') < nav.indexOf('id="replay-overlay-control"')
      && nav.indexOf('id="replay-overlay-control"') < nav.indexOf('id="path-view-control"')
      && nav.indexOf('id="path-view-control"') < nav.indexOf('id="see-scores-btn"'));
  check('the legend is a sibling of the control rows, not inside them',
    !nav.includes('id="path-view-legend"')
      && html.indexOf('id="path-view-legend"') > navEnd);
  check('slider positions count actions done, from 0 to the finished board',
    /id="replay-slider" min="0" max="0"/.test(html)
      && source.includes('replaySlider.max = String(count)')
      && source.includes('replayStep = replayDecisionCount();')
      && source.includes('const enabled = replayStep < count;'));
  check('the control rows cancel the board\u2019s sideways translation',
    /#scores-nav,\s*#path-view-legend\s*\{[^}]*translateX\(calc\(-1 \* var\(--board-position-applied-x/.test(css)
      && /legend-beside #path-view-legend:not\(\[hidden\]\)\s*\{[^}]*transform:\s*none/.test(css));
}
check('after-game controls are bounded by the main column, never their content',
  /#scores-nav\s*\{[^}]*max-width:\s*100cqw/.test(css));
check('selected path button keeps box dimensions stable',
  css.includes('#path-view-control button[aria-pressed="true"]')
    && !css.match(/#path-view-control button\[aria-pressed="true"\][^{]*\{[^}]*font-weight/s));
check('parameter paths retain the requested thick stroke',
  source.includes("ctx.lineWidth = pathView === 'raw-path' ? 3 : 4.25;"));
check('callouts avoid the complete results panel',
  source.includes('resultsBox.getBoundingClientRect()'));
check('replay arrows preserve focused keyboard controls',
  source.includes('[contenteditable], [tabindex]'));

console.log(`path-replay: all ${checks} checks passed`);
