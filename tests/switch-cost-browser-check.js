'use strict';
// Game data's switch cost line in a real browser. While the line is off
// nothing is read. On, it shows en dashes and zero game counts with no saved
// games and below the minimum; its session and latest-500 estimates are what
// the worker computes from traces saved in IndexedDB, equal to the same code
// run in Node on the same fixture games; the session value follows the picker
// and the window's start passing games; a finished game joins both; the card
// shows each pool's details; turning the line off stops reading and turning it
// on catches up; and no reply or column width wraps the line.
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
const LINE = '.board-time-profile .switch-cost-line';
const LABEL = LINE + ' .chart-help-label';

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

// The reply to a request made after `markRequest`: a line rebuilt on a
// redraw asks only once game data's own worker reply has drawn it.
function markRequest(page) {
  return page.evaluate(() => { window.markedSwitchCostRequest = switchCostRequest; });
}
async function settledNew(page) {
  await page.waitForFunction(() => switchCostRequest !== window.markedSwitchCostRequest);
  return settled(page);
}

function signed(value, digits) {
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? '\u2212' : '+') + text;
}

function ifMeasured(fit, text) {
  return fit.status === 'measured' ? text(fit) : '\u2013';
}

function lineText(fits) {
  return ['switch cost', 'session ' + ifMeasured(fits.session, (f) => signed(f.percent, 1) + '%'),
    'latest ' + SwitchCost.WINDOW_GAMES + ' ' + ifMeasured(fits.latest, (f) => signed(f.percent, 1) + '%')];
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

function shownLine(page, selector = LINE) {
  return page.evaluate((lineSelector) => {
    const line = document.querySelector(lineSelector);
    return [line.querySelector('.chart-help-label').textContent,
      ...[...line.querySelectorAll('.switch-cost-pool')].map((item) => item.textContent)];
  }, selector);
}

async function openCard(page, label = LABEL) {
  await page.locator(label).focus();
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

// The line's box: one line, inside game data, through replies and widths.
function assertOneLine(box, message) {
  assert.ok(box.height < 2 * box.lineHeight, message + ': ' + box.height + 'px tall, one line is ' + box.lineHeight + 'px');
  assert.ok(box.overflow <= 0, message + ': overflow ' + box.overflow + 'px');
}

function lineBox(page) {
  return page.evaluate((lineSelector) => {
    const line = document.querySelector(lineSelector);
    const profile = line.closest('.board-time-profile');
    return { height: line.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(line).lineHeight) || parseFloat(getComputedStyle(line).fontSize) * 1.3,
      overflow: line.getBoundingClientRect().right - profile.getBoundingClientRect().right };
  }, LINE);
}

// Game data after the newest saved standard win, which is where the line
// shows.
async function showGameData(page) {
  await page.evaluate(async () => {
    const wins = Object.keys(SwitchCost.KEYS).flatMap((key) => (history[key] || []).map((record) => ({ key, record })))
      .filter(({ record }) => record.outcome === 'win').sort((a, b) => b.record.endedAt - a.record.endedAt);
    const { key, record } = wins[0];
    gameState = 'won';
    finalTimeMs = record.timeMs;
    await renderResult(record, history[key]);
  });
  await page.waitForSelector(LINE);
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

    // A new player's line is off: none shows and nothing is read.
    await page.goto(ORIGIN + '/');
    await pageReady(page);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('.switch-cost-line'), switchCostStale, switchCostRequest]),
      [null, true, null], 'off for a new player, and no saved game read');

    // The line on and the session at 4 hours, saved, so later loads start
    // with the line on. With no saved win there is no game data to hold it,
    // so a line mounted on its own reads the empty history.
    await page.evaluate(() => updateSettings({ gameDataSwitchCost: true }));
    await pickSession(page, 'past4h');
    await page.evaluate(() => new Promise((resolve, reject) => {
      const tx = db.transaction(USERDATA_STORE);
      tx.objectStore(USERDATA_STORE).get('settings');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'lone-switch-cost';
      host.appendChild(buildSwitchCostLine());
      resultRanks.before(host);
    });
    let state = await settled(page);
    assertFits(state.fits, await nodeFits([], state.sessionFromMs), 'no saved games');
    assert.deepEqual(await shownLine(page, '#lone-switch-cost .switch-cost-line'), lineText(state.fits), 'no saved games: dashes');
    assert.deepEqual((await openCard(page, '#lone-switch-cost .chart-help-label')).rows, cardText(state.fits),
      'no saved games: the card counts zero games');
    await closeCard(page);

    await storeGames(page, few);
    await page.reload();
    await pageReady(page);
    state = await settled(page);
    const expectedFew = await nodeFits(few, state.sessionFromMs);
    assert.equal(expectedFew.session.status, 'too-few-games');
    assertFits(state.fits, expectedFew, 'under the minimum');
    await showGameData(page);
    assert.deepEqual(await shownLine(page), lineText(state.fits), 'under the minimum: dashes');
    assert.equal(await page.locator(LINE).evaluate((line) => line.nextElementSibling.matches('.game-data-controls')), true,
      'the line sits right above the chart options');

    await storeGames(page, fixture.slice(few.length));
    await page.reload();
    await pageReady(page);
    state = await settled(page);
    const expectedAll = await nodeFits(fixture, state.sessionFromMs);
    assert.equal(expectedAll.latest.status, 'measured');
    assert.equal(expectedAll.session.games, expectedAll.latest.games, 'the past 4 hours hold every fixture game');
    assertFits(state.fits, expectedAll, 'every fixture game');
    await showGameData(page);
    assert.deepEqual(await shownLine(page), lineText(state.fits), 'every fixture game: both estimates');
    assertOneLine(await lineBox(page), 'estimates shown');
    const latest = state.fits.latest;

    // The session value follows the picker; the latest 500 stay as they were.
    await pickSession(page, 'pastHour');
    state = await settled(page);
    assert.equal(state.fits.session.status, 'measured', 'the past hour is measured');
    assert.ok(state.fits.session.games < latest.games, 'the past hour holds fewer games than the latest 500');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'past hour');
    assert.deepEqual(state.fits.latest, latest, 'picking a session leaves the latest 500');
    await page.waitForSelector(LINE);
    assert.deepEqual(await shownLine(page), lineText(state.fits), 'past hour: both estimates');
    const card = await openCard(page);
    assert.equal(card.hidden, false, 'the label opens its card');
    assert.deepEqual(card.rows, cardText(state.fits), 'past hour: the card details');
    assert.equal(card.paragraphs, 2, 'what the estimate is and which games count');
    if (screenshotPath) {
      const shot = await page.evaluate(() => {
        const profile = document.querySelector('.board-time-profile').getBoundingClientRect();
        const tip = document.querySelector('.chart-help-tip').getBoundingClientRect();
        const left = Math.min(profile.left, tip.left) - 8;
        return { x: left, y: profile.top, width: Math.max(profile.right, tip.right) + 8 - left,
          height: Math.max(profile.bottom, tip.bottom) + 8 - profile.top };
      });
      await page.screenshot({ path: screenshotPath, clip: shot });
    }
    await closeCard(page);

    await pickSession(page, 'past10min');
    state = await settled(page);
    assert.equal(state.fits.session.status, 'too-few-games', 'the past 10 minutes are under the minimum');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'past 10 minutes');
    await page.waitForSelector(LINE);
    assert.deepEqual(await shownLine(page), lineText(state.fits), 'past 10 minutes: a dash beside the latest 500');

    // The window's start passing games refreshes the session value when the
    // line is next built: ten minutes on, the past hour has lost games.
    await pickSession(page, 'pastHour');
    const pastHour = await settled(page);
    await markRequest(page);
    await page.evaluate((later) => {
      const now = Date.now.bind(Date);
      Date.now = () => now() + later;
      Date.now.restore = () => { Date.now = now; };
      document.querySelector('.board-time-profile').dispatchEvent(new Event('session-scope-change'));
    }, 10 * MINUTE_MS);
    state = await settledNew(page);
    assert.ok(state.sessionFromMs >= pastHour.sessionFromMs + 10 * MINUTE_MS, 'the request used the later window');
    assert.equal(state.fits.session.status, 'too-few-games', 'ten minutes on, the past hour is under the minimum');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'ten minutes on');
    await page.waitForSelector(LINE);
    assert.deepEqual(await shownLine(page), lineText(state.fits), 'ten minutes on: the session dash');
    await markRequest(page);
    await page.evaluate(() => {
      Date.now.restore();
      document.querySelector('.board-time-profile').dispatchEvent(new Event('session-scope-change'));
    });
    state = await settledNew(page);
    assert.equal(state.fits.session.status, 'measured', 'back to the present');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs), 'back to the present');

    // A reply closes an open card, which would still show the previous one.
    await page.waitForSelector(LINE);
    await openCard(page);
    await page.evaluate(() => refreshSwitchCost());
    await settled(page);
    assert.equal(await page.evaluate(() => document.querySelector('.chart-help-tip').hidden), true, 'a reply closes the card');
    await closeCard(page);

    // A finished standard game with a timed transition joins both pools
    // (the past 4 hours, which no fixture game leaves during the check).
    await pickSession(page, 'past4h');
    state = await settled(page);
    await page.evaluate(() => { settings.justUniverse = false; });
    await page.locator('#face-button').click();
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
    await showGameData(page);
    assert.deepEqual(await shownLine(page), lineText(finished), 'both pools after a finished game');

    // Off: the line goes, and a refresh waits until it shows again.
    const redrawGameData = () => page.evaluate(() =>
      document.querySelector('.board-time-profile').dispatchEvent(new Event('session-scope-change')));
    await page.evaluate(() => updateSettings({ gameDataSwitchCost: false }));
    await redrawGameData();
    await page.waitForFunction(() => document.querySelector('.board-time-profile .game-data-controls') !== null);
    assert.equal(await page.locator(LINE).count(), 0, 'off removes the line');
    assert.deepEqual(await page.evaluate(() => {
      const asked = switchCostRequest;
      switchCostSourcesChanged('9x9/10@standard');
      return [switchCostPending, switchCostStale, switchCostRequest === asked];
    }), [false, true, true], 'nothing is read while the line is off');
    // Read in the same task as the redraw: a fast worker reply can clear
    // switchCostPending before a second evaluate runs.
    await page.evaluate(() => updateSettings({ gameDataSwitchCost: true }));
    await redrawGameData();
    assert.deepEqual(await (await page.waitForFunction(() => {
      const line = document.querySelector('.board-time-profile .switch-cost-line');
      return line !== null && [switchCostStale, line.isConnected];
    })).jsonValue(), [false, true], 'turning the line on again catches up');
    await settled(page);

    // The line stays one line inside game data from the narrowest details
    // column to the widest.
    for (const share of [0.2, 0.46, 0.3]) {
      await page.evaluate((columnShare) => { settings.detailsColumnShare = columnShare; syncBoardLayout(); }, share);
      await page.waitForTimeout(100);
      assertOneLine(await lineBox(page), 'details column at ' + share + ' of the window');
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log('switch-cost browser check: passed (' + latest.games + ' fixture games, '
      + latest.transitions + ' transitions; past hour ' + pastHour.fits.session.games + ' games; '
      + lineText(pastHour.fits).join(' ') + ')');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
