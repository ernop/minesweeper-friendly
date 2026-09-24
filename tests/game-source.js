'use strict';
// The game page's own scripts (game/*.js), in index.html load order. Tests
// extract spans by section marker or function name from `source`, the files
// concatenated in that order, so a span keeps working when its code moves
// between files.
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script defer src="(game\/[^"?]+\.js)\?/g)].map((match) => match[1]);
if (files.length === 0) throw new Error('index.html loads no game/ scripts');

const texts = files.map((file) => fs.readFileSync(path.join(repo, file), 'utf8'));
module.exports = { files, texts, source: texts.join('\n') };
