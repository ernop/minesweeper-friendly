'use strict';

// Daily play limits on the game page: the play spans (this tab's saved while
// each board plays and shared live with other tabs, every saved one held for
// the session results' abandoned boards), the gate that keeps a
// new board from starting while the day is closed, the no-flags penalty
// stage, the notice over a closed board, and today's use in the top bar (in
// view during play, where a refused flag press flashes it; the limits link
// is in the settings row at the page foot). The rules are the pure
// play-limits.js; limits and the penalty are set only on the settings page.

//-------DAILY PLAY LIMITS-------

let playLimits = null;          // userdata 'playLimits', filled by userdataReady
let playLimitPenalty = null;    // userdata 'playLimitPenalty', a penalty id
const playSpans = new Map();    // startedAt -> span: every saved span, kept current from every tab
let currentPlaySpan = null;     // this tab's board in play, or null
let playSpanHeartbeat = null;
let playLimitChangeTimer = null;
// The ready board was dealt while closed, so modes that open their board
// themselves (3BV countdown, trials with a given opening) skipped the deal.
let boardDealtClosed = false;
// Fixed when the board goes into play: a board keeps the permission it
// started with, as a board in play always finishes.
let boardFlagsBlocked = false;
let flagRefusedTimer = null;
const playLimitsChannel = new BroadcastChannel(PLAY_LIMITS_CHANNEL);
const playLimitsUse = document.getElementById('play-limits-use');
const playLimitClosedNotice = document.getElementById('play-limit-closed');

function loadPlayLimits(stored, storedPenalty, spans) {
  playLimits = playLimitsFrom(stored);
  playLimitPenalty = playLimitPenaltyFrom(storedPenalty);
  for (const span of spans) playSpans.set(span.startedAt, span);
  playLimitsChannel.addEventListener('message', ({ data }) => {
    if (data.span !== undefined) playSpans.set(data.span.startedAt, data.span);
    if (data.limits !== undefined) playLimits = playLimitsFrom(data.limits);
    if (data.penalty !== undefined) playLimitPenalty = playLimitPenaltyFrom(data.penalty);
    renderPlayLimits();
  });
}

function playDayStageNow() {
  const now = Date.now();
  return playDayStage(playLimits, playLimitPenalty, playDayUse(playSpans.values(), now), now);
}

// A board already in play always finishes; only starting one is refused.
function playLimitBlocksStart() {
  return gameState === 'ready' && playDayStageNow() === 'closed';
}

// A ready board follows the day's stage as it changes; once in play, the
// board keeps what it started with. Removing a flag stays allowed, so a
// flag placed earlier never locks its square shut.
function flagPlacementBlocked() {
  return gameState === 'ready' ? playDayStageNow() === 'no-flags' : boardFlagsBlocked;
}

// The refused press gets no board change, so today's use, which names the
// no-flags stage, answers it.
function showFlagRefused() {
  playLimitsUse.classList.add('refused');
  clearTimeout(flagRefusedTimer);
  flagRefusedTimer = setTimeout(() => playLimitsUse.classList.remove('refused'), 1200);
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
  boardFlagsBlocked = playDayStageNow() === 'no-flags';
  const now = Date.now();
  currentPlaySpan = {
    startedAt: now, lastSeenAt: now, endedAt: null,
    width: config.width, height: config.height, mines: config.mines, playMode: settings.playMode,
    ...(gameGenerator.id === BoardGenerators.DEFAULT_ID ? {}
      : { generator: { id: gameGenerator.id, params: { ...gameGenerator.params } } }),
    ending: null,
  };
  savePlaySpan(currentPlaySpan);
  playSpanHeartbeat = setInterval(touchPlaySpan, PLAY_SPAN_HEARTBEAT_MS);
  renderPlayLimits();
}

// Called when a board leaves play, with how (PLAY_SPAN_ENDINGS): finished,
// restarted, or cut off by its trial's end.
function playSpanEnd(ending) {
  if (currentPlaySpan === null) return;
  clearInterval(playSpanHeartbeat);
  playSpanHeartbeat = null;
  const now = Date.now();
  currentPlaySpan.lastSeenAt = now;
  currentPlaySpan.endedAt = now;
  currentPlaySpan.ending = ending;
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

// The no-flags part a reached count or time limit adds under the default
// penalty: " and 15m without flags".
function playLimitNoFlagsText(kind, value) {
  return playLimitPenalty === 'closed' ? ''
    : ' and ' + formatPlayLimitAmount(kind, playLimitNoFlagsAmount(kind, value)) + ' without flags';
}

function playLimitUsePart(kind, value, use, stage) {
  if (kind.type === 'clock') return 'stop ' + formatMinuteOfDay(value);
  const part = (kind.type === 'minutes' ? formatPlayLimitDuration(use.playedMs) + ' of ' + formatPlayLimitMinutes(value)
    : playLimitUsed(kind, use) + ' of ' + value + ' ' + kind.label);
  if (stage === 'no-flags') {
    return part + ', closes at ' + formatPlayLimitAmount(kind, playLimitClosingUse(kind, value, playLimitPenalty));
  }
  return stage === 'closed' ? part + playLimitNoFlagsText(kind, value) : part;
}

function playLimitClosedLine(kind, value, use) {
  const line = document.createElement('p');
  const amount = document.createElement('span');
  amount.className = 'play-limit-amount';
  if (kind.type === 'minutes') {
    amount.textContent = formatPlayLimitDuration(use.playedMs);
    line.append(amount, ' played of ' + formatPlayLimitMinutes(value) + playLimitNoFlagsText(kind, value));
  } else if (kind.type === 'games') {
    amount.textContent = playLimitUsed(kind, use) + ' of ' + value;
    line.append(amount, ' ' + kind.label + playLimitNoFlagsText(kind, value));
  } else {
    amount.textContent = formatMinuteOfDay(value);
    line.append('stop time ', amount);
  }
  return line;
}

const PLAY_LIMIT_USE_PREFIX = { open: 'today: ', 'no-flags': 'no flags: ', closed: 'limit reached: ' };

function renderPlayLimits() {
  const now = Date.now();
  const use = playDayUse(playSpans.values(), now);
  const set = PLAY_LIMIT_KINDS.filter((kind) => Object.hasOwn(playLimits, kind.id));
  const stages = new Map(set.map((kind) => [kind,
    playLimitStage(kind, playLimits[kind.id], playLimitPenalty, use, now)]));
  const dayStage = playDayStage(playLimits, playLimitPenalty, use, now);
  const closed = gameState === 'ready' && dayStage === 'closed';
  if (!closed && boardDealtClosed && gameState === 'ready') {
    newGame();
    return;
  }
  playLimitsUse.hidden = set.length === 0;
  playLimitsUse.classList.toggle('reached', dayStage !== 'open');
  playLimitsUse.textContent = PLAY_LIMIT_USE_PREFIX[dayStage] + set.map((kind) =>
    playLimitUsePart(kind, playLimits[kind.id], use, stages.get(kind))).join(' \u00b7 ');
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
      ...set.filter((kind) => stages.get(kind) === 'closed')
        .map((kind) => playLimitClosedLine(kind, playLimits[kind.id], use)), reopens);
  }
  clearTimeout(playLimitChangeTimer);
  playLimitChangeTimer = set.length === 0 ? null
    : setTimeout(renderPlayLimits, nextPlayLimitChange(playLimits, now) - now);
}
