'use strict';
// The session stats' switch-cost row in a real browser. While session stats
// are off it is hidden and reads nothing. Shown, it sits directly under the
// session picker; it shows en dashes and zero game counts with no saved games
// and below the minimum; its session and latest-500 estimates are what the
// worker computes from traces saved in IndexedDB, equal to the same code run
// in Node on the same fixture games; the session column follows the picker
// and the window's start passing games; a finished game joins both columns;
// the card shows each column's details; the row hides with the panel and with
// session stats; and no reply or panel width resizes it or wraps a row.
//
// Pages are served from the working tree by request routing under the exact
// test origin; every other request is aborted. Chromium only: Firefox does
// not route the requests a worker makes itself (importScripts).
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

const screenshotPath = process.argv[4];
const ORIGIN = 'http://127.0.0.1:8099';
const repo = path.join(__dirname, '..');
const deps = { training: TrainingCore, randomPlacement: Solver.randomPlacement, fromSeed: GameRandom.fromSeed,
  rngVersion: GameRandom.VERSION };
const MINUTE_MS = 60000;
// The fixture's newest game ends this long before the check starts. The past
// hour then holds 33 of its games with a timed transition, and at least the
// 30-game minimum for seven minutes; the past 4 hours hold every game for two
// hours.
const NEWEST_AGE_MS = 1.5 * MINUTE_MS;
const ROW = '#metrics-panel .switch-cost-table';
const LABEL = ROW + ' .chart-help-label';

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

// The fixture with its play times moved so its newest game ended `newestEndedAt`.
function recentFixture(newestEndedAt) {
  const games = switchCostFixtureGames();
  const shift = newestEndedAt - games.at(-1).record.endedAt;
  return games.map(({ key, record, trace }) => ({
    key,
    record: { ...record, endedAt: record.endedAt + shift },
    trace: { ...trace, endedAt: trace.endedAt + shift, startedAt: trace.startedAt + shift },
  }));
}

// Both pools as the worker forms them, from the same games in Node.
async function nodeFits(games, sessionFromMs) {
  const candidates = [...games].sort((a, b) => b.record.endedAt - a.record.endedAt)
    .map((game) => ({ endedAt: game.record.endedAt, game }));
  const gameOf = ({ endedAt, game }) => ({ endedAt,
    rows: SwitchCost.gameRows(game.trace, game.record.outcome, SwitchCost.KEYS[game.key], deps).rows });
  return {
    session: SwitchCost.fit(await SwitchCost.since(candidates, sessionFromMs, gameOf)),
    latest: SwitchCost.fit(await SwitchCost.window(candidates, gameOf)),
  };
}

function assertFits(actual, expected, when) {
  for (const pool of ['session', 'latest']) {
    const label = when + ', ' + pool;
    assert.equal(actual[pool].status, expected[pool].status, label + ': status');
    for (const field of ['games', 'transitions', 'columns', 'medianSwitchMs']) {
      assert.equal(actual[pool][field], expected[pool][field], label + ': ' + field);
    }
    for (const field of ['beta', 'se', 'percent', 'percentLow', 'percentHigh', 'msPerSwitch', 'switchShare']) {
      const [value, want] = [actual[pool][field], expected[pool][field]];
      if (want === undefined) assert.equal(value, undefined, label + ': ' + field);
      else assert.ok(Math.abs(value - want) <= 1e-12 * Math.max(1, Math.abs(want)), label + ': ' + field + ', worker ' + value + ', Node ' + want);
    }
  }
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

function pageReady(page) {
  return page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
}

// The latest reply with the session start of the request it answered, read
// together so a refresh starting in between cannot pair them wrongly.
async function settled(page) {
  const handle = await page.waitForFunction(() => switchCostFits !== null && !switchCostPending
    && { fits: switchCostFits, sessionFromMs: switchCostRequest.sessionFromMs });
  return handle.jsonValue();
}

function signed(value, digits) {
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? '\u2212' : '+') + text;
}

function ifMeasured(fit, text) {
  return fit.status === 'measured' ? text(fit) : '\u2013';
}

function rowText(fits) {
  return [['', 'session', 'latest ' + SwitchCost.WINDOW_GAMES],
    ['switch cost', ...[fits.session, fits.latest].map((fit) => ifMeasured(fit, (f) => signed(f.percent, 1) + '%'))]];
}

function cardText(fits) {
  const both = (text) => [fits.session, fits.latest].map(text);
  return [
    ['', 'session', 'latest ' + SwitchCost.WINDOW_GAMES],
    ['95% interval', ...both((fit) => ifMeasured(fit, (f) => signed(f.percentLow, 1) + ' to ' + signed(f.percentHigh, 1) + '%'))],
    ['per switch', ...both((fit) => ifMeasured(fit, (f) => signed(f.msPerSwitch, 0) + 'ms'))],
    ['moves that switch', ...both((fit) => ifMeasured(fit, (f) => Math.round(f.switchShare * 100) + '%'))],
    ['games', ...both((fit) => String(fit.games))],
  ];
}

function shownRow(page) {
  return page.evaluate(() => [...metricsPanelView.switchCost.rows].map((row) => [...row.cells].map((cell) => cell.textContent)));
}

async function openCard(page) {
  await page.locator(LABEL).focus();
  return page.evaluate(() => {
    const tip = document.querySelector('.chart-help-tip');
    const card = tip.querySelector('.switch-cost-card');
    return {
      hidden: tip.hidden,
      rows: [...card.querySelectorAll('tr')].map((row) => [...row.cells].map((cell) => cell.textContent)),
      paragraphs: card.querySelectorAll('p').length,
    };
  });
}

function closeCard(page) {
  return page.evaluate(() => document.activeElement.blur());
}

// The row's box and the room it has: rows and value cells must keep their
// size through replies and panel widths.
function assertSameBox(box, expected, message) {
  assert.deepEqual(box.rows, expected.rows, message + ': row heights');
  // Text runs round to a fraction of a pixel, which moves nothing visibly.
  box.valueWidths.forEach((width, i) => assert.ok(Math.abs(width - expected.valueWidths[i]) < 0.5,
    message + ': value column ' + i + ' is ' + width + 'px, was ' + expected.valueWidths[i] + 'px'));
  assert.ok(box.overflow <= 0, message + ': overflow ' + box.overflow + 'px');
}

function rowBox(page) {
  return page.evaluate(() => {
    const table = metricsPanelView.switchCost;
    const style = getComputedStyle(metricsPanelContent);
    const room = metricsPanelContent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return {
      rows: [...table.rows].map((row) => row.getBoundingClientRect().height),
      valueWidths: [...table.rows[1].cells].slice(1).map((cell) => cell.getBoundingClientRect().width),
      overflow: table.getBoundingClientRect().width - room,
    };
  });
}

function pickSession(page, id) {
  return page.selectOption('#session-definition-select', id);
}

(async () => {
  const fixture = recentFixture(Date.now() - NEWEST_AGE_MS);
  const few = fixture.slice(0, 12);
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await serveWorkingTree(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // A new player's session stats are off: the row is hidden and nothing is read.
    await page.goto(ORIGIN + '/');
    await pageReady(page);
    assert.deepEqual(await page.evaluate(() => [metricsPanelView.switchCost.hidden, switchCostStale, switchCostRequest]),
      [true, true, null], 'hidden with session stats off, and no saved game read');

    // Session stats on, saved, so later loads start with the row shown.
    await page.evaluate(() => { updateSettings({ showSessionStats: true }); refreshMetricsPanel(); });
    await pickSession(page, 'past4h');
    await page.evaluate(() => new Promise((resolve, reject) => {
      const tx = db.transaction(USERDATA_STORE);
      tx.objectStore(USERDATA_STORE).get('settings');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
    const order = await page.evaluate(() => [metricsPanelContent.querySelector('.session-scope-head'),
      metricsPanelView.switchCost, metricsPanelView.session, metricsPanelView.live]
      .map((el) => [...metricsPanelContent.children].indexOf(el)));
    assert.ok(order[1] === order[0] + 1 && order[1] < order[2] && order[2] < order[3],
      'directly under the session picker, above the session charts and the live rows: ' + order.join(','));
    let state = await settled(page);
    assertFits(state.fits, await nodeFits([], state.sessionFromMs), 'no saved games');
    assert.deepEqual(await shownRow(page), rowText(state.fits), 'no saved games: dashes');
    assert.deepEqual((await openCard(page)).rows, cardText(state.fits), 'no saved games: the card counts zero games');
    await closeCard(page);
    const emptyBox = await rowBox(page);

    await storeGames(page, few);
    await page.reload();
    await pageReady(page);
    state = await settled(page);
    const expectedFew = await nodeFits(few, state.sessionFromMs);
    assert.equal(expectedFew.session.status, 'too-few-games');
    assertFits(state.fits, expectedFew, 'under the minimum');
    assert.deepEqual(await shownRow(page), rowText(state.fits), 'under the minimum: dashes');

    await storeGames(page, fixture.slice(few.length));
    await page.reload();
    await pageReady(page);
    state = await settled(page);
    const expectedAll = await nodeFits(fixture, state.sessionFromMs);
    assert.equal(expectedAll.latest.status, 'measured');
    assert.equal(expectedAll.session.games, expectedAll.latest.games, 'the past 4 hours hold every fixture game');
    assertFits(state.fits, expectedAll, 'every fixture game');
    assert.deepEqual(await shownRow(page), rowText(state.fits), 'every fixture game: both estimates');
    assertSameBox(await rowBox(page), emptyBox, 'estimates arriving');
    const latest = state.fits.latest;

    // The session column follows the picker; the latest 500 stay as they were.
    await pickSession(page, 'pastHour');
    state = await settled(page);
    assert.equal(state.fits.session.status, 'measured', 'the past hour is measured');
    assert.ok(state.fits.session.games < latest.games, 'the past hour holds fewer games than the latest 500');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'past hour');
    assert.deepEqual(state.fits.latest, latest, 'picking a session leaves the latest 500');
    assert.deepEqual(await shownRow(page), rowText(state.fits), 'past hour: both estimates');
    const card = await openCard(page);
    assert.equal(card.hidden, false, 'the label opens its card');
    assert.deepEqual(card.rows, cardText(state.fits), 'past hour: the card details');
    assert.equal(card.paragraphs, 2, 'what the estimate is and which games count');
    if (screenshotPath) {
      const shot = await page.evaluate(() => {
        const panel = metricsPanel.getBoundingClientRect();
        const tip = document.querySelector('.chart-help-tip').getBoundingClientRect();
        return { x: panel.left, y: panel.top, width: Math.max(panel.right, tip.right) + 8 - panel.left,
          height: tip.bottom + 8 - panel.top };
      });
      await page.screenshot({ path: screenshotPath, clip: shot });
    }
    await closeCard(page);

    await pickSession(page, 'past10min');
    state = await settled(page);
    assert.equal(state.fits.session.status, 'too-few-games', 'the past 10 minutes are under the minimum');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'past 10 minutes');
    assert.deepEqual(await shownRow(page), rowText(state.fits), 'past 10 minutes: a dash beside the latest 500');

    // The window's start passing games refreshes the session column at the
    // next render: ten minutes on, the past hour has lost games.
    await pickSession(page, 'pastHour');
    const pastHour = await settled(page);
    await page.evaluate((later) => {
      const now = Date.now.bind(Date);
      Date.now = () => now() + later;
      Date.now.restore = () => { Date.now = now; };
      refreshMetricsPanel();
    }, 10 * MINUTE_MS);
    state = await settled(page);
    assert.ok(state.sessionFromMs >= pastHour.sessionFromMs + 10 * MINUTE_MS, 'the request used the later window');
    assert.equal(state.fits.session.status, 'too-few-games', 'ten minutes on, the past hour is under the minimum');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'ten minutes on');
    assert.deepEqual(await shownRow(page), rowText(state.fits), 'ten minutes on: the session dash');
    await page.evaluate(() => { Date.now.restore(); refreshMetricsPanel(); });
    state = await settled(page);
    assert.equal(state.fits.session.status, 'measured', 'back to the present');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'back to the present');

    // A reply closes an open card, which would still show the previous one.
    await openCard(page);
    await page.evaluate(() => refreshSwitchCost());
    await settled(page);
    assert.equal(await page.evaluate(() => document.querySelector('.chart-help-tip').hidden), true, 'a reply closes the card');
    await closeCard(page);

    // A finished standard game with a timed transition joins both columns
    // (the past 4 hours, which no fixture game leaves during the check).
    await pickSession(page, 'past4h');
    state = await settled(page);
    await page.evaluate(() => { settings.justUniverse = false; });
    if (await page.evaluate(() => gameState === 'won' || gameState === 'lost')) await page.locator('#face-button').click();
    await page.locator('#board .cell').first().click();
    await page.waitForTimeout(150);
    const safe = await page.evaluate(() => cells.findIndex((c) => !c.revealed && !c.mine));
    await page.locator('#board .cell').nth(safe).click();
    await page.waitForTimeout(150);
    const mine = await page.evaluate(() => cells.findIndex((c) => c.mine));
    await page.locator('#board .cell').nth(mine).click();
    const finished = await (await page.waitForFunction((before) => !switchCostPending
      && switchCostFits.session.games === before.session.games + 1
      && switchCostFits.latest.games === before.latest.games + 1 && switchCostFits, state.fits)).jsonValue();
    assert.deepEqual(await shownRow(page), rowText(finished), 'both columns after a finished game');

    await page.locator('#metrics-panel .metrics-panel-head .metrics-toggle').click();
    assert.equal(await page.locator(ROW).isHidden(), true, 'collapsing the panel hides the row');
    await page.locator('#metrics-panel .metrics-toggle').first().click();
    assert.equal(await page.locator(ROW).isVisible(), true, 'restoring the panel shows it');

    // Session stats off: hidden, and a refresh waits until the row shows again.
    await page.evaluate(() => { updateSettings({ showSessionStats: false }); refreshMetricsPanel(); });
    assert.equal(await page.locator(ROW).isHidden(), true, 'session stats off hides the row');
    assert.deepEqual(await page.evaluate(() => {
      const asked = switchCostRequest;
      switchCostSourcesChanged('9x9/10@standard');
      return [switchCostPending, switchCostStale, switchCostRequest === asked];
    }), [false, true, true], 'nothing is read while the row is hidden');
    await page.evaluate(() => { updateSettings({ showSessionStats: true }); refreshMetricsPanel(); });
    assert.equal(await page.evaluate(() => switchCostPending), true, 'showing the row again catches up');
    await settled(page);

    // Every row stays one line, inside the panel, from the narrowest panel to the widest.
    const box = await rowBox(page);
    for (const width of [220, 640, 316]) {
      await page.evaluate((w) => { updateSettings({ metricsPanelWidth: w }); refreshMetricsPanel(); }, width);
      assertSameBox(await rowBox(page), box, width + 'px panel');
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log('switch-cost browser check: passed (' + latest.games + ' fixture games, '
      + latest.transitions + ' transitions; past hour ' + pastHour.fits.session.games + ' games; '
      + rowText(pastHour.fits)[1].join(' ') + ')');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
