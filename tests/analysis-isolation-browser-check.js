'use strict';
// Hold real worker loading while exercising real input, persistence, reload,
// and late replies. No measurements depend on a machine-speed threshold.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);
const origin = 'http://127.0.0.1:8099/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Motion stats start closed for a new player; the section checked below
    // shows only when open.
    await page.goto(origin);
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(() => {
      updateSettings({ panels: { ...settings.panels, motionStats: true } });
      return new Promise((resolve, reject) => {
        const tx = db.transaction(USERDATA_STORE);
        tx.objectStore(USERDATA_STORE).get('settings');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    });
    let releaseWorkers;
    let gate = new Promise((resolve) => { releaseWorkers = resolve; });
    await page.route('**/analysis-worker.js?*', async (route) => { await gate; await route.continue(); });
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    const initialBoard = await page.locator('#game-frame').boundingBox();
    assert.equal(await page.locator('#motion-stats .stat-section-body').isVisible(), true,
      'the open motion stats section shows before worker replies');
    await page.evaluate(() => {
      settings.justUniverse = false;
      // Any accidental execution in the window fails the test, including
      // attempts to substitute synchronous work when the worker is delayed.
      for (const name of ['computeAllTraceMetrics', 'computeSpatialBias', 'computeClickCadence',
        'resultRankPlan', 'averageScatterData', 'scatterPlotData', 'boardTraitRankProfile', 'recentPlacementCandidates',
        'recentPlacementsSummary']) {
        window[name] = () => { throw new Error('Analytics ran on UI thread: ' + name); };
      }
    });
    await page.locator('#board .cell').first().click();
    const mine = await page.evaluate(() => cells.findIndex((cell) => cell.mine));
    await page.locator('#board .cell').nth(mine).click();
    // The lost game is saved, record and trace together and marked pending,
    // before any worker replies; it joins the history only once the reports
    // worker has judged it.
    const savedGame = () => page.evaluate(async () => {
      const read = (store, method, query) => new Promise((resolve, reject) => {
        const request = db.transaction(store).objectStore(store)[method](query);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [record] = await read(RECORD_STORE, 'getAll');
      if (record === undefined) return null;
      const stored = await read(TRACE_STORE, 'get', record.endedAt);
      return { endedAt: record.endedAt, key: modeKey(), recordPending: record.evaluationPending === true,
        tracePending: stored.evaluationPending === true, sampleTimes: stored.metricSampleTimes,
        wallMs: record.endedAt - stored.startedAt, inHistory: (history[modeKey()] ?? []).length };
    });
    let captured = null;
    for (let tries = 0; captured === null && tries < 100; tries++) {
      captured = await savedGame();
      if (captured === null) await page.waitForTimeout(50);
    }
    assert.notEqual(captured, null, 'the lost game is saved while the workers are held');
    assert.deepEqual([captured.recordPending, captured.tracePending, captured.inHistory], [true, true, 0],
      'saved pending judgment, not yet in the history');
    assert.equal(captured.sampleTimes.at(-1), captured.wallMs, 'the final sample time is durable before analysis');
    await page.waitForFunction(() => document.querySelector('#result-ranks .result-loading') !== null);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => gameState), 'ready');
    assert.equal(await page.locator('#result-ranks .result-loading').count(), 0, 'restart clears the waiting result');
    await page.locator('#board .cell').first().click();
    const nextSeed = await page.evaluate(() => gameSeed);
    assert.equal(await page.evaluate(() => gameState), 'playing');
    releaseWorkers();
    await page.waitForFunction(({ key, endedAt }) => {
      const record = (history[key] ?? []).find((r) => r.endedAt === endedAt);
      return record !== undefined && hasBoardMeasurements(record);
    }, captured);
    assert.equal(await page.evaluate(() => gameSeed), nextSeed);
    assert.equal(await page.evaluate(() => renderedResult), null, 'late analysis never replaces the active game');
    assert.equal(await page.evaluate(() => gameState), 'playing');
    const completed = await page.evaluate(({ key, endedAt }) => history[key].find((r) => r.endedAt === endedAt), captured);
    assert(Number.isInteger(completed.zini));
    assert.equal(completed.evaluationPending, undefined);
    assert.equal(completed.actionEvaluations.at(-1).result, 'death', 'the judgment arrives with the record');
    const resaved = await savedGame();
    assert.deepEqual([resaved.recordPending, resaved.tracePending], [false, false], 'saved again complete');
    await page.waitForFunction(() => analysisLanes.get('reports').pending.size === 0);
    assert.deepEqual(await page.locator('#game-frame').boundingBox(), initialBoard,
      'worker replies cannot change the reserved board geometry');
    assert.deepEqual(errors, []);

    // A saved board can restore and accept a restart before its trace's
    // statistics arrive. A reply after restart must leave the new board alone.
    await page.evaluate(({ endedAt }) => updateSettings({ resultView: 'game',
      replayPosition: { endedAt, step: 0 } }), captured);
    gate = new Promise((resolve) => { releaseWorkers = resolve; });
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    assert.equal(await page.evaluate(() => gameState), 'lost');
    assert.equal(await page.locator('#face-button').isEnabled(), true);
    assert.equal(await page.locator('#game-frame').isVisible(), true);
    await page.locator('#face-button').click();
    const restoredRestartSeed = await page.evaluate(() => gameSeed);
    releaseWorkers();
    await page.evaluate(() => restoredAnalysisReady);
    assert.equal(await page.evaluate(() => gameSeed), restoredRestartSeed);
    assert.equal(await page.evaluate(() => gameState), 'ready');
    assert.equal(await page.evaluate(() => finalMotion), null);
    assert.deepEqual(errors, []);

    await page.evaluate(() => {
      analysisTask('errors', 'deliberate-unknown-task', {}).catch(analysisFailure);
    });
    await page.waitForFunction(() => backupStatus.textContent.includes('deliberate-unknown-task'));
    assert.equal(await page.locator('#backup-status').getAttribute('role'), 'alert');
    assert(errors.some((message) => message.includes('Unknown analysis task')));
    console.log('analysis isolation: input and persistence during blocked workers, immutable results, restart during restoration, and visible worker errors passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
