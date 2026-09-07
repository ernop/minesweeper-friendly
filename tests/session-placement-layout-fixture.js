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
  const record = { outcome: 'win', endedAt: Date.now(), timeMs: 33520,
    states: [], bv3: 100, clicks: 130, wastedClicks: 0, flags: 0, mousePathPx: 1500,
    maxNumber: 4, zeros: 80, islands: 12, zini: 110 };
  for (const size of ['beginner', 'intermediate', 'expert']) {
    config = { ...DIFFICULTIES[size] };
    newGame();
    gameState = 'won';
    finalTimeMs = record.timeMs;
    renderResult(record, [record]);
    await wait();
    const line = document.querySelector('#history-placements .rank-row');
    check(size + ': first placement row visible in 1216 × 928',
      line && line.getBoundingClientRect().bottom <= innerHeight && line.getBoundingClientRect().top >= 0);
    check(size + ': placements precede review and full stats',
      document.getElementById('history-placements').getBoundingClientRect().top < scoresNav.getBoundingClientRect().top);
  }
  renderResult({ ...record, outcome: 'loss', endedAt: record.endedAt + 1000 }, [record]);
  check('loss keeps existing history placements available', !!document.querySelector('#history-placements .rank-row'));
})().catch(error => { parent.document.getElementById('checks').textContent += '\nFAIL ' + error.stack; });
