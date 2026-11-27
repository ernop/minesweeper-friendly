# How Mentation Happens During Play: Empirical Trace Study (2026-11-26)

Empirical investigation of how perception, planning, chunking, visual search,
and motor execution unfold millisecond-by-millisecond inside Minesweeper games —
and why naive per-click subgame analysis misattributes cognitive cost.

Dataset analyzed:
- Ernest: `140` recent Expert wins, `111` late Expert losses (`>= 20 s`), plus
  `240` Beginner / Intermediate / Expert wins (`80` each) from live traces
  (exact `ldown`/`lup`/`rdown`/`right-button-up` events and continuous pointer
  samples).
- Published pro replay corpus (`saolei.wang`): `175` stratified Expert wins
  across five speed bands (`1.6–2.0`, `2.4–2.8`, `3.0–3.5`, `3.8–4.4`, `4.5+`
  3BV/s, `35` per band; two-button chord helper right-downs filtered out).
- Every position replayed through exact `GuardianAngel.proveLevels` with
  per-square `deducible-since` timestamps (`firstProvenStep`, `chordReadyStep`).

---

## 1. Instrumentation Bias Exposed: Press-to-Press vs. Trigger-to-Trigger (`±62 ms`)

Previous subgame analysis (`mind-map.js` v1) timed left clicks at release
(`lup`) and flags at press (`rdown`), and measured target hover up to the
trigger event. That created two large artifacts:

| Action | Trigger-to-arrive hover | **Pre-down hover** (`down − arrive`) | Mechanical hold (`up − down`) | `n` |
| --- | ---: | ---: | ---: | ---: |
| Reveal (left) | `134 ms` | **`70 ms`** | `63 ms` | `4,651` |
| Chord (left) | `125 ms` | **`65 ms`** | `61 ms` | `14,487` |
| Flag (right) | `71 ms` | **`71 ms`** | `77 ms` (`right-button-up − rdown`) | `13,659` |

1. **The "+56 ms left-click hover hesitation" was 100% mechanical button hold.**
   Actual cognitive dwell before pressing the button (`pre-down hover`) is
   virtually identical across reveals (`70 ms`), chords (`65 ms`), and flags
   (`71 ms`).
2. **Trigger-to-trigger timing reversed the apparent direction of switch cost:**

| Local transition (`dist <= 2`, no no-op) | Trigger-to-trigger | **Press-to-press** | Bias | `n` |
| --- | ---: | ---: | ---: | ---: |
| `flag → chord` | `262 ms` | **`202 ms`** | `+60 ms` | `7,020` |
| `chord → chord` | `222 ms` | **`213 ms`** | `+9 ms` | `4,917` |
| `flag → flag` | `221 ms` | **`221 ms`** | `0 ms` | `3,699` |
| `reveal → reveal` | `242 ms` | **`242 ms`** | `0 ms` | `2,197` |
| `flag → reveal` | `391 ms` | **`323 ms`** | `+68 ms` | `337` |
| `reveal → flag` | `262 ms` | **`332 ms`** | `-70 ms` | `915` |
| `chord → flag` | `280 ms` | **`342 ms`** | `-62 ms` | `4,439` |

- After placing a flag, Ernest lifts off the origin cell just **`37 ms`** after
  `right-button-up` (faster than `58 ms` after revealing new numbers), confirming
  that **`flag → chord` (`202 ms` press-to-press) is already one planned motor
  chunk**.
- The actual cognitive bottleneck is **`chord → flag` (`342 ms` press-to-press)**
  and **`reveal → flag` (`332 ms`)** — `+120–140 ms` slower because newly
  revealed numbers must be parsed to start the next chunk.

**Rule for all subgame analysis:** time every move **press-to-press**
(`ldown`/`rdown` to `ldown`/`rdown`) and measure target hover **pre-down**
(`downT − arriveT`).

---

## 2. Information Age (`deducible-since`) Overturns Naive Pattern Speeds

Tracking the exact step when every square first became provable separates four
distinct mental regimes inside naive `med(gapMs)`:

- **Fresh local (`age === 0`, `dist <= 2`, no detour, no no-op):** became
  provable *only* from the immediately preceding click — pure online pattern
  recognition.
- **Queued local (`age 1–3`, `dist <= 2`):** already provable 1–3 clicks ago in
  the same neighborhood — buffered motor follow-up inside a chunk.
- **Jump arrival (`dist >= 3`):** includes cross-board search and travel.
- **Detour-contaminated (`>= 120 ms` dwell over a non-target site `>= 2` cells
  away):** `7.9` detours/win (`4.48 s/win` overall, `7.69 s` in Slow Ernest vs
  `2.24 s` in Fast Ernest; `2.31 s/win` stolen from counting targets).

Ernest's Expert wins (`n = 140`, press-to-press, no no-ops, no detours):

| Technique | P2P All (`n`) | **Fresh Local** (`n`) | Queued Local (`n`) | Jump (`n`) | Fresh − Queued |
| --- | ---: | ---: | ---: | ---: | ---: |
| `flag-1-2-interior` | `471` (`365`) | **`936 ms`** (`22`) | `342 ms` (`111`) | `481` (`113`) | `+594 ms` |
| `reveal-1-2-interior` | `267` (`46`) | **`922 ms`** (`5`) | `202 ms` (`26`) | `382` (`5`) | `+720 ms` |
| `overlap-chain-flag` | `258` (`80`) | **`914 ms`** (`5`) | `257 ms` (`38`) | `360` (`5`) | `+658 ms` |
| `corner-1-3-1` | `552` (`51`) | **`862 ms`** (`13`) | `462 ms` (`10`) | `498` (`16`) | `+400 ms` |
| `flag-edge-1-2-1` | `502` (`169`) | **`705 ms`** (`19`) | `356 ms` (`38`) | `482` (`60`) | `+349 ms` |
| `reveal-edge-1-2-1` | `612` (`41`) | **`691 ms`** (`5`) | `482 ms` (`11`) | `612` (`13`) | `+209 ms` |
| `all-numbers` | `587` (`62`) | **`651 ms`** (`19`) | `322 ms` (`12`) | `452` (`15`) | `+329 ms` |
| `reveal-counting-noflag` | `372` (`1137`) | **`641 ms`** (`85`) | `241 ms` (`421`) | `547` (`160`) | `+400 ms` |
| `flag-1-2-wall` | `352` (`110`) | **`612 ms`** (`33`) | `245 ms` (`43`) | `558` (`8`) | `+367 ms` |
| `flag-exh-1-3` | `314` (`8045`) | **`511 ms`** (`200`) | `301 ms` (`2278`) | `452` (`1171`) | `+211 ms` |
| `reveal-1-1-interior` | `313` (`1396`) | **`502 ms`** (`131`) | `203 ms` (`554`) | `403` (`404`) | `+299 ms` |
| `reveal-1-1-wall` | `312` (`480`) | **`402 ms`** (`110`) | `242 ms` (`213`) | `517` (`46`) | `+160 ms` |
| `flag-exh-5plus` | `272` (`415`) | **`382 ms`** (`18`) | `230 ms` (`158`) | `452` (`28`) | `+152 ms` |
| `flag-exh-4-partial` | `282` (`1494`) | **`372 ms`** (`37`) | `281 ms` (`450`) | `521` (`92`) | `+91 ms` |
| `reveal-counting-after-flag` | `262` (`377`) | **`372 ms`** (`27`) | `232 ms` (`114`) | `372` (`51`) | `+140 ms` |
| `chord-multi` | `221` (`6139`) | **`212 ms`** (`3809`) | `213 ms` (`1696`) | `382` (`348`) | `-1 ms` |
| `chord-single-rim` | `203` (`3169`) | **`202 ms`** (`1897`) | `202 ms` (`901`) | `402` (`173`) | `0 ms` |

Key corrections over naive subgame analysis:
- **`overlap-chain-flag`** looked "fast" (`258–272 ms`) only because most flags
  were queued follow-ups; fresh entry takes **`914 ms`**.
- **No-flag counting reveals (`641 ms` fresh vs `372 ms` after-flag = `+269 ms`)**
  carry more than **twice** the cognitive cost naive averages (`+58–110 ms`)
  suggested, because Ernest uses physical flags as external working memory.
- **Wall `1-1` (`402 ms` fresh)** is already near counting speed, while
  **interior `1-1` (`502 ms`)**, **wall `1-2` (`612 ms`)**, **edge `1-2-1`
  (`705 ms`)**, **1-3-1 corner (`862 ms`)**, and **interior `1-2` (`936 ms`)**
  all remain slow deliberative parses on fresh entry.
- **Partially-flagged `4/5+` (`372–382 ms` fresh)** are actually fast once
  noticed; their time cost comes from **skipping them (`~25%`) and jumping back
  later (`521 ms`)**.
- **Chords (`202–212 ms`)** have `0 ms` fresh-minus-queued gap — they are pure
  reflexive motor completions of a planned flag.

---

## 3. Cursor-Led Reading (`2.0×` Drift, `8.2 s/win` Over Clues) vs. Eyes-Ahead Pipelining

### Continuous cursor speed and semantic target budget (`s/win`)

| Cohort | Total | Hover (`< 2 c/s`) | Slow Drift (`2–10 c/s`) | Fast Flight (`>= 10 c/s`) | Slow on open clues | Slow on other covered |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ernest Slow (`<= 1.65`) | `112.2 s` | `35.4 s` | `54.5 s` | `22.3 s` | `9.3 s` | `5.9 s` |
| Ernest All (`1.78`) | `99.8 s` | `31.0 s` (`31%`) | `47.6 s` (`48%`) | `21.2 s` (`21%`) | **`8.2 s`** | `3.0 s` |
| Ernest Fast (`>= 1.95`) | `91.4 s` | `28.0 s` | `43.2 s` | `20.2 s` | `6.9 s` | `1.4 s` |
| Pro `3.0–3.5` | `45.6 s` | `11.2 s` (`25%`) | `20.6 s` (`45%`) | `13.8 s` (`30%`) | `1.6 s` | `1.4 s` |
| Pro `4.5+` | `39.6 s` | `8.2 s` (`21%`) | `16.0 s` (`40%`) | `15.4 s` (`39%`) | **`1.3 s`** | `0.9 s` |

- **Local slow-move cursor looping (`dist <= 2`, `>= 450 ms`, no no-op):**
  - Ernest (`20.0/win`, `716 ms` avg): **`2.0×` median path/chord ratio** (`51%`
    slow drift `2–10 c/s`). He physically drifts the cursor in small loops over
    adjacent clue numbers while working out local deductions.
  - Pros `3.0–3.5` (`6.6/win`) and `4.5+` (`3.7/win`): **`1.0×–1.1×` median
    path/chord ratio**. Pros read with their eyes while the cursor stays parked
    or moves directly to the answer.

### Eyes-Ahead Pipelining & Area Selection on Cross-Board Jumps (`NF-fair`)

Defined strictly on `>= 4`-cell jumps after the local region has `0` safe
counting squares left (`dry-safe jump`), where the cursor departs within
`<= 45 ms` with `< 80 ms` slow non-target hovering:

| Cohort | 3BV/s | **Eyes-Ahead %** | Dry-Safe Jumps/win | Dry-Jump med | Counting-first choice % |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ernest Slow | `1.51` | **`6.8%`** | `24.2` | `704 ms` | `69%` |
| Ernest All | `1.78` | **`9.4%`** | `21.4` | `643 ms` | **`73%`** |
| Ernest Fast | `2.07` | **`11.3%`** | `18.9` | `602 ms` | `74%` |
| Pro `1.6–2.0` | `1.99` | **`11.2%`** | `14.9` | `780 ms` | `83%` |
| Pro `2.4–2.8` | `2.78` | **`23.9%`** | `14.5` | `630 ms` | `92%` |
| Pro `3.0–3.5` | `3.48` | **`34.6%`** | `14.2` | `480 ms` | **`94%`** |
| Pro `3.8–4.4` | `4.26` | **`45.0%`** | `13.7` | `450 ms` | `91%` |
| Pro `4.5+` | `4.92` | **`56.3%`** | `14.9` | `370 ms` | **`94%`** |

- **`Eyes-Ahead %` is the cleanest monotonic cognitive signature of skill in
  the entire dataset (`6.8% → 56.3%`)**: Ernest Fast (`11.3%`) matches
  `Pro 1.6–2.0` (`11.2%`) almost exactly, while sub-60 players (`3.0+`) have
  already visually acquired their next cross-board target on `35–56%` of
  frontier completions before finishing the old frontier.
- **Area-choice policy:** when both counting-easy and overlap-only frontiers
  exist on the board, `2.4–4.5+` pros pick a counting frontier **`91–94%`** of
  the time, whereas Ernest picks an overlap-only frontier **`27%`** of the time.
- **Dead-end frequency:** Ernest drains a frontier to `0` local safe squares
  **`21.4` times/win** vs **`14.2–14.9` times/win** across every pro tier.

---

## 4. Cognitive Chunking & What Breaks Flow

Fluid counting chunk = consecutive local (`dist <= 2`) counting moves at
`<= 380 ms` with no no-ops and `< 120 ms` slow non-target clue/cell hovering:

| Cohort | Mean Chunk Len | Entry med | Follow-up med | No-op breaks | Pattern walls | Local counting stalls | Dry-safe jumps | Jump past safe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ernest Slow | `2.17` | `530 ms` | `243 ms` | `27.4 s` | `18.9 s` | `17.3 s` | `9.8 s` | `5.6 s` |
| Ernest All | `2.35` | `513 ms` | `242 ms` | `26.5 s` | `13.2 s` | `12.7 s` | `7.7 s` | `4.6 s` |
| Ernest Fast | `2.53` | `493 ms` | `234 ms` | `23.5 s` | `9.8 s` | `10.3 s` | `6.0 s` | `4.8 s` |
| Pro `2.4–2.8` | `2.85` | `450 ms` | `170 ms` | `17.3 s` | `2.9 s` | `8.5 s` | `4.7 s` | `3.1 s` |
| Pro `3.0–3.5` | `3.12` | `400 ms` | `150 ms` | `9.4 s` | `2.3 s` | `4.4 s` | `4.4 s` | `3.4 s` |
| Pro `4.5+` | `2.86` | `320 ms` | `120 ms` | `10.4 s` | `2.3 s` | `2.5 s` | `3.2 s` | `3.7 s` |

Dissecting Ernest's **`12.7 s/win` of local counting stalls** (`21.7/win`):
- **By information age:** `Deferred (age 4+)` **`5.3 s/win`** (`8.4/win`),
  `Queued (1–3)` `4.0 s/win` (`7.0/win`), `Fresh (0)` `3.4 s/win` (`6.3/win`).
- **By transition:** `chord → flag` (`3.05 s/win`), `reveal → reveal`
  (`2.34 s/win`), `chord → chord` (`2.10 s/win`), `flag → chord` (`1.95 s/win`),
  `flag → flag` (`1.23 s/win`).
- **Whole multi-click motifs (Ernest All vs `Pro 4.5+`):**
  - `partial-4`: entry `390 ms` → follow `192 ms` → chord `263 ms` (Pro `4.5+`:
    `140 → 160 → 100 ms`).
  - `edge 1-2-1`: entry `642 ms` → follow `281 ms` (Pro `4.5+`: `350 ms`).
  - `interior 1-2`: entry `632 ms` → follow `202 ms` (Pro `4.5+`:
    `315 → 110 ms`).
  - `2-flag + chord`: `333 → 221 → 252 ms` (Pro `4.5+`: `160 → 160 → 100 ms`).

---

## 5. Pre-Death Mentation Breakdown (`111` Late Expert Losses)

| Window inside lost game | `n` | P2P gap med (`p25–p75`) | Pre-down hover | Preceded by no-op | Jump `>= 3` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Earlier baseline | `13,785` | `282 ms` (`211–483`) | `70 ms` | `14.3%` | `14.9%` |
| Last `5` moves before death | `555` | **`372 ms`** (`231–644`) | `74 ms` | `17.5%` | `20.2%` |
| **Fatal click itself** | `111` | **`514 ms`** (`292–1224`) | `74 ms` | **`27.9%`** | `21.6%` |

Late Expert losses are not caused by reckless speed bursts. They happen during
**flow breakdown**: tempo slows sharply across the last 5 moves (`+90 ms →
+232 ms`), jumps surge, and **no-op clicks double immediately before the fatal
click (`27.9%`)**.

---

## 6. Board-Size Clutter Tax (Beginner vs. Intermediate vs. Expert, `n = 80` each)

| Board | Hover / Drift / Fast | Pre-down (`rev / ch / flg`) | Chord P2P | Fresh Counting Flag | Fresh No-Flag Reveal | Fresh Overlap Reveal | **Fresh Overlap Flag** |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Beginner (`9×9`) | `30 / 45 / 24%` | `77 / 59 / 76 ms` | `202 ms` | `492 ms` | `517 ms` | `432 ms` | **`372 ms`** |
| Intermediate (`16×16`) | `31 / 47 / 20%` | `78 / 62 / 82 ms` | `221 ms` | `572 ms` | `577 ms` | `507 ms` | **`686 ms`** |
| Expert (`30×16`) | `29 / 48 / 23%` | `68 / 64 / 67 ms` | `203 ms` | `501 ms` | **`712 ms`** | `492 ms` | **`712 ms`** |

Motor and reflexive constants (`chord 202–221 ms`, pre-down hover `64–78 ms`,
speed split `30/47/22%`) are invariant across sizes, but **fresh overlap flags
slow by `+340 ms` (`372 → 712 ms`)** and **fresh no-flag counting reveals slow
by `+195 ms` (`517 → 712 ms`)** once embedded in `16×16` / `30×16` visual
clutter.

---

## 7. Design Blueprint for the Sub-Board Pattern Trainer (Derived Directly from Findings)

These findings rule out a naive single-click `5×5` cutout drill and specify five
non-negotiable requirements for the upcoming sub-board trainer:

1. **Cluttered sub-boards (`9×9` to `12×12`), never sterile `5×5` cutouts:**
   Ernest already spots uncluttered Beginner overlap flags in `372 ms`; the
   `+340 ms` bottleneck is **figure-ground segmentation amidst surrounding
   numbers, dead clues, walls, and partial flags** across all 8 orientations.
2. **Whole-chunk execution, not isolated clicks:** Each trial requires solving
   the full `2–4`-click local motif (e.g., `1-2-1` flags + safe click, or
   `partial-4` remaining flags + chord), scored separately on **Chunk Entry RT
   (press-to-press)**, **Follow-Up Tempo**, and **Zero No-Ops**.
3. **Bail-vs-Solve discrimination (`~25%` trap boards):** Mix boards where a
   slow coupled shape sits beside an easy counting pocket elsewhere — or where
   the board has no fast move (`Space` to bail) — directly training the `92–94%`
   pro counting-first selection policy and eliminating `13.2 s/win` pattern
   walls.
4. **Eyes-first / anti-drift feedback:** Score and surface **cursor path ratio**
   (`<= 1.25×` = eyes-first vs Ernest's `2.0×` clue-tracing loop) and **pre-down
   hover** (`<= 80 ms`) on every trial so the drill breaks cursor-led reading.
5. **Priority drill packs (ranked by verified fresh P2P & clutter gap):**
   1. *Cluttered No-Flag Counting Reveals* (`641 ms` fresh P2P, `+269 ms` over
      after-flag, `+195 ms` clutter tax — weaning working memory off mandatory
      flags).
   2. *Cluttered `Interior 1-2` & `Edge 1-2-1 / 1-2-2-1` Chunk Entry* (`705–936
      ms` fresh P2P, `+340 ms` clutter tax).
   3. *Ready Partial `4/5/6/7` Visual Pop-Out* (eliminating `25%` skips and
      `521 ms` jump-backs).
   4. *Endgame Direct Finishing* (`<= 5` safe squares left, zero pointless
      flags).
   5. *Two-Pocket Lookahead Transition* (finish pocket A and depart `< 50 ms`
      ballistically into pocket B, directly training `Eyes-Ahead %` from `9%`
      toward `35%+`).
