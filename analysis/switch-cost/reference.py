"""Reference fit for the stats panel's switch cost (switch-cost.js).

The study's model P1 (reference/mode-switch-2026-09-28.md), written
independently of the game's code with patsy and numpy: OLS on log interval
with game fixed effects (demeaned), cluster-robust (CR1) errors by game.

Input: the games' transitions as switch-cost.js produces them, a JSON list or
JSON lines of {"endedAt": ..., "rows": [...]}. Output: the fit as JSON, with
the same field names as SwitchCost.fit.

Usage: python reference.py GAMES.json[l] [OUT.json]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import patsy

KNOT_TOLERANCE = 1e-9
Z95 = 1.959963984540054


def read_games(path: Path) -> list[dict]:
    text = path.read_text()
    if text.lstrip().startswith('['):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def knots(values: np.ndarray, df: int) -> np.ndarray:
    """patsy's cr placement (extremes plus equally spaced percentiles of the
    distinct values), with values closer than KNOT_TOLERANCE counted once."""
    ordered = np.sort(values)
    distinct = [ordered[0]]
    for value in ordered:
        if value - distinct[-1] > KNOT_TOLERANCE:
            distinct.append(value)
    inner = np.percentile(np.asarray(distinct), np.linspace(0, 100, df)[1:-1].tolist())
    all_knots = np.concatenate(([ordered[0]], inner, [ordered[-1]]))
    if not np.all(np.diff(all_knots) > KNOT_TOLERANCE):
        raise ValueError('values cannot supply %d distinct knots' % df)
    return all_knots


def frame(games: list[dict]) -> pd.DataFrame:
    rows = []
    for game in games:
        for r in game['rows']:
            rows.append({
                'game': game['endedAt'], 'ipi': r['intervalMs'],
                'prev': r['prev'], 'next': r['next'],
                'S': float(r['switched']), 'T': float(r['leftMoveChanged']),
                'ID': r['fitts'], 'logOpenedPrev': np.log1p(r['openedByPrevious']),
                'zeroPrev': float(r['previousOpenedEmpty']), 'progress': r['progress'],
                'offered': float(r['offered']), 'logChordable': np.log1p(r['chordable']),
                'logSafe': np.log1p(r['safe']), 'logMine': np.log1p(r['mine']),
            })
    t = pd.DataFrame(rows)
    t['prev'] = pd.Categorical(t['prev'], ['reveal', 'chord', 'flag'])
    t['next'] = pd.Categorical(t['next'], ['reveal', 'chord', 'flag'])
    return t


def demean(values: np.ndarray, groups: np.ndarray) -> np.ndarray:
    _, inverse = np.unique(groups, return_inverse=True)
    sums = np.zeros((inverse.max() + 1, values.shape[1]))
    np.add.at(sums, inverse, values)
    counts = np.bincount(inverse).astype(float)
    return values - (sums / counts[:, None])[inverse]


def fit(games: list[dict]) -> dict:
    t = frame(games)
    k_id, k_open, k_prog = knots(t['ID'].to_numpy(), 4), knots(t['logOpenedPrev'].to_numpy(), 3), \
        knots(t['progress'].to_numpy(), 4)

    def spline_term(name, k):
        inner = ', '.join(repr(float(v)) for v in k[1:-1])
        return f'cr({name}, knots=[{inner}], lower_bound={float(k[0])!r}, upper_bound={float(k[-1])!r})'

    rhs = (f'C(prev) + C(next) + S + T + {spline_term("ID", k_id)} + {spline_term("logOpenedPrev", k_open)}'
           f' + zeroPrev + {spline_term("progress", k_prog)} + C(next):offered + logChordable + logSafe + logMine')
    design = patsy.dmatrix(rhs, t, return_type='dataframe')
    design = design.drop(columns=['Intercept'])
    groups = t['game'].to_numpy()
    X = demean(design.to_numpy(dtype=float), groups)
    y = demean(np.log(t['ipi'].to_numpy(dtype=float))[:, None], groups)[:, 0]
    keep = np.abs(X).sum(axis=0) > 1e-9
    names = [c for c, k in zip(design.columns, keep) if k]
    X = X[:, keep]
    _, r = np.linalg.qr(X)
    independent = np.abs(np.diag(r)) > 1e-8 * np.abs(np.diag(r)).max()
    X = X[:, independent]
    names = [c for c, k in zip(names, independent) if k]
    bread = np.linalg.inv(X.T @ X)
    beta = bread @ X.T @ y
    resid = y - X @ beta
    codes, inverse = np.unique(groups, return_inverse=True)
    scores = np.zeros((len(codes), X.shape[1]))
    np.add.at(scores, inverse, X * resid[:, None])
    n, p, g = X.shape[0], X.shape[1], len(codes)
    cov = g / (g - 1) * (n - 1) / (n - p) * bread @ (scores.T @ scores) @ bread
    s = names.index('S')
    b, se = float(beta[s]), float(np.sqrt(cov[s, s]))
    switch_ms = t.loc[t['S'] == 1, 'ipi'].to_numpy(dtype=float)
    median_switch = float(np.median(switch_ms))
    return {
        'status': 'measured', 'games': int(g), 'transitions': int(n), 'columns': int(p),
        'beta': b, 'se': se, 'percent': 100 * float(np.expm1(b)),
        'percentLow': 100 * float(np.expm1(b - Z95 * se)), 'percentHigh': 100 * float(np.expm1(b + Z95 * se)),
        'medianSwitchMs': median_switch, 'msPerSwitch': median_switch * float(-np.expm1(-b)),
        'switchShare': float(t['S'].mean()),
        'knots': {'fitts': k_id.tolist(), 'opened': k_open.tolist(), 'progress': k_prog.tolist()},
    }


def main() -> None:
    result = fit(read_games(Path(sys.argv[1])))
    text = json.dumps(result, indent=1)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
