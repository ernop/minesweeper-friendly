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
    let releaseWorkers;
    let gate = new Promise((resolve) => { releaseWorkers = resolve; });
    await page.route('**/analysis-worker.js?*', async (route) => { await gate; await route.continue(); });
    await page.goto(origin);
    await page.waitForFunction(() => preferenceUIReady);
    const initialBoard = await page.locator('#game-frame').boundingBox();
    assert.equal(await page.locator('#metrics-panel').isVisible(), true, 'stats column exists before worker replies');
    await page.evaluate(() => {
      settings.justUniverse = false;
      // Any accidental execution in the window fails the test, including
      // attempts to substitute synchronous work when the worker is delayed.
      for (const name of ['computeAllTraceMetrics', 'computeSpatialBias', 'computeClickCadence',
        'resultRankPlan', 'averageScatterData', 'scatterPlotData', 'performanceTimeRankProfile',
        'boardTraitRankProfile', 'recentPlacementCandidates', 'recentPlacementsSummary',
        'sessionRunningSeries', 'sessionRawSeries', 'sessionGameSeries']) {
        window[name] = () => { throw new Error('Analytics ran on UI thread: ' + name); };
      }
    });
    await page.locator('#board .cell').first().click();
    const mine = await page.evaluate(() => cells.findIndex((cell) => cell.mine));
    await page.locator('#board .cell').nth(mine).click();
    await page.waitForFunction(() => history[modeKey()]?.length === 1);
    const captured = await page.evaluate(async () => {
      const record = history[modeKey()][0], key = modeKey();
      const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).get(record.endedAt);
      const stored = await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); });
      return { endedAt: record.endedAt, key, seed: stored.seed, cells: stored.finalBoard.cells,
        sampleTimes: stored.metricSampleTimes, wallMs: record.endedAt - stored.startedAt,
        pending: boardMetricJobs.get(record).status };
    });
    assert.equal(captured.pending, 'running');
    assert.equal(captured.sampleTimes.at(-1), captured.wallMs, 'the final sample time is durable before analysis');
    await page.evaluate(() => { renderResult(history[modeKey()][0], history[modeKey()]); });
    assert.equal(await page.locator('#result-ranks').getAttribute('aria-busy'), 'true');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#result-ranks').getAttribute('aria-busy'), null, 'restart cancels the old pending presentation');
    assert.equal(await page.evaluate(() => gameState), 'ready');
    await page.locator('#board .cell').first().click();
    const nextSeed = await page.evaluate(() => gameSeed);
    assert.equal(await page.evaluate(() => gameState), 'playing');
    releaseWorkers();
    await page.waitForFunction(({ key, endedAt }) => hasBoardMeasurements(history[key].find((r) => r.endedAt === endedAt)), captured);
    assert.equal(await page.evaluate(() => gameSeed), nextSeed);
    assert.equal(await page.evaluate(() => renderedResult), null, 'late analysis never replaces the active game');
    assert.equal(await page.evaluate(() => gameState), 'playing');
    const completed = await page.evaluate(({ key, endedAt }) => history[key].find((r) => r.endedAt === endedAt), captured);
    assert(Number.isInteger(completed.zini));
    await page.waitForFunction(() => analysisLanes.get('live').pending.size === 0);
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
