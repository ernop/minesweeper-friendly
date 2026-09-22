'use strict';
// Known-answer tests for the play heartbeat's threshold arithmetic and
// its host gate: one beacon is owed per five played minutes, owed is
// never negative, and only the production host with sendBeacon support
// sends at all (localhost, file://, and mirrors stay silent).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const startIdx = source.indexOf('//-------PLAY HEARTBEAT');
const endIdx = source.indexOf('//-------SESSION STATS: DISPLAY');
if (startIdx === -1 || endIdx === -1) throw new Error('section markers not found');

// The section reads location/navigator at load (host gate); stub them
// as a non-production origin so nothing schedules or sends under test.
// defineProperty because Node exposes a getter-only global navigator.
const stub = (name, value) => Object.defineProperty(globalThis, name,
  { value, configurable: true, writable: true });
stub('location', { hostname: 'localhost' });
stub('navigator', {});
// The check also reads the session play clock; not exercised here.
globalThis.sessionPlayFrom = null;
vm.runInThisContext(source.slice(startIdx, endIdx));

let checks = 0;
function assertEq(name, actual, want) {
  checks++;
  if (actual !== want) throw new Error(`${name}: got ${actual}, want ${want}`);
}

const MIN5 = 5 * 60 * 1000;
assertEq('no beacon owed below five played minutes',
  heartbeatsOwed(MIN5 - 1, 0), 0);
assertEq('one beacon owed at exactly five minutes',
  heartbeatsOwed(MIN5, 0), 1);
assertEq('owed counts every unsent multiple',
  heartbeatsOwed(17 * 60 * 1000, 1), 2);
assertEq('owed is never negative',
  heartbeatsOwed(60 * 1000, 3), 0);
assertEq('zero play owes nothing', heartbeatsOwed(0, 0), 0);

assertEq('disabled off the production host', heartbeatEnabled(), false);
globalThis.location.hostname = 'fuseki.net';
assertEq('still disabled without sendBeacon support', heartbeatEnabled(), false);
globalThis.navigator.sendBeacon = () => true;
assertEq('enabled on the production host with sendBeacon',
  heartbeatEnabled(), true);
globalThis.location.hostname = 'ernop.github.io';
assertEq('mirrors never send', heartbeatEnabled(), false);

console.log(`heartbeat: all ${checks} checks passed`);
