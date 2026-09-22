'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class TestNode {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.children = [];
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }
}

global.document = {
  createElement: (tag) => new TestNode(tag),
  createElementNS: (_namespace, tag) => new TestNode(tag),
};

const source = fs.readFileSync(path.join(__dirname, '..', 'minesweeper.js'), 'utf8');
const start = source.indexOf('// Tick positions for a scatter axis');
const end = source.indexOf('// Bucket wins by the spec');
if (start === -1 || end === -1) throw new Error('scatter section markers not found');
vm.runInThisContext(source.slice(start, end));

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

function textWithClass(node, className) {
  return descendants(node)
    .filter((child) => (child.attributes.class || '').split(' ').includes(className))
    .map((child) => child.textContent);
}

const points = [
  { x: 100, y: 30 },
  { x: 300, y: 35 },
  { x: 500, y: 40 },
];
const neutralAge = () => ({ unit: 's', frac: 0 });
const average = buildScatter(
  points, null, (point) => point.x, (point) => point.y,
  'mouse path', 'avg', '', neutralAge,
  {
    formatX: (value) => value + 'px',
    yTickSuffix: 's',
    neutralDots: true,
  },
);
check('mouse-path ticks carry px',
  textWithClass(average, 'tick-x').every((text) => text.endsWith('px')));
check('average ticks carry seconds',
  textWithClass(average, 'tick-y').every((text) => text.endsWith('s')));
check('average y axis uses avg',
  textWithClass(average, 'scatter-axis-label').includes('\u2192 avg'));

const dated = [
  { x: new Date(2025, 10, 1).getTime(), y: 30 },
  { x: new Date(2026, 2, 1).getTime(), y: 40 },
];
const calendar = buildScatter(
  dated, null, (point) => point.x, (point) => point.y,
  '', 'time', '', neutralAge, { timeAxis: true, neutralDots: true },
);
const calendarSubticks = textWithClass(calendar, 'tick-x-sub');
check('date axis shows a year', calendarSubticks.some((text) => /^\d{4}$/.test(text)));
check('date axis has no redundant date caption',
  !textWithClass(calendar, 'scatter-axis-label').includes('\u2192 date'));

const day = buildScatter(
  [{ x: 0, y: 30 }, { x: 24, y: 40 }],
  null, (point) => point.x, (point) => point.y,
  'time of day', 'time', '', neutralAge,
  {
    xDomain: [0, 24],
    xTicks: [0, 4, 8, 12, 16, 20, 24],
    formatX: (hour) => hour + 'h',
    neutralDots: true,
  },
);
check('time-of-day ticks carry h',
  textWithClass(day, 'tick-x').join(',') === '0h,4h,8h,12h,16h,20h,24h');

console.log(`scatter-axis: all ${checks} checks passed`);
