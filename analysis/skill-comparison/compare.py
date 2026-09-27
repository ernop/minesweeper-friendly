"""Compare games in the shared format (corpus_actions.py, user_games.js).

For every game: economy (IOE and action counts per 3BV), the gaps between
consecutive inputs, and each gap between different cells split into
  reaction: previous input -> cursor has left its spot by ONSET_CELLS,
  travel:   movement onset -> start of the final stay in the target cell,
  hover:    that arrival -> the input.
Groups: the player's own wins (all, and the fastest FASTEST_OWN), and each
corpus time band. Values are medians over games of per-game medians, so one
long game cannot dominate; distance bins pool gaps across a group's games.

Usage: python compare.py OUT.json GAMES.jsonl [GAMES.jsonl ...]
"""
import json
import math
import statistics
import sys
from collections import defaultdict

ONSET_CELLS = 0.25
PAUSE_MS = 1000
FASTEST_OWN = 20
DISTANCE_BINS = [(1, 2), (2, 4), (4, 8), (8, 99)]
# Corpus groups by each game's own time in seconds, [low, high).
TIME_BANDS_S = [(0, 40), (40, 50), (50, 60), (60, 75), (75, 110), (110, 1000)]


def time_band(time_s: float) -> str:
    for low, high in TIME_BANDS_S:
        if low <= time_s < high:
            return f'corpus {low}-{high} s'
    raise ValueError(f'a {time_s} s game is outside every time band')


def load(paths: list[str]) -> list[dict]:
    games = []
    for path in paths:
        with open(path) as f:
            games.extend(json.loads(line) for line in f if line.strip())
    return games


def movement_split(samples: list, start: int, t_prev: float, t_next: float, target: tuple[int, int]):
    """Reaction, travel, and hover for one gap, or None when the cursor never
    visibly left its spot or never settled in the target before the input."""
    i = start
    while i + 1 < len(samples) and samples[i + 1][0] <= t_prev:
        i += 1
    x0, y0 = samples[i][1], samples[i][2]
    onset = None
    j = i + 1
    while j < len(samples) and samples[j][0] <= t_next:
        if onset is None and math.hypot(samples[j][1] - x0, samples[j][2] - y0) >= ONSET_CELLS:
            onset = samples[j][0]
        j += 1
    last = j - 1
    k = last
    while k > i and (math.floor(samples[k][1]), math.floor(samples[k][2])) == target:
        k -= 1
    if k == last or onset is None:
        return None, i
    arrival = samples[k + 1][0]
    if arrival < onset:
        return None, i
    return (onset - t_prev, arrival - onset, t_next - arrival), i


def game_measures(game: dict) -> dict:
    actions = game['actions']
    samples = game['samples']
    time_s = game['timeMs'] / 1000
    counts = defaultdict(int)
    for action in actions:
        counts[action[3]] += 1
    gaps, splits = [], []
    cursor = 0
    for prev, nxt in zip(actions, actions[1:]):
        gap = nxt[0] - prev[0]
        distance = math.hypot(nxt[1] - prev[1], nxt[2] - prev[2])
        gaps.append((gap, distance))
        if distance >= 1:
            split, cursor = movement_split(samples, cursor, prev[0], nxt[0], (nxt[1], nxt[2]))
            if split is not None:
                splits.append((distance, *split))
    path = sum(math.hypot(b[1] - a[1], b[2] - a[2]) for a, b in zip(samples, samples[1:])
               if actions[0][0] <= a[0] and b[0] <= actions[-1][0])
    total_gap = sum(g for g, _ in gaps)
    return {
        'timeS': time_s, 'bv3': game['bv3'], 'bvPerS': game['bv3'] / time_s,
        'inputs': len(actions), 'ioe': game['bv3'] / len(actions), 'inputsPerS': len(actions) / time_s,
        'flagsPer3bv': counts['flag'] / game['bv3'], 'chordsPer3bv': counts['chord'] / game['bv3'],
        'revealsPer3bv': counts['reveal'] / game['bv3'], 'noops': counts['noop'],
        'medianGapMs': statistics.median(g for g, _ in gaps),
        'pauseShare': sum(g for g, _ in gaps if g > PAUSE_MS) / total_gap,
        'pausesPer100Inputs': 100 * sum(1 for g, _ in gaps if g > PAUSE_MS) / len(gaps),
        'pathCellsPer3bv': path / game['bv3'],
        'medianReactionMs': statistics.median(s[1] for s in splits) if splits else None,
        'medianTravelMs': statistics.median(s[2] for s in splits) if splits else None,
        'medianHoverMs': statistics.median(s[3] for s in splits) if splits else None,
        'splitShare': len(splits) / max(1, sum(1 for _, d in gaps if d >= 1)),
        '_gaps': gaps, '_splits': splits,
    }


def summarize(measures: list[dict]) -> dict:
    keys = [k for k in measures[0] if not k.startswith('_')]
    out = {'games': len(measures)}
    for key in keys:
        values = [m[key] for m in measures if m[key] is not None]
        out[key] = statistics.median(values)
    bins = {}
    for low, high in DISTANCE_BINS:
        gaps = [g for m in measures for g, d in m['_gaps'] if low <= d < high]
        splits = [s for m in measures for s in m['_splits'] if low <= s[0] < high]
        bins[f'{low}-{high}'] = {
            'gaps': len(gaps), 'medianGapMs': statistics.median(gaps) if gaps else None,
            'medianReactionMs': statistics.median(s[1] for s in splits) if splits else None,
            'medianTravelMs': statistics.median(s[2] for s in splits) if splits else None,
            'medianHoverMs': statistics.median(s[3] for s in splits) if splits else None,
        }
    out['byDistance'] = bins
    return out


def main() -> None:
    games = load(sys.argv[2:])
    groups: dict[str, list[dict]] = defaultdict(list)
    own = []
    for game in games:
        measures = game_measures(game)
        if game['source'] == 'self':
            own.append(measures)
        else:
            groups[time_band(game['timeMs'] / 1000)].append(measures)
    own.sort(key=lambda m: m['timeS'])
    result = {'you, all wins': summarize(own), f'you, fastest {FASTEST_OWN}': summarize(own[:FASTEST_OWN])}
    for name in sorted(groups, key=lambda n: float(n.split()[1].split('-')[0])):
        result[name] = summarize(groups[name])
    with open(sys.argv[1], 'w') as f:
        json.dump(result, f, indent=1)
    rows = ['games', 'timeS', 'bv3', 'bvPerS', 'ioe', 'inputsPerS', 'flagsPer3bv', 'chordsPer3bv',
            'revealsPer3bv', 'noops', 'medianGapMs', 'pauseShare', 'pausesPer100Inputs', 'pathCellsPer3bv',
            'medianReactionMs', 'medianTravelMs', 'medianHoverMs', 'splitShare']
    names = list(result)
    print('measure'.ljust(22) + ''.join(n[:17].rjust(18) for n in names))
    for row in rows:
        cells = []
        for n in names:
            v = result[n][row]
            cells.append(f'{v:.3f}' if isinstance(v, float) and v < 10 else f'{v:.0f}' if isinstance(v, (int, float)) else str(v))
        print(row.ljust(22) + ''.join(c.rjust(18) for c in cells))
    for low, high in DISTANCE_BINS:
        key = f'{low}-{high}'
        for part in ['medianGapMs', 'medianReactionMs', 'medianTravelMs', 'medianHoverMs']:
            cells = []
            for n in names:
                v = result[n]['byDistance'][key][part]
                cells.append('-' if v is None else f'{v:.0f}')
            print(f'{key} cells {part}'.ljust(22) + ''.join(c.rjust(18) for c in cells))


if __name__ == '__main__':
    main()
