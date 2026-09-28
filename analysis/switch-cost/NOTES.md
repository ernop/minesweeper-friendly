# Switch cost: independent reference fit

2026-09-28. The stats panel's switch cost
([docs/product/trace-metrics-panel.md](../../docs/product/trace-metrics-panel.md),
"Switching") comes from `switch-cost.js`. `reference.py` fits the same model,
the study's pre-registered P1 ([reference/mode-switch-2026-09-28.md](../../reference/mode-switch-2026-09-28.md)),
with patsy and numpy instead of the game's code, so the two can be compared
value for value.

## Run

```
python -m venv .venv && .venv/bin/pip install -r requirements.txt
node ../../tests/switch-cost-fixture.js /tmp/switch-cost-rows.jsonl
.venv/bin/python reference.py /tmp/switch-cost-rows.jsonl ../../tests/switch-cost-reference.json
node ../../tests/switch-cost-test.js
```

The input is the window's games as `switch-cost.js` emits them (a JSON list
or JSON lines of `{endedAt, rows}`); the output has the same field names as
`SwitchCost.fit`, plus the knots. Rows of real games can be written the same
way from the player's traces; they are personal data and stay out of the
repository.

## What agrees

- On the synthetic fixture (67 games, 2,884 transitions) the game's fit and
  this reference agree to 1e-14; `tests/switch-cost-test.js` holds them to
  1e-9.
- On the player's latest 500 standard games (2026-09-28) they agree to 4e-13.
  Both use knots on distinct values within 1e-9; patsy's own rule (exact
  distinct doubles) is sensitive to last-bit differences between numpy's and
  V8's arithmetic, which moved the study's knots slightly (+7.382% there,
  +7.383% here).
