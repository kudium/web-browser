# Main-process preference snapshot

November 7, 2026. Raw component measurements: `preferences.json`.
Verification identities and check results: `preferences-verification.json`.

## Problem and implementation

The production-bundle profiler observed 600 synchronous preference-file reads
over 30 warm switches with 10 tabs, and 3,000 with 50 tabs. Every getter also
parsed JSON and validated all settings, even when nothing changed. This blocks
Electron's main thread during navigation, permission checks and layout updates.

`getBrowserPreferences()` now reads and validates once per userData path and
returns a deeply frozen snapshot. It clones the initial value before freezing,
so shared defaults and caller-owned arrays remain independent. Missing/malformed
files retain the existing default behavior, now cached. There is one snapshot,
not an accumulating cache. Successful settings saves replace it after the atomic
file rename and before applying settings or notifying listeners. Failed writes
keep the prior snapshot and emit no change notification. Pending directory-picker
results still merge current settings and revalidate their owner.

All current main-process callers read preferences; settings writes go through
`updateBrowserPreferences()` or the authorized preference-action handlers.
The getter's top-level TypeScript result is read-only; nested values are also
frozen at runtime. IPC serialization gives the renderer its own ordinary copy.
This prevents accidental in-process mutation from changing permission policy
without validation and persistence. It does not protect against malicious main
process code or someone who can edit application files.

## Component results

The probe runs the actual preferences module and website permission-check handler
in Electron 45 on macOS arm64. The before variant substitutes only preferences.ts
from `de2eae3bdf2f346d66dc91a6ef5aeda9581c0603`; other bundled sources are identical
and hashed. Fixtures contain zero or the supported maximum 256 site rules.
Each burst uses 600 or 3,000 direct getter calls, modeling the measured 10/50-tab
amplification. There are three excluded warmups and 21 measured bursts per case.
These are component timings, not tab-switch or whole-app speed measurements.

| Site rules | Calls per burst | Before median / p95 | After median / p95 | After confirmation median |
| --- | --- | --- | --- | --- |
| 0 | 600 | 12.54 / 13.22 ms | 0.38 / 0.50 ms | 0.37 ms |
| 0 | 3,000 | 60.34 / 62.63 ms | 1.64 / 1.69 ms | 1.58 ms |
| 256 | 600 | 118.52 / 124.41 ms | 0.34 / 0.39 ms | 0.34 ms |
| 256 | 3,000 | 586.73 / 595.46 ms | 1.67 / 1.73 ms | 1.66 ms |

Observed warm bursts are 97–99.7% shorter. Filesystem reads and JSON parses per
burst fall from 600/3,000 to **zero** in both after runs. Counts provide stronger
evidence than wall time: background checks and scheduling can affect timings.

Cold initialization still reads and validates, then copies/freezes the snapshot.
Single cold observations were 0.41 → 0.55 ms with no site rules and
0.61 → 0.80 ms with 256 rules. Confirmation was 0.46 / 0.80 ms. These are
single component observations, not repeated cold-launch or cold-filesystem
benchmarks. Serialized snapshots are 2,179 / 34,324 bytes; this is not heap or
physical-memory usage. No startup, memory or GPU improvement is claimed.

## Production-bundle check

The short workspace run uses the actual rebuilt production main/renderer and
disposable local pages, with one 10-tab launch per glass/solid appearance. Across
30 warm switches per launch, preference-file reads fall from **600 / 600 to
0 / 0**. The before reference is `workspace-performance.json.after` (the prior
lazy-overlay build); the new result is `.confirmation`. All current bundle hashes
match the staged measurement. The renderer and preload bundles are unchanged;
preferences.ts is the only changed source among the profiler's five tracked
source identities. Both launches and tab-close cleanup complete successfully.
This confirms application use of the cache. One launch per appearance supports
the deterministic I/O result, not a general startup, latency or memory claim.

## Correctness, compatibility and remaining gates

- Unit coverage includes one read per data path, nested mutation refusal, detached
  defaults/patches, listener ordering, failed rename, and missing/malformed input.
- Native checks verify a saved global block is seen by listeners and denies a
  website permission immediately. The saved JSON is read independently to verify
  persistence. Older snapshots stay unchanged after successful saves.
- The existing settings, directory-picker, stale-owner and live-view unit checks
  remain part of the full suite. The native probe is in the desktop check runner.

JSON shape and atomic temporary-file/rename persistence remain compatible. No
migration is required. Manual external edits now require restarting Kudium Browser;
there is no live file watcher or periodic synchronous stat/read. This is an
intentional behavior change, including when repairing a malformed file. Settings
changes through the application remain immediate. A code rollback needs no data
conversion. Existing DNS application-before-save ordering and malformed-file
default policy are unchanged; this change is not a transactional network-settings
or corrupted-settings recovery redesign.

The original native input regression and broader sidebar focus failures remain
open, as do packaged/platform and other security release gates. See
`workspace-performance-2026-11-06.md` and
`../specs/performance-security-production.md`.

Reproduce with `node .erb/scripts/preferences-benchmark.cjs before`, then `after`
and `confirmation`. The probe uses disposable JSON and no personal profile.
