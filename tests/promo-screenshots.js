'use strict';
// Retakes the README and promo screenshots into promo/ under the capture date
// (docs/implementation/verification.md, "README and promo screenshots").
// Needs the storage-writing test server on http://127.0.0.1:8099/ and
// Python 3 with Pillow.
//
//   node tests/promo-screenshots.js <playwright-core> <firefox> <history-export.json> <YYYY-MM-DD>
//
// A fresh Firefox profile imports the history export; the page clock is
// shifted to 7 minutes after the export's last game, so the default "today"
// session holds that day's real games; then one scripted Beginner win.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const [playwrightPath, firefoxPath, exportPath, captureDate] = process.argv.slice(2);
if (!captureDate || !/^\d{4}-\d{2}-\d{2}$/.test(captureDate)) {
  throw new Error('usage: node tests/promo-screenshots.js <playwright-core> <firefox> <history-export.json> <YYYY-MM-DD>');
}
const { firefox } = require(playwrightPath);

const ORIGIN = 'http://127.0.0.1:8099/';
const PROMO_DIR = path.join(__dirname, '..', 'promo');
const SESSION_AFTER_LAST_GAME_MS = 7 * 60 * 1000;
const FIRST_CLICK_INDEX = 0; // a corner opens an area about 2 times in 3 on Beginner, the center 1 in 3
// 3BV 10 to 12 at 2.35 3BV/s: 4.3 to 5.1 s, a top-tenth lifetime time at a
// strong but usual pace for the creator, so the ranks won mark it and the
// pace rows do not read as slow or record-breaking.
const MIN_BV3 = 10;
const MAX_BV3 = 12;
const BV3_PER_S = 2.35;
const MAX_ATTEMPTS = 40;
const FLAGS_WANTED = 2; // flagged, so not a no-mark game, without crowding the presses
const GAP_MIN_MS = 230;
const GAP_LOG_SIGMA = 0.6; // IQR / median of the gaps about 0.8, the creator's usual cadence spread

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gaussian = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// Lognormal gaps summing to totalMs, none under GAP_MIN_MS: the gaps above
// the floor are rescaled until the floored ones no longer add time.
function plannedGaps(count, totalMs) {
  const weights = Array.from({ length: count }, () => Math.exp(GAP_LOG_SIGMA * gaussian()));
  let scale = totalMs / weights.reduce((sum, w) => sum + w, 0);
  for (let round = 0; round < 50; round++) {
    const free = weights.filter((w) => w * scale >= GAP_MIN_MS);
    const floored = count - free.length;
    if (free.length === 0) break;
    scale = (totalMs - floored * GAP_MIN_MS) / free.reduce((sum, w) => sum + w, 0);
  }
  return weights.map((w) => Math.max(GAP_MIN_MS, w * scale));
}

function lastGameEndedAt(file) {
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  let last = 0;
  for (const records of Object.values(history)) for (const record of records) last = Math.max(last, record.endedAt);
  if (last === 0) throw new Error('no game in ' + file);
  return last;
}

const OPTIMIZE_PY = `
import sys
from pathlib import Path
from PIL import Image

raw, promo, date = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
MARGIN_PX = 8
jobs = [
    ('full-1920.png', 'win-screen-{}-full-layout.png', False),
    ('hero-2560.png', 'win-screen-{}.png', False),
    ('game-data-2560.png', 'game-data-{}.png', True),
    ('game-data-distributions-2560.png', 'game-data-distributions-{}.png', True),
    ('card-2560.png', 'game-data-card-{}.png', False),
    ('perf-charts-2560.png', 'perf-charts-{}.png', True),
    ('relationships-2560.png', 'relationship-charts-{}.png', True),
]
for source, target, pad in jobs:
    image = Image.open(raw / source).convert('RGB')
    if pad:
        corners = {image.getpixel((x, y)) for x in (0, image.width - 1) for y in (0, image.height - 1)}
        if len(corners) != 1:
            raise SystemExit(f'{source}: corners differ {corners}, no single background to pad with')
        padded = Image.new('RGB', (image.width + 2 * MARGIN_PX, image.height + 2 * MARGIN_PX), corners.pop())
        padded.paste(image, (MARGIN_PX, MARGIN_PX))
        image = padded
    out = promo / target.format(date)
    image.save(out, optimize=True)
    print(out.name, image.size, out.stat().st_size // 1024, 'KiB')
`;

async function importHistory(page, boot) {
  await page.setInputFiles('#import-file-input', exportPath);
  await page.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('imported'),
    null, { timeout: 180000 });
  console.log(await page.locator('#backup-status').textContent());
  const expected = await page.evaluate(() => Object.values(history).reduce((sum, list) => sum + list.length, 0));
  const savedCount = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = db.transaction(RECORD_STORE).objectStore(RECORD_STORE).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
  for (let waitedS = 0; (await savedCount()) < expected; waitedS++) {
    if (waitedS > 120) throw new Error('imported records not all saved after 120 s');
    await sleep(1000);
  }
  await boot();
  const loaded = await page.evaluate(() => Object.values(history).reduce((sum, list) => sum + list.length, 0));
  if (loaded !== expected) throw new Error('reload loaded ' + loaded + ' games, expected ' + expected);
}

// Only cells the game's own prover marks safe, flags only on proven mines,
// so the evaluation reads the win as played without guessing. Openings
// first, each move the nearest to the last; null when the board needs a guess.
function planProvenMoves(page) {
  return page.evaluate(({ start, flagsWanted }) => {
    const { width, height, mines } = config;
    const adjacent = cells.map((cell) => cell.adjacent);
    const mineAt = cells.map((cell) => cell.mine);
    const revealed = cells.map((cell) => cell.revealed);
    const flagged = new Set();
    const distance = (a, b) => Math.hypot(a % width - b % width, Math.floor(a / width) - Math.floor(b / width));
    const nearest = (list, from) => list.reduce((best, i) => (distance(i, from) < distance(best, from) ? i : best));
    const open = (first) => {
      const stack = [first];
      while (stack.length > 0) {
        const i = stack.pop();
        if (revealed[i]) continue;
        revealed[i] = true;
        if (adjacent[i] === 0) for (const n of Solver.neighbors(i, width, height)) if (!mineAt[n] && !revealed[n]) stack.push(n);
      }
    };
    const actions = [];
    let at = start;
    let reveals = 0;
    while (!revealed.every((shown, i) => shown || mineAt[i])) {
      const view = { width, height, mines, revealed: revealed.slice(), adjacent };
      const facts = Justice.proveFacts(view, Justice.rawClues(view));
      const safes = [];
      const certainMines = [];
      for (const [cell, fact] of facts) {
        if (fact === 2 && !revealed[cell]) safes.push(cell);
        if (fact === 1 && !flagged.has(cell)) certainMines.push(cell);
      }
      if (safes.length === 0) return null;
      if (reveals % 2 === 1 && flagged.size < flagsWanted && certainMines.length > 0) {
        const mine = nearest(certainMines, at);
        flagged.add(mine);
        actions.push({ button: 'right', index: mine });
        at = mine;
      }
      const zeros = safes.filter((i) => adjacent[i] === 0);
      at = nearest(zeros.length > 0 ? zeros : safes, at);
      actions.push({ button: 'left', index: at });
      reveals++;
      open(at);
    }
    return actions;
  }, { start: FIRST_CLICK_INDEX, flagsWanted: FLAGS_WANTED });
}

async function playScriptedWin(page) {
  const centerOf = async (index) => {
    const box = await page.locator('#board .cell').nth(index).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  let mouse = { x: 300, y: 700 };
  await page.mouse.move(mouse.x, mouse.y);
  // Each press goes down at its planned moment, so the gaps between presses
  // are the planned gaps. Between targets the mouse swings out on an arc,
  // as a hand drifts and re-aims; straight paths between neighboring
  // squares read as the slowest mouse speed in the creator's history.
  const pressAt = async (index, button, dueMs) => {
    const target = await centerOf(index);
    const goal = { x: target.x + (Math.random() - 0.5) * 6, y: target.y + (Math.random() - 0.5) * 6 };
    const from = { ...mouse };
    const length = Math.hypot(goal.x - from.x, goal.y - from.y) || 1;
    const swing = (Math.random() < 0.5 ? -1 : 1) * Math.max(length * (0.15 + Math.random() * 0.15), 30 + Math.random() * 40);
    const control = { x: (from.x + goal.x) / 2 - (goal.y - from.y) / length * swing,
      y: (from.y + goal.y) / 2 + (goal.x - from.x) / length * swing };
    const moveStart = Date.now();
    const moveMs = Math.max(50, dueMs - 35 - moveStart);
    const steps = Math.max(3, Math.round(moveMs / 25));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move((1 - u) ** 2 * from.x + 2 * (1 - u) * u * control.x + u ** 2 * goal.x,
        (1 - u) ** 2 * from.y + 2 * (1 - u) * u * control.y + u ** 2 * goal.y);
      const ahead = moveStart + moveMs * t - Date.now();
      if (ahead > 0) await sleep(ahead);
    }
    const wait = dueMs - Date.now();
    if (wait > 0) await sleep(wait);
    await page.mouse.down({ button });
    await sleep(30 + Math.random() * 25);
    // A hand drifts during the press.
    mouse = { x: goal.x + (Math.random() - 0.5) * 3, y: goal.y + (Math.random() - 0.5) * 3 };
    await page.mouse.move(mouse.x, mouse.y);
    await sleep(15);
    await page.mouse.up({ button });
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pressAt(FIRST_CLICK_INDEX, 'left', Date.now() + 400);
    const firstClickAt = Date.now();
    await sleep(150);
    if (await page.evaluate(() => gameState) !== 'playing') throw new Error('the first click did not start play');
    const bv3 = await page.evaluate(() => compute3BV());
    const actions = bv3 < MIN_BV3 || bv3 > MAX_BV3 ? null : await planProvenMoves(page);
    if (actions === null) {
      console.log('restart', attempt, bv3 < MIN_BV3 || bv3 > MAX_BV3 ? '3BV ' + bv3 : 'needs a guess');
      await page.locator('#face-button').click();
      await sleep(300);
      continue;
    }
    const totalMs = Math.max(actions.length * GAP_MIN_MS, bv3 / BV3_PER_S * 1000 - (Date.now() - firstClickAt));
    let due = Date.now();
    for (const [k, gap] of plannedGaps(actions.length, totalMs).entries()) {
      due += gap;
      await pressAt(actions[k].index, actions[k].button, due);
    }
    await page.waitForFunction(() => gameState === 'won', null, { timeout: 10000 });
    return attempt;
  }
  throw new Error('no board solvable without guessing in ' + MAX_ATTEMPTS + ' attempts');
}

async function capture(page, rawDir) {
  await page.mouse.move(8, 1072);
  await sleep(4000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await page.screenshot({ path: path.join(rawDir, 'full-1920.png') });

  await page.setViewportSize({ width: 2560, height: 1440 });
  await sleep(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  const heroClip = await page.evaluate(() => {
    const main = document.querySelector('main').getBoundingClientRect();
    const bottom = document.querySelector('.result-chart-section-boardTables').getBoundingClientRect().top;
    return { x: main.left + window.scrollX, y: main.top + window.scrollY, width: main.width, height: bottom - main.top };
  });
  await page.screenshot({ path: path.join(rawDir, 'hero-2560.png'), clip: heroClip, fullPage: true });
  const profile = page.locator('#game-sidebar .board-time-profile');
  await profile.screenshot({ path: path.join(rawDir, 'game-data-2560.png') });
  // The card overhangs the game data column at this width, so it is captured alone.
  await page.locator('#game-sidebar .game-data-row[data-measurement="bvPerSecond"]').hover();
  await page.waitForFunction(() => {
    const tip = document.querySelector('.chart-help-tip');
    return tip && !tip.hidden && tip.querySelector('.game-data-card');
  });
  await sleep(400);
  await page.locator('.chart-help-tip').screenshot({ path: path.join(rawDir, 'card-2560.png') });
  await page.mouse.move(8, 1430);
  await sleep(300);
  const distributions = page.locator('#game-sidebar .game-data-controls input[data-option="distributions"]');
  await distributions.check();
  await sleep(2500);
  await page.mouse.move(8, 1430);
  await sleep(300);
  await profile.screenshot({ path: path.join(rawDir, 'game-data-distributions-2560.png') });
  await distributions.uncheck();
  await sleep(1500);
  await page.locator('.result-chart-section-perfCharts').screenshot({ path: path.join(rawDir, 'perf-charts-2560.png') });
  await page.locator('.result-chart-section-relationships').screenshot({ path: path.join(rawDir, 'relationships-2560.png') });
}

(async () => {
  const shiftedNowMs = lastGameEndedAt(exportPath) + SESSION_AFTER_LAST_GAME_MS;
  const offsetMs = shiftedNowMs - Date.now();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-profile-'));
  const rawDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-raw-'));
  try {
    const context = await firefox.launchPersistentContext(profileDir, {
      executablePath: firefoxPath, headless: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    });
    // The same offset on every load, so a reload keeps one clock. Workers
    // read no clock, and performance.now stays real for the input trace.
    await context.addInitScript(({ offset }) => {
      const RealDate = Date;
      function ShiftedDate(...args) {
        if (!new.target) return new RealDate(RealDate.now() + offset).toString();
        return args.length === 0 ? new RealDate(RealDate.now() + offset) : new RealDate(...args);
      }
      ShiftedDate.prototype = RealDate.prototype;
      ShiftedDate.now = () => RealDate.now() + offset;
      ShiftedDate.parse = RealDate.parse;
      ShiftedDate.UTC = RealDate.UTC;
      globalThis.Date = ShiftedDate;
    }, { offset: offsetMs });
    const page = context.pages()[0];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const boot = async () => {
      await page.goto(ORIGIN);
      await page.waitForFunction(() => !document.documentElement.classList.contains('game-booting'), null, { timeout: 120000 });
    };
    await boot();
    console.log('page clock', await page.evaluate(() => new Date().toString()));
    await importHistory(page, boot);
    await page.evaluate(() => window.scrollTo(0, 0));
    const attempts = await playScriptedWin(page);
    // The win's record joins the history a frame after the win
    // (flushPendingResult), so it is read once the result view is drawn.
    await page.waitForFunction(() => document.querySelector('#game-sidebar .board-time-profile .game-data-band')
      && document.querySelector('.during-game svg')
      && document.querySelector('.result-chart-section-relationships svg')
      && document.querySelector('.result-chart-section-perfCharts svg'), null, { timeout: 120000 });
    const win = await page.evaluate(() => {
      const record = history['9x9/10@standard'].reduce((a, b) => (b.endedAt > a.endedAt ? b : a));
      return { timeMs: record.timeMs, bv3: record.bv3, boardChangingClicks: record.boardChangingClicks,
        flagsPlaced: record.flagsPlaced };
    });
    console.log('win', JSON.stringify(win), 'boards restarted', attempts - 1);
    await capture(page, rawDir);
    await context.close();
    if (errors.length > 0) throw new Error('page errors: ' + JSON.stringify(errors));
    process.stdout.write(execFileSync('python3', ['-c', OPTIMIZE_PY, rawDir, PROMO_DIR, captureDate]));
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(rawDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
