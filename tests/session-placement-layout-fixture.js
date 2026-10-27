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
    bv3: 62, clicks: 95, wastedClicks: 0, flagsPlaced: 39, mousePathPx: 1500,
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
      const rankTables = tableItems.querySelector(':scope > .rank-tables');
      check(label + ': the session summary and ranks won lead the continuous table collection',
        sections[0].includes('result-chart-section-tables')
          && resultStats.querySelector('.board-time-profile') !== null
          && resultStats.querySelector('#stats-grid') === null
          && tableItems.children[0].matches('.session-tables')
          && tableItems.children[0].children[0] === summary && tableItems.children[0].children[1] === ranksWon
          && tableItems.children[1] === rankTables && tableItems.children.length === 2
          && summary.querySelectorAll('.session-summary-row').length >= 1
          && !resultRanks.querySelector('.result-chart-section-placements')
          && !document.getElementById('history-placements'));
      // The replay transport under the board: as wide as its frame but never
      // narrower than its five buttons need nor wider than the column, and
      // centered on the board wherever the board fits the column.
      const transportRect = rect(replayControls);
      const boardFits = frameRect.width <= rect(gameArea).width;
      check(label + ': the replay transport sits under the board, centered on it',
        replayControls.checkVisibility() && gameArea.contains(replayControls)
          && transportRect.top >= frameRect.bottom && transportRect.top - frameRect.bottom < 12
          && Math.abs(transportRect.width - Math.min(rect(gameArea).width, Math.max(340, frameRect.width))) < 1
          && (!boardFits || Math.abs((transportRect.left + transportRect.right) - (frameRect.left + frameRect.right)) < 2));
      // Beside the board: the summary on the left and ranks won on the
      // right, tops aligned with the board, wherever each fits the column
      // beside both the board and the transport under it.
      const boardLeft = Math.min(frameRect.left, transportRect.left);
      const boardRight = Math.max(frameRect.right, transportRect.right);
      const sideRoom = (mainRect.width - (boardRight - boardLeft)) / 2 - inset - 16;
      check(label + ': the session summary rests left of the board exactly where it fits',
        summary.classList.contains('beside-board') === (rect(summary).width <= sideRoom)
          && (!summary.classList.contains('beside-board')
            || (Math.abs(rect(summary).right - (boardLeft - 16)) < 1 && Math.abs(rect(summary).top - frameRect.top) < 1)));
      check(label + ': ranks won rests right of the board exactly where it fits',
        ranksWon.classList.contains('beside-board') === (rect(ranksWon).width <= sideRoom)
          && (!ranksWon.classList.contains('beside-board')
            || (Math.abs(rect(ranksWon).left - (boardRight + 16)) < 1 && Math.abs(rect(ranksWon).top - frameRect.top) < 1)));
      // With its session means the summary is wider than the room beside a
      // beginner board at 2560 (2026-10-08), so only ranks won sits there.
      if (width === 2560 && size === 'beginner') check(label + ': at the creator’s width ranks won sits beside a beginner board',
        ranksWon.classList.contains('beside-board'));
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
      // The collection has no section title; its rank tables (time windows,
      // day categories, streaks) share one opener, rankings.
      const rankLists = [...tableItems.querySelectorAll('.rank-list')].filter((list) => list !== summary && list !== ranksWon);
      const rankingsHead = rankTables.querySelector(':scope > .stat-section-head');
      check(label + ': the rank tables share the rankings opener, and the collection has no section title',
        rankingsHead.querySelector('h3 > .stat-section-toggle').textContent === 'rankings'
          && rankLists.length > 0 && rankLists.every((list) => list.parentElement === rankTables.lastElementChild)
          && !tableItems.parentElement.querySelector(':scope > .result-chart-section-head'));
      // Below the board the summary and ranks won form one left column, the
      // summary on top; the rankings title and its tables sit beside that
      // column or under it.
      const lead = [summary, ranksWon].filter((item) => !item.classList.contains('beside-board'));
      check(label + ': below the board the summary heads one column with ranks won under it',
        lead.length === 0 || (Math.abs(rect(lead[0]).top - rect(tableItems).top) < 1
          && Math.abs(rect(lead[0]).left - rect(tableItems).left) < 1
          && (lead.length === 1 || (Math.abs(rect(ranksWon).left - rect(summary).left) < 1
            && rect(ranksWon).top >= rect(summary).bottom - 1))
          && [rankingsHead, ...rankLists].every((item) => lead.every((block) => !overlaps(item, block)))));
      if (width === 1680) check(label + ': the rankings title and its first table use the space beside that column',
        Math.abs(rect(rankingsHead).top - rect(lead[0]).top) < 1
          && rect(rankingsHead).left >= Math.max(...lead.map((item) => rect(item).right)) - 1
          && rect(rankLists[0]).left >= Math.max(...lead.map((item) => rect(item).right)) - 1
          && rect(rankLists[0]).top < rect(lead.at(-1)).bottom);
      const boardRowsBottom = Math.max(rect(gameFrame).bottom, rect(replayControls).bottom,
        ...[...resultRanks.querySelectorAll('.beside-board')].map((block) => rect(block).bottom));
      check(label + ': tables begin directly below the board, its transport, and the blocks beside it',
        rect(resultRanks).top - boardRowsBottom < 32 && rect(resultRanks).top >= boardRowsBottom);
      check(label + ': see scores is in the sidebar',
        gameSidebar.contains(scoresNav) && !gameArea.contains(scoresNav));
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
        check(label + ': summary, controls, and stats share one column, the summary first',
          rect(gameSidebar).left >= rect(mainElement).right
            && rect(resultSummary).bottom <= Math.min(rect(topRight).top, rect(scoresNav).top) + 0.5
            && rect(resultsBox).left >= rect(gameSidebar).left
            && rect(resultsBox).top >= Math.max(rect(topRight).bottom, rect(scoresNav).bottom)
            && rect(pathViewLegend).top >= rect(resultsBox).bottom
            && !document.getElementById('game-data-column'));
        const topBarBlock = rect(topBar).height + parseFloat(getComputedStyle(pageLayout).rowGap);
        check(label + ': the top bar heads the details column',
          Math.abs(rect(topBar).left - rect(gameSidebar).left) < 1 && Math.abs(rect(topBar).right - rect(gameSidebar).right) < 1
            && Math.abs(rect(gameSidebar).top - rect(topBar).bottom - (topBarBlock - rect(topBar).height)) < 1);
        check(label + ': showing the legend leaves stats in place',
          Math.abs(rect(resultsBox).top - statsTop) < 1);
      } else {
        check(label + ': with compact details the top bar sits above the board column',
          rect(topBar).bottom <= rect(mainElement).top);
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
  // A loss: its stats are the "this game" table, third in the collection
  // after the summary and the latest win's ranks won. Beside the board they
  // take a side those two leave free, the left first, exactly where they fit;
  // under the board they float beside the summary column where they fit
  // there, and otherwise at the left under it. Closed, each of the three
  // keeps its open place, so its title does not move.
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
      const summary = resultRanks.querySelector('.session-summary');
      const ranksWon = resultRanks.querySelector('.recent-placements');
      const stats = resultRanks.querySelector('.game-stats');
      const rankingsHead = tableItems.querySelector(':scope > .rank-tables > .stat-section-head');
      check(label + ': its stats are the "this game" table, third in the table collection',
        stats !== null && stats.querySelector('h4').textContent === 'this game'
          && tableItems.children[0].children[0] === summary && tableItems.children[0].children[1] === ranksWon
          && tableItems.children[1] === stats && !!ranksWon.querySelector('.rank-row')
          && resultStats.querySelector('#stats-grid, .game-stats') === null);
      const inset = parseFloat(getComputedStyle(pageLayout).getPropertyValue('--board-edge-inset'));
      const frameRect = rect(gameFrame);
      const transportRect = rect(replayControls);
      const boardLeft = Math.min(frameRect.left, transportRect.left);
      const boardRight = Math.max(frameRect.right, transportRect.right);
      const sideRoom = (rect(mainElement).width - (boardRight - boardLeft)) / 2 - inset - 16;
      const freeSide = !summary.classList.contains('beside-board') ? 'left'
        : !ranksWon.classList.contains('beside-board') ? 'right' : null;
      const beside = stats.classList.contains('beside-board');
      check(label + ': the table rests beside the board exactly where it fits on a free side, the left first',
        beside === (freeSide !== null && rect(stats).width <= sideRoom)
          && (!beside || (Math.abs(rect(stats).top - frameRect.top) < 1
            && (freeSide === 'left' ? Math.abs(rect(stats).right - (boardLeft - 16)) < 1
              : Math.abs(rect(stats).left - (boardRight + 16)) < 1))));
      let besideColumn = false;
      if (!beside) {
        const lead = [summary, ranksWon].filter((block) => !block.classList.contains('beside-board'));
        const columnRight = lead.length > 0 ? Math.max(...lead.map((block) => rect(block).right)) + 18 : rect(tableItems).left;
        const columnBottom = lead.length > 0 ? Math.max(...lead.map((block) => rect(block).bottom)) + 18 : rect(tableItems).top;
        besideColumn = columnRight + rect(stats).width + 18 <= rect(tableItems).right + 0.5;
        check(label + ': under the board it floats beside the summary column where it fits there, else at the left under it',
          (besideColumn
            ? Math.abs(rect(stats).top - rect(tableItems).top) < 1 && Math.abs(rect(stats).left - columnRight) < 1
            : Math.abs(rect(stats).left - rect(tableItems).left) < 1 && Math.abs(rect(stats).top - columnBottom) < 1)
            && [summary, ranksWon].every((block) => block.classList.contains('beside-board') || !overlaps(stats, block))
            && !overlaps(stats, rankingsHead));
      }
      checks.push('INFO ' + label + ': this game ' + Math.round(rect(stats).width)
        + (beside ? ' beside the board' : besideColumn ? ' beside the summary column' : ' under the summary column'));
      // A block beside the board keeps its title's exact place; one under
      // the board stays there, where the flow moves it only for the blocks
      // closed before it.
      const placeOf = (block) => {
        const box = rect(block.querySelector('.stat-section-toggle'));
        return block.classList.contains('beside-board') ? [Math.round(box.left), Math.round(box.top)] : 'under';
      };
      const openPlaces = [summary, ranksWon, stats].map(placeOf);
      for (const panel of tablePanels) settings.panels[panel] = false;
      await renderResult(loss, records);
      await wait();
      const closed = ['.session-summary', '.recent-placements', '.game-stats'].map((selector) => resultRanks.querySelector(selector));
      check(label + ': closed, the summary, ranks won, and this game keep their open places',
        closed.every((block) => block.querySelector(':scope > .stat-section-body').hidden)
          && JSON.stringify(closed.map(placeOf)) === JSON.stringify(openPlaces));
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
    sameBoard(boardBeforeReplay) && rect(resultRanks).top === historyBeforeReplay);
  document.getElementById('replay-last').click();
  await wait();
  check('End restores the finished board without shifting history',
    !replayEnabled && replayStep === replayDecisionCount()
      && pathViewLegend.hidden && sameBoard(boardBeforeReplay)
      && rect(resultRanks).top === historyBeforeReplay);
  // The fixture's two actions are 300 ms apart; the opening frame holds 500 ms.
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
  const stageRect = rect(document.getElementById('trial-stage'));
  check('a trial lobby takes no board offset and stays in its column',
    gameArea.classList.contains('trial-no-board')
      && appliedBoardOffsetX === 0 && appliedBoardOffsetY === 0
      && stageRect.left >= rect(mainElement).left && stageRect.right <= rect(mainElement).right
      && stageRect.top >= rect(modeOptions).bottom && stageRect.top - rect(modeOptions).bottom < 120);
  parent.document.getElementById('checks').textContent += '\nDONE';
})().catch(error => { parent.document.getElementById('checks').textContent += '\nFAIL ' + error.stack; });
