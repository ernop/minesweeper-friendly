'use strict';

// renderRanks: a result's table collection, board tables, average-time
// charts, and relationship charts, in their fixed section order.

//-------RESULT RANKS (tables and charts in section order)-------

async function renderRanks(record, modeRecords, options = {}, sections, isCurrent = () => true) {
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  const boardRecord = options.boardRecord || record;
  const historyView = options.historyView === true;
  const referenceMs = historyView ? Date.now() : record.endedAt;
  const plan = await analysisTask('rankings', 'ranks', {
    ...analysisRecordSnapshot(record, modeRecords, options), preferences: settings, referenceMs, config,
  });
  if (!isCurrent()) return;
  const timeTable = (table) => buildRankList(table.label, table.count, table.index, 'rank-grid', (i) => {
    const row = table.rows[i - table.start];
    const age = relativeAge(referenceMs, row.endedAt);
    const cells = [['rank-cell', String(i + 1)],
      ['time-cell' + (isMarkless(row) ? ' markless-time' : ''), (row.timeMs / 1000).toFixed(3) + 's']];
    if (i === table.index) cells.push(['age-just-cell age-u-s', 'this']);
    else cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)],
      ['age-unit-cell age-u-' + age.unit, age.unit]);
    return cells;
  }, table.help);
  if (settings.shownThings.recentPlacements) {
    sections.append('tables', buildRecentPlacements(record, wins, referenceMs, !historyView));
  }
  for (const table of plan.timeTables) {
    sections.append('tables', timeTable(table));
    await yieldAnalysisPresentation();
    if (!isCurrent()) return;
  }
  for (const table of plan.boardTables) {
    sections.append('boardTables', timeTable(table));
    await yieldAnalysisPresentation();
    if (!isCurrent()) return;
  }
  resultStats.querySelector('.board-time-profile-host')?.remove();
  gameDataColumn.replaceChildren();
  if (settings.shownThings.boardPercentiles) {
    const profile = buildBoardTimeRankProfile(boardRecord, modeRecords);
    if (profile) {
      (pageLayout.classList.contains('game-data-docked') ? gameDataColumn : resultStats).replaceChildren(profile);
      await profile.analysisReady;
      if (!isCurrent()) return;
    }
  }

  if (settings.shownThings.averageCharts && wins.length >= 2) {
    for (const spec of PERF_CHART_SPECS) {
      const chart = buildAverageScatter(spec, plan.perfCharts[PERF_CHART_SPECS.indexOf(spec)]);
      if (chart !== null) sections.append('perfCharts', chart);
      await yieldAnalysisPresentation();
      if (!isCurrent()) return;
    }
    for (const spec of BOARD_CHART_SPECS) {
      if (spec.setting && !settings.shownThings[spec.setting]) continue;
      if (spec.setting === 'largestIsland' && !settings.shownThings.boardShapeTables) continue;
      const chart = buildAverageScatter(spec, plan.boardCharts[BOARD_CHART_SPECS.indexOf(spec)]);
      if (chart !== null) sections.append('boardCharts', chart);
      await yieldAnalysisPresentation();
      if (!isCurrent()) return;
    }
  }

  for (const table of plan.streakTables) {
    sections.append('tables', buildRankList(table.label, table.count, table.index, 'rank-grid', (i) => {
      const seg = table.rows[i - table.start], age = relativeAge(referenceMs, seg.end);
      const cells = [['rank-cell', String(i + 1)], ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')]];
      if (!historyView && seg.current) cells.push(['age-just-cell age-u-s', 'this']);
      else cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)], ['age-unit-cell age-u-' + age.unit, age.unit]);
      return cells;
    }));
  }

  // Scatter plots at the very bottom, each raw win value against win time
  // (or clicks). Needs at least 2 wins to have a spread. These are the
  // "relationship charts": the switch had described them all along but
  // never actually gated them until 2026-08-23.
  if (settings.shownThings.relationshipCharts && wins.length >= 2) {
    const todayStart = startOfDay(record.endedAt);
    const todayRank = wins
      .filter((s) => s.endedAt >= todayStart)
      .sort(compareRankedWins)
      .indexOf(record) + 1;
    const meLabel = todayRank + ' today';
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
    const endedAtOf = (s) => s.endedAt;
    const bv3Of = (s) => s.bv3;
    const clicksOf = (s) => s.clicks;
    // Axis labels stay terse — one or two words, no units or asides; the
    // tick values carry the scale. "date" spreads wins across the calendar;
    // "time of day" folds every win onto one 24-hour clock, exposing the
    // daily rhythm instead of the long-term trend.
    const appendScatter = (svg) => sections.append('relationships', svg);
    appendScatter(buildScatter(
      wins, highlighted, endedAtOf, secondsOf,
      'date', 'time', meLabel, ageInfoOf,
      { timeAxis: true, trimY: true, title: 'time by date', yTickUnit: 's',
        ...trendOpts(endedAtOf, secondsOf) }));
    appendScatter(buildScatter(
      wins, highlighted, hourOfDay, secondsOf,
      'time of day', 'time', meLabel, ageInfoOf,
      { xDomain: [0, 24], xTicks: [0, 4, 8, 12, 16, 20, 24], trimY: true,
        title: 'time by time of day', yTickUnit: 's' }));
    appendScatter(buildScatter(
      wins, highlighted, bv3Of, secondsOf,
      '3BV', 'time', meLabel, ageInfoOf,
      { trimY: true, title: 'time by 3BV', yTickUnit: 's',
        ...trendOpts(bv3Of, secondsOf) }));
    appendScatter(buildScatter(
      wins, highlighted, bv3Of, clicksOf,
      '3BV', 'clicks', meLabel, ageInfoOf,
      { idealLine: true, title: 'clicks by 3BV',
        ...trendOpts(bv3Of, clicksOf) }));
    // Only wins that carry the wastedClicks measurement (recorded since
    // 2026-08-19) can appear on its chart.
    const withWasted = wins.filter((s) => 'wastedClicks' in s);
    if (withWasted.length >= 2) {
      appendScatter(buildScatter(
        withWasted, historyView ? null : record, (s) => s.wastedClicks, secondsOf,
        'no-op clicks', 'time', meLabel, ageInfoOf,
        { trimY: true, title: 'time by no-op clicks', yTickUnit: 's' }));
    }
    // The guess-ledger scatters: only wins whose records carry the odds
    // measurements (see the guesses/lifeLost fields) can appear. Guess
    // counts are tied small integers, so like no-op clicks they get no
    // trend line; life lost is a continuous risk sum, so it does.
    const withGuesses = wins.filter((s) => s.guesses !== undefined);
    if (withGuesses.length >= 2) {
      appendScatter(buildScatter(
        withGuesses, historyView ? null : record, (s) => s.guesses, secondsOf,
        'guesses', 'time', meLabel, ageInfoOf,
        { trimY: true, title: 'time by guesses', yTickUnit: 's' }));
    }
    // Like trendOpts, but fit only on the subset of wins that carry the
    // charted measurement (a fit over absent values would be nonsense).
    const subsetTrendOpts = (subset, fx, fy) => ({
      trendLines: trendLinesFor(
        subset.map((s) => [fx(s), fy(s)]),
        subset.filter((s) => s.endedAt >= startOfDay(referenceMs))
          .map((s) => [fx(s), fy(s)])),
    });
    const withLifeLost = wins.filter((s) => s.lifeLost !== undefined);
    if (withLifeLost.length >= 2) {
      const lifeLostOf = (s) => s.lifeLost;
      appendScatter(buildScatter(
        withLifeLost, historyView ? null : record, lifeLostOf, secondsOf,
        'life lost', 'time', meLabel, ageInfoOf,
        { trimY: true, title: 'time by life lost', yTickUnit: 's',
          ...subsetTrendOpts(withLifeLost, lifeLostOf, secondsOf) }));
    }
    // Cadence spread across the calendar: rhythm consistency drift over
    // time (wins only here; the session charts cover losses too).
    const withCadence = wins.filter((s) => s.cadenceSpread !== undefined);
    if (withCadence.length >= 2) {
      const cadenceOf = (s) => s.cadenceSpread;
      appendScatter(buildScatter(
        withCadence, historyView ? null : record, endedAtOf, cadenceOf,
        'date', 'cadence spread', meLabel, ageInfoOf,
        { timeAxis: true, trimY: true,
          title: 'cadence spread by date', yTickUnit: '\u00d7',
          ...subsetTrendOpts(withCadence, endedAtOf, cadenceOf) }));
    }
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
    sections.append('relationships', legend);
  }
  await sections.ready();
}
