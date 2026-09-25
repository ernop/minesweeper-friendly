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
      for (const key of ['recentPlacements', 'timeTables', 'streak', 'nearStreak',
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
    const traits = (side) => profile.locator('.board-trait-line-label[data-side="' + side + '"]')
      .evaluateAll((labels) => labels.map((label) => label.dataset.trait).sort());
    assert.deepEqual(await traits('performance'), ['3BV/s (life)', 'click rate (life)', 'correctness (life)',
      'fastclick gap (life)', 'misclick rate (life)', 'mouse speed (life)', 'no-op rate (life)', 'time (day)',
      'time (life)', 'unused mark share (life)'], 'defaults: lifetime comparisons and day time');
    assert.deepEqual(await traits('board'), ['0–1 share', '3BV', 'HZiNi', 'MN', 'ZOC', 'ZiNi', 'islands', 'zeros'],
      '3BV spread is off by default');
    await page.evaluate(async () => {
      // A crowded two-pool selection with every board table exercises label
      // collisions and the session controls below.
      window.crowdGameData = () => {
        const crowded = ['time', 'misclickRate', 'fastclickGap', 'bvPerSecond', 'clickRate', 'efficiency', 'noopRate', 'pathPer3bv'];
        settings.gameDataSessionMetrics = Object.fromEntries(GameData.metrics.map((m) => [m.id, crowded.includes(m.id)]));
        settings.gameDataLifetimeMetrics = { ...settings.gameDataSessionMetrics };
      };
      crowdGameData();
      settings.shownThings.workSpreadTable = true;
      await drawProfileFixture();
    });
    assert.equal(await profile.locator('.board-time-profile-views, .board-time-profile-grid').count(), 0);
    assert.equal(await profile.locator('h4').textContent(), 'game data');
    assert.deepEqual(await profile.locator('.board-time-profile-sides > span').allTextContents(), ['your perf', 'board traits']);
    await page.waitForFunction(() => document.querySelector('.board-trait-line-axis').style.height !== '');
    assert.deepEqual(await profile.locator('.board-trait-line-tick').allTextContents(), Array.from({ length: 11 }, (_, i) => i * 10 + '%'),
      'the best board in its pool sits at 0%');
    assert.equal(await profile.locator('.board-trait-line-label[data-side="board"]').count(), 9);
    assert.equal(await profile.locator('.board-trait-line-label[data-side="performance"]').count(), 17);
    assert.equal(await profile.locator('.board-trait-line-label[data-trait="3BV"]').textContent(), '3BV 75');
    assert.equal(await profile.locator('.board-trait-line-label[data-trait="ZOC"]').textContent(), 'ZOC 69%');
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
      await page.waitForTimeout(60);
      const layout = await profile.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const axis = el.querySelector('.board-trait-line-axis').getBoundingClientRect();
        const center = axis.left + axis.width / 2;
        const column = el.closest('#game-data-column, #game-sidebar');
        const columnStyle = getComputedStyle(column);
        const [perfHeading, boardHeading] = el.querySelectorAll('.board-time-profile-sides > span');
        return {
          host: column.id,
          overflow: el.scrollWidth > el.clientWidth + 1,
          width: bounds.width, height: bounds.height, bandWidth: axis.width,
          columnSlack: column.id === 'game-data-column'
            ? column.getBoundingClientRect().bottom - bounds.bottom
            : parseFloat(columnStyle.maxHeight) - parseFloat(columnStyle.paddingBottom)
              - parseFloat(columnStyle.borderBottomWidth)
              - (bounds.bottom - column.getBoundingClientRect().top + column.scrollTop),
          headingEdges: [center - perfHeading.getBoundingClientRect().right, boardHeading.getBoundingClientRect().left - center],
          low: Number(el.querySelector('.board-trait-line').dataset.low), high: Number(el.querySelector('.board-trait-line').dataset.high),
          ticks: [...el.querySelectorAll('.board-trait-line-tick')].map((tick) => {
            const rect = tick.getBoundingClientRect();
            return (rect.top + rect.height / 2 - axis.top) / axis.height * 100;
          }),
          leaders: [...el.querySelectorAll('.board-trait-line-connector')].map((line) => ({
            strong: line.dataset.displaced === 'true', width: Number(getComputedStyle(line).strokeWidth.replace('px', '')),
            d: line.getAttribute('d'),
          })),
          labels: [...el.querySelectorAll('.board-trait-line-label button')].map((button) => {
            const rect = button.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: rect.height,
              side: button.parentElement.dataset.side,
              displacement: Math.abs(parseFloat(button.parentElement.style.top) - Number(button.parentElement.dataset.pointY)),
              nameRight: button.querySelector('.board-trait-name').getBoundingClientRect().right,
              valueLeft: button.querySelector('.board-trait-value').getBoundingClientRect().left,
              value: button.querySelector('.board-trait-value').textContent,
              distance: button.parentElement.dataset.side === 'board' ? rect.left - center : center - rect.right,
              inside: rect.left >= bounds.left && rect.right <= bounds.right,
              weight: getComputedStyle(button).fontWeight };
          }),
          dots: [...el.querySelectorAll('.board-trait-line-dot')].map((dot) => {
            const rect = dot.getBoundingClientRect();
            return (rect.top + rect.height / 2 - axis.top) / axis.height * 100;
          }),
          percentiles: [...el.querySelectorAll('.board-trait-line-label')].map((label) => Number(label.dataset.percentile)),
        };
      });
      assert.equal(layout.host, { 1920: 'game-data-column' }[width] ?? 'game-sidebar', width + 'px game data host');
      assert.equal(layout.overflow, false, width + 'px line overflow');
      assert.equal(layout.bandWidth, 32);
      assert(layout.ticks.every((position, i) => Math.abs(position - i * 10 / (layout.high - layout.low) * 100) < .02), 'ticks retain absolute decile labels in the zoomed range');
      assert.equal(layout.leaders.length, layout.labels.length);
      assert(layout.labels.every((label, i) => label.value
        && (label.displacement <= 8 || (layout.leaders[i].strong && layout.leaders[i].width >= 2))),
        'every displaced label has a strong leader and every value follows its name');
      assert(layout.width <= width && layout.height >= 480
        && (layout.height === 480 || Math.abs(layout.columnSlack) <= 1),
        width + 'px chart fills its column below any other content: ' + JSON.stringify([layout.height, layout.columnSlack]));
      assert(layout.headingEdges.every((edge) => edge >= 29 && edge <= 31),
        width + 'px side headings align with their label columns: ' + JSON.stringify(layout.headingEdges));
      if (layout.host === 'game-data-column') assert(layout.labels.every((label) => label.height < 20),
        width + 'px labels keep one line in the game data column: ' + JSON.stringify(layout.labels.map((l) => l.height)));
      assert(layout.labels.every((label, i) => label.inside && label.weight === '400'
        && label.distance >= 29 && label.distance <= 31
        && (i === 0 || label.side !== layout.labels[i - 1].side || label.top >= layout.labels[i - 1].bottom + 1)),
      width + 'px trait labels overlap or overflow: ' + JSON.stringify(layout.labels));
      assert(layout.dots.every((position, i) => Math.abs(position - (layout.percentiles[i] - layout.low) / (layout.high - layout.low) * 100) < .04),
        'label collision handling must never displace the percentile dots');
      await profile.screenshot({ path: '/tmp/game-data-scoped-' + width + '.png' });
    }
    const zeros = profile.locator('.board-trait-line-label').getByRole('button', { name: 'About zeros: 59', exact: true });
    const lineBefore = await profile.boundingBox();
    await zeros.focus();
    const detail = await page.locator('.chart-help-tip').textContent();
    assert(detail.includes('zeros 59') && detail.includes('Higher values') && detail.includes('neutral at 50%'));
    assert(await page.locator('.chart-help-tip').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.matches(':popover-open') && el.contains(document.elementFromPoint(r.left + 8, r.top + 8));
    }), 'help stays above the compact sidebar');
    assert.deepEqual(await profile.boundingBox(), lineBefore);
    const comparisons = await page.evaluate(async () => {
      const { current, wins } = profileFixture;
      return boardTraitRankProfile(current, boardMetricCandidates([current], wins), wins)
        .map(({ trait, rank, total, percentile, valueText }) => ({ trait, rank, total, percentile, valueText }));
    });
    assert.deepEqual(comparisons.find((row) => row.trait === 'MN'),
      { trait: 'MN', rank: 142, total: 283, percentile: 50, valueText: '5' });
    assert.equal(comparisons.find((row) => row.trait === 'ZOC').percentile, 50);
    assert.equal(comparisons.find((row) => row.trait === '0–1 share').valueText, '60%');
    const help = profile.getByRole('button', { name: 'About game data', exact: true });
    const before = await profile.boundingBox();
    await help.focus();
    assert(await page.locator('.chart-help-tip').isVisible());
    assert((await page.locator('.chart-help-tip').textContent()).includes('trait values ranked against measured historical boards'));
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
    assert.equal(await page.locator('#game-data-column .board-time-profile').count(), 1, 'owns the game data column');
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 0, 'not duplicated in the details column');
    assert.equal(await page.locator('#result-ranks .board-time-profile').count(), 0, 'no duplicate in the lower chart collection');
    await profile.screenshot({ path: '/tmp/game-data-sidebar.png' });
    const lifetimeBefore = await profile.locator('[data-trait="time (life)"]').getAttribute('data-percentile');
    assert.equal(await profile.locator('[data-trait="time (life)"]').textContent(), 'time 33.542s (life)', 'the pool word ends the label');
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
    assert.equal(await profile.locator('[data-trait="time (session)"]').getAttribute('data-percentile'), '100');
    assert.equal(await profile.locator('[data-trait="time (life)"]').getAttribute('data-percentile'), lifetimeBefore);
    await picker.selectOption('pastHour');
    assert.equal(await profile.locator('[data-trait="time (session)"]').getAttribute('data-percentile'), '50',
      'game data follows the one picker');
    assert.equal(await page.locator('.recent-placements h4').textContent(), 'ranks won in session');
    await page.evaluate(async () => { settings.showSessionStats = false; settings.metricsPanelCollapsed = true; refreshMetricsPanel(); });
    assert(await picker.isVisible(), 'the picker stays when the panel is collapsed and session stats are off');
    await page.evaluate(async () => { settings.showSessionStats = true; settings.metricsPanelCollapsed = false; refreshMetricsPanel(); });
    await profile.getByLabel('show actual value', { exact: true }).uncheck();
    assert.equal(await profile.locator('.board-trait-line-label .board-trait-value:visible').count(), 0);
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    await profile.getByLabel('show actual value', { exact: true }).check();
    assert.equal(await profile.locator('.board-trait-line-label .board-trait-value:visible').count(), 26);
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('lifetime', { exact: true }).check();
    await profile.getByLabel('lifetime', { exact: true }).uncheck();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataLifetimeMetrics).some(Boolean)), false);
    assert.equal(await page.evaluate(() => settings.gameDataSessionMetrics.clickRate), true);
    await profile.getByLabel('all performance metrics', { exact: true }).check();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataLifetimeMetrics).every(Boolean)
      && Object.values(settings.gameDataSessionMetrics).every(Boolean)), true);
    await profile.getByLabel('all performance metrics', { exact: true }).uncheck();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataLifetimeMetrics).some(Boolean)
      || Object.values(settings.gameDataSessionMetrics).some(Boolean)), false);
    await page.evaluate(async () => { crowdGameData(); saveSettings(); });
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.screenshot({ path: '/tmp/game-data-config.png' });
    await profile.getByLabel('session fastclick gap', { exact: true }).uncheck();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.locator(':scope[aria-busy="true"]').waitFor({ state: 'hidden' });
    assert.equal(await profile.locator('[data-trait="fastclick gap (session)"]').count(), 0);
    assert.equal(await profile.locator('[data-trait="fastclick gap (life)"]').count(), 1);
    await profile.getByRole('button', { name: 'session history', exact: true }).click();
    await profile.locator('tbody tr').first().waitFor();
    assert.equal(await profile.locator('tbody tr').count(), 20);
    await profile.getByLabel('measurement', { exact: true }).selectOption('fastclickGap');
    assert((await profile.locator('tbody tr').first().textContent()).includes('180ms'));
    await profile.screenshot({ path: '/tmp/game-data-session-history.png' });
    await page.keyboard.press('Escape');
    assert.equal(await profile.getAttribute('data-screen'), 'chart');
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('session fastclick gap', { exact: true }).check();
    await page.keyboard.press('Escape');
    await page.evaluate(() => drawProfileFixture({ historyView: true }));
    assert.equal(await profile.locator('.board-time-profile-time').count(), 0, 'time lives in the scoped labels');
    await page.evaluate(() => drawProfileFixture({ historyView: true,
      boardRecord: { ...profileFixture.current, outcome: 'loss' } }));
    assert.equal(await profile.count(), 0, 'loss is never plotted as a ranked win');
    await page.evaluate(async () => { settings.shownThings.exact3BV = false; await drawProfileFixture(); });
    assert.equal(await profile.locator('.board-trait-line-label[data-side="board"]').count(), 8);
    await page.evaluate(async () => {
      const current = profileFixture.current;
      const identical = [{ ...current, endedAt: current.endedAt - 1000 }, current];
      const collector = createResultSectionCollector('postGame');
      await renderRanks(current, identical, {}, collector);
      collector.renderInto(resultRanks);
    });
    assert.equal(await profile.locator('[data-trait="islands"]').count(), 1);
    assert.equal(await profile.locator('[data-trait="zeros"]').count(), 1, 'distinct traits survive identical table memberships');
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
    assert.equal(await profile.locator('.board-trait-line-dot').count(), 0);
    assert((await profile.locator('.board-trait-line-unranked').textContent()).startsWith('Only one measured game:'));
    assert.equal(await profile.locator('.board-trait-line-unranked > [data-side="board"]').textContent(), '3BV 75');
    assert.equal(await profile.locator('.board-trait-line-unranked > [data-side="performance"] button').count(), 17);
    await page.evaluate(async () => {
      settings.shownThings = { ...savedShownThings };
      settings.shownThings.boardPercentiles = true;
      settings.shownThings.averageCharts = true;
      settings.perfChartMode = 'average';
      settings.boardChartMode = 'distribution';
      await drawProfileFixture();
    });
    const chartSections = await page.locator('#result-ranks > section').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')));
    const boardAt = chartSections.indexOf('This board');
    const perfAt = chartSections.indexOf('your perf');
    const traitsAt = chartSections.indexOf('board traits');
    assert(boardAt !== -1 && boardAt < perfAt && perfAt < traitsAt,
      'pagetables precede your perf charts, which precede board-trait charts: ' + chartSections.join(','));
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
    await profile.getByLabel('show actual value', { exact: true }).uncheck();
    await page.getByLabel('session', { exact: true }).selectOption('past30min');
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    assert.equal(await page.evaluate(() => settings.sessionDefinition), 'past30min');
    assert.equal(await page.getByLabel('session', { exact: true }).inputValue(), 'past30min');
    assert.equal(await page.evaluate(() => settings.gameDataSessionMetrics.fastclickGap), true);
    const layoutPage = await browser.newPage({ viewport: { width: 1740, height: 1100 } });
    await layoutPage.goto('http://127.0.0.1:8099/tests/session-placement-layout-test.html');
    await layoutPage.waitForFunction(() => document.getElementById('checks').textContent.includes('DONE'), null, { timeout: 60000 });
    const layoutChecks = await layoutPage.locator('#checks').textContent();
    assert.deepEqual(layoutChecks.split('\n').filter((line) => line.startsWith('FAIL')), [], 'post-game layout regression');
    await layoutPage.close();
    assert.deepEqual(errors, []);
    console.log('board-time-profile: table parity, sparse groups, responsive layout, help, history, losses, and settings passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
