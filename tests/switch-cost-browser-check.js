'use strict';
// The stats panel's switching section in a real browser: its place between
// the session charts and the live rows, the en dashes and game count below
// the minimum, the estimate the worker computes from traces saved in
// IndexedDB (equal to the same code run in Node on the same fixture games),
// the rendered values, a refresh after a finished game, and collapsing.
//
// Pages are served from the working tree by request routing under the exact
// test origin; every other request is aborted.
//
// Usage: node tests/switch-cost-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM [SCREENSHOT.png]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2]);
const SwitchCost = require('../switch-cost.js');
const TrainingCore = require('../training-core.js');
const Solver = require('../solver.js');
const GameRandom = require('../rng.js');
const { switchCostFixtureGames } = require('./switch-cost-fixture.js');

const ORIGIN = 'http://127.0.0.1:8099';
const repo = path.join(__dirname, '..');
const deps = { training: TrainingCore, randomPlacement: Solver.randomPlacement, fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION };

async function serveWorkingTree(context) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    const file = path.join(repo, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(repo + path.sep) || !fs.existsSync(file)) {
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({ path: file });
  });
}

async function nodeFit(games) {
  const newestFirst = [...games].sort((a, b) => b.record.endedAt - a.record.endedAt);
  const window = await SwitchCost.window(newestFirst, (game) => ({ endedAt: game.record.endedAt,
    rows: SwitchCost.gameRows(game.trace, game.record.outcome, SwitchCost.KEYS[game.key], deps).rows }));
  return SwitchCost.fit(window);
}

function storeGames(page, games) {
  return page.evaluate((list) => new Promise((resolve, reject) => {
    const tx = db.transaction([RECORD_STORE, TRACE_STORE], 'readwrite');
    for (const { key, record, trace } of list) {
      tx.objectStore(RECORD_STORE).put(record, [key, record.endedAt]);
      tx.objectStore(TRACE_STORE).put({ ...trace, sampleT: Float64Array.from(trace.sampleT),
        sampleX: Float32Array.from(trace.sampleX), sampleY: Float32Array.from(trace.sampleY) });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  }), games);
}

async function loadGame(page) {
  await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
  await page.waitForFunction(() => switchCostLatest !== null && !switchCostPending);
}

function shown(page) {
  return page.evaluate(() => [...document.querySelectorAll('#metrics-panel .switch-cost-row')].map((row) => [
    row.querySelector('.metric-label').textContent, row.querySelector('.metric-value').textContent]));
}

function expectedText(page) {
  return page.evaluate(() => SWITCH_COST_GROUP.displays.map((display) => {
    const value = display.of(switchCostLatest);
    return [display.label, value === undefined ? '\u2013' : display.fmt(value)];
  }));
}

(async () => {
  const fixture = switchCostFixtureGames();
  const few = fixture.slice(0, 12);
  const expectedFew = await nodeFit(few);
  const expectedAll = await nodeFit(fixture);
  assert.equal(expectedFew.status, 'too-few-games');
  assert.equal(expectedAll.status, 'measured');

  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await serveWorkingTree(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(ORIGIN + '/');
    await loadGame(page);
    const order = await page.evaluate(() => {
      const view = metricsPanelView;
      const children = [...metricsPanelContent.children];
      return [children.indexOf(view.session), children.indexOf(view.switching), children.indexOf(view.live)];
    });
    assert.ok(order[0] < order[1] && order[1] < order[2], 'switching sits between the session charts and the live rows');
    assert.deepEqual(await shown(page), [['switch cost', '\u2013'], ['per switch', '\u2013'],
      ['moves that switch', '\u2013'], ['games', '0']], 'no saved games: dashes and a zero count');
    const headHeight = await page.locator('#metrics-panel .switch-cost-section').evaluate((el) => el.offsetHeight);

    await storeGames(page, few);
    await page.reload();
    await loadGame(page);
    assert.equal(await page.evaluate(() => switchCostLatest.status), 'too-few-games');
    assert.deepEqual(await shown(page), [['switch cost', '\u2013'], ['per switch', '\u2013'],
      ['moves that switch', '\u2013'], ['games', String(expectedFew.games)]], 'under the minimum: dashes and the count');

    await storeGames(page, fixture.slice(12));
    await page.reload();
    await loadGame(page);
    const fit = await page.evaluate(() => switchCostLatest);
    assert.equal(fit.status, 'measured');
    for (const field of ['games', 'transitions', 'columns', 'medianSwitchMs']) assert.equal(fit[field], expectedAll[field], field);
    for (const field of ['beta', 'se', 'percent', 'percentLow', 'percentHigh', 'msPerSwitch', 'switchShare']) {
      assert.ok(Math.abs(fit[field] - expectedAll[field]) <= 1e-12 * Math.max(1, Math.abs(expectedAll[field])),
        field + ': worker ' + fit[field] + ', Node ' + expectedAll[field]);
    }
    const rendered = await shown(page);
    assert.deepEqual(rendered, await expectedText(page), 'rows show the worker fit');
    assert.match(rendered[0][1], /^\+\d+\.\d% \(\+\d+\.\d to \+\d+\.\d\)$/);
    assert.equal(await page.locator('#metrics-panel .switch-cost-section').evaluate((el) => el.offsetHeight), headHeight,
      'values arriving never change the section height');
    const rowHeights = await page.locator('#metrics-panel .switch-cost-row').evaluateAll((rows) => rows.map((r) => r.offsetHeight));
    assert.ok(rowHeights.every((h) => h === rowHeights[0]), 'every row is one line: ' + rowHeights.join(','));
    if (process.argv[4]) await page.locator('#metrics-panel').screenshot({ path: process.argv[4] });

    // A finished standard game with a timed transition refreshes the estimate.
    await page.evaluate(() => { settings.justUniverse = false; });
    if (await page.evaluate(() => gameState === 'won' || gameState === 'lost')) await page.locator('#face-button').click();
    await page.locator('#board .cell').first().click();
    await page.waitForTimeout(150);
    const safe = await page.evaluate(() => cells.findIndex((c) => !c.revealed && !c.mine));
    await page.locator('#board .cell').nth(safe).click();
    await page.waitForTimeout(150);
    const mine = await page.evaluate(() => cells.findIndex((c) => c.mine));
    await page.locator('#board .cell').nth(mine).click();
    await page.waitForFunction((games) => switchCostLatest.games === games + 1 && !switchCostPending, fit.games);
    assert.deepEqual(await shown(page), await expectedText(page), 'refreshed rows');

    await page.locator('#metrics-panel .metrics-panel-head .metrics-toggle').click();
    assert.equal(await page.locator('#metrics-panel .switch-cost-section').isHidden(), true, 'collapsed panel hides it');
    await page.locator('#metrics-panel .metrics-toggle').first().click();
    assert.equal(await page.locator('#metrics-panel .switch-cost-section').isVisible(), true, 'restored with the panel');
    assert.deepEqual(errors, [], 'no page errors');
    console.log('switch-cost browser check: passed (' + fit.games + ' fixture games, '
      + fit.transitions + ' transitions, ' + rendered.map((r) => r.join(' ')).join(' | ') + ')');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
