"""Download reviewed Expert replays from saolei.wang into a local cache.

The site publishes players' replay files for viewing and saving. This tool
fetches slowly (one request per REQUEST_GAP_S), keeps every file and page it
has fetched so nothing is requested twice, and stores the corpus outside the
repository: replays are other players' data and are not redistributed.

Usage:
  python saolei_fetch.py --bands 40-50:15 50-60:15 60-75:15 75-110:15 [--max-pages 40]

Each band is MIN-MAX seconds:COUNT. At most PER_PLAYER_PER_BAND replays per
player enter one band, so a band describes several players, not one.
"""
import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

SITE = 'http://saolei.wang'
CACHE = Path.home() / '.cache' / 'minesweeper-friendly' / 'saolei'
REQUEST_GAP_S = 2.0
PER_PLAYER_PER_BAND = 2
USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) minesweeper-friendly-research/0.1'
# Pages are GB2312 with occasional bytes outside it, so they are matched as
# bytes and never decoded; the replay path is percent-encoded byte for byte.
UNREVIEWED = '未审核'.encode('gb2312')

_last_request_at = 0.0


@dataclass
class Listing:
    video_id: int
    time_s: float
    bv3: int
    player_id: int
    reviewed: bool


def fetch(url: str, cache_path: Path) -> bytes:
    global _last_request_at
    if cache_path.exists():
        return cache_path.read_bytes()
    wait = REQUEST_GAP_S - (time.monotonic() - _last_request_at)
    if wait > 0:
        time.sleep(wait)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200:
            raise RuntimeError(f'{url}: HTTP {response.status}')
        body = response.read()
    _last_request_at = time.monotonic()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(body)
    return body


def listing_page(page: int) -> list[Listing]:
    html = fetch(f'{SITE}/Video/Video_Exp.asp?Page={page}&Order=Time&tmp=', CACHE / 'pages' / f'exp-{page}.html')
    rows = re.findall(rb'<tr class="Text".*?</tr>', html, re.S)
    if not rows:
        raise RuntimeError(f'listing page {page} has no rows; the page layout changed')
    listings = []
    for row in rows:
        video = re.search(rb"Video/Show\.asp\?Id=(\d+)[^>]*>([\d.]+)</a>", row)
        bv3 = re.search(rb'id="BV_\d+" class="Title">(\d+)<', row)
        player = re.search(rb"Player/Show\.asp\?Id=(\d+)'\);\" class=\"High\"", row)
        if not (video and bv3 and player):
            raise RuntimeError(f'listing page {page}: unparsed row {row[:200]!r}')
        listings.append(Listing(int(video.group(1)), float(video.group(2)), int(bv3.group(1)),
                                int(player.group(1)), UNREVIEWED not in row))
    return listings


def replay_path(video_id: int) -> bytes:
    html = fetch(f'{SITE}/Video/Show.asp?Id={video_id}', CACHE / 'shows' / f'{video_id}.html')
    match = re.search(rb"PlayVideo\('([^']+)'\)", html)
    if match is None:
        raise RuntimeError(f'video {video_id}: no replay file link on its page')
    return match.group(1)


def download(listing: Listing) -> Path:
    path = replay_path(listing.video_id)
    suffix = '.' + path.rsplit(b'.', 1)[1].decode('ascii').lower()
    target = CACHE / 'replays' / f'{listing.video_id}{suffix}'
    fetch(SITE + urllib.parse.quote(path), target)
    return target


def parse_bands(specs: list[str]) -> list[tuple[float, float, int]]:
    bands = []
    for spec in specs:
        span, count = spec.split(':')
        low, high = span.split('-')
        bands.append((float(low), float(high), int(count)))
    return bands


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--bands', nargs='+', required=True)
    parser.add_argument('--max-pages', type=int, default=40)
    args = parser.parse_args()
    bands = parse_bands(args.bands)
    chosen: dict[int, list[Listing]] = {i: [] for i in range(len(bands))}
    for page in range(1, args.max_pages + 1):
        for listing in listing_page(page):
            if not listing.reviewed:
                continue
            for i, (low, high, count) in enumerate(bands):
                picked = chosen[i]
                if not (low <= listing.time_s < high) or len(picked) >= count:
                    continue
                if sum(1 for p in picked if p.player_id == listing.player_id) >= PER_PLAYER_PER_BAND:
                    continue
                picked.append(listing)
        if all(len(chosen[i]) >= bands[i][2] for i in chosen):
            break
    index = CACHE / 'index.jsonl'
    with index.open('a') as out:
        for i, picked in chosen.items():
            low, high, count = bands[i]
            print(f'band {low:g}-{high:g} s: {len(picked)} of {count}')
            for listing in picked:
                file = download(listing)
                out.write(json.dumps({**asdict(listing), 'band': f'{low:g}-{high:g}', 'file': str(file)},
                                     ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
