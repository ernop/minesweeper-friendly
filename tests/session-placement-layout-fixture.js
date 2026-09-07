// Browser fixture: synthetic data and settings stay in RAM; no storage writes.
(async () => {
  const wait = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
  for (const [width, sidebar] of [[1680, false], [1216, true], [650, false]]) {
    frame.style.width = width + 'px';
    settings.showSessionStats = sidebar;
    renderMetricsPanel(null);
    for (const size of ['beginner', 'intermediate', 'expert']) {
      window.scrollTo(0, 0);
      config = { ...DIFFICULTIES[size] };
      newGame();
      await wait();
      const before = rect(gameFrame);
      gameState = 'won';
      finalTimeMs = record.timeMs;
      renderResult(record, records);
      renderPathViewControls();
      await wait();
      const label = width + 'px ' + size;
      check(label + ': finishing leaves the board in place', sameBoard(before));
      const sections = [...resultRanks.children].map(node => node.className);
      const rankingItems = resultRanks.querySelector('.result-chart-section-rankings .result-chart-section-items');
      check(label + ': daily summary is the first table inside rankings',
        sections[0].includes('result-chart-section-rankings')
          && rankingItems.firstElementChild.classList.contains('recent-placements')
          && !resultRanks.querySelector('.result-chart-section-placements')
          && !document.getElementById('history-placements'));
      if (width === 1680) check(label + ': the summary and rank tables share the first row',
        Math.abs(rect(rankingItems.children[0]).top - rect(rankingItems.children[1]).top) < 1);
      check(label + ': rankings begin directly below the board',
        rect(resultRanks).top - rect(gameFrame).bottom < 32);
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
      check(label + ': opening replay leaves the board and rankings in place',
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
  renderResult({ ...record, outcome: 'loss', endedAt: record.endedAt + 1000 }, records);
  check('loss keeps prior win placements in the same chart collection',
    !!resultRanks.querySelector('.result-chart-section-rankings .recent-placements .rank-row'));

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
  renderResult(record, records);
  setReplayStep(replayDecisionCount());
  const closedArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
  document.body.dispatchEvent(closedArrow);
  check('arrow keys do not start a hidden replay',
    !closedArrow.defaultPrevented && !replayEnabled && replayStep === replayDecisionCount());
  replayReview.open = true;
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
