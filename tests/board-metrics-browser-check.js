'use strict';
// This test plays only on the permanent test origin, in an isolated profile.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3],
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:8099/');
    await page.waitForFunction(() => preferenceUIReady);
    await page.locator('#board .cell').first().click();
    const mine = await page.evaluate(() => cells.findIndex((cell) => cell.mine));
    await page.locator('#board .cell').nth(mine).click();
    await page.waitForFunction(() => gameState === 'lost' && boardMetricJobs.get(history[modeKey()]?.at(-1))?.status === 'done');
    const saved = await page.evaluate(() => {
      const record = history[modeKey()].at(-1);
      return { key: modeKey(), endedAt: record.endedAt,
        metrics: record.boardMetrics, count: history[modeKey()].length,
        values: [...resultRanks.querySelectorAll('.board-metric-value')].map((el) => el.textContent) };
    });
    assert.equal(saved.values.length, 0);
    // Even a first loss with no previous wins exposes its groups in headings.
    for (const name of ['HZiNi ', '3BV spread ', '0–1 share ', 'zero-opening coverage ']) {
      assert(await page.locator('.result-chart-section-boardTables h4').allTextContents()
        .then((labels) => labels.some((label) => label.startsWith(name))));
    }
    assert(Number.isSafeInteger(saved.metrics.safeCells));
    assert(Number.isSafeInteger(saved.metrics.zeroOpenedZeroOneCells));
    assert(Number.isSafeInteger(saved.metrics.zeroOpenedCells));
    assert(!saved.metrics.chord && !saved.metrics.logic);
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    const restored = await page.evaluate(({ key, endedAt }) =>
      history[key].find((r) => r.endedAt === endedAt).boardMetrics, saved);
    assert.deepEqual(restored, saved.metrics);
    assert.equal(await page.evaluate((key) => history[key].length, saved.key), saved.count);

    // Queue a missing measurement then leave the result. A late reply must only amend
    // its original history record, without replacing the new active board.
    await page.evaluate(({ key, endedAt }) => {
      const r = history[key].find((r) => r.endedAt === endedAt);
      delete r.boardMetrics;
      boardMetricJobs.delete(r);
      requestBoardMetrics(r);
      settings.playMode = 'angelic';
      newGame();
    }, saved);
    await page.waitForFunction(({ key, endedAt }) =>
      history[key].find((r) => r.endedAt === endedAt).boardMetrics !== undefined && boardMetricJobs.get(history[key].find((r) => r.endedAt === endedAt)).status === 'done', saved);
    assert.equal(await page.evaluate(() => renderedResult), null);
    assert.equal(await page.evaluate(() => gameState), 'ready');
    assert.equal(await page.evaluate((key) => history[key].length, saved.key), saved.count);

    // Backfill is optional, uses saved layouts, skips missing traces, and can
    // stop after the in-flight board. All fixture writes remain on port 8099.
    const stopped = await page.evaluate(async ({ key, endedAt }) => {
      const base = history[key].find((r) => r.endedAt === endedAt);
      const get = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).get(endedAt);
      const trace = await new Promise((resolve, reject) => {
        get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error);
      });
      const shape = /^(\d+)x(\d+)\//.exec(key);
      const b = BoardMetrics.board(Number(shape[1]), Number(shape[2]), trace.finalBoard.cells.map((cell) => cell.mine));
      const tx = db.transaction(TRACE_STORE, 'readwrite');
      for (let i = 1; i <= 3; i++) {
        const r = { ...base, outcome: 'win', endedAt: endedAt + i };
        r.boardMetrics = { version: 1, workSpread: base.boardMetrics.workSpread,
          chord: { status: 'bounded', lower: 1, upper: 100 } };
        if (i !== 3) Object.assign(r.boardMetrics, { safeCells: b.safe.length,
          zeroOpenedCells: b.zeroOpenedCells,
          zeroOneCells: b.safe.filter((cell) => b.clues[cell] <= 1).length });
        if (i === 3) delete r.hzini;
        history[key].push(r);
        if (i !== 2) tx.objectStore(TRACE_STORE).put({ ...trace, endedAt: r.endedAt });
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      persistUserdata('history', history);
      settings.playMode = 'standard';
      renderResult(base, history[key]);
      if (boardMetricCandidates(history[key].slice(-3), history[key])
        .some((table) => table.setting === 'zeroOneShareTable')) throw new Error('obsolete counts entered the corrected table');
      if (boardMetricBackfills.has(key)) throw new Error('bulk backfill started without a click');
      resultRanks.querySelector('.board-metric-backfill').click();
      resultRanks.querySelector('.board-metric-backfill').click();
      return boardMetricBackfillProgress(key);
    }, saved);
    assert.deepEqual(stopped, { total: 3, measured: 0, unavailable: 0,
      failed: 0, active: 1, checked: 0, remaining: 3 });
    await page.waitForFunction((key) => history[key].slice(-3).every((r) =>
      !['loading', 'running'].includes(boardMetricJobs.get(r)?.status)), saved.key);
    assert.equal(await page.evaluate((key) => history[key].slice(-3)
      .filter((r) => BoardMetrics.hasFractions(r.boardMetrics)).length, saved.key), 1);
    assert.deepEqual(await page.evaluate((key) => boardMetricBackfillProgress(key), saved.key),
      { total: 3, measured: 1, unavailable: 0, failed: 0, active: 0, checked: 1, remaining: 2 });
    assert.equal(await page.locator('.board-metric-backfill-summary').innerText(),
      '1/3 checked · 1 measured · 2 remaining');
    assert.equal(await page.locator('.board-metric-backfill-status').innerText(), 'Paused');
    assert.equal(await page.locator('.board-metric-backfill').innerText(), 'Resume backfill (2)');
    assert.deepEqual(await page.locator('.board-metric-backfill-panel progress')
      .evaluate((el) => [el.value, el.max]), [1, 3]);
    assert.deepEqual(await page.evaluate((key) => {
      const wins = history[key].filter((r) => r.outcome === 'win');
      return boardMetricCandidates([wins[0]], wins)
        .filter((table) => ['zeroOneShareTable', 'zeroOpeningTable'].includes(table.setting))
        .map((table) => table.wins.length);
    }, saved.key), [1, 2]);
    assert.equal(await page.evaluate((key) => history[key].at(-3).boardMetrics.zeroOpenedZeroOneCells,
      saved.key), saved.metrics.zeroOpenedZeroOneCells);
    // Read after the write transaction, then reload the real persisted history.
    // A partial batch must be useful and resumable without replaying its first win.
    assert.equal(await page.evaluate(async (key) => {
      const request = db.transaction('userdata').objectStore('userdata').get('history');
      const stored = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return stored[key].slice(-3).filter((r) => BoardMetrics.hasFractions(r.boardMetrics)).length;
    }, saved.key), 1);
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(({ key, endedAt }) => {
      settings.playMode = 'standard';
      renderResult(history[key].find((r) => r.endedAt === endedAt), history[key]);
    }, saved);
    assert.equal(await page.locator('.board-metric-backfill').innerText(), 'Resume backfill (2)');
    assert.equal(await page.evaluate((key) => boardMetricBackfillProgress(key).measured, saved.key), 1);
    await page.locator('.board-metric-backfill').click();
    await page.waitForFunction((key) => !boardMetricBackfills.has(key), saved.key);
    assert.equal(await page.evaluate((key) => history[key].slice(-3)
      .filter((r) => BoardMetrics.hasFractions(r.boardMetrics)).length, saved.key), 2);
    assert.equal(await page.evaluate((key) => boardMetricJobs.get(history[key].at(-2)).status, saved.key), 'unavailable');
    assert.equal(await page.evaluate((key) => boardMetricJobs.has(history[key].at(-3)), saved.key), false);
    assert.deepEqual(await page.evaluate((key) => boardMetricBackfillProgress(key), saved.key),
      { total: 3, measured: 2, unavailable: 1, failed: 0, active: 0, checked: 3, remaining: 0 });
    assert.equal(await page.locator('.board-metric-backfill-panel').count(), 0,
      'no idle progress panel when unavailable boards are the only remainder');
    assert(await page.evaluate((key) => history[key].slice(-3).filter((r) => BoardMetrics.hasFractions(r.boardMetrics))
      .every((r) => Number.isSafeInteger(r.hzini) && r.boardMetrics.chord.upper === 100), saved.key));
    const exhausted = await page.evaluate(({ key, endedAt }) => {
      const base = history[key].find((r) => r.endedAt === endedAt);
      const missing = history[key].at(-2);
      boardMetricJobs.set(missing, { status: 'error', error: 'deliberate backfill failure' });
      const failed = buildBoardMetricStatus(base);
      const errorVisible = failed.querySelector('[role=alert]').textContent;
      const failedPanel = failed.querySelector('.board-metric-backfill-panel') !== null;
      const oldMetrics = missing.boardMetrics;
      missing.boardMetrics = { ...base.boardMetrics };
      boardMetricJobs.delete(missing);
      const allMeasuredIsHidden = buildBoardMetricStatus(base) === null;
      missing.boardMetrics = oldMetrics;
      boardMetricJobs.set(missing, { status: 'unavailable' });
      return { errorVisible, failedPanel, allMeasuredIsHidden };
    }, saved);
    assert.deepEqual(exhausted, { errorVisible: 'Backfill failed: deliberate backfill failure',
      failedPanel: false, allMeasuredIsHidden: true });

    // Renderer fixtures are RAM-only. Existing HZiNi records remain comparable;
    // research ranges never become tables, and spread uses fixed bins.
    const rendered = await page.evaluate(() => {
      settings.playMode = 'standard';
      settings.shownThings.averageCharts = settings.shownThings.relationshipCharts = false;
      const now = Date.now();
      const metrics = BoardMetrics.analyze(3, 3, [false, false, false, false, true, false, false, false, false]).boardMetrics;
      const base = { outcome: 'win', endedAt: now, timeMs: 4000, states: [],
        bv3: 8, zini: 5, hzini: 6, clicks: 8, wastedClicks: 0, flagsPlaced: 0,
        flagsRemoved: 0, mousePathPx: 100, maxAdjacent: 1, zeroCount: 0,
        boardMetrics: metrics };
      const records = [
        { ...base, endedAt: now - 3000, timeMs: 1000,
          boardMetrics: { ...metrics, workSpread: 1.05 } },
        { ...base, endedAt: now - 2000, timeMs: 2000,
          boardMetrics: { ...metrics, workSpread: 1.49,
            chord: { status: 'bounded', lower: 4, upper: 5 },
            logic: { status: 'complete', lower: 1, upper: 2 } } },
        { ...base, endedAt: now - 1000, timeMs: 3000,
          boardMetrics: { ...metrics, version: 2 } }, base,
      ];
      renderResult(base, records);
      const tables = Object.fromEntries([...resultRanks.querySelectorAll('.rank-list')]
        .filter((el) => !el.classList.contains('recent-placements'))
        .map((el) => [el.querySelector('h4').textContent, el.querySelector('.rank-total').textContent]));
      return { tables, values: [...resultRanks.querySelectorAll('.board-metric-value')].map((el) => el.textContent),
        details: [...resultRanks.querySelectorAll('.board-metric-detail')].map((el) => el.textContent),
        efficiency: [...resultStats.querySelectorAll('.stat-label')]
          .find((el) => el.textContent === 'HZiNi efficiency').nextElementSibling.textContent,
        labels: [...resultRanks.querySelectorAll('.board-metric-fact h4')].map((el) => el.textContent),
        controls: [...resultRanks.querySelectorAll('button')].map((el) => el.textContent) };
    });
    assert.equal(rendered.tables['HZiNi 6'], '#4 of 4Last place');
    assert(!Object.keys(rendered.tables).some((label) => /minimum clicks|RCW/.test(label)));
    assert(!rendered.controls.some((label) => /Refine|RCW/.test(label)));
    assert.equal(rendered.efficiency, '75.0%');
    assert.deepEqual(rendered.details, []);
    assert.deepEqual(rendered.labels, []);
    assert.equal(rendered.tables['0–1 share 0%'], '#3 of 3Last place');
    assert.equal(rendered.tables['zero-opening coverage 0%'], '#3 of 3Last place');
    assert.equal(rendered.tables['3BV spread 1.0 cells'], '#2 of 2Last place');
    assert.deepEqual(rendered.values, []);
    const boardBefore = await page.locator('#board').boundingBox();
    const spreadHelp = page.getByRole('button', { name: 'About 3BV spread 1.0 cells', exact: true });
    await spreadHelp.hover();
    const spreadTip = await page.locator('.chart-help-tip').innerText();
    assert(spreadTip.includes('root-mean-square'));
    assert(spreadTip.includes('This board: 1.225 cells'));
    assert(spreadTip.includes('nearest 0.5 cell'));
    assert(spreadTip.includes('Exact halfway values round up'));
    assert.deepEqual(await page.locator('#board').boundingBox(), boardBefore);
    await page.mouse.move(0, 0);
    await spreadHelp.focus();
    assert.equal(await page.locator('.chart-help-tip').isVisible(), true);
    await spreadHelp.evaluate((el) => el.blur());
    for (const [label, detail] of [['0–1 share 0%', '0 of 8 safe cells'],
      ['zero-opening coverage 0%', '0 of 8 safe cells']]) {
      const help = page.getByRole('button', { name: 'About ' + label, exact: true });
      await help.hover();
      const tip = await page.locator('.chart-help-tip').innerText();
      assert(tip.includes(detail));
      if (label.startsWith('0–1')) assert(tip.includes('Covered ones'));
      assert(tip.includes('nearest whole percentage point'));
      assert.deepEqual(await page.locator('#board').boundingBox(), boardBefore);
    }
    await page.mouse.move(0, 0);
    for (const width of [1440, 650]) {
      await page.setViewportSize({ width, height: 1050 });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.board-metric-fact, .rank-list')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1).length);
      assert.equal(overflow, 0);
      await page.screenshot({ path: '/tmp/board-tools-' + width + '.png', fullPage: true });
    }
    const edgeCases = await page.evaluate(() => {
      const r = { outcome: 'win', hzini: 6, clicks: 5,
        boardMetrics: { version: 1, workSpread: 1.2 } };
      const above100 = 100 * hziniEfficiencyOf(r);
      const noIdleStatus = buildBoardMetricStatus(r) === null;
      r.outcome = 'loss';
      const lossHasEfficiency = hziniEfficiencyOf(r) !== undefined;
      boardMetricJobs.set(r, { status: 'error', error: 'deliberate fixture failure' });
      const errorText = buildBoardMetricStatus(r).querySelector('[role=alert]').textContent;
      return { above100, noIdleStatus, lossHasEfficiency, errorText };
    });
    assert.deepEqual(edgeCases, { above100: 120, noIdleStatus: true, lossHasEfficiency: false,
      errorText: 'Board measurement failed: deliberate fixture failure' });
    assert.deepEqual(errors, []);
    console.log('Board metrics browser: corrected visible 0–1 counts, manual backfill of obsolete counts, persistence/reload, partial ranks, pause/resume, exhausted status hidden with errors retained, worker isolation, rounded cohorts and accessible tooltips passed.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
