'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages-redirect.js'), 'utf8');
const pages = [
  'index.html',
  'settings.html',
  'self-check.html',
  'training.html',
  'problems.html',
  'just-universe-help.html',
];

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

function visit(url) {
  const parsed = new URL(url);
  const replaced = [];
  const location = {
    hostname: parsed.hostname,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    replace(next) { replaced.push(next); },
  };
  vm.runInNewContext(source, { location });
  return { replaced };
}

{
  const home = visit('https://ernop.github.io/minesweeper-friendly/');
  check('project root goes to the fuseki root',
    home.replaced.length === 1
    && home.replaced[0] === 'https://minesweeper-friendly.fuseki.net/');
  const deep = visit('https://ernop.github.io/minesweeper-friendly/settings.html?from=pages#scores');
  check('a deep link keeps its path, query, and hash',
    deep.replaced[0] === 'https://minesweeper-friendly.fuseki.net/settings.html?from=pages#scores');
  const bare = visit('https://ernop.github.io/minesweeper-friendly');
  check('a prefix without a slash still reaches the root',
    bare.replaced[0] === 'https://minesweeper-friendly.fuseki.net/');
}

for (const url of [
  'https://minesweeper-friendly.fuseki.net/',
  'https://minesweeper-friendly.fuseki.net/settings.html',
  'http://127.0.0.1:8018/',
  'http://127.0.0.1:8099/training.html',
]) {
  const stayed = visit(url);
  check(url + ' is not redirected', stayed.replaced.length === 0);
}

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  check(page + ' loads the redirect first',
    scripts.length > 0
    && /src="pages-redirect\.js/.test(scripts[0][0])
    && !/\bdefer\b/.test(scripts[0][1])
    && !/\basync\b/.test(scripts[0][1]));
}

console.log(`pages-redirect: all ${checks} checks passed`);
