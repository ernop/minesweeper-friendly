'use strict';
// Minesweeper problems page, only on the permanent test origin in an isolated
// profile: the start ring, the preview and its cancel, the start square
// opening by itself after one second, solving by opening the answer squares,
// a mine, the 1.5 click (flag with the right button, chord with the left while
// it is held), an interruption, Esc, the saved attempts, the profile and
// history, the square size preference, and the backup round trip.
//
// Usage: node tests/problems-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM [SCREENSHOT_DIR]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2]);

const ORIGIN = 'http://127.0.0.1:8099/';
const screenshots = process.argv[4];

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const shot = async (name) => {
      if (screenshots) await page.screenshot({ path: path.join(screenshots, 'problems-' + name + '.png'), fullPage: true });
    };

    await page.goto(ORIGIN + 'problems.html');
    await page.waitForSelector('#problems-start:not([hidden])');
    assert.equal(await page.textContent('#problems-start-set'), 'Start 20 problems');
    const classCount = await page.evaluate(() => Object.keys(bank.classes).length);
    assert.equal(await page.locator('#problems-profile-ladders .problems-ladder').count(), classCount, 'one ladder per rule');
    assert.equal(await page.locator('#problems-profile-ladders .problems-ladder-label[data-kind="you"]').count(), 0,
      'no mark of yours before any attempt');
    await shot('home-empty');

    await page.check('#problems-cell-size input[value="16"]');
    await page.waitForFunction(() => new Promise((resolve) => {
      const request = problemDb.transaction(PREFERENCE_STORE).objectStore(PREFERENCE_STORE).get('cellPx');
      request.onsuccess = () => resolve(request.result === 16);
    }));
    await page.reload();
    await page.waitForSelector('#problems-start:not([hidden])');
    assert.equal(await page.isChecked('#problems-cell-size input[value="16"]'), true, 'the square size is kept');
    await page.check('#problems-cell-size input[value="24"]');

    const center = (cell) => page.evaluate((i) => {
      const r = squareElements[i].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, cell);
    const moveTo = async (cell) => {
      const p = await center(cell);
      await page.mouse.move(p.x, p.y, { steps: 4 });
    };
    const phase = () => page.evaluate(() => (live === null ? null : live.phase));
    const waitPhase = (wanted) => page.waitForFunction((w) => live !== null && live.phase === w, wanted);
    const openStart = async () => {
      const start = await page.evaluate(() => live.problem.start);
      await moveTo(start);
      await waitPhase('preview');
      const shownAt = Date.now();
      await waitPhase('running');
      assert.ok(Date.now() - shownAt >= 900, 'the start square opens after the one-second preview');
      return start;
    };
    const click = async (cell, button = 'left') => {
      await moveTo(cell);
      await page.mouse.down({ button });
      await page.mouse.up({ button });
    };
    const savedAttempts = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = problemDb.transaction(ATTEMPT_STORE).objectStore(ATTEMPT_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

    await page.click('#problems-start-set');
    await page.waitForSelector('#problems-play:not([hidden])');
    assert.equal(await phase(), 'waiting');
    assert.equal(await page.locator('#problems-start-ring').isVisible(), true, 'the ring shows where to rest');
    assert.equal(await page.locator('#board .cell.revealed').count(), 0, 'the board stays covered until the cursor rests');
    assert.equal(await page.locator('#problems-focus-box').isVisible(), true, 'the focus box shows where to look');
    const boxHolds = await page.evaluate(() => {
      const box = document.getElementById('problems-focus-box').getBoundingClientRect();
      return [live.problem.start, ...live.problem.freshSafe].every((cell) => {
        const r = squareElements[cell].getBoundingClientRect();
        return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
      });
    });
    assert.equal(boxHolds, true, 'the box encloses the start square and every answer square');
    await shot('waiting');

    // The preview starts over when the cursor leaves the start square.
    const firstStart = await page.evaluate(() => live.problem.start);
    await moveTo(firstStart);
    await waitPhase('preview');
    assert.ok(await page.locator('#board .cell.revealed').count() > 0, 'the preview shows the board');
    await page.mouse.move(5, 5);
    assert.equal(await phase(), 'waiting');
    assert.equal(await page.locator('#board .cell.revealed').count(), 0, 'leaving the square covers the board again');

    // Problem 1: open every answer square.
    const start = await openStart();
    assert.equal(await page.evaluate((s) => squareElements[s].classList.contains('revealed'), start), true);
    await shot('running');
    for (;;) {
      const next = await page.evaluate(() => (live.phase === 'running'
        ? live.problem.freshSafe.find((c) => !live.board.revealed[c]) : null));
      if (next === null || next === undefined) break;
      await click(next);
    }
    await page.waitForSelector('#problems-result:not([hidden])');
    let saved = await savedAttempts();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].outcome, 'solved');
    assert.equal(saved[0].protocol, 'problems-v2');
    assert.ok(saved[0].startT - saved[0].previewT >= 1000);
    assert.ok(saved[0].samples.t.length > 3 && saved[0].samples.t[0] < 0, 'cursor samples from the preview on');
    const values = await page.locator('#problems-result-values .problems-value-number').allTextContents();
    assert.match(values[0], /^\d+\.\d\d s$/, 'thinking time shown');
    assert.match(values[2], /^\d+\.\d\d s$/, 'total time shown');
    assert.equal(await page.locator('#problems-result-ladder .problems-ladder-label[data-kind="you"]').count(), 1,
      'your time sits in the ladder');
    assert.ok(await page.locator('#problems-result-ladder .problems-ladder-label[data-kind="level"]').count() > 0,
      'the skill levels sit in the ladder');
    const ladderOrder = await page.$$eval('#problems-result-ladder .problems-ladder-label',
      (labels) => labels.map((l) => ({ top: parseFloat(l.style.top), value: parseFloat(l.firstChild.textContent) }))
        .sort((a, b) => a.top - b.top).map((l) => l.value));
    assert.deepEqual(ladderOrder, [...ladderOrder].sort((a, b) => a - b), 'fastest at the top');
    assert.equal(await page.locator('#board .cell.problems-answer-safe').count(),
      await page.evaluate(() => live.problem.freshSafe.length), 'the answer squares are shown');
    await shot('result');

    // Problem 2: a mine ends the attempt.
    await page.keyboard.press('Enter');
    await waitPhase('waiting');
    assert.equal(await page.textContent('#problems-play-count'), 'Problem 2 of 20');
    await openStart();
    const mine = await page.evaluate(() => live.board.mine.findIndex((m, i) => m && !live.board.revealed[i] && !live.board.flagged[i]));
    await click(mine);
    await page.waitForSelector('#problems-result:not([hidden])');
    assert.equal(await page.textContent('#problems-play-instruction'), 'Opened a mine');

    // Problem 3: the 1.5 click. Flag the start number's last unflagged mine
    // with the right button, keep holding it, press and release the left
    // button on the number: the chord opens the number's other squares.
    await page.keyboard.press('Enter');
    await waitPhase('waiting');
    const third = await openStart();
    const plan = await page.evaluate((s) => {
      const around = bank.neighbors[s];
      return {
        mines: around.filter((n) => live.board.mine[n] && !live.board.flagged[n]),
        safe: around.filter((n) => !live.board.mine[n] && !live.board.revealed[n]),
      };
    }, third);
    for (const m of plan.mines.slice(0, -1)) await click(m, 'right');
    if (plan.mines.length > 0) {
      await moveTo(plan.mines[plan.mines.length - 1]);
      await page.mouse.down({ button: 'right' });
      assert.equal(await page.evaluate((m) => live.board.flagged[m], plan.mines[plan.mines.length - 1]), true,
        'the right press flags at once');
      await moveTo(third);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
      await page.mouse.up({ button: 'right' });
    } else {
      await click(third);
    }
    const chordState = await page.evaluate((cells) => ({
      opened: cells.every((c) => live.board.revealed[c]),
      kinds: live.actions.map((a) => a.kind),
    }), plan.safe);
    assert.equal(chordState.opened, true, 'the chord opened the number\'s other squares');
    assert.equal(chordState.kinds[chordState.kinds.length - 1], 'chord');
    if (await phase() === 'running') {
      await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    }
    await page.waitForSelector('#problems-result:not([hidden])');

    // Problem 4: switching away interrupts a running attempt.
    await page.keyboard.press('Enter');
    await waitPhase('waiting');
    await openStart();
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await page.waitForSelector('#problems-result:not([hidden])');
    assert.equal(await page.textContent('#problems-play-instruction'), 'Interrupted (tab or window changed)');

    // Problem 5: Esc stops the set; the stopped attempt is saved as such.
    await page.keyboard.press('Enter');
    await waitPhase('waiting');
    await openStart();
    await page.keyboard.press('Escape');
    await page.waitForSelector('#problems-summary:not([hidden])');
    assert.equal(await page.locator('#problems-summary-table tbody tr').count(), 5);
    saved = await savedAttempts();
    assert.deepEqual(saved.map((a) => a.outcome).slice(0, 2), ['solved', 'mine']);
    assert.equal(saved[3].outcome, 'interrupted');
    assert.equal(saved[4].outcome, 'abandoned');
    await shot('summary');

    await page.click('#problems-summary-done');
    await page.waitForSelector('#problems-profile:not([hidden])');
    assert.match(await page.textContent('#problems-history-count'), /^5 attempts saved/);
    assert.equal(await page.locator('#problems-history-table tbody tr').count(), 5);
    const timedRules = await page.evaluate(() => problemProfile(bank, attempts).filter((r) => r.medianThinkMs !== null).length);
    assert.ok(timedRules >= 1);
    assert.equal(await page.locator('#problems-profile-ladders .problems-ladder-label[data-kind="you"]').count(), timedRules,
      'every rule with a timed solve shows your median among the levels');
    await shot('home-history');

    // Last-flag drill: rest on the ring, the board appears, then the 1.5 click
    // (right press on the missing mine, hold, left press on the number).
    assert.equal(await page.textContent('#drill-stats'), 'Not tried yet.');
    await page.click('#drill-start');
    await page.waitForSelector('#problems-play:not([hidden])');
    assert.match(await page.textContent('#problems-play-count'), /^Last-flag drill 1 of 10$/);
    const drill = await page.evaluate(() => ({ start: live.problem.start, mine: live.problem.mineCell, number: live.problem.number }));
    await moveTo(drill.start);
    await waitPhase('running');
    await moveTo(drill.mine);
    await page.mouse.down({ button: 'right' });
    await moveTo(drill.number);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.mouse.up({ button: 'right' });
    await page.waitForSelector('#problems-result:not([hidden])');
    const drillValues = await page.locator('#problems-result-values .problems-value-number').allTextContents();
    assert.equal(drillValues[1], '2', 'flag and chord: two clicks');
    assert.equal(drillValues[2], 'yes', 'the 1.5 click was used');
    const drills = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = problemDb.transaction(DRILL_STORE).objectStore(DRILL_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
    assert.equal(drills.length, 1);
    assert.equal(drills[0].outcome, 'solved');
    assert.deepEqual(drills[0].actions.map((a) => [a.kind, a.gesture === true]), [['flag', false], ['chord', true]]);
    await shot('drill-result');
    await page.click('#problems-stop');
    await page.waitForSelector('#problems-summary:not([hidden])');
    await page.click('#problems-summary-done');
    await page.waitForSelector('#problems-drill:not([hidden])');
    assert.match(await page.textContent('#drill-stats'), /^1 positions tried, 1 solved; median time \d+\.\d\d s; 1\.5 click in 100% of solved positions\.$/);

    // Pointing test: press the start square, then 24 targets, missing once.
    assert.equal(await page.textContent('#pointing-count'), 'Not taken yet.');
    await page.click('#pointing-start');
    await page.waitForSelector('#problems-play:not([hidden])');
    assert.equal(await page.locator('#problems-focus-box').isVisible(), false, 'no focus box in the pointing test');
    await click(await page.evaluate(() => POINTING_START[1] * bank.width + POINTING_START[0]));
    for (let i = 0; i < 24; i++) {
      await page.waitForFunction(() => pointing !== null && pointing.phase === 'showing');
      const target = await page.evaluate(() => pointing.route[pointing.index].cell);
      assert.equal(await page.evaluate((cell) => squareElements[cell].classList.contains('pointing-target'), target), true);
      if (i === 0) await click(0);
      await click(target);
    }
    await page.waitForSelector('#problems-result:not([hidden])');
    assert.equal(await page.locator('#problems-result-ladder .problems-ladder').count(), 3, 'one travel ladder per move length');
    assert.equal(await page.locator('#problems-answer-key').isVisible(), false);
    const runs = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = problemDb.transaction(POINTING_STORE).objectStore(POINTING_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
    assert.equal(runs.length, 1);
    assert.equal(runs[0].outcome, 'complete');
    assert.equal(runs[0].targets.length, 24);
    assert.equal(runs[0].targets[0].misses.length, 1);
    await shot('pointing-result');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#problems-pointing:not([hidden])');
    assert.match(await page.textContent('#pointing-count'), /^1 complete run\. Latest:$/);
    assert.equal(await page.locator('#pointing-latest .problems-ladder').count(), 3);

    // Backup: export, empty the stores, import.
    const downloaded = page.waitForEvent('download');
    await page.click('#problems-export');
    const file = await (await downloaded).path();
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(exported.format, 'minesweeper-problems-attempts');
    assert.equal(exported.attempts.length, 5);
    assert.equal(exported.pointingRuns.length, 1);
    assert.equal(exported.drillAttempts.length, 1);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const tx = problemDb.transaction([ATTEMPT_STORE, POINTING_STORE, DRILL_STORE], 'readwrite');
      tx.objectStore(ATTEMPT_STORE).clear();
      tx.objectStore(POINTING_STORE).clear();
      tx.objectStore(DRILL_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }));
    await page.reload();
    await page.waitForSelector('#problems-history:not([hidden])');
    assert.equal(await page.textContent('#problems-history-count'), 'No attempts yet.');
    await page.setInputFiles('#problems-import', file);
    await page.waitForSelector('#problems-backup-status:not([hidden])');
    assert.match(await page.textContent('#problems-backup-status'),
      /^Imported 5 new attempts, 1 pointing runs, and 1 drill attempts; 0 were already here\.$/);
    assert.equal((await savedAttempts()).length, 5);

    assert.deepEqual(errors, []);
    console.log('problems page: ring, preview and cancel, timed opening, solve, mine, 1.5 click, interruption, Esc, '
      + 'saved attempts, profile, history, square size, last-flag drill with the 1.5 click, pointing test, backup');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
