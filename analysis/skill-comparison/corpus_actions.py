"""Convert cached saolei.wang replays into the shared game format.

Shared format (one JSON object per game, also written by user_games.js):
  source, id, player, band, timeMs, bv3,
  mines: '0'/'1' per cell, row by row (the layout the inputs met)
  actions: [[tMs, cellX, cellY, kind], ...]   kind: reveal | chord | flag | unflag | noop
  samples: [[tMs, x, y], ...]                  cursor position in cell units
Time zero is the game-starting reveal. Cell (i, j) spans [i, i + 1) x [j, j + 1).

Action kinds come from the parser's running counters after each mouse event:
an effective chord, an effective left click, an effective right click (flag
or unflag by the flag count), or a click that changed nothing.

Usage: python corpus_actions.py OUT.jsonl
"""
import json
import sys
from pathlib import Path

import ms_toollib as ms

from saolei_fetch import CACHE

READERS = {'.avf': ms.AvfVideo, '.evf': ms.EvfVideo, '.mvf': ms.MvfVideo, '.rmv': ms.RmvVideo}
EXPERT = (16, 30, 99)


def counters(event) -> tuple[int, ...]:
    k = event.key_dynamic_params
    return (k.left, k.right, k.double, k.lce, k.rce, k.dce, k.flag)


def convert(entry: dict) -> dict:
    file = Path(entry['file'])
    video = READERS[file.suffix.lower()](str(file))
    video.parse()
    video.analyse()
    if (video.row, video.column, video.mine_num) != EXPERT or not video.is_completed:
        raise ValueError(f"{file}: not a completed Expert game ({video.row}x{video.column}/{video.mine_num})")
    pix = video.pix_size
    actions, samples = [], []
    previous = (0, 0, 0, 0, 0, 0, 0)
    for event in video.events:
        if not event.event.is_mouse():
            continue
        mouse = event.event.unwrap_mouse()
        t_ms = round(event.time * 1000)
        samples.append([t_ms, mouse.x / pix, mouse.y / pix])
        current = counters(event)
        left, right, double, lce, rce, dce, flags = current
        if dce > previous[5]:
            kind = 'chord'
        elif lce > previous[3]:
            kind = 'reveal'
        elif rce > previous[4]:
            kind = 'flag' if flags > previous[6] else 'unflag'
        elif left > previous[0] or right > previous[1] or double > previous[2]:
            kind = 'noop'
        else:
            kind = None
        if kind is not None:
            actions.append([t_ms, mouse.x // pix, mouse.y // pix, kind])
        previous = current
    mines = ''.join('1' if value == -1 else '0' for row in video.board for value in row)
    return {'source': 'saolei', 'id': str(entry['video_id']), 'player': str(entry['player_id']),
            'band': entry['band'], 'timeMs': round(video.rtime * 1000), 'bv3': video.bbbv,
            'openings': video.op, 'software': video.software, 'mines': mines,
            'actions': actions, 'samples': samples}


def main() -> None:
    entries = {}
    for line in (CACHE / 'index.jsonl').read_text().splitlines():
        entry = json.loads(line)
        entries[entry['video_id']] = entry
    with open(sys.argv[1], 'w') as out:
        for entry in entries.values():
            out.write(json.dumps(convert(entry)) + '\n')
    print(f'converted {len(entries)} replays')


if __name__ == '__main__':
    main()
