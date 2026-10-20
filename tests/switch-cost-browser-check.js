'use strict';
// Game data's switch cost line in a real browser. While the line is off
// nothing is read. On, it shows en dashes and zero game counts with no saved
// games and below the minimum; its session, latest-500, and earlier-500
// estimates, their per-board costs, and the shown game's cost are what the
// worker computes from traces saved in IndexedDB, equal to the same code run
// in Node on the same fixture games; the session value follows the picker
// and the window's start passing games; a finished game joins the session
// and the latest 500; the card shows each pool's details; turning the line
// off stops reading and turning it on catches up; and the line wraps only
// between items, never overflowing game data, at any column width.
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

const POOLS = ['session', 'latest', 'earlier'];

// Every pool as the worker forms it, and the shown game's cost, from the
// same games in Node.
async function nodeFits(games, sessionFromMs, shownEndedAt = null) {
  const candidates = [...games].sort((a, b) => b.record.endedAt - a.record.endedAt)
    .map((game) => ({ endedAt: game.record.endedAt, game }));
  const gameOf = ({ endedAt, game }) => ({ endedAt, key: game.key,
    rows: SwitchCost.gameRows(game.trace, game.record.outcome, SwitchCost.KEYS[game.key], deps).rows });
  const withPerGame = (pool) => {
    const fit = SwitchCost.fit(pool);
    return { ...fit, perGame: SwitchCost.perGame(pool, fit) };
  };
  const windows = await SwitchCost.windows(candidates, gameOf);
  const latest = withPerGame(windows.latest);
  const shownCandidate = candidates.find((candidate) => candidate.endedAt === shownEndedAt);
  const shownGame = shownCandidate === undefined || gameOf(shownCandidate).rows.length === 0 ? null : gameOf(shownCandidate);
  return {
    session: withPerGame(await SwitchCost.since(candidates, sessionFromMs, gameOf)),
    latest, earlier: withPerGame(windows.earlier),
    shown: shownGame === null ? null : { endedAt: shownGame.endedAt, ...SwitchCost.game(shownGame.rows, latest) },
  };
}

function assertClose(value, want, label) {
  if (want === undefined) assert.equal(value, undefined, label);
  else assert.ok(Math.abs(value - want) <= 1e-12 * Math.max(1, Math.abs(want)), label + ', worker ' + value + ', Node ' + want);
}

function assertFits(actual, expected, when) {
  for (const pool of POOLS) {
    const label = when + ', ' + pool;
    assert.equal(actual[pool].status, expected[pool].status, label + ': status');
    for (const field of ['games', 'transitions', 'columns', 'medianSwitchMs']) {
      assert.equal(actual[pool][field], expected[pool][field], label + ': ' + field);
    }
    for (const field of ['beta', 'se', 'percent', 'percentLow', 'percentHigh', 'msPerSwitch', 'switchShare']) {
      assertClose(actual[pool][field], expected[pool][field], label + ': ' + field);
    }
    if (expected[pool].perGame === null) assert.equal(actual[pool].perGame, null, label + ': no per-game cost');
    else {
      assert.deepEqual(Object.keys(actual[pool].perGame).sort(), Object.keys(expected[pool].perGame).sort(), label + ': boards');
      for (const [key, board] of Object.entries(expected[pool].perGame)) {
        assert.equal(actual[pool].perGame[key].games, board.games, label + ': ' + key + ' games');
        assertClose(actual[pool].perGame[key].meanMs, board.meanMs, label + ': ' + key + ' cost per game');
      }
    }
  }
  if (expected.shown === null) assert.equal(actual.shown, null, when + ': no shown game');
  else {
    for (const field of ['endedAt', 'transitions', 'switches']) {
      assert.equal(actual.shown[field], expected.shown[field], when + ': shown ' + field);
    }
    assertClose(actual.shown.costMs, expected.shown.costMs, when + ': shown cost');
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

// The latest reply with the session start and shown game of the request it
// answered, read together so a refresh starting in between cannot pair them
// wrongly. It waits for the reply about the game the line now sits under.
async function settled(page) {
  const handle = await page.waitForFunction(() => switchCostFits !== null && !switchCostPending
    && switchCostRequest.shownEndedAt === switchCostShownEndedAt
    && { fits: switchCostFits, sessionFromMs: switchCostRequest.sessionFromMs, shownEndedAt: switchCostRequest.shownEndedAt });
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

function seconds(ms) {
  return signed(ms / 1000, Math.abs(ms) < 9995 ? 2 : 1) + 's';
}

const POOL_LABELS = ['session', 'latest ' + SwitchCost.WINDOW_GAMES, 'earlier ' + SwitchCost.WINDOW_GAMES];
const BOARDS = [['Beginner', '9x9/10@standard'], ['Intermediate', '16x16/40@standard'], ['Expert', '30x16/99@standard']];

function lineText(fits, shownEndedAt) {
  const shown = fits.shown !== null && fits.shown.endedAt === shownEndedAt ? fits.shown : null;
  return ['switch cost', 'this game ' + (shown !== null && shown.costMs !== undefined ? seconds(shown.costMs) : '\u2013'),
    ...POOLS.map((pool, i) => POOL_LABELS[i] + ' ' + ifMeasured(fits[pool], (f) => signed(f.percent, 1) + '%'))];
}

function cardText(fits) {
  const all = (text) => POOLS.map((pool) => text(fits[pool]));
  return [
    ['', ...POOL_LABELS],
    ['95% interval', ...all((fit) => ifMeasured(fit, (f) => signed(f.percentLow, 1) + ' to ' + signed(f.percentHigh, 1) + '%'))],
    ['per switch', ...all((fit) => ifMeasured(fit, (f) => signed(f.msPerSwitch, 0) + 'ms'))],
    ...BOARDS.map(([name, key]) => ['per ' + name + ' game',
      ...all((fit) => (fit.perGame !== null && fit.perGame[key] !== undefined ? seconds(fit.perGame[key].meanMs) : '\u2013'))]),
    ['moves that switch', ...all((fit) => ifMeasured(fit, (f) => Math.round(f.switchShare * 100) + '%'))],
    ['games', ...all((fit) => String(fit.games))],
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

// The line's box inside game data: every item on one line of its own, no
// overflow, and with `whole` the line itself one line.
function assertLineFits(box, message, whole = false) {
  for (const height of box.itemHeights) {
    assert.ok(height < 2 * box.lineHeight, message + ': an item ' + height + 'px tall, one line is ' + box.lineHeight + 'px');
  }
  if (whole) assert.ok(box.height < 2 * box.lineHeight, message + ': ' + box.height + 'px tall, one line is ' + box.lineHeight + 'px');
  assert.ok(box.overflow <= 0, message + ': overflow ' + box.overflow + 'px');
}

function lineBox(page) {
  return page.evaluate((lineSelector) => {
    const line = document.querySelector(lineSelector);
    const profile = line.closest('.board-time-profile');
    return { height: line.getBoundingClientRect().height,
      itemHeights: [...line.querySelectorAll('.switch-cost-pool')].map((item) => item.getBoundingClientRect().height),
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
      host.appendChild(buildSwitchCostLine({ endedAt: null }));
      resultRanks.before(host);
    });
    let state = await settled(page);
    assertFits(state.fits, await nodeFits([], state.sessionFromMs), 'no saved games');
    assert.deepEqual(await shownLine(page, '#lone-switch-cost .switch-cost-line'), lineText(state.fits, null), 'no saved games: dashes');
    assert.deepEqual((await openCard(page, '#lone-switch-cost .chart-help-label')).rows, cardText(state.fits),
      'no saved games: the card counts zero games');
    await closeCard(page);

    await storeGames(page, few);
    await page.reload();
    await pageReady(page);
    await showGameData(page);
    state = await settled(page);
    const expectedFew = await nodeFits(few, state.sessionFromMs, state.shownEndedAt);
    assert.equal(expectedFew.session.status, 'too-few-games');
    assert.notEqual(expectedFew.shown, null, 'the shown win is a counted game');
    assertFits(state.fits, expectedFew, 'under the minimum');
    assert.deepEqual(await shownLine(page), lineText(state.fits, state.shownEndedAt), 'under the minimum: dashes');
    assert.equal(await page.locator(LINE).evaluate((line) => line.nextElementSibling.matches('.game-data-controls')), true,
      'the line sits right above the chart options');

    await storeGames(page, fixture.slice(few.length));
    await page.reload();
    await pageReady(page);
    await showGameData(page);
    state = await settled(page);
    const expectedAll = await nodeFits(fixture, state.sessionFromMs, state.shownEndedAt);
    assert.equal(expectedAll.latest.status, 'measured');
    assert.equal(expectedAll.session.games, expectedAll.latest.games, 'the past 4 hours hold every fixture game');
    assert.ok(expectedAll.shown.costMs > 0, 'the shown win has a cost');
    assertFits(state.fits, expectedAll, 'every fixture game');
    assert.deepEqual(await shownLine(page), lineText(state.fits, state.shownEndedAt), 'every fixture game: the estimates and this game');
    assertLineFits(await lineBox(page), 'estimates shown');
    const latest = state.fits.latest;

    // The session value follows the picker; the latest 500 stay as they were.
    await pickSession(page, 'pastHour');
    state = await settled(page);
    assert.equal(state.fits.session.status, 'measured', 'the past hour is measured');
    assert.ok(state.fits.session.games < latest.games, 'the past hour holds fewer games than the latest 500');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs, state.shownEndedAt), 'past hour');
    assert.deepEqual(state.fits.latest, latest, 'picking a session leaves the latest 500');
    await page.waitForSelector(LINE);
    assert.deepEqual(await shownLine(page), lineText(state.fits, state.shownEndedAt), 'past hour: both estimates');
    const card = await openCard(page);
    assert.equal(card.hidden, false, 'the label opens its card');
    assert.deepEqual(card.rows, cardText(state.fits), 'past hour: the card details');
    assert.equal(card.paragraphs, 4, 'this game, what the estimate is, how to read the earlier 500, and which games count');
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
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs, state.shownEndedAt), 'past 10 minutes');
    await page.waitForSelector(LINE);
    assert.deepEqual(await shownLine(page), lineText(state.fits, state.shownEndedAt), 'past 10 minutes: a dash beside the latest 500');

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
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs, state.shownEndedAt), 'ten minutes on');
    await page.waitForSelector(LINE);
    assert.deepEqual(await shownLine(page), lineText(state.fits, state.shownEndedAt), 'ten minutes on: the session dash');
    await markRequest(page);
    await page.evaluate(() => {
      Date.now.restore();
      document.querySelector('.board-time-profile').dispatchEvent(new Event('session-scope-change'));
    });
    state = await settledNew(page);
    assert.equal(state.fits.session.status, 'measured', 'back to the present');
    assertFits(state.fits, await nodeFits(fixture, state.sessionFromMs, state.shownEndedAt), 'back to the present');

    // A reply closes an open card, which would still show the previous one.
    await page.waitForSelector(LINE);
    await openCard(page);
    await page.evaluate(() => refreshSwitchCost());
    await settled(page);
    assert.equal(await page.evaluate(() => document.querySelector('.chart-help-tip').hidden), true, 'a reply closes the card');
    await closeCard(page);

    // A finished standard game with a timed transition joins the session
    // and the latest 500 (the past 4 hours, which no fixture game leaves
    // during the check).
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
    const afterFinish = await settled(page);
    assert.deepEqual(await shownLine(page), lineText(afterFinish.fits, afterFinish.shownEndedAt), 'the pools after a finished game');
    assert.equal(afterFinish.fits.latest.games, finished.latest.games, 'the shown win changed nothing pooled');

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

    // Inside game data from the narrowest details column to the widest, the
    // line wraps only between items; the widest holds it on one line.
    for (const share of [0.2, 0.46, 0.3]) {
      await page.evaluate((columnShare) => { settings.detailsColumnShare = columnShare; syncBoardLayout(); }, share);
      await page.waitForTimeout(100);
      assertLineFits(await lineBox(page), 'details column at ' + share + ' of the window', share === 0.46);
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log('switch-cost browser check: passed (' + latest.games + ' fixture games, '
      + latest.transitions + ' transitions; past hour ' + pastHour.fits.session.games + ' games; '
      + lineText(pastHour.fits, pastHour.shownEndedAt).join(' ') + ')');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
