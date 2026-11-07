'use strict';

// renderRanks: a result's table collection, board tables, average-time
// charts, and relationship charts, in their fixed section order.

//-------RESULT RANKS (tables and charts in section order)-------

// The session summary and ranks won, stacked: below the board they float as
// one left column, so the tables after them rise beside it.
function sessionTablesColumn(tables) {
  const column = document.createElement('div');
  column.className = 'session-tables';
  column.append(...tables);
  column.analysisReady = Promise.all(tables.map((table) => table.analysisReady));
  return column;
}

// The rank tables (time windows, day categories, streaks) as one group whose
// title opens and closes them all.
function rankTablesGroup(lists) {
  const group = document.createElement('div');
  group.className = 'rank-tables';
  const body = document.createElement('div');
  body.className = 'rank-tables-body';
  body.append(...lists);
  group.append(resultOpenerHead('h3', 'rankTables', 'rankings', body), body);
  return group;
}

// Every part is appended to `sections` before the first wait, in display
// order, so the collector can place each as it arrives. The rankings worker
// answers in request order: ranks won and game data, on the first screen,
// ask before the plan of the tables and charts under the board, and each
// chart group asks for its drawings only after the group above it.
async function renderRanks(record, modeRecords, options = {}, sections, isCurrent = () => true) {
  // The during-the-game block and this game's stats are page content, not
  // ranking inputs.
  const { duringGame, gameStats, ...rankOptions } = options;
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  const boardRecord = options.boardRecord || record;
  const historyView = options.historyView === true;
  // An old game compares as of now (docs/product/rankings.md, "Full lists
  // and old games"); a game just ended, as of its end.
  const oldGame = options.reviewList !== undefined;
  const referenceMs = historyView || oldGame ? Date.now() : record.endedAt;
  // Each request and the session summary are built in their own task, so
  // none holds the page long; a result no longer current builds no more.
  const prepared = (async () => {
    await yieldAnalysisPresentation();
    if (!isCurrent()) return null;
    const placements = settings.shownThings.recentPlacements ? buildRecentPlacements(record, modeRecords, referenceMs,
      !historyView, options.noMarkTimeLabel || null) : null;
    await yieldAnalysisPresentation();
    if (!isCurrent()) return null;
    const profile = settings.shownThings.boardPercentiles
      ? buildBoardTimeRankProfile(boardRecord, modeRecords, oldGame ? referenceMs : boardRecord.endedAt) : null;
    await yieldAnalysisPresentation();
    if (!isCurrent()) return null;
    const plan = analysisTask('rankings', 'ranks', {
      ...analysisRecordSnapshot(record, modeRecords, rankOptions), preferences: settings, referenceMs, config,
    });
    return { placements, profile, plan };
  })();
  // The summary is built while the workers answer the requests above, once
  // its results tree's lifetime column has every game of the board type
  // filed (fileSessionGameResults, begun at game end).
  const summary = prepared.then(async (parts) => {
    if (parts === null || !settings.shownThings.sessionSummary) return null;
    if (settings.shownThings.sessionEndings && !await fileSessionGameResults(modeRecords, isCurrent)) return null;
    await yieldAnalysisPresentation();
    if (!isCurrent()) return null;
    return buildSessionSummary(record, referenceMs, !historyView, Boolean(options.noMarkTimeLabel), boardRecord);
  });
  // A part of a result no longer current is empty.
  const whenPrepared = (build) => prepared.then((parts) => (parts === null ? [] : build(parts)));
  const whenPlanned = (build) => whenPrepared(async ({ plan }) => {
    const ranks = await plan;
    return isCurrent() ? build(ranks) : [];
  });

  // Live perf charts go in with their charts built, in the same task as game
  // data's frame, so neither moves the other once shown. Until then the
  // details column keeps what it showed: after a game, its final time. The
  // frame that first draws them is the result's costliest (about 27 ms on
  // the check's Expert win), so they go in after a yield, never in the task
  // that sent the last request.
  const detailsShown = Promise.all([prepared, duringGame && duringGame.analysisReady]).then(async ([parts]) => {
    if (parts === null) return;
    await yieldAnalysisPresentation();
    if (!isCurrent()) return;
    clearResultStats();
    resultStats.append(...[duringGame, parts.profile].filter((block) => block));
    syncBoardLayout();
  });

  // A table of games opens its full list, where old games open.
  const listsOpen = oldGamesOpen();
  const timeTable = (table) => buildRankList(table.label, table.count, table.index, 'rank-grid', (i) => {
    const row = table.rows[i - table.start];
    const age = relativeAge(referenceMs, row.endedAt);
    const cells = [['rank-cell', String(i + 1)],
      ['time-cell' + (isMarkless(row) ? ' markless-time' : ''), (row.timeMs / 1000).toFixed(3) + 's']];
    if (i === table.index) cells.push(['age-just-cell age-u-s', 'this']);
    else cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)],
      ['age-unit-cell age-u-' + age.unit, age.unit]);
    return cells;
  }, table.help, listsOpen && table.count > 0
    ? () => openScoreList({ table: table.id, referenceMs, noMark: Boolean(options.noMarkTimeLabel) }) : undefined);
  const streakTable = (table) => buildRankList(table.label, table.count, table.index, 'rank-grid', (i) => {
    const seg = table.rows[i - table.start], age = relativeAge(referenceMs, seg.end);
    const cells = [['rank-cell', String(i + 1)], ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')]];
    if (i === table.index) cells.push(['age-just-cell age-u-s', 'this']);
    else cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)], ['age-unit-cell age-u-' + age.unit, age.unit]);
    return cells;
  });
  // Builds one node per item, yielding to input between them; a result no
  // longer current builds nothing more.
  const buildEach = async (items, build) => {
    const nodes = [];
    for (const item of items) {
      const node = build(item);
      if (node !== null) nodes.push(node);
      await yieldAnalysisPresentation();
      if (!isCurrent()) return [];
    }
    return nodes;
  };

  // The session summary and ranks won lead the table collection; layout
  // moves them beside the board, left and right, where they fit.
  sections.append('tables', whenPrepared(async ({ placements }) => {
    const tables = [await summary, placements].filter((table) => table);
    return tables.length > 0 && isCurrent() ? [sessionTablesColumn(tables)] : [];
  }));
  // A loss's own stats come next, ahead of every rank table, so they flow
  // as high as the collection allows.
  if (gameStats) sections.append('tables', gameStats);
  sections.append('tables', whenPlanned(async (ranks) => {
    const lists = await buildEach(ranks.timeTables, timeTable);
    if (!isCurrent()) return [];
    lists.push(...ranks.streakTables.map(streakTable));
    return lists.length > 0 ? [rankTablesGroup(lists)] : [];
  }));
  sections.append('boardTables', whenPlanned((ranks) => buildEach(ranks.boardTables, timeTable)));

  const chartsShown = settings.shownThings.averageCharts && wins.length >= 2;
  const gameDataRows = whenPrepared(({ profile }) => (profile === null ? [] : profile.analysisReady.then(() => profile.rows)));
  const perfCharts = whenPlanned(async (ranks) => {
    const rows = await gameDataRows;
    return chartsShown ? buildEach(PERF_CHART_SPECS,
      (spec) => buildAverageScatter(spec, ranks.perfCharts[PERF_CHART_SPECS.indexOf(spec)], rows)) : [];
  });
  sections.append('perfCharts', perfCharts);
  const boardCharts = perfCharts.then(() => whenPlanned(async (ranks) => {
    const rows = await gameDataRows;
    return chartsShown ? buildEach(BOARD_CHART_SPECS.filter((spec) => (!spec.setting || settings.shownThings[spec.setting])
      && (spec.setting !== 'largestIsland' || settings.shownThings.boardShapeTables)),
    (spec) => buildAverageScatter(spec, ranks.boardCharts[BOARD_CHART_SPECS.indexOf(spec)], rows)) : [];
  }));
  sections.append('boardCharts', boardCharts);
  sections.append('relationships', boardCharts.then(() => (settings.shownThings.relationshipCharts && wins.length >= 2
    && isCurrent() ? buildEach(relationshipChartBuilders(record, wins, historyView, referenceMs), (build) => build()) : [])));
  await Promise.all([detailsShown, sections.ready()]);
}

// Scatter plots at the very bottom, each raw win value against win time
// (or clicks). Needs at least 2 wins to have a spread. These are the
// "relationship charts": the switch had described them all along but
// never actually gated them until 2026-08-23. One builder per chart: each
// maps every win, so building them all at once held the page about 7 to 19 ms
// at 2,000 wins, growing with the history.
function relationshipChartBuilders(record, wins, historyView, referenceMs) {
  // This game's tag is its rank among today's wins, so an old game from an
  // earlier day has none.
  const todayStart = startOfDay(referenceMs);
  const meLabel = record.endedAt < todayStart ? '' : wins
    .filter((s) => s.endedAt >= todayStart)
    .sort(compareRankedWins)
    .indexOf(record) + 1 + ' today';
  const highlighted = historyView ? null : record;
  const ageInfoOf = (s) => ageInfo(referenceMs, s.endedAt);
  const hourOfDay = (s) => {
    const d = new Date(s.endedAt);
    return d.getHours() + d.getMinutes() / 60;
  };
  // The same Theil–Sen trend pair as the average charts, fit on all
  // wins and on today's (local midnight of referenceMs, like the
  // average charts) — always on the untrimmed values, even where trimY
  // hides outliers from display (the fit resists outliers by
  // construction). Not on "time of day" (a straight line on a circular
  // axis would mislead) nor "no-op clicks" (tied small-integer x
  // leaves too few effective slopes).
  const trendTodayWins = wins.filter((s) => s.endedAt >= startOfDay(referenceMs));
  const trendOpts = (fx, fy) => ({
    trendLines: trendLinesFor(
      wins.map((s) => [fx(s), fy(s)]),
      trendTodayWins.map((s) => [fx(s), fy(s)])),
  });
  // Like trendOpts, but fit only on the subset of wins that carry the
  // charted measurement (a fit over absent values would be nonsense).
  const subsetTrendOpts = (subset, fx, fy) => ({
    trendLines: trendLinesFor(
      subset.map((s) => [fx(s), fy(s)]),
      subset.filter((s) => s.endedAt >= startOfDay(referenceMs))
        .map((s) => [fx(s), fy(s)])),
  });
  const endedAtOf = (s) => s.endedAt;
  const bv3Of = (s) => s.bv3;
  const clicksOf = (s) => s.boardChangingClicks;
  // Axis labels stay terse — one or two words, no units or asides; the
  // tick values carry the scale. "date" spreads wins across the calendar;
  // "time of day" folds every win onto one 24-hour clock, exposing the
  // daily rhythm instead of the long-term trend.
  return [
    () => buildScatter(
      wins, highlighted, endedAtOf, secondsOf,
      'date', 'time', meLabel, ageInfoOf,
      { timeAxis: true, trimY: true, title: 'time by date', yTickUnit: 's',
        ...trendOpts(endedAtOf, secondsOf) }),
    () => buildScatter(
      wins, highlighted, hourOfDay, secondsOf,
      'time of day', 'time', meLabel, ageInfoOf,
      { xDomain: [0, 24], xTicks: [0, 4, 8, 12, 16, 20, 24], trimY: true,
        title: 'time by time of day', yTickUnit: 's' }),
    () => buildScatter(
      wins, highlighted, bv3Of, secondsOf,
      '3BV', 'time', meLabel, ageInfoOf,
      { trimY: true, title: 'time by 3BV', yTickUnit: 's',
        ...trendOpts(bv3Of, secondsOf) }),
    () => buildScatter(
      wins, highlighted, bv3Of, clicksOf,
      '3BV', 'clicks', meLabel, ageInfoOf,
      { idealLine: true, title: 'clicks by 3BV',
        ...trendOpts(bv3Of, clicksOf) }),
    // Only wins that carry the noOpClicks measurement (recorded since
    // 2026-08-19) can appear on its chart.
    () => {
      const withNoOps = wins.filter((s) => 'noOpClicks' in s);
      return withNoOps.length < 2 ? null : buildScatter(
        withNoOps, highlighted, (s) => s.noOpClicks, secondsOf,
        'no-op clicks', 'time', meLabel, ageInfoOf,
        { trimY: true, title: 'time by no-op clicks', yTickUnit: 's' });
    },
    // The guess-ledger scatters: only wins whose records carry the odds
    // measurements (see the guesses/lifeLost fields) can appear. Guess
    // counts are tied small integers, so like no-op clicks they get no
    // trend line; life lost is a continuous risk sum, so it does.
    () => {
      const withGuesses = wins.filter((s) => s.guesses !== undefined);
      return withGuesses.length < 2 ? null : buildScatter(
        withGuesses, highlighted, (s) => s.guesses, secondsOf,
        'guesses', 'time', meLabel, ageInfoOf,
        { trimY: true, title: 'time by guesses', yTickUnit: 's' });
    },
    () => {
      const withLifeLost = wins.filter((s) => s.lifeLost !== undefined);
      const lifeLostOf = (s) => s.lifeLost;
      return withLifeLost.length < 2 ? null : buildScatter(
        withLifeLost, highlighted, lifeLostOf, secondsOf,
        'life lost', 'time', meLabel, ageInfoOf,
        { trimY: true, title: 'time by life lost', yTickUnit: 's',
          ...subsetTrendOpts(withLifeLost, lifeLostOf, secondsOf) });
    },
    // Cadence spread across the calendar: rhythm consistency drift over
    // time, over wins like every relationship chart (dots take the win's age).
    () => {
      const withCadence = wins.filter((s) => s.cadenceSpread !== undefined);
      const cadence = GameData.metrics.find((metric) => metric.id === 'cadenceSpread');
      const cadenceOf = (s) => cadence.value(s);
      return withCadence.length < 2 ? null : buildScatter(
        withCadence, highlighted, endedAtOf, cadenceOf,
        'date', cadence.name, meLabel, ageInfoOf,
        { timeAxis: true, trimY: true,
          title: cadence.name + ' by date', yTickUnit: '\u00d7',
          ...subsetTrendOpts(withCadence, endedAtOf, cadenceOf) });
    },
    () => {
      const legend = document.createElement('div');
      legend.className = 'scatter-legend';
      legend.appendChild(document.createTextNode('dot color = how long ago that win was (dots fade as they age within a color):'));
      for (const [unit, name] of [['s', 'seconds'], ['m', 'minutes'], ['h', 'hours'],
        ['d', 'days'], ['w', 'weeks'], ['mo', 'months'], ['y', 'years']]) {
        const item = document.createElement('span');
        item.className = 'legend-item age-u-' + unit;
        item.textContent = name;
        legend.appendChild(item);
      }
      return legend;
    },
  ];
}
