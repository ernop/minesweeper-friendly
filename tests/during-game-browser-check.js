'use strict';
// Live perf charts, after a real game played with real mouse input: its
// place as the details column's first stat section, its title opening and
// closing it, the progress chart, the moves available counted in whole
// numbers, the one chart of pace and board lines against their whole-game
// values, and the event tracks, all on one time
// axis, each legend under its part; the hover line and the card naming the
// line under the pointer with its value, and that chart's y labels in the
// line's values while it is in focus or shown alone; the board itself showing the moment under the pointer through
// the replay, in the player's board style, and back on leaving; a click
// keeping the moment; legend clicks choosing the lines; game data rows and
// the lines and marks of their measurements linked by hover both ways, with
// one value in both; the log and linear scales; configure and averaging; its return after a reload restores the
// game; a loss; a middle width; and phone width. Writes storage, so it runs
// on the test origin; pages are served from the working tree by request
// routing under that origin and every other request is aborted, so no
// server is needed.
//
// Usage: node tests/during-game-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM [SCREENSHOT_DIR]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2]);
const origin = 'http://127.0.0.1:8099/';
const repo = path.join(__dirname, '..');
const shotDir = process.argv[4] || null;
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin + '/' !== origin) return route.abort();
      const file = path.join(repo, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(repo + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack));
    await page.goto(origin);
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(() => { settings.justUniverse = false; });
    // An earlier win this session, held in memory only, gives game data a
    // comparison for the scripted win, so its rows can link to the charts.
    await page.evaluate(() => {
      history[modeKey()] = [{ outcome: 'win', endedAt: Date.now() - 5 * 60000, timeMs: 30000, bv3: 20, clicks: 40,
        misclicks: 0, wastedClicks: 2, fastclickGapMs: 250, fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION,
        mousePathPx: 6000, flagsPlaced: 10, flagsRemoved: 0,
        unusedCorrectFlags: 0, guesses: 0, actionEvaluations: [] }];
    });

    const centers = await page.evaluate(() => [...document.querySelectorAll('#board .cell')].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }));
    const press = async (cell, button = 'left') => {
      await page.mouse.move(centers[cell][0], centers[cell][1], { steps: 6 });
      await page.mouse.down({ button });
      await page.mouse.up({ button });
      await page.waitForTimeout(60);
    };
    const board = () => page.evaluate(() => ({ state: gameState,
      cells: cells.map((c) => ({ mine: c.mine, revealed: c.revealed, flagged: c.flagged })) }));

    // The first click, a flag placed and taken off again, two standing flags,
    // a click on an open square, a long pause, then every safe square in
    // board order.
    await press(40);
    let now = await board();
    const mines = now.cells.map((c, i) => (c.mine ? i : -1)).filter((i) => i >= 0);
    await press(mines[0], 'right');
    await press(mines[0], 'right');
    await press(mines[1], 'right');
    await press(mines[2], 'right');
    // Boards are random: an open number whose flags are all placed would chord.
    await press(await page.evaluate(() => cells.findIndex((c, i) => c.revealed && chordTargets(i) === null)));
    await page.waitForTimeout(1300);
    for (let guard = 0; guard < 81; guard++) {
      now = await board();
      if (now.state !== 'playing') break;
      await press(now.cells.findIndex((c) => !c.mine && !c.revealed && !c.flagged));
    }
    assert.equal(now.state === 'won' || (await board()).state === 'won', true, 'the scripted game is a win');

    const block = page.locator('.during-game');
    const drawn = () => page.waitForFunction(() => {
      const svg = document.querySelector('.during-game .during-game-chart svg');
      return svg !== null && svg.getBoundingClientRect().width > 0;
    }, null, { timeout: 30000 }).catch((error) => {
      throw new Error(error.message + '\npage errors: ' + JSON.stringify(errors));
    });
    await drawn();

    // Placement: the details column's first stat section, game data under
    // it, nothing in the lower sections.
    const placement = await page.evaluate(() => ({
      compact: pageLayout.classList.contains('compact-sidebar'),
      column: [...resultStats.children].map((el) => (el.matches('.stat-section.during-game') ? 'during-game' : el.className)),
      inRanks: resultRanks.querySelector('.during-game') !== null,
    }));
    assert.equal(placement.compact, false, 'the details column docks at 1920px');
    assert.deepEqual(placement.column, ['during-game', 'board-time-profile-host'], 'live perf charts, then game data');
    assert.equal(placement.inRanks, false, 'not a lower result section');
    const toggle = block.locator('.stat-section-toggle');
    assert.equal(await toggle.textContent(), 'live perf charts');
    assert.equal(await page.evaluate(() => settings.duringGameAveraging), 'rolling-2', 'a 2 s rolling average by default');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    // Its title closes and reopens it, remembered as a panel.
    await toggle.click();
    assert.equal(await block.locator('.stat-section-body').isHidden(), true, 'closed by its title');
    assert.equal(await page.evaluate(() => settings.panels.duringGame), false);
    await toggle.click();
    assert.equal(await block.locator('.stat-section-body').isVisible(), true, 'reopened');
    assert.equal(await page.evaluate(() => settings.panels.duringGame), true);

    // Charts: progress, the moves available, then the event tracks, then
    // every pace and board line on one chart against its whole-game value;
    // every plot on one time axis.
    const layout = await page.evaluate(() => {
      const shownRows = DuringGame.ROWS.filter((row) => settings.duringGameRows[row.id]);
      const parts = [...document.querySelectorAll('.during-game .during-game-chart')];
      const plotOf = (svg) => {
        const rect = svg.querySelector('rect.scatter-plot');
        return [Number(rect.getAttribute('x')), Number(rect.getAttribute('width'))];
      };
      const rowsOf = (id) => (id === DURING_GAME_TRACKS_ID
        ? DuringGame.TRACKS.flatMap(([track]) => shownRows.filter((row) => row.track === track))
        : shownRows.filter((row) => row.chart === id));
      return {
        expectedCharts: DURING_GAME_PARTS.filter((id) => rowsOf(id).length > 0),
        charts: parts.map((part) => part.dataset.chart),
        expectedLegend: DURING_GAME_PARTS.flatMap(rowsOf).map((row) => row.id),
        legend: [...document.querySelectorAll('.during-game-legend-item')].map((item) => item.dataset.row),
        expectedTracks: DuringGame.TRACKS.filter(([id]) => shownRows.some((row) => row.track === id)).map(([id]) => id),
        tracks: [...document.querySelectorAll('.during-game-track-name')].map((name) => name.dataset.track),
        lead: document.querySelector('[data-chart="relative"] .during-game-legend-lead').textContent,
        reference: document.querySelectorAll('[data-chart="relative"] line.during-game-reference').length,
        relativeY: [...document.querySelectorAll('[data-chart="relative"] text.tick-y')].map((t) => t.textContent),
        movesLead: document.querySelector('[data-chart="moves"] .during-game-legend-lead').textContent,
        movesY: [...document.querySelectorAll('[data-chart="moves"] text.tick-y')].map((t) => t.textContent),
        movesValues: [...document.querySelectorAll('[data-chart="moves"] .during-game-legend-value')].map((v) => v.textContent),
        plots: parts.map((part) => plotOf(part.querySelector('svg'))),
        legendsUnder: parts.map((part) => part.querySelector(':scope > .during-game-legend').getBoundingClientRect().top
          >= part.querySelector(':scope > svg').getBoundingClientRect().bottom),
        progressY: [...document.querySelectorAll('[data-chart="progress"] text.tick-y')].map((t) => t.textContent),
        xLabels: parts.map((part) => [...part.querySelectorAll('text.tick-x')].map((t) => t.textContent)),
        blockOverflow: document.querySelector('.during-game').scrollWidth - document.querySelector('.during-game').clientWidth,
      };
    });
    assert.deepEqual(layout.charts, ['progress', 'moves', 'events', 'relative'],
      'progress, the moves available, the tracks, then the chart with 3BV/s');
    assert.deepEqual(layout.charts, layout.expectedCharts);
    assert.equal(layout.movesLead, 'game average');
    assert(layout.movesY[0] === '0' && layout.movesY.every((label, i) => /^\d+$/.test(label)
      && (i === 0 || Number(label) > Number(layout.movesY[i - 1]))) && layout.movesY.length <= 5,
    'the moves chart counts from 0 in whole numbers: ' + layout.movesY);
    assert(layout.movesValues.length === 4 && layout.movesValues.every((value) => /^\d+(\.\d)?$/.test(value)),
      'four default counts, each averaged over the game: ' + layout.movesValues);
    assert.deepEqual(layout.legend, layout.expectedLegend, 'each chart and the tracks name their rows, in catalog order');
    assert(layout.legendsUnder.every(Boolean), 'each legend under its part: ' + layout.legendsUnder);
    assert.deepEqual(layout.tracks, layout.expectedTracks, 'one track per kind of event');
    assert.equal(layout.lead, 'whole game (1\u00d7)');
    assert.equal(layout.reference, 1, 'the whole-game line drawn once');
    assert(layout.relativeY.includes('1\u00d7') && layout.relativeY.includes('2\u00d7') && layout.relativeY.includes('\u00bd\u00d7'),
      'doublings each way of 1x: ' + layout.relativeY);
    assert(layout.plots.every(([x, w]) => x === layout.plots[0][0] && w === layout.plots[0][1] && w > 150),
      'one time axis: ' + JSON.stringify(layout.plots));
    assert.deepEqual(layout.progressY, ['0%', '20%', '40%', '60%', '80%', '100%'], 'progress labeled every 20%');
    assert(layout.xLabels[0].length >= 3 && layout.xLabels[0].every((label) => /^\d+(\.\d+)?s$/.test(label)),
      'seconds under the first chart: ' + layout.xLabels[0]);
    assert.deepEqual(layout.xLabels.at(-1), layout.xLabels[0], 'and under the last');
    assert(layout.xLabels.slice(1, -1).every((labels) => labels.length === 0), 'only there');
    assert.equal(layout.blockOverflow, 0, 'nothing spills past the block');
    const legendValue = (id) => block.locator('.during-game-legend-item[data-row="' + id + '"] .during-game-legend-value').textContent();
    assert.equal(await legendValue('bv3Solved'), '100%');
    assert.equal(await legendValue('safeOpened'), '100%');
    assert.equal(await legendValue('flagRemovedEvents'), '1', 'the tracks\u2019 legend counts each kind');
    assert.equal(await legendValue('longGapEvents'), '1');

    // Hover in the progress chart: the line, the card with that chart's
    // values, and the board itself showing that moment through the replay,
    // in the player's style. No second board.
    await page.evaluate(() => updateSettings({ numberDisplay: 'dots' }));
    const boardCells = () => page.evaluate(() => [...document.querySelectorAll('#board .cell')]
      .map((cell) => cell.className + '|' + cell.innerHTML));
    // Chromium delivers a pointer move with the next animation frame, so a
    // read right after a move can run before its handler; on a busy machine
    // it did. Reads after a move wait for that frame.
    const nextFrames = () => page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const replayState = async () => {
      await nextFrames();
      return page.evaluate(() => ({ step: replayStep, count: replayDecisionCount(),
        enabled: replayEnabled, slider: Number(replaySlider.value), saved: settings.replayPosition.step }));
    };
    const finishedCells = await boardCells();
    const atEnd = await replayState();
    assert.equal(atEnd.step, atEnd.count, 'the finished board before the hover');
    const plotBox = async (chart) => {
      const svg = await block.locator('[data-chart="' + chart + '"] svg').boundingBox();
      const plot = await block.locator('[data-chart="' + chart + '"] rect.scatter-plot').boundingBox();
      return { svg, plot };
    };
    // Along the plot's own row: a diagonal path from the board can cross a
    // legend name, whose definition then opens over the plot.
    const glideInto = async (box, x, y) => {
      await page.mouse.move(box.plot.x + 1, y);
      await page.mouse.move(x, y, { steps: 3 });
      await nextFrames();
    };
    const progress = await plotBox('progress');
    const hoverX = progress.plot.x + progress.plot.width * 0.6;
    await glideInto(progress, hoverX, progress.plot.y + progress.plot.height / 2);
    assert.equal(await block.locator('.during-game-line').isVisible(), true);
    const card = page.locator('.during-game-card');
    assert.equal(await card.isVisible(), true);
    assert.match(await card.locator('.during-game-card-time').textContent(), /^\d+\.\d s$/);
    const cardRows = await card.locator('.during-game-card-row').allTextContents();
    assert.equal(cardRows.length, 1, 'only the line under the pointer: ' + cardRows);
    assert.match(cardRows[0], /^ (3BV solved|squares opened|mines flagged) \d+%$/);
    assert.equal(await page.locator('.during-game-board').count(), 0, 'no board beside the block');
    const previewed = await replayState();
    assert(previewed.step > 0 && previewed.step < previewed.count, 'the board shows a mid-game moment: ' + JSON.stringify(previewed));
    assert.equal(previewed.enabled, true);
    assert.equal(previewed.slider, previewed.step, 'the transport follows the moment');
    assert.equal(previewed.saved, atEnd.count, 'a preview is not remembered');
    const hovered = await page.evaluate(() => {
      // A string as innerHTML gives it back.
      const parsed = document.createElement('div');
      parsed.innerHTML = chosenFlagSvg();
      const shown = [...document.querySelectorAll('#board .cell')];
      const cardRect = document.querySelector('.during-game-card').getBoundingClientRect();
      const boardRect = document.getElementById('board').getBoundingClientRect();
      return {
        // A proven mine not yet flagged carries its flag hint inside a span.
        flags: shown.filter((cell) => cell.querySelector(':scope > svg.flag')).map((cell) => cell.innerHTML === parsed.innerHTML),
        dots: shown.filter((cell) => /\bn[1-8]\b/.test(cell.className)).map((cell) => cell.querySelector('.num-dot') !== null),
        shaded: shown.filter((cell) => cell.classList.contains('replay-selected')).length,
        status: replayStatus.textContent,
        cardClear: cardRect.left >= boardRect.right || cardRect.right <= boardRect.left
          || cardRect.top >= boardRect.bottom || cardRect.bottom <= boardRect.top,
        cardInside: cardRect.left >= 0 && cardRect.right <= document.documentElement.clientWidth,
      };
    });
    assert(hovered.flags.length > 0 && hovered.flags.every(Boolean), 'the player\u2019s flag: ' + hovered.flags);
    assert(hovered.dots.length > 0 && hovered.dots.every(Boolean), 'the player\u2019s number display');
    assert(hovered.shaded > 0, 'the next click\u2019s squares shaded');
    assert.match(hovered.status, /^\d+ of \d+ actions done \u00b7 deciding at /, 'the transport names the moment: ' + hovered.status);
    assert.equal(hovered.cardClear, true, 'the card clear of the board');
    assert.equal(hovered.cardInside, true);
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-hover.png' });

    // The board follows the pointer, past the last action to the finished
    // board; leaving the charts returns it to the replay's own position, here
    // the finished board.
    await page.mouse.move(progress.plot.x + progress.plot.width * 0.3, progress.plot.y + 10, { steps: 3 });
    const earlier = await replayState();
    assert(earlier.step < previewed.step, 'an earlier moment, an earlier step: ' + JSON.stringify([earlier, previewed]));
    await page.mouse.move(progress.plot.x + progress.plot.width - 1, progress.plot.y + 10, { steps: 3 });
    const last = await replayState();
    assert.equal(last.step, last.count, 'the axis\u2019s end shows the finished board');
    assert.deepEqual(await boardCells(), finishedCells, 'as the game board shows it');
    await page.mouse.move(hoverX, progress.plot.y + 10, { steps: 3 });
    await page.mouse.move(5, 5);
    const leftCharts = await replayState();
    assert.equal(leftCharts.step, leftCharts.count, 'leaving the charts returns the board to the finished board');
    assert.equal(leftCharts.saved, leftCharts.count);
    assert.deepEqual(await boardCells(), finishedCells);
    assert.equal(await card.isVisible(), false);

    // The relative chart: the card names the line nearest the pointer, with
    // its own value at that moment, and that line comes forward.
    const relative = await plotBox('relative');
    const nearestLine = await page.evaluate(() => {
      const svg = document.querySelector('[data-chart="relative"] svg');
      const lines = [...svg.querySelectorAll('path.end-line')];
      const along = (line, parts) => Array.from({ length: parts + 1 },
        (_, i) => line.getPointAtLength(line.getTotalLength() * i / parts));
      // Boards and timings vary, so lines can cross anywhere: take the point
      // of a long line farthest from every other line.
      let best = null;
      for (const line of lines.filter((candidate) => candidate.getTotalLength() > 40)) {
        const others = lines.filter((other) => other !== line).flatMap((other) => along(other, 200));
        for (const point of along(line, 20).slice(2, -2)) {
          const clearance = Math.min(...others.map((other) => Math.hypot(other.x - point.x, other.y - point.y)));
          if (best === null || clearance > best.clearance) best = { line, point, clearance };
        }
      }
      const box = svg.getBoundingClientRect();
      return { x: box.left + best.point.x, y: box.top + best.point.y, color: best.line.getAttribute('stroke') };
    });
    await glideInto(relative, nearestLine.x, nearestLine.y);
    const relativeRows = await card.locator('.during-game-card-row').allTextContents();
    assert.equal(relativeRows.length, 1, 'one line: ' + relativeRows);
    const named = await page.evaluate(() => {
      const row = document.querySelector('.during-game-card-row');
      return { color: row.querySelector('.end-swatch').style.background,
        hot: [...document.querySelectorAll('[data-chart="relative"] path.end-line.hot')].map((line) => line.getAttribute('stroke')) };
    });
    const rgb = (hex) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
    assert.equal(named.color, rgb(nearestLine.color), 'the card names the line under the pointer');
    assert.deepEqual(named.hot, [nearestLine.color], 'and brings it forward');
    // While it is in focus the y labels give its values, 1x its whole-game
    // value, at the same ticks.
    const relativeLabels = () => page.evaluate(() => [...document.querySelectorAll('[data-chart="relative"] text.tick-y')]
      .map((t) => t.textContent));
    const namedRow = await page.evaluate((color) => DuringGame.ROWS
      .find((row) => row.chart === 'relative' && row.color === color).id, nearestLine.color);
    const focusedLabels = await relativeLabels();
    assert(focusedLabels.includes(await legendValue(namedRow)) && focusedLabels.every((label) => !label.endsWith('\u00d7')),
      'the y labels in ' + namedRow + '\u2019s values: ' + focusedLabels);

    // The moves chart: the card gives a line's count at that moment, whole.
    const moves = await plotBox('moves');
    await glideInto(moves, moves.plot.x + moves.plot.width * 0.5, moves.plot.y + moves.plot.height - 2);
    const movesRows = await card.locator('.during-game-card-row').allTextContents();
    assert.equal(movesRows.length, 1, 'one line: ' + movesRows);
    assert.match(movesRows[0], /^ (safe squares known|mines by counting|mines by counting near the last move|chordable numbers) \d+$/);
    assert((await relativeLabels()).every((label) => label.endsWith('\u00d7')), 'the ratios again once the line lets go');

    // An event track: the long gap's card in words, and the board then rings
    // its proven-safe squares under the replay's available-moves overlay.
    const gapSpan = await page.evaluate(() => {
      const tracks = [...document.querySelectorAll('.during-game-track-name')].map((name) => name.dataset.track);
      const y = 1 + tracks.indexOf('pauses') * 18 + 4;
      const span = [...document.querySelectorAll('.during-game-tracks-svg rect.during-game-mark')]
        .find((rect) => Number(rect.getAttribute('y')) === y);
      const box = span.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await page.mouse.move(gapSpan.x, gapSpan.y, { steps: 3 });
    const gapCard = await card.locator('.during-game-card-row').allTextContents();
    assert.equal(gapCard[0], 'pauses');
    assert.match(gapCard[1], /^\d+\.\d s pause, ended by /);
    const known = gapCard.map((row) => /^(\d+) proven-safe squares? known/.exec(row)).find(Boolean);
    if (known) {
      assert.equal(await page.locator('#board .cell.replay-safe').count(), Number(known[1]),
        'the pause\u2019s proven-safe squares ringed on the board');
    }

    // A click keeps the moment: the replay stays there after the pointer
    // leaves, remembered as its position, and a later hover returns there.
    await page.mouse.move(hoverX, progress.plot.y + progress.plot.height / 2, { steps: 3 });
    const clicked = (await replayState()).step;
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(5, 5);
    const replay = await page.evaluate(() => ({ shown: replayControls.checkVisibility(), step: replayStep,
      count: replayDecisionCount(), saved: settings.replayPosition.step }));
    assert.equal(replay.shown, true);
    assert(replay.step > 0 && replay.step < replay.count, 'a mid-game step: ' + JSON.stringify(replay));
    assert.equal(replay.step, clicked, 'the moment clicked');
    assert.equal(replay.saved, clicked, 'remembered as the replay position');
    assert.equal(await card.isVisible(), false);
    await glideInto(progress, progress.plot.x + progress.plot.width * 0.15, progress.plot.y + 10);
    assert.notEqual((await replayState()).step, clicked);
    await page.mouse.move(5, 5);
    assert.equal((await replayState()).step, clicked, 'leaving returns to the moment clicked');

    // Legend clicks: with every line shown, a click shows its line alone,
    // another adds its line, a second click on one removes it, and removing
    // the last shows every line again. Each legend chooses for itself,
    // hidden lines' names are struck, and the plots keep their place.
    const entry = (id) => block.locator('.during-game-legend-item[data-row="' + id + '"]');
    const strokes = (chart) => page.evaluate((id) => [...document.querySelectorAll('[data-chart="' + id + '"] path.end-line')]
      .map((line) => line.getAttribute('stroke')).sort(), chart);
    const offRows = () => page.evaluate(() => [...document.querySelectorAll('.during-game-legend-off')].map((item) => item.dataset.row));
    const plotPlaces = () => page.evaluate(() => [...document.querySelectorAll('.during-game-chart svg rect.scatter-plot')]
      .map((rect) => rect.getAttribute('x') + ' ' + rect.getAttribute('width')));
    const colorOf = (id) => page.evaluate((row) => DuringGame.rowById(row).color, id);
    const relativeIds = await page.evaluate(() => [...document.querySelectorAll('[data-chart="relative"] .during-game-legend-item')]
      .map((item) => item.dataset.row));
    const everyLine = await strokes('relative');
    const progressLines = await strokes('progress');
    const places = await plotPlaces();
    const gapColor = await colorOf('actionGap');
    const rateColor = await colorOf('bvPerSecond');
    await entry('actionGap').click();
    assert.deepEqual(await strokes('relative'), [gapColor], 'a click shows its line alone');
    assert.deepEqual(await offRows(), relativeIds.filter((id) => id !== 'actionGap'), 'the others struck');
    assert.deepEqual(await strokes('progress'), progressLines, 'each legend chooses for itself');
    assert.deepEqual(await plotPlaces(), places, 'the plots keep their place');
    await entry('bvPerSecond').click();
    assert.deepEqual(await strokes('relative'), [gapColor, rateColor].sort(), 'another adds its line');
    await entry('bvPerSecond').click();
    assert.deepEqual(await strokes('relative'), [gapColor], 'a second click removes it');
    await entry('actionGap').click();
    assert.deepEqual(await strokes('relative'), everyLine, 'removing the last shows every line again');
    assert.deepEqual(await offRows(), []);
    const marks = () => page.locator('.during-game-tracks-svg .during-game-mark').count();
    const everyMark = await marks();
    await entry('flagRemovedEvents').click();
    assert.equal(await marks(), 1, 'the tracks\u2019 legend too: only the flag taken off');
    await entry('flagRemovedEvents').click();
    assert.equal(await marks(), everyMark, 'and back to every mark');

    // Game data and the live perf charts show each measurement as the one
    // catalog defines it: the same whole-game value, a game data row's hover
    // brings forward that measurement's lines and event marks alone, and a
    // line's or legend entry's hover rings its game data row.
    const dataRow = (id) => page.locator('#result-stats .game-data-row[data-side="performance"][data-measurement="' + id + '"]');
    await dataRow('bvPerSecond').waitFor({ timeout: 30000 });
    for (const id of ['bvPerSecond', 'clickRate', 'fastclickGap']) {
      assert.equal(await legendValue(id), await dataRow(id).locator('.game-data-value').textContent(), id + ': one value in both');
    }
    // The saved record names the fastclick gap's definition beside its value.
    const savedFastclick = await page.evaluate(() => {
      const record = history[modeKey()].at(-1);
      return [record.fastclickGapVersion, record.fastclickGapMs, GameData.FASTCLICK_GAP_VERSION];
    });
    assert.equal(savedFastclick[0], savedFastclick[2], 'the record names the definition it was measured under');
    assert.equal(await legendValue('fastclickGap'), savedFastclick[1] === undefined ? 'not measured' : savedFastclick[1] + 'ms',
      'the planned pairs the record\u2019s median reads');
    const spotlit = () => page.evaluate(() => ({
      parts: [...document.querySelectorAll('.during-game svg.series-focus')].map((svg) => svg.closest('[data-chart]').dataset.chart),
      colors: [...new Set([...document.querySelectorAll('.during-game .hot')].map((node) => (node.getAttribute('stroke') !== null
        && node.getAttribute('stroke') !== 'none' ? node.getAttribute('stroke') : node.getAttribute('fill'))))],
    }));
    await dataRow('bvPerSecond').hover();
    assert.deepEqual(await spotlit(), { parts: ['relative'], colors: [rateColor] }, 'a game data row brings its line forward alone');
    await page.mouse.move(5, 5);
    assert.deepEqual(await spotlit(), { parts: [], colors: [] }, 'and lets go on leaving');
    assert(Number(await legendValue('noOpEvents')) > 0, 'the click on an open square is a no-op');
    await dataRow('noopRate').hover();
    assert.deepEqual(await spotlit(), { parts: ['events'], colors: [await colorOf('noOpEvents')] },
      'the no-op rate\u2019s row brings forward the no-op clicks\u2019 marks');
    await page.mouse.move(5, 5);
    const ringed = () => page.evaluate(() => [...document.querySelectorAll('#result-stats .game-data-linked')]
      .map((element) => element.dataset.measurement));
    await entry('bvPerSecond').hover();
    assert.deepEqual(await ringed(), ['bvPerSecond'], 'a legend entry rings its game data row');
    assert.deepEqual(await spotlit(), { parts: ['relative'], colors: [rateColor] });
    assert.match(await dataRow('bvPerSecond').locator('.chart-help-label').evaluate((label) => getComputedStyle(label).boxShadow),
      /rgb\(135, 206, 250\)/, 'in the this-game color');
    await entry('noOpEvents').hover();
    assert.deepEqual(await ringed(), ['noopRate'], 'an event track\u2019s entry rings the rate counted over its events');
    await page.mouse.move(5, 5);
    assert.deepEqual(await ringed(), [], 'and lets go on leaving');
    // The 3BV/s line alone, so it is the line under the pointer.
    await entry('bvPerSecond').click();
    const relativeNow = await plotBox('relative');
    const rateLine = await page.evaluate(() => {
      const svg = document.querySelector('[data-chart="relative"] svg');
      const line = svg.querySelector('path.end-line');
      const point = line.getPointAtLength(line.getTotalLength() * 0.7);
      const box = svg.getBoundingClientRect();
      return { x: box.left + point.x, y: box.top + point.y };
    });
    await glideInto(relativeNow, rateLine.x, rateLine.y);
    assert.deepEqual(await ringed(), ['bvPerSecond'], 'the line under the pointer rings its row');
    await page.mouse.move(5, 5);
    assert.deepEqual(await ringed(), []);
    await entry('bvPerSecond').click();
    assert.deepEqual(await strokes('relative'), everyLine);

    // The scale: linear from 0 with 1x labeled and drawn, remembered; the
    // legend's picks hold through the redraw, and the plots keep their place.
    const logScale = block.locator('.during-game-controls label', { hasText: 'log scale' }).locator('input[type="checkbox"]');
    assert.equal(await block.locator('.during-game-controls select').count(), 1, 'averaging is the one select');
    assert.equal(await logScale.isChecked(), true, 'log by default');
    await entry('actionGap').click();
    await logScale.uncheck();
    const linear = await page.evaluate(() => ({
      saved: settings.duringGameRelativeScale,
      labels: [...document.querySelectorAll('[data-chart="relative"] text.tick-y')].map((t) => t.textContent),
      reference: document.querySelectorAll('[data-chart="relative"] line.during-game-reference').length,
    }));
    assert.equal(linear.saved, 'linear');
    // One line shown: the y labels give its values, from 0, 1x its
    // whole-game value.
    assert.equal(linear.labels[0], '0ms', 'linear from 0: ' + linear.labels);
    assert(linear.labels.includes(await legendValue('actionGap')) && linear.labels.every((label) => /^\d+ms$/.test(label)),
      'one line shown, its values: ' + linear.labels);
    assert.equal(linear.reference, 1, 'the whole-game line drawn once');
    assert.deepEqual(await strokes('relative'), [gapColor], 'the picks hold through the redraw');
    assert.deepEqual(await plotPlaces(), places);
    await entry('actionGap').click();
    await page.mouse.move(5, 5);
    const ratios = await relativeLabels();
    assert(ratios[0] === '0\u00d7' && ratios.includes('1\u00d7') && ratios.every((label) => /^\d+(\.5)?\u00d7$/.test(label)),
      'every line shown, the linear steps in ratios: ' + ratios);
    if (shotDir) await block.screenshot({ path: shotDir + '/during-game-block.png' });

    // Configure: one row off, back, and its line is gone.
    await block.locator('.during-game-controls button', { hasText: 'configure' }).click();
    await block.locator('input[aria-label="mouse speed"]').uncheck();
    await block.locator('.during-game-config button', { hasText: 'back to live perf charts' }).first().click();
    await drawn();
    const legendRows = () => block.locator('.during-game-legend-item').evaluateAll((items) => items.map((item) => item.dataset.row));
    assert.equal((await legendRows()).includes('mouseSpeed'), false);
    assert.equal(await page.evaluate(() => settings.duringGameRows.mouseSpeed), false);

    // Raw averaging: dots for measured gaps and ticks for rates, which have
    // no line; the choice is remembered.
    const averagingSelect = block.locator('.during-game-controls label', { hasText: 'averaging' }).locator('select');
    await averagingSelect.selectOption('raw');
    await page.waitForFunction(() => settings.duringGameAveraging === 'raw'
      && document.querySelector('[data-chart="relative"] .during-game-dot') !== null
      && document.querySelector('[data-chart="relative"] .during-game-tick') !== null);
    const rawLines = await page.evaluate(() => [...document.querySelectorAll('[data-chart="relative"] path.end-line')]
      .map((line) => line.getAttribute('stroke')));
    const rateColors = await page.evaluate(() => DuringGame.ROWS.filter((row) => ['bvPerSecond', 'clickRate'].includes(row.id))
      .map((row) => row.color));
    assert(rateColors.every((color) => !rawLines.includes(color)), 'rates in raw are ticks only');

    // A reload restores the game and its block with the saved choices. The
    // saved record is first made one measured before planned pairs; the
    // restore measures it again, and its old value gives way.
    const endedAt = await page.evaluate(() => renderedResult.record.endedAt);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const record = renderedResult.record;
      delete record.fastclickGapVersion;
      record.fastclickGapMs = 999;
      const tx = db.transaction(RECORD_STORE, 'readwrite');
      tx.objectStore(RECORD_STORE).put(record, [modeKey(), record.endedAt]);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
    await page.evaluate((ended) => updateSettings({ resultView: 'game', replayPosition: { endedAt: ended, step: 0 } }), endedAt);
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    await drawn();
    await page.waitForFunction(() => renderedResult.record.fastclickGapVersion !== undefined, null, { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => [renderedResult.record.fastclickGapVersion, renderedResult.record.fastclickGapMs]),
      [savedFastclick[2], savedFastclick[1]], 'an older record\u2019s fastclick gap is measured again on restore');
    assert.equal((await legendRows()).includes('mouseSpeed'), false);
    assert.equal(await averagingSelect.inputValue(), 'raw');
    assert.equal(await logScale.isChecked(), false);
    assert.equal(await page.locator('[data-chart="relative"] text.tick-y').first().textContent(), '0\u00d7', 'drawn linear');
    assert.equal(await legendValue('flagRemovedEvents'), '1');

    // A loss shows its own game, not the latest win the rank tables use; the
    // details column holds the block alone, no game data, and the loss's
    // statistics are the "this game" table among the tables under the board.
    await page.locator('#face-button').click();
    await press(40);
    now = await board();
    await press(now.cells.findIndex((c) => c.mine));
    assert.equal((await board()).state, 'lost');
    await page.waitForFunction(() => {
      const value = document.querySelector('.during-game-legend-item[data-row="bv3Solved"] .during-game-legend-value');
      return value !== null && value.textContent !== '100%';
    }, null, { timeout: 30000 });
    // The finished-game analysis renders the result once more; a hover
    // before then reaches a block about to be replaced.
    await page.waitForFunction(() => boardMetricJobs.get(renderedResult.record).status === 'done'
      && !resultRanks.hasAttribute('aria-busy'), null, { timeout: 30000 });
    await drawn();
    assert.equal(Number(await legendValue('guessEvents')) + Number(await legendValue('misclickEvents')), 1,
      'the click on a mine is a guess or a misclick');
    assert.deepEqual(await page.evaluate(() => [...resultStats.children]
      .map((el) => (el.matches('.stat-section.during-game') ? 'during-game' : el.id || el.className))),
    ['during-game'], 'a loss: live perf charts alone in the details column');
    assert.equal(await page.evaluate(() => resultRanks
      .querySelector('.result-chart-section-tables .game-stats h4')?.textContent), 'this game',
    'a loss: its statistics are the "this game" table');

    // A middle width: the hover shows the moment on the board beside the
    // docked column, and the card stays inside the window, clear of the board.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(300);
    await page.locator('.during-game').scrollIntoViewIfNeeded();
    const middle = await plotBox('progress');
    const middleBase = (await replayState()).step;
    await glideInto(middle, middle.plot.x + middle.plot.width * 0.5, middle.plot.y + middle.plot.height / 2);
    assert.notEqual((await replayState()).step, middleBase, 'the board shows the moment at 1100px');
    const middleView = await page.evaluate(() => {
      const cardRect = document.querySelector('.during-game-card').getBoundingClientRect();
      const boardRect = document.getElementById('board').getBoundingClientRect();
      return { compact: pageLayout.classList.contains('compact-sidebar'),
        cardInside: cardRect.left >= 0 && cardRect.right <= document.documentElement.clientWidth,
        cardClear: cardRect.left >= boardRect.right || cardRect.right <= boardRect.left
          || cardRect.top >= boardRect.bottom || cardRect.bottom <= boardRect.top };
    });
    assert.equal(middleView.compact, false, 'the column docks at 1100px');
    assert.equal(middleView.cardInside, true, 'the card inside the window at 1100px');
    assert.equal(middleView.cardClear, true, 'the card clear of the board at 1100px');
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-1100.png' });
    await page.mouse.move(0, 0);
    assert.equal((await replayState()).step, middleBase, 'and back on leaving');

    // Phone width: the block leads the Game details popover and its plots
    // follow the width; the card stays in the window, and a click closes the
    // popover to show the board at the moment clicked.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    await page.locator('#game-sidebar-button').click();
    await page.waitForTimeout(200);
    const phone = await page.evaluate(() => {
      const el = document.querySelector('.during-game');
      return { first: resultStats.firstElementChild === el, overflow: el.scrollWidth - el.clientWidth,
        widths: [...el.querySelectorAll('.during-game-chart > svg')].map((svg) => svg.getBoundingClientRect().width) };
    });
    assert.equal(phone.first, true, 'first in the details column');
    assert.equal(phone.overflow, 0, 'nothing spills at 390px');
    assert(phone.widths.every((width) => width > 200 && width < 390), 'plots follow the column: ' + phone.widths);
    const narrow = await plotBox('progress');
    await glideInto(narrow, narrow.plot.x + narrow.plot.width * 0.5, narrow.plot.y + narrow.plot.height / 2);
    const phoneCard = await page.locator('.during-game-card').boundingBox();
    assert(phoneCard.x >= 0 && phoneCard.x + phoneCard.width <= 390 && phoneCard.y >= 0 && phoneCard.y + phoneCard.height <= 900,
      'the card inside the window: ' + JSON.stringify(phoneCard));
    const phoneStep = (await replayState()).step;
    await page.mouse.down();
    await page.mouse.up();
    const phoneAfter = await page.evaluate(() => ({ open: gameSidebar.matches(':popover-open'), step: replayStep,
      saved: settings.replayPosition.step, card: document.querySelector('.during-game-card').matches(':popover-open') }));
    assert.equal(phoneAfter.open, false, 'the click closes Game details to show the board');
    assert.deepEqual([phoneAfter.step, phoneAfter.saved], [phoneStep, phoneStep], 'at the moment clicked');
    assert.equal(phoneAfter.card, false, 'the card closes with it');
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-390.png' });
    assert.deepEqual(errors, []);
    console.log('live perf charts: details-column placement and toggle, charts and tracks on one axis with each legend under its part, the moves available in whole counts, the card naming the line under the pointer, y labels in the focused or lone line\u2019s values, the board showing the hovered moment in the player\u2019s style and back on leaving, a click keeping it, legend picks, game data rows and lines linked with one value, log and linear scales, configure, averaging, restore, loss, middle width, and phone width passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
