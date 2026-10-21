'use strict';
// The error bar (page-errors.js) on every page that runs game code, in a fresh
// profile on the test origin: a clean load shows no bar; then a thrown error
// (twice), a rejected promise, and a script that fails to load each show as
// one line naming the file and line, dismiss hides the bar, and the next error
// shows it again. An error the browser raises itself (a ResizeObserver loop)
// has no file and shows its message alone. On the game page an analysis
// worker's error names the worker's own line, not the page code that relayed
// it.
//
//   node tests/page-errors-browser-check.js <playwright-core> <chromium|firefox> <browser executable>
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const [playwrightPath, engine, executablePath] = process.argv.slice(2);
if (!['chromium', 'firefox'].includes(engine) || !executablePath) {
  throw new Error('usage: node tests/page-errors-browser-check.js <playwright-core> <chromium|firefox> <browser executable>');
}
const browserType = require(playwrightPath)[engine];
const ORIGIN = 'http://127.0.0.1:8099/';
const PAGES = ['index.html', 'settings.html', 'training.html', 'self-check.html', 'problems.html'];
const PROBE_SCRIPT = [
  '"use strict";',
  'function probeThrow() {',
  '  throw new TypeError("probe thrown");',
  '}',
  'function probeReject() {',
  '  return Promise.reject(new RangeError("probe rejected"));',
  '}',
  'function probeResizeLoop() {',
  '  const box = document.createElement("div");',
  '  box.style.cssText = "position: fixed; width: 10px; height: 10px";',
  '  document.body.append(box);',
  '  let resized = false;',
  '  new ResizeObserver(() => {',
  '    if (resized) return;',
  '    resized = true;',
  '    box.style.width = "20px";',
  '  }).observe(box);',
  '}',
].join('\n');
const RESIZE_LOOP_REPORT = 'ResizeObserver loop completed with undelivered notifications.';
const UNKNOWN_KIND_LINE = fs.readFileSync(path.join(__dirname, '..', 'analysis-worker.js'), 'utf8')
  .split('\n').findIndex((line) => line.includes("throw new Error('Unknown analysis task: ' + kind)")) + 1;
if (UNKNOWN_KIND_LINE === 0) throw new Error('analysis-worker.js no longer throws "Unknown analysis task"');

const barLines = (page) => page.locator('.page-errors li').allTextContents();

(async () => {
  const browser = await browserType.launch({ executablePath, headless: true });
  try {
    for (const file of PAGES) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/probe-errors.js', (route) => route.fulfill({ body: PROBE_SCRIPT, contentType: 'text/javascript' }));
      await page.goto(ORIGIN + file);
      if (file === 'index.html') {
        await page.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
      }
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('.page-errors').count(), 0, file + ': a clean load shows no error bar');

      await page.evaluate(() => new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'probe-errors.js';
        script.onload = resolve;
        document.head.append(script);
      }));
      await page.evaluate(() => {
        setTimeout(probeThrow, 0);
        setTimeout(probeThrow, 0);
        probeReject();
        const missing = document.createElement('script');
        missing.src = 'no-such-file.js?v=probe';
        document.head.append(missing);
      });
      await page.waitForFunction(() => document.querySelectorAll('.page-errors li').length === 3
        && [...document.querySelectorAll('.page-errors li')].some((li) => li.textContent.endsWith('2 times')));
      assert.deepEqual((await barLines(page)).sort(), [
        'Could not load no-such-file.js',
        'RangeError: probe rejected (probe-errors.js line 6)',
        'TypeError: probe thrown (probe-errors.js line 3), 2 times',
      ], file + ': each error is one line with its file and line');
      assert.equal(await page.locator('.page-errors').getAttribute('role'), 'alert');

      await page.locator('.page-errors button').click();
      assert.equal(await page.locator('.page-errors').isVisible(), false, file + ': dismiss hides the bar');
      await page.evaluate(() => { setTimeout(probeThrow, 0); });
      await page.waitForFunction(() => document.querySelector('.page-errors li').textContent.endsWith('3 times'));
      assert.equal(await page.locator('.page-errors').isVisible(), true, file + ': the next error shows the bar again');

      await page.evaluate(() => { probeResizeLoop(); });
      await page.waitForFunction(() => document.querySelectorAll('.page-errors li').length === 4);
      const lines = await barLines(page);
      assert.ok(lines.includes(RESIZE_LOOP_REPORT),
        file + ': an error the browser raises shows its message alone: ' + JSON.stringify(lines));

      if (file === 'index.html') {
        await page.evaluate(() => { analysisTask('reports', 'probe-kind', {}); });
        const relayed = 'Error: probe-kind: Unknown analysis task: probe-kind (analysis-worker.js line ' + UNKNOWN_KIND_LINE + ')';
        await page.waitForFunction((text) => [...document.querySelectorAll('.page-errors li')]
          .some((li) => li.textContent === text), relayed);
      }
      await context.close();
      console.log(engine + ' ' + file + ': error bar checks passed');
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
