# Open-source preparation

Reviewed November 14, 2026. Repository visibility remains private. Third-party
code, image and font licensing review is deferred at the user's request.

## Secret scan

Gitleaks 8.30.1 scanned all 70 locally available commits across local and
remote-tracking refs, approximately 20.93 MB of added content. The initial 120
findings were individually classified by file, value and source context:

| Count | Classification | Action |
| --- | --- | --- |
| 113 | SHA-256 source/dependency/evidence hashes | Narrow hash/path exception |
| 2 | Keyboard shortcuts | Exact shortcut/path exception |
| 3 | Synthetic local/unit/integration credentials | Exact value/path exceptions |
| 2 | Public PostHog ingestion token | Token type/path exception |

No production credential was identified by this scan, so no credential rotation
was performed. Scanner coverage is not proof that every possible secret is absent.
PostHog's ingestion token is intentionally shipped in desktop builds; it cannot
manage the project, but outsiders can submit events with it. Public forks should
use their own `KUDIUM_POSTHOG_KEY` and project. Management API keys must never be
committed. Do not broaden exceptions to whole test or documentation directories.

Run the history check locally; it does not consume GitHub Actions:

```sh
brew install gitleaks
gitleaks git --redact --log-opts=--all
```

Live SMTP credentials, Better Auth secrets, sync encryption keys, release
publication tokens and signing/notarization keys remain outside Git. Local `.env`
files and installer outputs are ignored. Re-scan new commits before publication.

## Metadata and disclosure

Personal workspace paths in current benchmark reports and documentation were
replaced with portable placeholders. Evidence measurements and hashes were kept;
changing report text means historical report-file digests describe the original
files, not the sanitized copies. Repository URLs now point to the current Kudium
repository. Contributor attribution is retained.

`SECURITY.md` provides a private reporting route and identifies the supported
versions and testing boundaries. This does not certify the product's security or
close all outstanding review limitations.

Old private commits still contain original metadata. Do not simply change the
existing repository's visibility if those details should remain private. Use a
new public repository initialized from the sanitized, history-free export. This
also avoids publishing unrelated branches, historical issues and private PR
conversations. Do not copy the private repository's `.git` directory.

## Reviewable source candidate

Stage the intended source and preparation files, then run:

```sh
node scripts/prepare-public-source.mjs
```

The script copies only Git-indexed regular files from the working tree, replaces
local `BROWSER.md` link metadata with a portable stub and excludes ignored files, scans the exact export, then
creates an archive under ignored `release-artifacts/open-source/`. Untracked files
must be intentionally added first. Review the archive before publishing.

This prepares source only. Creating a public repository, changing visibility,
rewriting remote history and publishing require a separate explicit instruction.
The deferred licensing review remains outside this preparation's assurance.

## Full-history alternative and security follow-up

See [the November 14 security review](security-review-2026-11-14.md) for dependency
and authentication hardening, validation, and remaining audit limits.

After committing the intended source changes, prepare a separate sanitized
mirror and verified history bundle with:

```sh
brew install git-filter-repo
python3 scripts/prepare-clean-history.py
```

This cleans committed branches and tags locally, including historical text
metadata and commit/tag email fields. It does not publish, change visibility or
force-push. The existing private repository's original release provenance stays
intact until an explicitly authorized migration is planned. The bundle is suitable
for a new public repository after review. Existing GitHub PR/cache metadata is not
part of a Git bundle and must be addressed separately if changing the original
repository's visibility.
