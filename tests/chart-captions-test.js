'use strict';
// No text narrates what a chart's marks are (creator 2026-10-08: "'Green
// line: this game. Ticks under a lifetime or board strip: this session's
// games.' and similar rather pointless text shall not appear in this
// project"; docs/product/ui-doctrine.md). Every shipped script's string
// literals and every shipped page's text and attribute values are searched
// for a mark used as a key ("Green line: ...", "Ticks under a lifetime strip:
// ...", "its own dot: ...") and for the removed phrasings. A legend that
// decodes an arbitrary code ("dashed = no cursor samples", the age palette's
// "dot color = ...") is a semantic legend the doctrine keeps, so "=" is not
// matched.

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const MARK = String.raw`(?:(?:green|red|blue|teal|purple|black|white|gray|grey|dashed|dotted|thick|thin)\s+)?`
  + String.raw`(?:lines?|dots?|ticks?|bars?|rings?|marks?|strips?|swatch(?:es)?)`;
const PLACE = String.raw`(?:\s+(?:under|on|over|in|across|beside|above|below|along)\b[^:]*)?`;
const NARRATION = [
  new RegExp(String.raw`\b${MARK}${PLACE}:\s+[a-z]`, 'i'),
  /\bEach bar spans\b/i,
  /\bOne (?:dot|bar) per (?:win|game|board|value)\b/i,
  /\bacross is\b/i,
];

// A literal never opens right after a letter, as the apostrophe in a
// comment's "game's" does.
function scriptTexts(source) {
  return source.match(/(?<!\w)(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)/g) || [];
}

function pageTexts(source) {
  const markup = source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
  const attributes = markup.match(/"[^"]*"|'[^']*'/g) || [];
  return [markup.replace(/<[^>]*>/g, ' '), ...attributes];
}

const files = require('../deploy/runtime-files.json').filter((file) => /\.(js|html)$/.test(file));
if (!files.includes('game/game-data-chart.js') || !files.includes('index.html')) {
  throw new Error('deploy/runtime-files.json no longer lists the game page and its game data chart');
}
const found = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  for (const text of file.endsWith('.html') ? pageTexts(source) : scriptTexts(source)) {
    for (const pattern of NARRATION) {
      const match = text.match(pattern);
      if (match) found.push(file + ': ' + JSON.stringify(text.slice(Math.max(0, match.index - 30), match.index + 60)));
    }
  }
}
if (found.length) throw new Error('text narrates chart marks:\n' + found.join('\n'));

const caught = ['Green line: this game.', 'Ticks under a lifetime strip: this session’s games.',
  'Ticks: this session’s wins.', 'Every win is its own dot: across is the game’s value', 'One dot per win.',
  'Each bar spans 0.834s.'];
for (const text of caught) {
  if (!NARRATION.some((pattern) => pattern.test(text))) throw new Error('a removed caption is not caught: ' + text);
}
const kept = ['dashed = no cursor samples', 'dot color = how long ago that win was (dots fade as they age within a color):',
  'one dot per cell \u2014 the count lives only in the color', 'left-button release'];
for (const text of kept) {
  if (NARRATION.some((pattern) => pattern.test(text))) throw new Error('a legend or option text is caught: ' + text);
}
console.log(`chart-captions: ${files.length} shipped files narrate no chart marks; ${caught.length} removed captions caught, ${kept.length} legends kept`);
