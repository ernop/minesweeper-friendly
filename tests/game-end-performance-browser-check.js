'use strict';
// Full result rendering against synthetic history, on the permanent test
// origin in a fresh profile. Timings are observations, never pass thresholds.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:8099/');
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(() => {
      settings.justUniverse = false;
      for (const name of ['computeAllTraceMetrics', 'computeSpatialBias', 'computeClickCadence',
        'resultRankPlan', 'averageScatterData', 'scatterPlotData', 'performanceTimeRankProfile',
        'boardTraitRankProfile', 'recentPlacementCandidates', 'recentPlacementsSummary',
        'sessionRunningSeries', 'sessionRawSeries', 'sessionGameSeries']) {
        window[name] = () => { throw new Error('Analytics ran on UI thread: ' + name); };
      }
      const now = Date.now();
      history[modeKey()] = Array.from({ length: 2000 }, (_, i) => ({
        endedAt: now - (2000 - i) * 3600000, outcome: i % 4 ? 'win' : 'loss',
        timeMs: 10000 + (i * 1543 % 50000), clicks: 20 + i % 15, wastedClicks: i % 3,
        misclicks: 0, chordClicks: 0, mousePathPx: 500 + i % 900,
        flagsPlaced: 0, flagsRemoved: 0, unusedCorrectFlags: 0, states: [], actionEvaluations: [],
        bv3: 12 + i % 25, zini: 12 + i % 15, hzini: 12 + i % 15,
        maxAdjacent: 3 + i % 3, zeroCount: 15 + i % 30, islandCount: 3 + i % 6,
        largestIsland: 2, playMode: 'standard',
        boardMetrics: { version: 1, workSpread: 2 + i % 4 / 2, safeCells: 71,
          zeroOpenedZeroOneCells: 30 + i % 10, zeroOpenedCells: 40 + i % 10 },
      }));
      window.resultDurations = [];
      const render = renderResult;
      renderResult = (...args) => {
        const start = performance.now();
        const done = render(...args);
        window.resultDurations.push(performance.now() - start);
        return done;
      };
    });
    await page.locator('#board .cell').first().click();
    const mine = await page.evaluate(() => cells.findIndex((cell) => cell.mine));
    await page.locator('#board .cell').nth(mine).click();
    await page.waitForFunction(() => renderedResult?.record.outcome === 'loss' && window.resultDurations.length > 0
      && !resultRanks.hasAttribute('aria-busy') && !resultRanks.querySelector('[aria-busy=true]'));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => ({
      durations: window.resultDurations, measured: hasBoardMeasurements(renderedResult.record),
      workerStatus: boardMetricJobs.get(renderedResult.record).status, recordCount: history[modeKey()].length,
      tables: resultRanks.querySelectorAll('.rank-list').length,
      charts: resultRanks.querySelectorAll('svg').length,
    }));
    assert.equal(result.durations.length, 1, 'a new completed board requires one full report render');
    assert.equal(result.measured, true);
    assert.equal(result.workerStatus, 'done');
    assert.equal(result.recordCount, 2001);
    assert(result.tables > 0);
    assert(result.charts > 0);
    assert.deepEqual(errors, []);
    console.log('2,000-game history completion:', JSON.stringify(result));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
