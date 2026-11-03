'use strict';
// Archive folder in a real browser: a game pending its judgment left out,
// automatic writes once it is judged, file contents equal to the stored
// record and trace, write-once on
// reload, files another tab archived found rather than rewritten through a
// cached listing, the paused-permission chip and resume, a visible failure
// when the folder
// disappears, suspension during a self-check test and the write after it,
// and the settings page status.
//
// A headless browser cannot show a folder picker, so the archive folder is a
// directory of the origin-private file system: the same handle interface the
// picker returns. Pages are served from the working tree by request routing
// under the exact test origin; every other request is aborted.
//
// Usage: node tests/archive-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.argv[2]);

const ORIGIN = 'http://127.0.0.1:8099';
const repo = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(repo, 'archive-format.js'), 'utf8'));

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

// Reads one archived item back through gunzip, inside the page.
function readArchived(page, folderName, parts) {
  return page.evaluate(async ({ folderName, parts }) => {
    let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
    for (const name of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(name);
    const file = await (await directory.getFileHandle(parts.at(-1))).getFile();
    return JSON.parse(await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }, { folderName, parts });
}

function useFolder(page, folderName) {
  return page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    useArchiveFolder(await root.getDirectoryHandle(name, { create: true }));
  }, folderName);
}

function waitForStatus(page, status, detailIncludes = '') {
  return page.waitForFunction(({ status, detailIncludes }) => archiveState.status === status
    && archiveState.detail.includes(detailIncludes), { status, detailIncludes }, { timeout: 15000 });
}

async function waitForGame(page) {
  await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
}

// A page with saved games opens on the last finished board; the face button
// starts a fresh one, as a player would.
async function playLosingGame(page) {
  await page.evaluate(() => { settings.justUniverse = false; });
  if (await page.evaluate(() => gameState === 'won' || gameState === 'lost')) {
    await page.locator('#face-button').click();
  }
  await page.locator('#board .cell').first().click();
  const mine = await page.evaluate(() => cells.findIndex((cell) => cell.mine));
  await page.locator('#board .cell').nth(mine).click();
}

// A finished game joins the history once the reports worker has judged it.
async function loseGame(page, gamesAfter) {
  await playLosingGame(page);
  await page.waitForFunction((count) => Object.values(history).flat().length === count, gamesAfter);
}

// Every game record in the database, with its stored trace.
function storedGames(page) {
  return page.evaluate(async () => {
    const read = (store, method, query) => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store)[method](query);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await read(RECORD_STORE, 'getAllKeys');
    const records = await read(RECORD_STORE, 'getAll');
    return Promise.all(records.map(async (record, i) => {
      const trace = await read(TRACE_STORE, 'get', record.endedAt);
      return { mode: keys[i][0], record, sampleT: Array.from(trace.sampleT), sampleX: Array.from(trace.sampleX),
        events: trace.events, tracePending: trace.evaluationPending === true };
    }));
  });
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
    // The analysis workers are held at first: a finished game is saved at
    // once, pending the reports worker's judgment, and a sync meanwhile
    // leaves it out.
    let releaseWorkers;
    const workersHeld = new Promise((resolve) => { releaseWorkers = resolve; });
    await page.route('**/analysis-worker.js?*', async (route) => { await workersHeld; await route.fallback(); });

    await page.goto(ORIGIN + '/');
    await waitForGame(page);
    await page.waitForFunction(() => archiveState.status === 'not-chosen');
    assert.equal(await page.locator('#archive-chip').isHidden(), true, 'no chip without a folder');
    await useFolder(page, 'archive');
    await waitForStatus(page, 'up-to-date', '0 game records');

    await playLosingGame(page);
    let pending = [];
    for (let tries = 0; pending.length === 0 && tries < 100; tries++) {
      pending = await storedGames(page);
      if (pending.length === 0) await page.waitForTimeout(50);
    }
    assert.deepEqual(pending.map((game) => [game.record.evaluationPending, game.tracePending]), [[true, true]]);
    await page.evaluate(() => runArchiveSync());
    await waitForStatus(page, 'up-to-date', '0 game records, 0 traces, 0 self-checks (0 newly archived)');

    // Judged, the game is archived automatically, exactly as stored.
    releaseWorkers();
    await page.waitForFunction(() => Object.values(history).flat().length === 1);
    await waitForStatus(page, 'up-to-date', '1 game record, 1 trace, 0 self-checks (2 newly archived)');
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some((known) => known.name === 'minesweeper-problems')),
      false, 'a sync never creates the problems page\u2019s database');
    const [stored] = await storedGames(page);
    assert.equal(stored.record.evaluationPending, undefined);
    assert.equal(stored.tracePending, false);
    assert.equal(await page.evaluate(() => hasBoardMeasurements(Object.values(history).flat()[0])), true,
      'the record is archived with its board measurements');
    const archivedRecord = await readArchived(page, 'archive', archiveRecordPath(stored.mode, stored.record));
    assert.equal(archivedRecord.format, 'minesweeper-friendly-game-record');
    assert.equal(archivedRecord.mode, stored.mode);
    assert.deepEqual(archivedRecord.record, JSON.parse(JSON.stringify(stored.record)));
    const archivedTrace = await readArchived(page, 'archive', archiveTracePath(stored.record.endedAt));
    assert.equal(archivedTrace.format, 'minesweeper-friendly-trace');
    assert.deepEqual(archivedTrace.trace.sampleT, stored.sampleT);
    assert.deepEqual(archivedTrace.trace.sampleX, stored.sampleX);
    assert.deepEqual(archivedTrace.trace.events, JSON.parse(JSON.stringify(stored.events)));
    const readme = await page.evaluate(async () => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('archive');
      return (await (await folder.getFileHandle('README.txt')).getFile()).text();
    });
    assert.equal(readme, ARCHIVE_README_TEXT);

    // The stored folder is used again after a reload; nothing is rewritten.
    await page.reload();
    await waitForGame(page);
    await waitForStatus(page, 'up-to-date', '(0 newly archived)');

    // Files another tab archived are found, not rewritten, by this tab's
    // worker, whose directory listings predate them.
    const otherTab = await context.newPage();
    await otherTab.goto(ORIGIN + '/');
    await waitForGame(otherTab);
    await waitForStatus(otherTab, 'up-to-date', '(0 newly archived)');
    await loseGame(otherTab, 2);
    await waitForStatus(otherTab, 'up-to-date', '2 game records, 2 traces, 0 self-checks (2 newly archived)');
    await otherTab.close();
    await page.evaluate(() => runArchiveSync());
    await waitForStatus(page, 'up-to-date', '2 game records, 2 traces, 0 self-checks (0 newly archived)');

    // Without permission the archive pauses visibly and resumes from the chip.
    const pausedPage = await context.newPage();
    await pausedPage.addInitScript(() => {
      FileSystemHandle.prototype.queryPermission = async () => 'prompt';
      FileSystemHandle.prototype.requestPermission = async () => 'granted';
    });
    await pausedPage.goto(ORIGIN + '/');
    await pausedPage.waitForFunction(() => typeof archiveState !== 'undefined'
      && archiveState.status === 'needs-permission');
    const chip = pausedPage.locator('#archive-chip');
    assert.equal(await chip.innerText(), 'archive paused');
    await chip.click();
    await waitForStatus(pausedPage, 'up-to-date', '(0 newly archived)');
    assert.equal(await chip.isHidden(), true);
    await pausedPage.close();

    // A folder that disappeared is a visible failure, never a quiet stop.
    await page.evaluate(async () => {
      await (await navigator.storage.getDirectory()).removeEntry('archive', { recursive: true });
      runArchiveSync();
    });
    await page.waitForFunction(() => archiveState.status === 'error');
    assert.equal(await page.locator('#archive-chip').innerText(), 'archive failed');
    assert.match(await page.locator('#backup-status').innerText(), /^Archive failed: /);

    // Self-check page: a new folder catches up on existing data; the timed
    // test suspends archive work, and the saved check is archived after it.
    await page.goto(ORIGIN + '/self-check.html');
    await page.locator('#self-check-start').waitFor();
    await page.waitForFunction(() => archiveState.status === 'error');
    assert.match(await page.locator('#self-check-archive-status').innerText(), /^Archive: Archive failed: /);
    assert.equal(await page.locator('#self-check-archive-now').isVisible(), true);
    await useFolder(page, 'archive-2');
    // Four data files; the README is documentation and not counted.
    await waitForStatus(page, 'up-to-date', '2 game records, 2 traces, 0 self-checks (4 newly archived)');
    await page.locator('#self-check-start-routine').click();
    await page.locator('.sleepiness-choice[data-rating="5"]').click();
    await page.locator('#self-check-checkin-continue').click();
    await page.locator('#vigilance-begin').click();
    assert.equal(await page.evaluate(() => archiveState.suspended), true, 'no archive work during the test');
    await page.waitForFunction(() => vigilanceRun !== null && vigilanceRun.trial !== null, null, { timeout: 10000 });
    await page.waitForTimeout(200);
    const box = await page.locator('#vigilance-box').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Escape');
    await waitForStatus(page, 'up-to-date', '1 self-check (1 newly archived)');
    assert.equal(await page.evaluate(() => archiveState.suspended), false);
    const check = await page.evaluate(() => selfChecks[0]);
    const archivedCheck = await readArchived(page, 'archive-2', archiveSelfCheckPath(check.startedAt));
    assert.equal(archivedCheck.format, 'minesweeper-friendly-self-check');
    assert.deepEqual(archivedCheck.selfCheck, check);
    assert.match(await page.locator('#self-check-archive-status').innerText(), /^Archive: Up to date in /);

    // Settings page shows the same archive and can run it on demand.
    await page.goto(ORIGIN + '/settings.html');
    await waitForStatus(page, 'up-to-date', '(0 newly archived)');
    assert.match(await page.locator('#archive-status-text').innerText(),
      /^Up to date in "archive-2": 2 game records, 2 traces, 1 self-check \(0 newly archived\)\.$/);
    assert.equal(await page.locator('#archive-choose').innerText(), 'Change folder');
    // The browser's answer to the persistent-storage request, either way.
    await page.waitForFunction(() => document.getElementById('storage-persistence-text').textContent !== '');
    assert.match(await page.locator('#storage-persistence-text').innerText(),
      /^The browser (keeps this site\u2019s saved data until you delete it|may delete this site\u2019s saved data when disk space runs low; the archive folder keeps a copy)\.$/);
    await page.locator('#archive-now').click();
    await waitForStatus(page, 'up-to-date', '(0 newly archived)');

    // The problems page keeps its own database; the next sync archives its
    // attempts and runs, and rewrites a README written for an older layout.
    await page.goto(ORIGIN + '/problems.html');
    await page.waitForFunction(() => problemDb !== null);
    const problemItems = await page.evaluate(() => new Promise((resolve, reject) => {
      const items = {
        problemAttempts: { startedAt: 1790000000001, protocol: 'problems-v2' },
        pointingRuns: { startedAt: 1790000000002, protocol: 'pointing-v1' },
        drillAttempts: { startedAt: 1790000000003, protocol: 'last-flag-v1' },
      };
      const tx = problemDb.transaction([ATTEMPT_STORE, POINTING_STORE, DRILL_STORE], 'readwrite');
      tx.objectStore(ATTEMPT_STORE).put(items.problemAttempts);
      tx.objectStore(POINTING_STORE).put(items.pointingRuns);
      tx.objectStore(DRILL_STORE).put(items.drillAttempts);
      tx.oncomplete = () => resolve(items);
      tx.onerror = () => reject(tx.error);
    }));
    const readmeText = () => page.evaluate(async () => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('archive-2');
      return (await (await folder.getFileHandle('README.txt')).getFile()).text();
    });
    await page.evaluate(async () => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('archive-2');
      const writable = await (await folder.getFileHandle('README.txt')).createWritable();
      await writable.write('an older layout');
      await writable.close();
    });
    await page.goto(ORIGIN + '/settings.html');
    await waitForStatus(page, 'up-to-date',
      '1 self-check, 1 problem attempt, 1 pointing run, 1 drill attempt (3 newly archived)');
    for (const [kind, item] of Object.entries(problemItems)) {
      const archived = await readArchived(page, 'archive-2', archiveProblemItemPath(kind, item.startedAt));
      assert.deepEqual(archived, JSON.parse(JSON.stringify(archiveProblemItemDocument(kind, item))));
    }
    assert.equal(await readmeText(), ARCHIVE_README_TEXT, 'an outdated README is rewritten');

    assert.deepEqual(errors, []);
    console.log('archive browser check: pending games left out, automatic writes, exact contents, write-once reload, other-tab files, '
      + 'paused and resumed, visible failure, self-check suspension, settings status, and problems-page items passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
