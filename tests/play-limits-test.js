'use strict';
// Daily play limits (docs/product/play-limits.md): the 4:00 play day, the
// day's use from play spans, reached limits, the loosening lock, stored-limit
// validation, and the hooks that keep the game page's spans and gate honest.
//
// Usage: node tests/play-limits-test.js

process.env.TZ = 'America/Los_Angeles';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const game = require('./game-source.js');

const repo = path.join(__dirname, '..');
const settingsCore = fs.readFileSync(path.join(repo, 'settings-core.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(settingsCore.slice(settingsCore.indexOf('const DIFFICULTIES'),
  settingsCore.indexOf('const PATH_VIEW_IDS')), context);
vm.runInContext(fs.readFileSync(path.join(repo, 'play-limits.js'), 'utf8')
  + '\nthis.L = { PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS, PLAY_SPAN_LIVE_MS, playDayStart, nextPlayDayStart,'
  + ' playSpanPlayedMs, playDayUse, playLimitKind, playLimitReached, reachedPlayLimits,'
  + ' nextPlayLimitChange, playLimitLoosens, playLimitLoosenLock, playLimitsFrom,'
  + ' formatPlayLimitDuration, formatPlayLimitMinutes, formatMinuteOfDay };', context);
const L = context.L;

let checks = 0;
// Values from the vm context carry its own Object prototype; compare plain data.
function check(name, actual, expected) {
  checks++;
  assert.deepEqual(actual === undefined ? actual : JSON.parse(JSON.stringify(actual)), expected, name);
}
const at = (y, mo, d, h, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const kind = (id) => L.playLimitKind(id);
const span = (startedAt, playedMs, board = [9, 9, 10], live = false) => ({
  startedAt, lastSeenAt: startedAt + playedMs, endedAt: live ? null : startedAt + playedMs,
  width: board[0], height: board[1], mines: board[2], playMode: 'standard',
});

// The play day.
check('before 4:00 belongs to the previous day', L.playDayStart(at(2026, 10, 13, 3, 59)), at(2026, 10, 12, 4));
check('4:00 starts the day', L.playDayStart(at(2026, 10, 13, 4)), at(2026, 10, 13, 4));
check('late evening is the same day', L.playDayStart(at(2026, 10, 13, 23, 30)), at(2026, 10, 13, 4));
check('the day ends at the next 4:00', L.nextPlayDayStart(at(2026, 10, 14, 1)), at(2026, 10, 14, 4));
check('a fall-back day lasts 25 hours, still 4:00 to 4:00',
  L.nextPlayDayStart(at(2026, 10, 31, 12)) - L.playDayStart(at(2026, 10, 31, 12)), 25 * 3600000);
check('the play day holding a spring-forward night lasts 23 hours',
  L.nextPlayDayStart(at(2026, 3, 7, 12)) - L.playDayStart(at(2026, 3, 7, 12)), 23 * 3600000);

// Spans and the day's use.
const now = at(2026, 10, 13, 22);
check('a finished span counts its own length', L.playSpanPlayedMs(span(now - 60000, 30000), now), 30000);
const live = { ...span(now - 50000, 10000), endedAt: null, lastSeenAt: now - 5000 };
check('a span still being played counts up to now', L.playSpanPlayedMs(live, now), 50000);
const dead = { ...span(now - 600000, 0), endedAt: null, lastSeenAt: now - L.PLAY_SPAN_LIVE_MS - 1 };
check('a span whose tab went quiet counts to its last sighting',
  L.playSpanPlayedMs(dead, now), 600000 - L.PLAY_SPAN_LIVE_MS - 1);
const use = L.playDayUse([
  span(at(2026, 10, 13, 3, 50), 600000),          // yesterday's play day
  span(at(2026, 10, 13, 9), 60000),               // Beginner
  span(at(2026, 10, 13, 10), 120000, [16, 16, 40]),
  span(at(2026, 10, 13, 11), 240000, [30, 16, 99]),
  span(at(2026, 10, 13, 12), 30000, [16, 30, 99]), // Custom: counts only in all games
], now);
check('use counts only spans started this play day', use,
  { playedMs: 450000, games: 4, levelGames: { beginner: 1, intermediate: 1, expert: 1 } });

// Reached limits.
check('play time under its limit', L.playLimitReached(kind('playMinutes'), 8, use, now), false);
check('play time is reached at exactly its limit',
  L.playLimitReached(kind('playMinutes'), 7, { ...use, playedMs: 420000 }, now), true);
check('games count every board', L.playLimitReached(kind('games'), 4, use, now), true);
check('a level counts only its own boards', L.playLimitReached(kind('expertGames'), 2, use, now), false);
const stop23 = 23 * 60;
check('stop time not yet come', L.playLimitReached(kind('stopAt'), stop23, use, at(2026, 10, 13, 22, 59)), false);
check('stop time come', L.playLimitReached(kind('stopAt'), stop23, use, at(2026, 10, 13, 23)), true);
check('stop time holds past midnight', L.playLimitReached(kind('stopAt'), stop23, use, at(2026, 10, 14, 1)), true);
check('stop time ends at 4:00', L.playLimitReached(kind('stopAt'), stop23, use, at(2026, 10, 14, 4)), false);
check('a 1:00 stop time has not come at 23:30',
  L.playLimitReached(kind('stopAt'), 60, use, at(2026, 10, 13, 23, 30)), false);
check('reached limits come in kind order',
  L.reachedPlayLimits({ stopAt: 21 * 60, games: 4, playMinutes: 600 }, use, now).map((k) => k.id),
  ['games', 'stopAt']);
check('the next change is the stop time when it comes first',
  L.nextPlayLimitChange({ stopAt: stop23 }, now), at(2026, 10, 13, 23));
check('the next change is 4:00 without a stop time', L.nextPlayLimitChange({ games: 5 }, now), at(2026, 10, 14, 4));
check('after the stop time the next change is 4:00',
  L.nextPlayLimitChange({ stopAt: stop23 }, at(2026, 10, 13, 23, 30)), at(2026, 10, 14, 4));

// Loosening.
check('adding a limit never loosens', L.playLimitLoosens(kind('games'), undefined, 50), false);
check('lowering does not loosen', L.playLimitLoosens(kind('games'), 50, 40), false);
check('raising loosens', L.playLimitLoosens(kind('games'), 50, 60), true);
check('removing loosens', L.playLimitLoosens(kind('games'), 50, undefined), true);
check('a later stop time loosens', L.playLimitLoosens(kind('stopAt'), stop23, 23 * 60 + 30), true);
check('a stop time past midnight is later', L.playLimitLoosens(kind('stopAt'), stop23, 60), true);
check('an earlier stop time does not loosen', L.playLimitLoosens(kind('stopAt'), 60, stop23), false);
const fresh = { playedMs: L.PLAY_LIMIT_LOOSEN_MAX_PLAYED_MS, games: 3, levelGames: { beginner: 3, intermediate: 0, expert: 0 } };
check('exactly two minutes played still allows loosening',
  L.playLimitLoosenLock(kind('playMinutes'), { playMinutes: 30 }, fresh, now), null);
check('more than two minutes played locks loosening',
  L.playLimitLoosenLock(kind('playMinutes'), { playMinutes: 30 }, { ...fresh, playedMs: fresh.playedMs + 1 }, now),
  'played');
check('a reached limit locks loosening even under two minutes',
  L.playLimitLoosenLock(kind('beginnerGames'), { beginnerGames: 3 }, fresh, now), 'reached');
check('a reached one-minute play limit is locked',
  L.playLimitLoosenLock(kind('playMinutes'), { playMinutes: 1 }, { ...fresh, playedMs: 60000 }, now), 'reached');
check('a stop time that has come is locked',
  L.playLimitLoosenLock(kind('stopAt'), { stopAt: 21 * 60 }, fresh, now), 'reached');

// Stored limits are never silently dropped.
check('no stored limits is no limit', L.playLimitsFrom(undefined), {});
check('valid limits load', L.playLimitsFrom({ playMinutes: 30, stopAt: 0 }), { playMinutes: 30, stopAt: 0 });
assert.throws(() => L.playLimitsFrom({ playMinutes: 0 }), /playMinutes is invalid/);
assert.throws(() => L.playLimitsFrom({ games: 2.5 }), /games is invalid/);
assert.throws(() => L.playLimitsFrom({ weeklyGames: 5 }), /unknown play limit/);
assert.throws(() => L.playLimitsFrom([]), /not an object/);
checks += 4;

// Presentation.
check('seconds', L.formatPlayLimitDuration(45999), '45s');
check('minutes and seconds', L.formatPlayLimitDuration(754000), '12m 34s');
check('hours and minutes', L.formatPlayLimitDuration(3900000), '1h 05m');
check('limit minutes', [30, 60, 90].map(L.formatPlayLimitMinutes), ['30m', '1h', '1h 30m']);
check('clock times', [0, 240, 1380].map(L.formatMinuteOfDay), ['0:00', '4:00', '23:00']);

// The game page's hooks.
const js = game.source;
const body = (name) => {
  const start = js.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' not found');
  return js.slice(start, js.indexOf('\n}\n', start));
};
check('every board going into play opens a span', body('startTimer').includes('playSpanBegin();'), true);
check('a finished board closes its span', body('finish').includes('playSpanEnd();'), true);
check('a restarted board closes its span', body('newGame').includes('playSpanEnd();'), true);
check('an ended trial closes its span', body('endTrial').includes('playSpanEnd();'), true);
check('reveal and flag refuse to start a board while closed',
  ['revealCell', 'toggleFlag'].every((name) => body(name).includes('playLimitBlocksStart()')), true);
check('board presses refuse to start a board while closed',
  (js.match(/playLimitBlocksStart\(\)/g) || []).length >= 6, true);
check('modes that deal an opened board skip the deal while closed',
  /!boardDealtClosed && Trial\.isPlayMode/.test(body('newGame'))
    && /!boardDealtClosed && pregenActive\(\)/.test(body('newGame')), true);
check('a hidden or closing tab saves its board\u2019s progress',
  (js.match(/savePlaySpanProgress\(\);/g) || []).length, 2);
check('limits are not a preference, so a preferences import cannot lift one',
  /field: 'playLimits'/.test(settingsCore) || /playMinutes/.test(settingsCore), false);

console.log(`play-limits: all ${checks} checks passed`);
