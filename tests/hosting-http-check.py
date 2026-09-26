"""Read-only assertions against the isolated nginx on the permanent test origin."""
import gzip
import hashlib
import json
import urllib.error
import urllib.request

ORIGIN = 'http://127.0.0.1:8099/'


def request(path: str, method: str = 'GET', headers: dict | None = None):
    query = urllib.request.Request(ORIGIN + path, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(query, timeout=15) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


status, headers, content = request('release.json')
assert status == 200
manifest = json.loads(content)
for name, digest in manifest['files'].items():
    status, headers, content = request(name)
    assert status == 200, (name, status)
    assert hashlib.sha256(content).hexdigest() == digest, name
    assert headers['Cache-Control'] == 'no-cache', name
    assert headers['X-Content-Type-Options'] == 'nosniff', name
    assert headers['X-Frame-Options'] == 'DENY', name
    assert headers['Cross-Origin-Resource-Policy'] == 'same-origin', name
    assert headers['Content-Security-Policy'], name
    assert 'Access-Control-Allow-Origin' not in headers, name
    if name.endswith('.js'):
        assert headers.get_content_type() == 'application/javascript', name
    if name.endswith('.css'):
        assert headers.get_content_type() == 'text/css', name
    if name.endswith('.html'):
        assert headers.get_content_type() == 'text/html', name
status, headers, body = request('style.css', headers={'Accept-Encoding': 'gzip'})
assert status == 200 and headers['Content-Encoding'] == 'gzip'
assert hashlib.sha256(gzip.decompress(body)).hexdigest() == manifest['files']['style.css']
status, headers, body = request('index.html')
status, cached, body = request('index.html', headers={'If-None-Match': headers['ETag']})
assert status == 304 and cached['Content-Security-Policy'] and cached['Cache-Control'] == 'no-cache'
for path in ('.env', '.git/config', 'README.md', 'tests/hosting-http-check.py',
             'proxy.php', 'PROXY.PHP', 'probe.php', 'game/../.env', 'absent.js'):
    status, headers, body = request(path)
    assert status == 404, (path, status)
    assert headers['Content-Security-Policy'], path
assert request('game/')[0] == 403
assert request('probe.js')[0] == 404  # fixture symlink to a private server path
assert request('', method='POST')[0] == 405
print(f"HTTP: {len(manifest['files'])} exact file hashes, MIME, gzip, revalidation, security headers, blocked paths, symlinks, directory listing, and write methods passed")
