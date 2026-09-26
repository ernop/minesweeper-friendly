'use strict';
// Every page that loads storage.js must use the same cache tag: a page left
// on a stale copy would open an older database version and fail
// (AGENTS.md, runtime paragraph).
//
// Usage: node tests/storage-cache-tag-test.js

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const tags = new Map();
for (const name of fs.readdirSync(repo).filter((file) => file.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(repo, name), 'utf8');
  for (const match of html.matchAll(/src="storage\.js(\?v=[^"]*)?"/g)) tags.set(name, match[1] || '(none)');
}
const distinct = new Set(tags.values());
for (const [name, tag] of tags) console.log('  ' + name + ' ' + tag);
if (tags.size < 2 || distinct.size !== 1) {
  console.log(tags.size < 2 ? 'FAIL  fewer than two pages load storage.js' : 'FAIL  storage.js cache tags differ');
  process.exit(1);
}
console.log('\nall tests passed');
