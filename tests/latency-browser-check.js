'use strict';
// Input-latency monitor. Plays seeded games through real browser input on the
// permanent test origin (a server for the repository root at
// http://127.0.0.1:8099/) in a fresh profile holding a synthetic 6,500-game
// history, and times every wait a player feels: startup, new game, first
// click, every play click, the game-ending click, the result shell, the full
// report, and main-thread stalls during play and after each game end. Any
// measurement over its budget in tests/latency-budgets.json fails the run;
// --record appends the run to tests/latency-history.jsonl, and
// tests/latency-history.js prints the recorded runs over time.
//
// node tests/latency-browser-check.js PLAYWRIGHT_CORE_DIR firefox|chromium EXECUTABLE [--record] [--quick]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [playwrightDir, browserName, executablePath] = process.argv.slice(2, 5);
const record = process.argv.includes('--record');
const quick = process.argv.includes('--quick');
assert(playwrightDir && ['firefox', 'chromium'].includes(browserName) && executablePath,
  'usage: node tests/latency-browser-check.js PLAYWRIGHT_CORE_DIR firefox|chromium EXECUTABLE [--record] [--quick]');
const repo = path.join(__dirname, '..');
const Justice = require(path.join(repo, 'justice.js'));
const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, 'latency-budgets.json'), 'utf8')).budgets;
const HISTORY_FILE = path.join(__dirname, 'latency-history.jsonl');
const ORIGIN = 'http://127.0.0.1:8099/';

// Fixed boards: GameRandom seeds replayed in order, one per new game.
const SEEDS = ['6d1f0c2a9b8e47f3a5c4d2e1f0a9b8c7', '0f9e8d7c6b5a49382716f5e4d3c2b1a0',
  '3c5e7a9b1d2f4e6a8c0b2d4f6e8a0c1e', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', '9f8e7d6c5b4a3928171605f4e3d2c1b0',
  '5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d', 'c0ffee1234567890abcdef0123456789'];
const GAMES = quick ? ['intermediate', 'expert'] : ['intermediate', 'intermediate', 'intermediate', 'expert', 'expert', 'beginner'];

let rngState = 0x2545f491;
function random() {
  rngState = (rngState + 0x6D2B79F5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quantile = (values, q) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const round = (value) => value === null ? null : Math.round(value);

// Runs in the page: a history the size of the creator's (6,500 games across
// the standard boards, 40 of them today), with action evidence carrying board
// positions like real records, written straight into the records store.
function seedHistory() {
  let state = 0x9e3779b9;
  const rand = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (low, high) => low + Math.floor(rand() * (high - low + 1));
  const hex = () => Array.from({ length: 32 }, () => int(0, 15).toString(16)).join('');
  const boards = [['9x9/10@standard', 9, 9, 10, 1950], ['16x16/40@standard', 16, 16, 40, 2600],
    ['30x16/99@standard', 30, 16, 99, 1950]];
  const now = Date.now();
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const position = (width, height, mines) => {
    const revealed = [];
    for (let cell = 0; cell < width * height; cell++) if (rand() < 0.45) revealed.push([cell, int(0, 4)]);
    return { width, height, mines, revealed, flagged: [int(0, width * height - 1)] };
  };
  // Builds before 2026-09-26 stored the whole history as one userdata value;
  // seeding either layout lets a run measure an older revision for comparison.
  const perRecord = typeof RECORD_STORE !== 'undefined';
  const tx = db.transaction(perRecord ? RECORD_STORE : 'userdata', 'readwrite');
  const whole = {};
  const store = perRecord ? tx.objectStore(RECORD_STORE)
    : { put: (record, [key]) => (whole[key] ||= []).push(record) };
  for (const [key, width, height, mines, count] of boards) {
    for (let i = 0; i < count; i++) {
      const today = key.startsWith('16x16') && i >= count - 40;
      const endedAt = today ? midnight + 3600000 + (i - count + 40) * 90000 + 7
        : now - 2 * 86400000 - (count - i) * 1500000 - int(0, 600000);
      const win = rand() < 0.7;
      const timeMs = int(width * height * 60, width * height * 400);
      const evaluations = [];
      for (let e = win ? int(0, 2) : int(1, 3); e > 0; e--) {
        evaluations.push({ version: 'action-evaluation-v1', action: 'reveal', actionNumber: int(1, 90),
          atMs: int(0, timeMs), selected: [int(0, width * height - 1)], result: 'continued',
          mistakes: ['chose-higher-risk'], evidence: { playMode: 'standard', chosenRisk: rand() / 2,
            bestRisk: rand() / 4, factsMeasured: true, oddsMeasured: true, boardProgress: rand() },
          alternatives: [], choices: [], position: position(width, height, mines) });
      }
      if (!win) evaluations[evaluations.length - 1].result = 'death';
      store.put({ endedAt, outcome: win ? 'win' : 'loss', timeMs, bv3: int(width * 2, width * height / 2),
        zini: int(width * 2, width * height / 3), hzini: int(width * 2, width * height / 3),
        clicks: int(20, 250), chordClicks: int(0, 60), wastedClicks: int(0, 8), misclicks: int(0, 2),
        flagsPlaced: int(0, mines), flagsRemoved: int(0, 3), ...(win ? { unusedCorrectFlags: int(0, 5) } : {}),
        mousePathPx: int(2000, 40000), fastclickGapMs: int(150, 600), cadenceSpread: rand() * 2,
        states: [], justice: 0, justiceEnabled: true, seed: hex(), rngVersion: GameRandom.VERSION,
        boardVersion: BoardGenerators.byId(BoardGenerators.DEFAULT_ID).version,
        justiceVersion: 'sealed-pocket-mercy-v2', maxAdjacent: int(3, 6), hasSeven: false,
        zeroCount: int(10, width * height / 3), islandCount: int(3, 30), largestIsland: int(2, 12),
        playMode: 'standard', actionEvaluations: evaluations }, [key, endedAt]);
    }
  }
  if (!perRecord) tx.objectStore('userdata').put(whole, 'history');
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(boards.reduce((n, board) => n + board[4], 0));
    tx.onerror = () => reject(tx.error);
  });
}

// Runs in the page after each load: input timing (event creation, handler
// start and end, and the first task after the next frame), a main-thread
// stall probe, and marks for the result shell and the report's completion.
function instrument() {
  const probe = { events: [], stalls: [], marks: [] };
  window.__latency = probe;
  for (const type of ['mouseup', 'contextmenu']) {
    window.addEventListener(type, (event) => {
      if (event.target.closest && event.target.closest('#board, #top-panel')) event.__handlerStart = performance.now();
    }, true);
    window.addEventListener(type, (event) => {
      if (event.__handlerStart === undefined || (type === 'mouseup' && event.button !== 0)) return;
      const entry = { timeStamp: event.timeStamp, start: event.__handlerStart, end: performance.now() };
      probe.events.push(entry);
      requestAnimationFrame(() => setTimeout(() => { entry.afterFrame = performance.now(); }, 0));
    });
  }
  let previous = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - previous > 50) probe.stalls.push({ start: previous, ms: now - previous });
    previous = now;
  }, 10);
  const mark = (name) => probe.marks.push({ name, t: performance.now() });
  new MutationObserver(() => {
    if (resultStats.querySelector('#stats-grid.immediate-stats')) mark('shell');
  }).observe(resultStats, { childList: true });
  new MutationObserver(() => mark(resultRanks.hasAttribute('aria-busy') ? 'reportBusy' : 'reportReady'))
    .observe(resultRanks, { attributes: true, attributeFilter: ['aria-busy'] });
}

async function main() {
  const playwright = require(playwrightDir);
  const browser = await playwright[browserName].launch({ executablePath, headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
    await context.addInitScript(() => {
      new MutationObserver(() => {
        if (window.__readyAt === undefined && document.documentElement
            && !document.documentElement.classList.contains('game-booting')
            && document.readyState !== 'loading') window.__readyAt = performance.now();
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const ready = () => page.waitForFunction(() => window.__readyAt !== undefined, null, { timeout: 120000 });
    await page.goto(ORIGIN);
    await ready();
    const seeded = await page.evaluate(seedHistory);
    await page.evaluate(() => updateSettings({ difficulty: 'intermediate', justUniverse: true,
      showSessionStats: true, metricsPanelCollapsed: false, showMotionStatsDuringGame: true,
      showMotionStatsAfterGame: true, sessionRateBasis: 'time', reportScope: 'full' }));
    const startups = [];
    for (let load = 0; load < 2; load++) {
      await page.reload();
      await ready();
      startups.push(await page.evaluate(() => window.__readyAt));
    }
    await page.evaluate(instrument);
    await page.evaluate((seeds) => { GameRandom.createSeed = () => seeds.shift(); }, SEEDS);

    const readState = () => page.evaluate(() => ({ state: gameState, width: config.width, height: config.height,
      mines: config.mines, cells: cells.map((c) => [c.revealed ? 1 : 0, c.flagged ? 1 : 0, c.adjacent, c.mine ? 1 : 0]) }));
    const cellCenters = () => page.evaluate(() => cellElements.map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }));
    const actions = [];
    const press = async ([x, y], button, kind, game) => {
      await page.mouse.move(x + (random() - 0.5) * 6, y + (random() - 0.5) * 6, { steps: 5 });
      await sleep(15 + random() * 25);
      await page.mouse.down({ button });
      await sleep(35 + random() * 35);
      await page.mouse.up({ button });
      actions.push({ kind, game });
    };
    const restart = async (game) => {
      const face = await page.evaluate(() => {
        const r = faceButton.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
      await press(face, 'left', 'newGame', game);
    };
    const games = [];
    let difficulty = 'intermediate';
    for (let g = 0; g < GAMES.length; g++) {
      if (GAMES[g] !== difficulty) {
        difficulty = GAMES[g];
        await page.click('#difficulty-tabs a[data-difficulty="' + difficulty + '"]');
      } else {
        await restart(g);
      }
      await sleep(400);
      let centers = await cellCenters();
      let s = await readState();
      assert.equal(s.state, 'ready', 'each seeded game starts on a fresh board');
      const firstAction = actions.length;
      for (let guard = 0; guard < 2000 && (s.state === 'ready' || s.state === 'playing'); guard++) {
        const { width, height, mines } = s;
        const n = width * height;
        if (s.state === 'ready') {
          await press(centers[Math.floor(height / 2) * width + Math.floor(width / 2)], 'left', 'first', g);
        } else {
          const view = { width, height, mines, revealed: s.cells.map((c) => c[0] === 1), adjacent: s.cells.map((c) => c[2]) };
          const facts = Justice.proveFacts(view, Justice.rawClues(view));
          const open = [];
          for (let i = 0; i < n; i++) if (!s.cells[i][0] && !s.cells[i][1]) open.push(i);
          const safe = open.filter((i) => facts.get(i) === 2);
          const provenMines = open.filter((i) => facts.get(i) === 1);
          const chordable = [];
          for (let i = 0; i < n; i++) {
            if (!s.cells[i][0] || s.cells[i][2] === 0) continue;
            const around = Justice.neighbors(i, width, height);
            if (around.filter((j) => s.cells[j][1]).length === s.cells[i][2]
                && around.some((j) => !s.cells[j][0] && !s.cells[j][1])) chordable.push(i);
          }
          const roll = random();
          if (chordable.length > 0 && roll < 0.25) await press(centers[pick(chordable)], 'left', 'chord', g);
          else if (provenMines.length > 0 && roll < 0.55) await press(centers[pick(provenMines)], 'right', 'flag', g);
          else if (safe.length > 0) await press(centers[pick(safe)], 'left', 'reveal', g);
          else {
            // Unproven clicks mostly pick a truly safe cell so games reach
            // their mid-game frontiers; one in five risks a real guess.
            const unproven = open.filter((i) => facts.get(i) !== 1);
            const lucky = unproven.filter((i) => !s.cells[i][3]);
            await press(centers[pick(random() < 0.8 && lucky.length > 0 ? lucky : unproven)], 'left', 'guess', g);
          }
        }
        await sleep(120 + random() * 100);
        s = await readState();
        if (actions[actions.length - 1].kind === 'first') centers = await cellCenters();
      }
      assert(s.state === 'won' || s.state === 'lost', 'game ' + g + ' ended');
      actions[actions.length - 1].ending = true;
      games.push({ difficulty, outcome: s.state, actions: actions.length - firstAction });
      // Look at the finished report, as a player would, before the next game.
      await page.waitForFunction(() => {
        const probe = window.__latency;
        const end = probe.events[probe.events.length - 1].timeStamp;
        const busy = probe.marks.find((m) => m.name === 'reportBusy' && m.t >= end);
        return busy !== undefined && probe.marks.some((m) => m.name === 'reportReady' && m.t >= busy.t);
      }, null, { timeout: 30000 });
      await sleep(1000);
    }
    await sleep(500);
    const probe = await page.evaluate(() => window.__latency);
    assert.equal(probe.events.length, actions.length, 'every scripted input reached a board handler');

    const inputs = actions.map((action, i) => {
      const e = probe.events[i];
      return { ...action, timeStamp: e.timeStamp, handlerMs: e.end - e.start, frameMs: e.afterFrame - e.timeStamp };
    });
    const endings = inputs.filter((input) => input.ending);
    const play = inputs.filter((input) => !input.ending && input.kind !== 'newGame' && input.kind !== 'first');
    const afterEnd = endings.map((end) => {
      const shell = probe.marks.find((m) => m.name === 'shell' && m.t >= end.timeStamp);
      const busy = probe.marks.find((m) => m.name === 'reportBusy' && m.t >= end.timeStamp);
      const done = busy && probe.marks.find((m) => m.name === 'reportReady' && m.t >= busy.t);
      const stalls = probe.stalls.filter((st) => st.start + st.ms >= end.timeStamp && st.start <= end.timeStamp + 3000);
      return { shellMs: shell.t - end.timeStamp, reportMs: done.t - end.timeStamp,
        longestStallMs: Math.max(0, ...stalls.map((st) => st.ms)) };
    });
    const playWindows = games.map((_, g) => {
      const own = inputs.filter((input) => input.game === g);
      return [own.find((input) => input.kind === 'first').timeStamp, own.find((input) => input.ending).timeStamp];
    });
    const playStalls = probe.stalls.filter((st) => playWindows.some(([from, to]) => st.start >= from && st.start + st.ms <= to));
    const frames = (list) => list.map((input) => input.frameMs);
    const metrics = {
      startupReadyMs: round(Math.max(...startups)),
      newGameMs: round(Math.max(...frames(inputs.filter((input) => input.kind === 'newGame')))),
      firstClickMs: round(Math.max(...frames(inputs.filter((input) => input.kind === 'first')))),
      clickP50Ms: round(quantile(frames(play), 0.5)),
      clickP95Ms: round(quantile(frames(play), 0.95)),
      clickMaxMs: round(Math.max(...frames(play))),
      handlerMaxMs: round(Math.max(...play.map((input) => input.handlerMs))),
      gameEndClickMs: round(Math.max(...frames(endings))),
      resultShellMs: round(Math.max(...afterEnd.map((end) => end.shellMs))),
      reportReadyMs: round(Math.max(...afterEnd.map((end) => end.reportMs))),
      gameEndLongestStallMs: round(Math.max(...afterEnd.map((end) => end.longestStallMs))),
      playStallsOver50: playStalls.length,
      playLongestStallMs: round(Math.max(0, ...playStalls.map((st) => st.ms))),
    };
    const byKind = Object.fromEntries(['reveal', 'flag', 'chord', 'guess'].map((kind) => {
      const list = frames(play.filter((input) => input.kind === kind));
      return [kind, { n: list.length, p95Ms: round(quantile(list, 0.95)), maxMs: round(list.length ? Math.max(...list) : null) }];
    }));

    const exceeded = Object.entries(budgets).filter(([name, limit]) => metrics[name] > limit)
      .map(([name, limit]) => name + ' ' + metrics[name] + ' > ' + limit);
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    const entry = { date: new Date().toISOString(), commit: git('rev-parse', '--short', 'HEAD'),
      dirty: git('status', '--porcelain') !== '', browser: browserName, browserVersion: browser.version(),
      machine: os.cpus()[0].model + ' x' + os.cpus().length, quick, historyRecords: seeded,
      games, inputs: inputs.length, metrics, byKind, exceeded };
    const previous = fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n')
      .filter(Boolean).map((line) => JSON.parse(line)).filter((run) => run.browser === browserName && run.quick === quick).at(-1) : undefined;
    console.log(browserName + ' ' + entry.browserVersion + ' at ' + entry.commit + (entry.dirty ? ' (uncommitted changes)' : '')
      + ', ' + inputs.length + ' inputs over ' + games.length + ' games (' + games.map((game) => game.difficulty + ' ' + game.outcome).join(', ') + ')');
    console.log('metric'.padEnd(24) + 'value'.padStart(8) + 'budget'.padStart(8) + (previous ? ('previous ' + previous.commit).padStart(18) : ''));
    for (const [name, value] of Object.entries(metrics)) {
      console.log(name.padEnd(24) + String(value).padStart(8) + String(budgets[name] ?? '').padStart(8)
        + (previous ? String(previous.metrics[name] ?? '').padStart(18) : '') + (value > budgets[name] ? '  OVER BUDGET' : ''));
    }
    console.log('by kind (p95/max ms): ' + Object.entries(byKind).map(([kind, v]) => kind + ' ' + v.p95Ms + '/' + v.maxMs + ' (n=' + v.n + ')').join(', '));
    if (record) {
      fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
      console.log('recorded in tests/latency-history.jsonl');
    }
    assert.deepEqual(errors, [], 'page errors during the run');
    assert.deepEqual(exceeded, [], 'latency budgets exceeded');
    console.log('latency: every measured wait is within its budget');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
