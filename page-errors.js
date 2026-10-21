'use strict';

// The error bar: every page's one surface for an error no code handled, an
// uncaught exception, an unhandled promise rejection, or a script or
// stylesheet that failed to load. Without it these reached only the browser
// console, which a player never sees (creator direction 2026-10-21:
// docs/product/ui-doctrine.md, "Errors are shown"). Each distinct error is
// one line, with the file and line it was thrown from and how many times it
// happened, in a red bar fixed to the bottom of the window; dismissing hides
// the bar until the next error. The console still logs every error.
(() => {
  const lines = new Map();
  let bar = null;
  let list = null;

  // A same-origin URL as its repository path, without the cache tag.
  function sourcePath(url) {
    const path = url.startsWith(location.origin + '/') ? url.slice(location.origin.length + 1) : url;
    return path.split('?')[0];
  }

  // The first stack frame with a source position, in either engine's stack
  // format ("fn@url:line:column" or "at fn (url:line:column)"). An error
  // relayed from a worker carries the worker's stack (analysis-client.js).
  function throwSite(error) {
    const frame = /((?:https?|blob):[^\s()@]+):(\d+):\d+/.exec(error.stack);
    return frame === null ? '' : sourcePath(frame[1]) + ' line ' + frame[2];
  }

  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'page-errors';
    bar.setAttribute('role', 'alert');
    list = document.createElement('ul');
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ui-button';
    dismiss.textContent = 'dismiss';
    dismiss.addEventListener('click', () => { bar.hidden = true; });
    bar.append(list, dismiss);
    document.body.append(bar);
  }

  function show(text) {
    if (bar === null) buildBar();
    let line = lines.get(text);
    if (line === undefined) {
      line = { element: document.createElement('li'), count: 0 };
      lines.set(text, line);
      list.append(line.element);
    }
    line.count++;
    line.element.textContent = line.count === 1 ? text : text + ', ' + line.count + ' times';
    bar.hidden = false;
  }

  function showError(error) {
    const site = throwSite(error);
    show(error.name + ': ' + error.message + (site === '' ? '' : ' (' + site + ')'));
  }

  // Capture phase: a failed script or stylesheet load fires on its element
  // and never bubbles to the window.
  window.addEventListener('error', (event) => {
    if (!(event instanceof ErrorEvent)) {
      const element = event.target;
      show('Could not load ' + sourcePath(element.tagName === 'LINK' ? element.href : element.src));
    } else if (event.error instanceof Error) {
      showError(event.error);
    } else if (event.lineno === 0) {
      // Raised by the browser itself, such as the ResizeObserver loop report:
      // there is no source line to name (Firefox gives no file, Chromium the
      // page's own URL).
      show(event.message);
    } else {
      show(event.message + ' (' + sourcePath(event.filename) + ' line ' + event.lineno + ')');
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof Error) showError(event.reason);
    else show('Unhandled rejection: ' + String(event.reason));
  });
})();
