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
  css.includes('.cell.replay-chord-flag::after')
    && css.includes('.replay-flag-hint'));

check('back in time exposes a game-history slider',
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
check('back-in-time is independent of path mode buttons',
  html.includes('id="replay-toggle"')
    && !html.includes('data-path-view="replay"'));
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
