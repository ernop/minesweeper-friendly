import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('builder', ROOT / 'deploy/build-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildTests(unittest.TestCase):
    def test_current_runtime_dependencies_are_complete(self):
        names = json.loads((ROOT / 'deploy/runtime-files.json').read_text())
        builder.validate_files({name: (ROOT / name).read_bytes() for name in names})
        for forbidden in ('tests/', 'analysis/', 'reference/', 'promo/', '.git/', 'deploy/'):
            self.assertFalse(any(name.startswith(forbidden) for name in names))

    def test_missing_worker_dependency_fails(self):
        with self.assertRaisesRegex(ValueError, 'Missing runtime dependency'):
            builder.validate_files({'index.html': b'<script src="worker-client.js"></script>',
                                    'worker-client.js': b'new Worker("missing.js")'})
        with self.assertRaisesRegex(ValueError, 'Missing runtime dependency'):
            builder.validate_files({'worker.js': b'importScripts("missing.js")'})

    def test_build_reads_committed_bytes_and_is_reproducible(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(root), *args])
            git('config', 'user.name', 'Release Test')
            git('config', 'user.email', 'release-test@example.invalid')
            (root / 'deploy').mkdir()
            (root / 'index.html').write_text('<html>committed</html>')
            (root / 'private.json').write_text('must never publish')
            (root / 'deploy/runtime-files.json').write_text('["index.html"]')
            git('add', '.')
            git('commit', '-qm', 'fixture')
            (root / 'index.html').write_text('uncommitted change')
            first, second = root / 'a.tar', root / 'b.tar'
            with patch.object(builder, 'ROOT', root):
                builder.build('HEAD', first)
                builder.build('HEAD', second)
                self.assertEqual(first.read_bytes(), second.read_bytes())
                with tarfile.open(first) as archive:
                    self.assertEqual(set(archive.getnames()), {'index.html', 'VERSION', 'release.json'})
                    self.assertEqual(archive.extractfile('index.html').read(), b'<html>committed</html>')
                (root / 'index.html').unlink()
                (root / 'index.html').symlink_to('private.json')
                git('add', 'index.html')
                git('commit', '-qm', 'invalid symlink')
                with self.assertRaisesRegex(ValueError, 'regular file'):
                    builder.build('HEAD', root / 'invalid.tar')


if __name__ == '__main__':
    unittest.main()
