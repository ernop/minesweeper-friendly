# Board generators and top score keys

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/board-generators.md](../implementation/board-generators.md).

## Generator selection and scope

The board generator (`generators.js`) is the mine-placement algorithm — a third uniqueifier beside board dimensions and play mode.

- **Presets stay default:** Beginner, Intermediate, and Expert always use the default `uniform` generator and never show a Generator menu.
- **Shown only where applicable:** the `Generator` menu sits in `#mode-options` beside custom board dimensions strictly for non-preset modes that place mines via a generator (`Custom`, `3BV countdown`, `Angelic`, `Endgame drill`, `Coach:*`, `Board lab`). It is omitted (never silently ignored) in fixed-identity Trial modes ([Board and layout](board-and-layout.md#navigation-and-progressive-disclosure)).

## Generators

- **`uniform` (Default):** Fisher–Yates uniform placement (every valid first-click-safe layout equally likely).
- **`pink-noise`:** fractal octave-summed value-noise field ($1 / f^\alpha$), weighted sampling without replacement ($\exp(\text{contrast} \times z)$). Parameters: spectral exponent `alpha` (`0` white, `1` pink, `2` red/brown), feature size `scale`, `contrast`, and anisotropy `stretch` ($\log_2(x/y)$). Produces dense mine clumps and open plains.
- **`blue-noise`:** Mitchell's best-candidate sampling auditioning `spread` candidates per mine and taking the farthest from placed mines (`1` = uniform; higher = evenly spaced with few adjacent pairs).
- **`green-noise`:** single mid-frequency band-pass octave producing characteristic-sized clumps with even inter-clump spacing. Parameters: clump spacing and `contrast`.
- **`stippled`:** smooth red-noise density field sampled via best-candidate scored by `nearest-distance × local density`. Parameters: density feature size, density range (`0` = pure blue noise), and evenness.
- **`letterforms`:** places mines along seeded random uppercase `5 × 7` pixel letters across horizontal slots. Parameters: `letters` (`1–6`) and stroke `contrast`.
- **Removed generator (`patriotic`):** retired on `2026-08-30`; stored settings naming it fall back to `uniform` through normal schema validation, and old `+patriotic(...)` keys remain unreachable.

## Top score keys

A **top score key** uniquely identifies everything determining how a board is generated and played — dimensions, play mode, and non-default generator with exact schema-ordered parameter values:

- Default generator: `WxH/M@playMode` (e.g., `30x16/99@standard`; pre-`2026-08-21` keys omitting `@` mean Standard).
- Non-default generator: `WxH/M@playMode+generator(param=value,...)` (e.g., `9x9/10@standard+pink-noise(alpha=1,scale=8,contrast=2)`).

Every distinct top score key maintains its own isolated history and rankings. Records freeze `boardVersion` (algorithm version string) and non-default `generator` parameters at deal time so mid-game preference changes never contradict what was dealt.
