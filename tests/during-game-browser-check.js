'use strict';
// The during the game section after a real game played with real mouse input:
// its place among the result sections, its rows, the hover line, values and
// card, the replay link, configure and averaging, and its return after a
// reload restores the game. Writes storage, so it runs on the test origin;
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
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
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

    const section = page.locator('#result-ranks .result-chart-section-duringGame');
    await section.locator('.during-game-grid svg').first().waitFor({ timeout: 30000 });
    const order = await page.locator('#result-ranks > section').evaluateAll((nodes) =>
      nodes.map((node) => [...node.classList].find((name) => name.startsWith('result-chart-section-')).slice(21)));
    const at = (id) => order.indexOf(id);
    assert(at('duringGame') > at('boardTables') && at('boardTables') >= 0, 'after This board: ' + order);
    assert(at('perfCharts') === -1 || at('duringGame') < at('perfCharts'), 'before your perf: ' + order);
    assert.equal(await section.locator('.result-chart-section-title').textContent(), 'during the game');

    const defaults = await page.evaluate(() => DuringGame.ROWS.filter((row) => row.default).map((row) => row.name));
    const names = () => section.locator('.during-game-name').allTextContents();
    assert.deepEqual(await names(), defaults, 'one row per default row, in catalog order');
    const valueOf = async (name) => {
      const i = (await names()).indexOf(name);
      return section.locator('.during-game-value').nth(i).textContent();
    };
    assert.equal(await valueOf('3BV solved'), '100%');
    assert.equal(await valueOf('squares opened'), '100%');
    assert.equal(await valueOf('flags removed'), '1');
    assert.equal(await valueOf('long gaps'), '1');
    const plotWidths = await section.locator('.during-game-plot svg').evaluateAll((svgs) =>
      svgs.map((svg) => svg.getBoundingClientRect().width));
    assert(plotWidths.every((width) => width > 300), 'plots use the width: ' + plotWidths);
    const overflow = await section.evaluate((el) => el.scrollWidth - el.clientWidth);
    assert.equal(overflow, 0, 'nothing spills past the section');

    // Hovering a moment: the line, every row's value then, and the card.
    const plot = await section.locator('.during-game-plot').nth(1).boundingBox();
    const valuesBefore = await section.locator('.during-game-value').allTextContents();
    const hoverWidth = await section.locator('.during-game-value').first().evaluate((el) => el.getBoundingClientRect().width);
    await page.mouse.move(plot.x + plot.width * 0.6, plot.y + plot.height / 2, { steps: 4 });
    assert.equal(await section.locator('.during-game-line').isVisible(), true);
    assert.match(await section.locator('.during-game-value-head').textContent(), /^at \d/);
    assert.notDeepEqual(await section.locator('.during-game-value').allTextContents(), valuesBefore);
    assert.equal(await section.locator('.during-game-value').first().evaluate((el) => el.getBoundingClientRect().width),
      hoverWidth, 'hover never reflows the value column');
    const card = page.locator('.during-game-card');
    assert.equal(await card.isVisible(), true);
    assert.match(await card.locator('.during-game-card-time').textContent(), /\d s$/);
    const canvas = await card.locator('canvas').boundingBox();
    assert(canvas.width > 50 && canvas.height > 50, 'the board as it was');
    if (shotDir) await page.screenshot({ path: shotDir + '/during-game-hover.png' });

    // Clicking opens the replay at the board of that moment.
    await page.mouse.down();
    await page.mouse.up();
    const replay = await page.evaluate(() => ({ open: replayReview.open, step: replayStep, count: replayDecisionCount() }));
    assert.equal(replay.open, true);
    assert(replay.step > 0 && replay.step < replay.count, 'a mid-game step: ' + JSON.stringify(replay));
    await page.mouse.move(5, 5);
    assert.equal(await card.isVisible(), false);
    if (shotDir) await section.screenshot({ path: shotDir + '/during-game-section.png' });

    // Configure: one row off, back, and the row is gone.
    await section.locator('.result-chart-section-head button', { hasText: 'configure' }).click();
    await section.locator('input[aria-label="mouse speed"]').uncheck();
    await section.locator('.during-game-config button', { hasText: 'back to during the game' }).first().click();
    await section.locator('.during-game-grid svg').first().waitFor();
    assert.deepEqual(await names(), defaults.filter((name) => name !== 'mouse speed'));
    assert.equal(await page.evaluate(() => settings.duringGameRows.mouseSpeed), false);

    // Raw averaging: dots and ticks, no averages drawn.
    await section.locator('select.avg-mode-select').selectOption('raw');
    await page.waitForFunction(() => settings.duringGameAverage === 'raw'
      && document.querySelector('.during-game-grid .during-game-average') === null
      && document.querySelector('.during-game-grid .during-game-dot') !== null);

    // A reload restores the game and its section with the saved choices.
    const endedAt = await page.evaluate(() => renderedResult.record.endedAt);
    await page.evaluate((ended) => updateSettings({ resultView: 'game', replayPosition: { endedAt: ended, step: 0 } }), endedAt);
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    await section.locator('.during-game-grid svg').first().waitFor({ timeout: 30000 });
    assert.deepEqual(await names(), defaults.filter((name) => name !== 'mouse speed'));
    assert.equal(await section.locator('select.avg-mode-select').inputValue(), 'raw');
    assert.equal(await valueOf('flags removed'), '1');

    // A loss shows its own game, not the latest win the rank tables use.
    await page.locator('#face-button').click();
    await press(40);
    now = await board();
    await press(now.cells.findIndex((c) => c.mine));
    assert.equal((await board()).state, 'lost');
    await page.waitForFunction(() => {
      const value = [...document.querySelectorAll('.during-game-name')].findIndex((name) => name.textContent === '3BV solved');
      return value >= 0 && document.querySelectorAll('.during-game-value')[value].textContent !== '100%';
    }, null, { timeout: 30000 });
    const ending = Number(await valueOf('guesses')) + Number(await valueOf('misclicks'));
    assert.equal(ending, 1, 'the click on a mine is a guess or a misclick');

    // Phone width: the plots shrink with the column and nothing spills.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    assert.equal(await section.evaluate((el) => el.scrollWidth - el.clientWidth), 0, 'nothing spills at 390px');
    const narrow = await section.locator('.during-game-plot svg').evaluateAll((svgs) =>
      svgs.map((svg) => svg.getBoundingClientRect().width));
    assert(narrow.every((width) => width > 80 && width < 300), 'plots follow the column: ' + narrow);
    if (shotDir) await section.screenshot({ path: shotDir + '/during-game-390.png' });
    assert.deepEqual(errors, []);
    console.log('during the game: section order, rows and values, hover line and card, replay link, configure, averaging, and restore passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
