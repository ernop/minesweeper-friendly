'use strict';
// Both-button chording and the 1.5 click, only on the permanent test origin
// in an isolated profile: a right press flags at once; right-press-to-flag,
// hold, left press on the number, release chords; a both-button chord that
// starts with the right button counts no wasted click; a lone right press on
// an open cell does; a both-button release over an unopened cell never reveals;
// a plain left click on a satisfied number still chords.
//
// Usage: node tests/chord-buttons-browser-check.js /path/to/playwright-core /path/to/chromium
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);

const ORIGIN = 'http://127.0.0.1:8099/';

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(ORIGIN);
    await page.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    await page.click('#difficulty-tabs a[data-difficulty="expert"]');
    // The tab keeps focus after its click; Space still deals a new game, and
    // the page does not scroll under the cursor.
    const gameBefore = await page.evaluate(() => gameSeed);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.difficulty), 'expert');
    assert.notEqual(await page.evaluate(() => gameSeed), gameBefore, 'Space on a focused tab deals a new game');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'Space does not scroll the page');

    const center = async (index) => page.evaluate((i) => {
      const r = document.querySelectorAll('#board .cell')[i].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, index);
    const moveTo = async (index) => { const p = await center(index); await page.mouse.move(p.x, p.y); };
    const counters = () => page.evaluate(() => ({ clicks: clickCount, wasted: wastedClicks, chords: chordClicks,
      flags: flagsPlaced, revealed: revealedCount, state: gameState }));

    // A number whose single adjacent mine is still covered and which still
    // touches covered safe cells: flag the mine, and the chord has something to
    // open. Chosen just before each use, because an earlier chord's cascade can
    // open a later target's cells; a new board is dealt when none is left.
    const findPlans = () => page.evaluate(() => {
      const plans = [];
      for (let n = 0; n < cells.length; n++) {
        if (!cells[n].revealed || cells[n].adjacent !== 1) continue;
        const covered = neighbors(n).filter((m) => !cells[m].revealed && !cells[m].flagged);
        const mines = covered.filter((m) => cells[m].mine);
        const safe = covered.filter((m) => !cells[m].mine);
        if (mines.length === 1 && safe.length >= 1) plans.push({ number: n, mine: mines[0], safe });
      }
      return plans;
    });
    const nextPlan = async () => {
      for (let deal = 0; deal < 40; deal++) {
        const plans = await findPlans();
        if ((await counters()).state === 'playing' && plans.length > 0) return plans[0];
        await page.keyboard.press('Space');
        await moveTo(0);
        await page.mouse.down();
        await page.mouse.up();
      }
      throw new Error('no Expert board with a single-mine number to chord in 40 deals');
    };

    const first = await nextPlan();
    const lastReason = () => page.evaluate(() => actionEvaluations[actionEvaluations.length - 1].evidence.reason);

    // A click on the number one flag short changes nothing and says why.
    await moveTo(first.number);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    assert.equal(await lastReason(), 'chord-short-of-flags', 'a chord tried before the last flag is recorded as such');

    // A right press flags at once; 1.5 click: keep holding, press left on the number, release both.
    let before = await counters();
    await moveTo(first.mine);
    await page.mouse.down({ button: 'right' });
    assert.equal(await page.evaluate((i) => cells[i].flagged, first.mine), true, 'the right press itself flags');
    await moveTo(first.number);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.mouse.up({ button: 'right' });
    let after = await counters();
    assert.ok(await page.evaluate((cellsToOpen) => cellsToOpen.every((i) => cells[i].revealed), first.safe),
      '1.5 click chords the number');
    assert.deepEqual([after.clicks - before.clicks, after.chords - before.chords, after.wasted - before.wasted],
      [2, 1, 0], 'flag + chord, nothing wasted');
    const marks = await page.evaluate(() => {
      const board = trace.events.filter((e) => e.kind === 'lup' || e.kind === 'rdown');
      return board.slice(-2).map((e) => [e.kind, e.chordGesture === true]);
    });
    assert.deepEqual(marks, [['rdown', false], ['lup', true]], 'the flag press is an input; the release is the chord');

    // Classic both-button chord started with the right button on the satisfied number.
    const second = await nextPlan();
    await moveTo(second.mine);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    before = await counters();
    await moveTo(second.number);
    await page.mouse.down({ button: 'right' });
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.mouse.up({ button: 'right' });
    after = await counters();
    assert.ok(await page.evaluate((cellsToOpen) => cellsToOpen.every((i) => cells[i].revealed), second.safe),
      'both-button chord opens the neighbors');
    assert.deepEqual([after.chords - before.chords, after.wasted - before.wasted], [1, 0],
      'the right half of the chord is not a wasted click');

    // A lone right press on an open cell is one wasted click, recorded on release.
    before = await counters();
    await moveTo(second.number);
    await page.mouse.down({ button: 'right' });
    assert.equal((await counters()).wasted, before.wasted, 'undecided while held');
    await page.mouse.up({ button: 'right' });
    assert.equal((await counters()).wasted, before.wasted + 1, 'wasted once released alone');
    assert.equal(await page.evaluate(() => actionEvaluations[actionEvaluations.length - 1].evidence.reason),
      'flagged-revealed-cell');

    // Both buttons released over an unopened safe cell never reveal it.
    const third = await nextPlan();
    const unopened = third.safe[0];
    before = await counters();
    await moveTo(unopened);
    await page.mouse.down({ button: 'left' });
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'left' });
    await page.mouse.up({ button: 'right' });
    after = await counters();
    assert.equal(await page.evaluate((i) => cells[i].revealed, unopened), false, 'no reveal from a chord gesture');
    assert.equal(after.wasted, before.wasted + 1, 'the chord attempt changed nothing');
    assert.equal(await lastReason(), 'chord-over-covered');

    // Left-click chording still works: flag the third mine, then click the number.
    await moveTo(third.mine);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    before = await counters();
    await moveTo(third.number);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    after = await counters();
    assert.ok(await page.evaluate((cellsToOpen) => cellsToOpen.every((i) => cells[i].revealed), third.safe),
      'left click on a satisfied number chords');
    assert.equal(after.chords, before.chords + 1);

    assert.deepEqual(errors, []);
    console.log('chording: right press flags; 1.5 click; both-button chord without waste; lone right press wasted; '
      + 'gesture never reveals; left-click chord kept');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
