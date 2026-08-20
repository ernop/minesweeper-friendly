'use strict';
// Generates a synthetic exported-traces JSON (same shape as the game's
// "export traces" download) for verifying the analysis pipelines without
// real play: one game, several curved point-to-click movements at ~100Hz
// with pre-click pauses, plus layout and click events.
// Usage: node make_synthetic_trace.js <out.json>

const fs = require('fs');
const out = process.argv[2];
if (!out) throw new Error('usage: node make_synthetic_trace.js <out.json>');

const sampleT = [], sampleX = [], sampleY = [];
const events = [{
  t: 0, kind: 'layout', left: 400, top: 150, width: 216, height: 216,
  boardWidth: 9, boardHeight: 9,
}];

let t = 50;
let x = 300, y = 500;
const targets = [
  { x: 412, y: 162, index: 0 },   // top-left cell
  { x: 604, y: 354, index: 80 },  // bottom-right cell
  { x: 508, y: 258, index: 40 },  // center cell
  { x: 436, y: 306, index: 55 },
];
for (const [k, target] of targets.entries()) {
  // Curved approach: quadratic bezier with a perpendicular bow and slight
  // overshoot, end-decelerating (ease-out), sampled every 10ms + jitter.
  const durMs = 500 + 150 * k;
  const midX = (x + target.x) / 2 - (target.y - y) * 0.25;
  const midY = (y + target.y) / 2 + (target.x - x) * 0.25;
  const steps = Math.round(durMs / 10);
  for (let i = 1; i <= steps; i++) {
    const p = 1 - Math.pow(1 - i / steps, 2); // ease-out
    const q = 1 - p;
    let px = q * q * x + 2 * q * p * midX + p * p * target.x;
    let py = q * q * y + 2 * q * p * midY + p * p * target.y;
    px += (Math.random() - 0.5) * 1.5;
    py += (Math.random() - 0.5) * 1.5;
    t += 10 + (Math.random() - 0.5) * 2;
    sampleT.push(t); sampleX.push(px); sampleY.push(py);
  }
  // Pre-click pause: stillness (no samples), then the click pair.
  t += 180 + 60 * Math.random();
  events.push({ t: t, kind: 'ldown', x: target.x, y: target.y, index: target.index });
  t += 70;
  events.push({ t: t, kind: 'lup', x: target.x, y: target.y, index: target.index });
  x = target.x; y = target.y;
  t += 120;
}

const trace = {
  endedAt: Date.now(),
  mode: '9x9/10',
  outcome: 'win',
  startedAt: Date.now() - Math.round(t),
  sampleT, sampleX, sampleY, events,
};
fs.writeFileSync(out, JSON.stringify([trace]));
console.log('wrote %s: %d samples, %d events, %d clicks',
  out, sampleT.length, events.length,
  events.filter((e) => e.kind === 'lup').length);
