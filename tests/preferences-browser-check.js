'use strict';
// Runs only against the permanent test origin, in an isolated browser profile.
const assert = require('node:assert/strict');
// Supply the installed Playwright module and Chromium executable as CLI arguments.
const { chromium } = require(process.argv[2]);
(async () => {
 const browser = await chromium.launch({executablePath:process.argv[3],headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8099/');
  await page.waitForFunction(()=>typeof preferenceUIReady !== 'undefined' && preferenceUIReady,{timeout:10000});

  await page.locator('[data-difficulty="expert"]').click();
  await page.selectOption('#zoom-select','40');
  await page.reload();await page.waitForFunction(()=>preferenceUIReady);
  assert.deepEqual(await page.evaluate(()=>config),{width:30,height:16,mines:99});
  assert.equal(await page.locator('#zoom-select').inputValue(),'40');
  console.log('Expert and zoom restored');
  assert.equal(await page.locator('#mode-options').isVisible(), false, 'a preset shows no mode options');
  assert.equal(await page.locator('#play-mode-select').inputValue(), '', 'while a preset is chosen the menu shows its own name');
  await page.selectOption('#play-mode-select', 'standard');
  assert.equal(await page.locator('#mode-options').isVisible(), true, 'Custom shows the mode options row');
  await page.locator('#custom-width').fill('18');await page.locator('#custom-height').fill('10');await page.locator('#custom-mines').fill('25');
  await page.locator('#custom-form button').click();
  await page.locator('#custom-mines').fill('26');
  await page.locator('#board-position-btn').click();
  if (await page.locator('#game-sidebar-button').isVisible()) await page.locator('#game-sidebar-button').click();
  await page.locator('#states-edit-btn').click();
  await page.locator('#states-add-input').fill('draft tag');
  await page.reload();await page.waitForFunction(()=>preferenceUIReady);
  assert.deepEqual(await page.evaluate(()=>config),{width:18,height:10,mines:25});
  assert.equal(await page.locator('#custom-mines').inputValue(),'26');
  assert.equal(await page.locator('#board-position-panel').isVisible(),true);
  assert.equal(await page.locator('#states-add-input').inputValue(),'draft tag');
  assert.equal(await page.locator('#states-menu').isVisible(),true);
  console.log('Custom board, draft, panels restored');
  const contextItems = () => page.evaluate(() => [...document.querySelectorAll('#play-context .context-item')]
    .filter((item) => !item.hidden).map((item) => item.textContent));
  assert.equal(await page.locator('#play-context').isVisible(), false, 'nothing on and no music measured: no line');
  await page.locator('.state-option', { hasText: 'sleepy' }).locator('input').check();
  await page.locator('.state-option label', { hasText: 'just woke up' }).click();
  assert.equal(await page.locator('#states-menu').isVisible(), true, 'checkboxes keep the menu open');
  assert.deepEqual(await contextItems(), ['sleepy', 'just woke up']);
  assert.equal(await page.locator('#play-context button').count(), 0, 'the states on are text, not buttons');
  await page.locator('.state-option', { hasText: 'inebriated' }).locator('.state-remove').click();
  assert.equal(await page.locator('#states-menu').isVisible(), true, 'a delete keeps the menu open');
  await page.locator('.state-option', { hasText: 'sleepy' }).locator('input').uncheck();
  assert.deepEqual(await page.evaluate(() => settings.playerStates.map((s) => s.name + ' ' + s.active)),
    ['sleepy false', 'just woke up true']);
  assert.deepEqual(await contextItems(), ['just woke up']);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#states-menu').isVisible(), false);
  assert.equal(await page.locator('#states-edit-btn').getAttribute('aria-expanded'), 'false');
  console.log('States show as text and change only in the menu');
  assert.equal(await page.locator('#play-mode-select').inputValue(), 'standard');
  assert.equal(await page.locator('#board-generator').isVisible(), true, 'a custom Standard game offers the generator');
  await page.selectOption('#play-mode-select', 'trial');
  assert.deepEqual(await page.evaluate(() => [settings.difficulty, settings.playMode, config]),
    ['custom', 'trial', { width: 18, height: 10, mines: 25 }], 'a mode from the menu plays on the custom board');
  assert.equal(await page.locator('#board-generator').isVisible(), false, 'trials build their boards with the default generator');
  await page.selectOption('#play-mode-select', 'standard');
  await page.evaluate(() => updateSettings({ boardGenerator: 'pink-noise' }));
  await page.locator('[data-difficulty="beginner"]').click();
  assert.deepEqual(await page.evaluate(() => [settings.difficulty, settings.playMode, gameGenerator.id, config]),
    ['beginner', 'standard', 'uniform', { width: 9, height: 9, mines: 10 }],
    'a preset is the whole choice: Standard with the default generator');
  assert.equal(await page.locator('#mode-options').isVisible(), false);
  assert.equal(await page.locator('#play-mode-select').inputValue(), '');
  await page.evaluate(() => updateSettings({ boardGenerator: 'uniform' }));
  console.log('Presets are whole choices; other modes play on the custom board');
  await page.goto('http://127.0.0.1:8099/settings.html');
  await page.waitForFunction(()=>settings !== null);
  await page.evaluate(()=>importPreferences(JSON.stringify({pathView:'progress',replayOverlays:{moves:false,mines:false,probs:true,pointless:true,purposeful:true,movement:true},gameDataSwitchCost:true,trialSpeedBucketMs:375,resultView:'scores'})));
  const prefs=await page.evaluate(()=>JSON.parse(exportPreferences()));
  // Wait for the navigation itself: evaluated on the settings page, the name is undefined.
  await Promise.all([page.waitForURL('**/index.html'),page.locator('.return-to-game').first().click()]);
  await page.waitForFunction(()=>typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
  assert.equal(await page.evaluate(()=>settings.pathView),'progress');
  assert.equal(await page.evaluate(()=>settings.gameDataSwitchCost),true);
  assert.equal(await page.locator('#result-summary').innerText().then(t=>t.startsWith('High scores')),true);
  assert.equal(await page.evaluate(()=>settings.trialSpeedBucketMs),375);
  assert.equal(await page.evaluate(()=>settings.replayOverlays.probs),true);
  console.log('Preferences import applied and kept separate');
  const before=await page.evaluate(()=>JSON.stringify(settings));
  await page.evaluate(()=>importHistory(JSON.stringify({settings:{cellSize:16,playMode:'angelic'},'9x9/10@standard':[]})));
  assert.equal(await page.evaluate(()=>settings.cellSize),40);
  assert.equal(await page.evaluate(()=>settings.playMode),'standard');
  await page.click('#export-btn',{force:true});
  await page.waitForFunction(() => document.getElementById('export-file').href.startsWith('blob:'));
  const exported=await page.evaluate(async()=>JSON.parse(await(await fetch(document.getElementById('export-file').href)).text()));
  assert(!('settings' in exported));
  assert(!('history' in prefs));
  console.log('History import/export do not transfer preferences');
  await page.evaluate(() => importPreferences(JSON.stringify({
    difficulty: 'beginner', cellSize: 28, resultView: 'game', justUniverse: false,
    replayPosition: { endedAt: null, step: 0 }, gameDataSwitchCost: false,
    panels: { ...PANEL_OPEN_DEFAULTS, motionStats: true }, pathView: 'off', replayOverlays: { ...REPLAY_OVERLAY_DEFAULTS },
  })));
  await page.reload(); await page.waitForFunction(() => preferenceUIReady);
  await page.evaluate(() => restoredAnalysisReady);
  await page.waitForFunction(() => !waitingForRestoredLayout);
  await page.locator('#board .cell').first().click();
  const mine = await page.evaluate(() => cells.findIndex((cell) => cell.mine));
  await page.locator('#board .cell').nth(mine).click();
  await page.waitForFunction(() => gameState === 'lost' && settings.replayPosition.endedAt !== null);
  assert.equal(await page.locator('#replay-controls').isVisible(), true, 'the transport shows under the finished board');
  await page.locator('#review-options-button').click();
  await page.locator('[data-path-view="progress"]').click();
  await page.locator('[data-replay-overlay="probs"]').click();
  await page.evaluate(() => {
    const input = document.getElementById('replay-slider');
    input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => !resultRanks.hasAttribute('aria-busy') && finalMotion !== null);
  const historyBefore = await page.evaluate(() => JSON.stringify(history));
  const motionCharts = await page.locator('.motion-chart').count();
  assert(motionCharts > 0, 'the finished game shows its motion charts');
  await page.reload(); await page.waitForFunction(() => preferenceUIReady);
  await page.evaluate(() => restoredAnalysisReady);
  await page.waitForFunction(() => !waitingForRestoredLayout);
  assert.equal(await page.evaluate(() => gameState), 'lost');
  assert.equal(await page.evaluate(() => replayStep), 0);
  assert.equal(await page.evaluate(() => replayEnabled), true);
  assert.equal(await page.evaluate(() => settings.pathView), 'progress');
  assert.equal(await page.evaluate(() => settings.replayOverlays.probs), true);
  assert.equal(await page.locator('#replay-controls').isVisible(), true);
  assert.equal(await page.evaluate(() => JSON.stringify(history)), historyBefore);
  assert.equal(await page.locator('.motion-chart').count(), motionCharts);
  console.log('Finished game, replay frame, path, overlays, and motion charts restored without recording another game');
  await page.evaluate(() => window.scrollTo(0, 350));
  await page.waitForFunction(() => settings.viewPosition.pageY === window.scrollY && window.scrollY > 0);
  const scrollBefore = await page.evaluate(() => settings.viewPosition.pageY);
  await page.reload(); await page.waitForFunction(() => preferenceUIReady);
  await page.evaluate(() => restoredAnalysisReady);
  await page.waitForFunction(() => !waitingForRestoredLayout);
  assert.equal(await page.evaluate(() => window.scrollY), scrollBefore);
  console.log('Page scroll restored');
  await page.locator('#replay-last').click();
  await page.waitForFunction(() => !replayEnabled && settings.replayPosition.step === replayDecisionCount());
  await page.reload(); await page.waitForFunction(() => preferenceUIReady);
  await page.evaluate(() => restoredAnalysisReady);
  await page.waitForFunction(() => !waitingForRestoredLayout);
  assert.equal(await page.evaluate(() => replayEnabled), false);
  assert.equal(await page.evaluate(() => replayStep), await page.evaluate(() => replayDecisionCount()));
  assert.equal(await page.locator('#replay-controls').isVisible(), true);
  console.log('The finished-board position survives redraw and reload');
  await page.goto('http://127.0.0.1:8099/settings.html');
  await page.waitForFunction(() => settings !== null);
  const beforePreferences = await page.evaluate(() => new Promise((resolve) => {
    const r = db.transaction(RECORD_STORE).objectStore(RECORD_STORE).getAll();
    r.onsuccess = () => resolve(JSON.stringify(r.result));
  }));
  await page.locator('#preferences-import-text').fill(JSON.stringify({ cellSize: 56 }));
  await page.locator('#preferences-import-form button').click();
  assert.equal(await page.evaluate(() => settings.cellSize), 56);
  const afterPreferences = await page.evaluate(() => new Promise((resolve) => {
    const r = db.transaction(RECORD_STORE).objectStore(RECORD_STORE).getAll();
    r.onsuccess = () => resolve(JSON.stringify(r.result));
  }));
  assert.equal(beforePreferences, afterPreferences);
  await page.locator('#preferences-import-text').fill('{"history":{}}');
  await page.locator('#preferences-import-form button').click();
  assert((await page.locator('#settings-status').innerText()).includes('unknown preference'));
  assert.equal(await page.evaluate(() => settings.cellSize), 56);
  await page.locator('#preferences-export').click();
  const preferenceExport = await page.evaluate(async () => JSON.parse(await (await fetch(document.getElementById('preferences-download').href)).text()));
  assert.equal(preferenceExport.cellSize, 56);
  assert(!('history' in preferenceExport));
  console.log('Preferences-only import/export UI leaves game history untouched');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const tx = db.transaction('userdata', 'readwrite');
    const store = tx.objectStore('userdata');
    store.delete('settings');
    store.put([{ name: 'legacy tag', active: true }], 'states');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  }));
  await page.reload(); await page.waitForFunction(() => settings !== null);
  assert.deepEqual(await page.evaluate(() => settings.playerStates), [{ name: 'legacy tag', active: true }]);
  const oldTags = await page.evaluate(() => new Promise((resolve) => {
    const r = db.transaction('userdata').objectStore('userdata').get('states'); r.onsuccess = () => resolve(r.result);
  }));
  assert.equal(oldTags, undefined);
  console.log('Existing player tags consolidated into preferences');
  assert.deepEqual(errors, []);

 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
