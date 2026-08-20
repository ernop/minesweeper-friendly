'use strict';

const GameRandom = require('../rng.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

check('version is fixed', GameRandom.VERSION === 'xoshiro128ss-v1');

const seed = '00000001000000020000000300000004';
const expected = [
  11520, 0, 5927040, 70819200,
  2031721883, 1637235492, 1287239034, 3734860849,
];
const stream = GameRandom.fromSeed(seed);
const observed = expected.map(() => Math.floor(stream() * 0x100000000));
check('fixed seed has fixed versioned sequence',
  observed.every((value, index) => value === expected[index]));

const first = GameRandom.fromSeed(seed);
const second = GameRandom.fromSeed(seed);
let same = true;
for (let i = 0; i < 1000; i++) {
  if (first() !== second()) same = false;
}
check('independent streams with same seed replay exactly', same);

const generated = GameRandom.createSeed();
check('generated seed is 128-bit lowercase hex', /^[0-9a-f]{32}$/.test(generated));
check('generated seed is accepted', typeof GameRandom.fromSeed(generated) === 'function');

let rejectedZero = false;
try {
  GameRandom.fromSeed('00000000000000000000000000000000');
} catch (error) {
  rejectedZero = error.message === 'all-zero game seed';
}
check('invalid all-zero state is rejected loudly', rejectedZero);

console.log(failures === 0 ? '\nall tests passed' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
