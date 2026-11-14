# Security hardening and publication review, November 14, 2026

This review covers locally available Git history, package advisory scans, web
authentication transport/cache/input controls, and focused browser security
regressions. It is not an independent penetration test or a Chromium exploit
assessment. Third-party licensing review remains deferred by user instruction.

## Fixed in this change

- Drizzle ORM upgraded from 0.44.7 to 0.45.4, resolving the reported SQL identifier
  escaping advisory GHSA-gpj5-g38j-94v9. The advisory applies to the dependency;
  this review did not demonstrate an exploitable application route.
- Drizzle Kit is pinned through its updated range and esbuild resolution is
  overridden to 0.25.12, removing the older development-server advisory
  GHSA-67mh-4wv8-2f99. Migration contract checks and the CLI check pass.
- All `/api/auth/*` responses explicitly use `Cache-Control: no-store`, including
  errors. Authentication JSON requests are limited to 64 KiB before auth dispatch.
- Remote SMTP explicitly requires TLS. SMTP URL query parameters, paths,
  fragments and non-SMTP schemes are rejected so configuration cannot weaken the
  transport/certificate policy. Loopback Mailpit is limited to local app origins.
- Two existing browser type errors were resolved with explicit types; runtime
  behavior is unchanged.

## Validation

- Web: 83 tests pass against a dedicated local PostgreSQL test database.
- Browser: six focused suites, 41 tests pass (AI permissions/approval, private
  input lease, privileged navigation, page capture and image preflight).
- TypeScript checks pass for both apps.
- Web Bun audit reports no advisories after the updates; browser production npm
  audit reports no advisories. Advisory databases can change.
- Local test database migrations and `drizzle-kit check` pass with upgraded ORM
  and development tools.

These results apply to tested source, not a newly signed desktop installer or a
production penetration test. Existing disclosure/channel containment, native
resource, durability and cross-platform limitations in the earlier browser
security reviews remain independent work; no blanket security certification is
made. The source is safer after the concrete fixes above, but tests and advisory
scans cannot establish that all vulnerabilities are absent.

## Cleaned history candidate

`scripts/prepare-clean-history.py` creates an isolated mirror from committed local
history, removes personal filesystem paths and private browser group metadata,
replaces author/committer/tagger email fields with a non-deliverable placeholder,
and retains author names and ref names. It checks reachable blobs, Git integrity,
and secrets, then exports a verified Git bundle. It does not touch live remotes.

The rewrite changes commit IDs and tag targets and strips invalidated signatures.
Existing release records and retained installers refer to original source hashes.
Replacing the live repository would require coordinated force-pushing rewritten
branches and release tags, updating all clones, and separately addressing GitHub
cached commits and PR references. Do not force-push automatically. Published
installer artifacts remain immutable and must not be rebuilt or overwritten under
existing versions. A new public repository using the cleaned candidate avoids
changing the private release provenance.
