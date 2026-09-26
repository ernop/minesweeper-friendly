'use strict';
// Music detection asks the player's own machine (ProjectLauncher on
// localhost) whether audio is playing. Only the canonical local origin has
// that machine behind it. Every other origin must never contact localhost:
// no request (Chrome would ask visitors for local-network access), no polling,
// and no observations for the record.
//
// Usage: node tests/music-local-only-test.js

const vm = require('vm');
const { files, texts } = require('./game-source.js');

const musicIndex = files.indexOf('game/music.js');
if (musicIndex < 0) throw new Error('index.html does not load game/music.js');
const musicSource = texts[musicIndex];

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

function load(origin) {
  const fetched = [];
  const intervals = [];
  const context = {
    location: { origin },
    document: { getElementById: () => ({ hidden: true }) },
    fetch: (url) => {
      fetched.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ is_music_playing: true }) });
    },
    setInterval: (callback, ms) => intervals.push(ms),
    AbortSignal: { timeout: () => undefined },
    tracing: () => true,
  };
  vm.createContext(context);
  vm.runInContext(musicSource, context);
  vm.runInContext('beginMusicSampling()', context);
  return { context, fetched, intervals };
}

(async () => {
  const local = load('http://127.0.0.1:8018');
  check('the local origin polls every 15s', local.intervals.length === 1 && local.intervals[0] === 15000);
  check('the local origin samples when a board is dealt',
    local.fetched.length === 1 && local.fetched[0] === 'http://localhost/api/is-music-playing');
  await new Promise((resolve) => setImmediate(resolve));
  check('a local answer during the game becomes an observation',
    vm.runInContext('musicObservations.length', local.context) === 1);

  for (const origin of [
    'https://ernop.github.io',
    'https://minesweeper-friendly.fuseki.net',
    'http://127.0.0.1:8099',
    'http://localhost:8018',
    'http://127.0.0.1:8019',
  ]) {
    const foreign = load(origin);
    check(`${origin} never contacts localhost`, foreign.fetched.length === 0);
    check(`${origin} never polls`, foreign.intervals.length === 0);
    check(`${origin} records no music observations`,
      vm.runInContext('musicObservations.length', foreign.context) === 0);
  }

  console.log(`music-local-only-test: ${checks} checks passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
