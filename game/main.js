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
  const startupStatus = document.getElementById('startup-status');
  if (document.documentElement.classList.contains('game-booting') && startupStatus !== null) {
    startupStatus.textContent = 'Could not load your saved game. ' + what;
    startupStatus.classList.add('startup-error');
    document.body.removeAttribute('aria-busy');
  }
  throw new Error(what);
}

// The in-page settings drawer became a full page on 2026-08-23: the
// "settings" opener in the top bar is now a plain link to settings.html
// (see index.html), which shares this page's schema (settings-core.js)
// and database (storage.js). Changes save straight to the shared
// database; this page reads them fresh on every load, and the return
// trip from settings.html is a load.

// Reads every userdata kind and game record into RAM, then finishes startup:
// init() builds the states panel and the first board, all of which read RAM.
function userdataReady() {
  readAllUserdata((got) => readGameRecords((storedHistory) => readPlaySpansSince(
    playDayStart(Date.now()), (spans) => {
      const loaded = normalizeHistory(storedHistory);
      history = loaded.history;
      if (loaded.changed) persistGameRecordChanges(loaded.writes, loaded.deletions);
      // An absent kind is a player who never stored it, not an error.
      loadSettings(got);
      loadPlayLimits(got.playLimits, spans);
      trialSession = got.trial === undefined ? null : got.trial;
      init().catch((error) => storageFailure(error.message));
    })));
}

//-------INIT-------

// Static chrome builds immediately; everything that reads userdata waits
// in init, which userdataReady calls once the RAM copies are filled.
buildLcd(mineCounter);
buildLcd(timerDisplay);
buildFormatPanel();

// The other-pages menu hangs under its button, right edges aligned. The top
// bar scrolls with the page when the details are the compact popover, so the
// menu follows it while open.
const otherPagesButton = document.getElementById('other-pages-btn');
const otherPagesMenu = document.getElementById('other-pages-menu');
function placeOtherPagesMenu() {
  const rect = otherPagesButton.getBoundingClientRect();
  otherPagesMenu.style.top = rect.bottom + 2 + 'px';
  otherPagesMenu.style.right = document.documentElement.clientWidth - rect.right + 'px';
}
otherPagesMenu.addEventListener('beforetoggle', (event) => {
  if (event.newState === 'open') {
    placeOtherPagesMenu();
    window.addEventListener('scroll', placeOtherPagesMenu, { passive: true });
    window.addEventListener('resize', placeOtherPagesMenu);
  } else {
    window.removeEventListener('scroll', placeOtherPagesMenu);
    window.removeEventListener('resize', placeOtherPagesMenu);
  }
});

async function init() {
  config = boardFromPreferences();
  for (const field of ['width', 'height', 'mines']) {
    document.getElementById('custom-' + field).value = settings.customBoardDraft[field];
  }
  syncDifficultyTabs();
  initCellSizeControl();
  initSessionScopeSelect();
  buildPlayModeSwitcher();
  buildBoardGeneratorSwitcher();
  renderStates();
  initBoardPositionControls();
  // The history RAM is filled now and nothing has been played yet: the
  // one safe moment to rebuild the session window from stored records.
  sessionBackfillFromHistory();
  if (Trial.isPlayMode(settings.playMode) && trialSession
      && trialSessionPlayMode() === settings.playMode) {
    config = {
      width: trialSession.width,
      height: trialSession.height,
      mines: trialSession.mines,
    };
    syncDifficultyTabs();
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
