'use strict';

//-------DAILY PLAY LIMITS (pure; loaded by the game and settings pages)-------

// Limits the player sets on their own play (requested 2026-10-12): game time,
// games on every board, games per named level, and a stop time, all per play
// day. A play day runs from 4:00 local time to the next 4:00, so late-night
// play belongs to the evening it started in. Spec:
// docs/product/play-limits.md. Needs DIFFICULTIES from settings-core.js.

const PLAY_DAY_START_HOUR = 4;
// Raising or removing a limit works only while the day's play is at most
// this long and that limit is not reached.
const PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS = 2 * 60 * 1000;
// A board in play rewrites its span this often, so a closed tab or a crash
// loses at most this much of the day's play time.
const PLAY_SPAN_HEARTBEAT_MS = 5000;
// An unfinished span seen this recently is still being played in some tab.
// Browsers slow a hidden tab's timers to once a minute, hence the margin.
const PLAY_SPAN_LIVE_MS = 70 * 1000;
const PLAY_LIMITS_CHANNEL = 'minesweeper-friendly-play-limits';
const PLAY_LIMIT_LEVELS = ['beginner', 'intermediate', 'expert'];
const PLAY_LIMIT_MAX_MINUTES = 24 * 60;
const PLAY_LIMIT_MAX_GAMES = 10000;

const PLAY_LIMIT_KINDS = [
  { id: 'playMinutes', label: 'play time', type: 'minutes',
    describe: 'game time on every board, from the first click to the end, finished or abandoned' },
  { id: 'games', label: 'games', type: 'games', level: null,
    describe: 'boards started on every level, Custom and every mode included, finished or abandoned' },
  { id: 'beginnerGames', label: 'Beginner games', type: 'games', level: 'beginner',
    describe: 'boards started on Beginner (9 x 9, 10 mines) in any mode' },
  { id: 'intermediateGames', label: 'Intermediate games', type: 'games', level: 'intermediate',
    describe: 'boards started on Intermediate (16 x 16, 40 mines) in any mode' },
  { id: 'expertGames', label: 'Expert games', type: 'games', level: 'expert',
    describe: 'boards started on Expert (30 x 16, 99 mines) in any mode' },
  { id: 'stopAt', label: 'stop time', type: 'clock',
    describe: 'no new board from this time of day until the play day ends at 4:00' },
];
const PLAY_LIMIT_KIND_BY_ID = new Map(PLAY_LIMIT_KINDS.map((kind) => [kind.id, kind]));

// What reaching a limit does (creator request 2026-10-14). The default first
// takes away placing flags for half the limit again, then closes the board;
// the other closes it at once. One choice covers every limit.
const PLAY_LIMIT_PENALTIES = [
  { id: 'no-flags-first', label: 'no flags first',
    describe: 'no new flags for half the limit again (half the minutes, or half the games rounded up), then no new boards' },
  { id: 'closed', label: 'closed at once', describe: 'no new boards as soon as a limit is reached' },
];
const DEFAULT_PLAY_LIMIT_PENALTY = 'no-flags-first';
const PLAY_LIMIT_PENALTY_BY_ID = new Map(PLAY_LIMIT_PENALTIES.map((penalty) => [penalty.id, penalty]));

function playLimitPenaltySpec(id) {
  const penalty = PLAY_LIMIT_PENALTY_BY_ID.get(id);
  if (penalty === undefined) throw new Error('unknown play limit penalty: ' + id);
  return penalty;
}

// userdata 'playLimitPenalty': a penalty id; absent until the player first
// changes it, which leaves the default.
function playLimitPenaltyFrom(stored) {
  if (stored === undefined) return DEFAULT_PLAY_LIMIT_PENALTY;
  return playLimitPenaltySpec(stored).id;
}

function playLimitKind(id) {
  const kind = PLAY_LIMIT_KIND_BY_ID.get(id);
  if (kind === undefined) throw new Error('unknown play limit: ' + id);
  return kind;
}

function validPlayLimitValue(kind, value) {
  if (!Number.isInteger(value)) return false;
  if (kind.type === 'minutes') return value >= 1 && value <= PLAY_LIMIT_MAX_MINUTES;
  if (kind.type === 'games') return value >= 1 && value <= PLAY_LIMIT_MAX_GAMES;
  return value >= 0 && value < 24 * 60;
}

// userdata 'playLimits': limit id to value; an absent id is no limit. A stored
// value this build cannot read is never dropped, since dropping it would
// silently lift a limit the player committed to.
function playLimitsFrom(stored) {
  if (stored === undefined) return {};
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('stored play limits are not an object');
  }
  for (const [id, value] of Object.entries(stored)) {
    if (!validPlayLimitValue(playLimitKind(id), value)) {
      throw new Error('stored play limit ' + id + ' is invalid: ' + JSON.stringify(value));
    }
  }
  return { ...stored };
}

//-------PLAY DAY-------

// The most recent local 4:00 at or before nowMs.
function playDayStart(nowMs) {
  const d = new Date(nowMs);
  if (d.getHours() < PLAY_DAY_START_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(PLAY_DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

function nextPlayDayStart(nowMs) {
  const d = new Date(playDayStart(nowMs));
  d.setDate(d.getDate() + 1);
  d.setHours(PLAY_DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

// Minutes from 4:00 to a local time of day given as minutes after midnight;
// the play day's order, in which 1:00 comes after 23:00.
function playDayMinuteOf(minuteOfDay) {
  return (minuteOfDay - PLAY_DAY_START_HOUR * 60 + 24 * 60) % (24 * 60);
}

function minuteOfDayAt(nowMs) {
  const d = new Date(nowMs);
  return d.getHours() * 60 + d.getMinutes();
}

// The next moment a stop time begins, strictly after nowMs.
function nextStopAtStart(minuteOfDay, nowMs) {
  const d = new Date(nowMs);
  d.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}

//-------PLAY SPANS AND THE DAY'S USE-------

// A play span is one board from the moment it went into play (first click,
// or the deal in modes that open the board themselves) to its end: won,
// lost, restarted, or its tab closed. Stored per board in the playSpans
// store: { startedAt, lastSeenAt, endedAt (null while in play), width,
// height, mines, playMode }.
function playSpanPlayedMs(span, nowMs) {
  if (span.endedAt !== null) return span.endedAt - span.startedAt;
  const live = nowMs - span.lastSeenAt <= PLAY_SPAN_LIVE_MS;
  return (live ? nowMs : span.lastSeenAt) - span.startedAt;
}

function playLevelOf(width, height, mines) {
  for (const level of PLAY_LIMIT_LEVELS) {
    const board = DIFFICULTIES[level];
    if (board.width === width && board.height === height && board.mines === mines) return level;
  }
  return null;
}

// Today's use, counted from the spans that started in this play day; a board
// that crosses 4:00 belongs wholly to the day it started in.
function playDayUse(spans, nowMs) {
  const from = playDayStart(nowMs);
  const use = { playedMs: 0, games: 0, levelGames: { beginner: 0, intermediate: 0, expert: 0 } };
  for (const span of spans) {
    if (span.startedAt < from) continue;
    use.playedMs += playSpanPlayedMs(span, nowMs);
    use.games++;
    const level = playLevelOf(span.width, span.height, span.mines);
    if (level !== null) use.levelGames[level]++;
  }
  return use;
}

// What a kind has used today, in its own unit (ms, games); the stop time
// uses nothing.
function playLimitUsed(kind, use) {
  if (kind.type === 'minutes') return use.playedMs;
  if (kind.type === 'games') return kind.level === null ? use.games : use.levelGames[kind.level];
  return null;
}

function playLimitReached(kind, value, use, nowMs) {
  if (kind.type === 'minutes') return use.playedMs >= value * 60000;
  if (kind.type === 'games') return playLimitUsed(kind, use) >= value;
  return playDayMinuteOf(minuteOfDayAt(nowMs)) >= playDayMinuteOf(value);
}

// The set limits that are reached now, in PLAY_LIMIT_KINDS order.
function reachedPlayLimits(limits, use, nowMs) {
  return PLAY_LIMIT_KINDS.filter((kind) => Object.hasOwn(limits, kind.id)
    && playLimitReached(kind, limits[kind.id], use, nowMs));
}

// The no-flags stage of the default penalty: half the limit again, in the
// kind's own unit (ms, games). Games round up, so a limit of 1 still gets
// one game without flags. A stop time has no amount to halve.
function playLimitNoFlagsAmount(kind, value) {
  if (kind.type === 'minutes') return value * 30000;
  if (kind.type === 'games') return Math.ceil(value / 2);
  return 0;
}

// The use at which a reached count or time limit stops new boards, in the
// unit playLimitUsed reports.
function playLimitClosingUse(kind, value, penalty) {
  const limit = kind.type === 'minutes' ? value * 60000 : value;
  return penalty === 'closed' ? limit : limit + playLimitNoFlagsAmount(kind, value);
}

// One limit's stage now: 'open' (not reached), 'no-flags' (reached, under
// the default penalty, short of its closing use), or 'closed'. A stop time
// closes at once under either penalty.
function playLimitStage(kind, value, penalty, use, nowMs) {
  if (!playLimitReached(kind, value, use, nowMs)) return 'open';
  if (kind.type === 'clock') return 'closed';
  return playLimitUsed(kind, use) >= playLimitClosingUse(kind, value, penalty) ? 'closed' : 'no-flags';
}

// The day's stage, the strictest among the set limits. 'closed' keeps a new
// board from starting; 'no-flags' deals boards on which no flag can be
// placed. A board already in play keeps what it started with.
function playDayStage(limits, penalty, use, nowMs) {
  let stage = 'open';
  for (const kind of PLAY_LIMIT_KINDS) {
    if (!Object.hasOwn(limits, kind.id)) continue;
    const kindStage = playLimitStage(kind, limits[kind.id], penalty, use, nowMs);
    if (kindStage === 'closed') return 'closed';
    if (kindStage === 'no-flags') stage = 'no-flags';
  }
  return stage;
}

// When the reached set can next change without any play: the next 4:00 or
// the next stop time, whichever is sooner.
function nextPlayLimitChange(limits, nowMs) {
  const dayEnd = nextPlayDayStart(nowMs);
  if (!Object.hasOwn(limits, 'stopAt')) return dayEnd;
  return Math.min(dayEnd, nextStopAtStart(limits.stopAt, nowMs));
}

//-------CHANGING A LIMIT-------

// Whether replacing oldValue with newValue (undefined = no limit) lets the
// player play more. Adding a limit or lowering one never does.
function playLimitLoosens(kind, oldValue, newValue) {
  if (oldValue === undefined) return false;
  if (newValue === undefined) return true;
  if (kind.type === 'clock') return playDayMinuteOf(newValue) > playDayMinuteOf(oldValue);
  return newValue > oldValue;
}

// Why loosening this limit is refused right now, or null when it is allowed:
// 'played' when more than two minutes were played today, 'reached' when the
// limit itself is reached.
function playLimitLoosenLock(kind, limits, use, nowMs) {
  if (use.playedMs > PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS) return 'played';
  if (Object.hasOwn(limits, kind.id) && playLimitReached(kind, limits[kind.id], use, nowMs)) {
    return 'reached';
  }
  return null;
}

// Going from closing at once to no flags first lets the player play more;
// the other way never does.
function playLimitPenaltyLoosens(oldId, newId) {
  return oldId === 'closed' && newId !== 'closed';
}

// The same rule as a limit's: refused once more than two minutes were
// played today ('played'), or while any set limit is reached ('reached').
function playLimitPenaltyLoosenLock(limits, use, nowMs) {
  if (use.playedMs > PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS) return 'played';
  return reachedPlayLimits(limits, use, nowMs).length > 0 ? 'reached' : null;
}

//-------PRESENTATION (shared by both pages)-------

function formatPlayLimitDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  if (hours > 0) return hours + 'h ' + String(minutes).padStart(2, '0') + 'm';
  if (minutes > 0) return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
  return seconds + 's';
}

function formatPlayLimitMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return rest + 'm';
  return rest === 0 ? hours + 'h' : hours + 'h ' + String(rest).padStart(2, '0') + 'm';
}

function formatMinuteOfDay(minuteOfDay) {
  return Math.floor(minuteOfDay / 60) + ':' + String(minuteOfDay % 60).padStart(2, '0');
}

function formatPlayLimitValue(kind, value) {
  if (kind.type === 'minutes') return formatPlayLimitMinutes(value);
  if (kind.type === 'games') return String(value);
  return formatMinuteOfDay(value);
}

// An amount in a count or time kind's own unit (ms, games): "45m", "22m 30s",
// "75".
function formatPlayLimitAmount(kind, amount) {
  if (kind.type === 'games') return String(amount);
  return amount % 60000 === 0 ? formatPlayLimitMinutes(amount / 60000) : formatPlayLimitDuration(amount);
}

function formatPlayLimitUsed(kind, use) {
  if (kind.type === 'minutes') return formatPlayLimitDuration(use.playedMs);
  if (kind.type === 'games') return String(playLimitUsed(kind, use));
  return '';
}

const PLAY_DAY_START_TEXT = formatMinuteOfDay(PLAY_DAY_START_HOUR * 60);
