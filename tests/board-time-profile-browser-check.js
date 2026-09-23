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
    await page.evaluate(() => {
      const now = Date.now();
      const current = { outcome: 'win', endedAt: now, timeMs: 33542,
        clicks: 105, misclicks: 1, wastedClicks: 3, fastclickGapMs: 190, mousePathPx: 980,
        bv3: 75, zini: 49, maxAdjacent: 5, hzini: 50, islandCount: 21, zeroCount: 59,
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
      window.drawProfileFixture = (options = {}) => {
        const collector = createResultSectionCollector(options.historyView ? 'scores' : 'postGame');
        renderRanks(current, wins, options, collector);
        resultRanks.classList.add('sectioned-results');
        collector.renderInto(resultRanks);
        resultsBox.hidden = false;
      };
      drawProfileFixture();
    });
    const profile = page.locator('.board-time-profile');
    assert.equal(await profile.locator('.board-time-profile-views, .board-time-profile-grid').count(), 0);
    assert.equal(await profile.locator('h4').textContent(), 'game data');
    assert.deepEqual(await profile.locator('.board-time-profile-sides > span').allTextContents(), ['your perf', 'board traits']);
    await page.waitForFunction(() => document.querySelector('.board-trait-line-axis').style.height !== '');
    assert.deepEqual(await profile.locator('.board-trait-line-tick').allTextContents(), Array.from({ length: 10 }, (_, i) => (i + 1) * 10 + '%'));
    assert.equal(await profile.locator('.board-trait-line-label[data-side="board"]').count(), 9);
    assert.equal(await profile.locator('.board-trait-line-label[data-side="performance"]').count(), 17);
    assert.equal(await profile.locator('.board-trait-line-label[data-trait="3BV"]').textContent(), '3BV 75');
    assert.equal(await profile.locator('.board-trait-line-label[data-trait="ZOC"]').textContent(), 'ZOC 69%');
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 1);
    assert.equal(await page.locator('#result-ranks .board-time-profile').count(), 0);
    for (const width of [1680, 650, 390, 320]) {
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
        const column = el.closest('#game-sidebar');
        const columnStyle = getComputedStyle(column);
        const [perfHeading, boardHeading] = el.querySelectorAll('.board-time-profile-sides > span');
        return {
          overflow: el.scrollWidth > el.clientWidth + 1,
          width: bounds.width, height: bounds.height, bandWidth: axis.width,
          columnSlack: parseFloat(columnStyle.maxHeight) - parseFloat(columnStyle.paddingBottom)
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
      assert.equal(layout.overflow, false, width + 'px line overflow');
      assert.equal(layout.bandWidth, 32);
      assert(layout.ticks.every((position, i) => Math.abs(position - i * 10 / (layout.high - layout.low) * 100) < .02), 'ticks retain absolute decile labels in the zoomed range');
      assert.equal(layout.leaders.length, layout.labels.length);
      assert(layout.labels.every((label, i) => label.value
        && (label.displacement <= 8 || (layout.leaders[i].strong && layout.leaders[i].width >= 2))),
        'every displaced label has a strong leader and every value follows its name');
      assert(layout.width <= width && layout.height >= 480
        && (layout.height === 480 || Math.abs(layout.columnSlack) <= 1),
        width + 'px chart fills the details column below its other content: ' + JSON.stringify([layout.height, layout.columnSlack]));
      assert(layout.headingEdges.every((edge) => edge >= 29 && edge <= 31),
        width + 'px side headings align with their label columns: ' + JSON.stringify(layout.headingEdges));
      if (width >= 650) assert(layout.labels.every((label) => label.height < 20),
        width + 'px labels keep one line where the column fits them: ' + JSON.stringify(layout.labels.map((l) => l.height)));
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
    const comparisons = await page.evaluate(() => {
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
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.evaluate(() => {
      settings.shownThings.timeTables = true;
      settings.shownThings.recentPlacements = true;
      drawProfileFixture();
    });
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 1, 'replaces the sidebar stat block');
    assert.equal(await page.locator('#result-ranks .board-time-profile').count(), 0, 'no duplicate in the lower chart collection');
    await profile.screenshot({ path: '/tmp/game-data-sidebar.png' });
    const lifetimeBefore = await profile.locator('[data-trait="lifetime time"]').getAttribute('data-percentile');
    await page.getByLabel('Page-wide session', { exact: true }).selectOption('past10min');
    assert((await page.locator('select[data-session-scope]').evaluateAll((els) => els.map((el) => el.value))).every((v) => v === 'past10min'));
    assert.equal(await profile.locator('[data-trait="session time"]').getAttribute('data-percentile'), '100');
    assert.equal(await profile.locator('[data-trait="lifetime time"]').getAttribute('data-percentile'), lifetimeBefore);
    await profile.getByLabel('Game data session (page-wide)', { exact: true }).selectOption('pastHour');
    assert((await page.locator('select[data-session-scope]').evaluateAll((els) => els.map((el) => el.value))).every((v) => v === 'pastHour'));
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
    await page.evaluate(() => {
      settings.gameDataSessionMetrics = { ...GameData.defaults };
      settings.gameDataLifetimeMetrics = { ...GameData.defaults }; saveSettings();
    });
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.screenshot({ path: '/tmp/game-data-config.png' });
    await profile.getByLabel('session fastclick gap', { exact: true }).uncheck();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    assert.equal(await profile.locator('[data-trait="session fastclick gap"]').count(), 0);
    assert.equal(await profile.locator('[data-trait="lifetime fastclick gap"]').count(), 1);
    await profile.getByRole('button', { name: 'session history', exact: true }).click();
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
    await page.evaluate(() => { settings.shownThings.exact3BV = false; drawProfileFixture(); });
    assert.equal(await profile.locator('.board-trait-line-label[data-side="board"]').count(), 8);
    await page.evaluate(() => {
      const current = profileFixture.current;
      const identical = [{ ...current, endedAt: current.endedAt - 1000 }, current];
      const collector = createResultSectionCollector('postGame');
      renderRanks(current, identical, {}, collector);
      collector.renderInto(resultRanks);
    });
    assert.equal(await profile.locator('[data-trait="islands"]').count(), 1);
    assert.equal(await profile.locator('[data-trait="zeros"]').count(), 1, 'distinct traits survive identical table memberships');
    await page.evaluate(() => { settings.shownThings.boardPercentiles = false; drawProfileFixture(); });
    assert.equal(await profile.count(), 0);
    await page.evaluate(() => {
      const { current } = profileFixture;
      resultRanks.replaceChildren(buildBoardTimeRankProfile(current, [{ label: '3BV 75', trait: '3BV', valueText: () => '75', rawValue: (r) => r.bv3, higher: false, wins: [current] }], false, [current]));
    });
    assert.equal(await profile.locator('.board-trait-line-dot').count(), 0);
    assert((await profile.locator('.board-trait-line-unranked').textContent()).startsWith('Only one measured game:'));
    assert.equal(await profile.locator('.board-trait-line-unranked > [data-side="board"]').textContent(), '3BV 75');
    assert.equal(await profile.locator('.board-trait-line-unranked > [data-side="performance"] button').count(), 17);
    await profile.getByLabel('show actual value', { exact: true }).uncheck();
    await page.getByLabel('Page-wide session', { exact: true }).selectOption('past30min');
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    assert.equal(await page.evaluate(() => settings.sessionDefinition), 'past30min');
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
