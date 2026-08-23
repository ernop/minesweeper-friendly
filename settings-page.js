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

// One row per switch: the clickable label is exactly the checkbox + name
// line, and the full description rides on the name as a tooltip. Only a
// schema entry with a `hint` (something the name itself cannot say) gets
// a second line. A change saves immediately. `subfield` marks a
// shown-things child.
function buildSettingRow(s, subfield, labelText, titleText) {
  const row = document.createElement('div');
  row.className = 'setting-row' + (subfield !== null ? ' setting-child' : '');
  const main = document.createElement('label');
  main.className = 'setting-main';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = subfield !== null ? settings[s.field][subfield] : settings[s.field];
  box.addEventListener('change', () => {
    if (subfield !== null) settings[s.field][subfield] = box.checked;
    else settings[s.field] = box.checked;
    saveSettings();
  });
  const name = document.createElement('span');
  name.className = 'setting-name';
  name.textContent = labelText;
  name.title = titleText;
  main.append(box, name);
  row.appendChild(main);
  if (s.hint !== undefined && subfield === null) {
    const describe = document.createElement('p');
    describe.className = 'setting-describe';
    describe.textContent = s.hint;
    row.appendChild(describe);
  }
  return row;
}

// A choice row: the name line, then one radio per option (the option's
// own explanation rides on it as a tooltip).
function buildChoiceRow(s) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  const name = document.createElement('span');
  name.className = 'setting-name';
  name.textContent = s.label;
  name.title = s.describe;
  row.appendChild(name);
  const group = document.createElement('div');
  group.className = 'setting-choices';
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

// One section per SETTINGS_GROUPS entry, rows in schema order within
// their group; object-valued switch groups render inline under their own
// subheading. Control-'none' entries never render (their values are set
// where the thing itself lives, on the game page).
function buildSettingsColumn() {
  const column = document.getElementById('settings-column');
  for (const [groupId, groupLabel] of SETTINGS_GROUPS) {
    const heading = document.createElement('div');
    heading.className = 'settings-group-heading';
    heading.textContent = groupLabel;
    column.appendChild(heading);
    for (const s of SETTINGS_SCHEMA) {
      if (s.group !== groupId || s.control === 'none') continue;
      if (s.control === 'shown-things') {
        const sub = document.createElement('div');
        sub.className = 'settings-subheading';
        sub.textContent = s.label;
        sub.title = s.describe;
        column.appendChild(sub);
        for (const [key, label, description] of SHOWN_THINGS_OPTIONS) {
          column.appendChild(buildSettingRow(s, key, label, description));
        }
        continue;
      }
      if (s.control === 'report-categories') {
        const sub = document.createElement('div');
        sub.className = 'settings-subheading';
        sub.textContent = s.label;
        sub.title = s.describe;
        column.appendChild(sub);
        for (const [key, label, description] of REPORT_CATEGORY_OPTIONS) {
          column.appendChild(buildSettingRow(s, key, label, description));
        }
        continue;
      }
      if (s.control === 'choice') {
        column.appendChild(buildChoiceRow(s));
        continue;
      }
      column.appendChild(buildSettingRow(s, null, s.label, s.describe));
    }
  }
}
