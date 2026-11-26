# Daily play limits

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/play-limits.md](../implementation/play-limits.md).

## Goal and commitment model

Let players set voluntary daily caps on their own play with deliberate friction against impulsive loosening, resetting at local `4:00` so late-night play belongs to the same sitting.

- **One play day:** runs local `4:00` to next local `4:00` (`23` or `25` hours across DST). A board crossing `4:00` counts wholly toward the day it started in.
- **Six independent optional limits:**
  - `play time` (`1–1440` minutes of in-game clock time from first click / auto-open to end);
  - `games` (`1–10000` boards put into play across all sizes and modes);
  - `Beginner games`, `Intermediate games`, `Expert games` (`1–10000` each, matching exact preset dimensions and mine count in any mode);
  - `stop time` (wall-clock time of day closing play until `4:00`; `4:00` closes the whole day).
- **Honest accounting across tabs:** every board entering play — finished or restarted/abandoned — records a `playSpans` entry (including generator, exit reason, and `safeRevealed` for [session results](rankings.md#session-summary-and-results-partition)). Play in all open tabs sums together, and play before a limit was set still counts toward that day. Closing a tab abruptly loses at most `5 s` of span time.
- **Outside preferences:** limits and penalty choice live in their own `userdata` store kind — excluded from preferences export/import so backup imports cannot lift a commitment. An unreadable stored limit stops the page with an error rather than silently dropping it. Limits are local browser commitments (clearing site data or switching browsers starts fresh).

## Two-step confirmation and loosening lock

- **Tightening works anytime** (adding a limit, lowering a cap, setting an earlier stop time, or switching penalty to `closed at once`).
- **Loosening is locked** (raising a cap, removing a limit, setting a later stop time, or switching penalty back to `no flags first`) whenever today's play exceeds `2 minutes` OR the target limit (or any limit, for penalty loosening) is already reached.
- **Two confirmations:** every change opens a two-step dialog — step 1 shows scope, today's use, input, and loosening rule; step 2 (`Confirm again`) places its button on the opposite side from step 1's `Continue` (preventing accidental double-clicks) and re-checks the 2-minute lock at apply time across tabs.

## Reaching a limit and the no-flags-first penalty

A board already in play **always finishes** under the permissions it started with; limits and penalties apply to the next board (or a ready unstarted board if a stop time arrives or another tab crosses a threshold).

- **Two penalty choices (one setting across all limits):**
  - **`No flags first` (default):** reaching a play-time or game-count limit enters a flagless grace stage lasting **half the limit again** (game counts round up: `50` games → games `51–75` without flags, `76th` refused; `30 m` → closes at `45 m`), then closes the day. Stop time closes immediately under either penalty (a clock time has no duration to halve).
  - **`Closed at once`:** closes the day as soon as any limit is reached.
- **No-flags behavior:** right-press on a covered square places nothing (removing an existing flag still works; chords still work over existing flags). Refused flag presses are not recorded in traces and flash a red outline on today's use in the top bar. Flag-blocked boards stamp `flagsBlocked: true` (`this game` shows `"Flags: blocked by a daily limit"`, flagging rates stay unmeasured, and wins naturally rank among [no-mark wins](rankings.md#no-mark-wins)).
- **Closed board:** overlays `"Done for today"`, the reached limits, and `"new games from 4:00"` inside the board frame without shifting page layout.

## Placement and UI

- **Configuration (`settings.html`):** top `"Daily limits"` panel with one row per limit (today's use live across tabs, limit, `"no flags, closes at …"` / `"closed"` / `"locked until 4:00"`, and `Set`/`Change`), plus one `"when a limit is reached"` penalty row beneath it.
- **Game page top bar:** always shows the bordered `daily limits` button beside `settings` at upper right. Once any limit is set, plain bold text beside it displays today's use (`"today: 12m 34s of 30m · 14 of 50 games"`, red `"no flags: …"` in the grace stage, red `"limit reached: …"` when closed), updating on board start/end rather than ticking every second ([UI doctrine](ui-doctrine.md#simplicity-and-visual-restraint)).
