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
    settings = settingsFrom(got.settings === undefined ? {} : got.settings);
    buildSettingsColumn();
  });
}

// Esc returns to the game, like the ×/Esc on the old drawer did.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') location.href = 'index.html';
});

// A switch row is one wide click target: name on the left, the rare
// visible hint in its own middle column, and the control at the right.
// `subfield` marks one of the compact shown-things switches.
function buildSettingRow(s, subfield, labelText, titleText) {
  const row = document.createElement('label');
  row.className = subfield === null
    ? 'setting-row setting-toggle-row'
    : 'setting-option';
  row.dataset.setting = subfield === null ? s.field : `${s.field}.${subfield}`;

  const name = document.createElement('span');
  name.className = 'setting-name';
  name.textContent = labelText;
  name.title = titleText;
  row.appendChild(name);

  if (s.hint !== undefined && subfield === null) {
    const describe = document.createElement('span');
    describe.className = 'setting-describe';
    describe.textContent = s.hint;
    row.appendChild(describe);
  }

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = subfield !== null ? settings[s.field][subfield] : settings[s.field];
  box.addEventListener('change', () => {
    if (subfield !== null) settings[s.field][subfield] = box.checked;
    else settings[s.field] = box.checked;
    saveSettings();
  });
  row.appendChild(box);
  return row;
}

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
    item.append(radio, document.createTextNode(label));
    group.appendChild(item);
  }
  row.appendChild(group);
  return row;
}

function buildShownThings(s) {
  const subgroup = document.createElement('section');
  subgroup.className = 'settings-subgroup';

  const heading = document.createElement('h3');
  heading.className = 'settings-subheading';
  heading.textContent = s.label;
  heading.title = s.describe;
  subgroup.appendChild(heading);

  const options = document.createElement('div');
  options.className = 'setting-options-grid';
  for (const [key, label, description] of SHOWN_THINGS_OPTIONS) {
    options.appendChild(buildSettingRow(s, key, label, description));
  }
  subgroup.appendChild(options);
  return subgroup;
}

// Each schema group becomes one panel with a stable heading column and a
// control body. Control-'none' entries remain editable where they live.
function buildSettingsColumn() {
  const column = document.getElementById('settings-column');
  column.replaceChildren();
  for (const [groupId, groupLabel] of SETTINGS_GROUPS) {
    const section = document.createElement('section');
    section.className = 'settings-group';

    const heading = document.createElement('h2');
    heading.className = 'settings-group-heading';
    heading.textContent = groupLabel;
    section.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'settings-group-body';
    for (const s of SETTINGS_SCHEMA) {
      if (s.group !== groupId || s.control === 'none') continue;
      if (s.control === 'shown-things') {
        body.appendChild(buildShownThings(s));
        continue;
      }
      if (s.control === 'choice') {
        body.appendChild(buildChoiceRow(s));
        continue;
      }
      body.appendChild(buildSettingRow(s, null, s.label, s.describe));
    }
    section.appendChild(body);
    column.appendChild(section);
  }
}
