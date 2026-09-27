"""Download reviewed Expert replays from saolei.wang into a lasting local corpus.

The site publishes players' replay files for viewing and saving. This tool
fetches slowly (one request per REQUEST_GAP_S), keeps every file and page it
has fetched so nothing is requested twice, and stores the corpus outside the
repository: replays are other players' data and are not redistributed.

Storage (kept for good; the player asked to "store them logically forever"):
  CORPUS/README.txt           what the folder is and how it is laid out
  CORPUS/index.jsonl          one line per replay picked for a band: listing
                              facts, band, file (relative to CORPUS), fetch date
  CORPUS/replays/<id>.<ext>   the replay file exactly as downloaded
  CORPUS/shows/<id>.html      the replay's page on the site (its metadata)
Listing pages are only a cache for scanning and live in PAGE_CACHE.

Usage:
  python saolei_fetch.py --by bvs --bands 1.0-1.4:50 1.4-1.8:50 ... [--per-player 3] [--max-pages 300]

--by chooses what a band measures: the game's 3BV/s (bvs) or its time in
seconds (time). Each band is MIN-MAX:COUNT. At most --per-player replays per
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
CORPUS = Path.home() / 'Documents' / 'minesweeper-corpus' / 'saolei'
PAGE_CACHE = Path.home() / '.cache' / 'minesweeper-friendly' / 'saolei' / 'pages'
REQUEST_GAP_S = 2.0
README = """saolei.wang Expert replays for minesweeper-friendly's skill comparison.

Downloaded politely (one request every 2 s) by analysis/skill-comparison/
saolei_fetch.py in https://github.com/ernop/minesweeper-friendly. The files are
other players' published replays: keep them for analysis, never redistribute.

index.jsonl  one JSON object per line: video_id, time_s, bv3, bvs, player_id,
             reviewed (from the site's listing), band (the request that picked
             it), file (path relative to this folder), fetched (UTC date).
             A replay picked by several requests appears once per request.
replays/     <video_id>.<avf|evf|mvf|rmv>, exactly as downloaded, never edited.
shows/       <video_id>.html, the replay's page on the site.
"""
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
    bvs: float
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
    html = fetch(f'{SITE}/Video/Video_Exp.asp?Page={page}&Order=Time&tmp=', PAGE_CACHE / f'exp-{page}.html')
    rows = re.findall(rb'<tr class="Text".*?</tr>', html, re.S)
    if not rows:
        raise RuntimeError(f'listing page {page} has no rows; the page layout changed')
    listings = []
    for row in rows:
        video = re.search(rb"Video/Show\.asp\?Id=(\d+)[^>]*>([\d.]+)</a>", row)
        bv3 = re.search(rb'id="BV_\d+" class="Title">(\d+)<', row)
        bvs = re.search(rb'id="BVS_\d+" class="Title">([\d.]+)<', row)
        player = re.search(rb"Player/Show\.asp\?Id=(\d+)'\);\" class=\"High\"", row)
        if not (video and bv3 and bvs and player):
            raise RuntimeError(f'listing page {page}: unparsed row {row[:200]!r}')
        listings.append(Listing(int(video.group(1)), float(video.group(2)), int(bv3.group(1)),
                                float(bvs.group(1)), int(player.group(1)), UNREVIEWED not in row))
    return listings


def replay_path(video_id: int) -> bytes:
    html = fetch(f'{SITE}/Video/Show.asp?Id={video_id}', CORPUS / 'shows' / f'{video_id}.html')
    match = re.search(rb"PlayVideo\('([^']+)'\)", html)
    if match is None:
        raise RuntimeError(f'video {video_id}: no replay file link on its page')
    return match.group(1)


def download(listing: Listing) -> Path:
    """The replay's file, relative to CORPUS."""
    path = replay_path(listing.video_id)
    suffix = '.' + path.rsplit(b'.', 1)[1].decode('ascii').lower()
    relative = Path('replays') / f'{listing.video_id}{suffix}'
    fetch(SITE + urllib.parse.quote(path), CORPUS / relative)
    return relative


def parse_bands(specs: list[str]) -> list[tuple[float, float, int]]:
    bands = []
    for spec in specs:
        span, count = spec.split(':')
        low, high = span.split('-')
        bands.append((float(low), float(high), int(count)))
    return bands


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--by', choices=['bvs', 'time'], required=True)
    parser.add_argument('--bands', nargs='+', required=True)
    parser.add_argument('--per-player', type=int, default=2)
    parser.add_argument('--max-pages', type=int, default=40)
    args = parser.parse_args()
    bands = parse_bands(args.bands)
    measure = (lambda listing: listing.bvs) if args.by == 'bvs' else (lambda listing: listing.time_s)
    chosen: dict[int, list[Listing]] = {i: [] for i in range(len(bands))}
    for page in range(1, args.max_pages + 1):
        for listing in listing_page(page):
            if not listing.reviewed:
                continue
            for i, (low, high, count) in enumerate(bands):
                picked = chosen[i]
                if not (low <= measure(listing) < high) or len(picked) >= count:
                    continue
                if sum(1 for p in picked if p.player_id == listing.player_id) >= args.per_player:
                    continue
                picked.append(listing)
        if all(len(chosen[i]) >= bands[i][2] for i in chosen):
            break
    CORPUS.mkdir(parents=True, exist_ok=True)
    readme = CORPUS / 'README.txt'
    if not readme.exists():
        readme.write_text(README)
    with (CORPUS / 'index.jsonl').open('a') as out:
        for i, picked in chosen.items():
            low, high, count = bands[i]
            label = f'{args.by} {low:g}-{high:g}'
            print(f'band {label}: {len(picked)} of {count}', flush=True)
            for listing in picked:
                file = download(listing)
                fetched = time.strftime('%Y-%m-%d', time.gmtime())
                out.write(json.dumps({**asdict(listing), 'band': label, 'file': str(file), 'fetched': fetched}) + '\n')
                out.flush()


if __name__ == '__main__':
    main()
