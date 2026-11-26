# Self-check

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/self-check.md](../implementation/self-check.md). Purpose: [Lifelong self-measurement](measurement.md#lifelong-self-measurement).

## Goal and versioning rules

Provide a short (~30 s), frozen reference check (`self-check.html`, opened from `self-check` in the game footer) whose protocols never drift over years and decades, giving a stable baseline to calibrate gameplay measurements across changing software and hardware.

- **Frozen protocol versioning:** each protocol id names one exact instrument. Any change to wording, parameters, input handling, timing convention, or scoring ships under a new id (`tests/self-check-core-test.js` fails on edits to frozen constants). Only one active version is offered at a time; versions with real accumulated history keep their saved records unless the creator explicitly approves deletion.

## Check flow

1. **Start:** `Start routine check` (scheduled usual time, enters baseline) or `Start extra check` (circumstance-prompted, stored as `extra` and excluded from baseline so selection bias does not skew comparisons).
2. **Check-in (`kss-9-v1`):** required 9-step sleepiness rating plus optional sleep hours in past 24 h (`0–24`; empty stored as absent, invalid blocks Continue) and optional note (`<= 500` chars). Canceling stores nothing.
3. **Instructions & test (`alertness-10-v1`):** during the test, all chrome, history, and backup hide (leaving only the black stimulus box) and background archive sync suspends so nothing competes with stimulus frames.
4. **Result:** complete checks display median reaction, response speed, lapses, false starts, and stimuli beside the median of up to `10` earlier complete `routine` checks (extra checks compare against the same routine baseline). Interrupted checks save with their stop reason and display en dashes (never scored).
5. **History & backup:** lists the `60` most recent checks newest-first (local time in the recorded zone, naming that zone when different from viewer's) with total count and independent JSON export/import.

## Frozen protocols

### Sleepiness rating (`kss-9-v1`)
Karolinska Sleepiness Scale (Åkerstedt & Gillberg 1990). Question: `"How sleepy do you feel right now?"`
1. extremely alert · 2. very alert · 3. alert · 4. rather alert · 5. neither alert nor sleepy · 6. some signs of sleepiness · 7. sleepy, but no effort to keep awake · 8. sleepy, some effort to keep awake · 9. very sleepy, great effort to keep awake, fighting sleep.

### Alertness test (`alertness-10-v1`)
Follows PVT-B conventions (`1–4 s` intervals, `>= 355 ms` lapses, `< 100 ms` false starts) capped at `10` stimuli (~30 s; trades lapse power for fast daily adherence).

- **Frozen instructions:** `"Alertness test: 10 counters"` — `"A counter appears in the black box at random moments, 10 times. Press the left mouse button as soon as you see it, then wait for the next one. A press while no counter is showing counts as early. Switching tabs or windows, or pressing Esc, stops the test."`
- **Mechanics:** white millisecond counter on black box counting from `0` each frame; uniform `[1000, 4000) ms` intervals from cryptographic RNG (each interval saved); primary mouse press anywhere responds (keys ignored, context menu suppressed); `1 s` whole-ms feedback (`"early"` for `1 s` on no-stimulus or `< 100 ms` press, restarting interval); `30 s` unanswered timeout (`"no response"`, counts as lapse). Ends after 10th stimulus resolves and its `1 s` feedback completes. Hidden tab, blur, page close, or `Esc` stops immediately and records reason.
- **Timing & read-time derivations:** stimulus onset = `requestAnimationFrame` timestamp of first drawn frame (also saves `nextFrameT` to expose dropped frames); response = pointer event `timeStamp`; reaction = `responseT − onsetT` (comparable within one setup, not lab hardware). Derived at read time only: valid reactions (`>= 100 ms`), false starts (`early + < 100 ms`), lapses (`>= 355 ms + timeouts`), median reaction, response speed (`mean(1000 / reaction)`), slowest-tenth speed, fastest-tenth reaction.

## Stored record, display, and archive

- **Store (`selfChecks`, keyed by `startedAt`):** saves `startedAt`, `endedAt`, `timeZone`, `utcOffsetMin`, `occasion`, `sleepiness`, optional `sleepHoursPast24h` and `note`, `environment` (DPR, screen/viewport, UA), and `vigilance` (`protocol`, `status`, `interruption`, `timeOriginMs`, `startT`, `endT`, `trials[]` with `isiMs`/`onsetT`/`nextFrameT`/`responseT`/`receiptT`/`pointerType` or `timedOut`, `earlyPresses[]`, `frameCount`, `frameIntervalMedianMs`). Malformed records fail visibly on load.
- **Typography:** pure black on white, bold tabular values larger than labels, fluid width, hover definitions on names and scale ratings.
- **Backup & archive:** exports/imports `{ format: "minesweeper-friendly-self-checks", formatVersion: 1, exportedAt, selfChecks }` merged by `startedAt` (invalid items rejected with count). Auto-writes to the player's [archive folder](storage-and-history.md#archive-folder) (offering `"Allow archive writing"` / `"Try the archive again"` on permission or write errors). Unbuilt future tests live in [BACKLOG.md](../../BACKLOG.md#lifelong-self-measurement-and-longitudinal-research).
