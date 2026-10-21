'use strict';
// Player text uses plain words, never coined terms the creator has not
// approved (creator 2026-10-21: "never use phrases like 'pocket' which I
// haven't approved, with players"; docs/product/ui-doctrine.md). Every
// shipped script's prose string literals (those with a space; identifiers
// such as the stored 'sealed-pocket-mercy-v1' version have none) and every
// shipped page's text and attribute values are searched for the terms
// A Just Universe's text used before that decision.

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const COINED = [
  /\bpockets?\b/i,
  /\bsealed\b/i,
  /\bbare[- ](?:clicks?|clicked|entr(?:y|ies))\b/i,
];

// A literal never opens right after a letter, as the apostrophe in a
// comment's "game's" does.
function scriptTexts(source) {
  return (source.match(/(?<!\w)(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)/g) || [])
    .filter((text) => /\s/.test(text));
}

function pageTexts(source) {
  const markup = source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
  const attributes = markup.match(/"[^"]*"|'[^']*'/g) || [];
  return [markup.replace(/<[^>]*>/g, ' '), ...attributes];
}

const files = require('../deploy/runtime-files.json').filter((file) => /\.(js|html)$/.test(file));
for (const required of ['settings-core.js', 'game/evaluation.js', 'just-universe-help.html']) {
  if (!files.includes(required)) throw new Error('deploy/runtime-files.json no longer lists ' + required);
}
const found = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  for (const text of file.endsWith('.html') ? pageTexts(source) : scriptTexts(source)) {
    for (const pattern of COINED) {
      const match = text.match(pattern);
      if (match) found.push(file + ': ' + JSON.stringify(text.slice(Math.max(0, match.index - 40), match.index + 60)));
    }
  }
}
if (found.length) throw new Error('player text uses an unapproved coined term:\n' + found.join('\n'));

const caught = ['a bare click into a truly unknowable pocket never kills you',
  'when you bare-click into a sealed pocket', 'bare entries into certified sealed pockets'];
for (const text of caught) {
  if (!COINED.some((pattern) => pattern.test(text))) throw new Error('a removed phrasing is not caught: ' + text);
}
const kept = ['a bare colored dot', 'a guess that nothing else on the board could ever settle, like a boxed-in 50/50'];
for (const text of kept) {
  if (COINED.some((pattern) => pattern.test(text))) throw new Error('plain text is caught: ' + text);
}
console.log(`player-words: ${files.length} shipped files use no unapproved coined term; ${caught.length} removed phrasings caught, ${kept.length} plain texts kept`);
