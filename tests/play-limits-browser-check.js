'use strict';
// Daily play limits end to end on the permanent test origin with a fresh
// profile: setting a limit through both confirmations, a double click that
// must not confirm, play spans shared live between a game tab and the
// settings tab, the closed board, tightening while locked, the reached and
// two-minute locks, and persistence across a reload.
//
// Usage: node tests/play-limits-browser-check.js PLAYWRIGHT_CORE_DIR EXECUTABLE [SCREENSHOT_DIR]
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.argv[2]);
const shots = process.argv[4];

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3],
    headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    const watch = (page) => page.on('pageerror', (error) => errors.push(error.message));
    const shot = async (page, name, locator) => {
      if (shots === undefined) return;
      await (locator === undefined ? page : page.locator(locator))
        .screenshot({ path: path.join(shots, name + '.png') });
    };

    const settingsPage = await context.newPage();
    watch(settingsPage);
    await settingsPage.goto('http://127.0.0.1:8099/settings.html');
    await settingsPage.waitForSelector('#play-limit-table [data-limit="games"]');
    const row = (id) => settingsPage.locator('#play-limit-table [data-limit="' + id + '"]');
    const rowText = async (id) => (await row(id).locator('[role="cell"]').allInnerTexts())
      .map((text) => text.replace(/\s+/g, ' ')).join('|');
    assert.equal(await rowText('playMinutes'), 'play time|0s|none|Set');
    await shot(settingsPage, 'settings-no-limits', '#play-limits');

    // Setting a games limit of 2: a double click on Continue must not also
    // confirm, since the confirm button is never where Continue was.
    await row('games').getByRole('button', { name: 'Set' }).click();
    const dialog = settingsPage.locator('#play-limit-dialog');
    await dialog.locator('input').fill('2');
    await shot(settingsPage, 'dialog-step-1', '#play-limit-dialog');
    await dialog.getByRole('button', { name: 'Continue' }).dblclick();
    assert.equal(await dialog.evaluate((d) => d.open), true, 'a double click must not confirm');
    assert.equal(await rowText('games'), 'games|0|none|Set', 'a double click must not confirm');
    assert.match(await dialog.innerText(), /Confirm again[\s\S]*2 games per day/);
    await shot(settingsPage, 'dialog-step-2', '#play-limit-dialog');
    await dialog.getByRole('button', { name: 'Set limit' }).click();
    assert.equal(await dialog.evaluate((d) => d.open), false);
    assert.equal(await rowText('games'), 'games|0|2|Change');

    // The game tab sees the limit and records its boards as play spans.
    const gamePage = await context.newPage();
    watch(gamePage);
    await gamePage.goto('http://127.0.0.1:8099/');
    await gamePage.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    assert.equal(await gamePage.locator('#play-limits-btn').innerText(), 'today: 0 of 2 games');
    const clickCell = async (index) => {
      const cell = gamePage.locator('#board .cell').nth(index);
      await cell.click();
    };
    await clickCell(40);
    assert.equal(await gamePage.evaluate(() => gameState === 'playing' || gameState === 'won'), true);
    assert.equal(await gamePage.locator('#play-limits-btn').innerText(), 'today: 1 of 2 games');
    await settingsPage.waitForFunction(() => document.querySelector(
      '#play-limit-table [data-limit="games"] .play-limit-used').textContent === '1');
    // Restarting abandons the board; the second board reaches the limit
    // when it starts and still plays on.
    await gamePage.locator('#face-button').click();
    await clickCell(40);
    assert.equal(await gamePage.evaluate(() => gameState === 'playing' || gameState === 'won'), true,
      'the board that reaches the limit plays on');
    assert.match(await gamePage.locator('#play-limits-btn').innerText(), /^limit reached: 2 of 2 games$/);
    await gamePage.locator('#face-button').click();
    assert.equal(await gamePage.locator('#play-limit-closed').isVisible(), true);
    assert.match(await gamePage.locator('#play-limit-closed').innerText(),
      /Done for today\s+2 of 2 games\s+new games from 4:00/);
    await shot(gamePage, 'game-closed-board', '#game-area');
    await gamePage.locator('#play-limit-closed').click();
    await gamePage.evaluate(() => { revealCell(0); toggleFlag(1, null); });
    assert.equal(await gamePage.evaluate(() => gameState + ' ' + revealedCount + ' ' + flagsCount),
      'ready 0 0', 'a closed board cannot start');

    // Reached: raising and removing are refused; lowering is allowed.
    // Background tabs get throttled frames, which every action waits on.
    await settingsPage.bringToFront();
    await settingsPage.waitForFunction(() => document.querySelector(
      '#play-limit-table [data-limit="games"]').classList.contains('reached'));
    assert.equal(await rowText('games'), 'games|2|2|reached locked until 4:00 Change');
    await shot(settingsPage, 'settings-reached', '#play-limits');
    await row('games').getByRole('button', { name: 'Change' }).click();
    assert.match(await dialog.innerText(), /Today it can only be lowered: reached, so locked until 4:00/);
    await dialog.getByRole('button', { name: 'Remove limit' }).click();
    assert.match(await dialog.innerText(), /Removing is locked: reached, so locked until 4:00/);
    await dialog.locator('input').fill('5');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    assert.match(await dialog.innerText(), /Raising is locked/);
    await dialog.locator('input').fill('1');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    assert.match(await dialog.innerText(), /1 games per day[\s\S]*Already reached today/);
    await dialog.getByRole('button', { name: 'Set limit' }).click();
    assert.equal(await rowText('games'), 'games|2|1|reached locked until 4:00 Change');
    await gamePage.waitForFunction(() => document.getElementById('play-limits-btn').textContent
      === 'limit reached: 2 of 1 games');

    // More than two minutes of play locks raising any limit, reached or not.
    await gamePage.evaluate(() => {
      const now = Date.now();
      savePlaySpan({ startedAt: now - 200000, lastSeenAt: now - 50000, endedAt: now - 50000,
        width: 30, height: 16, mines: 99, playMode: 'standard' });
    });
    await settingsPage.waitForFunction(() => document.querySelector(
      '#play-limit-table [data-limit="expertGames"] .play-limit-used').textContent === '1');
    await row('playMinutes').getByRole('button', { name: 'Set' }).click();
    await dialog.locator('input').fill('30');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: 'Set limit' }).click();
    await row('playMinutes').getByRole('button', { name: 'Change' }).click();
    await dialog.getByRole('button', { name: 'Remove limit' }).click();
    assert.match(await dialog.innerText(), /Removing is locked: over 2m 00s played today/);
    await settingsPage.keyboard.press('Escape');
    assert.equal(await dialog.evaluate((d) => d.open), false);
    assert.equal(settingsPage.url(), 'http://127.0.0.1:8099/settings.html', 'Esc closes only the dialog');

    await gamePage.bringToFront();
    await gamePage.reload();
    await gamePage.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    assert.equal(await gamePage.locator('#play-limit-closed').isVisible(), true, 'limits survive a reload');
    assert.match(await gamePage.locator('#play-limits-btn').innerText(),
      /^limit reached: 2m 3\ds of 30m · 3 of 1 games$/);
    await shot(gamePage, 'game-limits-link', '#top-bar');

    // Stop time: a past one closes a ready board in another tab at once.
    const fresh = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const freshSettings = await fresh.newPage();
    const freshGame = await fresh.newPage();
    watch(freshSettings);
    watch(freshGame);
    await freshGame.goto('http://127.0.0.1:8099/');
    await freshGame.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    assert.equal(await freshGame.locator('#top-bar #play-limits-btn').innerText(), 'daily limits',
      'with no limit set the top bar still links to the limits');
    await shot(freshGame, 'game-no-limits-link', '#top-bar');
    await freshSettings.bringToFront();
    await freshSettings.goto('http://127.0.0.1:8099/settings.html');
    await freshSettings.waitForSelector('#play-limit-table [data-limit="stopAt"]');
    const minute = await freshSettings.evaluate(() => {
      const d = new Date(Date.now() - 60000);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    });
    const reachable = await freshSettings.evaluate(() => playDayMinuteOf(minuteOfDayAt(Date.now())) > 0);
    if (reachable) {
      await freshSettings.locator('#play-limit-table [data-limit="stopAt"] button').click();
      const freshDialog = freshSettings.locator('#play-limit-dialog');
      await freshDialog.locator('input').fill(minute);
      await freshDialog.getByRole('button', { name: 'Continue' }).click();
      await freshDialog.getByRole('button', { name: 'Set limit' }).click();
      await freshGame.waitForSelector('#play-limit-closed:not([hidden])');
      assert.match(await freshGame.locator('#play-limit-closed').innerText(), /stop time \d+:\d\d/);
    }
    await fresh.close();

    assert.deepEqual(errors, []);
    console.log('play-limits browser check passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
