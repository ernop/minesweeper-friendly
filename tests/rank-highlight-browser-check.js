'use strict';
// Isolated browser profile on the permanent test origin; all fixture data
// is passed directly to renderers, never written into the player's history.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.argv[3], headless: true, args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:8099/');
    await page.waitForFunction(() =>
      typeof preferenceUIReady !== 'undefined' && preferenceUIReady);
    await page.evaluate(() => {
      const collector = createResultSectionCollector('postGame');
      const examples = [
        ['first', 1, 91], ['second', 2, 1000], ['third', 3, 1000],
        ['top1', 10, 1000], ['top2', 20, 1000], ['lifetime', 32, 1080],
        ['top10', 100, 1000], ['top25', 250, 1000], ['middle', 500, 1000],
        ['near-streak', 155, 287], ['bottom10', 901, 1000],
        ['last', 1000, 1000], ['only', 1, 1], ['history', 0, 1000],
      ];
      for (const [label, rank, total] of examples) {
        const list = buildRankList(label, total, rank - 1, 'rank-grid', (index) => [
          ['rank-cell', String(index + 1)], ['time-cell', '4.901s'],
          ...(index === rank - 1 ? [['age-just-cell', 'this']]
            : [['age-num-cell age-u-w', '3.7'], ['age-unit-cell age-u-w', 'w']]),
        ]);
        list.dataset.example = label;
        collector.append('tables', list);
      }
      const now = Date.now();
      const shapes = [{ bv3: 40, maxAdjacent: 2 }, { bv3: 41, maxAdjacent: 8 }];
      const wins = shapes.flatMap((shape, group) => Array.from({ length: 20 }, (_, i) => ({
        ...shape, outcome: 'win', endedAt: now - (60 + group * 20 + i) * 864e5,
        timeMs: 1000 + i * 100 + group * 2000,
      })));
      wins.push({ ...shapes[1], outcome: 'win', endedAt: now - 1000, timeMs: 1010 });
      const current = { ...shapes[0], outcome: 'win', endedAt: now, timeMs: 1015 };
      wins.push(current);
      settings.recentPlacementsWindow = 'pastHour';
      settings.collapseDuplicateCharts = false;
      collector.append('tables', buildRecentPlacements(current, wins, now));
      collector.renderInto(resultRanks);
    });
    const details = await page.evaluate(() => {
      const records = {};
      for (const list of document.querySelectorAll('[data-example]')) {
        const selected = list.querySelector('.me');
        const rank = selected && selected.querySelector('.rank-cell');
        const time = selected && selected.querySelector('.time-cell');
        records[list.dataset.example] = {
          band: selected && selected.dataset.rankBand,
          podium: selected && selected.dataset.rankPodium,
          footer: list.querySelector('.rank-total').textContent,
          rankColor: rank && getComputedStyle(rank).backgroundColor,
          timeColor: time && getComputedStyle(time).backgroundColor,
          edge: rank && getComputedStyle(rank).boxShadow,
          underline: rank && getComputedStyle(rank).textDecorationStyle,
          selectedCount: list.querySelectorAll('.me').length,
        };
      }
      const summary = document.querySelector('.recent-placements');
      const row = (label) => [...summary.querySelectorAll('.rank-row')]
        .find((row) => row.querySelector('.recent-window-cell').textContent === label);
      const current = row('3BV 40');
      const earlier = row('3BV 41');
      return { records, current: {
        label: current.querySelector('.recent-standing-cell').textContent,
        podium: current.dataset.rankPodium,
        rankColor: getComputedStyle(current.querySelector('.recent-current-rank')).backgroundColor,
        cells: current.children.length,
      }, earlier: {
        highlighted: earlier.classList.contains('recent-row-current'),
        standing: earlier.querySelector('.recent-standing-cell').textContent,
        band: earlier.dataset.rankBand,
        rankColor: getComputedStyle(earlier.querySelector('.recent-rank-run')).backgroundColor,
      } };
    });
    const records = details.records;
    assert.equal(records.first.rankColor, 'rgb(239, 197, 88)');
    assert.equal(records.second.rankColor, 'rgb(201, 210, 220)');
    assert.equal(records.third.rankColor, 'rgb(219, 175, 135)');
    assert.notEqual(records.first.rankColor, records.first.timeColor);
    assert.notEqual(records.top1.timeColor, records.top2.timeColor);
    assert.equal(records.lifetime.footer, '#32 of 1,080Top 3%');
    assert.equal(records['near-streak'].footer, '#155 of 287Bottom 47%');
    assert.equal(records.last.footer, '#1000 of 1,000Last place');
    assert.equal(records.last.underline, 'double');
    assert.equal(records.only.footer, '#1 of 1Only result');
    assert.equal(records.only.podium, '0');
    assert.equal(records.only.rankColor, records.only.timeColor);
    assert.equal(records.history.selectedCount, 0);
    assert.equal(records.history.footer, '1000 total');
    for (const [name, record] of Object.entries(records)) {
      if (name === 'history') continue;
      assert.equal(record.selectedCount, 1);
      assert.notEqual(record.edge, 'none');
      assert.notEqual(record.timeColor, 'rgba(0, 0, 0, 0)');
    }
    assert.equal(details.current.podium, '2');
    assert.equal(details.current.rankColor, records.second.rankColor);
    assert.equal(details.current.label, 'Top 10%');
    assert.equal(details.current.cells, 4);
    assert.equal(details.earlier.highlighted, false);
    assert.equal(details.earlier.standing, 'Top 5%');
    assert.equal(details.earlier.band, 'top5');
    assert.equal(details.earlier.rankColor, records.first.rankColor);
    const multi = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.recent-placements .rank-row')]
        .find((row) => row.querySelector('.recent-window-cell').textContent === 'lifetime');
      return {
        places: [...row.querySelectorAll('.recent-rank-run')].map((rank) => ({
          text: rank.textContent, podium: rank.dataset.rankPodium,
          color: getComputedStyle(rank).backgroundColor,
        })),
        standing: row.querySelector('.recent-standing-cell').textContent,
      };
    });
    assert.deepEqual(multi.places.map((rank) => rank.text), ['2nd', '3rd this']);
    assert.equal(multi.places[0].color, records.second.rankColor);
    assert.equal(multi.places[1].color, records.third.rankColor);
    assert.equal(multi.standing, 'Top 5% \u2013 Top 8%');
    for (const width of [1680, 1216, 650]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.rank-list')]
        .filter((list) => list.scrollWidth > list.clientWidth + 1)
        .map((list) => list.querySelector('h4').textContent));
      assert.deepEqual(overflow, [], width + 'px table overflow');
      await page.screenshot({ path: '/tmp/rank-highlights-' + width + '.png', fullPage: true });
    }
    const conditional = await page.evaluate(() => {
      const now = Date.now();
      const other = Array.from({ length: 190 }, (_, i) => ({
        outcome: 'win', endedAt: now - (300 + i) * 864e5,
        timeMs: 1000 + i, bv3: 40, zini: 20, maxAdjacent: 4,
      }));
      const comparable = Array.from({ length: 9 }, (_, i) => ({
        outcome: 'win', endedAt: now - (100 + i) * 864e5,
        timeMs: 20000 + i * 1000, bv3: 80, zini: 50, maxAdjacent: 6,
      }));
      const current = { ...comparable[0], timeMs: 23500, endedAt: now };
      const records = [...other, ...comparable, current].sort((a, b) => a.endedAt - b.endedAt);
      settings.shownThings.averageCharts = false;
      settings.shownThings.relationshipCharts = false;
      settings.collapseDuplicateCharts = true;
      const draw = (options = {}) => {
        const collector = createResultSectionCollector('postGame');
        renderRanks(current, records, options, collector);
        collector.renderInto(resultRanks);
        return Object.fromEntries([...resultRanks.querySelectorAll('.rank-list')]
          .filter((list) => !list.classList.contains('recent-placements'))
          .map((list) => [list.querySelector('h4').textContent, {
            footer: list.querySelector('.rank-total').textContent,
            selected: list.querySelectorAll('.me').length,
          }]));
      };
      const full = draw();
      const boardSection = resultRanks.querySelector('.result-chart-section-boardTables');
      const boardLabels = [...boardSection.querySelectorAll('h4')].map((heading) => heading.textContent);
      const summaryLabels = [...resultRanks.querySelectorAll('.recent-window-cell')]
        .map((cell) => cell.textContent);
      settings.shownThings.exactZiNi = false;
      const hidden = draw();
      settings.shownThings.exactZiNi = true;
      const history = draw({ historyView: true });
      draw();
      return { full, summaryLabels, hidden, history, boardLabels,
        sectionTitle: boardSection.querySelector('h3').textContent };
    });
    assert.equal(conditional.full.lifetime.footer, '#195 of 200Bottom 3%');
    assert.equal(conditional.sectionTitle, 'This board');
    for (const label of ['3BV 80', 'ZiNi 50', 'max number 6']) {
      assert.equal(conditional.full[label].footer, '#5 of 10Top 50%');
      assert(conditional.boardLabels.includes(label));
      assert.equal(conditional.full[label].selected, 1);
      assert.equal(conditional.history[label].selected, 0);
      assert(!conditional.summaryLabels.includes(label), 'median stays in full table, outside top-tenth summary');
    }
    assert(!conditional.hidden['ZiNi 50']);
    assert(conditional.hidden['max number 6']);
    await page.setViewportSize({ width: 1680, height: 1100 });
    await page.screenshot({ path: '/tmp/board-section-1680.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Rank highlights: podium, percentage bands, full/compact tables, low/last/only results, history view, conditional board comparisons, and three viewport widths passed.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
