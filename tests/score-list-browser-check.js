'use strict';
// Full score lists and old games (docs/product/rankings.md, "Full lists and
// old games"), in a fresh profile on the test origin with a synthetic history
// of about 1,950 Beginner games and two real wins played with the mouse: a
// rank table opens its full list on the page's game, with the default
// columns; sorting and the column choices change it and are remembered; a
// game without a saved replay stays shut with a status line; a real win opens
// as an old game compared as of now, with its way back to the list, which a
// reload keeps; a game saved without its final board stays shut; a new game
// leaves the old game. Prints how long the list took to open.
//
//   node tests/score-list-browser-check.js <playwright-core> <chromium|firefox> <browser executable>
const assert = require('node:assert/strict');

const [playwrightPath, engine, executablePath] = process.argv.slice(2);
if (!['chromium', 'firefox'].includes(engine) || !executablePath) {
  throw new Error('usage: node tests/score-list-browser-check.js <playwright-core> <chromium|firefox> <browser executable>');
}
const ORIGIN = 'http://127.0.0.1:8099/';

// Runs in the page: Beginner games every 25 minutes up to now, 7 in 10 won,
// mostly flagged with a few no-mark wins and mixed misclick/unused-flag counts
// so score-list decimal alignment and Option F1 gating are exercised.
function seedHistory() {
  let state = 0x9e3779b9;
  const int = (low, high) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return low + (state % (high - low + 1));
  };
  const now = Date.now();
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  const count = 1950;
  for (let i = 0; i < count; i++) {
    const endedAt = now - (count - i) * 1500000;
    const win = int(0, 9) < 7;
    const noMark = i % 20 === 0;
    const flagsPlaced = noMark ? 0 : int(1, 10);
    // Keep several exact 30s / 60s times so misclickRate mixes integer ("2", "0")
    // and fractional ("4.68", "1.5") strings in the same table.
    const timeMs = i % 5 === 0 ? 30000 : int(20000, 200000);
    const misclicks = i % 7 === 0 ? 0 : int(1, 3);
    tx.objectStore(RECORD_STORE).put({ endedAt, outcome: win ? 'win' : 'loss', timeMs,
      bv3: int(20, 180), boardChangingClicks: int(20, 250), noOpClicks: int(0, 8), misclicks, flagsPlaced,
      flagsRemoved: noMark ? 0 : int(0, 2), unusedCorrectFlags: noMark ? 0 : int(0, Math.min(3, flagsPlaced)),
      mousePathPx: int(2000, 40000), states: [], guardianAngel: 0, guardianAngelEnabled: true,
      playMode: 'standard', maxAdjacent: int(3, 6), zeroCount: int(10, 90), islandCount: int(3, 30), largestIsland: int(2, 12),
      actionEvaluations: [] }, ['9x9/10@standard', endedAt]);
  }
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

(async () => {
  const browser = await require(playwrightPath)[engine].launch({ executablePath, headless: true,
    args: engine === 'chromium' ? ['--no-sandbox', '--disable-features=OverlayScrollbar'] : [] });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack));
    const ready = () => page.waitForFunction(() => preferenceUIReady
      && !document.documentElement.classList.contains('game-booting'), null, { timeout: 20000 })
      .catch((error) => { throw new Error('the page did not start; page errors: ' + JSON.stringify(errors), { cause: error }); });
    // The result of the game that ended at `endedAt` (null: the one shown)
    // is in, its rank tables drawn.
    const settled = (endedAt = null) => page.waitForFunction((ended) => renderedResult !== null
      && (ended === null || renderedResult.record.endedAt === ended) && hasBoardMeasurements(renderedResult.record)
      && document.querySelector('#result-ranks .rank-list.opens-list') !== null
      && document.querySelector('[aria-busy="true"]') === null, endedAt, { timeout: 30000 });
    await page.goto(ORIGIN);
    await ready();
    await page.evaluate(seedHistory);
    await page.evaluate(() => updateSettings({ difficulty: 'beginner', guardianAngel: false }));
    await page.reload();
    await ready();

    // A Beginner win with the mouse: one flag on a mine, then every safe square.
    const winOnce = async () => {
      await page.locator('#face-button').click();
      const press = async (index, button = 'left') => {
        const [x, y] = await page.evaluate((i) => {
          const r = cellElements[i].getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        }, index);
        await page.mouse.click(x, y, { button });
      };
      await press(40);
      await press(await page.evaluate(() => cells.findIndex((c) => c.mine)), 'right');
      for (let next = 0; next !== -1;) {
        next = await page.evaluate(() => (gameState === 'playing' ? cells.findIndex((c) => !c.mine && !c.revealed) : -1));
        if (next !== -1) await press(next);
      }
      assert.equal(await page.evaluate(() => gameState), 'won');
      await settled();
      return page.evaluate(() => renderedResult.record.endedAt);
    };
    const olderWin = await winOnce();
    const latestWin = await winOnce();

    // The lifetime table opens its full list, on the page's game.
    const lifetime = page.locator('#result-ranks .rank-list.opens-list').filter({
      has: page.locator('h4 .rank-list-open', { hasText: /^lifetime$/ }) });
    assert.equal(await lifetime.count(), 1, 'the lifetime table is a button');
    assert.equal(await page.locator('#result-ranks .rank-list.opens-list').filter({
      has: page.locator('h4', { hasText: /streak/ }) }).count(), 0, 'streak tables do not open');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const openMs = await page.evaluate(() => {
      const box = [...document.querySelectorAll('#result-ranks .rank-list.opens-list')]
        .find((list) => list.querySelector('h4').textContent === 'lifetime');
      const start = performance.now();
      box.click();
      return performance.now() - start;
    });
    const list = await page.evaluate(() => ({
      open: document.getElementById('score-list').open,
      title: document.getElementById('score-list-title').textContent,
      count: document.getElementById('score-list-count').textContent,
      rows: document.querySelectorAll('#score-list-scroll tbody tr').length,
      wins: history[modeKey()].filter((r) => r.outcome === 'win').length,
      heads: [...document.querySelectorAll('#score-list-scroll thead th')].map((th) => th.textContent.replace(/[\u25b2\u25bc]/, '')),
      focused: document.activeElement.matches('#score-list-scroll tbody tr.me'),
      me: [...document.querySelectorAll('#score-list-scroll tbody tr.me')].map((tr) => scoreListShown.rows[tr.sectionRowIndex].record.endedAt),
      scrollY: window.scrollY,
    }));
    assert.equal(list.open, true, 'the list opens');
    assert.equal(list.title, 'lifetime');
    assert(list.wins > 1000, 'the synthetic history is this board\u2019s');
    assert.equal(list.rows, list.wins, 'the list holds every win');
    assert.equal(list.count, list.wins.toLocaleString('en-US') + ' wins');
    assert.deepEqual(list.heads, ['#', 'time (s)', 'date', 'age', '3BV/s', 'efficiency (%)', '3BV'],
      'the default columns put units in headers');
    assert.deepEqual(list.me, [latestWin], 'the page\u2019s game is marked');
    assert.equal(list.focused, true, 'the page\u2019s game has focus');
    assert.equal(list.scrollY, scrollBefore, 'opening the list leaves the page where it was');

    // No outer dialog scrollbars and no spurious horizontal table scrollbar
    // with the default columns.
    const layout = await page.evaluate(() => {
      const dlg = document.getElementById('score-list');
      const scroll = document.getElementById('score-list-scroll');
      const heads = [...document.querySelectorAll('#score-list-scroll thead th')];
      const timeHead = heads.find((th) => th.querySelector('[data-column="time"]'));
      const arrow = timeHead.querySelector('.score-list-arrow');
      const unit = timeHead.querySelector('.score-list-unit');
      return {
        dialogOverflowX: dlg.scrollWidth - dlg.clientWidth,
        dialogOverflowY: dlg.scrollHeight - dlg.clientHeight,
        scrollOverflowX: scroll.scrollWidth - scroll.clientWidth,
        arrowLeftOfUnit: arrow.getBoundingClientRect().right <= unit.getBoundingClientRect().left,
        widthsBefore: heads.map((th) => th.getBoundingClientRect().width),
      };
    });
    assert(layout.dialogOverflowX <= 0 && layout.dialogOverflowY <= 0,
      'dialog has no outer scrollbars: ' + JSON.stringify(layout));
    assert(layout.scrollOverflowX <= 0,
      'table scroll box has no spurious horizontal scrollbar: ' + JSON.stringify(layout));
    assert.equal(layout.arrowLeftOfUnit, true, 'sort arrow sits on the left of the column header');

    // Sorting: best first, then reversed, remembered, without moving column widths.
    // The first rows' cells under a header (age's header spans two cells).
    const column = (id) => page.evaluate((columnId) => {
      const heads = [...document.querySelectorAll('#score-list-scroll thead th')];
      const head = heads.findIndex((th) => th.querySelector('[data-column="' + columnId + '"]'));
      const at = heads.slice(0, head).reduce((cells, th) => cells + th.colSpan, 0);
      return [...document.querySelectorAll('#score-list-scroll tbody tr')].slice(0, 6)
        .map((tr) => tr.cells[at].textContent);
    }, id);
    await page.locator('#score-list .score-list-sort[data-column="bvPerSecond"]').click();
    const widthsAfterSort = await page.evaluate(() => [...document.querySelectorAll('#score-list-scroll thead th')]
      .map((th) => th.getBoundingClientRect().width));
    layout.widthsBefore.forEach((w, idx) => assert(Math.abs(w - widthsAfterSort[idx]) <= 0.5,
      'sorting moves no column width at ' + idx + ': ' + w + ' vs ' + widthsAfterSort[idx]));
    const descending = (await column('bvPerSecond')).map(Number);
    assert.deepEqual(descending, descending.slice().sort((a, b) => b - a), 'the first sort puts the highest 3BV/s first');
    assert.equal(await page.locator('#score-list th[aria-sort="descending"] [data-column="bvPerSecond"]').count(), 1);
    await page.locator('#score-list .score-list-sort[data-column="bvPerSecond"]').click();
    const ascending = (await column('bvPerSecond')).map(Number);
    assert.deepEqual(ascending, ascending.slice().sort((a, b) => a - b), 'the next sort reverses it');
    assert.deepEqual(await page.evaluate(() => settings.scoreListSort), { column: 'bvPerSecond', ascending: true });

    // Column choices: multi-column layout fits on desktop with no scrollbar,
    // plain labels toggle their checkboxes, mixed decimal columns align
    // integer parts vertically (including bold tr.me), and Option F1 leaves
    // no-mark wins blank in flag-rate columns.
    await page.locator('#score-list-columns-button').click();
    assert.equal(await page.locator('#score-list-choices').isVisible(), true);
    const choicesBox = await page.evaluate(() => {
      const box = document.getElementById('score-list-choices');
      return { overflowX: box.scrollWidth - box.clientWidth, overflowY: box.scrollHeight - box.clientHeight };
    });
    assert(choicesBox.overflowX <= 0 && choicesBox.overflowY <= 0,
      'multi-column chooser fits without scrollbars on desktop: ' + JSON.stringify(choicesBox));
    // Clicking the plain label text toggles the checkbox.
    await page.locator('#score-list-choices label.score-list-choice-label', { hasText: /^zeros$/ }).click();
    assert.equal(await page.locator('#score-list-choices input[data-column="zeroCount"]').isChecked(), true,
      'clicking a non-help column label toggles its checkbox');
    await page.locator('#score-list-choices input[data-column="misclickRate"]').check();
    await page.locator('#score-list-choices input[data-column="flagRate"]').check();
    const alignCheck = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('#score-list-scroll thead th')];
      const cellIndexOf = (id) => {
        const h = heads.findIndex((th) => th.querySelector('[data-column="' + id + '"]'));
        return heads.slice(0, h).reduce((cells, th) => cells + th.colSpan, 0);
      };
      const intRightOf = (cell) => {
        const range = document.createRange();
        const node = cell.firstChild;
        const text = node.textContent;
        const dot = text.indexOf('.');
        range.setStart(node, 0);
        range.setEnd(node, dot === -1 ? text.length : dot);
        return range.getBoundingClientRect().right;
      };
      const rows = [...document.querySelectorAll('#score-list-scroll tbody tr')];
      const misAt = cellIndexOf('misclickRate');
      const effAt = cellIndexOf('efficiency');
      const flagAt = cellIndexOf('flagRate');
      const misSample = rows.slice(0, 40).map((tr) => tr.cells[misAt]);
      const misTexts = misSample.map((td) => td.textContent);
      const misRights = misSample.map(intRightOf);
      const meRow = rows.find((tr) => tr.classList.contains('me'));
      const effSample = [meRow, ...rows.slice(0, 20)].map((tr) => tr.cells[effAt]);
      const effRights = effSample.map(intRightOf);
      const noMarkFlagTexts = rows
        .filter((_, idx) => scoreListShown.rows[idx].record.flagsPlaced === 0)
        .map((tr) => tr.cells[flagAt].textContent);
      return {
        misTexts,
        misHasUnit: misTexts.some((t) => t.includes('/min')),
        misHasIntAndDec: misTexts.some((t) => !t.includes('.')) && misTexts.some((t) => t.includes('.')),
        misSpread: Math.max(...misRights) - Math.min(...misRights),
        effSpread: Math.max(...effRights) - Math.min(...effRights),
        noMarkCount: noMarkFlagTexts.length,
        noMarkAllBlank: noMarkFlagTexts.every((t) => t === ''),
      };
    });
    assert.equal(alignCheck.misHasUnit, false, 'cells omit the unit already written in the header');
    assert.equal(alignCheck.misHasIntAndDec, true, 'sample includes both integer and decimal misclick rates');
    assert(alignCheck.misSpread <= 0.5, 'mixed integer/decimal ones digits align vertically: ' + alignCheck.misSpread);
    assert(alignCheck.effSpread <= 0.5, 'bold me-row aligns vertically with regular rows: ' + alignCheck.effSpread);
    assert(alignCheck.noMarkCount > 0 && alignCheck.noMarkAllBlank,
      'no-mark wins leave flagRate blank: ' + JSON.stringify(alignCheck));
    await page.locator('#score-list-choices input[data-column="misclickRate"]').uncheck();
    await page.locator('#score-list-choices input[data-column="flagRate"]').uncheck();
    await page.locator('#score-list-choices input[data-column="efficiency"]').uncheck();
    await page.locator('#score-list-choices input[data-column="bvPerSecond"]').uncheck();
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#score-list-scroll thead th')]
      .map((th) => th.textContent.replace(/[\u25b2\u25bc]/, ''))), ['#', 'time (s)', 'date', 'age', '3BV', 'zeros']);
    assert.deepEqual(await page.evaluate(() => settings.scoreListSort), { column: 'time', ascending: true });
    assert.deepEqual(await page.evaluate(() => [settings.scoreListColumns.zeroCount, settings.scoreListColumns.efficiency]),
      [true, false]);
    await page.locator('#score-list .score-list-sort[data-column="date"]').click();
    const dates = await column('date');
    assert.deepEqual(dates, dates.slice().sort().reverse(), 'the first date sort puts the newest first');

    // A game without a saved replay stays shut; the window stays open.
    await page.evaluate((ended) => {
      const at = scoreListShown.rows.findIndex((row) => row.record.endedAt !== ended[0] && row.record.endedAt !== ended[1]);
      document.querySelectorAll('#score-list-scroll tbody tr')[at].click();
    }, [olderWin, latestWin]);
    await page.waitForFunction(() => document.getElementById('score-list-status').textContent !== '');
    assert.equal(await page.locator('#score-list-status').textContent(), 'This game has no saved replay, so it cannot be opened.');
    assert.equal(await page.evaluate(() => document.getElementById('score-list').open), true);

    // The older real win opens as an old game, by keyboard.
    await page.evaluate((ended) => {
      const at = scoreListShown.rows.findIndex((row) => row.record.endedAt === ended);
      focusScoreRow(at === 0 ? 1 : at - 1, 'nearest');
    }, olderWin);
    const olderAt = await page.evaluate((ended) => scoreListShown.rows.findIndex((row) => row.record.endedAt === ended), olderWin);
    const keyAt = await page.evaluate(() => document.activeElement.sectionRowIndex);
    await page.keyboard.press(olderAt > keyAt ? 'ArrowDown' : 'ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.sectionRowIndex), olderAt, 'the arrow keys move between rows');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('score-list').open);
    await settled(olderWin);
    const oldGame = async () => page.evaluate(async (ended) => {
      const stored = await readStoredTrace(ended);
      return {
        state: gameState, shown: renderedResult.record.endedAt, view: settings.resultView, list: settings.reviewList,
        lead: document.querySelector('#result-summary .result-summary-lead')?.textContent,
        back: document.querySelector('#result-summary .result-summary-back')?.textContent,
        board: cells.every((cell, i) => cell.revealed === stored.finalBoard.cells[i].revealed
          && cell.mine === stored.finalBoard.cells[i].mine),
        me: [...document.querySelectorAll('#result-ranks .rank-row.me .time-cell')].map((cell) => cell.textContent),
        time: (renderedResult.record.timeMs / 1000).toFixed(3) + 's',
        replayAtEnd: Number(replaySlider.value) === Number(replaySlider.max) && Number(replaySlider.max) > 0,
      };
    }, olderWin);
    let shown = await oldGame();
    assert.equal(shown.state, 'won');
    assert.equal(shown.shown, olderWin, 'the chosen game is shown');
    assert.equal(shown.board, true, 'its finished board takes the board\u2019s place');
    assert.deepEqual([shown.lead, shown.back], ['Old game', 'back to list']);
    assert.equal(shown.view, 'review');
    assert.equal(shown.list.table, 'lifetime');
    assert(shown.me.length > 0 && shown.me.every((text) => text === shown.time),
      'the old game is "this" in its tables: ' + JSON.stringify(shown.me) + ' for ' + shown.time);
    assert.equal(shown.replayAtEnd, true, 'the replay waits at the finished board');

    // Back to the list: its sort, the old game's row focused; Esc returns.
    await page.locator('#result-summary .result-summary-back').click();
    const back = await page.evaluate(() => ({
      open: document.getElementById('score-list').open,
      focused: document.activeElement.matches('#score-list-scroll tbody tr.me')
        ? scoreListShown.rows[document.activeElement.sectionRowIndex].record.endedAt : null,
      sorted: document.querySelector('#score-list th[aria-sort] [data-column]').dataset.column,
    }));
    assert.deepEqual(back, { open: true, focused: olderWin, sorted: 'date' });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.getElementById('score-list').open);
    await settled(olderWin);
    assert.equal(await page.evaluate(() => gameState), 'won', 'Space on its row opens it again, not a new game');
    await page.locator('#result-summary .result-summary-back').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('score-list').open), false);
    assert.equal(await page.evaluate(() => renderedResult.record.endedAt), olderWin, 'Esc returns to the old game');

    // A reload brings the old game back with its way back.
    await page.reload();
    await ready();
    await settled(olderWin);
    shown = await oldGame();
    assert.deepEqual([shown.state, shown.shown, shown.lead, shown.back, shown.board], ['won', olderWin, 'Old game', 'back to list', true]);

    // A game saved without its final board stays shut.
    await page.evaluate(async (ended) => {
      const stored = await readStoredTrace(ended);
      delete stored.finalBoard;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TRACE_STORE, 'readwrite');
        tx.objectStore(TRACE_STORE).put(stored);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }, olderWin);
    await page.locator('#result-summary .result-summary-back').click();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('score-list-status').textContent !== '');
    assert.equal(await page.locator('#score-list-status').textContent(),
      'This game was saved without its final board, so it cannot be opened.');
    await page.keyboard.press('Escape');

    // A new game leaves the old game.
    await page.locator('#face-button').click();
    assert.deepEqual(await page.evaluate(() => [gameState, settings.resultView, settings.reviewList,
      document.getElementById('result-summary').textContent]), ['ready', 'game', null, '']);

    // High scores' tables open too, with no game of the page marked.
    await page.locator('#see-scores-btn').click();
    await settled(latestWin);
    await page.locator('#result-ranks .rank-list.opens-list .rank-list-open', { hasText: /^lifetime$/ }).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('score-list').open,
      document.querySelectorAll('#score-list-scroll tbody tr.me').length,
      document.activeElement === document.querySelector('#score-list-scroll tbody tr')]), [true, 0, true]);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('score lists: ' + list.rows + ' wins listed in ' + Math.round(openMs) + ' ms (' + engine
      + '); sort, columns, unopenable games, an old game by keyboard and its way back, reload, and leaving it passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
