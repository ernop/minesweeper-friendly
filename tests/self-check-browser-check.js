'use strict';
// Self-check page in a real browser: the version-5 upgrade from version 3 and
// from both version-4 builds keeps history and self-checks, check-in answers,
// frame-timed stimuli with event-timed responses, early presses, a stop, one
// complete 10-counter test, storage, history, and backup round trip.
//
// The page is served by request routing under the exact test origin
// http://127.0.0.1:8099/, straight from this working tree; every other
// request is aborted, so no server is needed and nothing leaves the browser.
//
// Usage: node tests/self-check-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2]);

const ORIGIN = 'http://127.0.0.1:8099';
const repo = path.join(__dirname, '..');
async function serveWorkingTree(context) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/__seed.html') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' });
    }
    const file = path.join(repo, decodeURIComponent(url.pathname));
    if (!file.startsWith(repo + path.sep) || !fs.existsSync(file)) {
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({ path: file });
  });
}

// The three databases that exist in the wild before version 5: version 3,
// and the two different version-4 builds of 2026-09-26 (the local player
// origin's added selfChecks; the public one moved history into records).
const SEEDED_RECORD = { endedAt: 1, outcome: 'win' };
const SEEDED_CHECK = {
  startedAt: 5, endedAt: 6, timeZone: 'UTC', utcOffsetMin: 0, occasion: 'routine',
  sleepiness: { scale: 'kss-9-v1', rating: 3 },
  environment: { devicePixelRatio: 1, screenWidth: 800, screenHeight: 600,
    viewportWidth: 800, viewportHeight: 600, userAgent: 'seed' },
  vigilance: { protocol: 'alertness-10-v1', status: 'interrupted', interruption: { type: 'escape', t: 0 },
    timeOriginMs: 1, startT: 0, endT: 0, trials: [], earlyPresses: [], frameCount: 0 },
};

async function seedDatabase(page, layout) {
  await page.goto(ORIGIN + '/__seed.html');
  await page.evaluate(({ layout, record, check }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('minesweeper-friendly', layout === 'version-3' ? 3 : 4);
    request.onupgradeneeded = () => {
      const db = request.result;
      const traces = db.createObjectStore('traces', { keyPath: 'endedAt' });
      traces.createIndex('boardsByModeAndSize', ['mode', 'finalBoard.cells.length']);
      const userdata = db.createObjectStore('userdata');
      if (layout === 'public-version-4') {
        db.createObjectStore('records').put(record, ['9x9/10@standard', record.endedAt]);
      } else {
        userdata.put({ '9x9/10@standard': [record] }, 'history');
      }
      if (layout === 'local-version-4') {
        db.createObjectStore('selfChecks', { keyPath: 'startedAt' }).put(check);
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }), { layout, record: SEEDED_RECORD, check: SEEDED_CHECK });
}

function databaseState(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const tx = db.transaction(['userdata', 'records', 'selfChecks']);
    const history = tx.objectStore('userdata').get('history');
    const recordKeys = tx.objectStore('records').getAllKeys();
    const records = tx.objectStore('records').getAll();
    const checks = tx.objectStore('selfChecks').getAll();
    tx.oncomplete = () => resolve({ version: db.version, stores: [...db.objectStoreNames].sort(),
      userdataHistory: history.result, recordKeys: recordKeys.result, records: records.result,
      checks: checks.result });
    tx.onerror = () => reject(tx.error);
  }));
}

async function upgradedFrom(browser, layout) {
  const context = await browser.newContext();
  await serveWorkingTree(context);
  const page = await context.newPage();
  await seedDatabase(page, layout);
  await page.goto(ORIGIN + '/self-check.html');
  await page.locator('#self-check-start').waitFor();
  const state = await databaseState(page);
  await context.close();
  return state;
}

function storedChecks(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = db.transaction(SELF_CHECK_STORE).objectStore(SELF_CHECK_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

async function startCheck(page, occasion, rating) {
  await page.locator(occasion === 'routine' ? '#self-check-start-routine' : '#self-check-start-extra').click();
  await page.locator(`.sleepiness-choice[data-rating="${rating}"]`).click();
}

async function beginTest(page) {
  await page.locator('#vigilance-begin').click();
  await page.waitForFunction(() => vigilanceRun !== null);
}

async function boxCenter(page) {
  const box = await page.locator('#vigilance-box').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Waits for a stimulus, then answers it after a human-like pause.
async function answerStimulus(page, at) {
  await page.waitForFunction(() => vigilanceRun !== null && vigilanceRun.trial !== null,
    null, { timeout: 10000 });
  await page.waitForTimeout(220);
  await page.mouse.click(at.x, at.y);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true,
    args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    await serveWorkingTree(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Every pre-version-5 database ends with the same four stores: history in
    // records, self-checks kept, nothing lost or duplicated.
    for (const layout of ['version-3', 'local-version-4', 'public-version-4']) {
      const state = await upgradedFrom(browser, layout);
      assert.equal(state.version, 5, layout);
      assert.deepEqual(state.stores, ['records', 'selfChecks', 'traces', 'userdata'], layout);
      assert.equal(state.userdataHistory, undefined, layout + ': history left userdata');
      assert.deepEqual(state.recordKeys, [['9x9/10@standard', 1]], layout);
      assert.deepEqual(state.records, [SEEDED_RECORD], layout);
      assert.deepEqual(state.checks, layout === 'local-version-4' ? [SEEDED_CHECK] : [], layout);
    }

    await page.goto(ORIGIN + '/self-check.html');
    await page.locator('#self-check-start').waitFor();
    assert.equal(await page.locator('#self-check-history').isHidden(), true, 'no history card before any check');

    // Check-in: the rating is required, sleep is range-checked, both optional fields store.
    await page.locator('#self-check-start-routine').click();
    assert.equal(await page.locator('#self-check-checkin-continue').isDisabled(), true);
    await page.locator('.sleepiness-choice[data-rating="4"]').click();
    await page.locator('#self-check-sleep-hours').fill('30');
    await page.locator('#self-check-checkin-continue').click();
    assert.equal(await page.locator('#self-check-checkin-error').isVisible(), true);
    await page.locator('#self-check-sleep-hours').fill('7.5');
    await page.locator('#self-check-note').fill('browser check');
    await page.locator('#self-check-checkin-continue').click();
    await beginTest(page);
    assert.equal(await page.locator('#self-check-header').isHidden(), true, 'the test shows only its box');

    const at = await boxCenter(page);
    for (let i = 0; i < 3; i++) await answerStimulus(page, at);
    // A press during the feedback that follows a response is early.
    await page.mouse.click(at.x, at.y);
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await page.locator('#self-check-result-heading', { hasText: 'Test stopped: window lost focus' }).waitFor();

    let checks = await storedChecks(page);
    assert.equal(checks.length, 1);
    const stopped = checks[0];
    assert.equal(await page.evaluate((check) => validSelfCheck(check), stopped), true);
    assert.equal(stopped.occasion, 'routine');
    assert.deepEqual(stopped.sleepiness, { scale: 'kss-9-v1', rating: 4 });
    assert.equal(stopped.sleepHoursPast24h, 7.5);
    assert.equal(stopped.note, 'browser check');
    assert.equal(typeof stopped.timeZone, 'string');
    assert.equal(stopped.vigilance.status, 'interrupted');
    assert.equal(stopped.vigilance.interruption.type, 'blur');
    assert.equal(stopped.vigilance.earlyPresses.length, 1);
    const answered = stopped.vigilance.trials.filter((trial) => trial.responseT !== undefined);
    assert.equal(answered.length, 3);
    for (const trial of answered) {
      const reactionMs = trial.responseT - trial.onsetT;
      assert(reactionMs > 150 && reactionMs < 3000, 'plausible reaction ' + reactionMs);
      assert.equal(trial.pointerType, 'mouse');
      assert(trial.nextFrameT > trial.onsetT);
      assert(trial.isiMs >= 1000 && trial.isiMs < 4000);
    }
    assert(stopped.vigilance.frameIntervalMedianMs > 0);
    assert.equal(await page.locator('#self-check-history').isVisible(), true);
    const historyRows = page.locator('#self-check-history-table tr');
    assert.equal(await historyRows.count(), 2);
    assert.match(await historyRows.nth(1).innerText(), /stopped: window lost focus/);

    // Cancel stores nothing.
    await startCheck(page, 'extra', 6);
    await page.locator('#self-check-checkin-continue').click();
    await page.locator('#vigilance-cancel').click();
    assert.equal((await storedChecks(page)).length, 1);

    // A complete test, ended by its 10th counter.
    await startCheck(page, 'routine', 3);
    await page.locator('#self-check-checkin-continue').click();
    assert.equal(await page.textContent('#self-check-instructions h2'), 'Alertness test: 10 counters');
    await beginTest(page);
    const shortAt = await boxCenter(page);
    for (let i = 0; i < 10; i++) await answerStimulus(page, shortAt);
    await page.locator('#self-check-result-heading', { hasText: 'Result' }).waitFor();
    checks = await storedChecks(page);
    const short = checks.find((check) => check.vigilance.protocol === 'alertness-10-v1'
      && check.vigilance.status === 'complete');
    assert.equal(short.vigilance.trials.length, 10);
    assert.equal(short.vigilance.trials.every((trial) => trial.responseT !== undefined), true);
    const shortMs = short.vigilance.endT - short.vigilance.startT;
    assert(shortMs > 10000 && shortMs < 60000, 'the short test takes about half a minute: ' + shortMs);
    assert.equal(await page.locator('#self-check-result-table tr').count(), 6);
    assert.match(await page.locator('#self-check-history-table tr').nth(1).innerText(), /complete/);

    // Backup round trip into an emptied store.
    await page.locator('#self-check-export').click();
    const exported = await page.evaluate(async () =>
      (await fetch(document.getElementById('self-check-download').href)).json());
    assert.equal(exported.format, 'minesweeper-friendly-self-checks');
    assert.equal(exported.selfChecks.length, 2);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const tx = db.transaction(SELF_CHECK_STORE, 'readwrite');
      tx.objectStore(SELF_CHECK_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
    await page.reload();
    await page.locator('#self-check-start').waitFor();
    assert.equal(await page.locator('#self-check-history').isHidden(), true);
    const file = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) };
    await page.locator('#self-check-import').setInputFiles(file);
    await page.locator('#self-check-transfer-status', { hasText: 'imported' }).waitFor();
    assert.deepEqual(await storedChecks(page), exported.selfChecks);
    await page.locator('#self-check-import').setInputFiles(file);
    await page.locator('#self-check-transfer-status', { hasText: 'imported 0 new' }).waitFor();
    assert.equal(await page.locator('#self-check-history').isVisible(), true);

    assert.deepEqual(errors, []);
    console.log('self-check browser check: upgrade, check-in, timed responses, early press, stop, complete 10-counter test, '
      + 'history, and backup passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
