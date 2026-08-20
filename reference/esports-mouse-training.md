# Out-of-game mouse training in esports — research survey

Compiled 2026-08-20 from web research. Scope: the tools players use to train
mouse aim outside their main game, what those tools measure and expose,
documented professional usage, uptake and persistence numbers, and the
peer-reviewed evidence on efficacy. Companion file:
`mouse-motion-metrics.md` (the metric vocabulary these tools draw on).

Epistemic labels used throughout: [documented] = primary source (interview,
paper, company/press release naming the fact), [company claim] = vendor's own
unaudited number, [tracker estimate] = third-party Steam-data estimator,
[community claim] = forum/blog consensus without a primary source. Content-farm
"pros use X" articles exist in volume and contradict each other; nothing below
rests on them except where flagged as an example of lore.

## 1. Tool landscape

### KovaaK's (FPSAimTrainer, Steam, 2018, $9.99)

The scenario-library trainer. 200,000+ community-made scenarios [company
claim]; clones the mouse-input physics of major games so sensitivity transfers
1:1. The hardcore/competitive community's default; the Voltaic benchmarks run
on it. Trains via timed scenarios (usually 60 s) in three broad families:
clicking (static/dynamic targets), tracking (following strafing bots), and
target switching (flick-then-track chains).

Data exposed:
- Per-run CSV files written locally to
  `steamapps/common/FPSAimTrainer/FPSAimTrainer/stats/` (per-kill rows,
  accuracy, time-to-kill, shots, score; export mode configurable in options).
  Community tooling parses them (KovaakStats, KovaaKs-Stats-Analysis on
  GitHub).
- Online per-scenario leaderboards at kovaaks.com plus an undocumented public
  API; third-party trackers (evxl.app, Naxeron/kovaaks-tracker) are built on
  it. No published datasets.

### Aimlabs (formerly Aim Lab, Statespace / State Space Labs, 2018, free)

The mass-market trainer. Free, on Steam/Epic/Xbox/PS5/iOS/Android. Task-based
(Gridshot, Spidershot, etc.) with per-task psychophysics-style analysis:
reaction time, kinematics, speed-accuracy profile, "weakness detection" with
recommended tasks. Founded by neuroscientist Wayne Mackey; positions itself
as a data/analytics company ("tools, datasets, and analytics to improve
performance training"). Official Benchmark system (seasonal ranked
assessment) launched 2025 per Wikipedia; one comparison site says 2024.

Data exposed:
- In-app per-run and per-task history, percentile ranks, leaderboards. No
  public API or data export; local data is not in an open format.
- Academic collaborations are the one route to its data: Frontiers in Human
  Neuroscience 2021 (longitudinal learning, N = 7,174 sampled from its player
  base) and 2022 (kinematics of 32 pros) used internal Statespace data,
  IRB-approved, not publicly released.
- Riot Games is a minority shareholder (2022) and Aimlabs is the official
  training/coaching platform of VALORANT esports [documented].

### Voltaic (community + benchmarks, 2019-)

Not a trainer but the dominant training community and rank system layered on
KovaaK's (and an Aimlabs edition). Benchmarks: three difficulty tiers
(Novice/Intermediate/Advanced), nine subcategories across clicking, tracking,
and target switching; per-scenario scores convert to "energy", overall rank is
a harmonic mean (low subcategories weighted more), ranks Iron through Nova
(Platinum, Diamond, Jade, Master, Grandmaster in between). Rank claims are
granted via Discord bot; leaderboards on app.voltaic.gg. Also publishes
starter guides, issue-specific routines, and game-specific routines, and
fields its own esports/aiming team.

### Aimer7's guide (free PDF, 2019)

"KovaaK aim workout routines" — the canonical theory text of the community.
Divides aim into tracking, click-timing (his term; he explicitly rejects
"flicking" as a style), and target switching. Prescribes per-skill-level
routines of named scenarios with minute allocations (typically 45-75
min/day), sensitivity ranges per style (20-25 cm/360 for tracking, >30 cm/360
for click-timing), and principles (smooth undershoot over flick-overshoot;
accuracy ~85% before speed). Community consensus circa 2024-2026 is that
routines have moved on (Voltaic, "Sparky" routines) but the principles
remain the reference [community claim].

### osu! as a trainer

Community consensus, including inside the osu! forums: not an aim trainer.
2D fixed-screen cursor aim does not transfer to 3D camera-rotation aim beyond
generic mouse control and reaction-time gains [community claim, uncontested].
Derivatives exist that project osu! beatmaps into a 3D FPS camera (FPosu!,
McOsu) but pale next to purpose-built trainers even by fans' accounts.

### Aiming.Pro (browser, freemium)

Browser-based trainer with unusually explicit HCI-style metrics: path
efficiency, overshoot/undershoot, initial movement angle, per-shot trends
(see `mouse-motion-metrics.md`). Its own FAQ concedes the peer-reviewed
evidence base for transfer is thin. Useful as the most metrics-transparent
of the trainers.

### Newer / adjacent (2024-2026)

- Aimbeast (Steam, ~$8): AI bots that imitate human strafing, recoil-pattern
  simulation, movement-while-aiming scenarios. Positioned as the
  realism/movement complement; no first-party benchmark tiers.
- Refrag (subscription, $7-15/mo): CS2-specific, runs inside CS2 via server
  tooling — drills, bootcamps, utility practice. Aim training moving back
  into the game rather than out of it.
- 3D Aim Trainer (SteelSeries GG, free, browser/app): casual tier.
- In-game options keep absorbing the use case: CS2 workshop maps (Aim Botz),
  Valorant's Range, deathmatch modes. Several pros cite these as sufficient
  (section 2).
- Aimlabs added multiplayer matchmaking (Feb 2026 MSI event) and runs
  sponsored competitions (Logitech G Playdays, $15K-$100K+ prize pools)
  [documented press releases].

## 2. Professional usage

### Documented

- Riot Games took a minority stake in Statespace and made Aim Lab the
  official training and coaching platform of VALORANT esports (May 2022).
  Riot's own announcement asserts "millions of VALORANT players (including
  the pros) use Aim Lab to warm up" [documented, but the pro-usage sentence
  is promotional].
- TenZ (Valorant, Sentinels; first Radiant, VCT champion): official Aimlabs
  "Pro Competitive Course" built around his routine; quoted endorsing Aim Lab
  as warmup on the Aimlabs VCT partner page [documented, sponsored].
- NiKo (CS2, Falcons) in a September 2025 ProSettings interview: has tried
  Aimlab, KovaaK's, and Refrag; "they've never fully replaced DM for me" —
  his training is deathmatch plus occasional Aim Botz [documented
  non-usage].
- donk (CS2, Team Spirit; consensus best CS2 player 2024-25) in Forbes
  Russia / esports.gg interviews: team practice plus up to seven FACEIT
  matches a day; plays little deathmatch (calls its duels unrealistic);
  no aim trainer in the described routine [documented non-usage].
- shroud (ex-CS:GO pro, streamer), on stream: "You've got to play a lot of
  games and know how to learn"; rejects training-mode shortcuts for Tarkov
  ("The only way you get better at this game, is just playing")
  [documented statements]. Claims that he grinds KovaaK's flick routines
  circulate only on content-farm sites [lore].
- Voltaic's about page claims its roster members earned an ALGS (Apex) 2022
  MVP and CS tournament MVPs [company claim, checkable against event
  records].
- The 2022 Frontiers study itself documents 32 professional/semi-pro players
  (4 Valorant, 10 PUBG, 18 Rainbow Six Siege) doing assessment tasks in Aim
  Lab — evidence that teams/orgs run pros through these tools at least for
  measurement [documented].

### Community claims and lore

- s1mple (CS): warms up with Aim Botz (500-1000 kills) and deathmatch, not
  standalone trainers; has said raw aim is 30-40% of CS skill [community
  claim, widely repeated, no primary interview located].
- Genburten (Apex): blog articles describe a 30-45 min KovaaK's tracking
  routine; he is a controller player, which makes the claim implausible —
  a clean example of content-farm lore contradicting basic facts.
- Valorant pros hiring dedicated aim coaches (e.g., dapr) [community claim,
  VLR forum].
- Pattern across sources: the defensible generalization is that aim trainers
  are a warmup/supplement of 10-60 min/day for some pros (skewing Valorant/
  Apex/tracking games), while many elite CS players train aim in-game only.
  Tactical-shooter coaches on record estimate aim is the true rank
  bottleneck for under 5-20% of their students [community claim, coach
  interviews on YouTube].

## 3. Uptake

- Aimlabs registered players: 1.5M total (March 2020) → 20M total, 5M MAU
  (September 2021, $50M raise announcement) → 30M+ (June 2023 Steam launch)
  → 45M+ lifetime (2025-2026 press releases) [company claims]. The 2021
  MAU/total ratio (25%) is the only engagement ratio ever disclosed, and it
  is from the COVID peak.
- Aimlabs Steam concurrents: ~4,000-6,000 average, 2024-2026; all-time peak
  15,141 (Aug 2024); ~136K Steam reviews, 91% positive [tracker estimates:
  Steambase, SteamPulse, raijin.gg]. Console/mobile usage not public.
- KovaaK's owners: 500K-1M (SteamSpy bracket; 539K point estimate), up to
  ~850K by other estimators [tracker estimates]. Concurrents: ~1,400 average
  in 2023 rising to ~2,500-2,600 average in early 2026, all-time peak ~4,000
  [tracker estimates: Steam Charts, stmstat]. ~40K Steam reviews, 93%
  positive.
- Voltaic: 113,966 Discord members (27,887 online at sample time)
  [documented, Discord invite page]; 1.6M players and 50M+ plays of its
  benchmark scenarios across platforms, 4,000+ rank roles granted [company
  claims]. The rank-role number vs member number implies most members never
  claim a rank.
- Ratio worth noting: 45M lifetime registrations vs ~5K Steam concurrents
  means registered-to-active conversion is tiny; both trainers combined hold
  roughly 5,000-9,000 concurrent players at any moment against player bases
  of millions in the games they feed.
- Fraction of ranked/pro players using trainers: no rigorous survey exists.
  Community polls (VLR.gg) show a spread from "ranked is my aim trainer" to
  700+ hours in KovaaK's at Immortal; no denominator, no sampling frame.

## 4. Persistence

- Best data: Frontiers in Human Neuroscience 2021 longitudinal study (Aim
  Lab internal data). Sampling frame: 100,000 random new accounts (signed up
  Jul 2020-Jan 2021) that played on more than one date; inclusion criteria
  left N = 7,174 players / 682,564 runs of Gridshot. Attrition within that
  already-filtered sample: N = 7,174 at play-days 1-2, N = 82 by play-day 60
  — ~1% of multi-day players accumulate 60 days of practice [documented].
  This is the closest thing to a hard churn number in the literature.
- Same study, retention of learning (not of users): players kept ~65% of a
  day's improvement to the next day early on, declining to a ~40% plateau
  after day 10. Hit rate (accuracy) saturated within ~3-5 days; hits per
  second (speed-accuracy product, "motor acuity") kept improving through
  day 60 with no plateau. Diminishing returns per session: maximum next-day
  benefit near ~1 h of play, 90% of the benefit by ~30-50 min [documented].
- Aim Lab player-base survey (N = 4,700, in-game): ~90% male, median age 18
  [documented, self-selected sample].
- Aimlabs average lifetime playtime on Steam: ~194 h per tracked player
  [tracker estimate, SteamPulse; provenance murky — likely skewed toward
  engaged users].
- "Aim training is a phase" is a live community position: VLR threads call
  it useful for the first 20-30 hours and wasted beyond; the counter-position
  (Raw Input essay by a top-10 benchmark player) is that heavy grinding is
  for the benchmark minigame itself, and a steady-state FPS player settles
  at ~15 min warmup plus 30-40 min targeted work, benchmarking weekly
  [community claims, both sides].
- Steam concurrents (section 3) show neither trainer collapsing: KovaaK's
  roughly doubled its average concurrents 2023→2026; Aimlabs declined ~35%
  from its 2024 peak but is stable. Persistence of the category is better
  established than persistence of any individual user.

## 5. Techniques and efficacy evidence

### Routine structure (Aimer7 / Voltaic orthodoxy)

- Skill taxonomy: clicking/click-timing (precise single shots), tracking
  (continuous crosshair contact on a moving target), target switching
  (flick + re-acquire chains). Voltaic subdivides each into three
  subcategories (e.g., static/dynamic clicking; smooth/reactive tracking).
- A routine is a playlist of named scenarios with per-scenario minutes,
  totalling 30-75 min/day, tilted toward the trainee's weak category and
  their game's demands (tactical shooters → clicking; Apex/Overwatch →
  tracking).
- Benchmark days are separated from training days: benchmarks are max-effort
  score attempts for rank placement; training days emphasize submaximal
  deliberate practice (accuracy ceilings ~85% before pushing speed, smooth
  undershoot over flick-and-correct).
- Warmup use is distinct from improvement use: 10-20 min pre-match vs
  structured daily blocks. Most pro usage that is documented at all is the
  warmup kind.

### Peer-reviewed evidence

- Learning within trainers is real and well-characterized: Frontiers 2021
  (above) — accuracy saturates fast, speed-accuracy product improves for
  60+ days; ~30-60 min/day is the efficient dose; consistency matters more
  than volume; better baseline → smaller gains.
- Trainers are reliable measurement instruments: Frontiers in Sports and
  Active Living 2024 pilot (N = 10 esports players, KovaaK's): test-retest
  ICC 0.947-0.995 across flicking/tracking/peeking tasks — scores are
  stable enough to detect real change [documented].
- Expertise shows in kinematics, not just scores: Frontiers 2022 (32 pros,
  Aim Lab): task demands reshape movement; motor-acuity differences track
  kinematic differences (reaction time, peak speed, corrective submovements,
  swipe-vs-flick classification); Fitts's law fit the pro data poorly
  [documented].
- The missing link is transfer: no controlled trial demonstrates that
  trainer gains cause in-game rank/performance gains. Aiming.Pro's own FAQ
  and neutral reviews state this openly; the cognitive-training literature's
  default (trained-task gains generalize weakly) is the appropriate prior.
  Community belief in transfer of raw mouse control at matched sensitivity
  is plausible but unproven [community claim].

## What data is actually obtainable

1. KovaaK's local per-run CSVs — full per-session metrics for any player who
   opts in; open format; existing parsers on GitHub.
2. KovaaK's leaderboard API (undocumented) — per-scenario score
   distributions at scale; third-party sites already scrape it.
3. Voltaic benchmark spreadsheets and app.voltaic.gg leaderboards — rank
   thresholds and claimed-rank distributions; the S4/S5 threshold tables are
   public documents.
4. Steam trackers (Steam Charts, SteamSpy, Steambase, etc.) — concurrents
   and ownership brackets for uptake/persistence time series.
5. Aimlabs data — closed; only reachable through Statespace academic
   collaboration (two Frontiers papers prove the route exists).
6. Published papers' summary statistics (learning curves, retention rates,
   dose-response, ICCs) — directly citable; underlying data not released.

## Sources

- KovaaK's Steam page / stats trackers: https://steamcharts.com/app/824270,
  https://stmstat.com/app/824270, https://steamspy.com/dev/KovaaK+Games,
  https://raijin.gg/app/824270/KovaaKs
- Aimlabs stats trackers: https://steambase.io/games/aimlabs/steam-charts,
  https://steampulse.org/game/714010, https://thegametraders.com/games/aimlabs
- Aimlabs Wikipedia (growth timeline, benchmark launch):
  https://en.wikipedia.org/wiki/Aimlabs
- Statespace $50M raise, MAU numbers (GamesBeat, 2021):
  https://gamesbeat.com/aim-lab-maker-statespace-raises-50m-for-game-and-health-performance-training/
- Aimlabs Steam launch, 30M players (GamesRadar, 2023):
  https://www.gamesradar.com/fps-practice-tool-aimlabs-shoots-to-the-top-of-steams-best-sellers-list/
- Statespace press releases, 45M lifetime players (2026):
  https://www.gamespress.com/Aimlabs-Announces-Aimlabs-X-MSI-Year-of-the-Horse-Duos-Event-For-Lunar,
  https://www.gamespress.com/en-US/Statespace-Labs-Inc-Announces-the-Launch-of-Logitech-G-PLAYDAYS-x-Aiml
- Riot Games x Aim Lab announcement:
  https://www.riotgames.com/en/news/aim-lab-and-riot-headed-to-the-next-level
- Riot minority stake coverage: https://esportsinsider.com/2022/05/aimlab-statespace-riot-games,
  https://www.washingtonpost.com/video-games/2022/05/18/riot-aim-lab-valorant/
- TenZ Aimlabs course: https://aimlabs.com/courses/7qomjBJ1VziOMBejmvHQ0a?gameTag=VALORANT,
  https://partners.aimlab.gg/valorant
- NiKo interview (ProSettings, Sep 2025):
  https://prosettings.net/blog/niko-cs2-interview-september-2025/
- donk routine (dust2.us / esports.gg):
  https://www.dust2.us/news/59400/donk-reveals-his-pro-player-routine,
  https://esports.gg/news/counter-strike-2/donk-reveals-his-cs2-practice-routine/
- shroud statements: https://win.gg/news/shroud-gives-advice-for-anyone-to-reach-his-level/,
  https://www.dexerto.com/escape-from-tarkov/shroud-reveals-how-players-can-improve-their-escape-from-tarkov-skills-1319360/
- Voltaic: https://voltaic.gg/, https://voltaic.gg/about,
  https://app.voltaic.gg/benchmarks, https://discord.com/invite/voltaic
- Aimer7 guide (Steam guide + PDF):
  https://steamcommunity.com/sharedfiles/filedetails/?id=1679977919
- Aiming.Pro on evidence: https://aiming.pro/does-aim-training-work
- osu!-as-trainer discussions: https://osu.ppy.sh/community/forums/topics/912641,
  https://osu.ppy.sh/community/forums/topics/1240371
- Frontiers in Human Neuroscience 2021, "Long-Term Motor Learning in the
  'Wild' With High Volume Video Game Data" (Aim Lab, N = 7,174):
  https://doi.org/10.3389/fnhum.2021.777779
- Frontiers in Human Neuroscience 2022, "Assessment of human expertise and
  movement kinematics in first-person shooter games" (32 pros):
  https://doi.org/10.3389/fnhum.2022.979293
- Frontiers in Sports and Active Living 2024, "KovaaK's aim trainer as a
  reliable metrics platform..." (reliability pilot):
  https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1309991/full
- KovaaK's data tooling: https://github.com/Bredgren/KovaakStats,
  https://github.com/JoshLovesFun/KovaaKs-Stats-Analysis,
  https://github.com/Naxeron/kovaaks-tracker, https://evxl.app/
- Aim training persistence debate: https://www.vlr.gg/390266/aim-train-players-are-sore-losers/,
  https://www.vlr.gg/455072/the-aim-community/, https://rawinput.net/resources/topten,
  https://www.vlr.gg/93207/do-you-use-an-aim-trainer
- Apex routine notes and Aimer7-to-Sparky transition:
  https://github.com/riddbtw/apex-aiming
- Tool comparisons (2026): https://fpstrain.us/kovaaks-vs-aim-lab-vs-aimbeast-2026-deep-comparison.html,
  https://avidachievers.com/achievements/best-aim-trainer-2026/
