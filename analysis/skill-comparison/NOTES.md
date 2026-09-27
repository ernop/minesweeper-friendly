# Skill comparison: the player's games against published expert replays

2026-09-26. Offline pipeline for plan v2 of the training work
([docs/product/training.md](../../docs/product/training.md); study design and
results in [reference/skill-comparison-2026-09-26.md](../../reference/skill-comparison-2026-09-26.md)).
Both sources are converted into one per-input format and measured by the same
code, so every difference is a difference in play, not in measurement.

## Run

```
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python saolei_fetch.py --by bvs --bands 1.0-1.4:150 1.4-1.8:150 1.8-2.2:150 \
  2.2-2.6:150 2.6-3.0:150 3.0-3.5:150 3.5-6.0:150 --per-player 3 --max-pages 1200
.venv/bin/python corpus_actions.py corpus.jsonl
node user_games.js HISTORY.json TRACES.json self.jsonl   # the game's two exports
.venv/bin/python compare.py compare.json self.jsonl corpus.jsonl
node situations.js situations.json corpus.jsonl self.jsonl
node problems_bank.js situations.json ../../problems-bank.json BANK_ID --keep ../../problems-bank.json corpus.jsonl
```

`HISTORY.json` and `TRACES.json` are the game's "export history" and "export
traces" files. Outputs stay outside the repository; they contain personal and
third-party game data. The one exception is `problems-bank.json`, the problems
page's runtime bank: board positions and level statistics from the public
corpus only, never the player's games. Rerunning the fetcher with larger counts
downloads only what is new; `corpus_actions.py` keeps each replay once.

## Data sources and rules

- **saolei.wang** publishes replay files of Chinese-ranked players at every
  level (hundreds of thousands of games). It has no robots.txt. The fetcher
  requests one page or file every 2 s, skips unreviewed uploads, caps replays
  per player per band (`--per-player`), and never redistributes files.
- **The corpus is kept for good** (player request 2026-09-26: "let's really get
  a lot and store them logically forever") in
  `~/Documents/minesweeper-corpus/saolei/`: `README.txt`, `index.jsonl` (one
  line per replay picked for a band, with its listing facts, band, file path
  relative to the folder, and fetch date), `replays/<id>.<ext>` exactly as
  downloaded, and `shows/<id>.html` (each replay's page). Listing pages are a
  scan cache in `~/.cache/minesweeper-friendly/saolei/pages/`.
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
- Arbiter chords with both buttons; this clone chords with a left click and,
  since 2026-09-26, with both buttons and the 1.5 click too (the player's
  traced games before that used left clicks only). The parser counts the right
  half of a both-button chord as a click that changed nothing, so compare
  effective clicks across sources, never no-op counts.
- Uploaded replays are mostly players' good games (Arbiter saves high-score
  videos) and never losses. Compare them with the player's fastest wins as
  well as all wins, and account for board 3BV.
