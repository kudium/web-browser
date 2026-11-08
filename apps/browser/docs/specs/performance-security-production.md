# Performance and security production specification

Release targets confirmed November 7: macOS, Windows and Linux.

Privacy scope confirmed by the user November 7: after local approval to share
saved data with a website, that website may process it through its own services.
Kudium Browser must continue enforcing recipient-specific disclosure and subsequent
AI action review. Strict interception of every descendant/worker/WebSocket/WebRTC
connection is outside the requested scope; earlier requirements for universal
downstream network containment are superseded by this decision.

Date: November 6, 2026. Status: implementation in progress; release readiness
unproven. Baseline checkout: `de2eae3bdf2f346d66dc91a6ef5aeda9581c0603`.
Existing local Design.md and renderer CSS edits are outside this work.

## Objective and acceptance

Make production behavior faster and safer with reproducible evidence for every
improvement. No claim of perfection or blanket security follows from green unit
tests. Release requires the gates below, including real packaged runtime checks.
This specification supplements `production-readiness-review.md` and
`../security/browser-security-review-2026-11-06.md`; it does not erase open findings
or reinterpret their historical test results as current verification.

For each change, record the triggering workload or attack, actual baseline,
implementation decision, exact source identity, after result, regression tests,
limitations, and rollback/migration behavior. Reject an optimization that violates
data integrity, permission boundaries, functionality, or measured responsiveness.
Avoid a state-library or database rewrite without evidence of a relevant cost.

## Measurement protocol

- Use disposable profiles and synthetic history, chats, credentials, extensions,
  and local HTTP fixtures. Never benchmark using personal browser sessions.
- Preserve raw before and after reports in `docs/benchmarks`. Record source hashes,
  Node/Electron versions, OS/architecture, workload, samples, warmup, timings and
  methodology. Compare identical workloads with the same runtime and hardware.
- Report medians and p95 across repeated samples for latency; record event-loop
  delay, CPU, memory and I/O bytes separately. Distinguish cold and warm startup.
  Run at least five cold launches and 30 repeated operations when applicable.
- Use deterministic request, serialization, filesystem-operation and listener
  counts alongside noisy timings. A security fix needs adversarial before/after
  evidence, not an invented speedup. Record memory after tab closure and GC only
  when the method and runtime allow a fair comparison.
- Run headless checks first. Real Electron checks use disposable userData and
  may open windows. Packaged checks must exercise production bundles and CSP.
- A microbenchmark proves only the measured operation. Whole-app improvements
  require startup, tab-switch, idle and stress measurements.

## Workstreams and required deliverables

### P0: private provider transport

Require HTTPS for remote providers, allowing HTTP only on exact loopback hosts
localhost, 127.0.0.1 and ::1. Reject embedded URL credentials. Validate on settings
save, saved-settings load, model discovery and every inference boundary. Deny
redirects, including same-origin redirects, before sending credentials/body to a
second destination. Explain that the final endpoint must be configured directly.
Legacy insecure settings must never be used to transmit credentials.

Acceptance: remote HTTP rejected before fetch; loopback models and HTTPS remain
usable; 301/302/303/307/308 do not follow or retry; request timeout, Stop and
transient retry behavior remain correct. Model discovery shares the boundary.
Baseline/after: `provider-transport.json`; genuine local redirected-request counts
and synthetic credential forwarding, plus unit and integration checks.

### P0: AI action and data-release boundaries

Revalidate the current findings in the security review. Preserve Ask first at the
navigation/action dispatch boundary, including pages without unload handlers.
Correction: baseline Ask first already had a shared early navigation gate; the
original security review overlooked it.
Standard must review sensitive submissions, including select/change/keyboard
events that can submit immediately; model-supplied labels cannot authorize them.
Approval must bind to task, tab, frame, document, origin and action, and become
invalid after Stop, navigation, ownership changes, lock or scope revocation.

Preserve explicit record-level AI consent across saves and migrations. Design an
enforced private-data release boundary for provider requests, navigation, forms,
uploads and hooks. Show actual destination and selected fields in local review;
do not rely on instructions or keyword classification as the sole protection.
Account for useful login/form workflows in adversarial and normal tests.

Acceptance: fake provider plus synthetic authenticated sites demonstrate blocked
prompt injection, private-data query exfiltration, immediate submissions, stale
approval and revoked access; intentionally approved workflows still succeed.
Document residual risks of Full access and any external/provider transmission.

#### In progress: explicit private-data disclosure

The record-consent change is a prerequisite. Implement a distinct local review
for `search_personal_data`, `read_personal_data`, `list_saved_logins` and any other
tool returning saved record content or confidential metadata. It must run even
under Full access. Search excerpts already contain private facts; calling search
must not expose them before the review.

1. Compute a bounded, protected-field-filtered result locally. Show the exact
   records/fields/passages to be released, the user task, current group/site and
   actual provider endpoint/model in native review. For external MCP clients,
   disclose that the authenticated local connection receives the data and that
   its downstream provider is unknown to Kudium Browser. Never display credentials.
2. Bind the review to run/cancellation, host and target document/owner, access
   revision, vault/auth revision, exact result digest and recipient identity.
   Subscribe to vault changes during review; reject consent changed and restored.
   Reread synchronously immediately before release and reject changed results.
3. Return only the locally approved snapshot after explicit acceptance. A denied,
   revoked or stale release must produce an error without values in tool results,
   provider requests, logs or checkpoints. Avoid a broad grant based solely on a
   model-supplied reason or query. Start with per-operation review; add a task
   grant only after exact selection/revocation semantics are proven.
4. Separately control downstream use after a read: new destination URLs, field
   entry, select/keyboard submission, uploads and hooks. Provider consent cannot
   silently authorize sending facts to another website. Full access cannot bypass
   a distinct private-data release floor. Ordinary page handlers may contact
   destinations Kudium Browser cannot infer from labels. The approved website may
   process the shared information through its own services under the user's
   confirmed privacy scope. Do not claim exact downstream network containment.
5. Fake-provider tests must deliberately ask for opted-out records and inject
   page/document instructions to read enabled records, encode facts in URLs,
   submit immediately and change consent/scope/recipient during local review.
   Verify bytes received at synthetic provider/website endpoints, including
   approved normal read/login/upload paths and Stop.

The per-operation provider/client review and private-conversation reuse guard
are implemented and measured in `../benchmarks/ai-data-disclosure.json`. The
fixture includes exact-data denial/acceptance, stale document/profile/consent,
Stop and a changed provider receiving zero requests after context denial.
Checkpoint markers persist in encrypted stores. Actual private/legacy/public
paused-task restoration, denied-review preservation, explicit retry and Stop
are verified in `../benchmarks/ai-private-recovery.json`. Large-context review
still needs a usable implementation. Reviews currently refuse
results above 20,000 bytes. Downstream network containment and injection scenarios
in items 4–5 remain open.

### P0: privileged renderer and IPC

Inventory all preload capabilities and ipcMain handlers: trusted window, exact
main frame, schema/size bounds, owner/profile/origin checks, cancellation and
post-await authorization. Test foreign windows, website frames, malformed input,
navigation and destroyed/reassigned owners. Audit external URL/file handling.

Remove production script unsafe-inline; add explicit default/object/base/frame,
asset and connect policies. Derive policy from actual bundle requirements;
development refresh may have a separate development-only policy. Test malicious
Markdown, icons and metadata, and ordinary rendering in the packaged file page.

### P1: persistence and state ownership

Inventory synchronous fs calls on startup and user-action paths. Benchmark growing
history/chat/download datasets (100, 1,000, 10,000 records) and bursts of visits.
Use serialized asynchronous atomic writes or a worker-backed database where the
measurements justify it. Do not replace a sync JSON rewrite with sync SQLite on
the main thread and call that a responsiveness fix.

If SQLite wins, design versioned schema, prepared bounded queries, transactions,
backup, encrypted sensitive fields, restrictive file/WAL permissions, migration
validation and recovery. Preserve original files until verified migration; fail
without destructive overwrite on corrupt input, full disk or interrupted writes.
Test restarts, concurrent updates, deletion ordering, session cleanup and shutdown
flush. IPC callers must await durable destructive operations and see failures.

Make the main process authoritative for durable shared data and secrets. Keep
transient UI state in React; measure render counts before introducing selective
subscriptions or Zustand. Avoid broad full-dataset IPC on every tiny change;
consider pagination/deltas only with a verified consumer migration.

### P1: browser lifecycle and UI responsiveness

Measure 1/10/50 tabs and login sessions: cold startup, tab switch p50/p95, idle
CPU/GPU, total process memory, timers/listeners and memory after closure. Compare
materials on/off separately. Identify expensive work with traces before changing
sleeping-tab defaults or memoization. Preserve media, downloads, login popups and
user-visible task behavior. Verify cleanup after repeated open/close/profile
switches, extension unload, Stop and window destruction.

### P0/P1: release and recovery

Run current full lint/types, unit tests, production build and scoped Electron
boundary tests; run the full desktop suite before release. Audit production and
build dependencies and installed Electron/Chromium support. Review Electron fuses
(RunAsNode, NODE_OPTIONS, debugging, ASAR integrity) against packaging needs.
Verify signed/notarized installers, clean installation, persisted-data upgrade,
authenticated update, unavailable keychain, OS lock/sleep, crash recovery and
uninstall behavior. Verify each target platform intended for release; configure
macOS/Windows/Linux packaging does not prove those platforms tested.

## Implementation order

1. Capture provider transport baseline; repair transport; test and report.
2. Baseline persistence and current overall quality gates; improve the measured
   bottleneck with corruption/failure regression coverage.
3. Revalidate and close AI action/data consent findings before enabling production
   AI broadly. Audit remaining IPC and tighten production CSP.
4. Measure lifecycle/UI; fix demonstrated CPU/memory/render costs and compare.
5. Complete dependency, packaged runtime, signing/update/recovery/platform gates.

Reorder when new evidence identifies a more serious production risk. A failing
gate must be repaired or explicitly remain open; do not silently omit it.

## Evidence ledger

| Item | State | Evidence / remaining work |
| --- | --- | --- |
| Provider remote HTTP / redirects | Implemented; adversarial unit/network checks pass | `../benchmarks/provider-transport.json`; 301/302/303/307/308, unsafe URL, retry/Stop checks; full lint/types/tests/build pass |
| Persistence responsiveness | History worker implemented and measured; broader work pending | `../benchmarks/history-persistence.json`: 10,000-record burst 30 → 1 writes, 40.4 → 1.35 MB; zero main-thread writes. Chat/download baselines, cold loading and query growth still pending |
| AI action/data release | Partially implemented; P0 release work remains | Standard controls/new origins reviewed; native approval revocation verified; explicit record consent preserved. See `ai-action-policy.json`, `ai-action-runtime.json`, `vault-consent.json`. Recipient-specific provider/client review and private-context reuse implemented with local Electron evidence; downstream disclosure remains open |
| IPC and production CSP | CSP implemented; broader IPC/packaging pending | Actual emitted HTML hashes/integrity and injection enforcement in `renderer-csp.json`; complete IPC inventory and installed runtime remain open |
| Tab lifecycle/UI measurements | In progress | Early unadopted tab closure fixed with failing-before/passing-after regression and real Electron verification; restoration selection race fixed and full opener/download workflow passes; disposable 1/10/50 workload and traces pending |
| Dependency and release gates | Pending | Current audit, full tests/build, packaged multi-platform evidence |
| Repeated main-process preference reads | Implemented; component and short production checks pass | `../benchmarks/preferences-2026-11-07.md`: 600/3,000 warm getter reads/parses → 0; two actual 10-tab appearance runs confirm 600 → 0 reads. Frozen snapshot, post-save publication and failure tests; external JSON edits require restart |
| Packaged Electron fuses | Five settings implemented; macOS arm64 native attacks and basic application flows pass | `../benchmarks/electron-fuses-2026-11-07.md`: Node mode, supported environment options, main inspector, modified ASAR and unpacked fallback tested before/after. Signed release, cookies and other platforms remain open; Chromium CLI restriction is separately tracked below |
| Packaged Chromium remote debugging | Implemented; native port/pipe before/after checks pass on macOS arm64 | `../benchmarks/packaged-debugging-2026-11-07.md`: baseline CDP changes trusted UI preferences; release now removes port/pipe options before ready. Local website runs in denied cases. Test-only observer retains UI/history/CSP coverage; other platforms and signed distribution remain open |

Current lint/types, 130 unit suites/659 tests and production build pass; production
dependency audit reports zero advisories. The original full opener-flow runtime check
failed at timeout-tab restoration. The renderer now checks the authoritative list
before replacing a newly restored selection, and the full opener/download workflow
passes, including keyboard/Archive restores and stale adoption replay. See
`../benchmarks/opener-restoration.json`. Broader tab/process measurements remain
open. The focused real Electron early-close check also passes. These results do not close packaged
multi-platform, signing, updates, downstream AI consent or installed CSP requirements.

History implementation retains compatible JSON and one authoritative main-process
cache, with a lazy fixed-program worker for serialization/disk I/O. It batches
visits, acknowledges committed revisions, awaits destructive mutations and
profile cleanup, and preserves corrupt originals instead of overwriting them.
Normal quit coordinates history flush with clear-on-exit and stops accepting new
visits while draining. Unit failure/race tests and real Electron history/sidebar
and immediate-shutdown checks pass. See `../benchmarks/history-recovery.json` and
`../benchmarks/history-shutdown.json`. Pending crash visits, worker memory cost,
the synchronous cold read, recovery UI and filesystem power-loss behavior remain
explicit limits; they do not close the entire persistence/release workstream.

## Release decision

Release remains blocked by unclosed P0 application findings or missing release
evidence. Maintain a requirement-by-requirement ledger rather than marking the
project complete from a subset of tests. Report exact measured gains and any
functional limits; avoid promising universal speedups or complete security.

## Favicon resource follow-up

Measured evidence is in `../benchmarks/favicon-resources.json`. Favicon responses
now have streaming/header bounds, transport abort, four active operations per
browser window, obsolete-request cancellation, and PNG/JPEG dimension preflight.
Ordinary icons still publish; oversized fixtures stop before native decoding.
The measured all-icon throughput tradeoff and native chunk/decoder limitations
are documented in the improvement report. Whole-app 1/10/50-tab latency, worker
and renderer memory/CPU, remaining IPC/data release, and packaged platform gates
remain open.

## App-list state processing follow-up

The actual manager/hook comparison is in `../benchmarks/app-state.json` and
`../benchmarks/app-state-2026-11-06.md`. Lazy hook initialization eliminates full
list processing on unrelated renders. Exact saved-string caching reduces repeated
normalization while returning independent mutable copies and checking current
storage on each read. Failed recovery remains retryable; a write before passive
subscription is now observed. Cold-read and retained-memory tradeoffs are recorded.
This is a renderer-state microbenchmark, not the required whole-app 1/10/50-tab
startup, switching, CPU/GPU and memory profile. Selective subscriptions and durable
shared-state ownership remain open.

## Workspace profiling and unused AI layer

`../benchmarks/workspace-performance-2026-11-06.md` records the 1/10/50-tab
production-bundle baseline (26/30 cases; one child timeout), a short after check
and verified lazy AI activity renderer/timer initialization. It documents the
measurement limits and remaining preference I/O, native materials, extension
listener and packaged-platform work. The unused constructor now allocates zero
renderers/intervals; isolated native first-use and takeover checks pass. The
original native input regression fails with UnknownVizError on baseline and
current code, and broader sidebar focus still fails. These native gates, full
profiling and release gates remain open.

## Preference snapshot follow-up

`../benchmarks/preferences-2026-11-07.md` records the next measured implementation:
one authoritative frozen main-process preference snapshot, replaced after a
successful atomic save and before live settings/listener callbacks. Component
bursts are 97–99.7% shorter; actual production-bundle 10-tab checks confirm zero
preference-file reads across 30 switches in both appearances. Cold snapshot
creation adds copying/freezing and manual file edits now require restart. Existing
malformed-file defaults and DNS application-before-save behavior remain unchanged.
Full checks pass at 132 suites / 671 tests, with lint/types, build and native
component permission/persistence checks. Broad native input/focus, downstream
private-data, IPC inventory and packaged release gates remain open.

## Packaged runtime follow-up

`../benchmarks/electron-fuses-2026-11-07.md` records actual package fuse inspection,
reconstructed default-fuse attacks and current packaged application checks.
Packaging now disables RunAsNode, Node environment options and the main inspector,
requires ASAR and enables embedded integrity validation. Node script/inspector and
unvalidated app-code entry points fail in the hardened fixture; normal packaged
UI, website isolation, durable history worker, inline CSP and tab cleanup pass.
Cookie encryption needs signed migration/Keychain verification. Chromium remote
debugging is separately open; it is not closed by the main inspector fuse. Signed
distribution, external/unpacked resources and Windows/Linux/x64 behavior remain
release gates. No full desktop-suite or whole-app performance claim follows.

## Chromium debugging follow-up

Remote debugging is now restricted in packaged initialization. Native random/fixed
ports and inherited pipe tests demonstrate available baseline endpoints and denied
after endpoints while local startup pages execute. Production has no testing
exception. The packaged runner uses a trusted test-only ASAR observer to preserve
the previous UI/worker/CSP assertions, with identical production payload bytes.
See `../benchmarks/packaged-debugging-2026-11-07.md`. All 133 suites / 673 tests,
lint/types, build, directory packaging and scoped native checks pass. This closes
the tested macOS arm64 Chromium CLI entry points; broader release gates remain.

## Attachment import ownership follow-up (November 7)

AI picker/add imports now bind to the original chat, frame, composer/access
revision and group; stale asynchronous work rejects before storage and rolls back
its created entries. Native before/after tests reproduce eight stale cases:
all accepted before, all rejected after with zero retained attachments. Normal
two-file imports succeed; selected-file synchronous reads/stats fall from 2/2
to 0/0 through bounded asynchronous descriptor reads. The existing native AI
smoke also preserves Preferences access after browser closure. See
`../benchmarks/ai-import-boundary-2026-11-07.md` and its verification JSON.
This closes the measured import ownership race; downstream provider/upload bytes,
full IPC/decoder containment, native focus/input and signed/cross-platform release
gates remain open. Current unsigned/ad-hoc arm64 package passes the scoped
fuse/debugging/observer security runner; observer limits still apply.

## Saved-data fill/upload approval follow-up (November 7)

`../benchmarks/ai-private-fill-2026-11-07.md` records actual Electron/MCP
before/after request-body evidence. Nine stale saved-data fill/document-upload
reviews previously sent a synthetic private value through website input/change
handlers; all nine now reject with zero private request bodies. Normal approved
fill, file-input upload and pending native chooser paths still succeed. Existing
Cancel/Stop behavior remains blocked in both phases. Document/owner/access and
vault/auth bindings now span native review and dispatch, including pending
website confirmations. Any vault write during approval requires a fresh review.
The synthetic HTTPS endpoint reads actual Chromium Request bodies through a local
protocol handler; no external provider injection or network allowlist is proven.
Temporary secure-input request/reuse document lifetime, arbitrary downstream
website traffic, native input/focus, IPC and signed/cross-platform gates remain
open. See the verification JSON for precise current source/package check scope.

## Temporary secure-input follow-up (November 7)

`../benchmarks/ai-private-input-2026-11-07.md` records eight stale collection/reuse
cases previously sending private Chromium Request bodies, now all rejected with
zero private bodies. Original document/owner/access bindings survive collection
and temporary reuse; navigation/auth revocation cancels pending forms. Cleanup
on consumption, Stop, chat/scope/permission change and expiry disposes retained
listeners/timers. Normal temporary fill and explicit scoped saving still succeed.
The stale explicit-save case no longer persists a record. Cancel/Stop already
blocked on baseline. Expiration/renderer cleanup is unit evidence; OS lock uses a
native emitted event, not a physical-session/Keychain claim. Arbitrary website
traffic and provider injection, full IPC and signed/cross-platform gates remain
open; see verification JSON for current checks and package scope.

## IPC inventory and lifetime follow-up (November 7)

`../security/ipc-inventory-review-2026-11-07.md` and its AST JSON enumerate 47
fixed app-owned channels, one dynamic secure-input channel, three generic preload
methods and two generated scripts. Source entry-gate review is documented; all
subactions/dependency channels are not yet audited. Native before/after evidence
in `../benchmarks/ipc-boundaries-2026-11-07.md` demonstrates seven stale group/
preference effects blocked after same-URL reload, plus runtime bounds on generic
preload channels. Normal selected operations and existing foreign-window denial
remain usable. Group removal/partial deletion, composer Save, MCP/personal-agent
async mutations, capture requester lifecycle and decoder/dependency surfaces are
prioritized remaining work. No full IPC, physical OS auth, downstream private-data
or signed/cross-platform release claim follows.

## Attachment Save persistence follow-up (November 7)

`../benchmarks/ai-composer-save-2026-11-07.md` supersedes the open composer Save
lifetime item for nine tested cases. Actual encrypted records created by stale
requests changed from one per case to zero; credential-adapter writes also became
zero. Normal private/browser-wide and AI-enabled/group saves preserve original
bytes and consent, and cancellation creates no record. The ownership guard spans
dialog, extraction and asynchronous vault capability discovery. This is isolated
native-handler/encrypted-vault evidence with controlled OS credentials, not real
Keychain, preload serialization, provider/site traffic or signed-release proof.
Group removal/partial cleanup, MCP/personal-agent/capture/decoder/dependency IPC
and downstream private-data containment remain open.

## MCP/personal-agent ownership follow-up (November 7)

`../benchmarks/mcp-ownership-2026-11-07.md` supersedes the tested asynchronous
configuration-lifetime findings: nine stale requests reject; competing token
rotation is rejected during agent review, preserving a live saved credential.
Three real loopback SDK/tool calls accepted during held listener startup before
are refused afterward. Revoked restarts persist disabled state, close listeners
and rotate/remove credentials; a later human takeover remains paused. Normal
setup/disconnect and trusted settings after host close pass. This is native
handler/socket/file evidence with controlled scheduling and dialogs, not physical
input, preload serialization, external agent integration or private-data traffic.
Full IPC subactions/dependencies, agent file path/resource races, group removal,
capture/decoder bounds, downstream containment and signed/cross-platform gates
remain open.

## Group deletion coordination follow-up (November 7)

See `../benchmarks/group-removal-2026-11-07.md`. The implementation now binds exact
tabs/profiles through native approval/auth, checks all app-owned profile users,
records durable cleanup intent/checkpoints, reserves pending browser/private
scopes, and retires completed IDs across restart. Actual before/after probes block
four unsafe pre-commit cases, clear a second unshared profile, finish after owner
close, correctly remove the last profile owner despite stale renderer metadata,
and reduce storage-clear dispatches on native process-restart retry from two to
one. This supersedes the tested stale-owner/partial-cleanup findings; it does not
prove atomic multi-store deletion. Abrupt interruption at every phase, disk-full
failures, conflict/corruption recovery UI, extension/session writers, and signed/
cross-platform durability remain open.

## Page capture follow-up (November 7)

See `../benchmarks/page-capture-2026-11-07.md`: nine tested stale/canceled capture
operations now reject, six existing export destinations remain intact, malformed
crop rejects, and registration replacement works. Document/source ownership spans
async capture and save selection; private temporary export checks precede rename
dispatch. Focused tests (2 suites /15 tests), lint/types, build and separate native
renderer/main capture UI pass. This supersedes the tested capture-lifetime item;
decoder/native resource containment, path races, crash durability, downstream
private-data containment and signed/cross-platform release gates remain open.

## Image preflight follow-up (November 7)

`../benchmarks/image-preflight-2026-11-07.md` documents image dimension checks
before native decoding in AI attachments and page captures, plus the capture
base64 allocation bound. Four actual attachment decoder dispatches become zero
with controlled hostile-header fixtures; normal native PNG still works. Header
limits do not sandbox decoders or bound original Chromium capture allocation.
Space-icon file reads, download thumbnails, animation/container/native-resource
limits and signed/cross-platform gates remain open.

## Local images follow-up (November 7)

See `../benchmarks/local-images-2026-11-07.md`: icon/thumbnail sources now use
bounded asynchronous descriptor reads and validated buffers/private snapshots.
Two source replacements decode the original bytes; stale thumbnail completion
rejects; oversized/malformed inputs avoid native image decoding. Eight requests
peak at four thumbnail pipelines, and 128 pending IDs are bounded. Real app ICNS
import now works. Unit (140 suites /709 tests), lint/types, build and scoped
production preload checks pass. Temporary snapshots add I/O; no whole-app speed,
decoder sandbox, complete format/platform or crash-cleanup claim is made. OS file
icon resources, downstream private-data containment and signed release gates remain
open.

## Saved-data downstream action review (November 7)

See `../benchmarks/private-outbound-2026-11-07.md`. Full access no longer bypasses
local website-action review once saved facts enter an AI context. Six tested
unsafe Chromium/socket transmissions become zero, including a fake provider
encoding approved data into a URL and an MCP controller recreation. Approved
form entry and public Full-access navigation still work. MCP disclosure markers
persist; private generated task instructions retain their review requirement.
This supersedes the tested missing action-review floor, not network containment.

Next required network work must compose with the existing advancedPreferences
request rules rather than replace them. Arm enforcement before private bytes
reach website code; bind reviews to actual request destinations and immutable
payload/selected-field identity. Cover redirects, descendant frames, shared
profiles and unowned service-worker requests, with bounded pending reviews and
revocation before dispatch. Establish how existing WebSocket/WebRTC channels are
closed or constrained, and retain the policy while DOM/hooks/worker storage can
still contain released values, including Stop/restart. Plain webRequest hooks
cannot establish all-channel containment. Test intentionally approved form/login/
upload workflows and hostile transformed facts at socket boundaries before
claiming exact recipient control. Native Enter delivery, private attachments/
user input/general website facts, marker power-loss durability and signed release
gates also remain open.

## Private navigation destination boundary (November 7)

See `../benchmarks/private-navigation-2026-11-07.md`. Native main-frame redirects
now wait for bound local review in private AI contexts, while shared request
rules preserve preference blocking. Denied same-origin and cross-origin redirects
each change from one destination request to zero. Approved POST 307 retains its
body/cookie; public navigation, two-hop redirects and a sibling sharing the profile
remain functional. Stop and changed/restored consent cancel pending dispatch.
All 142 suites /722 tests pass; final lint/types/build evidence is recorded with
the benchmark. This closes only the tested private main-frame redirect gap.
Descendant/worker/existing-channel containment, private new-tab/history socket
fixtures, general private-data provenance, native Enter delivery, durability and
signed/cross-platform release gates remain open. Production readiness is unproven.

## Private navigation dispatch authorization (November 7)

See `../benchmarks/private-navigation-dispatch-2026-11-07.md`. Retain consent,
controller, host/document and target/profile/scope authorization before initial
review through native tab creation. Recheck synchronously at the native allow
callback, including the first approved URL. Three stale-authorization socket
cases each change from one destination request to zero. Native private new-tab,
Back, Forward and Reload redirect reviews and approved/public navigation pass.
This supersedes the missing native new-tab/history fixture item above for the
controlled createTab callback; full renderer/extension creation remains open.
All 142 suites /726 tests, lint/types and production build pass. Descendant/worker/
existing-channel containment, general data provenance, native Enter delivery,
durability and signed/cross-platform release gates remain open.

## Native Enter behavior (November 7)

See `../benchmarks/enter-key-2026-11-07.md`. Enter now carries carriage-return
text, and keyboard input revalidates its observed target after focus. The native
MCP fixture changes from 0/14 to 14/14 successful submissions/POSTs, restores a
textarea newline, honors canceled/default-prevented actions and blocks a field
changed during focus before any key command. Modifier/text tests, all 142 suites
/727 tests, lint/types and production build pass. This closes the listed native
Enter cases; original pointer UnknownVizError, broader sidebar focus, interruption/
frame/physical-input coverage, data containment and signed/platform gates remain
open. One renderer evaluation is added; no whole-app speedup is claimed.

## Pointer regression diagnostic (November 7)

See `../benchmarks/pointer-diagnostic-2026-11-07.md`. The original UnknownVizError
is reproduced at native page capture after successful pointer commands. An
isolated capture-skipping probe reaches a separate stale renderer resize
assertion (native width 400, renderer width 700); explicit focus does not resolve
it. No production source was changed and neither visual regression nor full
sidebar takeover is declared passing. Preserved evidence identifies the next
verification boundary without repeating completed unit/build checks.

## Interrupted keyboard cleanup (November 7)

See `../benchmarks/key-release-2026-11-07.md` (or the adjacent benchmark file).
Held keys are now released by their owned protocol sessions during Stop, timeout,
failure and incomplete completion, using bounded cleanup without text/commands.
Native Stop/failure cases change from zero to one trusted key-up event each;
normal presses retain two commands. Unit coverage includes pending acknowledgements,
child-session ownership and bounded stalled cleanup. All 142 suites /731 tests and
production build pass; final checks and hashes accompany the benchmark. This
closes the measured key-release cases, not physical/mixed-input, native iframe,
full sidebar takeover or compositor verification. Production readiness remains
unproven, including private data/network containment and signed/platform gates.

## MCP private marker durability (November 7)

See `../benchmarks/mcp-marker-durability-2026-11-07.md` (or the adjacent benchmark).
Private MCP markers now require parent-directory sync after atomic rename. Loaded
markers must be confirmed before new private facts return; failed confirmation
retains runtime review requirements and can retry. Two injected post-rename/
restart failure cases change from returning to throwing. Required syscall order,
cached acknowledgement and temporary cleanup are verified against real controller
/filesystem operations. This does not establish physical power-loss durability or
Windows/Linux support. Final checks accompany the benchmark. Conversation/task
persistence, private network containment and broader production gates remain open.

## Extension store boundary (November 7)

See `../benchmarks/extension-store-boundary-2026-11-07.md` (or the adjacent
benchmark). Store IPC now requires its exact main frame/session/live owner and
bounded status inputs. Uninstall approval binds document, profile/owner history
and catalog snapshot through the synchronous queued mutation check. Four native
stale-approval cases change from one catalog mutation to zero; a same-origin
child loses status access, while approved removal still succeeds. Native tests
use actual IPC/filesystem but adapted extension engines/review, so live store
and dependency routes remain open. Final checks/hashes accompany the benchmark.

## Native extension engine verification (November 7)

See `../benchmarks/extension-store-integration-2026-11-07.md` (or the adjacent
benchmark). The same store boundary now runs with installed extension engines
and a real local Manifest V3 extension in three disposable persistent sessions.
Four stale approvals change from actual target unloading to retaining the
extension. Approved removal unloads only the selected profile and preserves both
siblings; child-frame status access is rejected and request listeners clear.
This strengthens the earlier catalog-only fixture, without production source
changes or repeating prior full checks. Remote store installation, dependency
permission/native-messaging/worker branches and broader release gates remain open.

## P0 extension installation scope (November 7)

See `../benchmarks/extension-install-scope-diagnostic-2026-11-07.md` (or the
adjacent benchmark). Actual dependency/native cached-install IPC approves Target A
but emits native load events in store → A order. Later reconciliation removes
store and therefore hides the violation from final-state checks. No production
source changed. This installation branch remains a release blocker despite the
verified uninstall improvements. Next work must prepare/review packages before
loading and dispatch directly into the approved session, with document/target/
owner/package checks at actual native load. Measure first-load events for selected
and All-session grants, stale/canceled requests, queued/delayed preparation and
package/permission changes; preserve real store workflows and installed signals.

## Owned extension installation (November 7)

See `../benchmarks/extension-install-owned-2026-11-07.md` and
`release-status-2026-11-07.md`. The selected-session first-load violation is
repaired: store → A becomes A alone. Package contents are copied/validated and
actual permissions reviewed before queued, bound native dispatch. Six stale/
mutation cases become zero native loads; explicit All, decline, copied-source
independence and ordinary callback refresh remain functional. All 143 suites/
735 tests, lint/types and build pass, with 24 native cases on macOS arm64. Remote
store/authenticity/download bounds, native-ack/failure recovery, Windows/Linux
and broader P0/P1 gates remain open. This closes the measured cached install
scope invariant, not the full release objective.
