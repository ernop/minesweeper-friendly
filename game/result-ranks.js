'use strict';

// renderRanks: a result's table collection, board tables, average-time
// charts, and relationship charts, in their fixed section order.

//-------RESULT RANKS (tables and charts in section order)-------

function renderRanks(record, modeRecords, options = {}, sections) {
  const wins = modeRecords.filter((r) => r.outcome === 'win');
  const boardRecord = options.boardRecord || record;
  const historyView = options.historyView === true;
  const referenceMs = historyView ? Date.now() : record.endedAt;
  const selectedIndex = (list) => historyView ? -1 : list.indexOf(record);
  // Row builder shared by every time-ranked list: rank, solve time, and the
  // win's age split into count and unit cells (or a single "this" marking
  // the game that just finished).
  const timeAgeRow = (list) => (i) => {
    const age = relativeAge(referenceMs, list[i].endedAt);
    const cells = [
      ['rank-cell', String(i + 1)],
      // Markless games carry a small (m) before their time (CSS ::before).
      ['time-cell' + (isMarkless(list[i]) ? ' markless-time' : ''),
        (list[i].timeMs / 1000).toFixed(3) + 's'],
    ];
    if (!historyView && list[i] === record) {
      cells.push(['age-just-cell age-u-s', 'this']);
    } else {
      cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
      cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
    }
    return cells;
  };
  // Recent placements (requested 2026-08-23): which top-tenth ranks on
  // the longer charts were earned within the chosen recent window.
  if (settings.shownThings.recentPlacements) {
    sections.append('tables',
      buildRecentPlacements(record, wins, referenceMs, !historyView));
  }

  // Progressive disclosure (the collapseDuplicateCharts setting, on by
  // default): two lists holding the exact same wins would render
  // identically, so only the most specific one of each such group is shown,
  // and broader charts appear on their own once history spreads across
  // enough hours/days/weekdays to make them differ. Exception: "lifetime"
  // and "past week" (2026-08-22) always render, and claim their content
  // first, so any window holding the exact same wins collapses into one
  // of them rather than the other way around. Switched off, every window
  // renders its own chart regardless of duplication.
  const candidates = rankColumns(referenceMs)
    .filter((column) => settings.shownThings.lastOneMinute || column.label !== 'past 1 min')
    .map((column) => {
      const inWindow = wins.filter(column.filter).sort(compareRankedWins);
      return {
        label: column.label,
        displayOrder: column.displayOrder,
        dedupePriority: column.dedupePriority,
        column,
        inWindow,
        wins: inWindow,
      };
    });
  const kept = new Set(candidates);
  if (settings.collapseDuplicateCharts) {
    kept.clear();
    for (const candidate of dedupeRankCandidates(candidates, ['lifetime', 'past week'])) {
      kept.add(candidate);
    }
  }
  if (settings.shownThings.timeTables) {
    for (const c of candidates) {
      if (!kept.has(c)) continue;
      const { column, inWindow } = c;
      sections.append('tables', buildRankList(
        column.label,
        inWindow.length, selectedIndex(inWindow), 'rank-grid',
        timeAgeRow(inWindow), column.help));
    }
  }

  // Full tables retain all standings, including ordinary and poor results.
  // Only the recent-achievements summary applies a top-tenth cutoff.
  const boardComparisons = [];
  for (const candidate of boardMetricCandidates([boardRecord], wins)) {
    if (!settings.shownThings[candidate.setting]) continue;
    const matching = candidate.wins.slice().sort(compareRankedWins);
    boardComparisons.push({ ...candidate, wins: matching });
    sections.append('boardTables', buildRankList(
      candidate.label,
      matching.length, selectedIndex(matching), 'rank-grid',
      timeAgeRow(matching), candidate.help?.(boardRecord)));
  }

  // Board-shape time lists: this win's finished-board family only.
  // Older wins that lack the measurement stay off the list. Nested
  // filters (max 2 ⊂ max 3 ⊂ max 4) collapse under the same setting
  // as the window charts, most specific first.
  const shapeCandidates = boardShapeCandidates([boardRecord], wins)
    .filter((candidate) => settings.shownThings.largestIsland
      || !candidate.label.startsWith('largest island '));
  const shapeKept = new Set(shapeCandidates);
  if (settings.collapseDuplicateCharts) {
    shapeKept.clear();
    const dedupeCandidates = shapeCandidates
      .map((candidate) => ({ ...candidate, wins: candidate.rows }));
    for (const candidate of dedupeRankCandidates(dedupeCandidates)) {
      shapeKept.add(shapeCandidates.find((original) => original.label === candidate.label));
    }
  }
  if (settings.shownThings.boardShapeTables) {
    // Identical time-table memberships do not make two board measurements
    // interchangeable. Keep every scalar trait on the value-rank chart.
    boardComparisons.push(...shapeCandidates);
    for (const c of shapeCandidates) {
      if (!shapeKept.has(c)) continue;
      const inWindow = c.rows.slice().sort(compareRankedWins);
      sections.append('boardTables', buildRankList(
        c.label,
        inWindow.length, selectedIndex(inWindow), 'rank-grid',
        timeAgeRow(inWindow)));
    }
  }

  resultStats.querySelector('.board-time-profile-host')?.remove();
  gameDataColumn.replaceChildren();
  if (settings.shownThings.boardPercentiles) {
    const profile = buildBoardTimeRankProfile(boardRecord, boardComparisons, historyView, modeRecords);
    if (profile) (pageLayout.classList.contains('game-data-docked') ? gameDataColumn : resultStats).replaceChildren(profile);
  }

  if (settings.shownThings.averageCharts && wins.length >= 2) {
    for (const spec of AVERAGE_SCATTER_SPECS) {
      const chart = buildAverageScatter(spec, wins, modeRecords, record, historyView);
      if (chart !== null) sections.append('averages', chart);
    }
  }

  // Streak lists: wins in chronological runs split by losses. A k-loss
  // streak joins k+1 adjacent runs; the streak ending in this win is "me".
  // modeRecords is chronological (appended in play order; import re-sorts).
  const runs = [[]];
  for (const r of modeRecords) {
    if (r.outcome === 'win') runs[runs.length - 1].push(r.endedAt);
    else runs.push([]);
  }
  for (const [label, slack] of [['streak', 0], ['near-streak', 1], ['near-near-streak', 2]]) {
    if (label === 'streak' && !settings.shownThings.streak) continue;
    if (label === 'near-streak' && !settings.shownThings.nearStreak) continue;
    if (label === 'near-near-streak' && !settings.shownThings.nearNearStreak) continue;
    const span = Math.min(slack + 1, runs.length);
    // Each window of `span` adjacent runs is trimmed to its nonempty core
    // (consecutive losses leave empty runs that pad windows). Identical
    // cores are deduped and cores strictly inside a wider core are dropped,
    // so a sub-streak never appears alongside the wider streak containing
    // it. Windows that merely overlap (sharing a middle run across two
    // different losses) are distinct streaks and both stay.
    const cores = new Map(); // 'a-b' -> {a, b} inclusive run-index range
    for (let i = 0; i + span <= runs.length; i++) {
      let a = -1, b = -1;
      for (let j = i; j < i + span; j++) {
        if (runs[j].length === 0) continue;
        if (a === -1) a = j;
        b = j;
      }
      if (a === -1) continue;
      cores.set(a + '-' + b, { a, b });
    }
    const allCores = [...cores.values()];
    const segments = allCores
      .filter((c) => !allCores.some((o) => o.a <= c.a && c.b <= o.b && (o.a < c.a || o.b > c.b)))
      .map(({ a, b }) => {
        const winsAt = runs.slice(a, b + 1).flat();
        return { len: winsAt.length, end: winsAt[winsAt.length - 1], current: b === runs.length - 1 };
      });
    segments.sort((a, b) => b.len - a.len || b.end - a.end);
    const myIndex = historyView ? -1 : segments.findIndex((seg) => seg.current);
    sections.append('tables', buildRankList(
      label,
      segments.length, myIndex, 'rank-grid',
      (i) => {
        const seg = segments[i];
        const age = relativeAge(referenceMs, seg.end);
        const cells = [
          ['rank-cell', String(i + 1)],
          ['time-cell', seg.len + (seg.len === 1 ? ' win' : ' wins')],
        ];
        if (!historyView && seg.current) {
          cells.push(['age-just-cell age-u-s', 'this']);
        } else {
          cells.push(['age-num-cell age-u-' + age.unit, formatAgeCount(age)]);
          cells.push(['age-unit-cell age-u-' + age.unit, age.unit]);
        }
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
}
