"""Generate a synthetic gameplay trace in the game's traces-export format.

Purpose: prove the extract_features.py pipeline end-to-end without real
gameplay data. The trace simulates point-and-click play: curved cursor
paths (quadratic Bezier with sub-pixel noise), event-driven sampling at
60-125 Hz, thinking pauses between movements, left-click press/release
pairs on arrival, and two right clicks. Seeded, so the output is
reproducible byte for byte.

This is a test fixture generator, not a human-likeness model.
"""

import json
import math
import random
from pathlib import Path

OUT_PATH = Path(__file__).parent / 'synthetic-trace.json'
SEED = 20260820

SAMPLE_INTERVAL_MS = (8.0, 16.0)      # 125-62.5 Hz event-driven sampling
MOVEMENT_MS = (350.0, 900.0)          # one point-and-click movement
PAUSE_MS = (300.0, 1200.0)            # thinking pause before the next move
CLICK_HOLD_MS = (60.0, 120.0)         # ldown -> lup
CURVE_BOW_RATIO = (0.08, 0.25)        # control-point offset / chord length
NOISE_PX = 0.4                        # per-sample jitter

# Cursor waypoints roughly on a 9x9 board drawn at ~32 px cells.
WAYPOINTS = [(210.0, 180.0), (420.0, 300.0), (350.0, 460.0),
             (520.0, 220.0), (260.0, 340.0), (450.0, 410.0),
             (300.0, 250.0)]
RIGHT_CLICK_AT = {2, 4}               # waypoint indexes flagged, not revealed


def bezier(p0: tuple[float, float], p1: tuple[float, float],
           p2: tuple[float, float], s: float) -> tuple[float, float]:
    u = 1.0 - s
    return (u * u * p0[0] + 2 * u * s * p1[0] + s * s * p2[0],
            u * u * p0[1] + 2 * u * s * p1[1] + s * s * p2[1])


def minimum_jerk(s: float) -> float:
    """Position profile of a natural reaching movement (Flash & Hogan
    1985): slow-fast-slow along the path."""
    return 10 * s**3 - 15 * s**4 + 6 * s**5


def main() -> None:
    rng = random.Random(SEED)
    t = 0.0
    sample_t: list[float] = []
    sample_x: list[float] = []
    sample_y: list[float] = []
    events: list[dict] = [{
        't': 0.0, 'kind': 'layout',
        'left': 178.0, 'top': 132.0, 'width': 288.0, 'height': 288.0,
        'boardWidth': 9, 'boardHeight': 9,
    }]

    pos = WAYPOINTS[0]
    for i, target in enumerate(WAYPOINTS[1:], start=1):
        # Thinking pause: no samples are emitted while the cursor is still.
        t += rng.uniform(*PAUSE_MS)

        chord = math.hypot(target[0] - pos[0], target[1] - pos[1])
        bow = rng.uniform(*CURVE_BOW_RATIO) * chord * rng.choice((-1.0, 1.0))
        mid = ((pos[0] + target[0]) / 2, (pos[1] + target[1]) / 2)
        # Perpendicular offset of the control point bows the path.
        ux, uy = (target[1] - pos[1]) / chord, -(target[0] - pos[0]) / chord
        control = (mid[0] + bow * ux, mid[1] + bow * uy)

        duration = rng.uniform(*MOVEMENT_MS)
        move_t = 0.0
        while move_t < duration:
            move_t = min(move_t + rng.uniform(*SAMPLE_INTERVAL_MS), duration)
            bx, by = bezier(pos, control, target, minimum_jerk(move_t / duration))
            sample_t.append(round(t + move_t, 1))
            sample_x.append(round(bx + rng.gauss(0.0, NOISE_PX), 2))
            sample_y.append(round(by + rng.gauss(0.0, NOISE_PX), 2))
        t += duration
        pos = target

        # Click on arrival after a short settle.
        t += rng.uniform(40.0, 160.0)
        cell_index = rng.randrange(81)
        if i in RIGHT_CLICK_AT:
            events.append({'t': round(t, 1), 'kind': 'rdown',
                           'x': round(pos[0]), 'y': round(pos[1]),
                           'index': cell_index})
        else:
            events.append({'t': round(t, 1), 'kind': 'ldown',
                           'x': round(pos[0]), 'y': round(pos[1]),
                           'index': cell_index})
            t += rng.uniform(*CLICK_HOLD_MS)
            events.append({'t': round(t, 1), 'kind': 'lup',
                           'x': round(pos[0]), 'y': round(pos[1]),
                           'index': cell_index})

    started_at = 1755710000000
    game = {
        'endedAt': started_at + math.ceil(t),
        'mode': '9x9/10',
        'outcome': 'win',
        'startedAt': started_at,
        'sampleT': sample_t,
        'sampleX': sample_x,
        'sampleY': sample_y,
        'events': events,
    }
    OUT_PATH.write_text(json.dumps([game]))
    print(f'wrote {OUT_PATH} ({len(sample_t)} samples, '
          f'{len(events)} events, {t / 1000:.1f} s)')


if __name__ == '__main__':
    main()
