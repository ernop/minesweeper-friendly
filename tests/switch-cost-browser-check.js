'use strict';
// Button switch cost on training.html and per-game flag->chord gap on index.html
// in a real browser:
// - Empty DB on training.html keeps #training-switch-cost hidden.
// - Under 30 flagged standard games shows the minimum-games status with not measured.
// - 80 synthetic flagged standard games + no-mark and flag-blocked games: worker
//   excludes no-mark/flag-blocked games, restricts to short-range flag/chord
//   pairs (<= 2 cells), matches Node SwitchCost.fit + perGame + compare,
//   renders pure black neutral text, and never overflows on desktop or mobile.
// - Game page has no legacy .switch-cost-line and shows per-game flag->chord gap
//   in Game Data for flagged wins (and hides it on no-mark wins).
//
// Pages are served from the working tree by request routing under the exact
// test origin; every other request is aborted. Chromium only: Firefox does
// not route the requests a worker makes itself (importScripts).
//
// Usage: node tests/switch-cost-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM [TRAINING_SHOT.png] [GAME_DATA_SHOT.png]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2]);
const SwitchCost = require('../switch-cost.js');
const TrainingCore = require('../training-core.js');
const Solver = require('../solver.js');
const GameRandom = require('../rng.js');
const { switchCostFixtureGames } = require('./switch-cost-fixture.js');

const trainingShotPath = process.argv[4];
const gameDataShotPath = process.argv[5];
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

function storeGames(page, games) {
  return page.evaluate((list) => new Promise((resolve, reject) => {
    const tx = db.transaction([RECORD_STORE, TRACE_STORE], 'readwrite');
    for (const { key, record, trace } of list) {
      tx.objectStore(RECORD_STORE).put(record, [key, record.endedAt]);
      if (trace) {
        tx.objectStore(TRACE_STORE).put({ ...trace, sampleT: Float64Array.from(trace.sampleT),
          sampleX: Float32Array.from(trace.sampleX), sampleY: Float32Array.from(trace.sampleY) });
      }
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  }), games);
}

function signedNumber(value, digits) {
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? '\u2212' : '+') + text;
}
const signedMs = (value) => signedNumber(value, 0) + ' ms';
const signedBoardSeconds = (ms) => signedNumber(ms / 1000, Math.abs(ms) < 9995 ? 2 : 1) + ' s';

async function nodeExpected(games) {
  const flagged = games.filter(({ record }) => record.evaluationPending !== true
    && record.flagsPlaced > 0 && !record.flagsBlocked);
  const candidates = [...flagged].sort((a, b) => b.record.endedAt - a.record.endedAt);
  const gameOf = ({ key, record, trace }) => {
    if (!trace) return null;
    const all = SwitchCost.gameRows(trace, record.outcome, SwitchCost.KEYS[key], deps).rows;
    return { endedAt: record.endedAt, key, rows: SwitchCost.shortRangeRows(all) };
  };
  const windows = await SwitchCost.windows(candidates, gameOf);
  const fitPool = (pool) => {
    const fit = SwitchCost.fit(pool);
    return { ...fit, perGame: SwitchCost.perGame(pool, fit) };
  };
  const latest = fitPool(windows.latest);
  const earlier = fitPool(windows.earlier);
  return { latest, earlier, comparison: SwitchCost.compare(latest, earlier) };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await serveWorkingTree(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

    // 1. Empty training.html: #training-switch-cost stays hidden.
    await page.goto(ORIGIN + '/training.html');
    await page.waitForFunction(() => document.getElementById('training-switch-cost').dataset.status === 'empty');
    assert.equal(await page.locator('#training-switch-cost').isVisible(), false, 'hidden with 0 flagged standard games');

    // 2. Under minimum (< 30 flagged standard games): section shows minimum message.
    const fixture = switchCostFixtureGames();
    await storeGames(page, fixture.slice(0, 12));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('training-switch-cost').dataset.status === 'ready');
    assert.equal(await page.locator('#training-switch-cost').isVisible(), true);
    const fewText = await page.locator('#training-switch-cost').innerText();
    assert.match(fewText, /Needs at least 30 flagged standard games/);
    assert.match(fewText, /extra time per switch\s+not measured\s+not measured/);

    // 3. Full 80 flagged games + 5 no-mark games + 2 flag-blocked games.
    const baseEndedAt = fixture.at(-1).record.endedAt + 100000;
    const excluded = [
      ...Array.from({ length: 5 }, (_, i) => ({
        key: '16x16/40@standard',
        record: { ...fixture[0].record, endedAt: baseEndedAt + i * 1000, flagsPlaced: 0 },
        trace: null,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        key: '9x9/10@standard',
        record: { ...fixture[2].record, endedAt: baseEndedAt + 10000 + i * 1000, flagsPlaced: 4, flagsBlocked: true },
        trace: null,
      })),
    ];
    const allGames = [...fixture, ...excluded];
    await storeGames(page, [...fixture.slice(12), ...excluded]);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('training-switch-cost').dataset.status === 'ready');

    const expected = await nodeExpected(allGames);
    assert.equal(expected.latest.status, 'measured');
    const rows = await page.locator('#training-switch-cost table tr').evaluateAll((trs) =>
      trs.map((tr) => [...tr.cells].map((cell) => cell.textContent)));
    const rowByName = (name) => rows.find((r) => r[0] === name);
    assert.deepEqual(rows[0], ['measure', 'latest 500', 'earlier 500']);
    assert.equal(rowByName('extra time per switch')[1],
      signedMs(expected.latest.msPerSwitch) + ' (95% ' + signedNumber(expected.latest.msPerSwitchLow, 0)
      + ' to ' + signedNumber(expected.latest.msPerSwitchHigh, 0) + ' ms)');
    assert.equal(rowByName('relative change')[1],
      signedNumber(expected.latest.percent, 1) + '% (95% ' + signedNumber(expected.latest.percentLow, 1)
      + ' to ' + signedNumber(expected.latest.percentHigh, 1) + '%)');
    assert.equal(rowByName('median switched gap')[1], Math.round(expected.latest.medianSwitchMs) + ' ms');
    assert.equal(rowByName('short-range pairs that switch')[1], Math.round(expected.latest.switchShare * 100) + '%');
    for (const [name, key] of [['Beginner', '9x9/10@standard'], ['Intermediate', '16x16/40@standard'], ['Expert', '30x16/99@standard']]) {
      assert.equal(rowByName('per ' + name + ' flagged game')[1],
        signedBoardSeconds(expected.latest.perGame[key].meanMs));
    }
    assert.equal(rowByName('measured flagged games')[1],
      expected.latest.games + ' (' + expected.latest.transitions.toLocaleString() + ' pairs)');

    const flaggedCount = allGames.filter(({ record }) => record.flagsPlaced > 0 && !record.flagsBlocked).length;
    const skippedCount = allGames.length - flaggedCount;
    const sectionText = await page.locator('#training-switch-cost').innerText();
    assert.match(sectionText, new RegExp('Counted ' + flaggedCount + ' flagged standard games; skipped ' + skippedCount + ' no-mark or flag-blocked standard games\\.'));
    assert.match(sectionText, /Earlier 500 needs at least 30 older measured games before comparing/);

    // Pure black neutral text inside #training-switch-cost.
    const nonBlack = await page.evaluate(() => {
      const offenders = [];
      for (const el of document.querySelectorAll('#training-switch-cost *')) {
        const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
        if (!ownText || el.getClientRects().length === 0) continue;
        const color = getComputedStyle(el).color;
        if (color !== 'rgb(0, 0, 0)') offenders.push(el.tagName + ' ' + color + ' ' + el.textContent.slice(0, 40));
      }
      return offenders;
    });
    assert.deepEqual(nonBlack, [], 'switch cost text is pure black');
    if (trainingShotPath) await page.locator('#training-switch-cost').screenshot({ path: trainingShotPath });

    // Mobile width check: section handles narrow screens without page-level overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(mobileOverflow, false, 'training page has no page-level horizontal overflow at 390px');
    await page.setViewportSize({ width: 1440, height: 1000 });

    // 4. Game page: legacy .switch-cost-line is gone; flag->chord gap renders in Game Data on flagged wins only.
    await page.goto(ORIGIN + '/index.html');
    await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
    assert.equal(await page.evaluate(() => 'gameDataSwitchCost' in settings), false, 'gameDataSwitchCost retired');
    await page.evaluate(() => {
      settings.shownThings.duringGame = false;
      const now = Date.now();
      const base = {
        outcome: 'win', timeMs: 12000, bv3: 14, boardChangingClicks: 18, noOpClicks: 1,
        misclicks: 0, flagsPlaced: 5, flagsRemoved: 0, unusedCorrectFlags: 0, mousePathPx: 420,
        fastclickGapMs: 150, fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION,
        maxAdjacent: 3, zeroCount: 40, islandCount: 3, largestIsland: 4, playMode: 'standard',
        actionEvaluations: [], states: [],
      };
      const records = [
        { ...base, endedAt: now - 30000, timeMs: 15000, flagChordGapMs: 210 },
        { ...base, endedAt: now - 20000, timeMs: 13500, flagChordGapMs: 185 },
        { ...base, endedAt: now - 10000, timeMs: 12000, flagChordGapMs: 165 },
      ];
      history['9x9/10@standard'] = records;
      renderResult(records[2], records);
    });
    await page.waitForFunction(() => document.querySelector('.game-data-row[data-measurement="flagChordGap"]') !== null);
    assert.equal(await page.locator('.switch-cost-line').count(), 0, 'legacy switch cost line removed from game page');
    const fcRowText = await page.locator('.game-data-row[data-measurement="flagChordGap"]').innerText();
    assert.match(fcRowText, /flag→chord gap/);
    assert.match(fcRowText, /165ms/);
    if (gameDataShotPath) await page.locator('.board-time-profile').screenshot({ path: gameDataShotPath });

    // No-mark win (with 2 no-mark wins so time ranks): flag->chord gap is omitted from Game Data.
    await page.evaluate(() => {
      const records = history['9x9/10@standard'];
      const now = Date.now();
      const noMark1 = { ...records[1], endedAt: now - 5000, flagsPlaced: 0, flagChordGapMs: 185 };
      const noMark2 = { ...records[2], endedAt: now, flagsPlaced: 0, flagChordGapMs: 165 };
      const next = [...records, noMark1, noMark2];
      history['9x9/10@standard'] = next;
      renderResult(noMark2, next);
    });
    await page.waitForFunction(() => document.querySelector('.game-data-row[data-measurement="time"]') !== null
      && document.querySelector('.game-data-row[data-measurement="flagChordGap"]') === null);

    // Configure view has no legacy switch-cost checkbox.
    await page.locator('.game-data-controls button[data-view="config"]').click();
    await page.waitForFunction(() => document.querySelector('.game-data-config') !== null);
    assert.equal(await page.locator('.game-data-config input[data-option="switch-cost"]').count(), 0,
      'legacy switch cost checkbox removed from Game Data configure');

    assert.deepEqual(errors, [], 'no page or console errors');
    console.log('switch-cost-browser-check: training.html Button switch cost + index.html flag->chord gap passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
