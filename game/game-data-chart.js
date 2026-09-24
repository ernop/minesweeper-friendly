'use strict';

// The game data chart: the 0–100% band ranking this game's performance and
// its board traits, with its configuration and session-history views.

//-------GAME DATA CHART (the 0–100% band)-------

function boardTimeProfileRowHelp(record, row) {
  const rank = row.rankLabel ? row.rankLabel.slice(1) : row.rank.toLocaleString();
  return [
    row.label,
    ...(row.help ? [].concat(row.help(record)) : []),
    'Percentile = 100 × (rank − 1) ÷ (measured count − 1): the share of the other measured games that beat this one. '
      + (row.direction === 'higher' ? 'Higher' : 'Lower') + ' values receive earlier ranks. '
      + 'The best in the pool is 0% at the top of the chart and the worst is 100%. The current game is included in the count.',
    row.percentile === null ? 'Only one measured game: no comparative percentile is plotted.'
      : row.allEqual ? 'All measured values are equal, so there is no preference ordering. The marker is neutral at 50%.'
        : 'Here: rank ' + rank + ' of ' + row.total.toLocaleString()
          + '; 100 × (' + Number(row.rank.toFixed(3)) + ' − 1) ÷ (' + row.total + ' − 1) = '
          + Number(row.percentile.toFixed(2)) + '%.',
  ];
}

function boardTimeRankColor(percentile) {
  const green = [216, 240, 218], blue = [217, 235, 250], red = [250, 216, 216];
  const [from, to, fraction] = percentile <= 50
    ? [green, blue, percentile / 50] : [blue, red, (percentile - 50) / 50];
  return 'rgb(' + from.map((value, index) => Math.round(value + (to[index] - value) * fraction)).join(', ') + ')';
}

function boardTraitValueLabel(record, row) {
  const label = chartHelpButton(boardTimeProfileRowHelp(record, row), row.trait);
  const button = label.querySelector('button');
  const name = document.createElement('span');
  name.className = 'board-trait-name';
  name.textContent = row.name ?? row.trait;
  const value = document.createElement('span');
  value.className = 'board-trait-value';
  value.textContent = row.valueText;
  button.replaceChildren(name, ' ', value);
  if (row.scopeText) {
    const scope = document.createElement('span');
    scope.className = 'board-trait-scope';
    scope.textContent = row.scopeText;
    button.append(' ', scope);
  }
  button.setAttribute('aria-label', 'About ' + row.trait + ': ' + row.valueText);
  return label;
}

// Band half-width (16px) plus the 14px gap to each side's labels.
const BOARD_TRAIT_LABEL_OFFSET = 30;

function buildBoardTraitLine(record, rows, frame) {
  const sides = document.createElement('div');
  sides.className = 'board-time-profile-sides';
  const headings = {};
  for (const [side, text] of [['performance', 'your perf'], ['board', 'board traits']]) {
    headings[side] = document.createElement('span');
    headings[side].textContent = text;
    sides.appendChild(headings[side]);
  }
  const container = document.createElement('div');
  container.className = 'board-trait-line-view';
  const ranked = rows.filter((row) => row.percentile !== null);
  const unranked = rows.filter((row) => row.percentile === null);
  const stage = document.createElement('div');
  stage.className = 'board-trait-line';
  const axis = document.createElement('div');
  axis.className = 'board-trait-line-axis';
  stage.appendChild(axis);
  const [low, high] = GameData.domain(ranked);
  stage.dataset.low = low;
  stage.dataset.high = high;
  const stops = [[low, 0], ...(low < 50 && high > 50 ? [[50, (50 - low) / (high - low) * 100]] : []), [high, 100]];
  axis.style.background = 'linear-gradient(' + stops.map(([p, at]) => boardTimeRankColor(p) + ' ' + at + '%').join(', ') + ')';
  for (let position = low; position <= high; position += 10) {
    const tick = document.createElement('span');
    tick.className = 'board-trait-line-tick';
    tick.style.top = ((position - low) / (high - low) * 100) + '%';
    tick.textContent = position + '%';
    axis.appendChild(tick);
  }
  const entries = [];
  const svgs = [];
  for (const side of ['performance', 'board']) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.side = side;
    svgs.push(svg);
    stage.appendChild(svg);
    for (const row of ranked.filter((r) => r.side === side).sort((a, b) => a.percentile - b.percentile)) {
      const connector = document.createElementNS(SVG_NS, 'path');
      connector.setAttribute('class', 'board-trait-line-connector');
      svg.appendChild(connector);
      const dot = document.createElement('span');
      dot.className = 'board-trait-line-dot';
      dot.dataset.side = side;
      dot.style.background = boardTimeRankColor(row.percentile);
      dot.setAttribute('aria-hidden', 'true');
      const label = boardTraitValueLabel(record, row);
      label.classList.add('board-trait-line-label');
      label.style.setProperty('--trait-tint', boardTimeRankColor(row.percentile));
      label.dataset.trait = row.trait;
      label.dataset.side = side;
      label.dataset.percentile = row.percentile;
      stage.append(dot, label);
      entries.push({ ...row, label, dot, connector });
    }
  }
  if (ranked.length) container.appendChild(stage);
  if (unranked.length) {
    const note = document.createElement('div');
    note.className = 'board-trait-line-unranked';
    const heading = document.createElement('span');
    heading.className = 'board-trait-line-unranked-heading';
    heading.textContent = 'Only one measured game:';
    note.appendChild(heading);
    for (const side of ['performance', 'board']) {
      const column = document.createElement('div');
      column.dataset.side = side;
      for (const row of unranked.filter((item) => item.side === side)) column.appendChild(boardTraitValueLabel(record, row));
      note.appendChild(column);
    }
    container.appendChild(note);
  }
  // Natural one-line widths place the band; heights are measured afterwards,
  // once each side's width limit applies. Side headings keep one line only
  // when that costs no data label its single line.
  function placeBand() {
    frame.classList.add('board-trait-line-measuring');
    const width = (node) => Math.ceil(node.getBoundingClientRect().width) + 1;
    const labels = { performance: 0, board: 0 };
    for (const entry of entries) labels[entry.side] = Math.max(labels[entry.side], width(entry.label));
    const withHeadings = { performance: Math.max(labels.performance, width(headings.performance)),
      board: Math.max(labels.board, width(headings.board)) };
    frame.classList.remove('board-trait-line-measuring');
    const room = stage.clientWidth - BOARD_TRAIT_LABEL_OFFSET * 2;
    const widest = withHeadings.performance + withHeadings.board <= room ? withHeadings : labels;
    frame.style.setProperty('--band-x', boardTraitBandCenter(stage.clientWidth,
      widest.performance, widest.board, BOARD_TRAIT_LABEL_OFFSET) + 'px');
  }
  function layout() {
    if (!container.isConnected || !container.clientWidth || !ranked.length) return;
    placeBand();
    const measured = entries.map((entry) => ({ ...entry, labelHeight: entry.label.getBoundingClientRect().height }));
    const top = Math.max(7, ...measured.map((r) => r.labelHeight / 2));
    const needed = Math.max(...['performance', 'board'].map((side) =>
      measured.filter((r) => r.side === side).reduce((sum, r) => sum + r.labelHeight + 2, 0)));
    const noteHeight = container.querySelector('.board-trait-line-unranked')?.offsetHeight || 0;
    const totalHeight = Math.max(container.clientHeight - noteHeight, needed + top * 2);
    const height = totalHeight - top * 2;
    stage.style.height = totalHeight + 'px';
    axis.style.top = top + 'px';
    axis.style.height = height + 'px';
    for (const svg of svgs) svg.setAttribute('viewBox', '0 0 14 ' + totalHeight);
    for (const side of ['performance', 'board']) {
      for (const row of boardTraitLabelLayout(measured.filter((r) => r.side === side), top, height, 20, [low, high])) {
        row.connector.setAttribute('d', 'M 0 ' + row.pointY + ' L 3 ' + row.pointY
          + ' L 11 ' + row.labelY + ' L 14 ' + row.labelY);
        row.connector.dataset.displaced = String(Math.abs(row.labelY - row.pointY) > 8);
        row.dot.style.top = row.pointY + 'px';
        row.label.style.top = row.labelY + 'px';
        row.label.dataset.pointY = row.pointY;
      }
    }
  }
  return { header: sides, element: container, layout };
}

function buildBoardTimeRankProfile(record, comparisons, historyView, records) {
  if (record.outcome !== 'win') return null;
  const host = document.createElement('div');
  host.className = 'board-time-profile-host';
  const profile = document.createElement('figure');
  profile.className = 'board-time-profile';
  profile.setAttribute('aria-label', 'game data');
  host.appendChild(profile);
  let observer;
  let view = 'chart', historyMetric = 'time', historyPage = 0;
  const button = (text, action) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    node.addEventListener('click', action);
    return node;
  };
  function show(next) {
    view = next; render();
    profile.querySelector(next === 'chart' ? '.game-data-controls button' : 'figcaption > button')?.focus();
  }
  function checkbox(text, checked, change) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    label.append(input, ' ' + text);
    return label;
  }
  function render() {
    observer?.disconnect();
    if (chartHelpOwner && profile.contains(chartHelpOwner)) hideChartHelpTip();
    profile.replaceChildren();
    profile.dataset.screen = view;
    profile.classList.toggle('game-data-values-hidden', !settings.gameDataShowValues);
    const caption = document.createElement('figcaption');
    const heading = document.createElement('h4');
    heading.appendChild(chartHelpButton([
      'Your perf: this game’s measurement ranked separately against lifetime and session history. Time and workload-completion metrics compare wins; action, timing, and error metrics compare measured wins and losses. Day time uses the trailing 24 hours. Every comparison ends at this game’s finish and uses the same board size, mine count, mode, and generator.',
      'Board traits: this board’s measured trait values ranked against measured historical boards in this category. Higher 0–1 share and zero count are preferred; lower 3BV, ZiNi, HZiNi, spread, max number (MN), islands, largest island, and zero-opening coverage (ZOC) are preferred. These directions express your preference, not an estimated effect on solve time.',
      'Each your-perf label ends with its comparison pool: (session), (life) for lifetime, or (day) for the trailing 24 hours.',
      'Position is 100 × (rank − 1) ÷ (comparison count − 1), counting this win: the best in its pool is 0% at the top and the worst is 100% at the bottom. Constant performance values are neutral at 50%; other ties share a mean rank, except times which keep earlier-completion-first order.',
      'The visible percentile range zooms around all shown points with an outward buffer. Colors keep their absolute 0–100% meaning. Dark leaders retain exact point positions when labels need room. A singleton has no comparative percentile.',
      'Session is the one page-wide window chosen with the picker at the upper left (now: ' + SessionScope.choices.find((c) => c.id === settings.sessionDefinition).label + '), shared with the left-side session stats and ranks won in session; the default is today, since local midnight. Historical session windows end at the selected game’s completion. History shows medians and measured sample counts for those overlapping windows; measurements are reused, never replaced by stored ranks.',
    ], 'game data'));
    caption.appendChild(heading);
    if (view !== 'chart') caption.appendChild(button('back to game data', () => show('chart')));
    profile.appendChild(caption);
    if (view === 'config') {
      const configView = document.createElement('div');
      configView.className = 'game-data-config';
      const title = document.createElement('h4');
      title.textContent = 'performance comparisons';
      configView.appendChild(title);
      const selections = { session: 'gameDataSessionMetrics', lifetime: 'gameDataLifetimeMetrics' };
      const inputs = [];
      const metas = [];
      function sync() {
        for (const { input, scope, id } of inputs) input.checked = settings[selections[scope]][id];
        for (const { input, scopes } of metas) {
          const values = scopes.flatMap((scope) => Object.values(settings[selections[scope]]));
          input.checked = values.every(Boolean);
          input.indeterminate = values.some(Boolean) && !input.checked;
        }
      }
      function meta(text, scopes) {
        const label = checkbox(text, false, (checked) => {
          for (const scope of scopes) {
            settings[selections[scope]] = Object.fromEntries(GameData.metrics.map((m) => [m.id, checked]));
          }
          saveSettings(); sync();
        });
        metas.push({ input: label.querySelector('input'), scopes });
        return label;
      }
      configView.appendChild(meta('all performance metrics', ['session', 'lifetime']));
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      const nameHead = document.createElement('th'); nameHead.textContent = 'measurement'; headRow.appendChild(nameHead);
      for (const scope of ['session', 'lifetime']) {
        const cell = document.createElement('th'); cell.appendChild(meta(scope, [scope])); headRow.appendChild(cell);
      }
      head.appendChild(headRow);
      const body = document.createElement('tbody');
      for (const metric of GameData.metrics) {
        const row = document.createElement('tr');
        const name = document.createElement('td'); name.appendChild(chartHelpButton(metric.help, metric.name)); row.appendChild(name);
        for (const scope of ['session', 'lifetime']) {
          const cell = document.createElement('td');
          const input = document.createElement('input'); input.type = 'checkbox';
          input.setAttribute('aria-label', scope + ' ' + metric.name);
          input.addEventListener('change', () => {
            settings[selections[scope]][metric.id] = input.checked; saveSettings(); sync();
          });
          inputs.push({ input, scope, id: metric.id }); cell.appendChild(input); row.appendChild(cell);
        }
        body.appendChild(row);
      }
      table.append(head, body); configView.appendChild(table); sync();
      configView.appendChild(checkbox('day time · last 24 hours', settings.gameDataDayTime, (checked) => {
        settings.gameDataDayTime = checked; saveSettings();
      }));
      const historyButton = button('session history', () => show('history'));
      configView.appendChild(historyButton);
      profile.append(configView, button('back to game data', () => show('chart')));
    } else if (view === 'history') {
      const controls = document.createElement('div');
      controls.className = 'game-data-history-controls';
      const label = document.createElement('label');
      label.textContent = 'measurement ';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'measurement');
      for (const metric of GameData.metrics) select.add(new Option(metric.name, metric.id));
      select.value = historyMetric;
      select.addEventListener('change', () => {
        historyMetric = select.value; historyPage = 0; render();
        profile.querySelector('[aria-label="measurement"]').focus();
      });
      label.appendChild(select);
      const choice = SessionScope.choices.find((c) => c.id === settings.sessionDefinition);
      controls.append(label, chartHelpButton('Medians and middle halves of measured per-game values; n is the measured-game count. Completion metrics use wins; activity metrics include losses. A median of per-game fastclick medians is not a pooled press-gap median. All completed wins and losses establish sessions. '
        + 'Rows are overlapping session windows ending at saved games, not independent sessions. Session: '
        + choice.label + ', the one page-wide session chosen at the upper left.'));
      profile.appendChild(controls);
      const pageSize = 20;
      const groups = GameData.history(records, record.endedAt, settings.sessionDefinition, historyPage, pageSize);
      const spec = GameData.metrics.find((m) => m.id === historyMetric);
      const scroll = document.createElement('div');
      scroll.className = 'game-data-history';
      const table = document.createElement('table');
      const cap = document.createElement('caption');
      cap.textContent = 'session windows ending at each game';
      const head = document.createElement('thead');
      const tr = document.createElement('tr');
      for (const text of ['ended', 'wins / games', 'measured n', 'median', 'middle 50%']) {
        const th = document.createElement('th'); th.textContent = text; tr.appendChild(th);
      }
      head.appendChild(tr);
      const body = document.createElement('tbody');
      for (const group of groups.windows) {
        const stats = GameData.summary(group.records, historyMetric, config);
        const row = document.createElement('tr');
        for (const text of [new Date(group.endedAt).toLocaleString(), stats.wins + ' / ' + stats.games,
          stats.measured, stats.median === null ? 'unmeasured' : spec.format(stats.median),
          stats.median === null ? '—' : spec.format(stats.lower) + '–' + spec.format(stats.upper)]) {
          const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell);
        }
        body.appendChild(row);
      }
      table.append(cap, head, body); scroll.appendChild(table); profile.appendChild(scroll);
      const pager = document.createElement('div'); pager.className = 'game-data-history-controls';
      const prev = button('newer', () => { historyPage--; render(); }); prev.disabled = historyPage === 0;
      const next = button('older', () => { historyPage++; render(); }); next.disabled = (historyPage + 1) * pageSize >= groups.total;
      pager.append(prev, 'page ' + (historyPage + 1) + ' / ' + Math.max(1, Math.ceil(groups.total / pageSize)), next);
      profile.appendChild(pager);
    } else {
      const rows = [...performanceTimeRankProfile(record, records, settings, config), ...boardTraitRankProfile(record, comparisons, records)];
      const line = buildBoardTraitLine(record, rows, profile);
      profile.append(line.header, line.element);
      observer = new ResizeObserver(() => {
        if (!profile.isConnected) { observer.disconnect(); return; }
        line.layout();
      });
      observer.observe(line.element);
      requestAnimationFrame(line.layout);
    }
    const footer = document.createElement('div');
    footer.className = 'game-data-controls';
    footer.appendChild(checkbox('show actual value', settings.gameDataShowValues, (checked) => {
      settings.gameDataShowValues = checked; saveSettings();
      profile.classList.toggle('game-data-values-hidden', !checked);
      // Values change label heights, not the measurements or percentile domain.
      const viewport = profile.querySelector('.board-trait-line-view');
      if (viewport) { render(); profile.querySelector('input[type="checkbox"]').focus(); }
    }));
    if (view === 'chart') footer.append(button('configure', () => show('config')), button('session history', () => show('history')));
    profile.appendChild(footer);
  }
  profile.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view !== 'chart') { event.preventDefault(); event.stopPropagation(); show('chart'); profile.querySelector('.game-data-controls button')?.focus(); }
  });
  profile.dataset.sessionScopeView = '';
  profile.addEventListener('session-scope-change', () => { historyPage = 0; render(); });
  render();
  return host;
}
