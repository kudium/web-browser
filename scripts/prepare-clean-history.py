#!/usr/bin/env python3
"""Build a sanitized Git mirror and bundle without touching the working remote."""
from pathlib import Path
import json
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
output_root = root / 'release-artifacts' / 'open-source'
output_root.mkdir(parents=True, exist_ok=True)
output = Path(tempfile.mkdtemp(prefix='history-', dir=output_root))
mirror = output / 'clean.git'
# Fetch only source branches and tags; local stashes are not publication source.
subprocess.run(['git', 'init', '--bare', str(mirror)], check=True)
subprocess.run(['git', 'fetch', '--no-write-fetch-head', str(root), '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*'], cwd=mirror, check=True)
subprocess.run(['git', 'symbolic-ref', 'HEAD', 'refs/heads/main'], cwd=mirror, check=True)
# Local mirrors also copy stashes and remote-tracking refs. Never publish stashes.
all_refs = subprocess.check_output(['git', 'for-each-ref', '--format=%(refname)'], cwd=mirror, text=True).splitlines()
for ref in all_refs:
    if not ref.startswith(('refs/heads/', 'refs/tags/')):
        subprocess.run(['git', 'update-ref', '-d', ref], cwd=mirror, check=True)
refs_before = subprocess.check_output(['git', 'for-each-ref', '--format=%(refname)'], cwd=mirror, text=True).splitlines()
callback = output / 'sanitize-file.py'
callback.write_text(r'''
import re
if filename.rsplit(b'/', 1)[-1] == b'BROWSER.md':
    contents = b'# Optional Kudium Browser integration\n\nThis public source history excludes local linked-group identifiers and connector metadata. Configure browser integration locally; never commit credentials.\n'
    return (filename, mode, value.insert_file_with_contents(contents))
if re.search(rb'(^|/)\.env($|\.)', filename) and not filename.endswith(b'.env.example'):
    return (None, mode, blob_id)
contents = value.get_contents_by_identifier(blob_id)
if not value.is_binary(contents):
    cleaned = re.sub(rb'/Users/[A-Za-z0-9._-]+/workspace/(?:kudiumbrowser|touchbox)', b'/path/to/kudium-browser', contents)
    cleaned = re.sub(rb'/Users/[A-Za-z0-9._-]+/', b'/path/to/user/', cleaned)
    cleaned = re.sub(rb'/home/[A-Za-z0-9._-]+/', b'/path/to/user/', cleaned)
    if cleaned != contents:
        blob_id = value.insert_file_with_contents(cleaned)
return (filename, mode, blob_id)
''')
subprocess.run(['git', 'filter-repo', '--force', '--file-info-callback', str(callback), '--email-callback', 'return b"contributors@example.invalid"', '--message-callback', 'import re; return re.sub(rb"/Users/[A-Za-z0-9._-]+/", b"/path/to/user/", message)'], cwd=mirror, check=True)
subprocess.run(['git', 'reflog', 'expire', '--expire=now', '--all'], cwd=mirror, check=True)
subprocess.run(['git', 'gc', '--prune=now'], cwd=mirror, check=True)
subprocess.run(['git', 'fsck', '--full', '--no-reflogs'], cwd=mirror, check=True)
subprocess.run(['gitleaks', 'git', '--redact', '--log-opts=--all', '--config', str(root / '.gitleaks.toml')], cwd=mirror, check=True)
# Every reachable historical blob is checked, not just the latest tree.
objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all'], cwd=mirror).splitlines()
oids = [item.split(b' ', 1)[0] for item in objects]
checked_info = subprocess.check_output(['git', 'cat-file', '--batch-check'], input=b'\n'.join(oids) + b'\n', cwd=mirror).splitlines()
blobs = [line.split()[0] for line in checked_info if line.split()[1] == b'blob']
checked = 0
private_path = re.compile(rb'/Users/[A-Za-z0-9._-]+/')
private_group = re.compile(rb'kudium:' + rb'browser-group:[a-f0-9]{64}:')
for index in range(0, len(blobs), 128):
    batch = blobs[index:index + 128]
    data = subprocess.check_output(['git', 'cat-file', '--batch'], input=b'\n'.join(batch) + b'\n', cwd=mirror)
    offset = 0
    for oid in batch:
        end = data.index(b'\n', offset)
        size = int(data[offset:end].split()[2])
        content = data[end + 1:end + 1 + size]
        if private_path.search(content) or private_group.search(content):
            raise RuntimeError('Historical private metadata remains')
        offset = end + 1 + size + 1
        checked += 1
refs_after = subprocess.check_output(['git', 'for-each-ref', '--format=%(refname)'], cwd=mirror, text=True).splitlines()
if sorted(refs_before) != sorted(refs_after):
    raise RuntimeError('Sanitization changed ref names unexpectedly; inspect candidate')
bundle = output / 'kudium-clean-history.bundle'
subprocess.run(['git', 'bundle', 'create', str(bundle), '--all'], cwd=mirror, check=True)
subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=mirror, check=True)
(output / 'review.json').write_text(json.dumps({'historyRewritten': True, 'remoteChanged': False, 'reachableBlobsChecked': checked, 'refCount': len(refs_after), 'privateEmailFieldsReplaced': True, 'authorNamesRetained': True, 'commitAndTagSignaturesInvalidated': True, 'releaseSourceHashesChanged': True}, indent=2) + '\n')
print('Clean-history candidate:', bundle)
print('No force-push, visibility change or release publication was performed.')
