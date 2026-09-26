# Skill comparison study: design and pilot (2026-09-26)

Plan v2 of the training work ([docs/product/training.md](../docs/product/training.md),
"Redo requested"). Question: exactly how does the player's Expert play differ
from players who already break 60 seconds, which differences cost the most
time, and which can be trained? Pipeline: `analysis/skill-comparison/`
(NOTES.md there has the commands, data rules, and measurement notes).

## Data

- **Player:** Expert wins with saved traces from the live history of
  2026-09-26 (1,743 Expert games; 100 wins with traces, 78 replayed exactly,
  22 changed by Justice redraws excluded). Traces hold every input with its
  cell and the cursor path at sub-millisecond timing.
- **Corpus:** saolei.wang, the Chinese ranking site, publishes replay files of
  players at every level (video IDs near 345,000). Pilot: 15 reviewed Expert
  replays in each of four time bands (40–50, 50–60, 60–75, 75–110 s), at most
  two per player per band, 33 players, all Minesweeper Arbiter. Parsed with
  `ms_toollib` 1.5.18; times at 10 ms resolution; 16 px cells.
- **Not used:** minesweepergame.com videos (robots.txt disallows automated
  access to its video folders; use only with the owner's permission);
  minesweeper.online replays (not files).

## Measures (identical code for both sources)

Per input: kind (reveal, chord, flag, unflag, no-op), cell, time. Per gap
between inputs on different cells: **reaction** (previous input until the
cursor has moved 0.25 cells), **travel** (until the start of the final stay in
the target cell), **hover** (arrival until the input). Gaps over 1 s count as
**pauses**. Per game: IOE (3BV per input, no-ops included), inputs per second,
actions per 3BV by kind, cursor path per 3BV. 3BV/s = IOE x inputs per second.

## Pilot results

Medians over games (per-game medians first):

| | you, all wins | you, fastest 20 | 40–50 s | 50–60 s | 60–75 s | 75–110 s |
| --- | --- | --- | --- | --- | --- | --- |
| games | 78 | 20 | 15 | 15 | 15 | 15 |
| time (s) | 101 | 89 | 45 | 54 | 65 | 88 |
| board 3BV | 175 | 169 | 158 | 200 | 196 | 160 |
| 3BV/s | 1.77 | 1.85 | 3.69 | 3.65 | 2.71 | 1.82 |
| IOE | 0.62 | 0.62 | 0.78 | 0.80 | 0.78 | 0.76 |
| inputs per second | 2.84 | 3.03 | 4.86 | 4.87 | 3.52 | 2.59 |
| flags per 3BV | 0.58 | 0.59 | 0.19 | 0.16 | 0.00 | 0.31 |
| chords per 3BV | 0.64 | 0.65 | 0.26 | 0.22 | 0.00 | 0.00 |
| direct reveals per 3BV | 0.16 | 0.14 | 0.52 | 0.53 | 1.15 | 1.13 |
| median gap (ms) | 275 | 268 | 160 | 160 | 210 | 290 |
| cursor path per 3BV (cells) | 4.0 | 3.8 | 3.1 | 3.0 | 2.9 | 3.4 |

Mean milliseconds per input, split so the parts add up (the remaining few ms
per input are same-cell inputs and gaps without a clean split):

| | mean gap | pauses | reaction | travel | hover | inputs on a 173-3BV board | seconds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| you, all wins | 358 | 45 | 59 | 122 | 110 | 280 | 100 |
| you, fastest 20 | 332 | 21 | 57 | 121 | 112 | 280 | 93 |
| 75–110 s | 343 | 70 | 45 | 94 | 106 | 229 | 79 |
| 60–75 s | 277 | 26 | 43 | 91 | 97 | 221 | 61 |
| 50–60 s | 213 | 5 | 37 | 75 | 81 | 218 | 46 |
| 40–50 s | 207 | 1 | 38 | 75 | 78 | 222 | 46 |

Travel by distance (median ms, pooled gaps): 1–2 cells 41 (you) vs 20–30;
2–4 cells 158 vs 90; 4–8 cells 440 vs 190–195; 8+ cells 812 vs 430–450.

## What the pilot says

- **Validity check passed.** Corpus players at the player's own level (75–110 s,
  1.82 3BV/s) show nearly the same reaction, travel, and hover as the player.
- **Both factors differ.** Against the 50–60 s band the player's 3BV/s is about
  half: IOE 0.62 vs 0.79 (x1.27) and inputs per second 2.84 vs 4.87 (x1.71).
  The morning plan's statement that the hands were already fast enough is
  contradicted: sub-60 players in this corpus also input much faster.
- **Style.** Sub-60 players mostly click cells directly and flag selectively
  (about 30 flags and 40 chords per game); the player flags and chords almost
  everything (about 100 and 110) with few direct clicks.
- **Where the milliseconds are** (fastest-20 comparison, per input): travel +46,
  hover +31, reaction +20, pauses +16. On a 173-3BV board at the player's own
  input count, pro travel alone would save about 13 s, pro hover 9 s, pro
  reaction 6 s, no pauses 5 s; pro economy at the player's own speed about 21 s.
  These do not simply add: changing style changes the input mix.
- **Relative to same-level peers** the player has worse economy (0.62 vs 0.76)
  and slower travel (122 vs 94 ms per input) but fewer pauses (45 vs 70 ms).

## Caveats

- 15 games per band; uploaded replays are mostly players' good games and never
  losses; compare them with the player's fastest wins before all wins.
- Time bands mix skill with board luck (the 50–60 s band had 3BV 200); future
  sampling stratifies by 3BV/s or by player best rather than by game time.
- Arbiter chords with both buttons, so no-op counts and chord timing are not
  comparable across bindings; its 10 ms clock quantizes short intervals.
- Corpus cells are 16 px and the player's 32 px: the same cell distance is
  twice the cursor distance for the player. Travel differences may partly be
  zoom and pointer settings, which a within-player zoom block can test.

## Next steps

1. Enlarge and stratify the corpus by 3BV/s, several games per player; model
   board difficulty (3BV, openings).
2. Annotate situations (logic needed, queued vs newly provable, local pattern)
   and compare latency and choices per class.
3. Rank subskills by counterfactual seconds saved in the player's own games.
4. Tests the player takes: a pointing test on the board grid; a zoom block
   (16 vs 32 px cells); Minesweeper problems from corpus positions.
