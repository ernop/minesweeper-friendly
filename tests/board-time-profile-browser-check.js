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
        boardChangingClicks: 105, misclicks: 1, noOpClicks: 3, fastclickGapMs: 190,
        fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION, mousePathPx: 980,
        flagsPlaced: 8, flagsRemoved: 0, unusedCorrectFlags: 1, bv3: 75, zini: 49, maxAdjacent: 5, hzini: 50, islandCount: 21, zeroCount: 59,
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
          boardChangingClicks: 75 + index % 90, misclicks: index % 4, noOpClicks: index % 9,
          fastclickGapMs: 100 + index % 300, fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION, mousePathPx: 400 + index * 10,
          flagsPlaced: 8, flagsRemoved: index % 3, unusedCorrectFlags: index % 4,
          timeMs: current.timeMs + (index < rank - 1 ? index - rank + 1 : index - rank + 2) * 75,
        })));
      wins.push(current);
      wins.push(...[30000, 36000].map((timeMs, index) => ({ outcome: 'win',
        timeMs, endedAt: now - (index === 0 ? 5 : 20) * 60000, boardChangingClicks: 110, bv3: 74,
        misclicks: 0, noOpClicks: 2, fastclickGapMs: 180, fastclickGapVersion: GameData.FASTCLICK_GAP_VERSION,
        mousePathPx: 1000 })));
      wins.sort((a, b) => a.endedAt - b.endedAt);
      window.profileFixture = { current, wins };
      for (const key of ['sessionSummary', 'recentPlacements', 'timeTables', 'streak', 'nearStreak',
        'nearNearStreak', 'averageCharts', 'relationshipCharts']) settings.shownThings[key] = false;
      window.drawProfileFixture = async (options = {}) => {
        const collector = createResultSectionCollector(options.historyView ? 'scores' : 'postGame');
        await renderRanks(current, wins, options, collector);
        resultRanks.classList.add('sectioned-results');
        await collector.stream(resultRanks);
        resultsBox.hidden = false;
      };
      // A histogram's marks from left to right by redness, red minus green,
      // which rises from the standing scale's green end to its red end, and
      // its axis labels' values from left to right. This game's mark takes
      // the this-game color instead.
      window.histogramReading = (svg) => {
        const redness = (fill) => { const [r, g] = fill.match(/\d+/g).map(Number); return r - g; };
        const marks = [...svg.querySelectorAll('rect:not(.game-data-strip-this), circle:not(.game-data-strip-this)')].map((mark) => ({
          x: Number(mark.getAttribute(mark.localName === 'circle' ? 'cx' : 'x')), redness: redness(mark.getAttribute('fill')) }))
          .sort((a, b) => a.x - b.x || a.redness - b.redness);
        return {
          // Rounding each channel can lower the difference by up to 2.
          greenToRed: marks.every((mark, i) => i === 0 || mark.redness >= marks[i - 1].redness - 2),
          spread: marks.length > 1 && marks[0].redness < marks[marks.length - 1].redness,
          labels: [...svg.querySelectorAll('text')].sort((a, b) => a.getAttribute('x') - b.getAttribute('x'))
            .map((label) => parseFloat(label.textContent)),
        };
      };
      await drawProfileFixture();
    });
    const profile = page.locator('.board-time-profile');
    const names = (side) => profile.locator('.game-data-row[data-side="' + side + '"] .game-data-name')
      .evaluateAll((cells) => cells.map((cell) => cell.textContent).sort());
    const bandReady = () => page.waitForFunction(() => document.querySelector('.game-data-bar') !== null);
    await bandReady();
    assert.deepEqual(await names('performance'), ['3BV/s', 'board-changing click share', 'click rate',
      'fastclick gap', 'misclick rate', 'mouse speed', 'no-op rate', 'time', 'unflagged mine share', 'unused flag share'],
      'defaults: one row per shown measurement');
    assert.equal(await profile.locator('.game-data-row[data-measurement="unflaggedMineShare"] .game-data-value').textContent(), '20%',
      'a beginner win with 8 flags standing left 2 of its 10 mines unflagged');
    assert.deepEqual(await names('board'), ['0–1 share', '3BV', 'HZiNi', 'ZiNi', 'islands', 'max number',
      'zero-opening coverage', 'zeros'], 'board traits keep their table names; 3BV spread is off by default');
    await page.evaluate(async () => {
      // A crowded selection with every board trait the fixture measures
      // exercises row collisions and the session controls below.
      window.crowdGameData = () => {
        const crowded = ['time', 'misclickRate', 'fastclickGap', 'bvPerSecond', 'clickRate', 'efficiency', 'noopRate', 'pathPer3bv'];
        settings.gameDataMetrics = Object.fromEntries(GameData.metrics.map((m) => [m.id, crowded.includes(m.id)]));
      };
      crowdGameData();
      settings.gameDataBoardTraits.workSpread = true;
      await drawProfileFixture();
    });
    await bandReady();
    assert.equal(await profile.locator('figcaption, h4').count(), 0, 'the chart starts with its data, no heading');
    assert.deepEqual(await profile.locator('.game-data-side-title > .stat-section-toggle').allTextContents(),
      ['game summary perf', 'board traits'], 'each side is titled by the button that opens and closes it');
    assert.equal(await profile.locator('.game-data-side-title .chart-help-wrap').count(), 0,
      'the side titles carry no help (creator 2026-10-20)');
    assert.equal(await profile.locator('.game-data-band').count(), 1, 'both sides share one band');
    assert.equal(await profile.locator('.game-data-bar').count(), 1, 'and one bar');
    assert.deepEqual(await profile.locator('.game-data-controls').evaluate((row) => [...row.children]
      .map((child) => child.matches('.game-data-pool-select') ? 'compared with' : child.textContent.trim())),
    ['compared with', 'distributions', 'configure'], 'compact single-row options at the bottom (L3)');
    assert.equal(await profile.locator('.game-data-row[data-side="board"]').count(), 9);
    assert.equal(await profile.locator('.game-data-row[data-side="performance"]').count(), 8,
      'one row per measurement for the chosen pool');
    // Each side's name column head names the pool it compares against; no
    // head copies the board's name, which the preset links show (creator
    // 2026-10-20). Both side % columns are condensed into the middle bar
    // (creator 2026-11-24); board traits carry their won-boards rank column.
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="performance"] > span').allTextContents(),
      ['all games', 'value']);
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="board"] > span').allTextContents(),
      ['won boards', 'value', 'rank'], 'board traits name won boards and show value + rank without % column');
    assert.equal(await profile.locator('.game-data-band .game-data-pct').count(), 0, 'no % column on either band side');
    assert.deepEqual(await profile.locator('.game-data-row button').evaluateAll((buttons) =>
      [...new Set(buttons.map((button) => getComputedStyle(button).cursor))]), ['default'], 'never the help cursor');
    assert.equal(await profile.locator('.game-data-row[data-measurement="bv3"] .game-data-value').textContent(), '75');
    assert.equal(await profile.locator('.game-data-row[data-measurement="bv3"] .game-data-rank').textContent(), '3–24 / 24');
    assert.equal(await profile.locator('.game-data-row[data-measurement="zeroOpeningCoverage"] .game-data-name').textContent(),
      'zero-opening coverage');
    assert.equal(await profile.locator('.game-data-row[data-measurement="zeroOpeningCoverage"] .game-data-value').textContent(), '69%');
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 1,
      'at 1440px game data is in the details column');
    assert.equal(await page.locator('#result-ranks .board-time-profile').count(), 0);
    for (const width of [1920, 1100, 650, 390, 320, 280]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => syncBoardLayout());
      await profile.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const layout = await profile.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const band = el.querySelector('.game-data-band');
        const column = el.closest('#game-sidebar');
        const columnStyle = getComputedStyle(column);
        const dock = topStage.dataset.detailsDock;
        const scrolls = (node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
        return {
          host: column.id,
          dock,
          overflow: scrolls(band) || [el, ...el.querySelectorAll('*')].some((node) =>
            /auto|scroll/.test(getComputedStyle(node).overflow) && scrolls(node)),
          scale: Number(band.style.getPropertyValue('--game-data-scale')),
          width: bounds.width,
          chartHeight: el.querySelector('.game-data-section.open').getBoundingClientRect().height,
          columnSlack: dock === 'below' ? 0
            : parseFloat(columnStyle.maxHeight) - parseFloat(columnStyle.paddingBottom)
              - parseFloat(columnStyle.borderBottomWidth)
              - (bounds.bottom - column.getBoundingClientRect().top + column.scrollTop),
          nameWeight: getComputedStyle(el.querySelector('.game-data-row .game-data-name')).fontWeight,
          valueWeight: getComputedStyle(el.querySelector('.game-data-row .game-data-value')).fontWeight,
          numberWeights: [...new Set([...el.querySelectorAll('.game-data-row .game-data-rank, .game-data-decile')]
            .map((cell) => getComputedStyle(cell).fontWeight))],
          sizes: ['.game-data-name', '.game-data-value'].map((name) =>
            parseFloat(getComputedStyle(el.querySelector('.game-data-row ' + name)).fontSize)),
          blocks: [...el.querySelectorAll('.game-data-block')].map((block) => {
            const barEl = block.querySelector('.game-data-bar');
            const bar = barEl.getBoundingClientRect();
            const domain = [Number(barEl.dataset.domainLow), Number(barEl.dataset.domainHigh)];
            const ticks = [...block.querySelectorAll('.game-data-decile')].map((label) => {
              const r = label.getBoundingClientRect();
              return { text: label.textContent, top: r.top, bottom: r.bottom };
            });
            const center = (node) => { const r = node.getBoundingClientRect(); return r.left + r.width / 2; };
            return {
              barWidth: bar.width,
              ticks,
              leaders: block.querySelectorAll('.game-data-leader').length,
              title: [...block.querySelectorAll('.game-data-side-title')].map(center),
              heads: [...block.querySelectorAll('.game-data-column-heads')].map(center),
              rows: [...block.querySelectorAll('.game-data-row')].map((row) => {
                const rect = row.getBoundingClientRect();
                const dot = row.nextElementSibling.getBoundingClientRect();
                const percentile = Number(row.dataset.percentile);
                return { side: row.dataset.side, top: rect.top, bottom: rect.bottom, height: rect.height,
                  inside: rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5,
                  dotOffset: dot.top + dot.height / 2 - (bar.top + GameData.barFraction(percentile, domain) * bar.height) };
              }),
            };
          }),
        };
      });
      assert.equal(layout.host, 'game-sidebar', width + 'px game data host');
      // Below the narrowest plan a band shrinks as a whole rather than
      // scrolling, shortening names, or hiding values.
      assert.equal(layout.overflow, false, width + 'px nothing in game data scrolls');
      assert.equal(layout.scale < 1, width <= 320, width + 'px only narrow widths scale the band: ' + layout.scale);
      assert.equal(layout.nameWeight, '400');
      assert.equal(layout.valueWeight, '400', 'numbers are never bold');
      assert.deepEqual(layout.numberWeights, ['400'], 'ranks and bar labels are never bold');
      assert(layout.sizes[1] > layout.sizes[0], 'values outsize their names: ' + layout.sizes);
      for (const block of layout.blocks) {
        assert(Math.abs(block.barWidth - 40 * layout.scale) < 0.6, width + 'px bar width ' + block.barWidth);
        assert.equal(block.leaders, block.rows.length, 'every row has a leader');
        assert(block.ticks.length >= 2 && block.ticks.every((t, i) => i === 0 || t.top >= block.ticks[i - 1].bottom - 0.5),
          width + 'px bar ticks never overlap: ' + JSON.stringify(block.ticks));
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
          width + 'px row collisions must never move the dots off their logit positions: ' + JSON.stringify(block.rows.map((r) => r.dotOffset)));
      }
      // The chart fills the column below any other content; a column too
      // short for each open side's minimum scrolls instead of crushing it.
      assert(layout.width <= width && layout.chartHeight >= 479.5
        && (Math.abs(layout.columnSlack) <= 1 || Math.abs(layout.chartHeight - 480) < 1),
      width + 'px chart fills its column below any other content: ' + JSON.stringify([layout.chartHeight, layout.columnSlack]));
      await profile.screenshot({ path: '/tmp/game-data-scoped-' + width + '.png' });
    }
    const zeros = profile.locator('.game-data-row[data-measurement="zeroCount"] button');
    // Off the popover, so no row scrolled under the pointer takes the card.
    await page.mouse.move(0, 0);
    const bandBefore = await profile.boundingBox();
    await zeros.focus();
    const card = page.locator('.chart-help-tip .game-data-card');
    assert.equal(await card.getAttribute('data-pool'), 'all', 'the card follows the compared-with picker');
    // The band card opens with the rank and exact tail-aware percentile
    // (band rows omit their % column).
    assert.equal(await card.locator('p').first().innerText(), 'all games: all 50 won boards have this value · 50%');
    assert.equal(await card.locator('.game-data-card-definition').count(), 0, 'a self-evident trait has no definition');
    assert(!/÷|=|settings|so far|This is/.test(await card.innerText()), await card.innerText());
    assert.equal(await card.locator('svg.game-data-histogram').count(), 1, 'the card draws the distribution');
    assert.deepEqual(await card.locator('svg text').allTextContents(), ['59'],
      'the card labels its axis and names no better end: better is always on the left');
    assert(await page.locator('.chart-help-tip').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.matches(':popover-open') && el.contains(document.elementFromPoint(r.left + 8, r.top + 8));
    }), 'the card stays above the compact sidebar');
    assert.deepEqual(await profile.boundingBox(), bandBefore, 'the card does not reflow the chart');
    await zeros.evaluate((button) => button.blur());
    // Better is always on the left (creator 2026-10-11): a card's marks run
    // from green to red, and a higher-is-better axis reads high to low.
    const cardReading = async (measurement) => {
      const button = profile.locator('.game-data-row[data-measurement="' + measurement + '"] button');
      await button.focus();
      const reading = await page.locator('.chart-help-tip .game-data-card svg').evaluate((svg) => histogramReading(svg));
      await page.locator('.chart-help-tip').screenshot({ path: '/tmp/game-data-card-' + measurement + '.png' });
      await button.evaluate((node) => node.blur());
      return reading;
    };
    for (const [measurement, higher] of [['clickRate', true], ['time', false]]) {
      const reading = await cardReading(measurement);
      assert(reading.greenToRed && reading.spread, measurement + ' card: green on the left: ' + JSON.stringify(reading));
      assert(reading.labels.length > 1 && reading.labels.every((value, i) => i === 0
        || (higher ? value < reading.labels[i - 1] : value > reading.labels[i - 1])),
      measurement + ' card labels run ' + (higher ? 'high to low' : 'low to high') + ': ' + reading.labels);
    }
    const comparisons = await page.evaluate(async () => {
      const { current, wins } = profileFixture;
      return boardTraitRankProfile(current, boardMetricCandidates([current], wins), wins, settings.gameDataPool, settings.sessionDefinition)
        .map(({ metricId, name, rank, total, percentile, valueText }) => ({ metricId, name, rank, total, percentile, valueText }));
    });
    assert.deepEqual(comparisons.find((row) => row.metricId === 'maxAdjacent'),
      { metricId: 'maxAdjacent', name: 'max number', rank: 142, total: 283, percentile: 50, valueText: '5' });
    assert.equal(comparisons.find((row) => row.metricId === 'zeroOpeningCoverage').percentile, 50);
    assert.equal(comparisons.find((row) => row.metricId === 'zeroOneShare').valueText, '60%');
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width: 1920, height: 1100 });
    await page.evaluate(async () => {
      syncGameSidebar();
      settings.shownThings.timeTables = true;
      settings.shownThings.recentPlacements = true;
      await drawProfileFixture();
    });
    await bandReady();
    assert.equal(await page.locator('#result-stats .board-time-profile').count(), 1, 'in the one details column at 1920px');
    assert.equal(await page.locator('#result-ranks .board-time-profile').count(), 0, 'no duplicate in the lower chart collection');
    await profile.screenshot({ path: '/tmp/game-data-sidebar.png' });
    // Each side's title opens and closes it in the one chart (creator
    // 2026-10-17: the two sides "share the same percentile distribution
    // chart"); a closed side keeps its title, and the open side keeps the bar.
    const sideToggle = (name) => profile.locator('.game-data-side-title > .stat-section-toggle', { hasText: name });
    const chartState = () => profile.evaluate((el) => ({
      open: el.querySelector('.game-data-section').classList.contains('open'),
      titles: [...el.querySelectorAll('.game-data-side-title > .stat-section-toggle')]
        .map((toggle) => toggle.textContent + ': ' + toggle.getAttribute('aria-expanded')),
      rows: ['performance', 'board'].map((side) => el.querySelectorAll('.game-data-row[data-side="' + side + '"]').length),
      bars: el.querySelectorAll('.game-data-bar').length,
      height: el.querySelector('.game-data-section').getBoundingClientRect().height,
      focused: document.activeElement.textContent,
    }));
    const bothOpen = await chartState();
    await sideToggle('board traits').click();
    let sides = await chartState();
    assert.deepEqual(sides.titles, ['game summary perf: true', 'board traits: false']);
    assert.deepEqual([sides.rows, sides.bars], [[bothOpen.rows[0], 0], 1], 'board traits closed: the band keeps your performance');
    assert.equal(sides.focused, 'board traits', 'its title keeps the focus');
    assert.equal(await page.evaluate(() => settings.panels.boardTraits), false, 'remembered');
    await sideToggle('game summary perf').click();
    sides = await chartState();
    assert.deepEqual([sides.open, sides.bars, sides.rows], [false, 0, [0, 0]], 'both closed: the titles alone');
    assert(sides.height < 40, 'both closed, the chart is one line: ' + sides.height);
    await profile.screenshot({ path: '/tmp/game-data-closed.png' });
    await sideToggle('game summary perf').click();
    await sideToggle('board traits').click();
    await bandReady();
    sides = await chartState();
    assert.deepEqual([sides.open, sides.bars, sides.rows], [true, 1, bothOpen.rows], 'both reopened');
    // The docked column's left edge resizes it with the mouse (creator
    // 2026-10-17: "you must allow that section, also, to be
    // widenable/narrowable with mouse"); game data follows, the share saves.
    const grip = page.locator('#details-resize');
    const sidebar = page.locator('#game-sidebar');
    const columnWidth = async () => (await sidebar.boundingBox()).width;
    const chartWidth = () => profile.locator('.game-data-section').evaluate((el) => el.getBoundingClientRect().width);
    const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dragGrip = async (dx) => {
      const box = await grip.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + 40;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y);
      await page.mouse.move(x + dx, y);
      await page.mouse.up();
      await frames();
    };
    assert(await grip.isVisible(), 'the docked column has its resize grip');
    const gripBox = await grip.boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    assert(gripBox.x + gripBox.width <= sidebarBox.x && sidebarBox.x - gripBox.x <= 18,
      'the grip sits in the gap left of the column: ' + JSON.stringify([gripBox, sidebarBox]));
    assert(Math.abs(gripBox.y - sidebarBox.y) < 1 && Math.abs(gripBox.height - sidebarBox.height) < 1,
      'the grip spans the column: ' + JSON.stringify([gripBox, sidebarBox]));
    const widest = Number(await grip.getAttribute('aria-valuemax'));
    await dragGrip(-2000);
    assert(Math.abs(await columnWidth() - widest) <= 1, 'widening stops where the board column keeps its room: '
      + await columnWidth() + ' vs ' + widest);
    const wideChart = await chartWidth();
    await dragGrip(250);
    assert(Math.abs(await columnWidth() - (widest - 250)) <= 1, 'dragging right 250px narrows it by 250px: ' + await columnWidth());
    assert(await chartWidth() < wideChart - 200, 'game data narrows with the column: ' + wideChart + ' -> ' + await chartWidth());
    await dragGrip(-100);
    const dragged = await columnWidth();
    assert(Math.abs(dragged - (widest - 150)) <= 1, 'dragging left 100px widens it by 100px: ' + dragged);
    assert(Math.abs(await page.evaluate(() => settings.detailsColumnShare * innerWidth) - dragged) <= 1,
      'the setting holds the dragged width as a share of the window');
    await grip.focus();
    await page.keyboard.press('ArrowLeft');
    await frames();
    assert(Math.abs(await columnWidth() - dragged - 10) <= 1, 'the left arrow widens it by 10px');
    await dragGrip(2000);
    assert(Math.abs(await columnWidth() - 320) <= 1, 'narrowing stops at 320px: ' + await columnWidth());
    await page.setViewportSize({ width: 600, height: 1100 });
    await frames();
    assert(await grip.isHidden(), 'no grip on the Game details popover');
    await page.setViewportSize({ width: 1920, height: 1100 });
    await page.evaluate(() => { settings.detailsColumnShare = 0.46; syncBoardLayout(); });
    await frames();
    await bandReady();
    const timeRow = profile.locator('.game-data-row[data-measurement="time"]');
    const allBefore = await timeRow.getAttribute('data-percentile');
    assert.equal(await timeRow.locator('.game-data-value').textContent(), '33.542s');
    const picker = page.getByLabel('session', { exact: true });
    const poolPicker = profile.getByLabel('compared with', { exact: true });
    assert.equal(await page.locator('select:has(option[value="today6am"])').count(), 1, 'the page has exactly one session picker');
    assert.equal(await page.locator('#settings-row #session-definition-select').count(), 1,
      'the one picker is in the settings row at the page foot');
    assert.equal(await picker.inputValue(), 'today', 'the session defaults to today');
    assert.equal(await poolPicker.inputValue(), 'all', 'game data compares against all games by default');
    assert.equal(await page.locator('.recent-placements h4').textContent(), 'ranks won in session');
    assert.equal(await page.locator('.recent-placements select').count(), 0, 'ranks won only says session');
    // Switching compared with to session follows the one page-wide session picker.
    await poolPicker.selectOption('session');
    await bandReady();
    assert.equal(await page.evaluate(() => settings.gameDataPool), 'session');
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="performance"] > span').allTextContents(),
      ['session', 'value']);
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="board"] > span').allTextContents(),
      ['session wins', 'value', 'rank']);
    assert.equal(await profile.locator('.game-data-unplotted').count(), 0, 'no "Not ranked in this session yet" note');
    await picker.selectOption('past10min');
    assert.equal(await page.evaluate(() => settings.sessionDefinition), 'past10min');
    await page.waitForFunction(() => document.querySelector('.game-data-row[data-measurement="time"][data-pool="session"]')?.dataset.percentile === '100');
    await picker.selectOption('pastHour');
    await page.waitForFunction(() => document.querySelector('.game-data-row[data-measurement="time"][data-pool="session"]')?.dataset.percentile === '50',
      null, { timeout: 5000 });
    assert.equal(await page.locator('.recent-placements h4').textContent(), 'ranks won in session');
    assert.equal(await page.locator('#metrics-panel').count(), 0, 'the page has no left stats panel');
    // In session mode every card shows the session: its standing, tail-aware %,
    // and its games (one dot each for a small pool).
    await timeRow.locator('button').hover();
    const sessionCard = page.locator('.chart-help-tip .game-data-card');
    assert.equal(await sessionCard.getAttribute('data-pool'), 'session');
    assert.equal(await sessionCard.locator('p').first().innerText(), 'session: 2nd of 3 wins · 50%',
      'the band card opens with the rank and exact percentile');
    assert(await sessionCard.locator('text').count() > 0, 'the card’s strip labels its x ticks');
    assert.equal(await sessionCard.locator('.game-data-histogram-dot').count(), 3, 'the session’s 3 wins, one dot each');
    assert.equal(await sessionCard.locator('.game-data-card-definition').count(), 0, 'time needs no definition');
    // No key narrates the marks (creator 2026-10-08: "Green line: this
    // game. ..." and similar text shall not appear): the rank and the chart.
    assert.deepEqual(await sessionCard.evaluate((card) => [...card.children].map((child) => child.tagName.toLowerCase())),
      ['p', 'svg'], 'the card holds the rank and the chart, no key');
    assert(!/÷|=|settings|so far|This is|this session|line:|Ticks|per win/.test(await sessionCard.innerText()), await sessionCard.innerText());
    assert.deepEqual(await sessionCard.locator('.game-data-strip-this, .game-data-strip-pin').evaluateAll((marks) =>
      marks.map((mark) => [mark.localName, getComputedStyle(mark).fill, getComputedStyle(mark).stroke])),
    [['circle', 'rgb(135, 206, 250)', 'rgb(0, 0, 0)'], ['path', 'rgb(135, 206, 250)', 'rgb(0, 0, 0)']],
    'this game is its own dot in the this-game light blue, under a pin at its value, both edged in black');
    await page.mouse.move(0, 0);
    // Board-match pools scope game summary perf to matching boards (own axis),
    // while board traits stay on all won boards.
    await poolPicker.selectOption('board:bv3');
    await bandReady();
    assert.equal(await page.evaluate(() => settings.gameDataPool), 'board:bv3');
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="performance"] > span').allTextContents(),
      ['3BV 75', 'value']);
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="board"] > span').allTextContents(),
      ['won boards', 'value', 'rank'], 'board traits use all won boards for a board-match pool');
    assert.equal(await profile.locator('.game-data-row[data-side="board"]').count(), 9, 'all 9 board traits still rank');
    assert.equal(Math.round(Number(await timeRow.getAttribute('data-percentile'))), 14, '4th of 22 wins in 3BV 75');
    await timeRow.locator('button').hover();
    const bv3Card = page.locator('.chart-help-tip .game-data-card');
    assert.equal(await bv3Card.getAttribute('data-pool'), 'board:bv3');
    assert.equal(await bv3Card.locator('p').first().innerText(), '3BV 75: 4th of 22 wins · 14%');
    const bv3Labels = await bv3Card.locator('svg text').evaluateAll((nodes) => nodes.map((n) => parseFloat(n.textContent)));
    assert(bv3Labels.every((v) => v >= 33 && v <= 35), 'board-match card draws on the 3BV 75 pool’s own axis: ' + JSON.stringify(bv3Labels));
    await page.mouse.move(0, 0);
    // Time-window pools (e.g. past week) apply to both sides.
    await poolPicker.selectOption('past-week');
    await bandReady();
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="performance"] > span').allTextContents(),
      ['past week', 'value']);
    assert.deepEqual(await profile.locator('.game-data-column-heads[data-side="board"] > span').allTextContents(),
      ['past week · wins', 'value', 'rank']);
    await poolPicker.selectOption('all');
    await bandReady();
    assert.equal(await timeRow.getAttribute('data-percentile'), allBefore);
    // Distributions: one strip per measurement in one group per side, both
    // sides on one set of columns, sharing the compared-with picker, and the
    // strips take whatever height the rows leave.
    const distributionsShown = async (poolId) => {
      await page.waitForFunction((want) => document.querySelector('.game-data-pool-select select')?.value === want
        && !document.querySelector('.board-time-profile').hasAttribute('aria-busy'), poolId);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await profile.locator('.game-data-distributions').count(), 1, 'one distributions view for both sides');
      return profile.locator('.game-data-distributions').evaluate((view) => {
        const strips = [...view.querySelectorAll('.game-data-strip')];
        return {
          // Each group: its side, then its head's name (pool), strip, and pct cells.
          heads: [...view.querySelectorAll('.game-data-dist-section')].map((section) => [section.dataset.side,
            section.querySelector('.game-data-dist-head .game-data-name').textContent,
            section.querySelector('.game-data-dist-head .game-data-strip-head').textContent,
            section.querySelector('.game-data-dist-head .game-data-pct').textContent]),
          poolTitles: view.querySelectorAll('.game-data-pool-title').length,
          titles: [...view.querySelectorAll(':scope > .game-data-side-title > .stat-section-toggle')]
            .map((toggle) => toggle.textContent),
          rows: strips.length,
          stripLefts: [...new Set(strips.map((strip) => Math.round(strip.getBoundingClientRect().left)))],
          stripHeights: [...new Set(strips.map((strip) => strip.getBoundingClientRect().height))],
          drawnHeights: [...new Set(strips.map((strip) => strip.querySelector('svg').viewBox.baseVal.height))],
          // Drawn at the px width of their column, not stretched to it.
          drawnWidths: [...new Set(strips.map((strip) => strip.querySelector('svg').viewBox.baseVal.width - strip.clientWidth))],
          unlabeled: strips.filter((strip) => strip.querySelectorAll('text').length === 0
            || strip.querySelectorAll('.game-data-histogram-tick').length === 0).length,
          slack: view.clientHeight - (view.lastElementChild.getBoundingClientRect().bottom
            - view.getBoundingClientRect().top - view.clientTop),
          scrolls: view.scrollHeight > view.clientHeight + 1 || view.scrollWidth > view.clientWidth + 1,
          note: view.querySelector('.game-data-unplotted')?.textContent ?? null,
          captions: [...view.children].filter((child) => !child.matches('.game-data-dist-section, .game-data-unplotted, .game-data-side-title'))
            .map((child) => child.textContent),
        };
      });
    };
    // One more pixel of strip would overflow the box, and every strip is
    // drawn at its laid-out height, so its ticks and axis gap keep their size.
    const fillsBox = (shown, label) => {
      assert.equal(shown.scrolls, false, label + ': no scrolling');
      assert.equal(shown.stripHeights.length, 1, label + ': one strip height');
      assert.deepEqual(shown.drawnHeights, shown.stripHeights, label + ': strips drawn at their laid-out height');
      assert.deepEqual(shown.drawnWidths, [0], label + ': and at their column\u2019s width');
      assert.equal(shown.unlabeled, 0, label + ': every strip has x ticks with labels');
      assert(shown.slack >= 0 && shown.slack < shown.rows * 1.2 + 4, label + ': the strips fill the box: ' + JSON.stringify(shown));
    };
    await profile.getByLabel('distributions', { exact: true }).check();
    let shown = await distributionsShown('all');
    assert.equal(await page.evaluate(() => settings.gameDataDistributions), true);
    assert.deepEqual(shown.heads, [
      ['performance', 'all games', '', '%'], ['board', 'won boards', '', '%']],
    'one group per side; each names its pool in its name head');
    assert.equal(shown.poolTitles, 0, 'no pool title lines (creator 2026-10-20)');
    assert.deepEqual(shown.titles, ['game summary perf', 'board traits'], 'each side under its title');
    assert.equal(shown.note, null, 'no unranked note');
    assert.equal(shown.rows, await profile.locator('.game-data-dist-row svg.game-data-histogram').count());
    const stripReadings = await profile.locator('.game-data-dist-row').evaluateAll((rows) => rows.map((row) =>
      ({ measurement: row.dataset.measurement, ...histogramReading(row.querySelector('svg')) })));
    assert.deepEqual(stripReadings.filter((strip) => !strip.greenToRed), [], 'every strip has its better end on the left');
    assert(['clickRate', 'bvPerSecond', 'time'].every((measurement) =>
      stripReadings.some((strip) => strip.measurement === measurement && strip.spread)),
    'higher- and lower-is-better strips both run green to red: ' + JSON.stringify(stripReadings));
    assert.equal(shown.stripLefts.length, 1, 'all groups of both sides line up their strips: ' + JSON.stringify(shown.stripLefts));
    await profile.screenshot({ path: '/tmp/game-data-distributions.png' });
    fillsBox(shown, 'all');
    assert.deepEqual(shown.captions, [], 'nothing but groups under the strips: no key');
    const allStrip = shown.stripHeights[0];
    // Board-match pool in distributions: perf shows 3BV 75, board traits stays all games.
    await poolPicker.selectOption('board:bv3');
    shown = await distributionsShown('board:bv3');
    assert.deepEqual(shown.heads, [['performance', '3BV 75', '', '%'], ['board', 'won boards', '', '%']]);
    fillsBox(shown, 'board:bv3');
    await poolPicker.selectOption('all');
    shown = await distributionsShown('all');
    // Closing a side gives its height to the other side's strips; its title stays.
    await sideToggle('board traits').click();
    shown = await distributionsShown('all');
    assert.deepEqual(shown.heads, [['performance', 'all games', '', '%']], 'board traits closed');
    assert.deepEqual(shown.titles, ['game summary perf', 'board traits'], 'its title stays');
    fillsBox(shown, 'board traits closed');
    assert(shown.stripHeights[0] > allStrip, 'a closed side gives its height to the other: '
      + shown.stripHeights[0] + ' px vs ' + allStrip + ' px');
    await sideToggle('game summary perf').click();
    shown = await distributionsShown('all');
    assert.deepEqual(shown.heads, [], 'both closed: the titles alone');
    await sideToggle('game summary perf').click();
    await sideToggle('board traits').click();
    shown = await distributionsShown('all');
    assert.deepEqual(shown.stripHeights, [allStrip], 'both reopened');
    // Removing measurements gives the rest their height.
    await profile.locator('.game-data-controls [data-view="config"]').click();
    const allMeasurements = profile.getByLabel('all performance measurements', { exact: true });
    await allMeasurements.check();
    await allMeasurements.uncheck();
    await profile.locator('.game-data-config input[aria-label="time"]').check();
    await profile.getByRole('button', { name: 'back to game data' }).first().click();
    shown = await distributionsShown('all');
    assert.equal(shown.rows, 1 + 9, 'time and the board traits');
    fillsBox(shown, 'one measurement');
    assert(shown.stripHeights[0] > allStrip, 'removed measurements give the rest their height: '
      + shown.stripHeights[0] + ' px vs ' + allStrip + ' px');
    await profile.screenshot({ path: '/tmp/game-data-distributions-few.png' });
    // Session alone: unmeasured traits are simply omitted, with no unranked note.
    await poolPicker.selectOption('session');
    shown = await distributionsShown('session');
    assert.deepEqual(shown.heads, [['performance', 'session', '', '%'], ['board', 'session wins', '', '%']]);
    assert.deepEqual(shown.captions, [], 'only groups under the strips: no key');
    assert.equal(shown.note, null, 'no unranked note');
    assert.equal(shown.rows, 2, 'only time and 3BV have two measured session games');
    fillsBox(shown, 'session');
    // A no-mark win ranks among no-mark games alone, and its heads say so
    // as the band's do.
    await page.evaluate(async () => {
      settings.gameDataPool = 'all';
      const marklessWins = profileFixture.wins.map((win) => ({ ...win, flagsPlaced: 0 }));
      const current = marklessWins.find((win) => win.endedAt === profileFixture.current.endedAt);
      const collector = createResultSectionCollector('postGame');
      await renderRanks(current, marklessWins, {}, collector);
      await collector.stream(resultRanks);
    });
    shown = await distributionsShown('all');
    assert.deepEqual(shown.heads, [['performance', 'no-mark', '', '%'], ['board', 'no-mark wins', '', '%']]);
    await poolPicker.selectOption('session');
    shown = await distributionsShown('session');
    assert.deepEqual(shown.heads, [['performance', 'no-mark session', '', '%'], ['board', 'no-mark session wins', '', '%']]);
    assert.match(await profile.locator('.game-data-dist-section[data-side="performance"][data-pool="session"] '
      + '.game-data-dist-row[data-measurement="time"] button').getAttribute('aria-label'), /^time 33\.542s: no-mark session \d+%$/);
    await poolPicker.selectOption('board:bv3');
    shown = await distributionsShown('board:bv3');
    assert.deepEqual(shown.heads, [['performance', '3BV 75 · no-mark', '', '%'], ['board', 'no-mark wins', '', '%']]);
    fillsBox(shown, 'no-mark');
    await page.evaluate(async () => { crowdGameData(); settings.gameDataPool = 'all'; await drawProfileFixture(); });
    await distributionsShown('all');
    await profile.getByLabel('distributions', { exact: true }).uncheck();
    await bandReady();
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('show values', { exact: true }).uncheck();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await bandReady();
    assert.equal(await profile.locator('.game-data-row .game-data-value:visible').count(), 0);
    assert.equal(await timeRow.locator('.game-data-name').innerText(), 'time');
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('show values', { exact: true }).check();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
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
    // Board traits have their own list in configure, apart from the This
    // board table switches (creator 2026-10-14), and scoped rows sit between
    // performance measurements and board traits (creator 2026-11-24).
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    assert.deepEqual(await profile.locator('.game-data-config h4').allTextContents(),
      ['performance measurements', 'time in specific pools', 'other scoped measurements', 'board traits']);
    // Pick several scoped time rows (3BV, zeros, islands, past week) plus a
    // scoped click-rate row and verify they plot alongside base rows.
    await profile.getByLabel('time · same 3BV', { exact: true }).check();
    await profile.getByLabel('time · same zeros', { exact: true }).check();
    await profile.getByLabel('time · same islands', { exact: true }).check();
    await profile.getByLabel('time · past week', { exact: true }).check();
    await profile.getByLabel('scoped measurement', { exact: true }).selectOption('clickRate');
    await profile.getByLabel('scoped pool', { exact: true }).selectOption('board:bv3');
    await profile.getByRole('button', { name: 'add', exact: true }).click();
    assert.equal(await profile.getByRole('button', { name: 'add', exact: true }).isDisabled(), true,
      'already-added scoped measurement cannot be added twice');
    assert.deepEqual(await profile.locator('.game-data-scoped-list td:first-child').allTextContents(),
      ['click rate · same 3BV']);
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.locator(':scope[aria-busy="true"]').waitFor({ state: 'hidden' });
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.all"] .game-data-name').textContent(), 'time');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.all"] .game-data-value').textContent(), '33.542s');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:bv3"] .game-data-name').textContent(), 'time · 3BV 75');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:bv3"] .game-data-value').textContent(), '4th / 22',
      'scoped row replaces repeated value with compact rank when base measurement is shown');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:zeroCount"] .game-data-name').textContent(), 'time · zeros 59');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:zeroCount"] .game-data-value').textContent(), '24th / 50');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:islandCount"] .game-data-name').textContent(), 'time · islands 21');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:islandCount"] .game-data-value').textContent(), '56th / 137');
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.past-week"] .game-data-name').textContent(), 'time · past week');
    assert.equal(await profile.locator('.game-data-row[data-row-id="clickRate.board:bv3"] .game-data-name').textContent(), 'click rate · 3BV 75');
    await profile.screenshot({ path: '/tmp/game-data-scoped-rows.png' });
    // Cross-bar hover links: hovering time · 3BV 75 rings 3BV on board traits,
    // and hovering 3BV rings both 3BV-scoped performance rows on the left.
    await profile.locator('.game-data-row[data-row-id="time.board:bv3"] button').hover();
    const scopedBv3Card = page.locator('.chart-help-tip .game-data-card');
    assert.equal(await scopedBv3Card.locator('p').first().innerText(), '3BV 75: 4th of 22 wins · 14%');
    assert.deepEqual(await profile.locator('.game-data-row.game-data-linked').evaluateAll((rows) => rows.map((r) => [r.dataset.side, r.dataset.rowId])),
      [['board', 'bv3.all']], 'hovering board-scoped perf row rings paired board trait');
    await profile.locator('.game-data-row[data-side="board"][data-measurement="bv3"] button').hover();
    assert.deepEqual(await profile.locator('.game-data-row.game-data-linked').evaluateAll((rows) => rows.map((r) => [r.dataset.side, r.dataset.rowId]).sort()),
      [['performance', 'clickRate.board:bv3'], ['performance', 'time.board:bv3']],
      'hovering board trait rings all matching board-scoped perf rows');
    await profile.screenshot({ path: '/tmp/game-data-hover-link.png' });
    await page.mouse.move(0, 0);
    assert.equal(await profile.locator('.game-data-row.game-data-linked').count(), 0);
    // Distributions view places scoped rows directly under their base metric
    // and uses compact rank when the base row is shown; distributions cards
    // omit % since the row already prints it.
    await profile.getByLabel('distributions', { exact: true }).check();
    await distributionsShown('all');
    const perfDistIds = await profile.locator('.game-data-dist-section[data-side="performance"] .game-data-dist-row')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.rowId));
    assert.deepEqual(perfDistIds.slice(0, 5),
      ['time.all', 'time.past-week', 'time.board:bv3', 'time.board:islandCount', 'time.board:zeroCount'],
      'scoped time strips sit right below time in canonical pool order');
    assert.equal(await profile.locator('.game-data-dist-row[data-row-id="time.board:bv3"] .game-data-value').textContent(), '4th / 22');
    assert.equal(perfDistIds.includes('clickRate.board:bv3'), true);
    await profile.locator('.game-data-dist-row[data-row-id="time.board:bv3"] button').hover();
    assert.equal(await page.locator('.chart-help-tip .game-data-card p').first().innerText(), '3BV 75: 4th of 22 wins',
      'distributions card keeps rank alone without repeating %');
    await page.mouse.move(0, 0);
    await profile.screenshot({ path: '/tmp/game-data-scoped-rows-dist.png' });
    await profile.getByLabel('distributions', { exact: true }).uncheck();
    await bandReady();
    // Unchecking base time makes scoped time rows display the measured value.
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.locator('.game-data-config input[aria-label="time"]').uncheck();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.locator(':scope[aria-busy="true"]').waitFor({ state: 'hidden' });
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-row-id="time.board:bv3"] .game-data-value').textContent(), '33.542s',
      'when base time is hidden, scoped time keeps the measured value');
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.locator('.game-data-config input[aria-label="time"]').check();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.locator(':scope[aria-busy="true"]').waitFor({ state: 'hidden' });
    await bandReady();
    // Clean up scoped rows via configure (testing remove and all-time-pools toggle).
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByRole('button', { name: 'remove click rate · same 3BV', exact: true }).click();
    assert.equal(await profile.locator('.game-data-scoped-list').isHidden(), true);
    const allTimePools = profile.getByLabel('all time pools', { exact: true });
    assert.equal(await allTimePools.evaluate((input) => input.indeterminate), true);
    await allTimePools.check();
    await allTimePools.uncheck();
    assert.deepEqual(await page.evaluate(() => settings.gameDataScopedRows), []);
    const traitList = profile.locator('.game-data-config table[data-config-section="gameDataBoardTraits"]');
    assert.deepEqual(await traitList.locator('tbody input').evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label'))),
      ['3BV', 'ZiNi', 'max number', 'HZiNi', '3BV spread', '0–1 share', 'zero-opening coverage', 'islands', 'largest island', 'zeros'],
      'one box per board trait, in game data’s row order');
    assert.deepEqual(await traitList.locator('tbody button').allTextContents(),
      ['ZiNi', 'HZiNi', '3BV spread', '0–1 share', 'zero-opening coverage', 'islands', 'largest island'],
      'a definition exactly where the trait’s card has one');
    const allTraits = profile.getByLabel('all board traits', { exact: true });
    assert.equal(await allTraits.evaluate((input) => input.indeterminate), true, 'largest island is off: a mixed list');
    await allTraits.check();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataBoardTraits).every(Boolean)), true);
    await allTraits.uncheck();
    assert.equal(await page.evaluate(() => Object.values(settings.gameDataBoardTraits).some(Boolean)), false);
    await profile.getByLabel('islands', { exact: true }).check();
    await profile.getByLabel('zeros', { exact: true }).check();
    await profile.screenshot({ path: '/tmp/game-data-config-board-traits.png' });
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await profile.locator(':scope[aria-busy="true"]').waitFor({ state: 'hidden' });
    await bandReady();
    assert.deepEqual(await names('board'), ['islands', 'zeros'], 'only the chosen board traits');
    // With nothing chosen on either list, the note says so, not the two-game minimum.
    await page.evaluate(async () => {
      window.savedPerformance = { ...settings.gameDataMetrics };
      settings.gameDataMetrics = Object.fromEntries(Object.keys(savedPerformance).map((id) => [id, false]));
      settings.gameDataBoardTraits = Object.fromEntries(Object.keys(GAME_DATA_BOARD_TRAIT_DEFAULTS).map((id) => [id, false]));
      await drawProfileFixture();
    });
    assert.equal(await profile.locator('.game-data-unplotted').textContent(),
      'Nothing chosen to rank: choose measurements or board traits with configure.');
    await page.evaluate(async () => {
      settings.gameDataMetrics = savedPerformance;
      settings.gameDataBoardTraits = { ...GAME_DATA_BOARD_TRAIT_DEFAULTS, workSpread: true };
      saveSettings();
      await drawProfileFixture();
    });
    await bandReady();
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
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
    assert.equal(await profile.locator('.game-data-row[data-side="board"]').count(), 9,
      'a This board table switch leaves game data’s board traits alone');
    await page.evaluate(async () => {
      const current = profileFixture.current;
      const identical = [{ ...current, endedAt: current.endedAt - 1000 }, current];
      const collector = createResultSectionCollector('postGame');
      await renderRanks(current, identical, {}, collector);
      await collector.stream(resultRanks);
    });
    await bandReady();
    assert.equal(await profile.locator('.game-data-row[data-measurement="islandCount"]').count(), 1);
    assert.equal(await profile.locator('.game-data-row[data-measurement="zeroCount"]').count(), 1,
      'distinct traits survive identical table memberships');
    await page.evaluate(async () => { settings.shownThings.boardPercentiles = false; await drawProfileFixture(); });
    assert.equal(await profile.count(), 0);
    await page.evaluate(async () => {
      const { current } = profileFixture;
      window.savedBoardTraits = { ...settings.gameDataBoardTraits };
      settings.gameDataBoardTraits = Object.fromEntries(Object.keys(savedBoardTraits).map((id) => [id, id === 'bv3']));
      const host = buildBoardTimeRankProfile(current, [current], current.endedAt);
      resultRanks.replaceChildren(host);
      await host.analysisReady;
    });
    assert.equal(await profile.locator('.game-data-dot, .game-data-row').count(), 0, 'one-game measurements are omitted');
    assert.equal(await profile.locator('.game-data-unplotted').textContent(),
      'Nothing to rank yet: every comparison needs at least two measured games.');
    await page.evaluate(async () => {
      settings.gameDataBoardTraits = savedBoardTraits;
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
    const bvPercent = await page.evaluate((p) => GameData.formatPercentile(p), Number(await bvRow.getAttribute('data-percentile')));
    assert.equal(await page.locator('.result-chart-section-boardCharts [data-measurement="bv3"] .game-data-chart-chip').textContent(),
      'this 75 · ' + bvPercent);
    assert.equal(await page.locator('.result-chart-section-perfCharts [data-measurement="clickRate"] .game-data-chart-chip').count(), 1);
    assert(await page.locator('.result-chart-section-perfCharts h4').first().textContent()
      .then((text) => text.startsWith('ms / 3BV by ')), 'your perf average charts normalize by 3BV');
    await bvRow.hover();
    assert.deepEqual(await page.locator('.game-data-linked').evaluateAll((charts) => charts.map((chart) => chart.dataset.measurement)),
      ['bv3'], 'hovering a band row outlines its chart');
    assert.match(await page.locator('.game-data-linked').evaluate((chart) => getComputedStyle(chart).boxShadow),
      /rgb\(135, 206, 250\)/, 'the outline is the this-game light blue');
    await page.mouse.move(0, 0);
    assert.equal(await page.locator('.game-data-linked').count(), 0);
    await page.evaluate(async () => { settings.boardChartMode = 'distribution'; await drawProfileFixture(); });
    assert.equal(await page.locator('.result-chart-section-perfCharts select').inputValue(), 'average');
    assert.equal(await page.locator('.result-chart-section-boardCharts select').inputValue(), 'distribution');
    assert(await page.locator('.result-chart-section-boardCharts h4').first().textContent()
      .then((text) => text.startsWith('times by ')));
    await page.locator('.result-chart-section-perfCharts select').selectOption('distribution');
    await page.evaluate(() => drawProfileFixture());
    assert(await page.locator('.result-chart-section-perfCharts h4').first().textContent()
      .then((text) => text.startsWith('game ms / 3BV by ')), 'your perf distribution charts plot ms / 3BV per game');
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
    // Each result table and section opens and closes by its title, drawn and
    // working like the details column's: the state is a remembered panel,
    // and the title stays where it is.
    const resultOpeners = [['ranks won in session', 'recentPlacements'], ['rankings', 'rankTables'],
      ['This board', 'boardTables'], ['your perf', 'perfCharts'], ['board traits', 'boardCharts']];
    assert.deepEqual(await page.locator('#result-ranks .stat-section-toggle').allTextContents(),
      resultOpeners.map(([title]) => title));
    const opener = (title) => page.locator('#result-ranks .stat-section-toggle', { hasText: new RegExp('^' + title + '$') });
    const placeOf = (title) => opener(title).evaluate((toggle) => {
      const box = toggle.getBoundingClientRect();
      return [Math.round(box.left + scrollX), Math.round(box.top + scrollY)];
    });
    // A title's help shows on hover and never covers the title, whose click
    // closes it and puts the help away.
    await opener('ranks won in session').hover();
    assert.equal(await page.locator('.chart-help-tip').isVisible(), true, 'the title shows its help on hover');
    assert.equal(await opener('ranks won in session').evaluate((toggle) => {
      const box = toggle.getBoundingClientRect();
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === toggle;
    }), true, 'the help leaves its title uncovered');
    for (const [title, panel] of resultOpeners) {
      const toggle = opener(title);
      const before = await placeOf(title);
      await toggle.click();
      await frames();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', title + ' closes');
      assert.equal(await page.locator('#' + await toggle.getAttribute('aria-controls')).isHidden(), true,
        title + ' hides what it holds');
      assert.equal(await page.evaluate((key) => settings.panels[key], panel), false, title + ' is remembered closed');
      assert.deepEqual(await placeOf(title), before, title + ' stays where it was');
    }
    assert.equal(await page.locator('.chart-help-tip').isVisible(), false, 'the click put the help away');
    assert.equal(await page.locator('.result-chart-section-perfCharts select').isHidden(), true,
      'a closed section hides its chart choice');
    await page.evaluate(() => drawProfileFixture());
    assert.deepEqual(await page.locator('#result-ranks .stat-section-toggle').evaluateAll((toggles) =>
      toggles.map((toggle) => toggle.getAttribute('aria-expanded'))), resultOpeners.map(() => 'false'),
      'the next result opens with them closed');
    // Option S1: right-click hides Game Data rows (base, scoped, board trait)
    // and lower result tables in place; the local configure results dialog
    // restores hidden sections live without leaving the game page.
    await page.evaluate(async () => {
      settings.panels.boardTables = true;
      settings.gameDataScopedRows = [{ metric: 'time', pool: 'board:zeroCount' }];
      saveSettings();
      profileFixture.current.actionEvaluations = [];
      await renderResult(profileFixture.current, profileFixture.wins);
      resultsBox.hidden = false;
    });
    await bandReady();
    await profile.locator('.game-data-row[data-side="performance"][data-measurement="clickRate"]:not([data-scoped])').click({ button: 'right' });
    assert.equal(await page.locator('.ui-context-menu-item').textContent(), 'hide click rate');
    await page.locator('.ui-context-menu-item').click();
    await bandReady();
    assert.equal(await page.evaluate(() => settings.gameDataMetrics.clickRate), false, 'right-click hides base perf row');
    await profile.locator('.game-data-row[data-scoped="true"]').first().click({ button: 'right' });
    assert((await page.locator('.ui-context-menu-item').textContent()).startsWith('remove '), 'scoped row menu says remove');
    await page.locator('.ui-context-menu-item').click();
    await bandReady();
    assert.deepEqual(await page.evaluate(() => settings.gameDataScopedRows), [], 'right-click removes scoped row');
    await profile.locator('.game-data-row[data-side="board"][data-measurement="bv3"]').click({ button: 'right' });
    assert.equal(await page.locator('.ui-context-menu-item').textContent(), 'hide 3BV');
    await page.locator('.ui-context-menu-item').click();
    await bandReady();
    assert.equal(await page.evaluate(() => settings.gameDataBoardTraits.bv3), false, 'right-click hides board trait row');
    await page.locator('.result-chart-section-boardTables .rank-list').filter({ hasText: /^3BV \d/ }).first().click({ button: 'right' });
    assert.deepEqual(await page.locator('.ui-context-menu-item').allTextContents(),
      ['hide same-3BV tablechart', 'configure results\u2026']);
    await page.locator('.ui-context-menu-item').first().click();
    await page.waitForFunction(() => settings.shownThings.exact3BV === false
      && !resultRanks.hasAttribute('aria-busy')
      && [...document.querySelectorAll('.result-chart-section-boardTables .rank-list h4')].every((h) => !/^3BV \d/.test(h.textContent)));
    await page.locator('#results-config-btn').click();
    assert.equal(await page.evaluate(() => document.getElementById('results-config').open), true, 'configure results dialog opens');
    const cfgOverflow = await page.evaluate(() => {
      const box = document.getElementById('results-config-groups');
      return { x: box.scrollWidth - box.clientWidth, y: box.scrollHeight - box.clientHeight };
    });
    assert(cfgOverflow.x <= 0 && cfgOverflow.y <= 0, 'results-config fits without scrollbars on desktop: ' + JSON.stringify(cfgOverflow));
    await page.locator('#results-config [data-setting="shownThings.exact3BV"] input').check();
    await page.waitForFunction(() => settings.shownThings.exact3BV === true
      && !resultRanks.hasAttribute('aria-busy')
      && [...document.querySelectorAll('.result-chart-section-boardTables .rank-list h4')].some((h) => /^3BV \d/.test(h.textContent)));
    await page.locator('#results-config-close').click();
    await page.evaluate(async () => {
      renderedResult = null;
      settings.panels.boardTables = false;
      settings.gameDataMetrics.clickRate = true;
      settings.gameDataBoardTraits.bv3 = true;
      saveSettings();
      await drawProfileFixture();
    });
    await bandReady();
    await profile.getByRole('button', { name: 'configure', exact: true }).click();
    await profile.getByLabel('show values', { exact: true }).uncheck();
    await profile.getByRole('button', { name: 'back to game data', exact: true }).first().click();
    await bandReady();
    await poolPicker.selectOption('board:bv3');
    await page.evaluate(() => {
      settings.gameDataScopedRows = [{ metric: 'time', pool: 'board:zeroCount' }, { metric: 'clickRate', pool: 'board:bv3' }];
      saveSettings();
    });
    await page.getByLabel('session', { exact: true }).selectOption('past30min');
    await page.reload();
    await page.waitForFunction(() => preferenceUIReady);
    assert.equal(await page.evaluate(() => settings.gameDataShowValues), false);
    assert.equal(await page.evaluate(() => settings.gameDataPool), 'board:bv3', 'the chosen comparison pool persists');
    assert.deepEqual(await page.evaluate(() => settings.gameDataScopedRows),
      [{ metric: 'time', pool: 'board:zeroCount' }, { metric: 'clickRate', pool: 'board:bv3' }],
      'scoped performance rows persist');
    assert.equal(await page.evaluate(() => settings.sessionDefinition), 'past30min');
    assert.equal(await page.getByLabel('session', { exact: true }).inputValue(), 'past30min');
    assert.equal(await page.evaluate(() => settings.gameDataMetrics.fastclickGap), true);
    assert.equal(await page.evaluate(() => settings.gameDataBoardTraits.workSpread), true, 'the board-trait selection persists');
    assert.deepEqual(await page.evaluate((panels) => panels.map((key) => settings.panels[key]),
      resultOpeners.map(([, panel]) => panel)), resultOpeners.map(() => false), 'closed result openers persist');
    const layoutPage = await browser.newPage({ viewport: { width: 1740, height: 1100 } });
    layoutPage.on('pageerror', (error) => errors.push('layout fixture: ' + error.message));
    await layoutPage.goto('http://127.0.0.1:8099/tests/session-placement-layout-test.html');
    await layoutPage.waitForFunction(() => document.getElementById('checks').textContent.includes('DONE'), null, { timeout: 60000 });
    const layoutChecks = await layoutPage.locator('#checks').textContent();
    assert.deepEqual(layoutChecks.split('\n').filter((line) => line.startsWith('FAIL')), [], 'post-game layout regression');
    await layoutPage.close();
    assert.deepEqual(errors, []);
    console.log('board-time-profile: band rows, pools, distributions, chart linkage, responsive layout, help, history, losses, result openers, and settings passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
