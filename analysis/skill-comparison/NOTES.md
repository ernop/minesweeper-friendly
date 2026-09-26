# Skill comparison: the player's games against published expert replays

2026-09-26. Offline pipeline for plan v2 of the training work
([docs/product/training.md](../../docs/product/training.md); study design and
results in [reference/skill-comparison-2026-09-26.md](../../reference/skill-comparison-2026-09-26.md)).
Both sources are converted into one per-input format and measured by the same
code, so every difference is a difference in play, not in measurement.

## Run

```
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python saolei_fetch.py --bands 40-50:15 50-60:15 60-75:15 75-110:15
.venv/bin/python corpus_actions.py corpus.jsonl
node user_games.js HISTORY.json TRACES.json self.jsonl   # the game's two exports
.venv/bin/python compare.py compare.json self.jsonl corpus.jsonl
```

`HISTORY.json` and `TRACES.json` are the game's "export history" and "export
traces" files. Outputs stay outside the repository; they contain personal and
third-party game data.

## Data sources and rules

- **saolei.wang** publishes replay files of Chinese-ranked players at every
  level (hundreds of thousands of games). It has no robots.txt. The fetcher
  requests one page or file every 2 s, caches everything under
  `~/.cache/minesweeper-friendly/saolei/`, skips unreviewed uploads, takes at
  most two replays per player per time band, and never redistributes files.
- **minesweepergame.com** hosts ranked players' videos, but its robots.txt
  disallows automated access to the video and file folders; use only with the
  site owner's permission.
- **minesweeper.online** replays play in the browser and are not files.
- Replays are parsed with `ms_toollib` (Arbiter AVF, Metasweeper EVF,
  Minesweeper Clone MVF, Viennasweeper RMV).

## Shared per-input format

`source, id, player, band, timeMs, bv3, actions: [[tMs, cellX, cellY, kind]],
samples: [[tMs, x, y]]` with kind `reveal | chord | flag | unflag | noop`,
time zero at the game-starting reveal, positions in cell units. Corpus kinds
come from the parser's running effective-click counters; the player's kinds
come from `TrainingCore.replay`.

## Measurement notes

- The game's trace layout events measure `#board`'s border box; the cell grid
  is inset by the bevel, one eighth of a cell (style.css `--bevel-size`). With
  that geometry every one of 28,387 recorded clicks lies within 0.6 px of its
  own cell; the border-box mapping puts 3.25% of clicks in a neighbor.
- Corpus times have 10 ms resolution (Arbiter); the player's traces are
  sub-millisecond. Corpus cells are 16 px; comparisons use cell units.
- Arbiter chords with both buttons; this clone chords with a left click.
  Compare per-action timing within action kinds when the binding matters.
- Uploaded replays are mostly players' good games (Arbiter saves high-score
  videos) and never losses. Compare them with the player's fastest wins as
  well as all wins, and account for board 3BV.
