'use strict';

// Startup: the storage.js hooks (storageFailure, userdataReady), the static
// chrome built at load, and init. Must load last: storage.js starts the page
// as soon as userdataReady exists, so every other game/ script must already
// be loaded.

//-------PERSISTENT STORAGE (shared machinery lives in storage.js)-------

// The database open, upgrade path, readAllUserdata, and persistUserdata
// moved to storage.js on 2026-08-23, shared with the settings page. This
// page supplies the two hooks storage.js calls: storageFailure and
// userdataReady. Traces are far too large for RAM and are written
// straight to their store (see game/input-trace.js).

// A failure to open the database or to persist data is a bug to fix, not a
// mode to tolerate: announce where the player can see it, and throw.
function storageFailure(what) {
  backupStatus.textContent = what;
  showStartupFailure('Could not load your saved game. ' + what);
  throw new Error(what);
}

// Any other error stops startup as a startup bug, not a storage failure,
// rethrown unchanged so the error bar (page-errors.js) names where it was
// thrown. A storage failure inside init has already said what failed.
function startupFailure(error) {
  showStartupFailure('The game failed to start: ' + error.message);
  throw error;
}

// While the page boots, the startup line replaces the board's loading text;
// the first failure shown there stays.
function showStartupFailure(text) {
  const startupStatus = document.getElementById('startup-status');
  if (!document.documentElement.classList.contains('game-booting')
      || startupStatus.classList.contains('startup-error')) return;
  startupStatus.textContent = text;
  startupStatus.classList.add('startup-error');
  document.body.removeAttribute('aria-busy');
}

// The in-page settings drawer became a full page on 2026-08-23: the
// "settings" link at the right end of the top bar opens settings.html
// (see index.html), which shares this page's schema (settings-core.js)
// and database (storage.js). Changes save straight to the shared
// database; this page reads them fresh on every load, and the return
// trip from settings.html is a load.

// Reads every userdata kind, game record, and play span into RAM, then
// finishes startup: init() builds the states panel and the first board, all
// of which read RAM.
function userdataReady() {
  readAllUserdata((got) => readGameRecords((storedHistory) => readAllPlaySpans((spans) => {
    completePendingGames(storedHistory, got.trial).then(() => {
      const loaded = normalizeHistory(storedHistory);
      history = loaded.history;
      if (loaded.changed) persistGameRecordChanges(loaded.writes, loaded.deletions);
      // An absent kind is a player who never stored it, not an error.
      loadSettings(got);
      loadPlayLimits(got.playLimits, got.playLimitPenalty, spans);
      trialSession = got.trial === undefined ? null : got.trial;
      return init();
    }).catch(startupFailure);
  })));
}

// A game whose page closed before the reports worker had judged it is still
// pending (reportResult saves it so): it is judged now, from its stored
// trace, by the same job as at its end, before the history loads. The
// trial result of the game gets its evaluations too.
async function completePendingGames(storedHistory, trial) {
  for (const [key, records] of Object.entries(storedHistory)) {
    for (const record of records) {
      if (record.evaluationPending !== true) continue;
      const stored = await readStoredTrace(record.endedAt);
      const { width, height } = boardOfKey(key);
      const result = await analysisTask('reports', 'finished-game', {
        width, height, mines: stored.finalBoard.cells.map((cell) => cell.mine),
        drill: record.playMode === 'endgame-drill',
        needZini: true, needBoardMetrics: true, needCadence: true, needMoveHabits: true, needFastclickGap: true,
        gameId: record.endedAt, timeMs: record.timeMs, outcome: record.outcome,
        justiceEnabled: record.justiceEnabled, guessLedger: guessLedgerAppliesTo(record.playMode),
        trace: { t: stored.sampleT, x: stored.sampleX, y: stored.sampleY, merged: storedMergedObservations(stored),
          events: stored.events, wallMs: record.endedAt - stored.startedAt,
          initialPageState: stored.initialPageState },
      });
      Object.assign(record, result.measurements);
      completeGameRecord(record, stored, result.evaluation);
      storeGame(key, record, stored, requestArchiveSync);
      const trialResult = trial?.results.find((result) => result.endedAt === record.endedAt);
      if (trialResult !== undefined) {
        trialResult.actionEvaluations = record.actionEvaluations;
        persistUserdata('trial', trial);
      }
    }
  }
}

//-------INIT-------

// Static chrome builds immediately; everything that reads userdata waits
// in init, which userdataReady calls once the RAM copies are filled.
buildLcd(mineCounter);
buildLcd(timerDisplay);
buildFormatPanel();

async function init() {
  config = boardFromPreferences();
  for (const field of ['width', 'height', 'mines']) {
    document.getElementById('custom-' + field).value = settings.customBoardDraft[field];
  }
  buildPlayModeSwitcher();
  buildBoardGeneratorSwitcher();
  syncGameChoice();
  setFlagSize(settings.flagSize);
  setMineSize(settings.mineSize);
  setNumberSize(settings.numberSize);
  initCellSizeControl();
  initSessionScopeSelect();
  renderStates();
  initBoardPositionControls();
  initMotionStats();
  if (Trial.isPlayMode(settings.playMode) && trialSession
      && trialSessionPlayMode() === settings.playMode) {
    config = {
      width: trialSession.width,
      height: trialSession.height,
      mines: trialSession.mines,
    };
    if (trialSession.endedHow !== null) lastTrialReview = trialSession;
  }
  newGame();
  await restorePreferredResult();
  // A restored finished board is not a ready one, so no closed notice.
  renderPlayLimits();
  await initGamePreferences();
  const startupStatus = document.getElementById('startup-status');
  startupStatus.textContent = 'Ready.';
  faceButton.disabled = false;
  boardElement.removeAttribute('aria-busy');
  boardElement.removeAttribute('aria-describedby');
  document.body.removeAttribute('aria-busy');
  document.documentElement.classList.remove('game-booting');
  // After startup, so catching up on older data never delays the first board.
  loadArchive(renderArchiveChip);
  refreshSwitchCost();
}
