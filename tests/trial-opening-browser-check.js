'use strict';
// A trial game given an opening, played with real mouse input to a win: its
// record keeps the setting it was dealt with and the 3BV the opening solved,
// the "this game" table's 3BV/s divides only the 3BV the player solved, the
// trial session's attempt carries the same, and a record saved without it
// gets it from its trace when its result is restored. Writes storage, so it
// runs on the test origin; pages are served from the working tree by request
// routing under that origin and every other request is aborted, so no server
// is needed.
//
// Usage: node tests/trial-opening-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2]);
const origin = 'http://127.0.0.1:8099/';
const repo = path.join(__dirname, '..');

// The 3BV a set of open squares has solved: each zero region holding an
// open zero, and each open number touching no zero.
function solvedBv3(width, height, mineAt, open) {
  const neighbors = (cell) => {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < height) out.push(ny * width + nx);
      }
    }
    return out;
  };
  const zero = (cell) => !mineAt[cell] && neighbors(cell).every((n) => !mineAt[n]);
  const seen = new Set();
  let solved = 0;
  for (const cell of open) {
    if (zero(cell)) {
      if (seen.has(cell)) continue;
      solved++;
      const stack = [cell];
      seen.add(cell);
      while (stack.length > 0) {
        for (const n of neighbors(stack.pop())) {
          if (zero(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
    } else if (neighbors(cell).every((n) => !zero(n))) solved++;
  }
  return solved;
}

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
    await page.evaluate(() => updateSettings({ trialGiveOpening: true, justUniverse: false }));
    await page.selectOption('#play-mode-select', 'standard');
    await page.locator('#custom-width').fill('9');
    await page.locator('#custom-height').fill('9');
    await page.locator('#custom-mines').fill('10');
    await page.locator('#custom-form button').click();
    await page.selectOption('#play-mode-select', 'test-trial');
    assert.deepEqual(await page.evaluate(() => [settings.playMode, config]),
      ['test-trial', { width: 9, height: 9, mines: 10 }]);
    // A trial's first click is a safe square, not always a zero: an opening
    // on a number beside a zero region solves no 3BV, and every orientation
    // of the board repeats it. Such a trial ends and another begins, as does
    // one whose opening opened every safe square and won at once.
    let dealt;
    let givenBv3 = 0;
    for (let session = 0; session < 12; session++) {
      await page.waitForFunction(() => !document.getElementById('trial-start-btn').disabled
        && !document.getElementById('trial-start-btn').hidden);
      await page.locator('#trial-start-btn').click();
      await page.waitForFunction(() => trialPresentation !== null && gameState !== 'ready');
      dealt = await page.evaluate(() => ({ state: gameState, givenOpening: trialPresentation.givenOpening,
        openedAtStart: trialPresentation.openedAtStart, mines: cells.map((cell) => cell.mine),
        openNow: cells.flatMap((cell, index) => (cell.revealed ? [index] : [])),
        recorded: history[modeKey()]?.length ?? 0 }));
      givenBv3 = solvedBv3(9, 9, dealt.mines, dealt.openedAtStart);
      if (dealt.state === 'playing' && givenBv3 >= 1) break;
      if (await page.evaluate(() => trialIsActive())) {
        await page.locator('#trial-progress button', { hasText: 'end trial' }).click();
      }
    }
    assert.equal(dealt.state, 'playing', 'the given opening started the game');
    assert.equal(dealt.givenOpening, true);
    assert.deepEqual(dealt.openedAtStart, dealt.openNow, 'the squares the opening left open');
    assert(givenBv3 >= 1, 'an opening that solved some of the board');

    const centers = await page.evaluate(() => [...document.querySelectorAll('#board .cell')].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }));
    for (let guard = 0; guard < 81; guard++) {
      const now = await page.evaluate(() => ({ state: gameState,
        next: cells.findIndex((cell) => !cell.mine && !cell.revealed && !cell.flagged) }));
      if (now.state !== 'playing') break;
      await page.mouse.move(centers[now.next][0], centers[now.next][1], { steps: 6 });
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(60);
    }
    await page.waitForFunction((recorded) => history[modeKey()]?.length === recorded + 1, dealt.recorded);
    const saved = await page.evaluate(async () => {
      const record = history[modeKey()].at(-1);
      const stored = await new Promise((resolve, reject) => {
        const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).get(record.endedAt);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const labels = [...document.querySelectorAll('.game-stats-grid .stat-label')].map((cell) => cell.textContent);
      const values = [...document.querySelectorAll('.game-stats-grid .stat-value')].map((cell) => cell.textContent);
      const bvPerSecond = GameData.metrics.find((m) => m.id === 'bvPerSecond');
      return { outcome: record.outcome, givenOpening: record.givenOpening, bv3: record.bv3, timeMs: record.timeMs,
        givenOpeningBv3: record.givenOpeningBv3, endedAt: record.endedAt,
        fromTrace: DuringGame.bv3SolvedAtStart(9, 9, stored.finalBoard.cells.map((cell) => cell.mine), stored.events),
        attempt: trialSession.results.at(-1).givenOpeningBv3,
        table: values[labels.indexOf('3BV/s')],
        formatted: bvPerSecond.format((record.bv3 - record.givenOpeningBv3) / (record.timeMs / 1000)) };
    });
    assert.equal(saved.outcome, 'win', 'the scripted game is a win');
    assert.equal(saved.givenOpening, true, 'the record keeps the setting it was dealt with');
    assert.equal(saved.givenOpeningBv3, givenBv3, 'the record holds the 3BV the opening solved');
    assert.equal(saved.fromTrace, givenBv3, 'the trace gives the same');
    assert.equal(saved.attempt, givenBv3, 'the trial session\u2019s attempt carries it');
    assert.equal(saved.table, saved.formatted, 'the table\u2019s 3BV/s divides only the 3BV the player solved');

    // A record saved before the field existed gets it from its trace when its
    // result is restored. Restoring waits for the trial to end.
    await page.evaluate(() => new Promise((resolve, reject) => {
      const record = history[modeKey()].at(-1);
      delete record.givenOpeningBv3;
      const tx = db.transaction(RECORD_STORE, 'readwrite');
      tx.objectStore(RECORD_STORE).put(record, [modeKey(), record.endedAt]);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
    await page.locator('#trial-progress button', { hasText: 'end trial' }).click();
    await page.evaluate((endedAt) => updateSettings({ resultView: 'game', replayPosition: { endedAt, step: 0 } }), saved.endedAt);
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    await page.waitForFunction(() => renderedResult !== null && renderedResult.record.givenOpeningBv3 !== undefined,
      null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => new Promise((resolve, reject) => {
      const request = db.transaction(RECORD_STORE).objectStore(RECORD_STORE).get([modeKey(), renderedResult.record.endedAt]);
      request.onsuccess = () => resolve(request.result.givenOpeningBv3);
      request.onerror = () => reject(request.error);
    })), givenBv3, 'measured again from the trace on restore, and saved');
    assert.deepEqual(errors, []);
    console.log('trial with a given opening: the setting and the opening\u2019s 3BV in the record and the session, the table\u2019s 3BV/s over the 3BV solved, and the restore measuring an older record passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
