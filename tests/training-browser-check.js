'use strict';
// Training page end to end, only on the permanent test origin and in an
// isolated profile: the empty state, then a seeded synthetic Expert history
// whose summary the worker computes straight from IndexedDB, rendered with
// no page errors and with black neutral text.
//
// Usage: node tests/training-browser-check.js /path/to/playwright-core /path/to/chromium [states-screenshot.png]
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);
const Solver = require('../solver.js');
const GameRandom = require('../rng.js');

const ORIGIN = 'http://127.0.0.1:8099/';
const W = 30;
const H = 16;
const M = 99;

function neighbors(i) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = (i % W) + dx;
      const y = Math.floor(i / W) + dy;
      if ((dx || dy) && x >= 0 && x < W && y >= 0 && y < H) out.push(y * W + x);
    }
  }
  return out;
}

function threeBV(mine, adjacent) {
  const seen = new Uint8Array(W * H);
  let count = 0;
  for (let i = 0; i < W * H; i++) {
    if (mine[i] || adjacent[i] !== 0 || seen[i]) continue;
    count++;
    const stack = [i];
    while (stack.length) {
      const c = stack.pop();
      if (seen[c]) continue;
      seen[c] = 1;
      if (adjacent[c] === 0) for (const n of neighbors(c)) if (!mine[n]) stack.push(n);
    }
  }
  for (let i = 0; i < W * H; i++) if (!mine[i] && !seen[i]) count++;
  return count;
}

// A perfect-knowledge flagger: each still-covered safe cell is opened by
// flagging around a revealed neighboring number and chording it, or by a
// direct click when no number touches it. Every fourth chord is tried once
// before its flags are placed, so the budget has no-op clicks to report.
function flaggerGame(seed, endedAt, withFinalBoard) {
  const first = 0;
  const mine = Solver.randomPlacement(W, H, M, first, GameRandom.fromSeed(seed));
  const adjacent = mine.map((_, i) => neighbors(i).filter((n) => mine[n]).length);
  const open = new Uint8Array(W * H);
  const flagged = new Uint8Array(W * H);
  const events = [];
  let t = 1000;
  let clicks = 0;
  let noops = 0;
  let chords = 0;
  const flood = (start) => {
    const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      if (open[c] || flagged[c]) continue;
      open[c] = 1;
      if (adjacent[c] === 0) for (const n of neighbors(c)) if (!open[n]) stack.push(n);
    }
  };
  const input = (kind, index) => { events.push({ kind, index, t, atMs: t - 1000 }); t += 280; };
  input('lup', first);
  clicks++;
  flood(first);
  for (let c = 0; c < W * H; c++) {
    if (mine[c] || open[c]) continue;
    const number = neighbors(c).find((n) => open[n] && adjacent[n] > 0);
    if (number === undefined) {
      input('lup', c);
      clicks++;
      flood(c);
      continue;
    }
    const toFlag = neighbors(number).filter((n) => mine[n] && !flagged[n]);
    if (chords++ % 4 === 0 && toFlag.length > 0) {
      input('lup', number);
      noops++;
    }
    for (const n of toFlag) {
      input('rdown', n);
      flagged[n] = 1;
      clicks++;
    }
    input('lup', number);
    clicks++;
    for (const n of neighbors(number)) if (!open[n] && !flagged[n]) flood(n);
  }
  const record = { endedAt, outcome: 'win', timeMs: events[events.length - 1].t - 1000, bv3: threeBV(mine, adjacent),
    clicks, wastedClicks: noops, flagsPlaced: flagged.reduce((a, b) => a + b, 0), actionEvaluations: [],
    seed, firstRevealIndex: first, rngVersion: GameRandom.VERSION, boardVersion: 'uniform-first-safe-fisher-yates-v1' };
  const trace = { endedAt, mode: '30x16/99@standard', seed, rngVersion: GameRandom.VERSION,
    boardVersion: 'uniform-first-safe-fisher-yates-v1', events,
    ...(withFinalBoard ? { finalBoard: { cells: mine.map((m) => ({ mine: m })) } } : {}) };
  return { record, trace };
}

function lossRecord(endedAt, timeMs, mistakes, evidence) {
  return { endedAt, outcome: 'loss', timeMs, bv3: 170, clicks: 60, wastedClicks: 4, actionEvaluations: [
    { version: 'action-evaluation-v1', action: 'reveal', actionNumber: 60, atMs: timeMs, selected: [5],
      result: 'death', mistakes, evidence } ] };
}

function fixture() {
  const start = Date.UTC(2026, 8, 21, 17);
  const records = [];
  const traces = [];
  for (let i = 0; i < 6; i++) {
    const game = flaggerGame((i + 11).toString(16).padStart(32, '7'), start + i * 600000, i % 2 === 0);
    records.push({ ...game.record, states: i % 2 === 0 ? ['1.5 click'] : [] });
    traces.push(game.trace);
  }
  records.push(lossRecord(start + 100000, 34000, ['opened-proven-mine'], { safeAvailable: true, knowledge: 'proven-mine' }));
  records.push(lossRecord(start + 200000, 41000, [], { chosenRisk: 0.5, bestRisk: 0.5, boardProgress: 0.7 }));
  records.push(lossRecord(start + 300000, 2500, [], { boardProgress: 0.01 }));
  return { history: { '30x16/99@standard': records }, traces, records };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

    await page.goto(ORIGIN + 'training.html');
    await page.waitForFunction(() => /No saved Expert games/.test(document.getElementById('training-status').textContent));
    assert.equal(await page.locator('#training-now').isVisible(), false, 'no measured sections without Expert games');
    assert.equal(await page.locator('#training-plan').isVisible(), true, 'the plan is readable before any games');

    const { history, traces, records } = fixture();
    await page.evaluate(async ({ history, traces }) => {
      await new Promise((resolve, reject) => {
        const tx = db.transaction([RECORD_STORE, TRACE_STORE], 'readwrite');
        for (const [key, list] of Object.entries(history)) {
          for (const record of list) tx.objectStore(RECORD_STORE).put(record, [key, record.endedAt]);
        }
        for (const trace of traces) tx.objectStore(TRACE_STORE).put(trace);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }, { history, traces });
    await page.reload();
    await page.waitForFunction(() => /Computed from/.test(document.getElementById('training-status').textContent));

    assert.match(await page.locator('#training-status').innerText(), /Computed from 9 saved Expert games/);
    const bestMs = Math.min(...records.filter((r) => r.outcome === 'win').map((r) => r.timeMs));
    const cards = await page.locator('.training-card').allInnerTexts();
    assert.equal(cards.length, 7);
    assert.match(cards[0], new RegExp((bestMs / 1000).toFixed(3).replace('.', '\\.') + ' s'));
    assert.equal(await page.locator('.training-stage').count(), 4);
    assert.equal(await page.locator('.training-stage-current').count(), 1);
    const currentStage = await page.locator('.training-stage-current h3').innerText();
    assert.match(currentStage, /^1\. Stop wasting inputs/, 'deliberate no-op clicks keep stage 1 current');
    assert.equal(await page.locator('.training-plan-current').getAttribute('id'), 'training-plan-economy');
    const budget = await page.locator('#training-budget').innerText();
    assert.match(budget, /Replayed 6 of the latest 6 wins from their saved inputs\./,
      'seed-rebuilt and saved-final-board traces both replay');
    assert.match(budget, /chord that opened two or more cells/);
    assert.match(budget, /click on a number still missing a flag/);
    assert.match(budget, /removable inputs/);
    const stages = await page.locator('#training-stages').innerText();
    assert.match(stages, /games reaching 20 s that are won/);
    assert.match(stages, /75%/, '6 wins among 8 games that reached 20 s');
    assert.match(stages, /50%/, 'one of two classified run losses had a safe move');
    assert.ok(await page.locator('#training-weeks tbody tr').count() >= 1);
    const openings = await page.locator('#training-openings').innerText();
    assert.match(openings, /first click in a corner\s+100%\s+6/, 'all six wins started in the top-left corner');
    assert.match(openings, /won after an opening\s+100%/);
    assert.equal(await page.locator('.training-state').count(), 1);
    const states = await page.locator('.training-state').innerText();
    assert.match(states, /^1\.5 click\s*1 day, 6 blocks/, 'three wins with the state alternate with three without');
    assert.match(states, /chords one flag short, per game/);
    assert.match(states, /Block rule: 3 of the 4 block pairs it needs so far/);
    if (process.argv[4]) await page.locator('#training-states').screenshot({ path: process.argv[4] });

    const nonBlack = await page.evaluate(() => {
      const offenders = [];
      for (const element of document.querySelectorAll('main *')) {
        if (element.closest('a') || element.closest('.training-error')) continue;
        const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== '');
        if (!ownText || element.getClientRects().length === 0) continue;
        const color = getComputedStyle(element).color;
        if (color !== 'rgb(0, 0, 0)') offenders.push(element.tagName + ' ' + color + ' ' + element.textContent.slice(0, 40));
      }
      return offenders;
    });
    assert.deepEqual(nonBlack, [], 'neutral text is pure black');

    assert.deepEqual(errors, []);
    await page.route('**/index.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><title>game</title>' }));
    await Promise.all([page.waitForURL('**/index.html'), page.keyboard.press('Escape')]);
    console.log('training page: empty state, worker summary from IndexedDB, stages, budget, weeks, states compared, black text, Esc returns');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
