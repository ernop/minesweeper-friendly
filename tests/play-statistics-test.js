'use strict';
// Play statistics (docs/product/hosting.md, "Play statistics"): every page
// loads the vendored fuseki-stats.js, which sends only from the hosted origin;
// a finished game sends exactly one game event built from its saved record,
// whose m (level, play mode, generator) stays one protocol token; each
// subpage sends one event per saved attempt, run, or check.
//
// Usage: node tests/play-statistics-test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { source } = require('./game-source.js');
const BoardGenerators = require('../generators.js');

const repo = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
// A top-level function: its declaration through its closing brace at column 0.
function functionSource(text, name) {
  const start = text.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' not found');
  return text.slice(start, text.indexOf('\n}\n', start) + 3);
}
// Objects built inside a vm context have that context's prototypes.
const plain = (fields) => ({ ...fields });
const settle = () => new Promise((resolve) => setImmediate(resolve));

//-------EVERY PAGE LOADS THE MODULE-------

const pages = fs.readdirSync(repo).filter((file) => file.endsWith('.html'));
const tags = pages.map((page) => {
  const loads = [...read(page).matchAll(/<script\b[^>]*\bsrc="fuseki-stats\.js(\?v=[^"]+)"/g)];
  assert.equal(loads.length, 1, page + ' loads fuseki-stats.js exactly once');
  return loads[0][1];
});
assert.equal(new Set(tags).size, 1, 'every page loads fuseki-stats.js under one cache tag');

//-------ONLY THE HOSTED ORIGIN SENDS-------

const statsSource = read('fuseki-stats.js');
function loadStats(url) {
  const { hostname, pathname } = new URL(url);
  const fetched = [];
  const window = {
    location: { hostname, pathname },
    fetch: (target) => {
      fetched.push(target);
      return Promise.resolve();
    },
    crypto: { getRandomValues: (bytes) => bytes.fill(0xab) },
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { visibilityState: 'visible', addEventListener: () => {} },
    addEventListener: () => {},
    setInterval: () => 0,
  };
  vm.runInNewContext(statsSource, { window, Date: { now: () => 1000 } });
  return { stats: window.FusekiStats, fetched };
}
for (const url of ['http://127.0.0.1:8018/', 'http://127.0.0.1:8099/problems.html',
  'http://localhost:8018/', 'https://ernop.github.io/minesweeper-friendly/']) {
  const local = loadStats(url);
  local.stats.game({ m: 'expert', r: 'win', d: 61.234 });
  assert.equal(local.fetched.length, 0, url + ' sends nothing');
}
const hosted = loadStats('https://minesweeper-friendly.fuseki.net/');

//-------A FINISHED GAME SENDS EXACTLY ONE EVENT-------

// The real deferral chain and record, run against stub collaborators.
const game = vm.createContext({ console });
for (const file of ['generators.js', 'game-data.js', 'settings-core.js']) {
  vm.runInContext(read(file), game, { filename: file });
}
vm.runInContext("'use strict';\n"
  + source.slice(source.indexOf('let pendingResultOutcome = null;'), source.indexOf('\nfunction newGame('))
  + ['reportResult', 'playStatisticsFields', 'shownMeasurement', 'difficultyNameOf', 'generatorAppliesToMode']
    .map((name) => functionSource(source, name)).join(''), game);

let frames = [];
let timers = [];
const log = [];
const sent = [];
const analyses = [];
const failures = [];
Object.assign(game, {
  requestAnimationFrame: (fn) => frames.push(fn),
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => timers.push({ fn, ms }),
  clearTimeout: () => {},
  window: { FusekiStats: { game: (fields) => {
    log.push('sent');
    sent.push(plain(fields));
    hosted.stats.game(fields);
  } } },
  Trial: require('../trial.js'),
  RNG_VERSION: 'rng-test',
  JUSTICE_VERSION: 'justice-test',
  boardMetricJobs: new Map(),
  observedTimeZone: () => ({ timeZone: 'America/Los_Angeles', utcOffsetMin: -420 }),
  computeBoardShape: () => ({ maxAdjacent: 5, hasSeven: false, zeroCount: 150, islandCount: 31, largestIsland: 9 }),
  activeStateNames: () => ['sleepy'],
  sessionMedian: () => 212,
  guessLedgerAppliesToMode: () => false,
  pregenActive: () => false,
  trialIsActive: () => false,
  replayDecisionCount: () => 0,
  modeKey: () => 'finished-board-key',
  appendGameRecord: (record) => {
    log.push('saved');
    return [record];
  },
  analysisTask: () => new Promise((resolve) => analyses.push(resolve)),
  analysisFailure: (error) => failures.push(error),
});
for (const name of ['renderImmediateGameEnd', 'renderPregenCharts', 'endTrial', 'persistUserdata',
  'saveTrace', 'renderMetricsPanel', 'updateSettings', 'renderPathView', 'persistGameRecord',
  'scheduleMetricsUpdate', 'appendMetricSeries', 'renderResult']) {
  game[name] = () => {};
}

function paint() {
  const callbacks = frames;
  frames = [];
  for (const fn of callbacks) fn();
  const due = timers.filter((timer) => timer.ms === 0);
  timers = timers.filter((timer) => timer.ms !== 0);
  for (const timer of due) timer.fn();
}

// One game from its ending input through every later chance to finalize it
// again: a second flush (input in the window), the throttled-frame fallback,
// and the analysis worker's answer, which saves the record again.
async function playToEnd(outcome, state) {
  Object.assign(game, {
    clickCount: 0, chordClicks: 0, wastedClicks: 0, misclicks: 0, flagsPlaced: 0, flagsRemoved: 0,
    unusedCorrectFlags: 0, mousePathPx: 30000.4, justiceEvents: 0, justiceEnabledForGame: false,
    gameSeed: '0123456789abcdef0123456789abcdef', firstRevealIndex: 0, actionEvaluations: [],
    musicObservations: [], gameFastclickGaps: [], guessEvents: [], oddsFailed: false,
    drillCurrent: null, trialPresentation: null, trialSession: null, pregenBatch: null,
    pregenCurrent: null, resultViewRevision: 0, gameSessionEndEvent: {}, metricsSeries: [],
    finalMotion: null, trace: { t: [], x: [], y: [], events: [], startedAt: 0 }, replayStep: 0,
    replayEnabled: true, history: {}, endgameDrillActive: () => false,
    gameState: outcome === 'win' ? 'won' : 'lost',
    ...state,
    cells: Array.from({ length: state.config.width * state.config.height },
      (_, cell) => ({ mine: cell < state.config.mines })),
  });
  // settings-core.js declares `settings` with let, which a context property
  // cannot replace.
  vm.runInContext('settings = ' + JSON.stringify(state.settings), game);
  log.length = 0;
  sent.length = 0;
  hosted.fetched.length = 0;
  vm.runInContext(`reportResultAfterPaint('${outcome}')`, game);
  assert.equal(sent.length, 0, 'nothing is sent in the ending input\'s frame');
  paint();
  paint();
  assert.equal(sent.length, 1, 'the result pipeline sends one event');
  vm.runInContext('flushPendingResult()', game);
  for (const timer of timers.splice(0)) timer.fn();
  for (const resolve of analyses.splice(0)) {
    resolve({ measurements: { zini: 120, hzini: 131 }, metrics: { cad: { gapSpreadRatio: 1.4 } }, spatial: null });
  }
  await settle();
  assert.deepEqual(failures, []);
  assert.equal(sent.length, 1, 'no later step sends again');
  assert.deepEqual(log, ['saved', 'sent'], 'the event follows the saved record');
  assert.equal(hosted.fetched.length, 1);
  return { fields: sent[0], url: hosted.fetched[0] };
}

// The encoded event the hosted module sends for the n-th game of the test.
const eventUrl = (n, fields) => '/_event?v=1&e=game&p=abababababababab&s=abababababababab&n=' + n
  + '&t=0&pg=%2F&' + fields;

(async () => {
  const expertWin = await playToEnd('win', {
    config: { width: 30, height: 16, mines: 99 },
    settings: { playMode: 'standard' },
    gameGenerator: { id: 'uniform', params: {} },
    justiceEnabledForGame: true,
    finalTimeMs: 61234.4,
    compute3BV: () => 152,
    clickCount: 180,
    chordClicks: 41,
    wastedClicks: 6,
    flagsPlaced: 70,
    flagsRemoved: 2,
  });
  assert.deepEqual(expertWin.fields, {
    m: 'expert:standard', r: 'win', d: 61.234, w: 30, h: 16, mines: 99,
    just: true, bbbv: 152, clicks: 180, flags: 70,
    bbbvs: 152 / 61.234, eff: 152 / 180 * 100, ioe: 152 / 186,
  });
  assert.equal(expertWin.url, eventUrl(0, 'm=expert%3Astandard&r=win&d=61.234&w=30&h=16&mines=99'
    + '&just=1&bbbv=152&clicks=180&flags=70&bbbvs=2.482&eff=84.444&ioe=0.817'));

  // A non-default generator in a mode that places mines with it joins m,
  // and its parameters follow in schema order.
  const pinkWin = await playToEnd('win', {
    config: { width: 30, height: 16, mines: 99 },
    settings: { playMode: 'standard' },
    gameGenerator: { id: 'pink-noise',
      params: BoardGenerators.paramsFrom('pink-noise', { alpha: 1.5, stretch: -1.5 }) },
    justiceEnabledForGame: true,
    finalTimeMs: 98765.2,
    compute3BV: () => 181,
    clickCount: 230,
    wastedClicks: 9,
    flagsPlaced: 85,
  });
  assert.deepEqual(pinkWin.fields, {
    m: 'expert:standard:pink-noise', r: 'win', d: 98.765, w: 30, h: 16, mines: 99,
    g_alpha: 1.5, g_scale: 8, g_contrast: 2, g_stretch: -1.5,
    just: true, bbbv: 181, clicks: 230, flags: 85,
    bbbvs: 181 / 98.765, eff: 181 / 230 * 100, ioe: 181 / 239,
  });
  assert.equal(pinkWin.url, eventUrl(1, 'm=expert%3Astandard%3Apink-noise&r=win&d=98.765&w=30&h=16'
    + '&mines=99&g_alpha=1.5&g_scale=8&g_contrast=2&g_stretch=-1.5&just=1&bbbv=181&clicks=230&flags=85'
    + '&bbbvs=1.833&eff=78.696&ioe=0.757'));

  // Single-path NG places no mines with the generator, and a loss shows no
  // win-only measurement.
  const customLoss = await playToEnd('loss', {
    config: { width: 20, height: 12, mines: 50 },
    settings: { playMode: 'single-path-ng' },
    gameGenerator: { id: 'uniform', params: {} },
    finalTimeMs: 18765.5,
    compute3BV: () => 64,
    clickCount: 25,
    wastedClicks: 2,
    flagsPlaced: 3,
  });
  assert.deepEqual(customLoss.fields, {
    m: 'custom-20x12-50:single-path-ng', r: 'loss', d: 18.766, w: 20, h: 12, mines: 50,
    just: false, bbbv: 64, clicks: 25, flags: 3,
  });
  assert.equal(customLoss.url, eventUrl(2, 'm=custom-20x12-50%3Asingle-path-ng&r=loss&d=18.766'
    + '&w=20&h=12&mines=50&just=0&bbbv=64&clicks=25&flags=3'));

  // An Endgame drill's 3BV is the presented remnant's, as in its record.
  const drillWin = await playToEnd('win', {
    config: { width: 16, height: 16, mines: 40 },
    settings: { playMode: 'endgame-drill' },
    gameGenerator: { id: 'blue-noise', params: BoardGenerators.paramsFrom('blue-noise', { spread: 3 }) },
    endgameDrillActive: () => true,
    drillCurrent: { remaining3BV: 9, safeLeft: 14 },
    finalTimeMs: 4000,
    compute3BV: () => 70,
    clickCount: 12,
    wastedClicks: 1,
  });
  assert.deepEqual(drillWin.fields, {
    m: 'intermediate:endgame-drill:blue-noise', r: 'win', d: 4, w: 16, h: 16, mines: 40, g_spread: 3,
    just: false, bbbv: 9, clicks: 12, flags: 0, bbbvs: 9 / 4, eff: 9 / 12 * 100, ioe: 9 / 13,
  });
  assert.equal(drillWin.url, eventUrl(3, 'm=intermediate%3Aendgame-drill%3Ablue-noise&r=win&d=4'
    + '&w=16&h=16&mines=40&g_spread=3&just=0&bbbv=9&clicks=12&flags=0&bbbvs=2.25&eff=75&ioe=0.692'));

  //-------m STAYS ONE TOKEN AND NO FIELD IS DROPPED-------

  // The largest custom board the app accepts, with every play mode and every
  // generator: m stays one protocol token, and the module would send every
  // field the app builds.
  const largestAccepted = (start, accepts) => {
    let value = start;
    while (accepts(value + 1)) {
      value++;
      assert(value < 1e6, 'custom boards have an upper bound');
    }
    return value;
  };
  const width = largestAccepted(8, (w) => game.validCustomBoard({ width: w, height: 1, mines: 1 }));
  const height = largestAccepted(1, (h) => game.validCustomBoard({ width: 8, height: h, mines: 1 }));
  const mines = largestAccepted(1, (n) => game.validCustomBoard({ width, height, mines: n }));
  const TOKEN = /^[A-Za-z0-9_.:/-]{1,64}$/;
  const KEY = /^[a-z][a-z0-9_]{0,23}$/;
  const CORE_KEYS = ['v', 'e', 'p', 's', 'n', 't', 'pg'];
  let longest = '';
  let mostFields = 0;
  for (const playMode of vm.runInContext('PLAY_MODES', game).map((mode) => mode.id)) {
    for (const spec of BoardGenerators.SPECS) {
      Object.assign(game, {
        config: { width, height, mines },
        gameGenerator: { id: spec.id, params: BoardGenerators.paramsFrom(spec.id) },
        statsRecord: { outcome: 'win', timeMs: 1000, bv3: 1, clicks: 1, wastedClicks: 0,
          flagsPlaced: 0, playMode, justiceEnabled: false },
      });
      const fields = plain(vm.runInContext('playStatisticsFields(statsRecord)', game));
      for (const [key, value] of Object.entries(fields)) {
        assert(KEY.test(key) && !CORE_KEYS.includes(key), key + ' is a game field key');
        assert(typeof value === 'boolean' || (Number.isFinite(value) && Math.abs(value) < 1e12)
          || (typeof value === 'string' && TOKEN.test(value)), key + ' has a value the module sends');
      }
      if (fields.m.length > longest.length) longest = fields.m;
      mostFields = Math.max(mostFields, Object.keys(fields).length);
    }
  }
  assert.match(longest, TOKEN, 'the longest m, ' + longest + ' (' + longest.length + ' characters), is one token');
  assert(mostFields <= 24, 'at most 24 game fields, got ' + mostFields);

  assert.equal(source.split('FusekiStats.game(').length, 2, 'the game page sends from one place');
  assert(functionSource(source, 'reportResult').includes('FusekiStats.game(playStatisticsFields(record))'));

  //-------SUBPAGES SEND ONE EVENT PER SAVED ATTEMPT-------

  // A transaction whose completion the test triggers.
  function transactions() {
    const pending = [];
    return {
      pending,
      db: { transaction: () => {
        const tx = { objectStore: () => ({ add: () => {} }), commit: () => {} };
        pending.push(tx);
        return tx;
      } },
    };
  }

  const problemsSource = read('problems-page.js');
  const problemSent = [];
  const problemTx = transactions();
  const problems = vm.createContext({
    console,
    window: { FusekiStats: { game: (fields) => problemSent.push(plain(fields)) } },
    performance: { timeOrigin: 1.7e12 },
    clearTimeout: () => {},
    problemDb: problemTx.db,
    bank: { bankId: 'bank-test', width: 30, height: 16 },
    cellPx: 28,
    PROBLEM_PROTOCOL: 'problem-test',
    LAST_FLAG_PROTOCOL: 'last-flag-test',
    POINTING_PROTOCOL: 'pointing-test',
    validProblemAttempt: () => true,
    validDrillAttempt: () => true,
    validPointingRun: () => true,
    showFailure: (message) => {
      throw new Error(message);
    },
    attempts: [],
    drillAttempts: [],
    pointingRuns: [],
    run: { setStartedAt: 1, results: [] },
  });
  for (const name of ['renderResult', 'renderSummary', 'renderDrillResult', 'renderPointingResult', 'renderHome']) {
    problems[name] = () => {};
  }
  vm.runInContext(read('problems-storage.js'), problems, { filename: 'problems-storage.js' });
  vm.runInContext("'use strict';\n" + ['reportPlayStatistics', 'finishAttempt', 'finishDrillAttempt', 'finishPointing']
    .map((name) => functionSource(problemsSource, name)).join(''), problems);
  const live = (startT) => ({ startT, previewT: startT - 1000, timeoutTimer: 0, actions: [],
    samples: { t: [], x: [], y: [] }, problem: { id: 'problem-1', classId: 'class-1' } });
  for (const [finish, state, outcome, endT, expected] of [
    ['finishAttempt', { live: live(1000) }, 'solved', 2534.5, { m: 'problem', r: 'solved', d: 1.5345 }],
    ['finishDrillAttempt', { live: live(500) }, 'timeout', 8500, { m: 'last-flag-drill', r: 'timeout', d: 8 }],
    ['finishPointing', { pointing: { startT: 200, targets: [], samples: { t: [], x: [], y: [] } } },
      'complete', 30200, { m: 'pointing-test', r: 'complete', d: 30 }],
  ]) {
    Object.assign(problems, state);
    problemSent.length = 0;
    vm.runInContext(`${finish}('${outcome}', ${endT})`, problems);
    assert.equal(problemSent.length, 0, finish + ' sends nothing before its record is saved');
    problemTx.pending.shift().oncomplete();
    assert.deepEqual(problemSent, [expected], finish + ' sends one event once saved');
  }

  const selfCheckSource = read('self-check-page.js');
  const checkSent = [];
  const checkTx = transactions();
  const selfCheck = vm.createContext({
    console,
    window: { FusekiStats: { game: (fields) => checkSent.push(plain(fields)) }, removeEventListener: () => {} },
    document: { removeEventListener: () => {} },
    cancelAnimationFrame: () => {},
    performance: { timeOrigin: 1.7e12 },
    db: checkTx.db,
    SELF_CHECK_STORE: 'selfChecks',
    vigilanceCounter: { textContent: '' },
    SLEEPINESS_SCALE: { id: 'sleepiness-test' },
    ALERTNESS_PROTOCOL: { id: 'alertness-test' },
    validSelfCheck: () => true,
    storageFailure: (message) => {
      throw new Error(message);
    },
    selfChecks: [],
    vigilanceRun: { startT: 1000, frameRequest: 0, environment: {}, trials: [], earlyPresses: [],
      frameCount: 0, frameIntervalsMs: [], interruption: undefined },
    pendingCheck: { startedAt: 1, timeZone: 'America/Los_Angeles', utcOffsetMin: -420,
      occasion: 'routine', sleepinessRating: 3, sleepHoursPast24h: 7, note: 'free text stays local' },
  });
  for (const name of ['onVigilancePointerDown', 'onVigilanceKeyDown', 'preventVigilanceContextMenu',
    'onVigilanceVisibilityChange', 'onVigilanceBlur', 'onVigilancePageHide', 'renderSelfCheckHistory',
    'showSelfCheckResult', 'requestArchiveSync', 'releaseArchiveSync']) {
    selfCheck[name] = () => {};
  }
  vm.runInContext("'use strict';\n" + functionSource(selfCheckSource, 'finishVigilance'), selfCheck);
  vm.runInContext("finishVigilance('complete', 31000)", selfCheck);
  assert.equal(checkSent.length, 0, 'a self-check sends nothing before it is saved');
  checkTx.pending.shift().oncomplete();
  assert.deepEqual(checkSent, [{ m: 'self-check', r: 'complete', d: 30 }],
    'a saved self-check sends only its status and duration');

  console.log('play-statistics: page loading, hosted-only sending, one event per finished game, '
    + 'and one event per saved subpage attempt passed; longest m ' + longest
    + ' (' + longest.length + ' characters)');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
