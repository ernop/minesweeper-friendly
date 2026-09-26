'use strict';
// Browser input, saved IndexedDB records, worker parity, and the public export
// must agree about source times and the new non-action observations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.argv[2]);
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true,
    args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8099/');
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(() => { settings.justUniverse = false; });
    const first = page.locator('#board .cell').first();
    await first.click({ button: 'right' });
    let events = await page.evaluate(() => trace.events);
    assert.equal(events.filter(e => e.kind === 'right-button-down').length, 1);
    assert.equal(events.filter(e => e.kind === 'right-button-up').length, 1);
    assert.equal(events.filter(e => e.kind === 'rdown').length, 1);
    for (const [kind, type] of [['right-button-down', 'mousedown'], ['right-button-up', 'mouseup'],
      ['rdown', 'mousedown']]) {
      const event = events.find(e => e.kind === kind);
      assert.equal(event.sourceType, type);
      assert.equal(event.isTrusted, true);
      assert.equal(event.index, 0);
      assert(Number.isFinite(event.sourceT));
    }
    assert.equal(events.find(e => e.kind === 'right-button-down').buttons, 2);
    assert.equal(events.find(e => e.kind === 'right-button-up').buttons, 0);
    await first.click({ button: 'right' });

    // The source timestamp must survive queued delivery, including untrusted
    // generated events; the recorder must not replace it with performance.now.
    const delayed = await page.evaluate(async () => {
      const event = new MouseEvent('mousemove', { clientX: 17, clientY: 29 });
      const sourceT = event.timeStamp - trace.t0;
      await new Promise(resolve => setTimeout(resolve, 20));
      document.dispatchEvent(event);
      return { expected: sourceT, actual: trace.sourceT.at(-1),
        received: trace.t.at(-1), trusted: trace.sampleTrusted.at(-1) };
    });
    assert.equal(delayed.actual, delayed.expected);
    assert(delayed.received > delayed.actual);
    assert.equal(delayed.trusted, false);

    // Synthetic lifecycle events verify listener wiring; their untrusted mark
    // keeps this test distinct from a browser-observed focus/visibility change.
    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      window.dispatchEvent(new FocusEvent('focus'));
    });
    events = await page.evaluate(() => trace.events);
    const pageEvents = events.filter(e => e.kind === 'page-state' && !e.isTrusted);
    assert.deepEqual(pageEvents.map(e => e.sourceType),
      ['blur', 'visibilitychange', 'pagehide', 'pageshow', 'focus']);
    assert.equal(pageEvents.find(e => e.sourceType === 'pagehide').persisted, true);
    assert(pageEvents.every(e => typeof e.hasFocus === 'boolean'
      && ['visible', 'hidden'].includes(e.visibilityState)));

    await first.click();
    const mine = await page.evaluate(() => cells.findIndex(cell => cell.mine));
    await page.locator('#board .cell').nth(mine).click();
    await page.waitForFunction(() => history[modeKey()]?.length === 1);
    const captured = await page.evaluate(async () => {
      const record = history[modeKey()][0];
      const request = db.transaction(TRACE_STORE).objectStore(TRACE_STORE).get(record.endedAt);
      const saved = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const payload = { t: saved.sampleT, x: saved.sampleX, y: saved.sampleY,
        events: saved.events, wallMs: saved.endedAt - saved.startedAt };
      const enriched = await analysisTask('capture-check', 'trace', payload);
      const original = await analysisTask('capture-check', 'trace', { ...payload,
        events: saved.events.filter(e => !['page-state', 'right-button-down', 'right-button-up'].includes(e.kind)) });
      return { version: saved.captureVersion, clock: saved.clock,
        initialPageState: saved.initialPageState,
        arrayTypes: [saved.sampleSourceT, saved.sampleTrusted, saved.sampleMergeCount].map(a => a.constructor.name),
        sampleLengths: [saved.sampleT, saved.sampleX, saved.sampleY, saved.sampleSourceT,
          saved.sampleTrusted, saved.sampleMergeCount].map(a => a.length),
        events: saved.events, enriched, original };
    });
    assert.equal(captured.version, 1);
    assert(Number.isFinite(captured.clock.timeOriginMs));
    assert(Number.isFinite(captured.clock.traceStartMs));
    assert.equal(typeof captured.initialPageState.hasFocus, 'boolean');
    assert.deepEqual(captured.arrayTypes, ['Float64Array', 'Uint8Array', 'Uint32Array']);
    assert(captured.sampleLengths[0] > 0);
    assert(captured.sampleLengths.every(n => n === captured.sampleLengths[0]));
    assert.deepEqual(captured.enriched, captured.original,
      'new physical observations cannot double count game actions in existing metrics');
    assert(captured.events.every((e, i) => i === 0 || e.t >= captured.events[i - 1].t));

    await page.locator('#export-traces-btn').click();
    await page.waitForFunction(() => !document.getElementById('export-traces-file').hidden);
    const exported = await page.evaluate(async () => {
      const response = await fetch(document.getElementById('export-traces-file').href);
      return response.json();
    });
    const saved = exported[0];
    for (const key of ['sampleT', 'sampleX', 'sampleY', 'sampleSourceT', 'sampleTrusted', 'sampleMergeCount']) {
      assert(Array.isArray(saved[key]), key + ' exports as an array');
    }
    assert.deepEqual(saved.events, captured.events);
    assert(saved.sampleMergeCount.every(n => Number.isInteger(n) && n > 0));
    assert(saved.sampleTrusted.every(n => n === 0 || n === 1));
    if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(exported));
    const before = await page.evaluate(() => trace.events.length);
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await first.click({ button: 'right' });
    assert.equal(await page.evaluate(() => trace.events.length), before, 'post-game input is excluded');
    assert.deepEqual(errors, []);
    console.log('trace capture: physical right transitions, source clocks, interruption journal, storage/export, and unchanged worker metrics passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
