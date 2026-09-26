'use strict';
// Prints recorded latency-monitor runs side by side, oldest to newest, with
// each metric's budget, so a trend or regression shows at a glance.
//
// node tests/latency-history.js [firefox|chromium] [RUNS]
const fs = require('node:fs');
const path = require('node:path');

const browser = ['firefox', 'chromium'].includes(process.argv[2]) ? process.argv[2] : null;
const count = Number(process.argv[browser ? 3 : 2] || 8);
const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, 'latency-budgets.json'), 'utf8')).budgets;
const runs = fs.readFileSync(path.join(__dirname, 'latency-history.jsonl'), 'utf8').trim().split('\n')
  .filter(Boolean).map((line) => JSON.parse(line))
  .filter((run) => browser === null || run.browser === browser).slice(-count);

const width = 13;
const cell = (text) => String(text).padStart(width);
const header = (label, budget, of) => console.log(label.padEnd(24) + cell(budget) + runs.map((run) => cell(of(run))).join(''));
header('run (UTC)', 'budget', (run) => run.date.slice(5, 16).replace('T', ' '));
header('commit', '', (run) => run.commit + (run.dirty ? '*' : ''));
header('browser', '', (run) => run.browser + (run.quick ? ' q' : ''));
for (const name of Object.keys(budgets)) {
  console.log(name.padEnd(24) + cell(budgets[name]) + runs.map((run) => {
    const value = run.metrics[name];
    return cell(value === undefined ? '' : value + (value > budgets[name] ? '!' : ''));
  }).join(''));
}
console.log('* uncommitted changes   q quick scenario   ! over the current budget');
