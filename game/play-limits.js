'use strict';

// Daily play limits on the game page: this tab's play spans (saved while
// each board plays and shared live with other tabs), the gate that keeps a
// new board from starting while a limit is reached, the notice over a
// closed board, and today's use beside the limits link in the top bar. The
// rules are the pure play-limits.js; limits are set only on the settings page.

//-------DAILY PLAY LIMITS-------

let playLimits = null;          // userdata 'playLimits', filled by userdataReady
const playSpans = new Map();    // startedAt -> span, from every tab
let currentPlaySpan = null;     // this tab's board in play, or null
let playSpanHeartbeat = null;
let playLimitChangeTimer = null;
// The ready board was dealt while closed, so modes that open their board
// themselves (Pregen 10, trials with a given opening) skipped the deal.
let boardDealtClosed = false;
const playLimitsChannel = new BroadcastChannel(PLAY_LIMITS_CHANNEL);
const playLimitsUse = document.getElementById('play-limits-use');
const playLimitClosedNotice = document.getElementById('play-limit-closed');

function loadPlayLimits(stored, spans) {
  playLimits = playLimitsFrom(stored);
  for (const span of spans) playSpans.set(span.startedAt, span);
  playLimitsChannel.addEventListener('message', ({ data }) => {
    if (data.span !== undefined) playSpans.set(data.span.startedAt, data.span);
    if (data.limits !== undefined) playLimits = playLimitsFrom(data.limits);
    renderPlayLimits();
  });
}

function reachedPlayLimitsNow() {
  const now = Date.now();
  return reachedPlayLimits(playLimits, playDayUse(playSpans.values(), now), now);
}

// A board already in play always finishes; only starting one is refused.
function playLimitBlocksStart() {
  return gameState === 'ready' && reachedPlayLimitsNow().length > 0;
}

function savePlaySpan(span) {
  playSpans.set(span.startedAt, span);
  persistPlaySpan(span);
  playLimitsChannel.postMessage({ span });
}

function touchPlaySpan() {
  currentPlaySpan.lastSeenAt = Date.now();
  savePlaySpan(currentPlaySpan);
}

// Called from startTimer, which every board passes on going into play.
function playSpanBegin() {
  if (currentPlaySpan !== null) return;
  const now = Date.now();
  currentPlaySpan = {
    startedAt: now, lastSeenAt: now, endedAt: null,
    width: config.width, height: config.height, mines: config.mines, playMode: settings.playMode,
  };
  savePlaySpan(currentPlaySpan);
  playSpanHeartbeat = setInterval(touchPlaySpan, PLAY_SPAN_HEARTBEAT_MS);
  renderPlayLimits();
}

// Called when a board leaves play: finished, restarted, or its trial ended.
function playSpanEnd() {
  if (currentPlaySpan === null) return;
  clearInterval(playSpanHeartbeat);
  playSpanHeartbeat = null;
  const now = Date.now();
  currentPlaySpan.lastSeenAt = now;
  currentPlaySpan.endedAt = now;
  savePlaySpan(currentPlaySpan);
  currentPlaySpan = null;
  renderPlayLimits();
}

// A hidden or closing tab saves how far its board got (controls.js page
// lifecycle); the heartbeat bounds the loss when the browser gives it no
// chance.
function savePlaySpanProgress() {
  if (currentPlaySpan !== null) touchPlaySpan();
}

function playLimitUsePart(kind, value, use) {
  if (kind.type === 'minutes') {
    return formatPlayLimitDuration(use.playedMs) + ' of ' + formatPlayLimitMinutes(value);
  }
  if (kind.type === 'games') return playLimitUsed(kind, use) + ' of ' + value + ' ' + kind.label;
  return 'stop ' + formatMinuteOfDay(value);
}

function playLimitClosedLine(kind, value, use) {
  const line = document.createElement('p');
  const amount = document.createElement('span');
  amount.className = 'play-limit-amount';
  if (kind.type === 'minutes') {
    amount.textContent = formatPlayLimitDuration(use.playedMs);
    line.append(amount, ' played of ' + formatPlayLimitMinutes(value));
  } else if (kind.type === 'games') {
    amount.textContent = playLimitUsed(kind, use) + ' of ' + value;
    line.append(amount, ' ' + kind.label);
  } else {
    amount.textContent = formatMinuteOfDay(value);
    line.append('stop time ', amount);
  }
  return line;
}

function renderPlayLimits() {
  const now = Date.now();
  const use = playDayUse(playSpans.values(), now);
  const reached = reachedPlayLimits(playLimits, use, now);
  const closed = gameState === 'ready' && reached.length > 0;
  if (!closed && boardDealtClosed && gameState === 'ready') {
    newGame();
    return;
  }
  const set = PLAY_LIMIT_KINDS.filter((kind) => Object.hasOwn(playLimits, kind.id));
  playLimitsUse.hidden = set.length === 0;
  playLimitsUse.classList.toggle('reached', reached.length > 0);
  playLimitsUse.textContent = (reached.length > 0 ? 'limit reached: ' : 'today: ')
    + set.map((kind) => playLimitUsePart(kind, playLimits[kind.id], use)).join(' \u00b7 ');
  playLimitClosedNotice.hidden = !closed;
  if (closed) {
    const heading = document.createElement('p');
    heading.className = 'play-limit-heading';
    heading.textContent = 'Done for today';
    const reopens = document.createElement('p');
    reopens.append('new games from ');
    const time = document.createElement('span');
    time.className = 'play-limit-amount';
    time.textContent = PLAY_DAY_START_TEXT;
    reopens.appendChild(time);
    playLimitClosedNotice.replaceChildren(heading,
      ...reached.map((kind) => playLimitClosedLine(kind, playLimits[kind.id], use)), reopens);
  }
  clearTimeout(playLimitChangeTimer);
  playLimitChangeTimer = set.length === 0 ? null
    : setTimeout(renderPlayLimits, nextPlayLimitChange(playLimits, now) - now);
}
