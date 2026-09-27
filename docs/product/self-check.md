# Self-check (creator direction, 2026-09-26)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/self-check.md](../implementation/self-check.md).
Purpose: [Lifelong self-measurement](measurement.md#lifelong-self-measurement-creator-direction-2026-09-26).

A short reference check the creator can take regularly for years and decades.
Gameplay changes as the game, browser, and hardware change; the self-check's
protocols do not, so its results stay comparable across decades and can
calibrate the gameplay measurements. A check pairs a sleepiness rating with a
10-counter alertness test of about 30 seconds. The page is `self-check.html`,
linked as "self-check" beside "settings" in the game page's upper-right
cluster.

Creator decisions (2026-09-26, after trying the first version, a 3-minute
test): "3 entire minutes of this is way too long"; a check was expected to
collect "5 or 10 data points, to help later analysis"; then, when a short test
was added beside the long one: "don't ADD. change the version there to be
short. 10 max. 3 min is too long. only have one proper version"; and when the
old test was kept readable for saved checks: remove a feature's code
permanently rather than keep backward compatibility for a test that shipped
minutes earlier; delete its saved test records instead. The 3-minute test's
code is gone; the one check saved with it is deleted.

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
   routine 10-counter checks when any exist. An extra check is compared with
   the same routine baseline. A stopped test shows why it stopped; it is saved
   and never scored.
6. **History and backup** stay below: the 60 most recent checks, newest first,
   with the total count, and JSON export/import.

## Frozen protocols

### Sleepiness rating `kss-9-v1`

The Karolinska Sleepiness Scale (Åkerstedt & Gillberg 1990), nine steps, every
step labeled. Question: "How sleepy do you feel right now?" Answers 1–9:
extremely alert; very alert; alert; rather alert; neither alert nor sleepy;
some signs of sleepiness; sleepy, but no effort to keep awake; sleepy, some
effort to keep awake; very sleepy, great effort to keep awake, fighting sleep.

### Alertness test `alertness-10-v1`

Rules follow the brief psychomotor vigilance test, PVT-B (Basner, Mollicone &
Dinges 2011): 1–4 s intervals, lapses from 355 ms, reactions under 100 ms
counted as false starts; the test ends after 10 stimuli, about 30 seconds.
10 reactions give a median reaction time good to roughly 15 ms for one check,
enough to follow over many checks. Lapses, the PVT's most sleep-sensitive
outcome, are rare in 10 stimuli; that is the cost of the short length the
creator chose.

- **Instructions (frozen wording):** "Alertness test: 10 counters", then "A
  counter appears in the black box at random moments, 10 times. Press the left
  mouse button as soon as you see it, then wait for the next one. A press while
  no counter is showing counts as early. Switching tabs or windows, or pressing
  Esc, stops the test."

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
- **End:** the test takes 10 stimuli. It ends when the 10th stimulus is
  answered or times out and its 1-second feedback has shown; presses after the
  10th stimulus is resolved are not recorded. A complete test holds exactly 10
  stimuli; a stopped one at most 10.
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

A protocol id names one exact instrument. Any change to wording, parameters,
input, timing convention, or scoring ships under a new id. There is only ever
one version of each measure (creator decisions, 2026-09-26): a new version
replaces the old one outright, its code is removed, and checks saved with it
are deleted, never kept readable beside the new ones.
`tests/self-check-core-test.js` fails on any edit to the protocol's constants.

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
| `vigilance.protocol`, `status` | `alertness-10-v1`; `complete` or `interrupted` |
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
