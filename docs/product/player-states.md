# Player states

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/player-states.md](../implementation/player-states.md).

## Goal and placement

Let players attach self-reported context tags (sleepiness, mood, hardware, location) and quick mental-state samples to finished games for later grouping and within-person experiments — without implying causation or cluttering play.

- **Top-bar placement:** sits in `#top-right` inside `#top-bar` at the upper right of `#page-head` (after the archive alert when paused/failing, ahead of `see scores`, daily limits, and `settings`; [Board and layout](board-and-layout.md#navigation-and-progressive-disclosure)). The editor opens as a floating popover (`#states-menu`) so toggling it never shifts the header or moves the board.
- **Active tags as non-interactive pills:** only active context items appear on `#play-context` — local music state first (`music on` / `music off`; [Per-game stats](per-game-stats.md#reproducibility-and-play-context)), followed by active state tags in list order and any active quick state sample. Each displays as a fully rounded sand pill (`bold black`, no pointer, hover, or `×`) visually distinct from bordered buttons ([UI doctrine](ui-doctrine.md#visual-grammar-color-and-contrast)). The line hides when nothing is active and music is unmeasured.

## Editing states and quick state sampling

- **`edit states` popover:** bordered button holding pressed state while open; header `"session states"` with `×` (`×`, `Esc`, and outside clicks close it). Lists every saved state as a live checkbox row (menu stays open on toggle) with a delete `×` per row, plus an input and `add` button at the bottom (creating a state turns it on immediately and closes the menu; empty or duplicate names show a visible error). New profiles seed three inactive suggestions: `sleepy`, `just woke up`, `inebriated`. State clicks look up entries by name at click time so unrelated preference writes never break toggles.
- **Quick state sample (`stateSample`):** sits inside the same `edit states` popover with two optional dimensions — **focus** (`1` foggy through `5` locked in) and **pace** (`calm`, `flowing`, `rushed`, `tilted`) — plus `clear sample` and a link to [self-check](self-check.md). Active samples last `45 minutes`, appear as a play-context pill (e.g., `focus 4/5 · flowing`), and stamp `stateSample` onto finished games (Standard and Coach alike) for comparison on [Training](training.md).
- **Immutable stamping:** active state ids stamp onto each record at game finish (win or loss). Editing or deleting tags later never alters saved records.
