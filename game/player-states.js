'use strict';

// Player states: the player's session tags, toggled in the sidebar menu and
// stamped onto every finished game.

//-------PLAYER STATES (session tags stamped onto finished games)-------

// The player keeps a personal list of state tags ("sleepy", "new mouse", ...)
// and toggles which ones currently apply; every finished game records the
// active set (see reportResult), so life circumstances can be correlated
// with results later. Editing the list only shapes future games — past
// records keep whatever states they were stamped with.

// The current list lives in settings.playerStates; completed games keep
// their own record of which tags applied when they were played. Every save
// replaces settings with a clone, so handlers find a state by its name (names
// are unique) in the list current at the click, never through an object
// captured when the menu was drawn.
function savePlayerStates(states) {
  updateSettings({ playerStates: states });
}

function activeStateNames() {
  return settings.playerStates.filter((s) => s.active).map((s) => s.name);
}

const playContext = document.getElementById('play-context');
const statesEditBtn = document.getElementById('states-edit-btn');
const statesMenu = document.getElementById('states-menu');
const statesOptions = document.getElementById('states-options');
const statesAddForm = document.getElementById('states-add-form');
const statesAddInput = document.getElementById('states-add-input');
const statesStatus = document.getElementById('states-status');
const stateSampleFocus = document.getElementById('state-sample-focus');
const stateSamplePace = document.getElementById('state-sample-pace');
const stateSampleClear = document.getElementById('state-sample-clear');

const STATE_FOCUS_TITLES = {
  1: '1 foggy',
  2: '2 sluggish',
  3: '3 steady',
  4: '4 sharp',
  5: '5 locked in',
};

function freshStateCheckIn(nowMs = Date.now()) {
  const sample = settings.stateCheckIn;
  if (sample === null) return null;
  if (nowMs - sample.sampledAt > Coach.STATE_SAMPLE_MAX_AGE_MS) return null;
  return sample;
}

function activeStateSample(endedAt = Date.now()) {
  const sample = freshStateCheckIn(endedAt);
  return sample === null ? undefined : { sampledAt: sample.sampledAt, focus: sample.focus, pace: sample.pace };
}

function formatStateCheckIn(sample) {
  const parts = [];
  if (sample.focus !== null) parts.push('focus ' + sample.focus + '/5');
  if (sample.pace !== null) parts.push(sample.pace);
  return parts.join(' \u00b7 ');
}

function setStateCheckInPart(patch) {
  const current = freshStateCheckIn(Date.now());
  const nextFocus = Object.hasOwn(patch, 'focus') ? patch.focus : (current === null ? null : current.focus);
  const nextPace = Object.hasOwn(patch, 'pace') ? patch.pace : (current === null ? null : current.pace);
  const next = nextFocus === null && nextPace === null
    ? null
    : { sampledAt: Date.now(), focus: nextFocus, pace: nextPace };
  updateSettings({ stateCheckIn: next });
  renderStateSampleControls();
  renderPlayContext();
  renderCoachStatePrompt();
}

function renderStateSampleControls() {
  const sample = freshStateCheckIn(Date.now());
  stateSampleFocus.replaceChildren(...Coach.STATE_FOCUS_LEVELS.map((level) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-button state-sample-btn';
    btn.textContent = String(level);
    btn.title = STATE_FOCUS_TITLES[level];
    const pressed = sample !== null && sample.focus === level;
    btn.setAttribute('aria-pressed', String(pressed));
    btn.addEventListener('click', () => setStateCheckInPart({ focus: pressed ? null : level }));
    return btn;
  }));
  stateSamplePace.replaceChildren(...Coach.STATE_PACE_CHOICES.map((pace) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-button state-sample-btn';
    btn.textContent = pace;
    const pressed = sample !== null && sample.pace === pace;
    btn.setAttribute('aria-pressed', String(pressed));
    btn.addEventListener('click', () => setStateCheckInPart({ pace: pressed ? null : pace }));
    return btn;
  }));
  stateSampleClear.hidden = sample === null;
}

stateSampleClear.addEventListener('click', () => {
  updateSettings({ stateCheckIn: null });
  renderStateSampleControls();
  renderPlayContext();
  renderCoachStatePrompt();
});

// The states on are facts about this session, so they show as tags in the
// play context line after the measured music state, never as buttons.
// All changes happen in the one menu behind "edit states": a checkbox per
// state puts it on or takes it off, its x deletes it from the list, and the
// field at the bottom creates a new one.
function renderStates() {
  renderPlayContext();
  renderStateSampleControls();
  renderStatesMenu();
  renderCoachStatePrompt();
}

function renderPlayContext() {
  const items = settings.playerStates.filter((state) => state.active).map((state) => {
    const item = document.createElement('span');
    item.className = 'context-item';
    item.title = 'Your state, stamped onto each game you finish';
    item.textContent = state.name;
    return item;
  });
  const sample = freshStateCheckIn(Date.now());
  if (sample !== null) {
    const item = document.createElement('span');
    item.className = 'context-item';
    item.title = 'Your quick state sample, stamped onto games finished within 45 minutes';
    item.textContent = formatStateCheckIn(sample);
    items.push(item);
  }
  playContext.replaceChildren(musicStateItem, ...items);
}

// A checkbox change redraws only the context line, so keyboard focus stays
// on the checkbox.
function renderStatesMenu() {
  statesOptions.replaceChildren(...settings.playerStates.map(({ name, active }) => {
    const option = document.createElement('div');
    option.className = 'state-option';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = active;
    checkbox.addEventListener('change', () => {
      savePlayerStates(settings.playerStates.map((s) => (s.name === name ? { name, active: checkbox.checked } : s)));
      renderPlayContext();
    });
    label.append(checkbox, name);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'state-remove';
    remove.textContent = '\u00d7';
    remove.title = 'delete from the list (past games keep their recorded states)';
    remove.setAttribute('aria-label', 'delete ' + name);
    remove.addEventListener('click', () => {
      savePlayerStates(settings.playerStates.filter((s) => s.name !== name));
      renderStates();
    });
    option.append(label, remove);
    return option;
  }));
}

// Every open/close goes through here so the button always shows its
// pressed state while the menu is up.
function setStatesMenuOpen(open) {
  rememberPanel('states', open);
  statesMenu.hidden = !open;
  statesEditBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    statesMenu.style.left = '';
    statesMenu.style.right = '';
    if (statesMenu.getBoundingClientRect().left < 8) {
      statesMenu.style.left = '0';
      statesMenu.style.right = 'auto';
    }
  }
}

statesEditBtn.addEventListener('click', () => {
  setStatesMenuOpen(statesMenu.hidden);
  statesStatus.textContent = '';
});

document.getElementById('states-close').addEventListener('click', () => setStatesMenuOpen(false));

// A state created here goes on immediately: typing it mid-session means
// "I am in this state now".
statesAddForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = statesAddInput.value.trim();
  if (name === '') {
    statesStatus.textContent = 'state name is empty';
    return;
  }
  if (settings.playerStates.some((s) => s.name === name)) {
    statesStatus.textContent = '"' + name + '" already exists';
    return;
  }
  savePlayerStates([...settings.playerStates, { name, active: true }]);
  statesAddInput.value = '';
  rememberPreference('drafts', { ...settings.drafts, stateName: '' });
  setStatesMenuOpen(false);
  renderStates();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!statesMenu.hidden) setStatesMenuOpen(false);
});

// A click outside the open states menu closes it; the menu's own button
// is excluded because its handler already toggles. The dispatch path, not
// the target's current parent, decides: a delete has already removed its
// row from the menu by the time the click reaches the document.
document.addEventListener('click', (event) => {
  const path = event.composedPath();
  if (!statesMenu.hidden && !path.includes(statesMenu)
      && !path.includes(statesEditBtn) && !path.includes(coachCheckInBtn)) {
    setStatesMenuOpen(false);
  }
});
