'use strict';
// Prints the recorded latency checks, oldest to newest, against the budgets.
// node tests/latency-history.js [RUNS]
const fs = require('node:fs');
const path = require('node:path');

const count = Number(process.argv[2] || 10);
const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, 'latency-budgets.json'), 'utf8')).budgets;
const runs = fs.readFileSync(path.join(__dirname, 'latency-history.jsonl'), 'utf8').trim().split('\n')
  .filter(Boolean).map((line) => JSON.parse(line)).slice(-count);
const cell = (text) => String(text).padStart(14);
console.log('date (UTC)'.padEnd(20) + cell('budget') + runs.map((run) => cell(run.date.slice(5, 16).replace('T', ' '))).join(''));
console.log('commit'.padEnd(20) + cell('') + runs.map((run) => cell(run.commit + (run.dirty ? '*' : ''))).join(''));
console.log('browser'.padEnd(20) + cell('') + runs.map((run) => cell(run.browser.split('.')[0])).join(''));
for (const name of Object.keys(budgets)) {
  console.log(name.padEnd(20) + cell(budgets[name]) + runs.map((run) =>
    cell(run.metrics[name] === undefined ? '' : run.metrics[name] + (run.metrics[name] > budgets[name] ? '!' : ''))).join(''));
}
console.log('* uncommitted changes   ! over budget');
