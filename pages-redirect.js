'use strict';

// GitHub Pages still publishes this repository. The public game is
// https://minesweeper-friendly.fuseki.net/. Every other host, including
// that site and the local origin, stays where it is.
(function () {
  if (location.hostname !== 'ernop.github.io') return;
  var prefix = '/minesweeper-friendly';
  var path = location.pathname;
  if (path === prefix || path.indexOf(prefix + '/') === 0) {
    path = path.slice(prefix.length);
  }
  if (path.charAt(0) !== '/') path = '/' + path;
  location.replace('https://minesweeper-friendly.fuseki.net' + path + location.search + location.hash);
})();
