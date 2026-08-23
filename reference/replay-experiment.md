# Secret replay experiment — research design

From the creator discussion of 2026-08-19 ("if we secretly gave them the
same level again, rotated — would they notice? how much of a game is
luck?"). Design notes only; nothing here is built. The overt siblings of
this idea — Trial and Short trial (hidden repeated identities under
isometries, identity-grouped review) — are built and specified in
`PRODUCT.md` "Play modes". This file covers what those modes do NOT do:
covert replays inside ordinary play, long lags, implicit-memory
detection, and the skill/luck decomposition.

## The question

How much of a game's result is the player (motor base, reading,
decisions) and how much is the board (luck)? And: does a secretly
repeated board help the player even when they do not consciously
recognize it — and how fast does that help fade?

## Performance decomposition

- Motor base: click speed, path economy (measured: mouse speed, path per
  click, and the motion systems).
- Reading: how fast sitting deductions are extracted.
- Decisions: which frontier to work, when to chord, when to accept a
  guess.
- Luck, splitting into:
  - draw luck — how easy the board is (3BV, pattern mix, forced guesses);
  - reveal luck — how big the opening cascade happens to be;
  - guess luck — surviving the guesses taken.

3BV/s normalizes part of draw variation; nothing here separates reveal
luck, motor behavior, strategy, familiarity, practice, or other
session-level changes. Repeats hold board identity constant, but
within-identity variance can still contain all of those factors, and
between-identity variance is not simply "luck." Trial produces paired data;
a defensible decomposition would require an explicit model and controls and
is not computed anywhere.

## What repeats control—and what they do not

Boards are uniform-random (mines over all cells minus the first click).
Natural repeats are combinatorially impossible (C(480,99) for Expert), so
a served repeat is known to share board identity. Any observed performance
difference or similarity is still only an association unless practice,
order, transform ergonomics, session state, and other alternatives are
controlled.

## Transforms (as built in Trial, restated)

Rotations/reflections preserve adjacency, 3BV, patterns, and guess
structure while breaking verbatim visual memory. Squares get all 8
dihedral maps; rectangles get 4 (identity, 180°, both flips). Transforms
preserve logic but not ergonomics (left-to-right, top-left scanning
bias), so counterbalance across transforms rather than treating them as
identical.

## What is NOT built (the covert experiment)

1. **Secret replays in Standard play.** Trial is an opted-in mode; the
   player knows repeats exist even if not which games. The covert version
   embeds a transform of an earlier board into ordinary play (e.g. 1 in 8
   games), recording `replayOf`, `transform`, `lag` in the game record
   while the UI shows nothing. First-click contamination (~10-20% of
   trials, the replay opening landing on a mine) discards the trial.
2. **Lag as the independent variable.** Trial repeats happen within one
   session. The decay question needs scheduled lags spanning 1 game, 5
   games, 1 hour, 1 day, 1 week — then fit the boost-vs-lag curve. That
   curve would estimate repeat-associated change over lag; calling it memory
   decay would require a validated design. Literature anchor: contextual cueing (Chun &
   Jiang) — reliable speedup on repeated spatial configurations with
   chance-level explicit recognition, persisting days to a week+ in lab
   stimuli. Transfer to Minesweeper is an untested hypothesis.
3. **Implicit-memory fingerprints.** Detect noticing without asking:
   does the replay's early click sequence match the original's (under
   the transform) beyond chance; does time-to-first-deduction drop.
   Trial's overlaid traces show this to the eye; no statistic computes
   it.
4. **Skill/luck variance split.** Within- vs between-identity variance
   from Trial (or covert replay) data, reported as a number.

## Hypotheses, not expected findings

Possible hypotheses include repeat-associated facilitation without reported
recognition and different effects for transformed versus verbatim repeats.
The current data and UI do not establish either result.
