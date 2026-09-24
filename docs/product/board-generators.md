# Board generators and top score keys (decided 2026-08-25)

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/board-generators.md](../implementation/board-generators.md).

The board generator is the algorithm that places the mines — a third
uniqueifier next to board size and play mode. The upper-right cluster
has a Generator menu below the Mode menu. The registry lives in
`generators.js`; the menu is disabled (never silently ignored) in modes
that place their own boards: Single-path NG carves corridors, trials
deal fixed identities.

- **Default.** The uniform Fisher-Yates placement standard play has
  always used (every layout equally likely, first click never a mine).
- **Pink noise.** Mines drawn from a fractal (octave-summed) value-noise
  field with power spectrum ≈ 1/f^alpha, by exact weighted sampling
  without replacement (weight exp(contrast × standardized field)).
  Parameters: spectral exponent alpha (0 = white/uniform, 1 = pink,
  2 = red/brown; the slider is the whole colored-noise family on the
  clustered side), feature size (base wavelength in cells), contrast
  (0 = uniform regardless of the field; higher hugs the field peaks),
  and stretch (anisotropy as log2 of the x:y feature ratio: 0 = round
  features, positive = horizontal streaks, negative = vertical veins).
  Produces dense mine clumps and open plains.
- **Blue noise.** Mitchell's best-candidate sampling: each mine
  auditions `spread` uniform candidates and takes the one farthest from
  every placed mine. spread 1 is exactly uniform; higher is more even.
  Produces evenly spaced mines with few adjacent pairs.
- **Green noise.** One mid-frequency octave only (band-pass — the
  halftoning literature's green noise): mine clumps of one
  characteristic size with even spacing between clumps. Parameters:
  clump spacing (the band's wavelength; clumps about half that wide)
  and contrast.
- **Stippled.** A smooth large-scale density field (red-noise slope)
  rendered the way stippling renders ink: best-candidate scored by
  nearest-distance × local density, so spacing is locally even — tight
  in dense regions, wide in sparse ones. Parameters: density feature
  size, density range (0 = pure blue noise), evenness (candidates).
- **Letterforms.** Mine density follows random uppercase letters from a
  built-in 5×7 pixel font, one per equal horizontal slot, letters drawn
  from the game seed like the rest of the layout — the solved board
  spells them in mines. Parameters: letters (1–6) and stroke contrast
  (stroke cells weigh e^contrast against 1; high values put nearly all
  mines in the strokes).
A seventh generator, **Patriotic** (stars-and-stripes: a best-candidate
star-field canton plus alternating dense/sparse stripes), shipped
2026-08-25 and was removed 2026-08-30 by decision. Stored settings that
still name it fall back to the default generator via the normal
validation path; its old top score keys (`+patriotic(...)`) simply stop
being reachable.

In Standard and Angelic the generator places the board directly; in
Uniform NG and Proof-or-die it supplies the candidates for the
generate-and-reject loop, so a colored-noise NG board is noise-shaped
AND fully solvable (the attempt budget still fails loudly).

**The top score key** is the single high-level concept: everything that
determines how a board is made and played — board parameters, play
mode, and the generator with its exact parameter values — and every
key holds its own separate history and rankings. Concretely the key is
`WxH/M@playMode` plus a `+generator(param=value,...)` suffix in schema
order, e.g. `9x9/10@standard+pink-noise(alpha=1,scale=8,contrast=2)`.
The default generator adds no suffix, so every pre-generator key is
already a valid top score key, exactly as keys without `@` mean
Standard. Records carry the same facts: `boardVersion` names the
placement algorithm version (one string per generator) and `generator`
stores the non-default id plus its complete parameter set; both are
frozen per board at deal time, so a mid-board settings import cannot
make a record disagree with the placement that actually ran.
