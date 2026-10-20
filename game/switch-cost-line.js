'use strict';

// Switch cost: an optional line under game data's chart (off by default,
// chosen with configure there) with what the shown game's button switches
// cost and the session's, the latest, and the earlier standard games'
// estimates, its label opening the card that explains them.

//-------SWITCH COST (this game, and the session's, latest, and earlier standard games, pooled)-------

// Never estimated per game: one game has too few presses to measure it
// (split-half reliability near zero in the study), so each estimate pools
// many standard games that have a saved trace (switch-cost-worker.js), and a
// game's cost prices its own switches at the latest 500 games' estimate.
function switchCostSigned(value, digits) {
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? '\u2212' : '+') + text;
}

// Added time in seconds, in at most six characters ("+1.31s", "+12.4s").
function switchCostSeconds(ms) {
  return switchCostSigned(ms / 1000, Math.abs(ms) < 9995 ? 2 : 1) + 's';
}

// The line's pools, keyed as in the worker's reply, newest first.
const SWITCH_COST_POOLS = [
  { id: 'session', label: 'session' },
  { id: 'latest', label: 'latest ' + SwitchCost.WINDOW_GAMES },
  { id: 'earlier', label: 'earlier ' + SwitchCost.WINDOW_GAMES },
];

// What one game of each standard board added at a pool's estimate.
const SWITCH_COST_BOARD_ROWS = Object.entries(DIFFICULTIES).map(([name, board]) => {
  const key = modeKeyOf(board, 'standard');
  return { label: 'per ' + difficultyDisplayName(name) + ' game',
    of: (fit) => (fit.perGame !== null && fit.perGame[key] !== undefined ? switchCostSeconds(fit.perGame[key].meanMs) : undefined) };
});

// The card's rows: what each pool's fit holds besides its estimate.
// `of` is undefined where the fit has no value, shown as the en dash.
const SWITCH_COST_DETAILS = [
  { label: '95% interval', of: (fit) => (fit.status === 'measured'
    ? switchCostSigned(fit.percentLow, 1) + ' to ' + switchCostSigned(fit.percentHigh, 1) + '%' : undefined) },
  { label: 'per switch', of: (fit) => (fit.status === 'measured' ? switchCostSigned(fit.msPerSwitch, 0) + 'ms' : undefined) },
  ...SWITCH_COST_BOARD_ROWS,
  { label: 'moves that switch', of: (fit) => (fit.status === 'measured' ? Math.round(fit.switchShare * 100) + '%' : undefined) },
  { label: 'games', of: (fit) => String(fit.games) },
];

// The worker's latest reply, { session, latest, earlier, shown }; null until the first.
let switchCostFits = null;
// The request in flight or last answered: its candidates, newest first, the
// session window's start it used, how many candidates ended inside it, and
// the shown game it priced.
let switchCostRequest = null;
let switchCostPending = false;
let switchCostRefreshAgain = false;
// A refresh asked for while the line was off; it runs when the line shows.
let switchCostStale = false;
// The latest line built, and the game whose game data it sits under; at most
// one game data chart is on the page.
let switchCostLine = null;
let switchCostShownEndedAt = null;

// The shown game's priced switches, when the reply is about that game.
function switchCostShownGame(fits) {
  return fits !== null && fits.shown !== null && fits.shown.endedAt === switchCostShownEndedAt ? fits.shown : null;
}

// The card: what each pool's fit holds besides the estimates the line shows,
// what the shown game's switches cost, then what the estimate is and which
// games count.
function fillSwitchCostCard(tip) {
  const card = document.createElement('div');
  card.className = 'switch-cost-card';
  const paragraph = (text) => {
    const p = document.createElement('p');
    p.textContent = text;
    card.appendChild(p);
  };
  if (switchCostFits === null) paragraph('Calculating from your saved games.');
  else {
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    head.appendChild(document.createElement('td'));
    for (const pool of SWITCH_COST_POOLS) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = pool.label;
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const detail of SWITCH_COST_DETAILS) {
      const row = body.insertRow();
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = detail.label;
      row.appendChild(th);
      for (const pool of SWITCH_COST_POOLS) {
        const value = detail.of(switchCostFits[pool.id]);
        row.insertCell().textContent = value === undefined ? '\u2013' : value;
      }
    }
    card.appendChild(table);
    for (const pool of SWITCH_COST_POOLS) {
      if (switchCostFits[pool.id].status === 'not-measurable') {
        paragraph('The ' + pool.label + ' games cannot be measured: their moves do not separate '
          + 'switching from move type, distance, and board progress.');
      }
    }
    const shown = switchCostShownGame(switchCostFits);
    if (shown === null) paragraph('This game is not one of the counted games below, so it has no switch cost.');
    else {
      paragraph('This game: ' + countPhrase(shown.switches, 'button switch', 'button switches') + ' among '
        + countPhrase(shown.transitions, 'timed move', 'timed moves') + (shown.costMs === undefined
        ? '; the latest ' + SwitchCost.WINDOW_GAMES + ' games have no estimate to price them at yet.'
        : '; at the latest ' + SwitchCost.WINDOW_GAMES + ' games\u2019 estimate they added '
          + switchCostSeconds(shown.costMs).slice(1) + '.'));
    }
  }
  paragraph('Extra time before your next press after changing buttons (flag versus click or chord), '
    + 'compared with repeating the same move over the same distance at the same point in the game; '
    + 'per switch gives it in milliseconds at your median gap around a switch, and per game is what '
    + 'the switches of an average game of that board added, at that column\u2019s estimate.');
  paragraph('Earlier ' + SwitchCost.WINDOW_GAMES + ' is the ' + SwitchCost.WINDOW_GAMES
    + ' games before the latest ' + SwitchCost.WINDOW_GAMES + ': where the two intervals do not overlap, '
    + 'the cost has changed.');
  paragraph('Only Beginner, Intermediate, and Expert games in Standard play with the default generator '
    + 'and a saved trace count, and each estimate needs ' + SwitchCost.MIN_GAMES
    + ' of them: one game is too few to measure, so a game\u2019s own switches are priced at the latest '
    + SwitchCost.WINDOW_GAMES + ' games\u2019 estimate.');
  tip.appendChild(card);
}

// The line under game data's chart for `record`, the game it shows: the
// label opens the card, then what this game's switches added and each pool's
// estimate after the pool's name. A reply changes only the values.
function buildSwitchCostLine(record) {
  switchCostShownEndedAt = record.endedAt;
  const line = document.createElement('div');
  line.className = 'switch-cost-line';
  line.appendChild(chartHelpButton(fillSwitchCostCard, 'switch cost'));
  const item = (label) => {
    const entry = document.createElement('span');
    entry.className = 'switch-cost-pool';
    const value = document.createElement('span');
    value.className = 'switch-cost-value';
    entry.append(label + ' ', value);
    line.appendChild(entry);
    return value;
  };
  const shownValue = item('this game');
  const values = SWITCH_COST_POOLS.map((pool) => item(pool.label));
  line.updateFits = (fits) => {
    const shown = switchCostShownGame(fits);
    setMetricText(shownValue, shown !== null && shown.costMs !== undefined ? switchCostSeconds(shown.costMs) : '\u2013');
    SWITCH_COST_POOLS.forEach((pool, i) => {
      const fit = fits === null ? null : fits[pool.id];
      setMetricText(values[i], fit !== null && fit.status === 'measured'
        ? switchCostSigned(fit.percent, 1) + '%' : '\u2013');
    });
    // An open card would still show the previous reply.
    if (chartHelpOwner !== null && line.contains(chartHelpOwner)) hideChartHelpTip();
  };
  line.updateFits(switchCostFits);
  if (switchCostPending) line.setAttribute('aria-busy', 'true');
  switchCostLine = line;
  keepSwitchCostCurrent();
  return line;
}

// Every game on the three standard boards, newest first; the worker reads
// saved traces down this list as far as each pool needs.
function switchCostCandidates() {
  const candidates = [];
  for (const key of Object.keys(SwitchCost.KEYS)) {
    for (const record of history[key] || []) candidates.push({ endedAt: record.endedAt, key, outcome: record.outcome });
  }
  return candidates.sort((a, b) => b.endedAt - a.endedAt);
}

// How many candidates, from the newest, ended at or after `fromMs`.
function switchCostSessionCount(candidates, fromMs) {
  let count = 0;
  while (count < candidates.length && candidates[count].endedAt >= fromMs) count++;
  return count;
}

// One request in flight; a refresh asked for meanwhile runs after its reply,
// over the history, the session window, and the shown game as they are then.
// Nothing is read while the line is off.
function refreshSwitchCost() {
  if (!settings.gameDataSwitchCost) {
    switchCostStale = true;
    return;
  }
  if (switchCostPending) {
    switchCostRefreshAgain = true;
    return;
  }
  switchCostStale = false;
  switchCostPending = true;
  const candidates = switchCostCandidates();
  const sessionFromMs = SessionScope.bounds(settings.sessionDefinition, Date.now()).from;
  switchCostRequest = { candidates, sessionFromMs, shownEndedAt: switchCostShownEndedAt,
    sessionCount: switchCostSessionCount(candidates, sessionFromMs) };
  switchCostLine?.setAttribute('aria-busy', 'true');
  analysisTask('switch-cost', 'estimate', {
    database: { name: DB_NAME, version: db.version, traceStore: TRACE_STORE },
    candidates, sessionFromMs, shownEndedAt: switchCostShownEndedAt,
  }).then((fits) => {
    switchCostPending = false;
    switchCostFits = fits;
    switchCostLine?.updateFits(fits);
    if (switchCostRefreshAgain) {
      switchCostRefreshAgain = false;
      refreshSwitchCost();
    }
    if (!switchCostPending) switchCostLine?.removeAttribute('aria-busy');
  }).catch(analysisFailure);
}

// Every line built: a refresh skipped while the line was off runs now, and
// so does one for another shown game or for a session window whose start has
// crossed a game since the last request (another session picked, or time
// passing). A line built during startup, before init's first request, leaves
// that request to init.
function keepSwitchCostCurrent() {
  if (switchCostStale) refreshSwitchCost();
  else if (switchCostRequest !== null) {
    const fromMs = SessionScope.bounds(settings.sessionDefinition, Date.now()).from;
    if (switchCostRequest.shownEndedAt !== switchCostShownEndedAt
        || switchCostSessionCount(switchCostRequest.candidates, fromMs) !== switchCostRequest.sessionCount) {
      refreshSwitchCost();
    }
  }
}

// A saved trace of a standard game can change every pool.
function switchCostSourcesChanged(key) {
  if (Object.hasOwn(SwitchCost.KEYS, key)) refreshSwitchCost();
}
