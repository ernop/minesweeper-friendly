# Self-check (creator direction, 2026-09-26)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/self-check.md](../implementation/self-check.md).
Purpose: [Lifelong self-measurement](measurement.md#lifelong-self-measurement-creator-direction-2026-09-26).

A short reference check the creator can take regularly for years and decades.
Gameplay changes as the game, browser, and hardware change; the self-check's
protocols do not, so its results stay comparable across decades and can
calibrate the gameplay measurements. Version 1 pairs a sleepiness rating with a
3-minute alertness test. The page is `self-check.html`, linked as "self-check"
beside "settings" in the game page's upper-right cluster.

## Flow

1. **Start.** "Start routine check" is for the player's usual time and forms the
   baseline. "Start extra check" is for a moment prompted by circumstances,
   such as feeling unusual; it is stored as `extra` and kept out of the
   baseline because its timing was chosen rather than scheduled.
2. **Check-in.** The sleepiness question with nine labeled answers is required.
   Two optional fields follow: sleep in the past 24 hours (0–24 hours) and a
   note of up to 500 characters. An empty field is stored as absent, never as
   zero; an out-of-range or unreadable sleep value shows an error and blocks
   Continue.
3. **Instructions** in the frozen wording, then Begin. Cancel at check-in or at
   the instructions stores nothing.
4. **Test.** Only the black test box is shown; the titlebar, heading, history,
   and backup are hidden so nothing can be clicked by accident and no other
   page work competes with stimulus frames.
5. **Result.** A complete test shows median reaction, response speed, lapses,
   false starts, and stimuli, beside the median of up to 10 earlier complete
   routine checks when any exist. An extra check is compared with the same
   routine baseline. A stopped test shows why it stopped; it is saved and
   never scored.
6. **History and backup** stay below: the 60 most recent checks, newest first,
   with the total count, and JSON export/import.

## Frozen protocols

### Sleepiness rating `kss-9-v1`

The Karolinska Sleepiness Scale (Åkerstedt & Gillberg 1990), nine steps, every
step labeled. Question: "How sleepy do you feel right now?" Answers 1–9:
extremely alert; very alert; alert; rather alert; neither alert nor sleepy;
some signs of sleepiness; sleepy, but no effort to keep awake; sleepy, some
effort to keep awake; very sleepy, great effort to keep awake, fighting sleep.

### Alertness test `vigilance-3min-v1`

Parameters follow the brief psychomotor vigilance test, PVT-B (Basner,
Mollicone & Dinges 2011): 3 minutes, 1–4 s intervals, lapses from 355 ms,
reactions under 100 ms counted as false starts. Response speed and lapses are
the outcomes the vigilance literature treats as primary for sleep loss.

- **Stimulus:** a millisecond counter in white on the black box, counting up
  from 0 on every frame while shown.
- **Interval:** from each response, timeout, early press, or the start to the
  next stimulus, uniform on [1000, 4000) ms from the browser's cryptographic
  random source. Each drawn interval is stored with its stimulus.
- **Response:** a primary mouse button press anywhere on the page. Keys never
  answer; the right-click menu is suppressed during the test.
- **Feedback:** after a response the counter shows the reaction in whole ms for
  1 s. A press while no counter shows, including during feedback, shows
  "early" for 1 s and restarts the interval from that press. A reaction under
  100 ms also shows "early".
- **Timeout:** a stimulus unanswered for 30 s ends as "no response", counts as
  a lapse, and the next interval starts at the timeout instant.
- **End:** no stimulus is scheduled at or after 3 minutes from Begin; a
  stimulus still on screen at that moment runs to its response or timeout.
  Early presses after the 3-minute mark are not recorded.
- **Stops:** the tab becoming hidden, the window losing focus, the page
  closing, or Esc stop the test immediately. The record keeps the reason and
  time. A test stopped by closing the page may not reach disk.
- **Timing convention:** a stimulus is dated by the `requestAnimationFrame`
  timestamp of the frame that first draws it; the next frame's timestamp is
  stored too, so a delayed presentation stays visible. A response is dated by
  its pointer event's `timeStamp` (browser event creation, the same clock).
  Reaction = response time minus stimulus frame time. The delay from that frame
  to light leaving the screen is not observable in a browser and is roughly
  constant within one setup, so results compare with the same person's history
  on the same setup, not with laboratory PVT hardware.
- **Derived at read time, never stored:** reactions are responses of 100 ms or
  more; false starts = early presses + reactions under 100 ms; lapses =
  reactions of 355 ms or more + timeouts; median reaction; response speed =
  mean of 1000 / reaction, per second; slowest-tenth speed and fastest-tenth
  reaction over the ceil(n / 10) slowest or fastest reactions.

### Protocol versions

A released protocol id names one exact instrument for as long as its data
exists. Any change to wording, parameters, input, timing convention, or
scoring ships under a new id. The old protocol stays available, and old and new
run side by side for a bridging period (for example both daily for two weeks)
so their offset is measured rather than assumed. Records keep their protocol id
forever. `tests/self-check-core-test.js` fails on any edit to a released
protocol's constants.

## Stored record

One record per check in the `selfChecks` store, keyed by `startedAt`:

| Field | Meaning |
| --- | --- |
| `startedAt`, `endedAt` | Unix epoch ms when the check began (Start) and ended |
| `timeZone`, `utcOffsetMin` | IANA zone and minutes east of UTC at `startedAt` |
| `occasion` | `routine` or `extra` |
| `sleepiness` | `{ scale: "kss-9-v1", rating: 1–9 }` |
| `sleepHoursPast24h` | optional hours, 0–24 |
| `note` | optional text |
| `environment` | device pixel ratio, screen and viewport size, user-agent string at Begin |
| `vigilance.protocol`, `status` | `vigilance-3min-v1`; `complete` or `interrupted` |
| `vigilance.interruption` | stops only: `{ type, t }`, type one of `visibilitychange`, `blur`, `pagehide`, `escape` |
| `vigilance.timeOriginMs`, `startT`, `endT` | the page clock's epoch anchor and the test's start and end on that clock |
| `vigilance.trials[]` | per stimulus: `isiMs`, `onsetT`, `nextFrameT`, then `responseT` + `receiptT` (handler time) + `pointerType`, or `timedOut: true`; only a stop may leave the last stimulus unresolved |
| `vigilance.earlyPresses[]` | `{ t, receiptT }` for presses while no counter showed |
| `vigilance.frameCount`, `frameIntervalMedianMs` | frames drawn during the test and their median interval, a display-rate check |

Loading validates every stored record and fails visibly, naming the record, if
one is malformed.

## Display

Values are the most legible text: bold, tabular numbers, larger than their
labels. There is no gray text, and the layout uses the full width. History
shows local time in the zone where the check happened and names that zone when
it differs from the viewer's. Numbers from stopped tests show as en dashes.
Hover titles on measure names and sleepiness values give the definition or the
scale label.

## Backup

Export writes `{ format: "minesweeper-friendly-self-checks", formatVersion: 1,
exportedAt, selfChecks }`. Import merges by `startedAt`: checks already stored
or repeated in the file are kept once, and invalid checks are rejected with a
visible count while the rest are kept. A file that is not a self-check backup,
or has an unknown format version, is an error. Game history keeps its own
export.

Every saved check is also written to the player's [archive folder](storage-and-history.md#archive-folder-creator-direction-2026-09-26)
when one is chosen. The Backup card shows the archive status. When the
browser needs permission renewed or a write failed, it offers "Allow archive
writing" or "Try the archive again". While the timed test runs, archive work
is suspended: a running sync stops and restarts after the result is saved,
so no background writing shares the machine with stimulus frames.

Not yet built: more frozen tests, reminders, and long-horizon views. See
[BACKLOG.md](../../BACKLOG.md#lifelong-self-measurement-roadmap-creator-2026-09-26).
