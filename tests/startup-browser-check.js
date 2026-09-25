'use strict';
// Exercise both waits while real mouse/keyboard input is possible, using only
// the permanent test origin and a fresh browser profile.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3],
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let releaseMain;
    const mainGate = new Promise((resolve) => { releaseMain = resolve; });
    await page.route('**/game/main.js?*', async (route) => {
      await mainGate;
      await route.continue();
    });
    await page.goto('http://127.0.0.1:8099/', { waitUntil: 'commit' });
    await page.waitForFunction(() => typeof requestNewGame === 'function');
    assert.equal(await page.locator('#game-frame').isVisible(), false,
      'the first paint must not show a board that cannot accept input');
    assert.equal(await page.locator('#board .cell').count(), 0,
      'startup must not construct a dummy board');
    assert.match(await page.locator('#startup-status').innerText(), /Preparing your game/);
    await page.keyboard.press('Space');
    assert.deepEqual(errors, [], 'Space before settings load must not throw');

    await page.evaluate(() => {
      const restore = restorePreferredResult;
      restorePreferredResult = async () => {
        await new Promise((resolve) => { window.releaseResultRestore = resolve; });
        await restore();
      };
      const preferences = initGamePreferences;
      initGamePreferences = async () => {
        await preferences();
        await new Promise((resolve) => { window.releasePreferenceRestore = resolve; });
      };
    });
    releaseMain();
    await page.waitForFunction(() => typeof window.releaseResultRestore === 'function');
    assert.equal(await page.locator('#board .cell').count(), 81);
    assert.equal(await page.locator('#game-frame').isVisible(), false,
      'building the real board must not expose it while restoration is pending');
    const seed = await page.evaluate(() => gameSeed);
    const board = await page.locator('#board').boundingBox();
    await page.mouse.click(board.x + 18, board.y + 18);
    await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => ({ seed: gameSeed, state: gameState,
      revealed: revealedCount, presses: inputActionCount })),
    { seed, state: 'ready', revealed: 0, presses: 0 });

    await page.evaluate(() => window.releaseResultRestore());
    await page.waitForFunction(() => typeof window.releasePreferenceRestore === 'function');
    assert.equal(await page.locator('#game-frame').isVisible(), false,
      'the board stays concealed through preference/layout restoration');
    const before = await page.locator('#game-frame').boundingBox();
    await page.evaluate(() => window.releasePreferenceRestore());
    await page.waitForFunction(() => !document.documentElement.classList.contains('game-booting'));
    assert.equal(await page.locator('#game-frame').isVisible(), true);
    assert.equal(await page.locator('#startup-status').isVisible(), false);
    assert.equal(await page.locator('#face-button').isEnabled(), true);
    assert.equal(await page.locator('#board').getAttribute('aria-busy'), null);
    assert.deepEqual(await page.locator('#game-frame').boundingBox(), before,
      'revealing the prepared board must not move or resize it');
    await page.locator('#board .cell').first().click();
    assert(await page.evaluate(() => revealedCount > 0), 'the first visible board accepts a click');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => gameState), 'ready');
    assert.equal(await page.evaluate(() => revealedCount), 0);
    assert.notEqual(await page.evaluate(() => gameSeed), seed);
    assert.deepEqual(errors, []);
    console.log('startup: concealed before scripts, through restoration and layout; first visible board accepts input');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
