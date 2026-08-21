'use strict';

const Trial = require('../trial.js');

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  ok  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name);
  }
}

check('square boards get all 8 isometries', Trial.transformsFor(9, 9).length === 8);
check('rectangular boards get 4 isometries', Trial.transformsFor(30, 16).length === 4);

check('rot180 is an involution on 3x2', (() => {
  const mines = [true, false, false, false, true, false];
  const once = Trial.applyMines(mines, 3, 2, 'rot180');
  const twice = Trial.applyMines(once, 3, 2, 'rot180');
  return twice.every((v, i) => v === mines[i]);
})());

check('rot90 cycles a square corner', (() => {
  const mines = [
    true, false, false,
    false, false, false,
    false, false, false,
  ];
  const a = Trial.applyMines(mines, 3, 3, 'rot90');
  return a[2] === true && a[0] === false;
})());

check('schedule is 100 slots, 4 of each identity', (() => {
  let x = 0.3;
  const rng = () => { x = (x * 1.618 + 0.17) % 1; return x; };
  const slots = Trial.buildSchedule(rng);
  if (slots.length !== Trial.GAMES) return false;
  const counts = new Array(Trial.IDENTITIES).fill(0);
  for (const id of slots) counts[id]++;
  return counts.every((c) => c === Trial.REPEATS);
})());

check('session presentation maps first click with the mines', (() => {
  let x = 0.2;
  const rng = () => { x = (x * 1.51 + 0.09) % 1; return x; };
  const session = Trial.createSession('3x3/2', 3, 3, 2, rng);
  const pres = Trial.presentation(session, rng);
  const mines = pres.mines.filter(Boolean).length;
  return mines === 2 && pres.mines[pres.firstClick] === false;
})());

if (failures) {
  console.log(failures + ' failed');
  process.exit(1);
}
console.log('all ok');
