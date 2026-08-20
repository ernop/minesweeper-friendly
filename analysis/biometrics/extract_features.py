"""Mouse-dynamics feature extraction for minesweeper-friendly game traces.

Input: the game's trace export — a JSON array of per-game trace objects
    { endedAt, mode, outcome, startedAt,
      sampleT: [ms relative to trace start], sampleX: [px], sampleY: [px],
      events: [{t, kind: 'ldown'|'lup'|'rdown', x, y, index}
               | {t, kind: 'layout', left, top, width, height,
                  boardWidth, boardHeight}] }
(see saveTrace / the traces-export handler in minesweeper.js).

Output: JSON on stdout — per game: session-level features, click features,
per-stroke features, and per-feature aggregates over strokes.

No third-party mouse-dynamics library is used because none installable
today extracts these features from raw streams (survey in NOTES.md); the
standard feature set is implemented here directly. Sources per feature:

- Stroke segmentation (movement bouts split at sampling silences):
  Gamboa & Fred 2004, "A Behavioral Biometric System Based on
  Human-Computer Interaction" (strokes); threshold 100 ms matches the
  bout-gap definition in reference/mouse-motion-metrics.md.
- Speed, per-axis velocity, acceleration, jerk distributions:
  Ahmed & Traore 2007, "A New Biometric Technology Based on Mouse
  Dynamics" (IEEE TDSC); Zheng, Paloski & Wang, CCS 2011, "An Efficient
  User Verification System via Mouse Movements"; jerk additionally in
  Gajos et al. 2020 (Hevelius).
- Direction and angular velocity: Ahmed & Traore 2007 (direction);
  Gamboa & Fred 2004 (angular velocity).
- Angle of curvature and curvature distance: Zheng et al. CCS 2011,
  section 3.1 — for consecutive points A, B, C, the angle at B, and the
  ratio dist(A,C) / perpendicular distance from B to line AC.
- Straightness (chord length / path length): Gamboa & Fred 2004.
- Pause-and-click (stillness immediately before a button press) and
  silence ratio (share of the game spent not moving): Zheng et al. CCS
  2011 (pause-and-click); the mouse-dynamics survey vocabulary
  (arXiv:2208.09061) for silence ratio.
- Click duration (down-to-up time): Gajos et al. 2020 (Hevelius);
  standard in the mouse-dynamics surveys.
"""

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np

# A gap of >= this between consecutive mousemove samples ends a movement
# bout: event-driven sampling emits nothing while the cursor is still.
STROKE_GAP_MS = 100.0

BUTTON_EVENT_KINDS = {'ldown', 'lup', 'rdown'}
EVENT_KINDS = BUTTON_EVENT_KINDS | {'layout'}

GAME_KEYS = {'endedAt', 'mode', 'outcome', 'startedAt',
             'sampleT', 'sampleX', 'sampleY', 'events'}


def validate_game(game: dict[str, Any], game_index: int) -> None:
    """Reject malformed traces loudly, naming the game and the defect."""
    where = f'game {game_index}'
    missing = GAME_KEYS - game.keys()
    if missing:
        raise ValueError(f'{where}: missing keys {sorted(missing)}')
    t, x, y = game['sampleT'], game['sampleX'], game['sampleY']
    if not (len(t) == len(x) == len(y)):
        raise ValueError(f'{where}: sample arrays disagree in length: '
                         f'sampleT={len(t)} sampleX={len(x)} sampleY={len(y)}')
    ts = np.asarray(t, dtype=np.float64)
    if len(ts) > 1 and not np.all(np.diff(ts) > 0):
        bad = int(np.argmin(np.diff(ts) > 0))
        raise ValueError(f'{where}: sampleT not strictly increasing at index '
                         f'{bad + 1} ({t[bad]} -> {t[bad + 1]})')
    prev_t = -math.inf
    for i, ev in enumerate(game['events']):
        kind = ev.get('kind')
        if kind not in EVENT_KINDS:
            raise ValueError(f'{where}: event {i} has unknown kind {kind!r}')
        if ev['t'] < prev_t:
            raise ValueError(f'{where}: event {i} out of order '
                             f'({ev["t"]} after {prev_t})')
        prev_t = ev['t']
        if kind in BUTTON_EVENT_KINDS and ('x' not in ev or 'y' not in ev):
            raise ValueError(f'{where}: {kind} event {i} lacks x/y')


def segment_strokes(t: np.ndarray, x: np.ndarray,
                    y: np.ndarray) -> list[slice]:
    """Split the sample stream into movement bouts at sampling silences."""
    if len(t) == 0:
        return []
    breaks = np.flatnonzero(np.diff(t) >= STROKE_GAP_MS) + 1
    edges = [0, *breaks.tolist(), len(t)]
    return [slice(a, b) for a, b in zip(edges[:-1], edges[1:])]


def wrap_angle(a: np.ndarray) -> np.ndarray:
    """Map angle differences into (-pi, pi]."""
    return (a + math.pi) % (2 * math.pi) - math.pi


def dist_stats(values: np.ndarray) -> dict[str, float]:
    """mean/std/max of a nonempty 1-D distribution (population std)."""
    return {'mean': float(np.mean(values)),
            'std': float(np.std(values)),
            'max': float(np.max(values))}


def stroke_features(t: np.ndarray, x: np.ndarray,
                    y: np.ndarray) -> dict[str, Any]:
    """Features of one movement bout.

    A feature whose formula needs more points (or nonzero displacement)
    than the stroke has is absent from the result, not defaulted: absence
    means "not measurable on this stroke".
    """
    n = len(t)
    feat: dict[str, Any] = {
        'sampleCount': n,
        'startMs': float(t[0]),
        'durationMs': float(t[-1] - t[0]),
    }
    if n < 2:
        return feat

    dt = np.diff(t)                      # all > 0: sampleT strictly increasing
    dx = np.diff(x)
    dy = np.diff(y)
    seg_len = np.hypot(dx, dy)

    path = float(np.sum(seg_len))
    chord = float(math.hypot(float(x[-1] - x[0]), float(y[-1] - y[0])))
    feat['pathLengthPx'] = path
    feat['chordLengthPx'] = chord
    if path > 0:
        # Gamboa & Fred 2004: straightness = chord / path, in [0, 1].
        feat['straightness'] = chord / path
        # Ahmed & Traore 2007: direction of travel, radians in (-pi, pi].
        feat['directionRad'] = math.atan2(float(y[-1] - y[0]),
                                          float(x[-1] - x[0]))

    speed = seg_len / dt                 # px/ms per segment
    feat['speedPxPerMs'] = dist_stats(speed)
    feat['velocityXPxPerMs'] = {'mean': float(np.mean(dx / dt)),
                                'std': float(np.std(dx / dt))}
    feat['velocityYPxPerMs'] = {'mean': float(np.mean(dy / dt)),
                                'std': float(np.std(dy / dt))}

    # Kinematic chain on segment midpoints: a_i = dv/dt, j_i = da/dt.
    t_mid = (t[:-1] + t[1:]) / 2
    if n >= 3:
        accel = np.diff(speed) / np.diff(t_mid)
        feat['accelerationPxPerMs2'] = dist_stats(np.abs(accel))
        t_mid2 = (t_mid[:-1] + t_mid[1:]) / 2
        if n >= 4:
            jerk = np.diff(accel) / np.diff(t_mid2)
            feat['jerkPxPerMs3'] = dist_stats(np.abs(jerk))

    # Heading-based features exist only where the cursor displaced.
    moving = seg_len > 0
    if int(np.sum(moving)) >= 2:
        theta = np.arctan2(dy[moving], dx[moving])
        dtheta = wrap_angle(np.diff(theta))
        omega = dtheta / np.diff(t_mid[moving])
        feat['angularVelocityRadPerMs'] = dist_stats(np.abs(omega))

    if n >= 3:
        # Zheng et al. CCS 2011: per consecutive triple (A, B, C),
        # angle of curvature = angle at B between rays BA and BC.
        ax, ay = x[:-2], y[:-2]
        bx, by = x[1:-1], y[1:-1]
        cx, cy = x[2:], y[2:]
        ba = np.stack([ax - bx, ay - by], axis=1)
        bc = np.stack([cx - bx, cy - by], axis=1)
        nba = np.linalg.norm(ba, axis=1)
        nbc = np.linalg.norm(bc, axis=1)
        ok = (nba > 0) & (nbc > 0)
        if np.any(ok):
            cosine = np.einsum('ij,ij->i', ba[ok], bc[ok]) / (nba[ok] * nbc[ok])
            angles = np.arccos(np.clip(cosine, -1.0, 1.0))
            feat['curvatureAngleRad'] = {'mean': float(np.mean(angles)),
                                         'std': float(np.std(angles))}
        # Zheng et al. CCS 2011: curvature distance = dist(A, C) /
        # perpendicular distance from B to line AC. Defined only for
        # non-collinear triples (perpendicular distance > 0).
        chord_ac = np.hypot(cx - ax, cy - ay)
        cross = (cx - ax) * (ay - by) - (cy - ay) * (ax - bx)
        with np.errstate(divide='ignore', invalid='ignore'):
            perp = np.abs(cross) / chord_ac
        defined = (chord_ac > 0) & (perp > 0)
        if np.any(defined):
            ratio = chord_ac[defined] / perp[defined]
            feat['curvatureDistance'] = {'mean': float(np.mean(ratio)),
                                         'std': float(np.std(ratio)),
                                         'definedTriples': int(np.sum(defined))}
    return feat


def click_features(events: list[dict[str, Any]],
                   sample_t: np.ndarray) -> dict[str, Any]:
    """Click duration and pause-and-click from the button-event stream.

    Pairing rule: each 'ldown' matches the next 'lup' before any further
    'ldown'. An 'lup' with no open 'ldown' is a press that began off the
    board cells (the recorder stores only on-cell ldowns) and is counted,
    not silently dropped; likewise an 'ldown' left open at game end.
    """
    click_durations: list[float] = []
    pause_and_click: list[float] = []
    unpaired_lup = 0
    right_clicks = 0
    open_ldown_t: float | None = None

    for ev in events:
        kind = ev['kind']
        if kind == 'layout':
            continue
        if kind in ('ldown', 'rdown'):
            # Zheng et al. CCS 2011 pause-and-click: stillness between the
            # end of movement and the press. The last mousemove at or
            # before the press marks the end of movement; a press with no
            # prior movement has no defined value.
            before = sample_t[sample_t <= ev['t']]
            if len(before) > 0:
                pause_and_click.append(float(ev['t'] - before[-1]))
        if kind == 'ldown':
            open_ldown_t = float(ev['t'])
        elif kind == 'lup':
            if open_ldown_t is None:
                unpaired_lup += 1
            else:
                click_durations.append(float(ev['t']) - open_ldown_t)
                open_ldown_t = None
        elif kind == 'rdown':
            right_clicks += 1

    feat: dict[str, Any] = {
        'leftClickCount': len(click_durations),
        'rightClickCount': right_clicks,
        'unpairedLupCount': unpaired_lup,
        'unpairedLdownCount': int(open_ldown_t is not None),
    }
    if click_durations:
        arr = np.asarray(click_durations)
        feat['clickDurationMs'] = dist_stats(arr)
    if pause_and_click:
        arr = np.asarray(pause_and_click)
        feat['pauseAndClickMs'] = dist_stats(arr)
    return feat


def aggregate_strokes(strokes: list[dict[str, Any]]) -> dict[str, Any]:
    """Mean/std over strokes of every scalar per-stroke feature, and of
    the 'mean' of every distribution feature. n = strokes where defined."""
    agg: dict[str, Any] = {}
    names = {k for s in strokes for k in s}
    for name in sorted(names):
        values = []
        for s in strokes:
            if name not in s:
                continue
            v = s[name]
            values.append(v['mean'] if isinstance(v, dict) else v)
        arr = np.asarray(values, dtype=np.float64)
        agg[name] = {'mean': float(np.mean(arr)),
                     'std': float(np.std(arr)),
                     'n': len(values)}
    return agg


def extract_game(game: dict[str, Any], game_index: int) -> dict[str, Any]:
    validate_game(game, game_index)
    t = np.asarray(game['sampleT'], dtype=np.float64)
    x = np.asarray(game['sampleX'], dtype=np.float64)
    y = np.asarray(game['sampleY'], dtype=np.float64)

    strokes = [stroke_features(t[s], x[s], y[s])
               for s in segment_strokes(t, x, y)]
    movement_ms = sum(s['durationMs'] for s in strokes)
    wall_ms = float(game['endedAt'] - game['startedAt'])
    if wall_ms <= 0:
        raise ValueError(f'game {game_index}: endedAt <= startedAt')

    return {
        'endedAt': game['endedAt'],
        'mode': game['mode'],
        'outcome': game['outcome'],
        'startedAt': game['startedAt'],
        'session': {
            'wallDurationMs': wall_ms,
            'sampleCount': len(t),
            'strokeCount': len(strokes),
            'movementMs': movement_ms,
            # Survey vocabulary (arXiv:2208.09061): share of the game
            # spent with the cursor still.
            'silenceRatio': 1.0 - movement_ms / wall_ms,
            'totalPathPx': float(np.sum(np.hypot(np.diff(x), np.diff(y))))
                           if len(t) > 1 else 0.0,
        },
        'clicks': click_features(game['events'], t),
        'strokeAggregates': aggregate_strokes(strokes),
        'strokes': strokes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Extract mouse-dynamics features from a '
                    'minesweeper-friendly traces export (JSON array of '
                    'per-game trace objects).')
    parser.add_argument('traces_file', type=Path,
                        help='traces export JSON file')
    args = parser.parse_args()

    games = json.loads(args.traces_file.read_text())
    if not isinstance(games, list):
        raise ValueError(f'{args.traces_file}: top level is not a JSON array '
                         '(the traces export is an array of per-game objects)')
    result = [extract_game(g, i) for i, g in enumerate(games)]
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
