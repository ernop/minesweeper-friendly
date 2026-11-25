'use strict';
// End-to-end browser verification of the Coaching practice modes, quick state
// sampling, Scan shield interception, wrong-flag brake, post-game Coach recap
// with replay jump, and Training page transfer + state-sample tables.
// Runs only against the permanent test origin in an isolated browser profile.
//
// Usage: node tests/coach-browser-check.js /path/to/playwright-core /path/to/chromium

const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);

const ORIGIN = 'http://127.0.0.1:8099/';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.argv[3],
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

    await page.goto(ORIGIN);
    await page.waitForFunction(() => typeof preferenceUIReady !== 'undefined' && preferenceUIReady, { timeout: 10000 });

    // 1. Preset Standard hides the coach bar completely.
    assert.equal(await page.locator('#coach-bar').isVisible(), false, 'Standard preset hides coach bar');
    assert.equal(await page.locator('#mode-options').isVisible(), false, 'Standard preset hides mode options');

    // 2. Quick state check-in lives inside edit states and reflects in play-context.
    await page.locator('#states-edit-btn').click();
    await page.locator('#state-sample-focus button', { hasText: '4' }).click();
    await page.locator('#state-sample-pace button', { hasText: 'flowing' }).click();
    const contextText = await page.locator('#play-context').innerText();
    assert.match(contextText, /focus 4\/5 · flowing/, 'sampled state renders as plain tag in play context');
    await page.locator('#state-sample-clear').click();
    assert.equal(await page.locator('#play-context').isVisible(), false, 'clearing sample hides empty play context');
    await page.locator('#state-sample-focus button', { hasText: '5' }).click();
    await page.locator('#state-sample-pace button', { hasText: 'calm' }).click();
    await page.keyboard.press('Escape');

    // 3. Coach: No-waste mode with flag cap + no-op cue.
    await page.selectOption('#play-mode-select', 'coach-no-waste');
    assert.equal(await page.locator('#coach-bar').isVisible(), true, 'Coach: No-waste shows coach bar');
    assert.equal(await page.locator('#coach-flag-budget-wrap').isVisible(), true, 'No-waste shows Flag cap');
    assert.equal(await page.locator('#coach-bail-delay-wrap').isVisible(), false, 'No-waste hides Bail cue');
    assert.match(await page.locator('#coach-state-readout').innerText(), /state: focus 5\/5 · calm/);

    // Resize custom board to 9x9/10 for fast deterministic interaction.
    await page.locator('#custom-width').fill('9');
    await page.locator('#custom-height').fill('9');
    await page.locator('#custom-mines').fill('10');
    await page.locator('#custom-form button').click();

    // Set flag cap to 0 (no flags) and confirm right-click is refused without tracing.
    await page.selectOption('#coach-flag-budget-select', '0');
    await page.locator('#board .cell').first().click({ button: 'right' });
    assert.match(await page.locator('#coach-live-cue').innerText(), /flag cap reached \(0\/0\)/);
    assert.equal(await page.evaluate(() => flagsPlaced), 0, 'flag cap 0 refuses new flag');
    assert.equal(await page.evaluate(() => coachCounters.flagBudgetRefusals), 1);

    // Switch cap back to unlimited, open board, trigger a no-op click on an open cell.
    await page.selectOption('#coach-flag-budget-select', 'unlimited');
    await page.locator('#board .cell').nth(40).click();
    const openCell = await page.evaluate(() => cells.findIndex((c) => c.revealed));
    await page.locator('#board .cell').nth(openCell).click();
    assert.match(await page.locator('#coach-live-cue').innerText(), /^no-op:/);
    assert.equal(await page.evaluate(() => coachCounters.noOpCues), 1);
    console.log('Coach: No-waste flag cap and no-op cues verified');

    // 4. Coach: Scan shield intercepts unproven click / proven mine and warns on wrong flag.
    await page.selectOption('#play-mode-select', 'coach-scan-shield');
    assert.equal(await page.locator('#coach-flag-budget-wrap').isVisible(), false);
    // Find a board position with at least one counting-safe cell and one mine cell.
    let targets = null;
    for (let attempt = 0; attempt < 25 && targets === null; attempt++) {
      if (attempt > 0) await page.keyboard.press('Space');
      await page.locator('#board .cell').nth(0).click();
      targets = await page.evaluate(() => {
        if (gameState !== 'playing') return null;
        const view = playerView();
        const clues = GuardianAngel.rawClues(view);
        const facts = GuardianAngel.proveFacts(view, clues, GuardianAngel.DEDUCTION_LEVELS[0].proof);
        const safe = [];
        const mines = [];
        for (const [cell, fact] of facts) {
          if (view.revealed[cell]) continue;
          if (fact === 2) safe.push(cell);
          else if (fact === 1) mines.push(cell);
        }
        const unproven = cells.findIndex((c, i) => !c.revealed && !facts.has(i));
        if (safe.length === 0 || (mines.length === 0 && unproven === -1)) return null;
        return { safeCell: safe[0], badCell: mines.length > 0 ? mines[0] : unproven };
      });
    }
    assert.notEqual(targets, null, 'found a board with a counting-safe move and an unproven/mined cell');

    // Click the bad cell -> Scan shield must intercept it and keep the game playing!
    await page.locator('#board .cell').nth(targets.badCell).click();
    assert.equal(await page.evaluate(() => gameState), 'playing', 'Scan shield kept the practice game alive');
    assert.match(await page.locator('#coach-live-cue').innerText(), /^shield saved:/);
    assert.equal(await page.evaluate(() => coachCounters.shieldSaves), 1);

    // Place a wrong flag on the counting-safe cell -> wrong-flag brake warns immediately!
    await page.locator('#board .cell').nth(targets.safeCell).click({ button: 'right' });
    assert.match(await page.locator('#coach-live-cue').innerText(), /^wrong flag/);
    assert.equal(await page.evaluate(() => coachCounters.wrongFlagWarnings), 1);

    // Unflag it, then win the board by clicking every remaining safe cell (no mines hit),
    // and verify the saved record, post-game Coach recap, and replay jump!
    await page.locator('#board .cell').nth(targets.safeCell).click({ button: 'right' });
    const remainingSafe = await page.evaluate(() =>
      cells.map((c, i) => (!c.revealed && !c.mine ? i : -1)).filter((i) => i >= 0));
    for (const idx of remainingSafe) {
      const stillPlaying = await page.evaluate(() => gameState === 'playing');
      if (!stillPlaying) break;
      const revealed = await page.evaluate((i) => cells[i].revealed, idx);
      if (!revealed) await page.locator('#board .cell').nth(idx).click();
    }
    await page.waitForFunction(() => gameState === 'won' && document.querySelector('.coach-recap') !== null,
      { timeout: 10000 });
    const recapText = await page.locator('.coach-recap').innerText();
    assert.match(recapText, /Coach: Scan shield recap/);
    assert.match(recapText, /Shield saves\s+1/);
    assert.match(recapText, /Wrong-flag warnings\s+1/);

    // Click the first replay jump chip and verify replay enters frame mode.
    const momentCount = await page.locator('.coach-moment-btn').count();
    assert.ok(momentCount >= 2, 'recap lists clickable shield-save and wrong-flag moments');
    await page.locator('.coach-moment-btn').first().click();
    assert.equal(await page.evaluate(() => replayEnabled), true, 'moment button jumped into replay frame');

    // Confirm record saved under coach key (not standard) with coach + stateSample!
    const saved = await page.evaluate(() => ({
      standardCount: (history['9x9/10@standard'] || []).length,
      coachRecords: history['9x9/10@coach-scan-shield'] || [],
    }));
    assert.equal(saved.standardCount, 0, 'Coach games never contaminate Standard history');
    assert.equal(saved.coachRecords.length, 1);
    assert.equal(saved.coachRecords[0].coach.shieldSaves, 1);
    assert.equal(saved.coachRecords[0].coach.wrongFlagWarnings, 1);
    assert.equal(saved.coachRecords[0].stateSample.focus, 5);
    assert.equal(saved.coachRecords[0].stateSample.pace, 'calm');
    console.log('Coach: Scan shield, wrong-flag brake, recap, replay jump, and separate storage verified');

    // 5. Verify Training page renders Coach drills, Transfer, and Sampled state tables!
    const now = Date.now();
    await page.evaluate(async (baseNow) => {
      const day = 86400000;
      const stdRec = (endedAt, timeMs, noOpClicks, focus, pace) => ({
        endedAt,
        outcome: 'win',
        timeMs,
        bv3: 160,
        boardChangingClicks: 200,
        noOpClicks,
        flagsPlaced: 80,
        flagChordGapMs: 240,
        moveGapMedianMs: 850,
        movesLeftHardWork: 2,
        actionEvaluations: [],
        stateSample: { sampledAt: endedAt - 60000, focus, pace },
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction([RECORD_STORE], 'readwrite');
        const store = tx.objectStore(RECORD_STORE);
        // 5 pre-coach Expert wins (2 days ago) + 10 post-coach Expert wins (after our coach game)
        for (let i = 0; i < 5; i++) {
          store.put(stdRec(baseNow - 2 * day + i * 60000, 96000, 32, 3, 'calm'),
            ['30x16/99@standard', baseNow - 2 * day + i * 60000]);
        }
        for (let i = 0; i < 10; i++) {
          store.put(stdRec(baseNow + 60000 + i * 60000, 82000, 10, 5, 'flowing'),
            ['30x16/99@standard', baseNow + 60000 + i * 60000]);
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }, now);

    await page.goto(ORIGIN + 'training.html');
    await page.waitForFunction(() => /Computed from/.test(document.getElementById('training-status').textContent),
      { timeout: 10000 });
    assert.equal(await page.locator('#training-coach').isVisible(), true);
    const coachSectionText = await page.locator('#training-coach').innerText();
    assert.match(coachSectionText, /Recommended next drill:/);
    assert.match(coachSectionText, /Practice drills played \(1 games/);
    assert.match(coachSectionText, /Coach: Scan shield/);
    assert.match(coachSectionText, /Transfer to Standard Expert/);
    assert.match(coachSectionText, /Comparing 5 pre-coach Standard Expert wins against 10 post-coach wins/);
    assert.match(coachSectionText, /Sampled state vs Standard Expert \(15 sampled games\)/);
    assert.match(coachSectionText, /focus 5\/5/);
    assert.match(coachSectionText, /flowing/);
    console.log('Training page coaching drills, transfer comparison, and state samples verified');

    assert.deepEqual(errors, [], 'no page or console errors');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
