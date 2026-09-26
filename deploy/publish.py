#!/usr/bin/env python3
"""Send one verified release through the server's restricted SSH command."""
import argparse
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def publish(archive: Path, identity: Path, known_hosts: Path) -> None:
    target = json.loads((ROOT / 'deploy/target.json').read_text())
    for path in (archive, identity, known_hosts):
        if not path.is_file():
            raise ValueError(f'Required deployment file missing: {path}')
    with archive.open('rb') as content:
        subprocess.run([
            'ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=15',
            '-o', f'UserKnownHostsFile={known_hosts.resolve()}',
            '-i', str(identity.resolve()), f"{target['user']}@{target['host']}",
            'publish',
        ], stdin=content, check=True, timeout=180)
    import tarfile
    with tarfile.open(archive) as bundle:
        expected = bundle.extractfile('VERSION').read()
    request = urllib.request.Request(target['url'] + 'VERSION',
                                     headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.url != target['url'] + 'VERSION' or response.read() != expected:
            raise ValueError('Live VERSION does not match uploaded release')
    print(f"Verified {target['url']} at {expected.decode().strip()}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('identity', type=Path)
    parser.add_argument('known_hosts', type=Path)
    args = parser.parse_args()
    publish(args.archive, args.identity, args.known_hosts)
