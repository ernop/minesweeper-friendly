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
