'use strict';

//-------THE SETTINGS PAGE (settings.html)-------

// The full settings page, created 2026-08-23 when the in-page drawer was
// retired. It shares the game's schema (settings-core.js) and database
// (storage.js). Every change saves immediately and shows itself on the
// demo world to the left: a pretend mid-game (board, left-panel cards,
// after-game sections) built from hand-picked consistent data — real
// enough to demonstrate every switch without playing. The game page reads
// settings fresh on every load, so returning to the game applies them.

const settingsStatus = document.getElementById('settings-status');

function storageFailure(what) {
  settingsStatus.hidden = false;
  settingsStatus.textContent = what;
  throw new Error(what);
}

function userdataReady() {
  readAllUserdata((got) => {
    settings = settingsFrom(got.settings === undefined ? {} : got.settings);
    buildDemoWorld();
    buildSettingsColumn();
    refreshDemo();
  });
}

// Esc returns to the game, like the ×/Esc on the old drawer did.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') location.href = 'index.html';
});

//-------DEMO WORLD-------

// A consistent partially played board: mines are fixed coordinates,
// adjacency is computed, and the opening is a real flood reveal from the
// top-left — so what the demo shows could genuinely occur in play.
const DEMO_WIDTH = 9;
const DEMO_HEIGHT = 7;
const DEMO_MINES = [[6, 0], [5, 2], [8, 3], [6, 4], [1, 5], [3, 6]];
const DEMO_FLAG = [5, 2];

let demoCells = [];

function buildDemoBoard() {
  const board = document.getElementById('demo-board');
  board.style.setProperty('--board-width', DEMO_WIDTH);
  const mineSet = new Set(DEMO_MINES.map(([x, y]) => y * DEMO_WIDTH + x));
  demoCells = [];
  for (let i = 0; i < DEMO_WIDTH * DEMO_HEIGHT; i++) {
    const el = document.createElement('div');
    el.className = 'cell hidden';
    board.appendChild(el);
    demoCells.push({ el, mine: mineSet.has(i), adjacent: 0, revealed: false, flagged: false });
  }
  const neighbors = (i) => {
    const x = i % DEMO_WIDTH;
    const y = (i - x) / DEMO_WIDTH;
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= DEMO_WIDTH || ny < 0 || ny >= DEMO_HEIGHT) continue;
        out.push(ny * DEMO_WIDTH + nx);
      }
    }
    return out;
  };
  for (let i = 0; i < demoCells.length; i++) {
    demoCells[i].adjacent = neighbors(i).filter((n) => demoCells[n].mine).length;
  }
  // The opening: flood from the top-left corner exactly like a real click.
  const queue = [0];
  demoCells[0].revealed = true;
  while (queue.length > 0) {
    const i = queue.pop();
    if (demoCells[i].adjacent > 0) continue;
    for (const n of neighbors(i)) {
      if (demoCells[n].revealed || demoCells[n].mine) continue;
      demoCells[n].revealed = true;
      queue.push(n);
    }
  }
  demoCells[DEMO_FLAG[1] * DEMO_WIDTH + DEMO_FLAG[0]].flagged = true;
}

function paintDemoBoard() {
  for (const c of demoCells) {
    if (c.revealed) {
      c.el.className = 'cell revealed' + (c.adjacent > 0 ? ' n' + c.adjacent : '');
      paintCellGlyph(c.el, c.adjacent);
    } else {
      c.el.className = 'cell hidden';
      c.el.innerHTML = c.flagged ? FLAG_SVG : '';
    }
  }
}

// Stand-ins for the real sections, tagged with the setting key that
// controls them so refreshDemo and the row hover glow can find them.

function demoCard(key, titleText) {
  const card = document.createElement('div');
  card.className = 'demo-card';
  card.dataset.settingRegion = key;
  if (titleText) {
    const title = document.createElement('div');
    title.className = 'demo-card-title';
    title.textContent = titleText;
    card.appendChild(title);
  }
  return card;
}

function demoMiniTable(caption, highlightSecond) {
  const wrap = document.createElement('div');
  wrap.className = 'demo-mini-table';
  const cap = document.createElement('div');
  cap.className = 'demo-mini-caption';
  cap.textContent = caption;
  wrap.appendChild(cap);
  const rows = [['1', '38.90s', 'tue'], ['2', '42.31s', 'now'], ['3', '44.02s', 'sat']];
  const table = document.createElement('table');
  for (const [rank, time, when] of rows) {
    const tr = document.createElement('tr');
    if (highlightSecond && rank === '2') tr.className = 'demo-now';
    for (const text of [rank, time, when]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  return wrap;
}

function demoSparkline() {
  const span = document.createElement('span');
  span.className = 'demo-spark';
  span.innerHTML = '<svg viewBox="0 0 60 14" preserveAspectRatio="none">'
    + '<polyline points="0,10 10,7 20,9 30,4 40,6 50,3 60,5" fill="none" stroke="#4a90d9" stroke-width="1.5"/></svg>';
  return span;
}

function demoStatRow(label, value, spark) {
  const row = document.createElement('div');
  row.className = 'demo-stat-row';
  const name = document.createElement('span');
  name.textContent = label;
  const val = document.createElement('span');
  val.className = 'demo-stat-value';
  val.textContent = value;
  row.append(name, val);
  if (spark) row.appendChild(demoSparkline());
  return row;
}

function demoScatter() {
  const div = document.createElement('div');
  div.className = 'demo-scatter';
  const dots = [[6, 30], [14, 24], [20, 27], [27, 18], [33, 22], [40, 12], [46, 17], [53, 8]]
    .map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="1.8" fill="#4a90d9"/>').join('');
  div.innerHTML = '<svg viewBox="0 0 60 36" preserveAspectRatio="none">'
    + '<line x1="2" y1="34" x2="58" y2="34" stroke="#c5d0da"/>'
    + '<line x1="2" y1="2" x2="2" y2="34" stroke="#c5d0da"/>' + dots + '</svg>';
  return div;
}

// The time-window tablecharts card is rebuilt on every refresh because
// the collapse switch changes its shape: in this demo world every win
// this week happened today, so collapse merges the duplicate "this week"
// into the "today" chart. The merged-away chart stays as a ghost in its
// slot (like every off thing in the demo), so both states are the same
// height and toggling never moves the cards below.
function rebuildDemoTimeTables() {
  const card = document.querySelector('#demo-after [data-setting-region="timeTables"]');
  for (const child of [...card.children]) {
    if (!child.classList.contains('demo-card-title')) card.removeChild(child);
  }
  if (settings.collapseDuplicateCharts) {
    card.appendChild(demoMiniTable('today \u00b7 = this week (merged)', true));
    const absorbed = demoMiniTable('this week', true);
    absorbed.classList.add('demo-off');
    card.appendChild(absorbed);
  } else {
    card.appendChild(demoMiniTable('today', true));
    card.appendChild(demoMiniTable('this week', true));
  }
  card.appendChild(demoMiniTable('lifetime', true));
}

function buildDemoWorld() {
  buildDemoBoard();

  const left = document.getElementById('demo-left');
  const session = demoCard('showSessionStats', 'session stats');
  session.appendChild(demoStatRow('mouse speed', '312 px/s', true));
  session.appendChild(demoStatRow('clicks/min', '58', true));
  const motionLive = demoCard('showMotionStatsDuringGame', 'motion (live)');
  motionLive.appendChild(demoStatRow('path/click', '96 px', true));
  motionLive.appendChild(demoStatRow('fastclick gap', '141 ms', true));
  left.append(session, motionLive);

  const after = document.getElementById('demo-after');

  const verdict = demoCard('endVerdict', 'verdict');
  verdict.appendChild(demoStatRow('clean win', '1 justice event', false));

  const stats = demoCard('gameStats', 'game stats');
  const grid = document.createElement('div');
  grid.className = 'demo-stat-grid';
  for (const [label, value] of [['time', '42.31s'], ['3BV', '38'], ['3BV/s', '0.90'],
    ['clicks', '47'], ['efficiency', '81%'], ['misclicks', '1']]) {
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'demo-stat-value';
    v.textContent = value;
    grid.append(l, v);
  }
  stats.appendChild(grid);

  const placements = demoCard('recentPlacements', null);
  placements.appendChild(demoStatRow('placements today', '2 top-tenth ranks', false));

  const timeTables = demoCard('timeTables', 'time-window tablecharts');

  const lastMinute = demoCard('lastOneMinute', 'last 1 minute');
  lastMinute.appendChild(demoMiniTable('last 60s', true));

  const exact = demoCard('exact3BV', 'same-3BV tablechart');
  exact.appendChild(demoMiniTable('3BV 38', true));

  const shapes = demoCard('boardShapeTables', 'board-shape tablecharts');
  shapes.appendChild(demoMiniTable('max number 4', true));

  const island = demoCard('largestIsland', 'largest island');
  island.appendChild(demoMiniTable('island of 5', true));

  const averages = demoCard('averageCharts', 'average-time charts');
  const avg = document.createElement('div');
  avg.className = 'demo-scatter';
  avg.innerHTML = '<svg viewBox="0 0 60 36" preserveAspectRatio="none">'
    + '<line x1="2" y1="34" x2="58" y2="34" stroke="#c5d0da"/>'
    + '<polyline points="4,28 14,25 24,20 34,18 44,12 54,10" fill="none" stroke="#4a90d9" stroke-width="1.5"/></svg>';
  averages.appendChild(avg);

  const streak = demoCard('streak', null);
  streak.appendChild(demoStatRow('streak', '4 \u2014 best 9', false));
  const nearStreak = demoCard('nearStreak', null);
  nearStreak.appendChild(demoStatRow('near-streak', '7', false));
  const nearNear = demoCard('nearNearStreak', null);
  nearNear.appendChild(demoStatRow('near-near-streak', '11', false));

  const motionAfter = demoCard('showMotionStatsAfterGame', 'motion stats');
  motionAfter.appendChild(demoStatRow('mouse speed', '298 px/s', true));
  motionAfter.appendChild(demoStatRow('path/3BV', '119 px', true));

  const relationship = demoCard('relationshipCharts', 'relationship charts');
  relationship.appendChild(demoScatter());

  after.append(verdict, stats, placements, timeTables, lastMinute, exact, shapes, island,
    averages, streak, nearStreak, nearNear, motionAfter, relationship);
}

function settingValueOfKey(key) {
  if (key in SHOWN_THINGS_DEFAULTS) return settings.shownThings[key];
  return settings[key];
}

// One pass makes the demo match the settings: repaint the board, rebuild
// the collapse-sensitive card, then ghost every off boolean-keyed piece
// (the JUSTICE mark beside the board demos the just-universe switch the
// way the real mark prints beside the real board). An off thing stays in
// its slot as a faded ghost rather than leaving the layout — toggling a
// switch never moves anything else in the demo.
function refreshDemo() {
  paintDemoBoard();
  rebuildDemoTimeTables();
  document.getElementById('demo-justice').classList.toggle('demo-off', !settings.justUniverse);
  for (const el of document.querySelectorAll('#settings-demo [data-setting-region]')) {
    const value = settingValueOfKey(el.dataset.settingRegion);
    if (typeof value === 'boolean') el.classList.toggle('demo-off', !value);
  }
}

//-------SETTINGS COLUMN (rows from the schema, like the old drawer)-------

// Keys whose glow needs a custom selector on this page; everything else
// glows its own data-setting-region element in the demo.
const PAGE_HIGHLIGHT_SELECTORS = {
  justUniverse: '#demo-justice, #demo-frame',
  numberDisplay: '#demo-board',
  trialGiveOpening: '#demo-frame',
  collapseDuplicateCharts: '[data-setting-region="timeTables"]',
};

function settingRegionElements(key) {
  const selector = PAGE_HIGHLIGHT_SELECTORS[key]
    || '[data-setting-region="' + key + '"]';
  return [...document.querySelectorAll(selector)]
    .filter((el) => el.getClientRects().length > 0);
}

function clearRegionGlow() {
  for (const el of document.querySelectorAll('.setting-region-glow')) {
    el.classList.remove('setting-region-glow');
  }
}

function applyRowGlow(regionKey) {
  clearRegionGlow();
  for (const el of settingRegionElements(regionKey)) {
    el.classList.add('setting-region-glow');
  }
}

// One row per switch: the clickable label is exactly the checkbox + name
// line, and the full description rides on the name as a tooltip. Only a
// schema entry with a `hint` (something the name itself cannot say) gets
// a second line; the rest is a single line — the demo, not a caption,
// explains a switch. Hovering the row glows the demo piece it controls;
// a change saves immediately and the demo shows it. `subfield` marks a
// shown-things child.
function buildSettingRow(s, subfield, labelText, titleText) {
  const row = document.createElement('div');
  row.className = 'setting-row' + (subfield !== null ? ' setting-child' : '');
  const main = document.createElement('label');
  main.className = 'setting-main';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = subfield !== null ? settings[s.field][subfield] : settings[s.field];
  const regionKey = subfield !== null ? subfield : s.field;
  box.addEventListener('change', () => {
    if (subfield !== null) settings[s.field][subfield] = box.checked;
    else settings[s.field] = box.checked;
    saveSettings();
    refreshDemo();
    // Re-aim the glow at the piece that just appeared or left — but only
    // under a real pointer.
    if (row.matches(':hover')) applyRowGlow(regionKey);
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
  row.addEventListener('mouseenter', () => applyRowGlow(regionKey));
  row.addEventListener('mouseleave', clearRegionGlow);
  return row;
}

// A choice row: the name line, then one radio per option (the option's
// own explanation rides on it as a tooltip) — no caption; the demo
// repaints as options are picked.
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
      refreshDemo();
    });
    item.append(radio, document.createTextNode(label));
    group.appendChild(item);
  }
  row.appendChild(group);
  row.addEventListener('mouseenter', () => applyRowGlow(s.field));
  row.addEventListener('mouseleave', clearRegionGlow);
  return row;
}

// One section per SETTINGS_GROUPS entry, rows in schema order within
// their group; the shown-things switches render inline under their own
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
      if (s.control === 'choice') {
        column.appendChild(buildChoiceRow(s));
        continue;
      }
      column.appendChild(buildSettingRow(s, null, s.label, s.describe));
    }
  }
  // The way back sits where reading the switches ends; the titlebar
  // carries the one at the top.
  const back = document.createElement('a');
  back.id = 'settings-column-return';
  back.className = 'return-to-game';
  back.href = 'index.html';
  back.textContent = 'return to game';
  column.appendChild(back);
}
