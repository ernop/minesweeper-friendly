# Minesweeper problems: implementation

Spec: [docs/product/problems.md](../product/problems.md).

## Page

- `problems.html` loads `style.css` (base font, `#board` and `.cell` look,
  return-to-game dress), `problems.css`, then `board-icons.js`,
  `problems-core.js`, and `problems-page.js`. It loads neither `storage.js`
  nor the game's settings scripts.
- `board-icons.js`: `FLAG_SVG`, `MINE_SVG`, `WRONG_FLAG_SVG`, shared with the
  game page (moved out of `settings-core.js`, which only hosted them).
- `problems-core.js` (pure, no DOM, globals like `self-check-core.js`):
  - protocol constants `PROBLEM_PROTOCOL` (`problems-v2`, the one the page
    runs), `PROBLEM_RECORDED_PROTOCOLS` (what a stored attempt may carry),
    `PROBLEM_PREVIEW_MS`, `PROBLEM_TIMEOUT_MS`, `PROBLEM_ONSET_CELLS`,
    `PROBLEM_FOCUS_MARGIN`; `problemFocusBox(bank, problem)` gives the focus
    box in squares; set constants
    `PROBLEM_SET_SIZE`, `PROBLEM_SET_ONE_NUMBER`; `PROBLEM_CELL_SIZES`;
    `PROBLEM_LEVEL_MIN_MOVES`;
  - `readProblemBank` validates the bank and decodes each problem's hex square
    maps (`problemBits`, four squares per hex digit, most significant first)
    and adjacency once; `problemBoard` gives the board before the start square;
  - `applyProblemAction(board, kind, cell)` returns `{ opened, mineHit,
    flagChanged }` with the game's rules (chain opening from zeros, chords only
    with exactly the number's flags); `problemSolved`; `answersProblem`;
  - `problemMovementSplit` (reaction, travel, hover), `summarizeAttempt`
    (replays an attempt's clicks), `problemProfile` (per class, grouped by the
    problem's class in the current bank), `levelThinkMs`, `pickProblemSet`,
    `describeProblemClass`;
  - `ladderLayout(values, heightPx, gapPx)`: exact positions on a time scale
    (fastest at the top, 8% padding), label positions pushed apart in order
    within the drawing, and ticks;
  - `validProblemAttempt`, `problemAttemptsFile(attempts, pointingRuns,
    exportedAt)`, `readProblemAttemptsFile(json, width, height)`;
  - pointing test: `POINTING_PROTOCOL`, `POINTING_START`, `POINTING_MOVES`,
    `pointingTargets(width, height)`, `movementSplitAt(samples, startT,
    clickT, square)` (the same split from any start time),
    `summarizePointing(run, width, height)`, `validPointingRun`.
- `problems-page.js`:
  - opens IndexedDB `minesweeper-problems` version 1 (stores `attempts`, keyPath
    `startedAt`, and `preferences`, key `cellPx`) and fetches
    `problems-bank.json` together; any failure shows in the status line and
    throws;
  - phases per problem: `waiting` → `preview` (cursor in the start square;
    `previewT` is that mousemove's `timeStamp`) → `running` → `done`.
    `openStartSquare` opens the square in the first animation frame at or after
    `previewT + PROBLEM_PREVIEW_MS` and takes that frame's timestamp as
    `startT`;
  - positions come from `pageX`/`pageY` against the grid measured once per
    problem from the first and last square's rectangles, so scrolling cannot
    shift them; the square under the cursor is computed from the same numbers;
  - `squareInArea` places the ring and the focus box from square rectangles in
    the board area's coordinates (including its sideways scroll), so they sit
    exactly over the squares inside the board's bevel;
  - clicks: board `mousedown` (right press flags at once, or marks a chord
    gesture when the left button is down; left press starts a click and marks a
    gesture if the right button is down) and document `mouseup` (left release:
    chord after a gesture, otherwise open or chord);
  - `finishAttempt` builds and validates the record, `add`s it, and renders the
    result only after the transaction completes; `visibilitychange` to hidden
    and window `blur` interrupt a running attempt and restart a preview;
  - `renderLadder` draws a ladder from `ladderLayout` (band with ticks, dots,
    SVG leaders, labels); `levelEntries` supplies the levels with enough
    corpus moves and names the rest;
  - database version 2 adds the `pointingRuns` store; `beginPointing`,
    `showNextTarget` (draws a target in the next frame and stamps `shownT`),
    `onPointingMove`, `onPointingPress`, `finishPointing`,
    `renderPointingResult`, `renderPointingHome`, and `pointingLadders`
    (the bank's `travelByLevel` against the run's `byDistance`); the shared
    `boardGrid` from `measureGrid` serves both flows.

## Bank

`problems-bank.json` (runtime file) is generated, never edited by hand:

```text
node analysis/skill-comparison/situations.js SITUATIONS.json CORPUS.jsonl SELF.jsonl
node analysis/skill-comparison/problems_bank.js SITUATIONS.json problems-bank.json BANK_ID CORPUS.jsonl
```

- Format `minesweeper-problems-bank` version 2 (version 2 added
  `travelByLevel`: each level's median in-game travel and move count by move
  length, for the pointing test): `bankId`, `source`,
  `corpusGames`, board size, `levels` (3BV/s bands), `fluentMarginMs`,
  `classes` (keyed by family key, or `one`; `family`; `byLevel[level]` with
  `medianThinkMs`, `freshMoves`, and for families `fluentShare` and
  `judgedMoves`), and `problems` (`id` = replay id and move index, `classId`,
  `pattern` (the exact pair key, families only), `videoId`, `sourceBvs`, hex
  `mines`/`opened`/`flags`, `start`, `startAt`, `freshSafe`, `freshMines`,
  `original` with the first answer `{ cell, kind, ms, immediate, thinkMs,
  travelMs }` and `doneMs`).
- Selection: per class, moments the original player answered with the very
  next click come first, then faster games; one moment per game per class; the
  full solver (`Justice.proveFacts` with the search) must find exactly the
  two-number-strength answer set, or the moment is skipped.
- Level statistics come only from the saolei.wang corpus; the player's own
  games are never written into the public bank.
- The replay corpus stays outside the repository
  (`~/.cache/minesweeper-friendly/saolei`); see
  `analysis/skill-comparison/NOTES.md`.

## Tests

- `node tests/problems-core-test.js`: frozen protocol constants, bank decoding,
  every problem's answers re-proved with `justice.js` at two-number strength
  (safe after the new number, not provable before), click semantics on a hand
  board, answer crediting, the movement split, attempt summaries, profile
  grouping across banks, set picking, the ladder layout, class names,
  validation, backup files, and loud bank failures.
- `node tests/problems-browser-check.js PLAYWRIGHT_CORE_DIR CHROMIUM [SCREENSHOT_DIR]`
  on `http://127.0.0.1:8099/`: the ring, the preview and its cancel, the timed
  opening, solving, a mine, the 1.5 click, an interruption, Esc, saved records,
  profile and history, the square size preference, and the backup round trip.
