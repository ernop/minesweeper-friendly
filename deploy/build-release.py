#!/usr/bin/env python3
"""Build public bytes from one committed revision, never the working directory."""
import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SHA_RE = re.compile(r'[0-9a-f]{40}')


def git(*args: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


class References(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if value and key in {'src', 'href'}:
                self.urls.append(value)


def validate_files(files: dict[str, bytes]) -> None:
    for name, content in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or any(part.startswith('.') for part in path.parts):
            raise ValueError(f'Invalid public path: {name}')
        urls: list[str] = []
        if name.endswith('.html'):
            parser = References()
            parser.feed(content.decode())
            urls.extend(parser.urls)
        if name.endswith('.js'):
            text = content.decode()
            urls.extend(re.findall(r'new Worker\([\'"]([^\'"]+)', text))
            for call in re.findall(r'importScripts\((.*?)\)', text, re.S):
                urls.extend(re.findall(r'[\'"]([^\'"]+)[\'"]', call))
        for url in urls:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            if parsed.path.startswith('/'):
                raise ValueError(f'Root-relative runtime dependency in {name}: {url}')
            dependency = str(path.parent / parsed.path)
            if dependency not in files:
                raise ValueError(f'Missing runtime dependency in {name}: {dependency}')


def build(revision: str, output: Path) -> dict:
    sha = git('rev-parse', '--verify', f'{revision}^{{commit}}').decode().strip()
    if not SHA_RE.fullmatch(sha):
        raise ValueError('Release revision must resolve to a full commit SHA')
    # The allowlist belongs to the same revision as the content it authorizes.
    names = json.loads(git('show', f'{sha}:deploy/runtime-files.json'))
    if len(names) != len(set(names)):
        raise ValueError('Duplicate paths in runtime allowlist')
    files: dict[str, bytes] = {}
    for name in names:
        tree = git('ls-tree', sha, '--', name).decode().strip()
        if not tree.startswith('100644 blob ') and not tree.startswith('100755 blob '):
            raise ValueError(f'Runtime path must be a tracked regular file: {name}')
        files[name] = git('show', f'{sha}:{name}')
    validate_files(files)
    files['VERSION'] = (sha + '\n').encode()
    manifest = {'revision': sha, 'files': {name: hashlib.sha256(data).hexdigest()
                                        for name, data in sorted(files.items())}}
    files['release.json'] = (json.dumps(manifest, sort_keys=True) + '\n').encode()
    timestamp = int(git('show', '-s', '--format=%ct', sha))
    with tarfile.open(output, 'w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            entry.mode = 0o644
            entry.mtime = timestamp
            archive.addfile(entry, io.BytesIO(data))
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('revision')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = build(args.revision, args.output)
    print(f"Built {len(result['files'])} public files at {result['revision']}")
