'use strict';
// Renderer-only fixtures on the permanent test origin in an isolated profile.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3],
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:8099/');
    await page.waitForFunction(() => preferenceUIReady);
    await page.evaluate(async () => {
      const now = Date.now();
      const current = { outcome: 'win', endedAt: now, timeMs: 33542,
        clicks: 105, misclicks: 1, wastedClicks: 3, fastclickGapMs: 190, mousePathPx: 980,
        flagsPlaced: 8, unusedCorrectFlags: 1, bv3: 75, zini: 49, maxAdjacent: 5, hzini: 50, islandCount: 21, zeroCount: 59,
        boardMetrics: { version: 1, workSpread: 6.5, safeCells: 100,
          zeroOpenedZeroOneCells: 60, zeroOpenedCells: 69 } };
      const groups = [
        [{ bv3: 75 }, 4, 22], [{ zini: 49 }, 7, 21],
        [{ maxAdjacent: 5 }, 132, 283], [{ hzini: 50 }, 13, 25],
        [{ boardMetrics: { version: 1, workSpread: 6.5 } }, 20, 35],
        [{ boardMetrics: { version: 1, safeCells: 100, zeroOpenedZeroOneCells: 60 } }, 1, 4],
        [{ boardMetrics: { version: 1, safeCells: 100, zeroOpenedCells: 69 } }, 2, 2],
        [{ islandCount: 21 }, 56, 137], [{ zeroCount: 59 }, 24, 50],
      ];
      const wins = groups.flatMap(([fields, rank, total], group) =>
        Array.from({ length: total - 1 }, (_, index) => ({
          ...fields, outcome: 'win', endedAt: now - (1000 + group * 1000 + index) * 864e5,
          clicks: 75 + index % 90, misclicks: index % 4, wastedClicks: index % 9,
          fastclickGapMs: 100 + index % 300, mousePathPx: 400 + index * 10,
          flagsPlaced: 8, unusedCorrectFlags: index % 4,
          timeMs: current.timeMs + (index < rank - 1 ? index - rank + 1 : index - rank + 2) * 75,
        })));
      wins.push(current);
      wins.push(...[30000, 36000].map((timeMs, index) => ({ outcome: 'win',
        timeMs, endedAt: now - (index === 0 ? 5 : 20) * 60000, clicks: 110, bv3: 74,
        misclicks: 0, wastedClicks: 2, fastclickGapMs: 180, mousePathPx: 1000 })));
      wins.sort((a, b) => a.endedAt - b.endedAt);
      window.profileFixture = { current, wins };
      for (const key of ['sessionSummary', 'recentPlacements', 'timeTables', 'streak', 'nearStreak',
        'nearNearStreak', 'averageCharts', 'relationshipCharts']) settings.shownThings[key] = false;
      window.drawProfileFixture = async (options = {}) => {
        const collector = createResultSectionCollector(options.historyView ? 'scores' : 'postGame');
        await renderRanks(current, wins, options, collector);
        resultRanks.classList.add('sectioned-results');
        collector.renderInto(resultRanks);
        resultsBox.hidden = false;
      };
      await drawProfileFixture();
    });
    const profile = page.locator('.board-time-profile');
    const names = (side) => profile.locator('.game-data-row[data-side="' + side + '"] .game-data-name')
      .evaluateAll((cells) => cells.map((cell) => cell.textContent).sort());
    const bandReady = () => page.waitForFunction(() => document.querySelector('.game-data-bar') !== null);
    await bandReady();
    assert.deepEqual(await names('performance'), ['3BV/s', 'click rate', 'correctness',
      'fastclick gap', 'misclick rate', 'mouse speed', 'no-op rate', 'time', 'unused flag share'],
      'defaults: one row per shown measurement');
    assert.deepEqual(await names('board'), ['0–1 share', '3BV', 'HZiNi', 'ZiNi', 'islands', 'max number',
      'zero-opening coverage', 'zeros'], 'board traits keep their table names; 3BV spread is off by default');
    await page.evaluate(async () => {
      // A crowded selection with every board table exercises row collisions
      // and the session controls below.
      window.crowdGameData = () => {
        const crowded = ['time', 'misclickRate', 'fastclickGap', 'bvPerSecond', 'clickRate', 'efficiency', 'noopRate', 'pathPer3bv'];
        settings.gameDataMetrics = Object.fromEntries(GameData.metrics.map((m) => [m.id, crowded.includes(m.id)]));
      };
      crowdGameData();
      settings.shownThings.workSpreadTable = true;
      await drawProfileFixture();
    });
    await bandReady();
    assert.equal(await profile.locator('figcaption, h4').count(), 0, 'the chart starts with its data, no heading');
    assert.deepEqual(await profile.locator('.game-data-side-title').allTextContents(), ['your perf', 'board traits']);
    assert.deepEqual(await profile.locator('.game-data-controls').evaluate((row) => [...row.children]
      .map((child) => child.matches('.game-data-pool-switch') ? 'points' : child.textContent.trim())),
    ['points', 'show distributions', 'show values', 'configure', 'session history'], 'every option in one row at the bottom');
    assert.equal(await profile.locator('.game-data-row[data-side="board"]').count(), 9);
    assert.equal(await profile.locator('.game-data-row[data-side="performance"]').count(), 8,
      'one row per measurement, its pools side by side');
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="performance"] > span').allTextContents(),
      ['', 'value', 'session', 'lifetime']);
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="board"] > span').allTextContents(),
      ['', '', 'value'], 'no "boards" head');
    assert.deepEqual(await profile.locator('.game-data-row button').evaluateAll((buttons) =>
      [...new Set(buttons.map((button) => getComputedStyle(button).cursor))]), ['default'], 'never the help cursor');
    assert.equal(await profile.locator('.game-data-row[data-measurement="bv3"] .game-data-value').textContent(), '75');
    assert.equal(await profile.locator('.game-data-row[data-measurement="zeroOpeningCoverage"] .game-data-name').textContent(),
      'zero-opening coverage');
    assert.equal(await profile.locator('.game-data-row[data-measurement="zeroOpeningCoverage"] .game-data-value').textContent(), '69%');
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 1,
      'with the metrics column open at 1440px, game data shares the details column');
    assert.equal(await page.locator('#game-data-column .board-time-profile, #result-ranks .board-time-profile').count(), 0);
    for (const width of [1920, 1100, 650, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => syncGameSidebar());
      if (await page.locator('#game-sidebar-button').isVisible()
          && !(await page.locator('#game-sidebar').evaluate((el) => el.matches(':popover-open'))))
        await page.locator('#game-sidebar-button').click();
      await profile.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const layout = await profile.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const band = el.querySelector('.game-data-band');
        const column = el.closest('#game-data-column, #game-sidebar');
        const columnStyle = getComputedStyle(column);
        const scrolls = (node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
        return {
          host: column.id,
          overflow: scrolls(band) || [el, ...el.querySelectorAll('*')].some((node) =>
            /auto|scroll/.test(getComputedStyle(node).overflow) && scrolls(node)),
          scale: Number(band.style.getPropertyValue('--game-data-scale')),
          width: bounds.width, height: bounds.height,
          columnSlack: column.id === 'game-data-column'
            ? column.getBoundingClientRect().bottom - bounds.bottom
            : parseFloat(columnStyle.maxHeight) - parseFloat(columnStyle.paddingBottom)
              - parseFloat(columnStyle.borderBottomWidth)
              - (bounds.bottom - column.getBoundingClientRect().top + column.scrollTop),
          hiddenPools: [...el.querySelectorAll('.game-data-row .game-data-pct')].filter((cell) => !cell.checkVisibility())
            .map((cell) => cell.dataset.pool),
          nameWeight: getComputedStyle(el.querySelector('.game-data-row .game-data-name')).fontWeight,
          valueWeight: getComputedStyle(el.querySelector('.game-data-row .game-data-value')).fontWeight,
          numberWeights: [...new Set([...el.querySelectorAll('.game-data-row .game-data-pct, .game-data-decile')]
            .map((cell) => getComputedStyle(cell).fontWeight))],
          sizes: ['.game-data-name', '.game-data-value'].map((name) =>
            parseFloat(getComputedStyle(el.querySelector('.game-data-row ' + name)).fontSize)),
          blocks: [...el.querySelectorAll('.game-data-block')].map((block) => {
            const bar = block.querySelector('.game-data-bar').getBoundingClientRect();
            const deciles = [...block.querySelectorAll('.game-data-decile')].map((label) => parseInt(label.textContent, 10));
            const center = (node) => { const r = node.getBoundingClientRect(); return r.left + r.width / 2; };
            return {
              barWidth: bar.width,
              leaders: block.querySelectorAll('.game-data-leader').length,
              title: [...block.querySelectorAll('.game-data-side-title')].map(center),
              heads: [...block.querySelectorAll('.game-data-column-heads')].map(center),
              rows: [...block.querySelectorAll('.game-data-row')].map((row) => {
                const rect = row.getBoundingClientRect();
                const dot = row.nextElementSibling.getBoundingClientRect();
                const percentile = Number(row.dataset.percentile);
                return { side: row.dataset.side, top: rect.top, bottom: rect.bottom, height: rect.height,
                  inside: rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5,
                  dotOffset: dot.top + dot.height / 2 - (bar.top + (percentile - deciles[0])
                    / (deciles[deciles.length - 1] - deciles[0]) * bar.height) };
              }),
            };
          }),
        };
      });
      assert.equal(layout.host, { 1920: 'game-data-column' }[width] ?? 'game-sidebar', width + 'px game data host');
      // Below the narrowest plan the band shrinks as a whole rather than
      // scrolling, shortening names, or hiding values.
      assert.equal(layout.overflow, false, width + 'px nothing in game data scrolls');
      assert.equal(layout.scale < 1, width === 320, width + 'px only the narrowest width scales the band: ' + layout.scale);
      assert.equal(layout.nameWeight, '400');
      assert.equal(layout.valueWeight, '400', 'numbers are never bold');
      assert.deepEqual(layout.numberWeights, ['400'], 'percentages and bar labels are never bold');
      assert(layout.sizes[1] > layout.sizes[0], 'values outsize their names: ' + layout.sizes);
      assert(layout.hiddenPools.every((pool) => pool === 'session'),
        width + 'px only the unplotted percentage column may yield: ' + JSON.stringify(layout.hiddenPools));
      for (const block of layout.blocks) {
        assert(Math.abs(block.barWidth - 32 * layout.scale) < 0.6, width + 'px bar width ' + block.barWidth);
        assert.equal(block.leaders, block.rows.length, 'every row has a leader');
        assert(block.title.every((center, i) => Math.abs(center - block.heads[i]) <= 1),
          width + 'px side titles center over their columns: ' + JSON.stringify([block.title, block.heads]));
        assert(block.rows.every((row) => row.height < 20 && row.inside),
          width + 'px rows stay one line inside the chart: ' + JSON.stringify(block.rows));
        for (const side of ['performance', 'board']) {
          const rows = block.rows.filter((row) => row.side === side).sort((a, b) => a.top - b.top);
          assert(rows.every((row, i) => i === 0 || row.top >= rows[i - 1].bottom - 0.5),
            width + 'px ' + side + ' rows overlap: ' + JSON.stringify(rows));
        }
        assert(block.rows.every((row) => Math.abs(row.dotOffset) < 0.6),
          width + 'px row collisions must never move the dots off their percentiles: ' + JSON.stringify(block.rows.map((r) => r.dotOffset)));
      }
      assert(layout.width <= width && layout.height >= 480
        && (layout.height === 480 || Math.abs(layout.columnSlack) <= 1),
        width + 'px chart fills its column below any other content: ' + JSON.stringify([layout.height, layout.columnSlack]));
      await profile.screenshot({ path: '/tmp/game-data-scoped-' + width + '.png' });
    }
    const zeros = profile.locator('.game-data-row[data-measurement="zeroCount"] button');
    const bandBefore = await profile.boundingBox();
    await zeros.focus();
    const card = page.locator('.chart-help-tip .game-data-card');
    assert.equal(await card.getAttribute('data-pool'), 'lifetime', 'the card follows the points switch');
    // The card opens with the rank: the row already shows the name, value,
    // and percentage (creator 2026-10-08: "just cut all the fluff").
    assert.equal(await card.locator('p').first().innerText(), 'lifetime: all 50 boards have this value');
    assert.equal(await card.locator('.game-data-card-definition').count(), 0, 'a self-evident trait has no definition');
    assert(!/÷|=|settings|so far|This is/.test(await card.innerText()), await card.innerText());
    assert.equal(await card.locator('svg.game-data-histogram').count(), 1, 'the card draws the distribution');
    assert.equal(await card.locator('.game-data-histogram-better').textContent(), 'better →', 'more zeros is the preferred end');
    assert(await page.locator('.chart-help-tip').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.matches(':popover-open') && el.contains(document.elementFromPoint(r.left + 8, r.top + 8));
    }), 'the card stays above the compact sidebar');
    assert.deepEqual(await profile.boundingBox(), bandBefore, 'the card does not reflow the chart');
    await zeros.evaluate((button) => button.blur());
    const comparisons = await page.evaluate(async () => {
      const { current, wins } = profileFixture;
      return boardTraitRankProfile(current, boardMetricCandidates([current], wins), wins, settings.sessionDefinition)
        .map(({ metricId, name, rank, total, percentile, valueText }) => ({ metricId, name, rank, total, percentile, valueText }));
    });
    assert.deepEqual(comparisons.find((row) => row.metricId === 'maxAdjacent'),
      { metricId: 'maxAdjacent', name: 'max number', rank: 142, total: 283, percentile: 50, valueText: '5' });
    assert.equal(comparisons.find((row) => row.metricId === 'zeroOpeningCoverage').percentile, 50);
    assert.equal(comparisons.find((row) => row.metricId === 'zeroOneShare').valueText, '60%');
    const help = profile.getByRole('button', { name: 'About board traits', exact: true });
    const before = await profile.boundingBox();
    await help.focus();
    assert(await page.locator('.chart-help-tip').isVisible());
    assert((await page.locator('.chart-help-tip').textContent()).includes('better meaning each trait’s preferred end'),
      'the board side title says what its percentages are');
    assert.deepEqual(await profile.boundingBox(), before, 'help does not reflow the chart');
    await help.evaluate((button) => button.blur());
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width: 1920, height: 1100 });
    await page.evaluate(async () => {
      syncGameSidebar();
      settings.shownThings.timeTables = true;
      settings.shownThings.recentPlacements = true;
      await drawProfileFixture();
    });
    await bandReady();
    assert.equal(await page.locator('#game-data-column .board-time-profile').count(), 1, 'owns the game data column');
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 0, 'not duplicated in the details column');
    assert.equal(await page.locator('#result-ranks .board-time-profile').count(), 0, 'no duplicate in the lower chart collection');
    await profile.screenshot({ path: '/tmp/game-data-sidebar.png' });
    const timeRow = profile.locator('.game-data-row[data-measurement="time"]');
    const lifetimeBefore = await timeRow.locator('[data-pool="lifetime"]').textContent();
    assert.equal(await timeRow.locator('.game-data-value').textContent(), '33.542s');
    const picker = page.getByLabel('session', { exact: true });
    assert.equal(await page.locator('select:has(option[value="today"])').count(), 1, 'the page has exactly one session picker');
    assert.equal(await page.locator('#metrics-panel .session-scope-head select').getAttribute('id'), 'session-definition-select',
      'the one picker is the stats panel’s session heading at the upper left');
    assert.equal(await picker.inputValue(), 'today', 'the session defaults to today');
    assert.equal(await profile.locator('select').count(), 0, 'game data only says session');
    assert.equal(await page.locator('.recent-placements h4').textContent(), 'ranks won in session');
    assert.equal(await page.locator('.recent-placements select').count(), 0, 'ranks won only says session');
    await picker.selectOption('past10min');
    assert.equal(await page.evaluate(() => settings.sessionDefinition), 'past10min');
    await page.waitForFunction(() => document.querySelector('.game-data-row[data-measurement="time"] [data-pool="session"]')?.textContent === '100%');
    assert.equal(await timeRow.locator('[data-pool="lifetime"]').textContent(), lifetimeBefore);
    await picker.selectOption('pastHour');
    await page.waitForFunction(() => document.querySelector('.game-data-row[data-measurement="time"] [data-pool="session"]')?.textContent === '50%',
      null, { timeout: 5000 });
    assert.equal(await page.locator('.recent-placements h4').textContent(), 'ranks won in session');
    await page.evaluate(async () => { settings.showSessionStats = false; settings.metricsPanelCollapsed = true; refreshMetricsPanel(); });
    assert(await picker.isVisible(), 'the picker stays when the panel is collapsed and session stats are off');
    await page.evaluate(async () => { settings.showSessionStats = true; settings.metricsPanelCollapsed = false; refreshMetricsPanel(); });
    // The points switch places the performance dots by either pool.
    await profile.getByRole('button', { name: 'session', exact: true }).click();
    await bandReady();
    assert.equal(await page.evaluate(() => settings.gameDataBandPool), 'session');
    assert.equal(await profile.locator('.game-data-pool-switch [aria-pressed="true"]').textContent(), 'session');
    assert.equal(await profile.locator('.game-data-column-heads[data-side="performance"] [data-pool="session"]')
      .evaluate((el) => el.classList.contains('plotted')), true);
    assert.equal(Math.round(Number(await timeRow.getAttribute('data-percentile'))) + '%',
      await timeRow.locator('[data-pool="session"]').textContent(), 'the session switch plots session standings');
    // In session mode every card shows the session: its standing, its games
    // (one dot each for a small pool), and its counts.
    await timeRow.locator('button').hover();
    const sessionCard = page.locator('.chart-help-tip .game-data-card');
    assert.equal(await sessionCard.getAttribute('data-pool'), 'session');
    assert.equal(await sessionCard.locator('p').first().innerText(), 'session: 2nd of 3 wins',
      'the card opens with the rank alone');
    assert.equal(await sessionCard.locator('.game-data-histogram-tick').count(), 0, 'no lifetime ticks in a session card');
    assert.equal(await sessionCard.locator('.game-data-histogram-dot').count(), 3, 'the session’s 3 wins, one dot each');
    assert.equal(await sessionCard.locator('.game-data-card-definition').count(), 0, 'time needs no definition');
    assert((await sessionCard.innerText()).includes('One dot per win.'));
    assert(!(await sessionCard.innerText()).includes('24 hours'), 'no separate 24-hour rank: session and lifetime only');
    assert(!/÷|=|settings|so far|This is|this session/.test(await sessionCard.innerText()), await sessionCard.innerText());
    assert((await sessionCard.innerText()).includes('Green line: this game.'));
    assert.deepEqual(await sessionCard.locator('.game-data-histogram-this-edge, .game-data-histogram-this').evaluateAll((lines) =>
      lines.map((line) => getComputedStyle(line).stroke)), ['rgb(0, 0, 0)', 'rgb(57, 255, 20)'],
      'this game is the charts’ green line, edged in black');
    await page.mouse.move(0, 0);
    await profile.getByRole('button', { name: 'lifetime', exact: true }).click();
    await bandReady();
    assert.equal(Math.round(Number(await timeRow.getAttribute('data-percentile'))) + '%', lifetimeBefore);
    // Distributions: one strip per measurement and pool. The sections switch
    // shows the lifetime sections, the session sections, or both, for your
    // perf and board traits alike, and the strips take whatever height the
    // rows leave.
    const distributionsShown = async (pressed) => {
      await page.waitForFunction((text) => document.querySelector('.game-data-pool-switch [aria-pressed="true"]')?.textContent === text
        && !document.querySelector('.board-time-profile').hasAttribute('aria-busy'), pressed);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return profile.locator('.game-data-distributions').evaluate((view) => {
        const strips = [...view.querySelectorAll('.game-data-strip')];
        return {
          heads: [...view.querySelectorAll('.game-data-dist-head')].map((head) =>
            head.querySelector('.game-data-side-title').textContent + ' · ' + head.querySelector('.game-data-pct').textContent),
          rows: strips.length,
          stripHeights: [...new Set(strips.map((strip) => strip.getBoundingClientRect().height))],
          drawnHeights: [...new Set(strips.map((strip) => strip.querySelector('svg').viewBox.baseVal.height))],
          slack: view.clientHeight - (view.lastElementChild.getBoundingClientRect().bottom - view.firstElementChild.getBoundingClientRect().top),
          scrolls: view.scrollHeight > view.clientHeight + 1 || view.scrollWidth > view.clientWidth + 1,
          note: view.querySelector('.game-data-unplotted')?.textContent ?? null,
          key: view.querySelector('.game-data-dist-key').textContent,
          ticks: view.querySelectorAll('.game-data-histogram-tick').length,
        };
      });
    };
    // One more pixel of strip would overflow the box, and every strip is
    // drawn at its laid-out height, so its ticks and axis gap keep their size.
    const fillsBox = (shown, label) => {
      assert.equal(shown.scrolls, false, label + ': no scrolling');
      assert.equal(shown.stripHeights.length, 1, label + ': one strip height');
      assert.deepEqual(shown.drawnHeights, shown.stripHeights, label + ': strips drawn at their laid-out height');
      assert(shown.slack >= 0 && shown.slack < shown.rows * 1.2 + 4, label + ': the strips fill the box: ' + JSON.stringify(shown));
    };
    await profile.getByLabel('show distributions', { exact: true }).check();
    let shown = await distributionsShown('both');
    assert.equal(await page.evaluate(() => settings.gameDataDistributions), true);
    assert.equal(await profile.locator('.game-data-pool-switch').evaluate((group) => group.textContent), 'sections: lifetimesessionboth');
    assert.deepEqual(shown.heads, ['lifetime · lifetime', 'session · session', 'board traits · lifetime', 'board traits · session'],
      'both pools, for your perf and for board traits');
    assert.equal(shown.note, null, 'the lifetime sections list every measurement');
    assert.equal(shown.rows, await profile.locator('.game-data-dist-row svg.game-data-histogram').count());
    const stripLefts = await profile.locator('.game-data-strip').evaluateAll((strips) =>
      [...new Set(strips.map((strip) => Math.round(strip.getBoundingClientRect().left)))]);
    assert.equal(stripLefts.length, 1, 'all sections line up their strips: ' + JSON.stringify(stripLefts));
    await profile.screenshot({ path: '/tmp/game-data-distributions.png' });
    fillsBox(shown, 'both');
    const bothStrip = shown.stripHeights[0];
    await profile.getByRole('button', { name: 'lifetime', exact: true }).click();
    shown = await distributionsShown('lifetime');
    assert.equal(await page.evaluate(() => settings.gameDataDistributionPools), 'lifetime');
    assert.deepEqual(shown.heads, ['lifetime · lifetime', 'board traits · lifetime']);
    fillsBox(shown, 'lifetime');
    assert(shown.stripHeights[0] > bothStrip, 'fewer rows, taller strips: ' + shown.stripHeights[0] + ' px vs ' + bothStrip + ' px');
    assert.equal(shown.key, 'Green line: this game. Ticks under a lifetime strip: this session’s games.');
    assert(shown.ticks > 0, 'lifetime strips tick the session’s games');
    // Removing measurements gives the rest their height.
    const lifetimeStrip = shown.stripHeights[0];
    await profile.locator('.game-data-controls [data-view="config"]').click();
    const allMeasurements = profile.getByLabel('all performance measurements', { exact: true });
    await allMeasurements.check();
    await allMeasurements.uncheck();
    await profile.locator('.game-data-config input[aria-label="time"]').check();
    await profile.getByRole('button', { name: 'back to game data' }).first().click();
    shown = await distributionsShown('lifetime');
    assert.equal(shown.rows, 1 + 9, 'time and the board traits');
    fillsBox(shown, 'one measurement');
    assert(shown.stripHeights[0] > lifetimeStrip, 'removed measurements give the rest their height: '
      + shown.stripHeights[0] + ' px vs ' + lifetimeStrip + ' px');
    await profile.screenshot({ path: '/tmp/game-data-distributions-few.png' });
    // Session alone: no lifetime ticks, and a measurement without a session
    // rank is listed rather than dropped.
    await profile.getByRole('button', { name: 'session', exact: true }).click();
    shown = await distributionsShown('session');
    assert.deepEqual(shown.heads, ['session · session', 'board traits · session']);
    assert.equal(shown.key, 'Green line: this game.');
    assert.equal(shown.ticks, 0);
    assert.match(shown.note, /^Not ranked in this session yet: ZiNi, .*zeros\. A session rank needs two measured games in the session window\.$/);
    fillsBox(shown, 'session');
    await page.evaluate(async () => { crowdGameData(); settings.gameDataDistributionPools = 'both'; await drawProfileFixture(); });
    await distributionsShown('both');
    await profile.getByLabel('show distributions', { exact: true }).uncheck();
    await bandReady();
    await profile.getByLabel('show values', { exact: true }).uncheck();
    await bandReady();
    assert.equal(await profile.locator('.game-data-row .game-data-value:visible').count(), 0);
    assert.equal(await timeRow.locator('.game-data-name').innerText(), 'time');
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    await profile.getByLabel('show values', { exact: true }).check();
    await bandReady();
    assert.equal(await profile.locator('.game-data-row .game-data-value:visible').count(), 17);
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('all performance measurements', { exact: true }).check();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataMetrics).every(Boolean)), true);
    await profile.getByLabel('all performance measurements', { exact: true }).uncheck();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataMetrics).some(Boolean)), false);
    await page.evaluate(async () => { crowdGameData(); saveSettings(); });
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.screenshot({ path: '/tmp/game-data-config.png' });
    await profile.getByLabel('fastclick gap', { exact: true }).uncheck();
    assert.equal(await page.evaluate(() => settings.gameDataMetrics.fastclickGap), false);
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.locator(':scope[aria-busy="true"]').waitFor({ state: 'hidden' });
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-measurement="fastclickGap"]').count(), 0);
    assert.equal(await profile.locator('.game-data-row[data-measurement="clickRate"]').count(), 1);
    await profile.getByRole('button', { name: 'session history', exact: true }).click();
    await profile.locator('tbody tr').first().waitFor();
    assert.equal(await profile.locator('tbody tr').count(), 20);
    await profile.getByLabel('measurement', { exact: true }).selectOption('fastclickGap');
    assert((await profile.locator('tbody tr').first().textContent()).includes('180ms'));
    await profile.screenshot({ path: '/tmp/game-data-session-history.png' });
    await page.keyboard.press('Escape');
    assert.equal(await profile.getAttribute('data-screen'), 'chart');
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('fastclick gap', { exact: true }).check();
    await page.keyboard.press('Escape');
    await page.evaluate(() => drawProfileFixture({ historyView: true }));
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-measurement="time"]').count(), 1, 'history views rank the shown win');
    await page.evaluate(() => drawProfileFixture({ historyView: true,
      boardRecord: { ...profileFixture.current, outcome: 'loss' } }));
    assert.equal(await profile.count(), 0, 'loss is never plotted as a ranked win');
    await page.evaluate(async () => { settings.shownThings.exact3BV = false; await drawProfileFixture(); });
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-side="board"]').count(), 8);
    await page.evaluate(async () => {
      const current = profileFixture.current;
      const identical = [{ ...current, endedAt: current.endedAt - 1000 }, current];
      const collector = createResultSectionCollector('postGame');
      await renderRanks(current, identical, {}, collector);
      collector.renderInto(resultRanks);
    });
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-measurement="islandCount"]').count(), 1);
    assert.equal(await profile.locator('.game-data-row[data-measurement="zeroCount"]').count(), 1,
      'distinct traits survive identical table memberships');
    await page.evaluate(async () => { settings.shownThings.boardPercentiles = false; await drawProfileFixture(); });
    assert.equal(await profile.count(), 0);
    await page.evaluate(async () => {
      const { current } = profileFixture;
      window.savedShownThings = { ...settings.shownThings };
      for (const key of ['exactZiNi', 'exactMaxNumber', 'exactHZiNi', 'workSpreadTable',
        'zeroOneShareTable', 'zeroOpeningTable', 'boardShapeTables']) settings.shownThings[key] = false;
      settings.shownThings.exact3BV = true;
      const host = buildBoardTimeRankProfile(current, [current]);
      resultRanks.replaceChildren(host);
      await host.analysisReady;
    });
    assert.equal(await profile.locator('.game-data-dot, .game-data-row').count(), 0, 'one-game measurements are omitted');
    assert.equal(await profile.locator('.game-data-unplotted').textContent(),
      'Nothing to rank yet: every comparison needs at least two measured games.');
    await page.evaluate(async () => {
      settings.shownThings = { ...savedShownThings };
      settings.shownThings.boardPercentiles = true;
      settings.shownThings.exact3BV = true;
      settings.shownThings.averageCharts = true;
      settings.perfChartMode = 'average';
      settings.boardChartMode = 'average';
      await drawProfileFixture();
    });
    await bandReady();
    const chartSections = await page.locator('#result-ranks > section').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')));
    const boardAt = chartSections.indexOf('This board');
    const perfAt = chartSections.indexOf('your perf');
    const traitsAt = chartSections.indexOf('board traits');
    assert(boardAt !== -1 && boardAt < perfAt && perfAt < traitsAt,
      'pagetables precede your perf charts, which precede board-trait charts: ' + chartSections.join(','));
    // Linkage: a chart of a band measurement repeats this game's value and
    // lifetime standing, and hovering the band row outlines that chart.
    const bvRow = profile.locator('.game-data-row[data-measurement="bv3"]');
    const bvPercent = Math.round(Number(await bvRow.getAttribute('data-percentile'))) + '%';
    assert.equal(await page.locator('.result-chart-section-boardCharts [data-measurement="bv3"] .game-data-chart-chip').textContent(),
      'this 75 · ' + bvPercent);
    assert.equal(await page.locator('.result-chart-section-perfCharts [data-measurement="bvPerSecond"] .game-data-chart-chip').count(), 1);
    await bvRow.hover();
    assert.deepEqual(await page.locator('.game-data-linked').evaluateAll((charts) => charts.map((chart) => chart.dataset.measurement)),
      ['bv3'], 'hovering a band row outlines its chart');
    assert.match(await page.locator('.game-data-linked').evaluate((chart) => getComputedStyle(chart).boxShadow),
      /rgb\(57, 255, 20\)/, 'the outline is the this-game green');
    await page.mouse.move(0, 0);
    assert.equal(await page.locator('.game-data-linked').count(), 0);
    await page.evaluate(async () => { settings.boardChartMode = 'distribution'; await drawProfileFixture(); });
    assert.equal(await page.locator('.result-chart-section-perfCharts select').inputValue(), 'average');
    assert.equal(await page.locator('.result-chart-section-boardCharts select').inputValue(), 'distribution');
    assert(await page.locator('.result-chart-section-boardCharts h4').first().textContent()
      .then((text) => text.startsWith('times by ')));
    await page.locator('.result-chart-section-perfCharts select').selectOption('winrate');
    assert.equal(await page.evaluate(() => settings.perfChartMode), 'winrate');
    assert.equal(await page.evaluate(() => settings.boardChartMode), 'distribution',
      'each chart group keeps its own mode');
    await page.evaluate(() => drawProfileFixture());
    const perfHeading = await page.locator('.result-chart-section-perfCharts h4').first().textContent();
    assert(perfHeading.startsWith('winrate by '), 'your perf winrate heading: ' + JSON.stringify(perfHeading));
    assert((await page.locator('.result-chart-section-boardCharts h4').first().textContent()).startsWith('times by '),
      'the board-trait group stays on distribution');
    await page.screenshot({ path: '/tmp/chart-groups.png', fullPage: true });
    await bandReady();
    await profile.getByLabel('show values', { exact: true }).uncheck();
    await page.getByLabel('session', { exact: true }).selectOption('past30min');
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    assert.equal(await page.evaluate(() => settings.sessionDefinition), 'past30min');
    assert.equal(await page.getByLabel('session', { exact: true }).inputValue(), 'past30min');
    assert.equal(await page.evaluate(() => settings.gameDataMetrics.fastclickGap), true);
    const layoutPage = await browser.newPage({ viewport: { width: 1740, height: 1100 } });
    layoutPage.on('pageerror', (error) => errors.push('layout fixture: ' + error.message));
    await layoutPage.goto('http://127.0.0.1:8099/tests/session-placement-layout-test.html');
    await layoutPage.waitForFunction(() => document.getElementById('checks').textContent.includes('DONE'), null, { timeout: 60000 });
    const layoutChecks = await layoutPage.locator('#checks').textContent();
    assert.deepEqual(layoutChecks.split('\n').filter((line) => line.startsWith('FAIL')), [], 'post-game layout regression');
    await layoutPage.close();
    assert.deepEqual(errors, []);
    console.log('board-time-profile: band rows, pools, distributions, chart linkage, responsive layout, help, history, losses, and settings passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
