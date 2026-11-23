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
  settings.boardOffsetX = settings.boardOffsetY = 0;
  settings.playMode = 'standard';
  // Exercise all streak variants, including near-near-streak which is
  // available but hidden in the default display settings.
  settings.shownThings.streak = true;
  settings.shownThings.nearStreak = true;
  settings.shownThings.nearNearStreak = true;
  const record = { outcome: 'win', endedAt: Date.now(), timeMs: 33249,
    states: ['just woke up', 'the gaming m3 gen II'],
    bv3: 62, boardChangingClicks: 95, noOpClicks: 0, flagsPlaced: 39, mousePathPx: 1500,
    maxAdjacent: 5, zeroCount: 68, islandCount: 20, zini: 47, playMode: 'standard', actionEvaluations: [] };
  const records = Array.from({length: 24}, (_, i) => ({ ...record,
    endedAt: record.endedAt - (23 - i) * 60000, timeMs: 33000 + i * 500 }));
  records[23] = record;
  const frame = parent.document.querySelector('iframe');
  const rect = element => element.getBoundingClientRect();
  const sameBoard = before => Math.abs(rect(gameFrame).left - before.left) < 1
    && Math.abs(rect(gameFrame).top - before.top) < 1;
  const overlaps = (a, b) => rect(a).left < rect(b).right - 1 && rect(b).left < rect(a).right - 1
    && rect(a).top < rect(b).bottom - 1 && rect(b).top < rect(a).bottom - 1;

  for (const width of [2560, 1680, 1216, 650]) {
    frame.style.width = width + 'px';
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
      const frameRect = rect(gameFrame);
      const stageRect = rect(topStage);
      check(label + ': the board rests centered across the full stage width',
        frameRect.width > stageRect.width
          || Math.abs((frameRect.left - stageRect.left) - (stageRect.right - frameRect.right)) < 1.5);
      const sections = [...resultRanks.children].map(node => node.className);
      const tableItems = resultRanks.querySelector('.result-chart-section-tables .result-chart-section-items');
      const overview = tableItems.querySelector(':scope > .result-overview-band');
      const summary = resultRanks.querySelector('.session-summary');
      const ranksWon = resultRanks.querySelector('.recent-placements');
      const rankTables = tableItems.querySelector(':scope > .rank-tables');
      check(label + ': the overview band (session summary and ranks won) leads the table collection',
        sections[0].includes('result-chart-section-tables')
          && resultStats.querySelector('.board-time-profile') !== null
          && resultStats.querySelector('#stats-grid') === null
          && tableItems.children[0] === overview
          && overview.children[0] === summary && overview.children[1] === ranksWon
          && tableItems.children[1] === rankTables && tableItems.children.length === 2
          && summary.querySelectorAll('.session-summary-row').length >= 1
          && !resultRanks.querySelector('.result-chart-section-placements')
          && !document.getElementById('history-placements'));
      // The replay transport under the board: as wide as its frame (at least
      // 340 px) capped to the stage width, and centered on the board.
      const transportRect = rect(replayControls);
      const boardFits = frameRect.width <= stageRect.width;
      check(label + ': the replay transport sits under the board, centered on it',
        replayControls.checkVisibility() && gameArea.contains(replayControls)
          && transportRect.top >= frameRect.bottom && transportRect.top - frameRect.bottom < 12
          && Math.abs(transportRect.width - Math.min(stageRect.width, Math.max(340, frameRect.width))) < 1.5
          && (!boardFits || Math.abs((transportRect.left + transportRect.right) - (frameRect.left + frameRect.right)) < 2));

      // Adaptive details dock: right flank when at least 320 px fits beside the
      // board footprint (and viewport > 700), else directly below the board.
      const dock = topStage.dataset.detailsDock;
      const footprint = Math.max(frameRect.width, 340);
      const flankRoom = Math.floor((stageRect.width - footprint) / 2 - 18);
      const expectedDock = width <= 700 || flankRoom < 320 ? 'below' : 'right';
      check(label + ': details panel docks ' + expectedDock + ' without overlapping the board',
        dock === expectedDock
          && !overlaps(gameFrame, gameSidebar)
          && !overlaps(replayControls, gameSidebar)
          && (dock === 'below'
            ? rect(gameSidebar).top >= transportRect.bottom && Math.abs(rect(gameSidebar).width - stageRect.width) < 1.5
            : rect(gameSidebar).left >= Math.max(frameRect.right, transportRect.right) + 17
              && Math.abs(rect(gameSidebar).top - stageRect.top) < 1.5
              && !detailsResize.hidden));
      checks.push('INFO ' + label + ': stage ' + Math.round(stageRect.width) + ', board ' + Math.round(frameRect.width)
        + ', dock ' + dock + ' (' + Math.round(rect(gameSidebar).width) + 'px)');

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
      const rankLists = [...tableItems.querySelectorAll('.rank-list')].filter((list) => list !== summary && list !== ranksWon);
      const rankingsHead = rankTables.querySelector(':scope > .stat-section-head');
      check(label + ': the rank tables share the rankings opener, and the collection has no section title',
        rankingsHead.querySelector('h3 > .stat-section-toggle').textContent === 'rankings'
          && rankLists.length > 0 && rankLists.every((list) => list.parentElement === rankTables.lastElementChild)
          && !tableItems.parentElement.querySelector(':scope > .result-chart-section-head'));
      check(label + ': overview tables never overlap each other or rankings, and rankings sits below overview',
        !overlaps(summary, ranksWon)
          && !overlaps(summary, rankingsHead)
          && !overlaps(ranksWon, rankingsHead)
          && rect(rankingsHead).top >= Math.max(rect(summary).bottom, rect(ranksWon).bottom) - 1
          && (width > 720 ? Math.abs(rect(summary).top - rect(ranksWon).top) < 1.5
            : rect(ranksWon).top >= rect(summary).bottom - 1));
      const stageContentBottom = Math.max(frameRect.bottom, transportRect.bottom, rect(gameSidebar).bottom);
      check(label + ': full-width result sections begin cleanly below the top stage',
        rect(resultRanks).top >= stageContentBottom - 1
          && Math.abs(rect(resultRanks).width - stageRect.width) < 1.5);
      check(label + ': see scores is in the details panel',
        gameSidebar.contains(scoresNav) && !gameArea.contains(scoresNav));
      check(label + ': redundant review heading is absent',
        !document.querySelector('.review-heading') && !document.getElementById('replay-final-time'));
      check(label + ': details controls and stats fit their panel',
        gameSidebar.scrollWidth <= gameSidebar.clientWidth + 1);

      guardianAngelLive.innerHTML = '<span class="guardian-angel-live-word" style="animation:none">your Guardian Angel intervened once to keep you safe</span>';
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
      if (dock !== 'below') {
        check(label + ': tall stats and legend stay inside the docked panel without moving board or history',
          Math.abs(rect(resultRanks).top - historyTop) < 1 && sameBoard(before)
            && Math.abs(rect(resultsBox).top - statsTop) < 1);
      } else {
        check(label + ': below-board details keep the board fixed when tall', sameBoard(before));
      }
      check(label + ': top bar stays above the top stage',
        rect(topBar).bottom <= stageRect.top + 1);
      extraStats.remove();
      pathViewLegend.hidden = true;
      pathViewLegend.replaceChildren();
    }
  }

  // Board-first horizontal movement: moving the board right flips the details
  // dock automatically to the left flank; moving left widens the right flank.
  frame.style.width = '2560px';
  config = { ...DIFFICULTIES.expert };
  newGame();
  history[modeKey()] = records;
  gameState = 'won';
  finalTimeMs = record.timeMs;
  await renderResult(record, records);
  renderPathViewControls();
  await wait();
  const centerBoardLeft = rect(gameFrame).left;
  setBoardPositionPreference(500, 0, false);
  await wait();
  const rightMovedLeft = rect(gameFrame).left;
  const leftDockSidebar = rect(gameSidebar);
  const leftDockGrip = rect(detailsResize);
  check('2560px expert moved right: board moves freely right and details dock flips left',
    rightMovedLeft >= centerBoardLeft + 450
      && topStage.dataset.detailsDock === 'left'
      && !overlaps(gameFrame, gameSidebar)
      && leftDockSidebar.right <= rightMovedLeft - 17
      && leftDockGrip.left >= leftDockSidebar.right && leftDockGrip.right <= rightMovedLeft);
  setBoardPositionPreference(-500, 0, false);
  await wait();
  const leftMovedLeft = rect(gameFrame).left;
  const rightDockSidebar = rect(gameSidebar);
  check('2560px expert moved left: board moves freely left and details dock sits right',
    leftMovedLeft <= centerBoardLeft - 450
      && topStage.dataset.detailsDock === 'right'
      && !overlaps(gameFrame, gameSidebar)
      && rightDockSidebar.left >= rect(gameFrame).right + 17);
  setBoardPositionPreference(0, 0, false);
  await wait();

  // A loss: its stats are the "this game" table, third in the overview band
  // after the summary and the latest win's ranks won.
  const loss = { ...record, outcome: 'loss', endedAt: record.endedAt + 1000 };
  const tablePanels = ['sessionSummary', 'recentPlacements', 'gameStats'];
  for (const width of [2560, 1680, 1216, 650]) {
    frame.style.width = width + 'px';
    for (const size of ['beginner', 'intermediate', 'expert']) {
      window.scrollTo(0, 0);
      config = { ...DIFFICULTIES[size] };
      newGame();
      history[modeKey()] = records;
      await wait();
      gameState = 'lost';
      finalTimeMs = loss.timeMs;
      await renderResult(loss, records);
      renderPathViewControls();
      await wait();
      const label = width + 'px ' + size + ' loss';
      const tableItems = resultRanks.querySelector('.result-chart-section-tables .result-chart-section-items');
      const overview = tableItems.querySelector(':scope > .result-overview-band');
      const summary = resultRanks.querySelector('.session-summary');
      const ranksWon = resultRanks.querySelector('.recent-placements');
      const stats = resultRanks.querySelector('.game-stats');
      const rankingsHead = tableItems.querySelector(':scope > .rank-tables > .stat-section-head');
      check(label + ': its stats are the "this game" table, third in the overview band',
        stats !== null && stats.querySelector('h4').textContent === 'this game'
          && overview.children[0] === summary && overview.children[1] === ranksWon
          && overview.children[2] === stats && !!ranksWon.querySelector('.rank-row')
          && resultStats.querySelector('#stats-grid, .game-stats') === null);
      check(label + ': overview tables never overlap each other or rankings',
        !overlaps(summary, ranksWon) && !overlaps(summary, stats) && !overlaps(ranksWon, stats)
          && !overlaps(stats, rankingsHead)
          && rect(rankingsHead).top >= Math.max(rect(summary).bottom, rect(ranksWon).bottom, rect(stats).bottom) - 1);
      // Closing each overview table leaves its own title at the same place.
      let stationary = true;
      for (const [panel, block] of [['gameStats', stats], ['recentPlacements', ranksWon], ['sessionSummary', summary]]) {
        const toggle = block.querySelector('.stat-section-toggle');
        const beforePos = [Math.round(rect(toggle).left), Math.round(rect(toggle).top)];
        toggle.click();
        await wait();
        const afterPos = [Math.round(rect(toggle).left), Math.round(rect(toggle).top)];
        if (beforePos[0] !== afterPos[0] || beforePos[1] !== afterPos[1]
            || !block.querySelector(':scope > .stat-section-body').hidden) stationary = false;
        settings.panels[panel] = true;
      }
      check(label + ': closing each overview table leaves its title in place', stationary);
      for (const panel of tablePanels) settings.panels[panel] = true;
    }
  }

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
      position: { ...config, cells: '.'.repeat(config.width * config.height) } } })));
  await renderResult(record, records);
  setReplayStep(replayDecisionCount());
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
  document.body.dispatchEvent(arrow);
  check('after a game the arrow keys step the transport under the board',
    arrow.defaultPrevented && replayEnabled && replayStep === replayDecisionCount() - 1);
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
    sameBoard(boardBeforeReplay) && Math.abs(rect(resultRanks).top - historyBeforeReplay) < 1);
  document.getElementById('replay-last').click();
  await wait();
  check('End restores the finished board without shifting history',
    !replayEnabled && replayStep === replayDecisionCount()
      && pathViewLegend.hidden && sameBoard(boardBeforeReplay)
      && Math.abs(rect(resultRanks).top - historyBeforeReplay) < 1);
  replayPlay.click();
  check('play from the finished board starts over and shows pause',
    replayStep === 0 && replayEnabled && replayPlay.classList.contains('playing')
      && replayPlay.getAttribute('aria-label') === 'Pause');
  await new Promise(resolve => setTimeout(resolve, 1000));
  check('playback walks the actions and stops on the finished board',
    replayStep === replayDecisionCount() && !replayEnabled && !replayPlay.classList.contains('playing')
      && replayPlay.getAttribute('aria-label') === 'Play' && sameBoard(boardBeforeReplay));
  replayPlay.click();
  replayNext.click();
  check('a step press stops playback', replayStep === 1 && !replayPlay.classList.contains('playing'));
  await new Promise(resolve => setTimeout(resolve, 600));
  check('a stopped playback stays where it stopped', replayStep === 1);
  replayPlay.click();
  newGame();
  await wait();
  check('a new game stops playback and hides the transport',
    !replayControls.checkVisibility() && !replayPlay.classList.contains('playing') && !replayEnabled);

  // A trial lobby hides the board frame; repeated layout passes once grew
  // the board offset from its empty rect until the lobby left the screen.
  settings.difficulty = 'custom';
  settings.playMode = 'short-trial';
  config = { ...settings.customBoard };
  syncGameChoice();
  newGame();
  for (let pass = 0; pass < 4; pass++) {
    syncBoardLayout();
    await wait();
  }
  const trialStageRect = rect(document.getElementById('trial-stage'));
  check('a trial lobby takes no board offset and stays in its column',
    gameArea.classList.contains('trial-no-board')
      && appliedBoardOffsetX === 0 && appliedBoardOffsetY === 0
      && trialStageRect.left >= rect(mainElement).left && trialStageRect.right <= rect(mainElement).right
      && trialStageRect.top >= rect(modeOptions).bottom && trialStageRect.top - rect(modeOptions).bottom < 120);
  parent.document.getElementById('checks').textContent += '\nDONE';
})().catch(error => { parent.document.getElementById('checks').textContent += '\nFAIL ' + error.stack; });
