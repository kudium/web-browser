# Release status — November 7, 2026

Required platforms: **macOS, Windows and Linux**, confirmed by the user. This is an evidence-based status, not a production approval. The user has requested efficient completion after roughly eight hours; avoid broad repeated audits and prioritize the blockers below.

Privacy boundary confirmed by the user: an approved website may process shared
saved data through its own services. Strict downstream network isolation is
outside scope and is removed as a release gate. Local disclosure/recipient and
AI action review protections remain in place.

The current extension install-scope repair is implemented: selected installs load only the approved profile, actual copied package permissions are reviewed, stale/package-mutation cases produce zero native loads, All-session and declined flows remain functional. There are 143 passing suites /735 tests, passing lint/types/build and 24 native before/after cases. Native evidence is macOS arm64 only. See `../benchmarks/extension-install-owned-2026-11-07.md`.

Latest batch: native-messaging sender/lifetime isolation and authenticated, bounded CRX3 downloading/extraction are implemented in both dependency bundles. 42 controlled CommonJS/ESM cases pass, along with one real Google store package download, the full 143-suite/735-test run, lint/types and build. See `../benchmarks/dependency-hardening-2026-11-07.md`. A three-platform validation workflow is prepared; the user confirmed runners/signing credentials are not configured. Hosted execution and signed installers remain outstanding.

Further local work: extension updates now require main-process review of an immutable package and retain the previous package for rollback. Five main-process cases and installed CommonJS/ESM updater checks pass; the current full suite is 145 suites /746 tests with passing lint/types/build. See `../benchmarks/extension-update-owned-2026-11-07.md`. The original pointer screenshot/resize regression passes under software rendering, with preserved screenshots; GPU mode and full application handoff remain unverified. See `../benchmarks/pointer-software-rendering-2026-11-07.md`.

Latest verification supersedes the green count above: extension IPC provenance
and owning-workspace remote toolbar checks, payload-log removal, 12 scoped
extension/package tests, scoped lint/build and a real selected-install integration
pass. The latest whole-project run found three failing suites and developer
terminal/editor lint failures while those files changed concurrently. Those
edits were preserved, and final whole-project verification needs a stable shared
workspace. See `../benchmarks/extension-router-2026-11-07.md`.

| Priority | Open release gate | Evidence required |
| --- | --- | --- |
| P0 | Extension remote install and recovery | Real store UI, cached-package authenticity/store provenance policy, durable failure recovery/native acknowledgment. Fresh CRX3 signatures, download/extraction limits and reviewed updates now have scoped evidence |
| P0 | Privileged dependency/native messaging coverage | Remaining async capability lifetimes and OS native host integration. Router frame/worker provenance, owning-workspace cross-session toolbar access and payload-log removal now have installed CommonJS/ESM regressions |
| P0/P1 | Packaged signed release on all three targets | Signed/notarized/authenticated-update and fresh-install/upgrade/keychain/cookie recovery checks; macOS source fixtures do not prove Windows/Linux. Private marker durability needs filesystem-specific verification, especially where directory sync is unsupported |
| P1 | Full desktop suite / control handoff | GPU screenshot/resize and actual sidebar takeover/focus; full desktop suite, crash/OS input/resource cleanup and whole-app measurements. Original pointer regression passes under software rendering |

Prior improvements retain their original evidence and limitations. No claim of 100% security, complete cross-platform support or release readiness follows from the passing current checks. Finalizing this one fix does not redefine the full objective.
