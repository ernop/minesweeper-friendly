'use strict';

// Music state: whether the machine is playing audio, sampled from the local
// ProjectLauncher endpoint and stamped onto finished games.

//-------MUSIC STATE (was audio playing, asked of the machine's base system)-------

// The page cannot observe system audio; the machine's resident
// ProjectLauncher can (PipeWire) and serves a cached boolean at
// localhost/api/is-music-playing, rechecked there at most once a minute.
// Polled continuously while the page is open: the live indicator is a
// statement about the machine right now and must appear/disappear when
// the music starts/stops even between games. Polling faster than the
// base system's own minute only tracks its cache, so a change can show
// up to ~75s late (poll interval + cache age), typically under a minute.
// reportResult stores musicPlaying = true if any sample during the game
// heard audio, false if every sample heard silence, and no field at all
// when the endpoint never answered (launcher down): absence means "not
// measured", the usual rule.
//
// Local only (creator, 2026-09-26): the base system exists only on the
// player's own machine, which serves the canonical local origin. Every other
// origin (GitHub Pages, fuseki hosting, the test origin) never contacts
// localhost at all, so visitors get no request and no browser local-network
// prompt, the indicator never shows, and records carry no musicPlaying field.
const MUSIC_ENDPOINT = 'http://localhost/api/is-music-playing';
const MUSIC_ORIGIN = 'http://127.0.0.1:8018';
const MUSIC_SAMPLE_EVERY_MS = 15000;
const musicMeasured = location.origin === MUSIC_ORIGIN;
let musicObservations = [];
// The latest answer, for the live indicator: true/false = measured,
// null = the endpoint is not answering. Unknown shows nothing — it is
// never displayed as silence.
let musicNow = null;
const musicIndicator = document.getElementById('music-indicator');

function renderMusicIndicator() {
  musicIndicator.hidden = musicNow !== true;
}

function sampleMusic() {
  fetch(MUSIC_ENDPOINT, { signal: AbortSignal.timeout(3000) })
    .then((response) => {
      if (!response.ok) throw new Error('is-music-playing: http ' + response.status);
      return response.json();
    })
    .then((data) => {
      musicNow = data.is_music_playing === true;
      // A game's observations are the answers that arrive while it runs;
      // an answer is at most seconds old, so it belongs to the board now
      // in play. One landing after the game ended is display-only — the
      // record was already written.
      if (tracing()) musicObservations.push(musicNow);
      renderMusicIndicator();
    })
    .catch(() => {
      // No base system answered from this origin: unknown, not silence.
      // Running games are simply not measured (no musicPlaying field).
      musicNow = null;
      renderMusicIndicator();
    });
}

function beginMusicSampling() {
  musicObservations = [];
  if (musicMeasured) sampleMusic();
}

if (musicMeasured) setInterval(sampleMusic, MUSIC_SAMPLE_EVERY_MS);
