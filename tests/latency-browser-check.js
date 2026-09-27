'use strict';
// Latency check (about 10 seconds) that fails on any real slowdown in the
// waits a player feels. In a fresh profile on the permanent test origin (a
// server for the repository root at http://127.0.0.1:8099/) holding a
// synthetic 6,500-game history, it times page load, new game, the first click,
// a dozen more clicks, the click that shows a mine, and switching to expert,
// each as our handlers' work and as time to screen, plus the longest freeze in
// the two seconds after that game ends. Any value over
// tests/latency-budgets.json fails the run; --record appends it to
// tests/latency-history.jsonl, which tests/latency-history.js prints.
//
// node tests/latency-browser-check.js PLAYWRIGHT_CORE_DIR firefox|chromium EXECUTABLE [--record]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [playwrightDir, browserName, executablePath] = process.argv.slice(2, 5);
assert(playwrightDir && ['firefox', 'chromium'].includes(browserName) && executablePath,
  'usage: node tests/latency-browser-check.js PLAYWRIGHT_CORE_DIR firefox|chromium EXECUTABLE [--record]');
const record = process.argv.includes('--record');
const repo = path.join(__dirname, '..');
const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, 'latency-budgets.json'), 'utf8')).budgets;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs in the page: 6,500 standard games with board positions in their action
// evidence, as in real records, so storage work that grows with history shows.
function seedHistory() {
  let state = 0x9e3779b9;
  const int = (low, high) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return low + (state % (high - low + 1));
  };
  const now = Date.now();
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  for (const [key, width, height, mines, count] of [['9x9/10@standard', 9, 9, 10, 1950],
    ['16x16/40@standard', 16, 16, 40, 2600], ['30x16/99@standard', 30, 16, 99, 1950]]) {
    for (let i = 0; i < count; i++) {
      const endedAt = now - (count - i) * 1500000;
      const win = int(0, 9) < 7;
      const revealed = [];
      for (let cell = 0; cell < width * height; cell += 2) revealed.push([cell, int(0, 4)]);
      tx.objectStore(RECORD_STORE).put({ endedAt, outcome: win ? 'win' : 'loss', timeMs: int(20000, 200000),
        bv3: int(20, 180), clicks: int(20, 250), wastedClicks: int(0, 8), misclicks: 0, flagsPlaced: int(0, mines),
        flagsRemoved: 0, mousePathPx: int(2000, 40000), states: [], justice: 0, justiceEnabled: true,
        playMode: 'standard', maxAdjacent: int(3, 6), zeroCount: int(10, 90), islandCount: int(3, 30), largestIsland: int(2, 12),
        actionEvaluations: [{ version: 'action-evaluation-v1', action: 'reveal', actionNumber: int(1, 90), atMs: 1000,
          selected: [0], result: win ? 'continued' : 'death', mistakes: ['chose-higher-risk'],
          evidence: { playMode: 'standard', chosenRisk: 0.3, bestRisk: 0.2 }, alternatives: [], choices: [],
          position: { width, height, mines, revealed, flagged: [] } }] }, [key, endedAt]);
    }
  }
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

// Runs in the page, per click: `work`, how long the game's own handlers ran
// (from the first listener to the last, including the click event that
// starts a new game), which only our code affects; and `ms`, from the input
// event to the first task after the next frame, what the player sees, which
// also includes up to one 60 Hz frame of waiting. Plus every gap over 50ms in
// a 10ms timer (a freeze).
function instrument() {
  const probe = { clicks: [], freezes: [] };
  window.__latency = probe;
  let current = null;
  for (const type of ['mouseup', 'contextmenu']) {
    window.addEventListener(type, (event) => {
      current = null;
      if (type === 'mouseup' && event.button !== 0) return;
      if (!event.target.closest || !event.target.closest('#board, #top-panel, #difficulty-tabs')) return;
      current = { at: event.timeStamp, start: performance.now() };
      probe.clicks.push(current);
    }, true);
    window.addEventListener(type, () => {
      if (current === null) return;
      const entry = current;
      entry.end = performance.now();
      requestAnimationFrame(() => setTimeout(() => { entry.ms = performance.now() - entry.at; }, 0));
    });
  }
  window.addEventListener('click', () => { if (current !== null) current.end = performance.now(); });
  let previous = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - previous > 50) probe.freezes.push({ at: previous, ms: now - previous });
    previous = now;
  }, 10);
}

async function main() {
  const browser = await require(playwrightDir)[browserName].launch({ executablePath, headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    const ready = async () => {
      await page.waitForFunction(() => !document.documentElement.classList.contains('game-booting')
        && document.readyState === 'complete', null, { timeout: 60000 });
      return page.evaluate(() => performance.now());
    };
    await page.goto('http://127.0.0.1:8099/');
    await ready();
    await page.evaluate(seedHistory);
    await page.evaluate(() => updateSettings({ difficulty: 'intermediate', justUniverse: true }));
    await page.reload();
    const startupMs = await ready();
    await page.evaluate(instrument);
    // A fixed board: every new game uses the same seed.
    await page.evaluate(() => { GameRandom.createSeed = () => '6d1f0c2a9b8e47f3a5c4d2e1f0a9b8c7'; });

    const kinds = [];
    const center = (selector) => page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }, selector);
    const cellCenter = (index) => page.evaluate((i) => {
      const r = cellElements[i].getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }, index);
    const click = async ([x, y], kind, button = 'left') => {
      await page.mouse.move(x, y, { steps: 3 });
      await page.mouse.down({ button });
      await sleep(40);
      await page.mouse.up({ button });
      kinds.push(kind);
      await sleep(120);
    };
    const board = () => page.evaluate(() => ({ state: gameState, width: config.width, height: config.height,
      cells: cells.map((c, i) => ({ i, revealed: c.revealed, flagged: c.flagged, mine: c.mine, adjacent: c.adjacent })) }));
    const firstClick = async () => {
      const b = await board();
      await click(await cellCenter(Math.floor(b.height / 2) * b.width + Math.floor(b.width / 2)), 'first');
    };
    // Unopened cells next to opened ones: safe ones to open, mines to flag.
    const frontier = (b) => b.cells.filter((c) => !c.revealed && !c.flagged && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
      const x = c.i % b.width + dx;
      const y = Math.floor(c.i / b.width) + dy;
      return x >= 0 && x < b.width && y >= 0 && y < b.height && b.cells[y * b.width + x].revealed;
    })));

    await click(await center('#face-button'), 'new game');
    await firstClick();
    for (let n = 0; n < 12; n++) {
      const cells = frontier(await board());
      const mines = cells.filter((c) => c.mine);
      if (n % 4 === 3 && mines.length > 0) await click(await cellCenter(mines[0].i), 'flag', 'right');
      else await click(await cellCenter(cells.filter((c) => !c.mine)[0].i), 'click');
    }
    const mine = (await board()).cells.find((c) => c.mine && !c.flagged);
    await click(await cellCenter(mine.i), 'show a mine');
    assert.equal((await board()).state, 'lost', 'the mine click ended the game');
    await sleep(2000);
    await click(await center('#face-button'), 'new game');
    await click(await center('#difficulty-tabs a[data-difficulty="expert"]'), 'switch to expert');
    await firstClick();
    await sleep(300);

    const probe = await page.evaluate(() => window.__latency);
    assert.equal(probe.clicks.length, kinds.length, 'every click reached the page');
    const of = (kinds_, field) => Math.max(...probe.clicks.filter((_, i) => kinds_.includes(kinds[i]))
      .map((c) => field === 'work' ? c.end - c.start : c.ms));
    const endAt = probe.clicks[kinds.indexOf('show a mine')].at;
    const metrics = { startupMs: startupMs };
    for (const [name, kinds_] of [['newGame', ['new game']], ['firstClick', ['first']], ['click', ['click', 'flag']],
      ['showMine', ['show a mine']], ['switchToExpert', ['switch to expert']]]) {
      metrics[name + 'WorkMs'] = of(kinds_, 'work');
      metrics[name + 'Ms'] = of(kinds_, 'screen');
    }
    metrics.afterGameFreezeMs = Math.max(0, ...probe.freezes
      .filter((f) => f.at + f.ms >= endAt && f.at <= endAt + 2000).map((f) => f.ms));
    for (const name of Object.keys(metrics)) metrics[name] = Math.round(metrics[name]);
    assert.deepEqual(Object.keys(budgets).sort(), Object.keys(metrics).sort(),
      'tests/latency-budgets.json names exactly the measured metrics');
    const over = Object.entries(budgets).filter(([name, limit]) => metrics[name] > limit)
      .map(([name, limit]) => name + ' ' + metrics[name] + ' > ' + limit);
    for (const [name, value] of Object.entries(metrics)) {
      console.log(name.padEnd(20) + String(value).padStart(6) + ' ms' + ('budget ' + budgets[name]).padStart(14)
        + (value > budgets[name] ? '  OVER BUDGET' : ''));
    }
    if (record) {
      const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
      fs.appendFileSync(path.join(__dirname, 'latency-history.jsonl'), JSON.stringify({ date: new Date().toISOString(),
        commit: git('rev-parse', '--short', 'HEAD'),
        dirty: git('status', '--porcelain', '--', '.', ':!tests/latency-history.jsonl') !== '',
        browser: browserName + ' ' + browser.version(), metrics, over }) + '\n');
      console.log('recorded in tests/latency-history.jsonl');
    }
    assert.deepEqual(errors, [], 'page errors');
    assert.deepEqual(over, [], 'latency budgets exceeded');
    console.log('latency: all within budget');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
