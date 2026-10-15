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
    await page.evaluate(async () => {
      settings.shownThings.sessionSummary = false;
      resultRanks.classList.add('sectioned-results');
      const collector = createResultSectionCollector('postGame');
      const examples = [
        ['first', 1, 91], ['second', 2, 1000], ['third', 3, 1000],
        ['top1', 10, 1000], ['top2', 20, 1000], ['lifetime', 32, 1080],
        ['top10', 100, 1000], ['top25', 250, 1000], ['middle', 500, 1000],
        ['3BV 42', 2, 3],
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
      settings.sessionDefinition = 'pastHour';
      settings.collapseDuplicateCharts = false;
      const own = buildRecentPlacements(current, wins, now);
      await own.analysisReady;
      window.ownBoardLabels = [...own.querySelectorAll('.recent-window-cell')].map((cell) => cell.textContent);
      settings.shownThings.recentPlacementsOtherBoards = true;
      collector.append('tables', buildRecentPlacements(current, wins, now));
      await collector.ready();
      collector.renderInto(resultRanks);
    });
    const ownBoardLabels = await page.evaluate(() => window.ownBoardLabels);
    assert(ownBoardLabels.includes('3BV 40'), 'this win’s board category is listed by default');
    assert(!ownBoardLabels.includes('3BV 41') && !ownBoardLabels.includes('has an 8'),
      'an earlier session board’s categories are not listed by default: ' + ownBoardLabels.join(', '));
    const details = await page.evaluate(async () => {
      const records = {};
      for (const list of document.querySelectorAll('[data-example]')) {
        const selected = list.querySelector('.me');
        const rank = selected && selected.querySelector('.rank-cell');
        const time = selected && selected.querySelector('.time-cell');
        records[list.dataset.example] = {
          band: selected && selected.dataset.rankBand,
          podium: selected && selected.dataset.rankPodium !== undefined,
          footer: list.querySelector('.rank-total').textContent,
          rankColor: rank && getComputedStyle(rank).backgroundColor,
          timeColor: time && getComputedStyle(time).backgroundColor,
          weight: rank && getComputedStyle(rank).fontWeight,
          color: rank && getComputedStyle(rank).color,
          edge: rank && getComputedStyle(rank).boxShadow,
          underline: rank && getComputedStyle(rank).textDecorationLine,
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
        rowTinted: getComputedStyle(current).backgroundColor !== 'rgba(0, 0, 0, 0)',
        rankColor: getComputedStyle(current.querySelector('.recent-current-rank')).backgroundColor,
        cells: current.children.length,
      }, earlier: {
        highlighted: earlier.classList.contains('recent-row-current'),
        standing: earlier.querySelector('.recent-standing-cell').textContent,
        band: earlier.querySelector('.recent-rank-run').dataset.rankBand,
        rankColor: getComputedStyle(earlier.querySelector('.recent-rank-run')).backgroundColor,
      }, totals: [...summary.querySelectorAll('.recent-total-cell')].map((cell) => {
        const box = cell.getBoundingClientRect();
        return { text: cell.textContent, right: Math.round(box.right),
          align: getComputedStyle(cell).textAlign };
      }) };
    });
    const records = details.records;
    const THIS_GAME = 'rgb(135, 206, 250)';
    // A this-game row is the this-game light blue across, bold black,
    // with no edge bar or podium color: color plus "this" is the only mark;
    // standing stays in the footer.
    for (const [name, record] of Object.entries(records)) {
      if (name === 'history') continue;
      assert.equal(record.selectedCount, 1);
      assert.equal(record.rankColor, THIS_GAME, name + ' rank cell');
      assert.equal(record.timeColor, THIS_GAME, name + ' time cell');
      assert.equal(record.weight, '700');
      assert.equal(record.color, 'rgb(0, 0, 0)');
      assert.equal(record.edge, 'none', name + ' has no edge bar');
      assert.equal(record.podium, false, name + ' has no podium');
      assert.equal(record.underline, 'none');
    }
    assert.equal(records.lifetime.footer, '#32 of 1,080Top 3%');
    assert.equal(records['3BV 42'].footer, '#2 of 3Middle place');
    assert.equal(records['3BV 42'].band, 'middle');
    await page.locator('[data-example="3BV 42"]').screenshot({ path: '/tmp/rank-middle-place.png' });
    assert.equal(records['near-streak'].footer, '#155 of 287Bottom 47%');
    assert.equal(records.last.footer, '#1000 of 1,000Last place');
    assert.equal(records.only.footer, '#1 of 1Only result');
    assert.equal(records.history.selectedCount, 0);
    assert.equal(records.history.footer, '1000 total');
    assert.equal(details.current.rowTinted, false, 'ranks won rows carry no tint');
    assert.equal(details.current.rankColor, THIS_GAME, 'this game’s chip is the this-game light blue');
    assert.equal(details.current.label, 'Top 10%');
    assert.equal(details.current.cells, 5);
    assert.equal(details.earlier.highlighted, false);
    assert.equal(details.earlier.standing, 'Top 5%');
    assert.equal(details.earlier.band, undefined, 'an earlier rank carries no standing band');
    assert.equal(details.earlier.rankColor, 'rgba(0, 0, 0, 0)', 'an earlier rank is plain text');
    assert(details.totals.length > 1);
    assert(details.totals.every((total) => total.align === 'right'
      && total.right === details.totals[0].right), 'list sizes share one right edge: '
      + JSON.stringify(details.totals));
    const multi = await page.evaluate(async () => {
      const row = [...document.querySelectorAll('.recent-placements .rank-row')]
        .find((row) => row.querySelector('.recent-window-cell').textContent === 'lifetime');
      return {
        places: [...row.querySelectorAll('.recent-rank-run')].map((rank) => ({
          text: rank.textContent, band: rank.dataset.rankBand,
          color: getComputedStyle(rank).backgroundColor,
        })),
        standing: row.querySelector('.recent-standing-cell').textContent,
      };
    });
    assert.deepEqual(multi.places.map((rank) => rank.text), ['2nd', '3rd this']);
    assert.equal(multi.places[0].color, 'rgba(0, 0, 0, 0)', 'an earlier rank is plain text');
    assert.equal(multi.places[1].color, THIS_GAME);
    assert.equal(multi.standing, 'Top 5 \u2013 8%');
    for (const width of [1680, 1216, 650]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.rank-list')]
        .filter((list) => list.scrollWidth > list.clientWidth + 1)
        .map((list) => list.querySelector('h4').textContent));
      assert.deepEqual(overflow, [], width + 'px table overflow');
      await page.screenshot({ path: '/tmp/rank-highlights-' + width + '.png', fullPage: true });
    }
    const conditional = await page.evaluate(async () => {
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
      const draw = async (options = {}) => {
        const collector = createResultSectionCollector('postGame');
        await renderRanks(current, records, options, collector);
        await collector.ready();
      collector.renderInto(resultRanks);
        return Object.fromEntries([...resultRanks.querySelectorAll('.rank-list')]
          .filter((list) => !list.classList.contains('recent-placements'))
          .map((list) => [list.querySelector('h4').textContent, {
            footer: list.querySelector('.rank-total').textContent,
            selected: list.querySelectorAll('.me').length,
          }]));
      };
      const full = await draw();
      const boardSection = resultRanks.querySelector('.result-chart-section-boardTables');
      const boardLabels = [...boardSection.querySelectorAll('h4')].map((heading) => heading.textContent);
      const summaryLabels = [...resultRanks.querySelectorAll('.recent-window-cell')]
        .map((cell) => cell.textContent);
      settings.shownThings.exactZiNi = false;
      const hidden = await draw();
      settings.shownThings.exactZiNi = true;
      const history = await draw({ historyView: true });
      await draw();
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
    // Reproduce a long session whose largest pools are deliberately out of
    // numeric order. The DOM must keep family blocks and every achievement.
    const longSession = await page.evaluate(async () => {
      const now = new Date(2026, 8, 21, 12).getTime();
      const variants = [
        { bv3: 74, zini: 51, hzini: 49, maxAdjacent: 8, hasSeven: true,
          islandCount: 26, largestIsland: 10, zeroCount: 71, spread: 7 },
        { bv3: 55, zini: 49, hzini: 46, maxAdjacent: 2, hasSeven: false,
          islandCount: 9, largestIsland: 3, zeroCount: 9, spread: 6 },
        { bv3: 60, zini: 50, hzini: 48, maxAdjacent: 7, hasSeven: true,
          islandCount: 20, largestIsland: 5, zeroCount: 62, spread: 6.5 },
      ].map((v) => ({ ...v, boardMetrics: { version: 1, workSpread: v.spread,
        safeCells: 100, zeroOpenedZeroOneCells: v.zeroCount, zeroOpenedCells: v.zeroCount + 5 } }));
      const wins = variants.flatMap((v, group) => Array.from({ length: [79, 39, 19][group] }, (_, i) => ({
        ...v, outcome: 'win', endedAt: now - (35 + i * 7) * 864e5 - group,
        timeMs: 20000 + i * 100,
      })));
      const recent = variants.map((v, group) => ({ ...v, outcome: 'win',
        endedAt: now - group * 1000, timeMs: 10000 + group * 100 }));
      wins.push(...recent);
      settings.sessionDefinition = 'pastWeek';
      settings.collapseDuplicateCharts = false;
      settings.shownThings.recentPlacementsOtherBoards = true;
      const collector = createResultSectionCollector('postGame');
      await renderRanks(recent[0], wins, {}, collector);
      await collector.ready();
      collector.renderInto(resultRanks);
      const rows = [...resultRanks.querySelectorAll('.recent-placements .rank-row')];
      return {
        labels: rows.map((row) => row.querySelector('.recent-window-cell').textContent),
        current: rows.find((row) => row.querySelector('.recent-window-cell').textContent === '3BV 74')
          .querySelector('.recent-current-rank').textContent,
      };
    });
    for (const family of [
      ['3BV 55', '3BV 60', '3BV 74'], ['ZiNi 49', 'ZiNi 50', 'ZiNi 51'],
      ['HZiNi 46', 'HZiNi 48', 'HZiNi 49'],
      ['3BV spread 5.75–6.25 cells', '3BV spread 6.25–6.75 cells', '3BV spread 6.75–7.25 cells'],
      ['max number 2', 'max number 7', 'max number 8'], ['has a 7', 'has an 8'],
      ['max number ≤ 2', 'max number ≤ 3', 'max number ≤ 4'], ['islands 9', 'islands 20', 'islands 26'],
      ['largest island 3', 'largest island 5', 'largest island 10'],
      ['zeros 9', 'zeros 62', 'zeros 71'], ['0–1 share 9%', '0–1 share 62%', '0–1 share 71%'],
      ['zero-opening coverage 14%', 'zero-opening coverage 67%', 'zero-opening coverage 76%'],
    ]) {
      const start = longSession.labels.indexOf(family[0]);
      assert(start >= 0, 'missing family ' + family[0]);
      assert.deepEqual(longSession.labels.slice(start, start + family.length), family);
    }
    assert.equal(longSession.labels[0], 'lifetime');
    assert.equal(longSession.current, '1st this');
    const dateHelp = page.getByRole('button', { name: 'About on the 21st', exact: true });
    await dateHelp.hover();
    assert((await page.locator('.chart-help-tip').innerText()).includes('day of any month, across all years'));
    await page.mouse.move(0, 0);
    for (const width of [1680, 650]) {
      await page.setViewportSize({ width, height: 1100 });
      // The board layout that places blocks beside the board runs in the
      // next animation frame; measuring before it read the previous width.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.rank-list')]
        .filter((list) => list.scrollWidth > list.clientWidth + 1)
        .map((list) => list.querySelector('h4').textContent)), [], width + 'px long-session overflow');
      const flow = await page.evaluate(async () => {
        const items = resultRanks.querySelector('.result-chart-section-tables .result-chart-section-items');
        const bounds = (el) => { const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        const summary = bounds(items.querySelector('.recent-placements'));
        const tables = [...items.children].filter((el) => !el.classList.contains('recent-placements')).map(bounds);
        const rows = [...items.querySelectorAll('.recent-window-cell')].map(bounds);
        return { summary, tables, rows, nextSection: bounds(resultRanks.querySelector('.result-chart-section-boardTables')) };
      });
      for (let i = 1; i < flow.rows.length; i++) {
        assert(Math.abs(flow.rows[i].top - flow.rows[i - 1].bottom) < 1, 'gap between summary rows');
      }
      assert(flow.tables.some((r) => r.left >= flow.summary.right
        && r.top > flow.summary.top + 40 && r.bottom <= flow.summary.bottom),
        width + 'px: later table rows should use the space beside the summary');
      for (const table of flow.tables) {
        assert(table.top >= flow.summary.bottom || table.left >= flow.summary.right,
          'table overlaps summary');
      }
      assert(flow.nextSection.top >= Math.max(flow.summary.bottom, ...flow.tables.map((r) => r.bottom)),
        'next section overlaps flowing tables');
      await page.screenshot({ path: '/tmp/ranks-won-ordered-' + width + '.png', fullPage: true });
    }
    // Session summary: games, wins, and win rate per board type in the one
    // session window, the session's best time with its lifetime rank, and
    // a this-game light blue "this" when that best is the game just finished.
    const sessionSummary = await page.evaluate(async () => {
      const now = Date.now();
      const game = (minutesAgo, outcome, timeMs) => ({ endedAt: now - minutesAgo * 60000, outcome, timeMs, flagsPlaced: 3,
        bv3: 10, clicks: 10, wastedClicks: 2, playMode: 'standard', actionEvaluations: [] });
      const evaluation = { version: ACTION_EVALUATION_VERSION, result: 'continued', alternatives: [],
        position: { width: 3, height: 1, mines: 1, revealed: [[0, 1]], flagged: [] } };
      // The game just won survived a mid-game guess riskier than the lowest.
      const current = { ...game(0, 'win', 4100), guesses: 2, actionEvaluations: [{ ...evaluation, action: 'reveal',
        actionNumber: 6, atMs: 2000, selected: [2], mistakes: ['chose-higher-risk'], evidence: { boardProgress: 0.5 } }] };
      // A win from before no-op clicks and guesses were measured has no IOE
      // and no win type.
      const { wastedClicks, ...unmeasured } = game(10, 'win', 21000);
      // A modern loss: a left click on a mine that counting proved, under a
      // second after a chord on the number beside it found too few flags.
      const shortChord = { ...evaluation, action: 'no-op', actionNumber: 8, atMs: 4700, selected: [0],
        mistakes: ['no-op-click'], evidence: { reason: 'chord-short-of-flags' } };
      const provenMine = { ...evaluation, action: 'reveal', actionNumber: 9, atMs: 5000, result: 'death', selected: [1],
        mistakes: ['opened-proven-mine', 'ignored-safe-move'],
        evidence: { safeAvailable: true, mineProofTier: 'counting', safeProofTier: 'whole-board' } };
      history = {
        '9x9/10@standard': [game(60 * 24 * 40, 'win', 4000), game(50, 'loss', 900),
          { ...game(40, 'win', 4500), guesses: 0 }, current],
        '30x16/99@standard': [game(30, 'loss', 20000),
          { ...game(20, 'loss', 30000), actionEvaluations: [shortChord, provenMine] }],
        '16x16/40@standard+pink-noise(alpha=1,scale=12,contrast=2,stretch=0)': [{ ...unmeasured,
          generator: { id: 'pink-noise', params: { alpha: 1, scale: 12, contrast: 2, stretch: 0 } } }],
      };
      settings.sessionDefinition = 'pastHour';
      settings.shownThings.sessionSummary = true;
      const collector = createResultSectionCollector('postGame');
      collector.append('tables', buildSessionSummary(current, now));
      await collector.ready();
      collector.renderInto(resultRanks);
      const read = () => {
        const box = resultRanks.querySelector('.session-summary');
        const main = box.querySelector('.session-summary-grid:not(.session-summary-results)');
        const results = box.querySelector('.session-summary-results');
        return {
          heading: box.querySelector('h4').textContent,
          rows: [...main.querySelectorAll('.session-summary-row, .session-summary-total')]
            .map((row) => [...row.children].map((cell) => cell.textContent)),
          head: [...main.querySelectorAll('.session-summary-head > span')].map((cell) => cell.textContent),
          thisColor: box.querySelector('.session-summary-current') && getComputedStyle(box.querySelector('.session-summary-current')).backgroundColor,
          rowHeights: [...box.querySelectorAll('.session-summary-row > span:first-child')].map((cell) => cell.getBoundingClientRect().height),
          results: [...results.querySelectorAll('.rank-row')].map((row) => [...row.children].map((cell) => cell.textContent)),
          ruled: [...results.querySelectorAll('.session-summary-group-first')].map((row) => row.firstChild.textContent),
          indents: [...results.querySelectorAll('.session-summary-row')].map((row) => getComputedStyle(row.firstChild).paddingLeft),
          bold: [...results.querySelectorAll('.session-summary-row')]
            .filter((row) => Number(getComputedStyle(row.firstChild).fontWeight) >= 700).map((row) => row.firstChild.textContent),
          swatches: [...box.querySelectorAll('.session-summary-result .end-swatch')].map((swatch) => getComputedStyle(swatch).backgroundColor),
          resultsWithinSummary: results.getBoundingClientRect().right <= box.getBoundingClientRect().right + 1,
          marked: [...results.querySelectorAll('.rank-row.me')].map((row) => row.firstChild.textContent),
          markedCells: [...results.querySelectorAll('.rank-row.me > span')].map((cell) => {
            const style = getComputedStyle(cell);
            return [style.backgroundColor, style.color, Number(style.fontWeight) >= 700];
          }),
        };
      };
      const hour = read();
      const savedHistory = history;
      // After a loss the summary is its board's latest win; the tree marks the loss.
      resultRanks.replaceChildren(buildSessionSummary(current, now, false, false, savedHistory['9x9/10@standard'][1]));
      const afterLoss = read();
      resultRanks.replaceChildren(buildSessionSummary(savedHistory['9x9/10@standard'][0], now, false));
      const outsideWindow = read();
      // After an Expert loss with no Expert win, the summary is the loss's.
      resultRanks.replaceChildren(buildSessionSummary(savedHistory['30x16/99@standard'][1], now, false));
      const expert = read();
      history = { '9x9/10@standard': savedHistory['9x9/10@standard'],
        '9x9/10@standard+pink-noise(alpha=1,scale=12,contrast=2,stretch=0)':
          savedHistory['16x16/40@standard+pink-noise(alpha=1,scale=12,contrast=2,stretch=0)'] };
      resultRanks.replaceChildren(buildSessionSummary(current, now));
      const sameSize = read().results;
      const oldCustom = game(60 * 24 * 40, 'win', 90000);
      history = { ...savedHistory, '20x20/60@standard': [oldCustom] };
      resultRanks.replaceChildren(buildSessionSummary(oldCustom, now, false));
      const noSizeGames = resultRanks.querySelector('.session-summary-results').textContent;
      history = savedHistory;
      resultRanks.replaceChildren(buildSessionSummary(current, now));
      document.getElementById('session-definition-select').value = 'past10min';
      document.getElementById('session-definition-select').dispatchEvent(new Event('change'));
      const short = read();
      history = { '9x9/10@standard': history['9x9/10@standard'] };
      resultRanks.replaceChildren(buildSessionSummary(current, now));
      const plain = [...resultRanks.querySelectorAll('.session-summary-head, .session-summary-row')]
        .map((row) => [...row.children].map((cell) => cell.textContent));
      return { hour, afterLoss, outsideWindow, expert, sameSize, noSizeGames, short, plain };
    });
    assert.equal(sessionSummary.hour.heading, 'session', 'only the picker names the window');
    assert.deepEqual(sessionSummary.hour.head, ['board type', 'games', 'wins', 'win rate', 'best', 'lifetime rank',
      'mean time', 'mean 3BV/s', 'mean IOE']);
    assert.deepEqual(sessionSummary.hour.rows, [
      ['Beginner', '', '3', '2', '67%', '4.100s', '2nd this of 3', '4.300s', '2.331', '0.833'],
      ['Intermediate', 'Pink noise (spectral exponent 1, feature size 12, contrast 2, stretch 0)', '1', '1', '100%', '21.000s', '1st of 1',
        '21.000s', '0.476', ''],
      ['Expert', '', '2', '0', '0%', '', '', '', '', ''],
      ['all', '', '6', '3', '50%', '', '', '', '', ''],
    ], 'the default mode goes unnamed; a generator has its own aligned column; means average the session’s wins');
    assert.equal(sessionSummary.hour.thisColor, THIS_GAME);
    assert(sessionSummary.hour.rowHeights.every((height) => height < 20), 'summary rows stay one line');
    const levels = ['won or lost', 'worst offense', 'type'];
    assert.deepEqual(sessionSummary.hour.results, [
      ['result', 'Beginner games', ...levels],
      ['won', '2', '67%', '', ''],
      ['no avoidable risk', '1', '', '33%', ''],
      ['without guessing', '1', '', '', '33%'],
      ['riskier guess than necessary', '1', '', '33%', ''],
      ['after the opening this', '1', '', '', '33%'],
      ['lost', '1', '33%', '', ''],
      ['not judged', '1', '', '33%', ''],
    ], 'only the shown game’s size; each share of all its games stands in its level’s column');
    assert.deepEqual(sessionSummary.hour.marked, ['after the opening this'],
      'the game shown is marked on its leaf alone, since the indentation shows its branch');
    assert.deepEqual(sessionSummary.hour.markedCells, Array(5).fill([THIS_GAME, 'rgb(0, 0, 0)', true]),
      'a this-game row is bold black on the this-game light blue across its cells');
    assert.deepEqual(sessionSummary.afterLoss.marked, ['not judged this'],
      'after a loss the tree marks the loss, not the latest win the summary is built for');
    assert.equal(sessionSummary.afterLoss.rows[0][6], '2nd of 3', 'the best-time chip still marks only a win just finished');
    assert.deepEqual(sessionSummary.outsideWindow.marked, [], 'a game outside the session has no row to mark');
    assert.deepEqual(sessionSummary.hour.ruled, ['lost'], 'a rule starts the lost branch');
    assert.deepEqual(sessionSummary.hour.indents, ['4px', '18px', '32px', '18px', '32px', '4px', '18px'],
      'depth shows as indentation');
    assert.deepEqual(sessionSummary.hour.bold, ['won', 'after the opening this', 'lost'],
      'won and lost head their branches; the this-game row is bold too');
    assert.deepEqual(sessionSummary.hour.swatches, ['rgb(46, 125, 50)', 'rgb(46, 125, 50)', 'rgb(153, 153, 153)'],
      'wins carry the chart’s win color and each loss type its line color');
    assert(sessionSummary.hour.resultsWithinSummary, 'the results grid stays inside the summary');
    assert.deepEqual(sessionSummary.expert.results, [
      ['result', 'Expert games', ...levels],
      ['won', '0', '0%', '', ''],
      ['lost', '2', '100%', '', ''],
      ['opened a proven mine', '1', '', '50%', ''],
      ['counting single numbers proved it this', '1', '', '', '50%'],
      ['not judged', '1', '', '50%', ''],
      ['of these losses, likely misclick: left click on a proven mine under a second after a chord beside it lacked flags this',
        '1', '', '50%', ''],
    ], 'another size’s tree holds only its own games, misclick rows included');
    assert.deepEqual(sessionSummary.expert.marked, ['counting single numbers proved it this',
      'of these losses, likely misclick: left click on a proven mine under a second after a chord beside it lacked flags this'],
    'a likely-misclick loss is marked on its leaf and on the misclick row that recounts it');
    assert.deepEqual(sessionSummary.expert.ruled, ['lost',
      'of these losses, likely misclick: left click on a proven mine under a second after a chord beside it lacked flags this'],
    'a rule starts the lost branch and another the misclick rows');
    assert.deepEqual(sessionSummary.expert.indents, ['4px', '4px', '18px', '32px', '18px', '18px'],
      'misclick rows sit at the second level');
    assert.deepEqual(sessionSummary.sameSize, [
      ['result', 'Beginner games', ...levels],
      ['won', '3', '75%', '', ''],
      ['no avoidable risk', '1', '', '25%', ''],
      ['without guessing', '1', '', '', '25%'],
      ['riskier guess than necessary', '1', '', '25%', ''],
      ['after the opening this', '1', '', '', '25%'],
      ['guesses not measured', '1', '', '25%', ''],
      ['lost', '1', '25%', '', ''],
      ['not judged', '1', '', '25%', ''],
    ], 'a generator’s games count with their size');
    assert.equal(sessionSummary.noSizeGames, 'no Custom 20x20-60 games in session',
      'a size without session games says so in place of its tree');
    assert.deepEqual(sessionSummary.short.results, [
      ['result', 'Beginner games', ...levels],
      ['won', '1', '100%', '', ''],
      ['riskier guess than necessary', '1', '', '100%', ''],
      ['after the opening this', '1', '', '', '100%'],
      ['lost', '0', '0%', '', ''],
    ], 'a session without losses still breaks down its results and shows lost at zero');
    assert.deepEqual(sessionSummary.short.rows, [
      ['Beginner', '', '1', '1', '100%', '4.100s', '2nd this of 3', '4.100s', '2.439', '0.833'],
      ['Intermediate', 'Pink noise (spectral exponent 1, feature size 12, contrast 2, stretch 0)', '1', '1', '100%', '21.000s', '1st of 1',
        '21.000s', '0.476', ''],
      ['all', '', '2', '2', '100%', '', '', '', '', ''],
    ]);
    assert.deepEqual(sessionSummary.plain, [['board type', 'games', 'wins', 'win rate', 'best', 'lifetime rank', 'mean time', 'mean 3BV/s', 'mean IOE'],
      ['Beginner', '1', '1', '100%', '4.100s', '2nd this of 3', '4.100s', '2.439', '0.833'],
      ['result', 'Beginner games', 'won or lost', 'worst offense', 'type'], ['won', '1', '100%', '', ''],
      ['riskier guess than necessary', '1', '', '100%', ''], ['after the opening this', '1', '', '', '100%'], ['lost', '0', '0%', '', '']],
    'without a variant to name, the board stands alone in its column');
    assert.deepEqual(errors, []);
    console.log('Rank highlights: this-game rows, standing chips, session summary, percentage bands, full/compact tables, low/last/only results, history view, conditional board comparisons, stable numeric family ordering, contiguous summary rows, surrounding table flow, day-of-month headings, and three viewport widths passed.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
