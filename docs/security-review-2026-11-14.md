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
- Browser: six focused security suites (41 tests) and the full 311-suite source
  regression run (1,898 tests) pass.
- TypeScript checks pass for both apps. Browser production source build passes
  after the patch; no installer was signed, released or replaced.
- Web Bun audit reports no advisories after the updates; browser production npm
  audit reports no advisories. Browser tooling updates remove the eight moderate
  findings: electron-builder 26.18.0, rimraf 6.1.4 and minimatch 11.0.8 are used.
  Nine low scanner findings remain through development-only deepmerge 4.3.1 and
  its dependents (GHSA-gcqx-w48m-w2h4). A checksum-pinned local patch addresses the
  demonstrated result-prototype poisoning; these scanner findings are retained,
  not suppressed. Advisory databases can change.
- Local test database migrations and `drizzle-kit check` pass with upgraded ORM
  and development tools.

These results apply to tested source, not a newly signed desktop installer or a
production penetration test. Existing disclosure/channel containment, native
resource, durability and cross-platform limitations in the earlier browser
security reviews remain independent work; no blanket security certification is
made. The source is safer after the concrete fixes above, but tests and advisory
scans cannot establish that all vulnerabilities are absent.

## Development dependency patch

No patched upstream deepmerge release is available. The existing install, predev,
prebuild and test patch pipeline now applies a pinned fix to deepmerge 4.3.1.
All three distributed source files are matched against exact original/patched
SHA-256 hashes. Unexpected versions or contents fail rather than silently skip.
Every destination property is defined as a data property, preventing JavaScript's
`__proto__` assignment setter from changing the merged object's prototype.

The original installed library reproduced an inherited attacker `isAdmin` flag.
After patching, tests against actual installed CommonJS and UMD code reject that
behavior for malicious target, null-prototype target and nested input cases.
Normal object, array and symbol merges, merge-all behavior, idempotence and
modified-patch rejection pass. The package's source entry is also hash checked.
The upstream version remains flagged by npm audit; the reproduction and local
patch evidence explain its mitigation rather than hiding the alert. Review and
remove the patch when an upstream fixed version becomes available.

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
