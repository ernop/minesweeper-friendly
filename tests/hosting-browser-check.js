'use strict';
// This test writes only to an isolated profile at the permanent test origin.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);
const origin = 'http://127.0.0.1:8099/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(() => {
      window.policyViolations = [];
      document.addEventListener('securitypolicyviolation', event =>
        window.policyViolations.push({ directive: event.violatedDirective, uri: event.blockedURI }));
    });
    const page = await context.newPage();
    const errors = [];
    const badResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(origin) && response.status() >= 400) badResponses.push(response.url());
    });
    const response = await page.goto(origin);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-security-policy'], /worker-src 'self'/);
    assert.equal(response.headers()['cache-control'], 'no-cache');
    await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
    await page.evaluate(() => { settings.justUniverse = false; });
    await page.locator('#board .cell').first().click();
    const mine = await page.evaluate(() => cells.findIndex(cell => cell.mine));
    await page.locator('#board .cell').nth(mine).click();
    await page.waitForFunction(() => gameState === 'lost' && renderedResult !== null &&
      !resultRanks.hasAttribute('aria-busy') && hasBoardMeasurements(renderedResult.record));
    const endedAt = await page.evaluate(() => renderedResult.record.endedAt);
    assert(page.workers().length >= 2, 'analysis and board workers run under CSP');
    assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
    await page.reload();
    await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
    await page.evaluate(() => restoredAnalysisReady);
    await page.waitForFunction(() => !waitingForRestoredLayout);
    assert.equal(await page.evaluate(() => renderedResult.record.endedAt), endedAt);
    await Promise.all([page.waitForURL('**/settings.html'), page.locator('#settings-btn').click()]);
    await page.waitForFunction(() => typeof settings !== 'undefined' && settings !== null);
    await page.evaluate(() => importPreferences(JSON.stringify({ cellSize: 40 })));
    assert.equal(await page.evaluate(() => JSON.parse(exportPreferences()).cellSize), 40);
    await Promise.all([page.waitForURL('**/index.html'), page.locator('.return-to-game').first().click()]);
    await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
    assert.equal(await page.evaluate(() => settings.cellSize), 40);
    await page.click('#export-btn', { force: true });
    await page.waitForFunction(() => document.getElementById('export-file').href.startsWith('blob:'));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-file').click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    const stream = await download.createReadStream();
    const buffers = [];
    for await (const buffer of stream) buffers.push(buffer);
    const exported = JSON.parse(Buffer.concat(buffers).toString());
    assert(JSON.stringify(exported).includes(String(endedAt)), 'download preserves recorded game');
    assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
    await page.goto(origin + 'just-universe-help.html');
    assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(badResponses, []);
    console.log('Hosted artifact: CSP, workers, completed game, persisted result, settings navigation/import, history download, and help passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
