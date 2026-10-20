'use strict';
// Live perf charts, after a real game played with real mouse input: its
// place as the details column's first stat section, its title opening and
// closing it, the progress chart, the one chart of pace and board lines
// against their whole-game values, and the event tracks, all on one time
// axis; the hover line and the card naming the line under the pointer with
// its value; the board at a moment beside the block in the player's board
// style; the replay link; configure and averaging; its return after a
// reload restores the game; a loss; a middle width; and phone width. Writes storage, so it runs on the test origin;
// pages are served from the working tree by request routing under that
// origin and every other request is aborted, so no server is needed.
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
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(() => { settings.justUniverse = false; });

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
    await press(now.cells.findIndex((c) => c.revealed));
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
    }, null, { timeout: 30000 });
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

    // Charts: progress, then every pace and board line on one chart against
    // its whole-game value, then the event tracks; every plot on one time
    // axis.
    const layout = await page.evaluate(() => {
      const shownRows = DuringGame.ROWS.filter((row) => settings.duringGameRows[row.id]);
      const parts = [...document.querySelectorAll('.during-game .during-game-chart')];
      const plotOf = (svg) => {
        const rect = svg.querySelector('rect.scatter-plot');
        return [Number(rect.getAttribute('x')), Number(rect.getAttribute('width'))];
      };
      return {
        expectedCharts: [...DuringGame.CHARTS.filter((chart) => shownRows.some((row) => row.chart === chart.id))
          .map((chart) => chart.id), 'events'],
        charts: parts.map((part) => part.dataset.chart),
        expectedLegend: [...DuringGame.CHARTS.flatMap((chart) => shownRows.filter((row) => row.chart === chart.id)),
          ...DuringGame.TRACKS.flatMap(([id]) => shownRows.filter((row) => row.track === id))].map((row) => row.id),
        legend: [...document.querySelectorAll('.during-game-legend-item')].map((item) => item.dataset.row),
        expectedTracks: DuringGame.TRACKS.filter(([id]) => shownRows.some((row) => row.track === id)).map(([id]) => id),
        tracks: [...document.querySelectorAll('.during-game-track-name')].map((name) => name.dataset.track),
        lead: document.querySelector('[data-chart="relative"] .during-game-legend-lead').textContent,
        reference: document.querySelectorAll('[data-chart="relative"] line.during-game-reference').length,
        relativeY: [...document.querySelectorAll('[data-chart="relative"] text.tick-y')].map((t) => t.textContent),
        plots: parts.map((part) => plotOf(part.querySelector('svg'))),
        progressY: [...document.querySelectorAll('[data-chart="progress"] text.tick-y')].map((t) => t.textContent),
        xLabels: parts.map((part) => [...part.querySelectorAll('text.tick-x')].map((t) => t.textContent)),
        blockOverflow: document.querySelector('.during-game').scrollWidth - document.querySelector('.during-game').clientWidth,
      };
    });
    assert.deepEqual(layout.charts, ['progress', 'relative', 'events'], 'progress, the relative chart, then the tracks');
    assert.deepEqual(layout.charts, layout.expectedCharts);
    assert.deepEqual(layout.legend, layout.expectedLegend, 'each chart and the tracks name their rows, in catalog order');
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
    // values, and the board then beside the block in the player's style.
    await page.evaluate(() => updateSettings({ numberDisplay: 'dots' }));
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
    };
    const progress = await plotBox('progress');
    const hoverX = progress.plot.x + progress.plot.width * 0.6;
    await glideInto(progress, hoverX, progress.plot.y + progress.plot.height / 2);
    assert.equal(await block.locator('.during-game-line').isVisible(), true);
    const card = page.locator('.during-game-card');
    const boardPanel = page.locator('.during-game-board');
    assert.equal(await card.isVisible(), true);
    assert.match(await card.locator('.during-game-card-time').textContent(), /^\d+\.\d s$/);
    const cardRows = await card.locator('.during-game-card-row').allTextContents();
    assert.equal(cardRows.length, 1, 'only the line under the pointer: ' + cardRows);
    assert.match(cardRows[0], /^ (3BV solved|squares opened|mines flagged) \d+%$/);
    assert.equal(await boardPanel.isVisible(), true);
    const hovered = await page.evaluate(() => {
      // A string as innerHTML gives it back.
      const parsed = document.createElement('div');
      parsed.innerHTML = chosenFlagSvg();
      const panel = document.querySelector('.during-game-board');
      const cellsShown = [...panel.querySelectorAll('.during-game-board-grid > div')];
      const blockRect = document.querySelector('.during-game').getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        head: panel.querySelector('.during-game-board-head').textContent,
        count: cellsShown.length,
        side: panel.dataset.side,
        clear: panelRect.right <= blockRect.left || panelRect.left >= blockRect.right,
        top: [panelRect.top, Math.max(4, Math.min(blockRect.top, innerHeight - panelRect.height - 4))],
        inside: panelRect.left >= 0 && panelRect.right <= innerWidth,
        flags: cellsShown.filter((cell) => cell.classList.contains('hidden') && cell.querySelector('svg.flag'))
          .map((cell) => cell.innerHTML === parsed.innerHTML),
        dots: cellsShown.filter((cell) => /\bn[1-8]\b/.test(cell.className)).map((cell) => cell.querySelector('.num-dot') !== null),
        shaded: cellsShown.filter((cell) => cell.classList.contains('replay-selected')).length,
      };
    });
    assert.match(hovered.head, /^\d+\.\d s \u00b7 next: .+ at row \d, column \d$/, 'the moment and the next click');
    assert.equal(hovered.count, 81, 'the Beginner board');
    assert.equal(hovered.clear, true, 'beside the block, not over it: ' + hovered.side);
    assert(Math.abs(hovered.top[0] - hovered.top[1]) < 1, 'level with the block\u2019s top: ' + hovered.top);
    assert.equal(hovered.inside, true);
    assert(hovered.flags.length > 0 && hovered.flags.every(Boolean), 'the player\u2019s flag: ' + hovered.flags);
    assert(hovered.dots.length > 0 && hovered.dots.every(Boolean), 'the player\u2019s number display');
    assert(hovered.shaded > 0, 'the next click\u2019s squares shaded');
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-hover.png' });

    // The board stays put while the pointer moves; past the last action it
    // is the finished board.
    const before = await boardPanel.boundingBox();
    await page.mouse.move(progress.plot.x + progress.plot.width * 0.3, progress.plot.y + 10, { steps: 3 });
    assert.deepEqual(await boardPanel.boundingBox(), before, 'the board does not follow the pointer');
    await page.mouse.move(progress.plot.x + progress.plot.width - 1, progress.plot.y + 10, { steps: 3 });
    const finished = await page.evaluate(() => ({
      head: document.querySelector('.during-game-board-head').textContent,
      same: [...document.querySelectorAll('.during-game-board-grid > div')].every((cell, i) =>
        cell.className === finishedBoardCells()[i].className && cell.innerHTML === finishedBoardCells()[i].innerHTML),
    }));
    assert.match(finished.head, /the finished board$/);
    assert.equal(finished.same, true, 'the finished board as the game board shows it');

    // The relative chart: the card names the line nearest the pointer, with
    // its own value at that moment, and that line comes forward.
    const relative = await plotBox('relative');
    const nearestLine = await page.evaluate(() => {
      const svg = document.querySelector('[data-chart="relative"] svg');
      const path = [...svg.querySelectorAll('path.end-line')].find((line) => line.getTotalLength() > 40);
      const point = path.getPointAtLength(path.getTotalLength() * 0.5);
      const box = svg.getBoundingClientRect();
      return { x: box.left + point.x, y: box.top + point.y, color: path.getAttribute('stroke') };
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

    // An event track: the long gap's card in words and its proven-safe
    // squares ringed on the board.
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
      assert.equal(await page.locator('.during-game-board-grid > .replay-safe').count(), Number(known[1]),
        'the pause\u2019s proven-safe squares ringed');
    }

    // Clicking moves the transport under the board to the board of that moment.
    await page.mouse.move(hoverX, progress.plot.y + progress.plot.height / 2, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    const replay = await page.evaluate(() => ({ shown: replayControls.checkVisibility(), step: replayStep, count: replayDecisionCount() }));
    assert.equal(replay.shown, true);
    assert(replay.step > 0 && replay.step < replay.count, 'a mid-game step: ' + JSON.stringify(replay));
    await page.mouse.move(5, 5);
    assert.equal(await card.isVisible(), false);
    assert.equal(await boardPanel.isVisible(), false);
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
    await block.locator('select.avg-mode-select').selectOption('raw');
    await page.waitForFunction(() => settings.duringGameAveraging === 'raw'
      && document.querySelector('[data-chart="relative"] .during-game-dot') !== null
      && document.querySelector('[data-chart="relative"] .during-game-tick') !== null);
    const rawLines = await page.evaluate(() => [...document.querySelectorAll('[data-chart="relative"] path.end-line')]
      .map((line) => line.getAttribute('stroke')));
    const rateColors = await page.evaluate(() => DuringGame.ROWS.filter((row) => ['bvPerSecond', 'clickRate'].includes(row.id))
      .map((row) => row.color));
    assert(rateColors.every((color) => !rawLines.includes(color)), 'rates in raw are ticks only');

    // A reload restores the game and its block with the saved choices.
    const endedAt = await page.evaluate(() => renderedResult.record.endedAt);
    await page.evaluate((ended) => updateSettings({ resultView: 'game', replayPosition: { endedAt: ended, step: 0 } }), endedAt);
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    await drawn();
    assert.equal((await legendRows()).includes('mouseSpeed'), false);
    assert.equal(await block.locator('select.avg-mode-select').inputValue(), 'raw');
    assert.equal(await legendValue('flagRemovedEvents'), '1');

    // A loss shows its own game, not the latest win the rank tables use, and
    // the details column holds the block and the loss's statistics, no game
    // data.
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
    ['during-game', 'stats-grid'], 'a loss: live perf charts, then its statistics');

    // A middle width: wherever the block sits, the board at a moment stands
    // beside it, not over it, inside the window.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(300);
    await page.locator('.during-game').scrollIntoViewIfNeeded();
    const middle = await plotBox('progress');
    await glideInto(middle, middle.plot.x + middle.plot.width * 0.5, middle.plot.y + middle.plot.height / 2);
    const middleBoard = await boardPanel.boundingBox();
    const middleBlock = await page.locator('.during-game').boundingBox();
    assert(middleBoard.x >= 0 && middleBoard.x + middleBoard.width <= 1100, 'the board inside the window at 1100px');
    assert(middleBoard.x >= middleBlock.x + middleBlock.width || middleBoard.x + middleBoard.width <= middleBlock.x,
      'the board beside the block at 1100px: ' + JSON.stringify([middleBoard, middleBlock]));
    const middleCard = await page.locator('.during-game-card').boundingBox();
    const middleRoom = await page.evaluate(() => document.documentElement.clientWidth);
    assert(middleCard.x >= 0 && middleCard.x + middleCard.width <= middleRoom,
      'the card inside the window at 1100px: ' + JSON.stringify([middleCard, middleRoom]));
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-1100.png' });
    await page.mouse.move(0, 0);

    // Phone width: the block leads the Game details popover, its plots
    // follow the width, and the board at a moment stays in the window,
    // clear of the chart being read and of the card.
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
    const pointerY = narrow.plot.y + narrow.plot.height / 2;
    await glideInto(narrow, narrow.plot.x + narrow.plot.width * 0.5, pointerY);
    const phoneBoard = await boardPanel.boundingBox();
    assert(phoneBoard.x >= 0 && phoneBoard.x + phoneBoard.width <= 390, 'the board inside the window: ' + JSON.stringify(phoneBoard));
    assert(phoneBoard.y >= 0 && phoneBoard.y + phoneBoard.height <= 900, 'the board inside the window: ' + JSON.stringify(phoneBoard));
    assert(pointerY < phoneBoard.y || pointerY > phoneBoard.y + phoneBoard.height,
      'the board clear of the chart being read: ' + pointerY + ' ' + JSON.stringify(phoneBoard));
    const phoneCard = await page.locator('.during-game-card').boundingBox();
    assert(phoneCard.y + phoneCard.height <= phoneBoard.y || phoneCard.y >= phoneBoard.y + phoneBoard.height,
      'the card clear of the board: ' + JSON.stringify([phoneCard, phoneBoard]));
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-390.png' });
    assert.deepEqual(errors, []);
    console.log('live perf charts: details-column placement and toggle, charts and tracks on one axis, the card naming the line under the pointer, board in the player\u2019s style, replay link, configure, averaging, restore, loss, middle width, and phone width passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
