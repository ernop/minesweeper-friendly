'use strict';
// Structural checks for the first-paint contract. Browser layout is visual,
// but these invariants prevent the empty-board flash and serial asset loading
// from quietly returning.

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(repo, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(repo, 'minesweeper.js'), 'utf8');
const storage = fs.readFileSync(path.join(repo, 'storage.js'), 'utf8');

let checks = 0;
function check(name, condition) {
  checks++;
  if (!condition) throw new Error(name);
}

check('document declares the visible startup state',
  /<html[^>]+class="game-booting"/.test(html));
check('startup explains the real work',
  html.includes('Loading your settings and saved history\u2026'));
check('first paint builds a complete Beginner board',
  html.includes('for (let i = 0; i < 81; i++)'));
check('first paint has a default grid width',
  css.includes('--board-width: 9;'));
check('loading board stays visible',
  !css.includes('.game-booting #game-frame { display: none'));

const externalScripts = [...html.matchAll(/<script([^>]+)src="([^"]+)"/g)]
  .map((match) => ({ attrs: match[1], src: match[2] }));
check('all external scripts are deferred',
  externalScripts.length > 0
    && externalScripts.every((script) => /\bdefer\b/.test(script.attrs)));
check('storage starts before application scripts',
  externalScripts[0].src === 'storage.js');
check('early database completion waits for the page callback',
  storage.includes("typeof userdataReady !== 'function'"));

const newGameAt = js.lastIndexOf('  newGame();');
const readyAt = js.lastIndexOf("document.documentElement.classList.remove('game-booting')");
check('the real board exists before startup completes',
  newGameAt !== -1 && readyAt > newGameAt);
check('startup accessibility state completes',
  js.includes("boardElement.removeAttribute('aria-busy')")
    && js.includes("document.body.removeAttribute('aria-busy')"));
check('new-game control unlocks only when ready',
  /id="face-button"[^>]+disabled/.test(html)
    && js.includes('faceButton.disabled = false'));

console.log(`startup-presentation: all ${checks} checks passed`);
