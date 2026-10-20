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
    assert.equal(await gamePage.locator('#play-limits-use').innerText(), 'today: 0 of 2 games');
    assert.equal(await gamePage.locator('#play-limits-btn').innerText(), 'daily limits',
      'today\'s use is text in the top bar, never the link\'s label');
    assert.equal(await gamePage.locator('#top-bar #play-limits-use').count(), 1,
      'today\'s use stays in view at the top while the link is in the settings row');
    const clickCell = async (index) => {
      const cell = gamePage.locator('#board .cell').nth(index);
      await cell.click();
    };
    await clickCell(40);
    assert.equal(await gamePage.evaluate(() => gameState === 'playing' || gameState === 'won'), true);
    assert.equal(await gamePage.locator('#play-limits-use').innerText(), 'today: 1 of 2 games');
    await settingsPage.waitForFunction(() => document.querySelector(
      '#play-limit-table [data-limit="games"] .play-limit-used').textContent === '1');
    // Restarting abandons the board; the second board reaches the limit
    // when it starts and still plays on, flags and all.
    await gamePage.locator('#face-button').click();
    await clickCell(40);
    assert.equal(await gamePage.evaluate(() => gameState === 'playing' || gameState === 'won'), true,
      'the board that reaches the limit plays on');
    assert.equal(await gamePage.locator('#play-limits-use').innerText(), 'no flags: 2 of 2 games, closes at 3');
    assert.equal(await gamePage.evaluate(() => boardFlagsBlocked), false, 'a board keeps the flags it started with');

    // The default penalty: the next half-limit of boards (one, for 2) is
    // dealt without flags. A right press on a covered square is refused,
    // before and after the first click.
    await gamePage.locator('#face-button').click();
    assert.equal(await gamePage.locator('#play-limit-closed').isVisible(), false, 'no flags is not closed');
    const coveredIndex = () => gamePage.evaluate(() => cells.findIndex((cell) => !cell.revealed && !cell.mine));
    const rightClick = async (index) => {
      await gamePage.locator('#board .cell').nth(index).click({ button: 'right' });
    };
    await rightClick(0);
    assert.equal(await gamePage.evaluate(() => flagsCount), 0, 'no flag on a ready no-flags board');
    assert.equal(await gamePage.locator('#play-limits-use').evaluate((use) => use.classList.contains('refused')),
      true, 'today\u2019s use answers a refused flag');
    await shot(gamePage, 'game-no-flags-use', '#top-bar');
    await clickCell(40);
    assert.equal(await gamePage.evaluate(() => boardFlagsBlocked), true);
    await rightClick(await coveredIndex());
    assert.equal(await gamePage.evaluate(() => flagsCount), 0, 'no flag once the no-flags board is in play');
    assert.equal(await gamePage.locator('#play-limits-use').innerText(),
      'limit reached: 3 of 2 games and 1 without flags');
    // Lose on a mine beside an open number, outside any sealed pocket, so the
    // record is written: it states that flags were blocked.
    await gamePage.evaluate(() => {
      const mine = cells.findIndex((cell, index) => cell.mine
        && neighbors(index).some((n) => cells[n].revealed));
      revealCell(mine);
    });
    await gamePage.waitForFunction(() => gameState === 'lost'
      && history[modeKey()] !== undefined && history[modeKey()].at(-1).flagsBlocked === true);
    await gamePage.locator('#face-button').click();
    assert.equal(await gamePage.locator('#play-limit-closed').isVisible(), true);
    assert.match(await gamePage.locator('#play-limit-closed').innerText(),
      /Done for today\s+3 of 2 games and 1 without flags\s+new games from 4:00/);
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
    assert.equal(await rowText('games'), 'games|3|2|closed locked until 4:00 Change');
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
    assert.equal(await rowText('games'), 'games|3|1|closed locked until 4:00 Change');
    await gamePage.waitForFunction(() => document.getElementById('play-limits-use').textContent
      === 'limit reached: 3 of 1 games and 1 without flags');

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

    // The penalty: closing at once tightens, so it works any time; going
    // back to no flags first is then locked for the day.
    const penaltyLine = settingsPage.locator('#play-limit-penalty');
    assert.equal((await penaltyLine.innerText()).replace(/\s+/g, ' '), 'when a limit is reached no flags first Change');
    await penaltyLine.getByRole('button', { name: 'Change' }).click();
    await dialog.getByLabel(/closed at once/).check();
    await shot(settingsPage, 'penalty-dialog', '#play-limit-dialog');
    await dialog.getByRole('button', { name: 'Continue' }).dblclick();
    assert.equal(await dialog.evaluate((d) => d.open), true, 'a double click must not confirm the penalty');
    assert.match(await dialog.innerText(), /Confirm again[\s\S]*When a limit is reached: closed at once/);
    await dialog.getByRole('button', { name: 'Change' }).click();
    assert.equal(await dialog.evaluate((d) => d.open), false);
    assert.equal((await penaltyLine.innerText()).replace(/\s+/g, ' '),
      'when a limit is reached closed at once locked until 4:00 Change');
    await penaltyLine.getByRole('button', { name: 'Change' }).click();
    await dialog.getByLabel(/no flags first/).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    assert.match(await dialog.innerText(), /Going back to no flags first is locked: over 2m 00s played today/);
    await settingsPage.keyboard.press('Escape');

    await gamePage.bringToFront();
    await gamePage.reload();
    await gamePage.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    assert.equal(await gamePage.locator('#play-limit-closed').isVisible(), true, 'limits survive a reload');
    assert.match(await gamePage.locator('#play-limits-use').innerText(),
      /^limit reached: 2m 3\ds of 30m · 4 of 1 games$/);
    await shot(gamePage, 'game-limits-use', '#top-bar');

    // Stop time: a past one closes a ready board in another tab at once.
    const fresh = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const freshSettings = await fresh.newPage();
    const freshGame = await fresh.newPage();
    watch(freshSettings);
    watch(freshGame);
    await freshGame.goto('http://127.0.0.1:8099/');
    await freshGame.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    assert.equal(await freshGame.locator('#settings-row #play-limits-btn').innerText(), 'daily limits',
      'with no limit set the settings row still links to the limits');
    assert.equal(await freshGame.locator('#play-limits-use').isVisible(), false,
      'with no limit set there is no use to show');
    await shot(freshGame, 'game-no-limits-link', '#settings-row');
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
