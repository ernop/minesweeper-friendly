"""Convert cached saolei.wang replays into the shared game format.

Shared format (one JSON object per game, also written by user_games.js):
  source, id, player, timeMs, bv3,
  mines: '0'/'1' per cell, row by row (the layout the inputs met)
  actions: [[tMs, cellX, cellY, kind], ...]   kind: reveal | chord | flag | unflag | noop
  samples: [[tMs, x, y], ...]                  cursor position in cell units
Time zero is the game-starting reveal. Cell (i, j) spans [i, i + 1) x [j, j + 1).

Action kinds come from the parser's running counters after each mouse event:
an effective chord, an effective left click, an effective right click (flag
or unflag by the flag count), or a click that changed nothing.

Usage: python corpus_actions.py OUT.jsonl

Parsing runs in a child process: ms_toollib aborts the whole process on some
replays (1.5.18 on replays/337163.avf, a 130 s Arbiter game), which no Python
code can catch. The parent names each such file, leaves it out, and restarts
the child after it. A replay the parser reads but not as a completed Expert
game is named and left out too (two reviewed Arbiter games on 2026-09-27).
Any other failure stops the run.
"""
import json
import signal
import subprocess
import sys

import ms_toollib as ms

from saolei_fetch import CORPUS, read_index

READERS = {'.avf': ms.AvfVideo, '.evf': ms.EvfVideo, '.mvf': ms.MvfVideo, '.rmv': ms.RmvVideo}
EXPERT = (16, 30, 99)


def counters(event) -> tuple[int, ...]:
    k = event.key_dynamic_params
    return (k.left, k.right, k.double, k.lce, k.rce, k.dce, k.flag)


class UnusableReplay(Exception):
    """A replay the parser reads, but not as a completed Expert game."""


def convert(entry: dict) -> dict:
    file = CORPUS / entry['file']
    video = READERS[file.suffix.lower()](str(file))
    video.parse()
    video.analyse()
    if (video.row, video.column, video.mine_num) != EXPERT:
        raise UnusableReplay(f'not Expert ({video.row}x{video.column}/{video.mine_num})')
    if not video.is_completed:
        raise UnusableReplay('the parser does not read it as completed')
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
            'timeMs': round(video.rtime * 1000), 'bv3': video.bbbv,
            'openings': video.op, 'software': video.software, 'mines': mines,
            'actions': actions, 'samples': samples}


def child(start: int) -> None:
    """Converts from index position start on, announcing each replay first."""
    entries = list(read_index().values())
    for i in range(start, len(entries)):
        print('S', i, flush=True)
        try:
            game = convert(entries[i])
        except UnusableReplay as reason:
            print('U', reason, flush=True)
            continue
        print('G', json.dumps(game), flush=True)


def main() -> None:
    entries = list(read_index().values())
    left_out: list[str] = []
    converted = 0
    start = 0
    with open(sys.argv[1], 'w') as out:
        while start < len(entries):
            process = subprocess.Popen([sys.executable, __file__, '--child', str(start)],
                                       stdout=subprocess.PIPE, text=True)
            current = None
            for line in process.stdout:
                kind, _, rest = line.partition(' ')
                if kind == 'S':
                    current = int(rest)
                elif kind == 'U':
                    left_out.append(f'{entries[current]["file"]} ({rest.strip()})')
                else:
                    out.write(rest)
                    converted += 1
            code = process.wait()
            if code == 0:
                break
            if code != -signal.SIGABRT or current is None:
                raise RuntimeError(f'converter child failed with exit code {code}'
                                   + ('' if current is None else f' on {entries[current]["file"]}'))
            left_out.append(f'{entries[current]["file"]} (ms_toollib aborted while parsing it)')
            start = current + 1
    print(f'converted {converted} of {len(entries)} replays; left out {len(left_out)}'
          + (': ' + ', '.join(left_out) if left_out else ''))


if __name__ == '__main__':
    if sys.argv[1] == '--child':
        child(int(sys.argv[2]))
    else:
        main()
