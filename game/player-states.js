'use strict';

// Player states: the player's session tags, toggled in the sidebar and
// stamped onto every finished game.

//-------PLAYER STATES (session tags stamped onto finished games)-------

// The player keeps a personal list of state tags ("sleepy", "new mouse", ...)
// and toggles which ones currently apply; every finished game records the
// active set (see reportResult), so life circumstances can be correlated
// with results later. Editing the list only shapes future games — past
// records keep whatever states they were stamped with.

// The current list lives in settings.playerStates; completed games keep
// their own record of which tags applied when they were played.
function savePlayerStates() {
  saveSettings();
}

function activeStateNames() {
  return settings.playerStates.filter((s) => s.active).map((s) => s.name);
}

const statesChips = document.getElementById('states-chips');
const statesAddBtn = document.getElementById('states-add-btn');
const statesMenu = document.getElementById('states-menu');
const statesOptions = document.getElementById('states-options');
const statesAddForm = document.getElementById('states-add-form');
const statesAddInput = document.getElementById('states-add-input');
const statesStatus = document.getElementById('states-status');

// Only ACTIVE states are visible: each is a chip, and clicking it takes the
// state off. Everything inactive lives out of sight behind the "+ state"
// button, whose menu lists the inactive options (click one to put it on,
// its x to delete it from the list) plus the new-state field. An untagged
// session shows nothing but the one small button.
function renderStates() {
  statesChips.textContent = '';
  for (const state of settings.playerStates) {
    if (!state.active) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'state-chip';
    chip.title = 'click to take this state off (future games only)';
    chip.textContent = state.name + ' \u00d7';
    chip.addEventListener('click', () => {
      state.active = false;
      savePlayerStates();
      renderStates();
    });
    statesChips.appendChild(chip);
  }
  statesOptions.textContent = '';
  for (const state of settings.playerStates) {
    if (state.active) continue;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'state-option';
    option.textContent = state.name;
    option.addEventListener('click', () => {
      state.active = true;
      setStatesMenuOpen(false);
      savePlayerStates();
      renderStates();
    });
    const remove = document.createElement('span');
    remove.className = 'state-remove';
    remove.textContent = '\u00d7';
    remove.title = 'delete from the list (past games keep their recorded states)';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      settings.playerStates = settings.playerStates.filter((s) => s !== state);
      savePlayerStates();
      renderStates();
    });
    option.appendChild(remove);
    statesOptions.appendChild(option);
  }
}

// Every open/close goes through here so the button always shows its
// pressed ("open") state while the menu is up (the settings panel's
// helper is the same shape). Esc and outside-click closing live with the
// settings panel's handlers.
function setStatesMenuOpen(open) {
  rememberPanel('states', open);
  statesMenu.hidden = !open;
  statesAddBtn.classList.toggle('open', open);
}

statesAddBtn.addEventListener('click', () => {
  setStatesMenuOpen(statesMenu.hidden);
  statesStatus.textContent = '';
});

document.getElementById('states-close').addEventListener('click', () => setStatesMenuOpen(false));

// A state created here goes on immediately (typing it mid-session means
// "I am in this state now"); one chip-click takes it off.
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
  settings.playerStates.push({ name, active: true });
  savePlayerStates();
  statesAddInput.value = '';
  rememberPreference('drafts', { ...settings.drafts, stateName: '' });
  setStatesMenuOpen(false);
  renderStates();
});
