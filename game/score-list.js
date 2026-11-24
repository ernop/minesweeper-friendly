'use strict';

// The full score lists (docs/product/rankings.md, "Full lists and old
// games"): a rank table's every win in a window over the page, its columns
// chosen and its rows sorted, and the old games its rows open.

//-------FULL SCORE LISTS: COLUMNS-------

// Old games open where a result is a game's own: not in trials, whose
// boards belong to their trial, nor in Board lab, whose boards are built.
function oldGamesOpen() {
  return !Trial.isPlayMode(settings.playMode) && !boardLabActive();
}

// 2026-10-07 14:22, in local time.
function formatLocalDateTime(ms) {
  const d = new Date(ms);
  const pad2 = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// Splits a measurement or board-trait value's formatted text into its signed
// integer part, optional decimal part (including '.'), and trimmed unit suffix.
function parseScoreNumber(formatted) {
  const match = /^(-?\d+)(\.\d+)?(.*)$/.exec(formatted);
  if (match === null) throw new Error('Score list expected a numeric value, got ' + JSON.stringify(formatted));
  return { intPart: match[1], fracPart: match[2] || '', unit: match[3].trim() };
}

// Time, then the columns a list may show, in settings.scoreListColumns'
// order. Each has its header, its definition (none where the name says it),
// its group among the column choices, its value on a win (not finite when
// the win was not measured), its numeric unit/formatter or multi-cell
// formatter, and whether a first sort puts the lower value first. Ages count
// from `nowMs`.
function scoreListColumns(nowMs) {
  const numericColumn = (base, format) => ({
    ...base,
    unit: parseScoreNumber(format(1.2345)).unit,
    format,
    numeric: true,
    colSpan: 1,
  });
  const measurement = (metric) => numericColumn({
    id: metric.id, name: metric.name, help: metric.help, group: 'performance measurements',
    actionSummary: metric.actionSummary === true,
    value: (fact) => metric.value(fact, config),
    lowerFirst: !metric.higher,
  }, metric.format);
  const trait = (id) => {
    const measure = BOARD_TRAIT_MEASURES[id];
    return numericColumn({
      id, name: BOARD_TRAIT_NAMES[id], help: BOARD_TRAIT_DEFINITIONS[id], group: 'board traits',
      value: measure.value, lowerFirst: !measure.higher,
    }, measure.format);
  };
  return [
    measurement(GameData.metrics.find((metric) => metric.id === 'time')),
    { id: 'date', name: 'date', group: 'when', value: (fact) => fact.endedAt, colSpan: 1,
      cells: (value) => [['', formatLocalDateTime(value)]], lowerFirst: false },
    { id: 'age', name: 'age', group: 'when', value: (fact) => nowMs - fact.endedAt, colSpan: 2,
      cells: (value) => {
        const age = relativeAge(nowMs, nowMs - value);
        return [['age-num-cell age-u-' + age.unit, formatAgeCount(age)],
          ['age-unit-cell age-u-' + age.unit, age.unit]];
      },
      lowerFirst: true },
    ...GameData.metrics.filter((metric) => metric.id !== 'time').map(measurement),
    ...Object.keys(GAME_DATA_BOARD_TRAIT_DEFAULTS).map(trait),
  ];
}

// A list's wins in rank order and its title, from its identity
// (settings.reviewList's form): the rank table's id, the moment its windows
// and day categories were drawn at, and whether its pool is the no-mark
// games. Board families are found among every win's.
function scoreListOf(list) {
  const records = history[modeKey()] || [];
  const wins = (list.noMark ? records.filter(isMarkless) : records).filter((record) => record.outcome === 'win');
  const column = rankColumns(list.referenceMs).find((c) => c.id === list.table);
  const family = column === undefined
    ? [...boardMetricCandidates(wins, wins), ...boardShapeCandidates(wins, wins)].find((c) => c.id === list.table)
    : undefined;
  if (column === undefined && family === undefined) throw new Error('No rank table ' + list.table + ' in this history');
  const tableWins = column === undefined ? family.wins || family.rows : wins.filter(column.filter);
  return {
    label: noMarkRankLabel((column || family).label, list.noMark ? noMarkTimeLabel() : null),
    wins: tableWins.slice().sort(compareRankedWins),
  };
}

//-------FULL SCORE LISTS: THE WINDOW-------

const scoreListDialog = document.getElementById('score-list');
const scoreListTitle = document.getElementById('score-list-title');
const scoreListCount = document.getElementById('score-list-count');
const scoreListStatus = document.getElementById('score-list-status');
const scoreListScroll = document.getElementById('score-list-scroll');
const scoreListColumnsButton = document.getElementById('score-list-columns-button');
const scoreListChoices = document.getElementById('score-list-choices');

// The list in the window: its identity, wins, the columns as of its
// opening, the game on the page, and the rows in their shown order.
let scoreListShown = null;
// Each row's open request; a later one, or the window closing, makes an
// earlier one stale.
let scoreListOpenRequest = 0;

// Opens on the page's game when the list holds it, on its first row
// otherwise.
function openScoreList(list) {
  hideChartHelpTip();
  const { label, wins } = scoreListOf(list);
  const pageGame = renderedResult !== null && !renderedResult.options.historyView ? renderedResult.record : null;
  scoreListShown = { list, wins, columns: scoreListColumns(Date.now()), pageGame, rows: [] };
  scoreListTitle.textContent = label;
  scoreListCount.textContent = wins.length.toLocaleString() + (wins.length === 1 ? ' win' : ' wins');
  scoreListStatus.textContent = '';
  setScoreListChoicesOpen(false);
  renderScoreListTable(null);
  scoreListDialog.showModal();
  focusScoreRow(Math.max(0, scoreListShown.rows.findIndex((row) => row.record === pageGame)), 'center');
}

// The shown columns: time, then each one chosen.
function shownScoreListColumns() {
  return scoreListShown.columns.filter((column) => column.id === 'time' || settings.scoreListColumns[column.id]);
}

// The rows in the remembered order: by the sorted column while it is shown,
// by time otherwise. Equal values keep rank order, and a win without the
// value comes last either way.
function sortScoreListRows(rows, at, ascending) {
  return rows.sort((a, b) => {
    const x = a.values[at], y = b.values[at];
    const xMissing = !Number.isFinite(x), yMissing = !Number.isFinite(y);
    if (xMissing || yMissing) return xMissing - yMissing || a.rank - b.rank;
    return (ascending ? x - y : y - x) || a.rank - b.rank;
  });
}

// `tabStop` is the game whose row the keyboard is on; null puts it on the
// first row.
function renderScoreListTable(tabStop) {
  const columns = shownScoreListColumns();
  const sorted = columns.findIndex((column) => column.id === settings.scoreListSort.column);
  // Preferences imported with their sorted column hidden leave rank order.
  const [sortAt, ascending] = sorted === -1 ? [0, true] : [sorted, settings.scoreListSort.ascending];
  const needsSummary = columns.some((column) => column.actionSummary);
  scoreListShown.rows = sortScoreListRows(scoreListShown.wins.map((record, i) => {
    const fact = needsSummary ? { ...record, actionSummary: gameDataActionSummary(record) } : record;
    return { record, rank: i + 1, values: columns.map((column) => column.value(fact)) };
  }), sortAt, ascending);

  const table = document.createElement('table');
  table.className = 'score-list-table';
  const headRow = document.createElement('tr');
  const rankHead = document.createElement('th');
  rankHead.scope = 'col';
  rankHead.textContent = '#';
  headRow.appendChild(rankHead);
  columns.forEach((column, i) => {
    const head = document.createElement('th');
    head.scope = 'col';
    if (column.colSpan > 1) head.colSpan = column.colSpan;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'score-list-sort';
    button.dataset.column = column.id;
    const arrow = document.createElement('span');
    arrow.className = 'score-list-arrow';
    if (i === sortAt) {
      head.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
      arrow.textContent = ascending ? '\u25b2' : '\u25bc';
    }
    button.append(arrow, column.name);
    if (column.unit) {
      const unit = document.createElement('span');
      unit.className = 'score-list-unit';
      unit.textContent = ' (' + column.unit + ')';
      button.appendChild(unit);
    }
    if (column.help) {
      button.classList.add('has-help');
      attachHelpTip(button, column.help);
    }
    button.addEventListener('click', () => sortScoreListBy(column));
    head.appendChild(button);
    headRow.appendChild(head);
  });
  const head = document.createElement('thead');
  head.appendChild(headRow);

  // Numeric columns with mixed decimal precision reserve the widest decimal
  // width in every row so ones digits and decimal points share one vertical
  // line without adding trailing blank space to all-integer columns.
  const numericParts = columns.map((column, i) => {
    if (!column.numeric) return null;
    let minFrac = Infinity, maxFrac = 0;
    const rows = scoreListShown.rows.map((row) => {
      const value = row.values[i];
      if (!Number.isFinite(value)) return null;
      const parts = parseScoreNumber(column.format(value));
      const fracLen = parts.fracPart.length;
      if (fracLen < minFrac) minFrac = fracLen;
      if (fracLen > maxFrac) maxFrac = fracLen;
      return parts;
    });
    return { rows, padFrac: maxFrac > 0 && minFrac < maxFrac ? maxFrac : 0 };
  });

  const body = document.createElement('tbody');
  const stop = tabStop === null ? scoreListShown.rows[0].record : tabStop;
  scoreListShown.rows.forEach((row, rowIndex) => {
    const line = document.createElement('tr');
    line.tabIndex = row.record === stop ? 0 : -1;
    if (row.record === scoreListShown.pageGame) line.className = 'me';
    const rank = document.createElement('td');
    rank.textContent = String(row.rank);
    line.appendChild(rank);
    columns.forEach((column, i) => {
      if (column.numeric) {
        const cell = document.createElement('td');
        const parts = numericParts[i].rows[rowIndex];
        if (parts !== null) {
          if (column.id === 'time' && isMarkless(row.record)) cell.classList.add('markless-time');
          const padFrac = numericParts[i].padFrac;
          if (padFrac > 0) {
            const frac = document.createElement('span');
            frac.className = 'score-num-frac';
            frac.style.width = padFrac + 'ch';
            frac.textContent = parts.fracPart;
            cell.append(parts.intPart, frac);
          } else {
            cell.textContent = parts.intPart + parts.fracPart;
          }
        }
        line.appendChild(cell);
        return;
      }
      const value = row.values[i];
      const cells = Number.isFinite(value)
        ? column.cells(value)
        : Array.from({ length: column.colSpan }, () => ['', '']);
      for (const [className, text] of cells) {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = text;
        line.appendChild(cell);
      }
    });
    body.appendChild(line);
  });
  table.append(head, body);
  scoreListScroll.replaceChildren(table);
}

// A new order starts at its top; the keyboard's row stays its game's.
function sortScoreListBy(column) {
  const sort = settings.scoreListSort;
  updateSettings({ scoreListSort: sort.column === column.id
    ? { column: column.id, ascending: !sort.ascending }
    : { column: column.id, ascending: column.lowerFirst } });
  renderScoreListTable(scoreRowTabStop());
  scoreListScroll.scrollTop = 0;
  scoreListScroll.querySelector('.score-list-sort[data-column="' + column.id + '"]').focus();
}

// The game of the row the keyboard is on, the one row in the tab order.
function scoreRowTabStop() {
  return scoreListShown.rows[scoreListScroll.querySelector('tbody tr[tabindex="0"]').sectionRowIndex].record;
}

// Moves the keyboard to row `index`, into view (`block`, as scrollIntoView
// takes it).
function focusScoreRow(index, block) {
  const lines = scoreListScroll.querySelector('tbody').rows;
  scoreListScroll.querySelector('tbody tr[tabindex="0"]').tabIndex = -1;
  lines[index].tabIndex = 0;
  lines[index].scrollIntoView({ block, inline: 'nearest' });
  lines[index].focus({ preventScroll: true });
}

// Opens a row's game as an old game: its saved trace's finished board
// takes the place of the board, and its result is shown as of now.
async function openOldGame(record) {
  const request = ++scoreListOpenRequest;
  const list = scoreListShown.list;
  scoreListStatus.textContent = '';
  const stored = await readStoredTrace(record.endedAt);
  if (request !== scoreListOpenRequest || !scoreListDialog.open) return;
  if (!stored || !stored.finalBoard) {
    scoreListStatus.textContent = stored
      ? 'This game was saved without its final board, so it cannot be opened.'
      : 'This game has no saved replay, so it cannot be opened.';
    return;
  }
  scoreListDialog.close();
  newGame(false);
  showSavedGame(record, history[modeKey()], stored, Infinity, list);
  updateSettings({ resultView: 'review', reviewList: list, replayPosition: { endedAt: record.endedAt, step: replayStep } });
  renderPlayLimits();
  window.scrollTo({ top: 0, left: window.scrollX });
}

function setScoreListChoicesOpen(open) {
  scoreListColumnsButton.setAttribute('aria-expanded', String(open));
  scoreListChoices.hidden = !open;
  if (open) renderScoreListChoices();
}

// One box per column a list may show, under its group; each box changes
// the list at once. Non-performance groups stack beside a two-column
// performance-measurements list so all columns fit without scrolling on desktop.
function renderScoreListChoices() {
  const groups = new Map();
  for (const column of scoreListShown.columns.filter((c) => c.id !== 'time')) {
    if (!groups.has(column.group)) groups.set(column.group, []);
    groups.get(column.group).push(column);
  }
  const makeGroup = (group, columns, listClass = '') => {
    const section = document.createElement('section');
    section.className = 'score-list-choice-group';
    const title = document.createElement('h3');
    title.textContent = group;
    const choices = document.createElement('ul');
    if (listClass) {
      choices.className = listClass;
      choices.style.setProperty('--choice-rows', String(Math.ceil(columns.length / 2)));
    }
    for (const column of columns) {
      const item = document.createElement('li');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings.scoreListColumns[column.id];
      input.dataset.column = column.id;
      input.setAttribute('aria-label', column.name);
      input.addEventListener('change', () => showScoreListColumn(column, input.checked));
      if (column.help) {
        item.append(input, chartHelpButton(column.help, column.name));
      } else {
        const label = document.createElement('label');
        label.className = 'score-list-choice-label';
        label.append(input, column.name);
        item.appendChild(label);
      }
      choices.appendChild(item);
    }
    section.append(title, choices);
    return section;
  };
  const side = document.createElement('div');
  side.className = 'score-list-choice-side';
  for (const [group, columns] of groups) {
    if (group === 'performance measurements') continue;
    side.appendChild(makeGroup(group, columns));
  }
  const parts = [side];
  const perf = groups.get('performance measurements');
  if (perf) parts.push(makeGroup('performance measurements', perf, 'score-list-choices-two-col'));
  scoreListChoices.replaceChildren(...parts);
}

// The list keeps its scroll; hiding the sorted column sorts by time.
function showScoreListColumn(column, shown) {
  updateSettings({
    scoreListColumns: { ...settings.scoreListColumns, [column.id]: shown },
    ...(!shown && settings.scoreListSort.column === column.id ? { scoreListSort: { column: 'time', ascending: true } } : {}),
  });
  const { scrollTop, scrollLeft } = scoreListScroll;
  renderScoreListTable(scoreRowTabStop());
  scoreListScroll.scrollTop = scrollTop;
  scoreListScroll.scrollLeft = scrollLeft;
}

scoreListColumnsButton.addEventListener('click', () => {
  hideChartHelpTip();
  setScoreListChoicesOpen(scoreListChoices.hidden);
});
document.getElementById('score-list-close').addEventListener('click', () => scoreListDialog.close());
scoreListDialog.addEventListener('close', () => {
  scoreListOpenRequest++;
  hideChartHelpTip();
});
// The page's own keys (the space bar's new game, the replay's arrows) stay
// with the page while the window is open.
scoreListDialog.addEventListener('keydown', (event) => event.stopPropagation());
scoreListScroll.addEventListener('click', (event) => {
  const line = event.target.closest('tbody tr');
  if (line === null) return;
  focusScoreRow(line.sectionRowIndex, 'nearest');
  openOldGame(scoreListShown.rows[line.sectionRowIndex].record);
});
scoreListScroll.addEventListener('keydown', (event) => {
  const line = event.target.closest('tbody tr');
  if (line === null) return;
  const last = scoreListShown.rows.length - 1;
  const page = Math.max(1, Math.floor(scoreListScroll.clientHeight / line.offsetHeight) - 1);
  const moves = {
    ArrowDown: line.sectionRowIndex + 1, ArrowUp: line.sectionRowIndex - 1,
    PageDown: line.sectionRowIndex + page, PageUp: line.sectionRowIndex - page, Home: 0, End: last,
  };
  if (event.key in moves) {
    event.preventDefault();
    focusScoreRow(Math.min(last, Math.max(0, moves[event.key])), 'nearest');
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openOldGame(scoreListShown.rows[line.sectionRowIndex].record);
  }
});

// A rank table's title, the keyboard's way to its full list: its click
// reaches the table, which opens the list.
function scoreListOpenerTitle(text, help) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rank-list-open';
  button.textContent = text;
  button.setAttribute('aria-haspopup', 'dialog');
  if (help) {
    button.classList.add('has-help');
    attachHelpTip(button, help);
  }
  return button;
}
