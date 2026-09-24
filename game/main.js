'use strict';

// Startup: the storage.js hooks (storageFailure, userdataReady), the play
// mode and generator switchers, and init. Must load last: storage.js starts
// the page as soon as userdataReady exists, so every other game/ script
// must already be loaded.

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

// Reads every userdata kind into its RAM object, then finishes startup:
// init() builds the states panel and the first board, all of which read RAM.
function userdataReady() {
  readAllUserdata((got) => {
    // An absent kind is a player who never stored it, not an error.
    const loaded = normalizeHistory(got.history === undefined ? {} : got.history);
    history = loaded.history;
    if (loaded.changed) persistUserdata('history', history);
    loadSettings(got);
    trialSession = got.trial === undefined ? null : got.trial;
    init().catch((error) => storageFailure(error.message));
  });
}

//-------INIT-------

// Static chrome builds immediately; everything that reads userdata waits
// in init, which userdataReady calls once the RAM copies are filled.
buildLcd(mineCounter);
buildLcd(timerDisplay);
buildFormatPanel();

function buildPlayModeSwitcher() {
  const select = document.getElementById('play-mode-select');
  select.textContent = '';
  for (const mode of PLAY_MODES) {
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.label;
    select.appendChild(option);
  }
  select.value = settings.playMode;
  select.disabled = false;
  select.addEventListener('change', () => setPlayMode(select.value));
}

function setPlayMode(id) {
  if (!PLAY_MODE_IDS.has(id)) throw new Error('unknown play mode ' + id);
  if (id === settings.playMode) return;
  if (Trial.isPlayMode(settings.playMode) && trialIsActive()) abandonTrial();
  if (pregenActive() || id === 'pregen-10-3bv-desc') pregenBatch = null;
  lastTrialReview = null;
  settings.playMode = id;
  saveSettings();
  document.getElementById('play-mode-select').value = id;
  refreshGeneratorSelect();
  // The custom form's visibility depends on the mode (the Board lab's
  // sliders replace it), not only on the matched difficulty.
  syncDifficultyTabs();
  newGame();
}

function buildBoardGeneratorSwitcher() {
  const select = document.getElementById('board-generator-select');
  select.textContent = '';
  for (const spec of BoardGenerators.SPECS) {
    const option = document.createElement('option');
    option.value = spec.id;
    option.textContent = spec.label;
    option.title = spec.describe;
    select.appendChild(option);
  }
  select.value = settings.boardGenerator;
  select.addEventListener('change', () => setBoardGenerator(select.value));
  refreshGeneratorSelect();
}

function setBoardGenerator(id) {
  BoardGenerators.byId(id); // throws on an unknown id
  if (id === settings.boardGenerator) return;
  settings.boardGenerator = id;
  saveSettings();
  document.getElementById('board-generator-select').value = id;
  newGame();
}

// The generator menu is live only in modes that place mines with it;
// single-path NG carves its own corridor boards and trial sessions use
// fixed identities, so there the menu is disabled rather than lying.
function refreshGeneratorSelect() {
  const select = document.getElementById('board-generator-select');
  const applies = generatorAppliesToMode(settings.playMode);
  select.disabled = !applies;
  select.title = applies
    ? '' : playModeLabel() + ' builds its boards its own way; the generator applies in the other modes';
}

function syncDifficultyTabs() {
  const matched = settings.difficulty;
  for (const tab of document.querySelectorAll('#difficulty-tabs a')) {
    tab.classList.toggle('active', tab.dataset.difficulty === matched);
  }
  customForm.hidden = matched !== 'custom' || boardLabActive();
}

async function init() {
  config = boardFromPreferences();
  for (const field of ['width', 'height', 'mines']) {
    document.getElementById('custom-' + field).value = settings.customBoardDraft[field];
  }
  syncDifficultyTabs();
  initCellSizeControl();
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
  await initGamePreferences();
  const startupStatus = document.getElementById('startup-status');
  startupStatus.textContent = 'Ready.';
  faceButton.disabled = false;
  boardElement.removeAttribute('aria-busy');
  boardElement.removeAttribute('aria-describedby');
  document.body.removeAttribute('aria-busy');
  document.documentElement.classList.remove('game-booting');
}
