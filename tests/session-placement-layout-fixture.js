// Browser fixture: synthetic data and settings stay in RAM; no storage writes.
(async () => {
  const wait = async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    while ([...analysisLanes.values()].some((lane) => lane.pending.size) || liveMetricsPending
        || resultRanks.hasAttribute('aria-busy')) await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => requestAnimationFrame(resolve));
  };
  const checks = [];
  const check = (label, ok) => {
    checks.push((ok ? 'PASS ' : 'FAIL ') + label);
    parent.document.getElementById('checks').textContent = checks.join('\n');
  };
  while (settings === null || document.documentElement.classList.contains('game-booting')) await wait();
  settings.showSessionStats = true;
  settings.showMotionStatsDuringGame = false;
  settings.boardOffsetX = settings.boardOffsetY = 0;
  settings.playMode = 'standard';
  // Exercise all streak variants, including near-near-streak which is
  // available but hidden in the default display settings.
  settings.shownThings.streak = true;
  settings.shownThings.nearStreak = true;
  settings.shownThings.nearNearStreak = true;
  sessionEvents = [];
  sessionPlayFrom = null;
  refreshMetricsPanel();
  await wait();
  const positions = () => [...metricsPanel.querySelectorAll('.session-metric-row')].map(el => el.offsetTop);
  const initial = positions();
  sessionPlayFrom = Date.now() - 2000;
  sessionPlayModeKey = modeKey();
  refreshMetricsPanel();
  await wait();
  check('first played-time strip leaves chart rows in place', JSON.stringify(initial) === JSON.stringify(positions()));
  sessionRecordPress(true, 0);
  sessionRecordEnd('win', 0);
  sessionPlayEnd();
  refreshMetricsPanel();
  await wait();
  check('first measurements and ending leave chart rows in place', JSON.stringify(initial) === JSON.stringify(positions()));
  sessionPlayFrom = null;
  const record = { outcome: 'win', endedAt: Date.now(), timeMs: 33249,
    states: ['just woke up', 'the gaming m3 gen II'],
    bv3: 62, clicks: 95, wastedClicks: 0, flagsPlaced: 39, mousePathPx: 1500,
    maxAdjacent: 5, zeroCount: 68, islandCount: 20, zini: 47 };
  const records = Array.from({length: 24}, (_, i) => ({ ...record,
    endedAt: record.endedAt - (23 - i) * 60000, timeMs: 33000 + i * 500 }));
  records[23] = record;
  const frame = parent.document.querySelector('iframe');
  const rect = element => element.getBoundingClientRect();
  const sameBoard = before => Math.abs(rect(gameFrame).left - before.left) < 1
    && Math.abs(rect(gameFrame).top - before.top) < 1;
  for (const [width, sidebar] of [[2560, false], [1680, false], [1216, true], [650, false]]) {
    frame.style.width = width + 'px';
    settings.showSessionStats = sidebar;
    renderMetricsPanel(null);
    for (const size of ['beginner', 'intermediate', 'expert']) {
      window.scrollTo(0, 0);
      config = { ...DIFFICULTIES[size] };
      newGame();
      history[modeKey()] = records;
      await wait();
      const before = rect(gameFrame);
      gameState = 'won';
      finalTimeMs = record.timeMs;
      await renderResult(record, records);
      renderPathViewControls();
      await wait();
      const label = width + 'px ' + size;
      check(label + ': finishing leaves the board in place', sameBoard(before));
      const inset = parseFloat(getComputedStyle(pageLayout).getPropertyValue('--board-edge-inset'));
      const frameRect = rect(gameFrame);
      const mainRect = rect(mainElement);
      check(label + ': the board rests centered in its column',
        frameRect.width > mainRect.width
          || Math.abs((frameRect.left - mainRect.left) - (mainRect.right - frameRect.right)) < 1);
      const sections = [...resultRanks.children].map(node => node.className);
      const tableItems = resultRanks.querySelector('.result-chart-section-tables .result-chart-section-items');
      const summary = resultRanks.querySelector('.session-summary');
      const ranksWon = resultRanks.querySelector('.recent-placements');
      check(label + ': the session summary and ranks won lead the continuous table collection',
        sections[0].includes('result-chart-section-tables')
          && (pageLayout.classList.contains('game-data-docked') ? gameDataColumn : resultStats)
            .querySelector('.board-time-profile') !== null
          && resultStats.querySelector('#stats-grid') === null
          && tableItems.children[0] === summary && tableItems.children[1] === ranksWon
          && summary.querySelectorAll('.session-summary-row').length >= 1
          && !resultRanks.querySelector('.result-chart-section-placements')
          && !document.getElementById('history-placements'));
      // Beside the board: the summary on the left and ranks won on the
      // right, tops aligned with the board, wherever each fits the column.
      const sideRoom = (mainRect.width - frameRect.width) / 2 - inset - 16;
      check(label + ': the session summary rests left of the board exactly where it fits',
        summary.classList.contains('beside-board') === (rect(summary).width <= sideRoom)
          && (!summary.classList.contains('beside-board')
            || (Math.abs(rect(summary).right - (frameRect.left - 16)) < 1 && Math.abs(rect(summary).top - frameRect.top) < 1)));
      check(label + ': ranks won rests right of the board exactly where it fits',
        ranksWon.classList.contains('beside-board') === (rect(ranksWon).width <= sideRoom)
          && (!ranksWon.classList.contains('beside-board')
            || (Math.abs(rect(ranksWon).left - (frameRect.right + 16)) < 1 && Math.abs(rect(ranksWon).top - frameRect.top) < 1)));
      if (width === 2560 && size === 'beginner') check(label + ': at the creator’s width both blocks sit beside a beginner board',
        summary.classList.contains('beside-board') && ranksWon.classList.contains('beside-board'));
      checks.push('INFO ' + label + ': main ' + Math.round(mainRect.width) + ', board ' + Math.round(frameRect.width)
        + ', summary ' + Math.round(rect(summary).width) + (summary.classList.contains('beside-board') ? ' beside' : ' below')
        + ', ranks won ' + Math.round(rect(ranksWon).width) + (ranksWon.classList.contains('beside-board') ? ' beside' : ' below'));
      const tableLabels = [...tableItems.querySelectorAll('h4')].map(el => el.textContent);
      const boardTables = resultRanks.querySelector('.result-chart-section-boardTables');
      const boardLabels = [...boardTables.querySelectorAll('h4')].map(el => el.textContent);
      check(label + ': board comparisons occupy their own named section',
        boardTables.querySelector('h3').textContent === 'This board'
          && ['3BV 62', 'ZiNi 47', 'max number 5'].every(name => boardLabels.includes(name))
          && !tableLabels.some(name => /^(3BV|ZiNi|max number|[0-9]+ islands)/.test(name))
          && resultRanks.children[1] === boardTables);
      check(label + ': all streak tables share the upper collection',
        ['streak', 'near-streak', 'near-near-streak'].every(name => tableLabels.includes(name))
          && !resultRanks.querySelector('.result-chart-section-streaks'));
      check(label + ': table collection has no section heading',
        !tableItems.parentElement.querySelector('.result-chart-section-title'));
      const inFlow = [...tableItems.children].filter((item) => !item.classList.contains('beside-board'));
      // Below the board the summary and ranks won form one left column, the
      // summary on top; later tables sit beside that column or under it.
      const lead = inFlow.filter((item) => item === summary || item === ranksWon);
      const overlaps = (a, b) => rect(a).left < rect(b).right - 1 && rect(b).left < rect(a).right - 1
        && rect(a).top < rect(b).bottom - 1 && rect(b).top < rect(a).bottom - 1;
      check(label + ': below the board the summary heads one column with ranks won under it',
        lead.length === 0 || (lead[0] === inFlow[0]
          && inFlow.every((item) => rect(item).top >= rect(lead[0]).top - 1 && rect(item).left >= rect(lead[0]).left - 1)
          && (lead.length === 1 || (Math.abs(rect(ranksWon).left - rect(summary).left) < 1
            && rect(ranksWon).top >= rect(summary).bottom - 1))
          && inFlow.filter((item) => !lead.includes(item)).every((item) => lead.every((block) => !overlaps(item, block)))));
      if (width === 1680) check(label + ': the next table uses the space beside that column',
        Math.abs(rect(inFlow[lead.length]).top - rect(inFlow[0]).top) < 1
          && rect(inFlow[lead.length]).left >= Math.max(...lead.map((item) => rect(item).right)) - 1);
      const boardRowsBottom = Math.max(rect(gameFrame).bottom,
        ...[...resultRanks.querySelectorAll('.beside-board')].map((block) => rect(block).bottom));
      check(label + ': tables begin directly below the board and the blocks beside it',
        rect(resultRanks).top - boardRowsBottom < 32 && rect(resultRanks).top >= boardRowsBottom);
      check(label + ': replay is collapsed and all inspection controls are in the sidebar',
        !replayReview.open && !replayControls.checkVisibility()
          && gameSidebar.contains(scoresNav) && !gameArea.contains(scoresNav));
      check(label + ': redundant review heading is absent',
        !document.querySelector('.review-heading') && !document.getElementById('replay-final-time'));
      check(label + ': details controls and stats fit their column',
        gameSidebar.scrollWidth <= gameSidebar.clientWidth);
      justiceLive.innerHTML = '<span class="justice-live-word" style="animation:none">Justice!</span>';
      syncBoardLayout();
      await wait();
      const historyTop = rect(resultRanks).top;
      const statsTop = rect(resultsBox).top;
      const extraStats = document.createElement('div');
      extraStats.style.height = '1500px';
      extraStats.textContent = 'Tall stats fixture';
      resultStats.appendChild(extraStats);
      pathViewLegend.innerHTML = '<div style="height:1500px">Complete tall legend fixture</div>';
      pathViewLegend.hidden = false;
      syncBoardLayout();
      await wait();
      check(label + ': tall stats and legend cannot push history down',
        Math.abs(rect(resultRanks).top - historyTop) < 1 && sameBoard(before));
      if (!pageLayout.classList.contains('compact-sidebar')) {
        check(label + ': stats and controls own a separate column',
          rect(gameSidebar).left >= rect(mainElement).right
            && rect(resultsBox).left >= rect(gameSidebar).left
            && rect(resultsBox).top >= rect(topRight).bottom
            && rect(pathViewLegend).top >= rect(resultsBox).bottom);
        if (pageLayout.classList.contains('game-data-docked')) check(label + ': game data has its own full-height column beside the board column',
          rect(gameDataColumn).left >= rect(mainElement).right && rect(gameSidebar).left >= rect(gameDataColumn).right
            && Math.abs(rect(gameDataColumn).height - (innerHeight - 24)) < 1);
        check(label + ': showing the legend leaves stats in place',
          Math.abs(rect(resultsBox).top - statsTop) < 1);
      } else {
        check(label + ': compact details stay out of document flow',
          gameSidebar.hasAttribute('popover') && !gameSidebarButton.hidden);
        gameSidebarButton.click();
        await wait();
        check(label + ': details open without moving board or history',
          gameSidebar.matches(':popover-open') && sameBoard(before)
            && Math.abs(rect(resultRanks).top - historyTop) < 1);
        check(label + ': open details fit their panel',
          gameSidebar.scrollWidth <= gameSidebar.clientWidth);
      }
      replayReview.querySelector('summary').click();
      await wait();
      check(label + ': opening replay leaves the board and tables in place',
        replayReview.open && replayControls.checkVisibility() && sameBoard(before)
          && Math.abs(rect(resultRanks).top - historyTop) < 1
          && gameSidebar.scrollWidth <= gameSidebar.clientWidth);
      replayReview.querySelector('summary').click();
      await wait();
      if (pageLayout.classList.contains('compact-sidebar')) {
        gameSidebarClose.click();
        await wait();
        check(label + ': details close explicitly', !gameSidebar.matches(':popover-open'));
      }
      extraStats.remove();
      pathViewLegend.hidden = true;
      pathViewLegend.replaceChildren();
    }
  }
  await renderResult({ ...record, outcome: 'loss', endedAt: record.endedAt + 1000 }, records);
  check('loss keeps prior win placements in the same chart collection',
    !!resultRanks.querySelector('.result-chart-section-tables .recent-placements .rank-row'));

  // Exercise actual replay renders: rebuilding a visible, scrolled legend
  // must not temporarily empty the sidebar and reset the reader's position.
  frame.style.width = '1680px';
  frame.style.height = '650px';
  config = { ...DIFFICULTIES.beginner };
  newGame();
  gameState = 'won';
  finalTimeMs = record.timeMs;
  trace.events.push(...[0, 1].map(i => ({ kind: 'decision', t: i * 300, x: 0, y: 0,
    evaluation: { action: 'reveal', cell: i, atMs: i * 300,
      position: { ...config, revealed: [], flagged: [] } } })));
  await renderResult(record, records);
  setReplayStep(replayDecisionCount());
  const closedArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
  document.body.dispatchEvent(closedArrow);
  check('arrow keys do not start a hidden replay',
    !closedArrow.defaultPrevented && !replayEnabled && replayStep === replayDecisionCount());
  replayReview.open = true;
  // Native toggle delivery updates the panel preference before a replay
  // render reads it; an immediate redraw would close the test's own panel.
  await wait();
  setReplayStep(0);
  await wait();
  gameSidebar.scrollTop = 200;
  const scrollBeforeReplay = gameSidebar.scrollTop;
  const historyBeforeReplay = rect(resultRanks).top;
  const boardBeforeReplay = rect(gameFrame);
  setReplayStep(1);
  await wait();
  check('stepping replay preserves the legend scroll position',
    scrollBeforeReplay > 0 && gameSidebar.scrollTop === scrollBeforeReplay);
  check('stepping replay preserves board and history positions',
    sameBoard(boardBeforeReplay) && rect(resultRanks).top === historyBeforeReplay);
  replayReview.open = false;
  await wait();
  check('closing replay restores the finished board without shifting history',
    !replayEnabled && replayStep === replayDecisionCount()
      && pathViewLegend.hidden && sameBoard(boardBeforeReplay)
      && rect(resultRanks).top === historyBeforeReplay);
  replayReview.open = true;
  newGame();
  await wait();
  check('a new game resets replay to collapsed and hidden',
    !replayReview.open && replayReview.hidden);
  parent.document.getElementById('checks').textContent += '\nDONE';
})().catch(error => { parent.document.getElementById('checks').textContent += '\nFAIL ' + error.stack; });
