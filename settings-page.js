'use strict';

//-------THE SETTINGS PAGE (settings.html)-------

// The full settings page, created 2026-08-23 when the in-page drawer was
// retired, and stripped to just the switches later that day (a demo
// world briefly lived beside them). It shares the game's schema
// (settings-core.js) and database (storage.js). Every change saves
// immediately; the game page reads settings fresh on every load, so
// returning to the game applies them.

const settingsStatus = document.getElementById('settings-status');

function storageFailure(what) {
  settingsStatus.hidden = false;
  settingsStatus.textContent = what;
  throw new Error(what);
}

function userdataReady() {
  readAllUserdata((got) => {
    loadSettings(got);
    buildSettingsColumn();
    initPreferencesTransfer();
    loadArchive(renderArchiveSettings);
    readPlaySpansSince(playDayStart(Date.now()),
      (spans) => initPlayLimits(got.playLimits, got.playLimitPenalty, spans));
  });
}

//-------DAILY LIMITS (rules in play-limits.js)-------

// Limits and the penalty are their own userdata kinds, outside
// SETTINGS_SCHEMA, so a preferences import can never lift one. Each change
// goes through two confirmations; the second checks the lock again at the
// moment it applies.
let playLimits = null;
let playLimitPenalty = null;
const playSpans = new Map();
const playLimitsChannel = new BroadcastChannel(PLAY_LIMITS_CHANNEL);
const playLimitTable = document.getElementById('play-limit-table');
const playLimitPenaltyLine = document.getElementById('play-limit-penalty');
const playLimitDialog = document.getElementById('play-limit-dialog');
let playLimitChangeTimer = null;
let playLimitEdit = null;  // { kind, step: 'edit' | 'confirm', value, error }
let playLimitPenaltyEdit = null;  // { step: 'edit' | 'confirm', value, error }

function initPlayLimits(stored, storedPenalty, spans) {
  playLimits = playLimitsFrom(stored);
  playLimitPenalty = playLimitPenaltyFrom(storedPenalty);
  for (const span of spans) playSpans.set(span.startedAt, span);
  playLimitsChannel.addEventListener('message', ({ data }) => {
    if (data.span !== undefined) playSpans.set(data.span.startedAt, data.span);
    if (data.limits !== undefined) playLimits = playLimitsFrom(data.limits);
    if (data.penalty !== undefined) playLimitPenalty = playLimitPenaltyFrom(data.penalty);
    renderPlayLimitTable();
  });
  renderPlayLimitTable();
}

function playDayUseNow() {
  return playDayUse(playSpans.values(), Date.now());
}

function playLimitCell(className, text) {
  const cell = document.createElement('span');
  cell.className = className;
  cell.setAttribute('role', 'cell');
  cell.textContent = text;
  return cell;
}

function playLimitLockText(lock) {
  return lock === 'reached' ? 'reached, so locked until ' + PLAY_DAY_START_TEXT
    : 'over ' + formatPlayLimitDuration(PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS) + ' played today, so locked until '
      + PLAY_DAY_START_TEXT;
}

function renderPlayLimitTable() {
  const now = Date.now();
  const use = playDayUse(playSpans.values(), now);
  const head = document.createElement('div');
  head.className = 'play-limit-row play-limit-head';
  head.setAttribute('role', 'row');
  for (const text of ['', 'today', 'limit', '']) {
    const cell = playLimitCell('play-limit-column-name', text);
    cell.setAttribute('role', 'columnheader');
    head.appendChild(cell);
  }
  const rows = PLAY_LIMIT_KINDS.map((kind) => {
    const row = document.createElement('div');
    row.className = 'play-limit-row';
    row.dataset.limit = kind.id;
    row.setAttribute('role', 'row');
    const set = Object.hasOwn(playLimits, kind.id);
    const stage = set ? playLimitStage(kind, playLimits[kind.id], playLimitPenalty, use, now) : 'open';
    row.classList.toggle('reached', stage !== 'open');
    const name = playLimitCell('setting-name', kind.label);
    name.title = kind.describe;
    const used = playLimitCell('play-limit-used', formatPlayLimitUsed(kind, use));
    const value = playLimitCell(set ? 'play-limit-value' : 'play-limit-none',
      set ? formatPlayLimitValue(kind, playLimits[kind.id]) : 'none');
    const actions = playLimitCell('play-limit-actions', '');
    const lock = set ? playLimitLoosenLock(kind, playLimits, use, now) : null;
    if (stage !== 'open') {
      const mark = document.createElement('span');
      mark.className = 'play-limit-reached';
      mark.textContent = stage === 'closed' ? 'closed'
        : 'no flags, closes at '
          + formatPlayLimitAmount(kind, playLimitClosingUse(kind, playLimits[kind.id], playLimitPenalty));
      actions.appendChild(mark);
    }
    if (lock !== null) {
      const locked = document.createElement('span');
      locked.className = 'play-limit-lock';
      locked.textContent = 'locked until ' + PLAY_DAY_START_TEXT;
      locked.title = (kind.type === 'clock' ? 'Making it later or removing it: ' : 'Raising or removing it: ')
        + playLimitLockText(lock);
      actions.appendChild(locked);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = set ? 'Change' : 'Set';
    button.addEventListener('click', () => openPlayLimitDialog(kind));
    actions.appendChild(button);
    row.append(name, used, value, actions);
    return row;
  });
  playLimitTable.replaceChildren(head, ...rows);
  renderPlayLimitPenaltyLine(use, now);
  clearTimeout(playLimitChangeTimer);
  playLimitChangeTimer = setTimeout(renderPlayLimitTable, nextPlayLimitChange(playLimits, now) - now);
}

function openPlayLimitDialog(kind) {
  const current = playLimits[kind.id];
  playLimitEdit = { kind, step: 'edit', value: current, error: null };
  renderPlayLimitDialog();
  playLimitDialog.showModal();
  const input = playLimitDialog.querySelector('input');
  input.focus();
  input.select();
}

function playLimitDialogButton(text, onClick, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (className !== undefined) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function playLimitChangeText(kind, value) {
  if (value === undefined) return 'Remove the ' + kind.label + ' limit';
  if (kind.type === 'clock') return 'No new games from ' + formatMinuteOfDay(value) + ' until ' + PLAY_DAY_START_TEXT;
  if (kind.type === 'minutes') return formatPlayLimitMinutes(value) + ' of play time per day';
  return value + ' ' + kind.label + ' per day';
}

function readPlayLimitInput(kind) {
  const input = playLimitDialog.querySelector('input');
  if (kind.type === 'clock') {
    const match = /^(\d\d):(\d\d)$/.exec(input.value);
    return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
  }
  return input.value.trim() === '' ? null : Number(input.value);
}

// Refusal text for moving this limit from its current value to `value`, or
// null when the change is allowed now.
function playLimitChangeRefusal(kind, value) {
  const current = playLimits[kind.id];
  if (value === current) return 'That is the current limit.';
  if (!playLimitLoosens(kind, current, value)) return null;
  const lock = playLimitLoosenLock(kind, playLimits, playDayUseNow(), Date.now());
  if (lock === null) return null;
  return (value === undefined ? 'Removing' : kind.type === 'clock' ? 'Making it later' : 'Raising')
    + ' is locked: ' + playLimitLockText(lock) + '.';
}

function proposePlayLimit(value) {
  const { kind } = playLimitEdit;
  const refusal = value === null || (value !== undefined && !validPlayLimitValue(kind, value))
    ? (kind.type === 'clock' ? 'Enter a time of day.'
      : 'Enter a whole number from 1 to '
        + (kind.type === 'minutes' ? PLAY_LIMIT_MAX_MINUTES : PLAY_LIMIT_MAX_GAMES) + '.')
    : playLimitChangeRefusal(kind, value);
  playLimitEdit = refusal === null ? { kind, step: 'confirm', value, error: null }
    : { kind, step: 'edit', value: value === null || value === undefined ? playLimitEdit.value : value,
      error: refusal };
  renderPlayLimitDialog();
}

function applyPlayLimit() {
  const { kind, value } = playLimitEdit;
  const refusal = playLimitChangeRefusal(kind, value);
  if (refusal !== null) {
    playLimitEdit = { kind, step: 'edit', value: playLimits[kind.id], error: refusal };
    renderPlayLimitDialog();
    return;
  }
  const next = { ...playLimits };
  if (value === undefined) delete next[kind.id];
  else next[kind.id] = value;
  playLimits = next;
  persistUserdata('playLimits', playLimits);
  playLimitsChannel.postMessage({ limits: playLimits });
  playLimitDialog.close();
  renderPlayLimitTable();
}

function renderPlayLimitDialog() {
  const { kind, step, value, error } = playLimitEdit;
  const set = Object.hasOwn(playLimits, kind.id);
  const title = document.createElement('h2');
  title.id = 'play-limit-dialog-title';
  const parts = [title];
  const buttons = document.createElement('div');
  buttons.className = 'play-limit-dialog-buttons';
  if (step === 'edit') {
    title.textContent = kind.type === 'clock' ? 'Stop time' : 'Daily ' + kind.label + ' limit';
    const describe = document.createElement('p');
    describe.textContent = kind.describe[0].toUpperCase() + kind.describe.slice(1) + '.';
    parts.push(describe);
    if (kind.type !== 'clock') {
      const today = document.createElement('p');
      const amount = document.createElement('span');
      amount.className = 'play-limit-amount';
      amount.textContent = formatPlayLimitUsed(kind, playDayUseNow());
      today.append('Today: ', amount, kind.type === 'minutes' ? ' played' : ' ' + kind.label);
      parts.push(today);
    }
    const field = document.createElement('label');
    field.className = 'play-limit-field';
    const input = document.createElement('input');
    if (kind.type === 'clock') {
      input.type = 'time';
      input.step = '60';
      input.value = value === undefined ? '23:00'
        : String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
      field.append('no new games from ', input, ' until ' + PLAY_DAY_START_TEXT);
    } else {
      input.type = 'number';
      input.min = '1';
      input.step = '1';
      input.max = String(kind.type === 'minutes' ? PLAY_LIMIT_MAX_MINUTES : PLAY_LIMIT_MAX_GAMES);
      input.value = value === undefined ? '' : String(value);
      field.append(input, kind.type === 'minutes' ? ' minutes per day' : ' ' + kind.label + ' per day');
    }
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      proposePlayLimit(readPlayLimitInput(kind));
    });
    parts.push(field);
    const rule = document.createElement('p');
    rule.textContent = kind.type === 'clock'
      ? 'Adding a stop time or making it earlier works any time. Making it later or removing it works only while the day\u2019s play is at most '
        + formatPlayLimitDuration(PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS) + ' and the stop time has not come.'
      : 'Adding or lowering a limit works any time. Raising or removing it works only while the day\u2019s play is at most '
        + formatPlayLimitDuration(PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS) + ' and it is not reached.';
    parts.push(rule);
    const lock = set ? playLimitLoosenLock(kind, playLimits, playDayUseNow(), Date.now()) : null;
    if (lock !== null && error === null) {
      const locked = document.createElement('p');
      locked.className = 'play-limit-warning';
      locked.textContent = 'Today it can only be ' + (kind.type === 'clock' ? 'made earlier' : 'lowered')
        + ': ' + playLimitLockText(lock) + '.';
      parts.push(locked);
    }
    buttons.append(playLimitDialogButton('Cancel', () => playLimitDialog.close()));
    if (set) buttons.append(playLimitDialogButton('Remove limit', () => proposePlayLimit(undefined)));
    buttons.append(playLimitDialogButton('Continue', () => proposePlayLimit(readPlayLimitInput(kind)), 'primary'));
  } else {
    title.textContent = 'Confirm again';
    const change = document.createElement('p');
    change.className = 'play-limit-change';
    change.textContent = playLimitChangeText(kind, value);
    parts.push(change);
    const stage = value === undefined ? 'open'
      : playLimitStage(kind, value, playLimitPenalty, playDayUseNow(), Date.now());
    if (stage !== 'open') {
      const reached = document.createElement('p');
      reached.className = 'play-limit-warning';
      reached.textContent = stage === 'closed'
        ? 'Already reached today: no new games until ' + PLAY_DAY_START_TEXT + '.'
        : 'Already reached today: no new flags on the next boards, and no new games from '
          + formatPlayLimitAmount(kind, playLimitClosingUse(kind, value, playLimitPenalty))
          + (kind.type === 'minutes' ? ' played' : ' ' + kind.label) + '.';
      parts.push(reached);
    }
    // The confirm button sits where the first step had Cancel, so a double
    // click on Continue cannot confirm.
    buttons.classList.add('confirm-step');
    buttons.append(
      playLimitDialogButton(value === undefined ? 'Remove limit' : 'Set limit', applyPlayLimit, 'primary'),
      playLimitDialogButton('Back', () => {
        playLimitEdit = { kind, step: 'edit', value, error: null };
        renderPlayLimitDialog();
      }));
  }
  if (error !== null) {
    const problem = document.createElement('p');
    problem.className = 'play-limit-warning';
    problem.setAttribute('role', 'alert');
    problem.textContent = error;
    parts.push(problem);
  }
  parts.push(buttons);
  playLimitDialog.replaceChildren(...parts);
}

// What reaching a limit does: one line under the table, changed through the
// same two confirmations and loosening lock as a limit.
function renderPlayLimitPenaltyLine(use, now) {
  const name = document.createElement('span');
  name.className = 'setting-name';
  name.textContent = 'when a limit is reached';
  const penalty = playLimitPenaltySpec(playLimitPenalty);
  const value = document.createElement('span');
  value.className = 'play-limit-value';
  value.textContent = penalty.label;
  value.title = penalty.describe[0].toUpperCase() + penalty.describe.slice(1) + '.';
  const actions = document.createElement('span');
  actions.className = 'play-limit-actions';
  if (playLimitPenalty === 'closed') {
    const lock = playLimitPenaltyLoosenLock(playLimits, use, now);
    if (lock !== null) {
      const locked = document.createElement('span');
      locked.className = 'play-limit-lock';
      locked.textContent = 'locked until ' + PLAY_DAY_START_TEXT;
      locked.title = 'Going back to no flags first: ' + playLimitLockText(lock);
      actions.appendChild(locked);
    }
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Change';
  button.addEventListener('click', openPlayLimitPenaltyDialog);
  actions.appendChild(button);
  playLimitPenaltyLine.replaceChildren(name, value, actions);
}

function openPlayLimitPenaltyDialog() {
  playLimitPenaltyEdit = { step: 'edit', value: playLimitPenalty, error: null };
  renderPlayLimitPenaltyDialog();
  playLimitDialog.showModal();
  playLimitDialog.querySelector('input:checked').focus();
}

function playLimitPenaltyChangeRefusal(value) {
  if (value === playLimitPenalty) return 'That is the current choice.';
  if (!playLimitPenaltyLoosens(playLimitPenalty, value)) return null;
  const lock = playLimitPenaltyLoosenLock(playLimits, playDayUseNow(), Date.now());
  return lock === null ? null : 'Going back to no flags first is locked: ' + playLimitLockText(lock) + '.';
}

function proposePlayLimitPenalty(value) {
  const refusal = playLimitPenaltyChangeRefusal(value);
  playLimitPenaltyEdit = { step: refusal === null ? 'confirm' : 'edit', value, error: refusal };
  renderPlayLimitPenaltyDialog();
}

function applyPlayLimitPenalty() {
  const { value } = playLimitPenaltyEdit;
  const refusal = playLimitPenaltyChangeRefusal(value);
  if (refusal !== null) {
    playLimitPenaltyEdit = { step: 'edit', value: playLimitPenalty, error: refusal };
    renderPlayLimitPenaltyDialog();
    return;
  }
  playLimitPenalty = value;
  persistUserdata('playLimitPenalty', playLimitPenalty);
  playLimitsChannel.postMessage({ penalty: playLimitPenalty });
  playLimitDialog.close();
  renderPlayLimitTable();
}

function renderPlayLimitPenaltyDialog() {
  const { step, value, error } = playLimitPenaltyEdit;
  const title = document.createElement('h2');
  title.id = 'play-limit-dialog-title';
  const parts = [title];
  const buttons = document.createElement('div');
  buttons.className = 'play-limit-dialog-buttons';
  if (step === 'edit') {
    title.textContent = 'When a limit is reached';
    const intro = document.createElement('p');
    intro.textContent = 'The board in play always finishes. Then:';
    parts.push(intro);
    const choices = document.createElement('div');
    choices.className = 'play-limit-choices';
    for (const penalty of PLAY_LIMIT_PENALTIES) {
      const choice = document.createElement('label');
      choice.className = 'play-limit-choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'play-limit-penalty';
      input.value = penalty.id;
      input.checked = penalty.id === value;
      const label = document.createElement('span');
      label.className = 'play-limit-choice-label';
      label.textContent = penalty.label + ':';
      choice.append(input, label, penalty.describe
        + (penalty.id === DEFAULT_PLAY_LIMIT_PENALTY ? ' (the default)' : ''));
      choices.appendChild(choice);
    }
    parts.push(choices);
    const rule = document.createElement('p');
    rule.textContent = 'A stop time closes at once either way. Boards dealt without flags still let you remove a flag. '
      + 'Changing to closed at once works any time. Going back to no flags first works only while the day\u2019s play is at most '
      + formatPlayLimitDuration(PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS) + ' and no limit is reached.';
    parts.push(rule);
    const lock = playLimitPenalty === 'closed'
      ? playLimitPenaltyLoosenLock(playLimits, playDayUseNow(), Date.now()) : null;
    if (lock !== null && error === null) {
      const locked = document.createElement('p');
      locked.className = 'play-limit-warning';
      locked.textContent = 'Today it stays closed at once: ' + playLimitLockText(lock) + '.';
      parts.push(locked);
    }
    buttons.append(playLimitDialogButton('Cancel', () => playLimitDialog.close()),
      playLimitDialogButton('Continue', () => proposePlayLimitPenalty(
        playLimitDialog.querySelector('input[name="play-limit-penalty"]:checked').value), 'primary'));
  } else {
    title.textContent = 'Confirm again';
    const change = document.createElement('p');
    change.className = 'play-limit-change';
    change.textContent = 'When a limit is reached: ' + playLimitPenaltySpec(value).label;
    parts.push(change);
    buttons.classList.add('confirm-step');
    buttons.append(
      playLimitDialogButton('Change', applyPlayLimitPenalty, 'primary'),
      playLimitDialogButton('Back', () => {
        playLimitPenaltyEdit = { step: 'edit', value, error: null };
        renderPlayLimitPenaltyDialog();
      }));
  }
  if (error !== null) {
    const problem = document.createElement('p');
    problem.className = 'play-limit-warning';
    problem.setAttribute('role', 'alert');
    problem.textContent = error;
    parts.push(problem);
  }
  parts.push(buttons);
  playLimitDialog.replaceChildren(...parts);
}

//-------ARCHIVE FOLDER (see archive.js)-------

const archiveChooseButton = document.getElementById('archive-choose');
const archiveNowButton = document.getElementById('archive-now');

let storagePersisted = null;  // the browser's answer, once known
navigator.storage.persisted().then((persisted) => {
  storagePersisted = persisted;
  if (archiveState.render !== null) renderArchiveSettings();
});

function renderArchiveSettings() {
  document.getElementById('archive-status-text').textContent = archiveStatusText();
  const chosen = archiveState.folder !== null;
  document.getElementById('storage-persistence-text').textContent = storagePersisted === null ? ''
    : storagePersisted ? 'The browser keeps this site\u2019s saved data until you delete it.'
      : 'The browser may delete this site\u2019s saved data when disk space runs low; '
        + (chosen ? 'the archive folder keeps a copy.' : 'choose an archive folder to keep a copy.');
  archiveChooseButton.textContent = chosen ? 'Change folder' : 'Choose folder';
  archiveChooseButton.hidden = !archiveCanChooseFolder();
  archiveNowButton.hidden = !chosen || archiveState.status === 'loading';
}

archiveChooseButton.addEventListener('click', chooseArchiveFolder);
archiveNowButton.addEventListener('click', () => {
  if (archiveState.status === 'needs-permission') resumeArchive();
  else runArchiveSync();
});

// Esc returns to the game, like the ×/Esc on the old drawer did.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !playLimitDialog.open) location.href = 'index.html';
});

// A switch row is one wide click target: name on the left, the rare
// visible hint in its own middle column, and the control at the right.
function buildSettingRow(s) {
  const row = document.createElement('label');
  row.className = 'setting-row setting-toggle-row';
  row.dataset.setting = s.field;

  const name = document.createElement('span');
  name.className = 'setting-name';
  name.textContent = s.label;
  name.title = s.describe;
  row.appendChild(name);

  if (s.hint !== undefined) {
    const describe = document.createElement('span');
    describe.className = 'setting-describe';
    describe.textContent = s.hint;
    row.appendChild(describe);
  }

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = settings[s.field];
  box.addEventListener('change', () => {
    settings[s.field] = box.checked;
    saveSettings();
  });
  row.appendChild(box);
  return row;
}

function previewCell(className, svg) {
  const cell = document.createElement('span');
  cell.className = className;
  cell.innerHTML = svg;
  return cell;
}

// Choices that are pictures show each value as board squares beside its name.
const CHOICE_PREVIEWS = {
  mineStyle: (styleId) => [
    previewCell('cell revealed', mineSvg(styleId)),
    previewCell('cell revealed mine-hit', mineSvg(styleId)),
    previewCell('cell revealed', wrongFlagSvg(styleId)),
  ],
};

// Choice settings use the same two-column row, with the complete radio
// group occupying the control column.
function buildChoiceRow(s) {
  const row = document.createElement('div');
  row.className = 'setting-row setting-choice-row';
  row.dataset.setting = s.field;
  const name = document.createElement('span');
  name.className = 'setting-name';
  name.textContent = s.label;
  name.title = s.describe;
  row.appendChild(name);
  const group = document.createElement('div');
  group.className = 'setting-choices';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', s.label);
  for (const [value, label, description] of s.choices) {
    const item = document.createElement('label');
    item.className = 'setting-choice';
    item.title = description;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'setting-choice-' + s.field;
    radio.checked = settings[s.field] === value;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings[s.field] = value;
      saveSettings();
    });
    item.append(radio);
    if (Object.hasOwn(CHOICE_PREVIEWS, s.field)) {
      const preview = document.createElement('span');
      preview.className = 'setting-choice-preview';
      preview.append(...CHOICE_PREVIEWS[s.field](value));
      item.append(preview);
    }
    item.append(document.createTextNode(label));
    group.appendChild(item);
  }
  row.appendChild(group);
  return row;
}

// The same groups as the game's Overlays & display panel, each a compact
// option grid under its own subheading.
function buildResultSections() {
  const groups = document.createDocumentFragment();
  for (const [groupLabel, paths] of RESULT_SECTION_GROUPS) {
    const subgroup = document.createElement('section');
    subgroup.className = 'settings-subgroup';
    const heading = document.createElement('h3');
    heading.className = 'settings-subheading';
    heading.textContent = groupLabel;
    const options = document.createElement('div');
    options.className = 'setting-options-grid';
    for (const entry of paths.map(resultSectionSwitch)) {
      const row = document.createElement('label');
      row.className = 'setting-option';
      row.dataset.setting = entry.path;
      const name = document.createElement('span');
      name.className = 'setting-name';
      name.textContent = entry.label;
      name.title = entry.describe;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = resultSectionShown(entry);
      box.addEventListener('change', () => {
        setResultSectionShown(entry, box.checked);
        saveSettings();
      });
      row.append(name, box);
      options.appendChild(row);
    }
    subgroup.append(heading, options);
    groups.appendChild(subgroup);
  }
  return groups;
}

// Each schema group becomes one panel with a stable heading column and a
// control body. Control-'none' entries remain editable where they live;
// control-'result-section' entries render inside the result sections.
function buildSettingsColumn() {
  const column = document.getElementById('settings-column');
  const transfer = document.getElementById('preferences-transfer');
  for (const built of column.querySelectorAll('[data-schema-group]')) built.remove();
  for (const [groupId, groupLabel] of SETTINGS_GROUPS) {
    const section = document.createElement('section');
    section.className = 'settings-group';
    section.dataset.schemaGroup = groupId;

    const heading = document.createElement('h2');
    heading.className = 'settings-group-heading';
    heading.textContent = groupLabel;
    section.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'settings-group-body';
    for (const s of SETTINGS_SCHEMA) {
      if (s.group !== groupId || s.control === 'none' || s.control === 'result-section') continue;
      if (s.control === 'result-sections') {
        body.appendChild(buildResultSections());
        continue;
      }
      if (s.control === 'choice') {
        body.appendChild(buildChoiceRow(s));
        continue;
      }
      body.appendChild(buildSettingRow(s));
    }
    section.appendChild(body);
    column.insertBefore(section, transfer);
  }
}

function initPreferencesTransfer() {
  const input = document.getElementById('preferences-import-text');
  const download = document.getElementById('preferences-download');
  input.value = settings.drafts.preferencesImport;
  input.addEventListener('input', () => updateSettings({ drafts: { ...settings.drafts, preferencesImport: input.value } }));
  document.getElementById('preferences-export').addEventListener('click', () => {
    if (download.href) URL.revokeObjectURL(download.href);
    download.href = URL.createObjectURL(new Blob([exportPreferences()], { type: 'application/json' }));
    download.download = 'minesweeper-friendly-preferences-' + new Date().toISOString().slice(0, 10) + '.json';
    download.hidden = false;
    download.click();
  });
  const apply = (text) => {
    try {
      importPreferences(text);
    } catch (error) {
      settingsStatus.hidden = false;
      settingsStatus.textContent = 'Preferences import failed: ' + error.message;
      return;
    }
    updateSettings({ drafts: { ...settings.drafts, preferencesImport: '' } });
    input.value = '';
    buildSettingsColumn();
    settingsStatus.hidden = false;
    settingsStatus.textContent = 'Preferences imported.';
  };
  document.getElementById('preferences-import-form').addEventListener('submit', (event) => {
    event.preventDefault();
    apply(input.value);
  });
  document.getElementById('preferences-import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) apply(await file.text());
    event.target.value = '';
  });
}
