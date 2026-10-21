'use strict';
// Every page that runs game code loads the error bar (page-errors.js) right
// after the Pages redirect, before any other script, so no error escapes it
// (docs/product/ui-doctrine.md, "Errors are shown"). The help page runs no
// game code. tests/page-errors-browser-check.js checks the bar itself.
//
// Usage: node tests/page-errors-test.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PAGES_WITHOUT_CODE = ['just-universe-help.html'];

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html') && !PAGES_WITHOUT_CODE.includes(file));
check('the pages are found', pages.includes('index.html') && pages.length >= 5);
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].map((match) => match[1]);
  check(page + ' loads the Pages redirect, then the error bar, before any other script',
    sources[0] === 'pages-redirect.js' && sources[1] === 'page-errors.js');
}
const helpSources = [...fs.readFileSync(path.join(root, 'just-universe-help.html'), 'utf8')
  .matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].map((match) => match[1]);
check('the help page runs no game code',
  helpSources.every((source) => ['pages-redirect.js', 'fuseki-stats.js'].includes(source)));
const runtimeFiles = JSON.parse(fs.readFileSync(path.join(root, 'deploy', 'runtime-files.json'), 'utf8'));
check('the release ships the error bar', runtimeFiles.includes('page-errors.js'));

console.log(`page-errors-test: ${checks} checks passed`);
