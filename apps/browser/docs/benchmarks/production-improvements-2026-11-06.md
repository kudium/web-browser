# Production improvement evidence — November 6, 2026

Whole-app profiling and the unused AI renderer/interval improvement are recorded
in `workspace-performance-2026-11-06.md`, with partial baseline status and scoped
after observations explicitly retained.

App-list state processing follow-up: `app-state-2026-11-06.md` documents actual
manager/hook before/after timings, the mount subscription race, regression checks,
and cold-read/memory limits. Raw runs are in `app-state.json`; these are synthetic
record/React workloads, not whole-app live-tab performance measurements.

## Provider transport

Actual before/after raw results: `provider-transport.json`. Measured against a
local 307 fixture with synthetic credentials and body, using the bundled actual
inference module on Node 22.23.1, macOS arm64. Source hashes are in the report.

| Observation | Before | After |
| --- | --- | --- |
| Remote HTTP endpoint passes validation | Yes | No |
| Provider redirect followed | Yes | No |
| Outgoing requests for the fixture | 2 | 1 |
| Redirect destination receives synthetic authorization | 1 | 0 |

The baseline shows same-origin credential forwarding, which fetch normally
permits; it does not demonstrate cross-origin credential leakage by fetch.
Rejecting redirects prevents conversation/body forwarding to either type of
destination. Cross-origin 301/302/303/307/308 rejection is exercised by actual
loopback HTTP servers in `aiProviderTransport.test.ts`, with both inference and
model discovery using the same request boundary. Explicit `redirect: follow`
cannot override it. URL tests cover remote HTTP, misleading loopback suffixes,
LAN addresses, embedded credentials and supported local model addresses.

All remote provider settings paths now use the dedicated provider validator;
ordinary HTTP website navigation retains its existing behavior. Insecure saved
settings are rejected during load before decrypting a remembered key; the app
uses its default configuration and requires reconfiguration. No original settings
file is deleted. Existing timeout, cancellation and transient retry tests remain
part of validation. This change can require users of redirecting provider URLs
to enter their final endpoint; local HTTP models remain supported.

This is security-policy evidence, not a general inference speedup or a complete
security audit. The eliminated second request applies only to redirects.

## History persistence baseline

Raw report: `history-persistence.json`. Actual history module, synthetic files,
no user profile, one cold read and 30 new visits per dataset.

| Initial records | Sync writes | Bytes rewritten | Batch timer delay | Visit p95 |
| --- | --- | --- | --- | --- |
| 100 | 30 | 453,570 | 14.77 ms | 1.38 ms |
| 1,000 | 30 | 3,990,600 | 17.54 ms | 1.15 ms |
| 10,000 | 30 | 40,377,825 | 80.51 ms | 3.72 ms |

The main process rewrites the whole bounded history for each visit. Reducing
rewrite frequency and removing synchronous disk work are supported by this
baseline. Async disk I/O alone still leaves JSON serialization on the main
thread; a worker or incremental storage must be evaluated for the large dataset.
Cold load at 10,000 records was 11.57 ms. The timer metric is a synthetic batch,
not user-observed tab-switch latency.

## History worker implementation and comparison

The original before report is preserved. `after` records the initial implementation;
`confirmation` records the final worker observer-error handling with exact source
hashes, first-visit and maximum call durations. These are separate real executions,
not overwritten results. All use Node 22.23.1 on the same macOS arm64 host.

| Initial records | Total writes before → after | Bytes before → after | Main-thread writes after | Batch timer delay before → confirmation |
| --- | --- | --- | --- | --- |
| 100 | 30 → 1 | 453,570 → 17,423 | 0 | 14.77 → 2.42 ms |
| 1,000 | 30 → 1 | 3,990,600 → 135,324 | 0 | 17.54 → 2.13 ms |
| 10,000 | 30 → 1 | 40,377,825 → 1,346,274 | 0 | 80.51 → 9.64 ms |

The large burst writes about 96.7% fewer bytes. Its two after timer observations
were 6.72 and 9.64 ms. The confirmation's visit-call median/p95 were 0.075/1.088 ms;
the first call, including worker initialization, took 3.03 ms. Explicit flush took
38.60 ms and the whole batch completed in 47.99 ms. Scheduling a visit is not
equivalent to durable completion; both metrics are recorded to avoid that claim.

Serialization, file writes and fsync run in one fixed-program worker. Only a small
visit message crosses the boundary; normal commits acknowledge revisions rather
than copying the whole history back. Visit bursts share one write, and trusted UI
receivers receive one committed update instead of a full dataset per visit.
Reads alone do not launch a worker. Deletions and profile cleanup wait for commit;
ordered acknowledgements preserve visits arriving after a deletion request.

The file remains compatible JSON, so no database migration or new native package
was needed to remove the measured blocking writes. A SQLite decision still needs
query/growth evidence for history, chats and downloads. The initial history read
is still synchronous: the confirmation took 14.78 ms compared with 10.50 ms in
the initial after run and 11.57 ms before. No cold-read speedup is claimed. Worker
RSS/CPU overhead and whole-app startup/tab switching remain unmeasured.

Visits are optimistic and batched with a 25 ms worker timer; a sudden crash can
lose pending visits. Normal quitting freezes recording and flushes before exit.
Explicit deletion waits for file fsync and atomic rename. POSIX owner-only modes
are verified on this host; Windows ACLs and power-loss/directory-entry durability
are separate release requirements. File-rename atomicity prevents partial JSON
replacement; it is not a universal filesystem or power-failure guarantee.

## History corruption and shutdown evidence

`history-recovery.json` bundles the exact original Git source and current source
against three malformed synthetic files. All three originals were overwritten
before; all three remain byte-for-byte intact after, with clear rejected. New
navigation remains usable, while history operations explain that the original
must be restored. A recovery UI remains future work; blocking a corrupt overwrite
is not a claim of successful reconstruction of damaged records.

Real worker unit checks cover burst batching, owner-only mode, credential stripping,
deletion failure/retry with actual EISDIR, temp-file cleanup, clear/profile ordering
with concurrent visits, restart, termination, and observer exceptions. The latter
cannot strand a caller after a completed write. Test fixtures flush and terminate
their workers before deleting temporary directories.

The quit coordinator waits for both history and clear-on-exit tasks, denies repeat
quit requests while draining, and restores recording on failure. It waits for all
tasks to settle even if one rejects. Dedicated race tests cover both orders and
safe retry. `history-shutdown.json` verifies an actual Electron quit immediately
after 30 visits without manual flush: all 30 are on disk before will-quit.

`browser-ui-smoke.cjs --history-only` passes with real Electron/worker IPC: visited
pages, search, revisit, narrow sidebar, real disk failure preserving memory and
original bytes, error display, retry and persisted clear. Its expected EISDIR IPC
error is recorded by Electron; it is an intentional failure-path assertion.

## Test infrastructure corrections

The original `npm test` command failed before Jest: the external-link harness
expected a create/app payload after production changed to open-external/url.
Update its assertions to verify exact destinations and trusted handshakes with
the current dispatch; do not retain a false separate-session assertion.

Jest selected YAML's browser ESM build while main-process code requires its Node
build. Map that dependency to its shipped CJS entry in Jest only. The browser
test Electron mock lacked ipcMain.handle and app.getPath now required by developer
library/group-lock registration; supply those fixture APIs. Media context-menu
assertions now use the actual New Group labels. Existing formatting failures
were repaired without disabling lint rules or removing tests.

## Early website tab closure

Raw deterministic comparison: `early-tab-close.json`. An intercepted close for
a child awaiting UI adoption prevented the native close and retired only the
layout entry. Its WebContents remained alive. The regression reproduced zero
close calls before the fix; after removing the interception listener the retire
path now requests native closure exactly once. The regression passes, verifies
cleanup after simulated native destruction, and retains late-adoption refusal.
This avoids an orphan website renderer; no exact RAM or CPU saving is claimed.
The focused real Electron command `--early-tab-close-only` also passes with a
local self-closing website and held renderer acknowledgement: child destroyed,
host preserved, late adoption refused and metadata archived. It uses disposable
userData. The broader `--opener-flow-only` passed that step, then failed at the
archived timeout-tab restoration lookup (`heldAdoption`, missing restored view).
A subsequent repair is recorded in `opener-restoration.json`: when reopening a
tab, the renderer could consult its stale archived snapshot and select a neighbor
before its list subscription caught up. The fallback now checks AppManager's
current authoritative list. Keyboard and Archive restoration preserve the original
ID, use fresh generations, load only on explicit restoration, and survive delayed
adoption replay. The full opener/download workflow now passes, including nested
children, early/active download recovery, pause/resume/cancellation, sidebar Stop
and source closure. The fixture was also updated to use the current Group Settings
Placement control instead of a removed Unpin Session menu action. No whole-app
speedup or memory figure is claimed for this correctness fix.

## AI action authority and stale approvals

`ai-action-policy.json` preserves the initial original/current DOM-policy probe
and a confirmation against the formatted final policy. The exact baseline Git
policy allowed all four synthetic controls without review: Continue, Continuar,
a select change containing an Erase account choice and a Delete-key shortcut.
The tightened Standard policy reviews all four; denied synthetic controls cause
zero click/change effects. DOM hints remain observations and never grant authority.
No exact application-speed gain or actual account deletion is claimed.

`ai-action-runtime.json` uses real Electron 45, actual registerAI and an official
MCP client. Denied buttons/select/keyboard input produce zero effects, while an
approved button produces one. Same-URL reload, profile reassignment, changed then
restored access, and owner changes while native input is held behind a website
dialog reject stale dispatch. Listener ownership lasts until native completion,
even when the tool returns an early pending-dialog receipt. Unit checks cover
host/target destruction, crash, Stop, revocation and cleanup.

Standard reviews new-origin navigation and permits same-origin browsing. Ask
first already had a shared navigation gate in the baseline; the original security
review's contrary claim was corrected. Consolidating navigation and unload review
produces exactly one prompt with or without an unload handler. Approved navigation
still completes. Full access retains its explicit broader action grant.

The normal real-provider fixture `ai-smoke.cjs` passes its local tool loop,
read/type/click, approvals, retry, navigation and session-key/IPC checks. The full
MCP smoke passes native actions, frames, dialogs, uploads/downloads, Stop, local
connection authorization and token revocation. These fixtures are synthetic;
provider prompt-injection and private-data-release requirements remain open.

## Explicit record-level Personal Data consent

`vault-consent.json` compares actual original Git vault/editor source with current
source against encrypted synthetic files. The corrected confirmation has nine
unrequested effective grants before and zero after: four record kinds, missing
consent, new memory, and false legacy record/override/global permissions. The
initial legacy-record fixture incorrectly selected by array index after a save
reordered items; its invalid observation is retained and identified in the raw
report. The confirmation selects the intended record by ID. Opted-out facts no
longer appear in AI search.

Record editors preserve true/false instead of silently enabling access. New
records/imports and AI-saved memories default to false. The local editor exposes
an explicit AI switch and explains that non-private fields/notes/documents may
reach the provider or external client. Credential capture remains opted out;
local secure-input requests retain their separate intentional filling grant.
Migrations preserve explicit false and do not enable the global AI setting.
Previously persisted forced true values cannot be distinguished from intentional
grants; this change cannot reconstruct those historical choices.

Regression tests cover all record kinds, editor round trips, missing flags,
overrides, legacy encrypted migration, restart and search/read/fill refusal.
Real Electron Personal Data UI and local-provider Personal Data workflows pass.
The provider fixture also tries to read/search an opted-out record and verifies
that its synthetic confidential fact never enters provider requests. Explicit
record consent is one prerequisite, not a per-task recipient or downstream
transmission grant. Provider/client and form/navigation disclosure controls remain
unclosed P0 requirements.

## Current quality gates

- `npm test -- --runInBand`: 128 suites / 620 tests passed; native messaging,
  external link and extension-source regressions also passed.
- `npm run lint`: whole-project style and TypeScript passed.
- `npm run build`: production bundles built successfully.
- `npm audit --omit=dev --json`: zero reported production advisories.
- `browser-ui-smoke.cjs --early-tab-close-only`: focused real Electron lifecycle
  check passed. Full `--opener-flow-only` now also passes after the restoration fix.
- `history-shutdown-smoke.cjs`: actual Electron shutdown flush passed; included
  in the desktop test runner.
- `browser-ui-smoke.cjs --history-only`: real worker/UI failure-and-retry check passed.

These results cover the action and record-consent implementation pass. Packaging/signing and
full desktop/platform verification are separate gates.

## Remaining evidence

Full packaged runtime, production CSP, AI consent/data release, broader IPC,
tab lifecycle, actual application latency, signing/update/recovery and target
platform verification remain open in the implementation specification. A zero
production advisory audit does not prove application logic or Chromium security.

## Saved-data provider/client disclosure and conversation reuse

`ai-data-disclosure.json` preserves original observations and subsequent
confirmations, with actual Electron 45, encrypted synthetic vault, official MCP
client and deterministic HTTP model servers on macOS arm64. The latest baseline
and confirmation include a different provider receiving prior assistant context.

| Synthetic scenario | Before | After |
| --- | --- | --- |
| Denied Standard/Full saved-data reads | No review; fact/account disclosed | One review; no saved fact/account disclosed |
| Denied built-in provider read | Two requests; fact disclosed | Two requests; fact excluded |
| Approved built-in provider read | No review; fact disclosed | One exact-data review; fact disclosed intentionally |
| Changed provider; prior private context declined | Two requests; old fact disclosed | One context review; zero provider requests |

Read, search, account listings and hook field metadata now require exact-data,
recipient-specific native review independently of Full access. Empty results
bypass review. Protected fields remain excluded. Changes to vault contents,
consent, authentication, profile, host/target document or Stop invalidate pending
release. The access-change test demonstrates refusal to change permissions while
an action is pending; it does not demonstrate toggling and restoring permissions.
The inaccurate first observation is retained with a validation note.

Approved built-in disclosures mark the encrypted conversation and checkpoint as
potentially private. Fresh runs and resumed contexts review non-system messages
before inference, including transformed assistant text, rather than relying on
exact sentinel matching. Unknown nonempty legacy conversations and checkpoints
receive conservative treatment. Persistence tests cover true/false markers,
legacy history and invalid checkpoint markers. The changed-provider scenario verifies chat reuse. Actual checkpoint restoration
and refusal/retry semantics are measured separately below.

Reviews reject snapshots above 20,000 bytes before releasing data. Large private
chat/checkpoint recovery needs a usable bounded review flow. External-client
context cannot be recalled after approval; its downstream provider is unknown.
Website form/navigation/upload/hook containment, attachments and wider injection
scenarios remain separate open requirements. These results do not imply that
already disclosed data can be revoked.

After these changes: 129 suites / 638 tests passed; whole-project lint and
TypeScript passed. Personal Data AI and hook AI runtime checks passed with
explicit disclosure review. The hook fixture approves only synthetic metadata;
its five separate script-consent and revocation checks remain intact. No external
notifications are sent. Production dependency audit reports zero advisories.

## Private checkpoint restoration and refused-review recovery

`ai-private-recovery.json` records separate real Electron processes with encrypted
checkpoints loaded from disk before `registerAI`. The original pre-disclosure
source sends private, legacy and oversized synthetic context in one provider
request without review. Final source sends zero provider requests for declined
private/legacy review, oversized context, and Stop during review. Approved private
recovery sends one request following one review; an explicitly nonprivate
checkpoint sends one request without review.

The first guarded run exposed a recovery regression: declined and oversized
review consumed the checkpoint, although no network request occurred. The final
change preserves the paused checkpoint and its original expiration until an
explicit retry, success, Stop or expiration. The confirmation reads the encrypted
file back, verifies retained content/expiry, then explicitly retries a denied
private task with acceptance and verifies one request and consumed checkpoint.
Stop during review still leaves no resumable checkpoint. No automatic retry or
renewed expiration is granted. The original observations remain in the report.

The initial baseline's review-triggered Stop case had no prompt and therefore
never triggered Stop. It has a validation note and is excluded from later
baseline comparisons; no baseline Stop failure is claimed. The final Stop case
is an actual IPC Stop while the review callback is pending.

These fixtures exercise macOS arm64, synthetic text and a local HTTP provider.
They do not prove packaged cross-platform restoration, downstream disclosure
containment, or a usable review for large private contexts. Oversized contexts
remain retained but cannot resume through the current 20,000-byte review limit.
The new repeatable recovery fixture is included in the desktop test runner.

## Built-in actions preserve external AI pause

`ai-control-isolation.json` compares actual main-process policy before/after in
three disposable Electron processes: resumed checkpoint, new chat, and manually
run saved task. Each starts with an external pause persisted on disk. Before,
all three cleared it; after, all three complete the requested built-in work while
preserving both the pause status and its persisted file. Explicit external Resume
then clears the pause and removes the file in all three cases.

The manual-task case also creates an already-due one-time task. While paused it
initially executes zero scheduled runs. Before, running the manual task clears
the pause and the scheduler executes that pending task at its next tick. After,
the pending task still has zero runs after another tick. The manager now passes
whether a run is scheduled to both availability checks and the runner, allowing
explicit built-in work without changing external-control authorization. Unit
coverage verifies manual/scheduled dispatch and retained schedule anchors.

Inference requests and non-tool auxiliary title requests are recorded separately:
the new-chat fixture makes one of each. The first handoff harness incorrectly
assumed every model request contained tools; its title-generation crash was fixed
by handling that separate request. The original handoff assertion also exposed
implicit external unpause; the complete handoff/recreated-window check now passes.

Baseline overrides only the saved main source; the storage/task helpers come from
the current workspace in both runs. Main and relevant supporting module hashes
are recorded in final confirmations. This is control-policy evidence, not a
provider-latency or whole-application performance benchmark.

After the recovery/control follow-up, all 129 suites / 639 tests pass and the
production build passes. Actual provider-recovery, handoff/window recreation and
full MCP smoke pass. The three control-policy cases and six private recovery
cases pass in final source-hashed confirmations. These checks extend the evidence;
they do not close the remaining production requirements above.
Whole-project lint and TypeScript also pass for the final recovery/control source.

## Production renderer Content Security Policy

`renderer-csp.json` records the actual emitted production HTML/script loaded from
file in Electron 45 on macOS arm64 with the actual sandboxed preload and a
synthetic local receiver. Latest baseline and final policy use identical renderer
script bytes; HTML/source hashes are recorded. No real profile or external service
is involved.

| Synthetic probe | Before | After |
| --- | --- | --- |
| Inline script/event handler/arbitrary local script effects | 3 | 0 |
| Injected calls to privileged IPC bridge | 3 | 0 |
| HTTP fetch/beacon/form/object receiver requests | 4 | 0 |
| Document base URL changed | Yes | No |
| Modified local renderer bundle executes, with HTML unchanged | Yes | No |
| Real production Edit group renderer, inputs and styles | Works | Works |

Production HTML authorizes each emitted script with its SHA-256 hash and matching
Subresource Integrity attribute. Script self/inline/eval grants are absent, and
inline event handlers are explicitly denied. The policy defaults to no resources
and explicitly denies connections, frames, objects, workers, base rewrites and
form submission. The minified HTML is inspected at runtime, including its parsed
full policy: the build hook restores quotes when replacing a minifier-unquoted
placeholder. Integrity is computed from the emitted asset after minimization.

Styles retain self/unsafe-inline for React/Radix geometry, CodeMirror and extension
shadow roots. Images retain self/data/blob and the local crx icon scheme; HTTP/HTTPS
remain permitted for legacy/custom icon URLs. Fonts allow self/data. Consequently
this is not a claim that the renderer can make no network requests: image requests
remain allowed. Website WebContentsViews and extension popup documents have their
own policies; this policy belongs to the privileged Kudium Browser UI document.

The integrity probe changes only script bytes while retaining the original HTML.
It does not authenticate a release against an attacker who can replace both HTML
and script; signed packaging, authenticated updates and installed-file protection
remain separate requirements. The probes demonstrate enforcement, not a discovered
exploitable injection in the application. No general latency gain is claimed.

All 129 suites / 639 tests pass and the production build passes. Actual local
extension picker/search/pinning/icons/popup/profile and Developer sidebar/editor
flows pass with production CSP, including narrow and light/dark layouts. The CSP
probe is included in the desktop runner after the production build.
Whole-project lint and TypeScript also pass. The shared development template
compiles to its development policy in an isolated output directory; the standalone
compile reports that HMR is not enabled, so it does not verify a live HMR session.
Installed ASAR and signed-release CSP enforcement remain release gates.

## Favicon streaming, cancellation, concurrency and dimensions

`favicon-resources.json` compares the exact original/current production favicon
callback, extracted with TypeScript AST and with only its existing background
promise tracked. It uses actual Electron Session.fetch, real nativeImage decode,
synthetic HTTP/gzip responses and disposable profiles on Electron 45/macOS arm64.
Source, helper, probe and pinned metadata-parser version are recorded. Current
helpers are available in both runs, but the original callback does not invoke them.

| Fixture | Before | Final after |
| --- | --- | --- |
| Declared oversized body consumed | 8,388,608 bytes | 0 bytes |
| Chunked oversized body consumed | 8,388,608 bytes | 1,114,105 bytes |
| Gzip-expanded oversized body consumed | 8,388,608 bytes | 1,114,112 bytes |
| Full oversized arrayBuffer allocation | 8 MiB per fixture | 0 |
| 20 independent tab favicon peak client fetches | 20 | 4 |
| 20 superseding favicon requests / native decodes | 20 / 20 | 1 / 1 |
| Valid 4096×4096 PNG native decode / publication | 1 / 1 | 0 / 0 |
| Ordinary PNG/JPEG publication | Works | Works |

The helper rejects declared oversize/status errors without accumulating a body,
counts decoded body bytes while streaming, never retains accepted chunks above
1 MiB, and aborts the underlying transport as well as cancelling the reader.
An overflowing Chromium chunk can itself exceed the limit; it is rejected before
copying into retained chunks. HTTP gzip in particular delivered larger chunks in
other confirmations, so this is not an absolute Chromium/RSS bound. A successful
read briefly retains its accepted chunks plus the final concatenated buffer.

At most four fetch/read/decode operations run per browser window. A newer favicon
request cancels the old one, including queued work. Main-document navigation,
empty/invalid favicon lists, tab removal/discard and window disposal cancel pending
work; same-document navigation preserves it. The 10-second timeout includes queue
waiting. Failures retain the previous icon and do not delay document loading.

PNG/JPEG metadata is checked before native decoding with pinned image-size 2.1.0,
a pure JavaScript byte parser with no new native dependency. Unsupported/malformed
formats and dimensions outside 1–2048 in either direction are rejected. PNG content
served under an .ico URL remains supported. Actual PNG/JPEG native decoding works;
the separate macOS format probe found a real ICO container unsupported by
nativeImage.createFromBuffer. Cross-platform format compatibility, decoder CPU and
absolute native allocation limits still need broader evidence.

The four-operation limit trades throughput for lower peak work: all 20 ordinary
icons took 425.22 ms before and 533.21 ms after in the final fixture. The superseding
burst fell from 438.20 to 103.86 ms. These are decorative-icon fixture times, not
tab-switch/startup or user-observed UI latency. No claim that four is the optimal
whole-browser concurrency setting is made; the 1/10/50-tab resource/latency study
remains necessary.

The initial guarded run exposed that reader cancellation alone left Electron's
transport downloading. Its server counters overlapped subsequent fixtures. That
raw observation has a validation note; final confirmations explicitly abort fetch
and require all server responses closed before resetting counters. Server bytes
written include transport buffering and are not exact client-received bytes.

Coverage includes stream limits, misleading compressed length, stream failures,
stalled-reader/timeout cancellation, queue bounds, supersession, cleanup, dimension
metadata and actual browser navigation/removal/window/empty-list lifetime wiring.
The jsdom AbortSignal fixture was updated to provide Electron's throwIfAborted API
with normal writable/configurable semantics; existing cancellation tests remain
intact. All 130 suites / 659 tests, whole-project lint/types and production build
pass. The full actual Electron opener/download workflow passes. Production audit
still reports zero advisories after adding the metadata parser. The favicon
benchmark/regression is included in the desktop runner.

## Main-process preference snapshot (November 7)

`preferences-2026-11-07.md` and its raw/verification JSON record the measured
follow-up to repeated preference I/O. A protected snapshot removes disk reads,
JSON parsing and validation from warm getters. Component read bursts are
97–99.7% shorter; actual production-bundle 10-tab glass/solid runs each reduce
600 preference-file reads to zero across 30 switches. Snapshot publication follows
successful persistence and precedes listeners; mutation and failed-save tests
protect current permission policy. Manual external edits now require restart;
cold copying/freezing adds work. All 132 suites / 671 tests, lint/types, build and
native component/short workspace checks pass. Native input/focus and packaged
security gates remain open; no whole-app speed or memory claim is made.

## Packaged Electron fuses (November 7)

`electron-fuses-2026-11-07.md` records five actual packaging fuse changes and native
default/hardened comparisons. Node script mode, supported Node environment options,
main-process inspection, modified ASAR and unpacked app fallback are restricted.
Packaged Electron already rejected NODE_OPTIONS --require; the report explicitly
avoids presenting that as a new fix. A current local unsigned/ad-hoc arm64 package
passes UI/preload, website isolation, history worker persistence, CSP and cleanup
checks. Full unit suite (132 suites / 671 tests), lint/types and native packaging
pass. Signed cookie migration, Chromium debugging, other platforms and broader
private-data/IPC/release work remain open. No performance gain is claimed.

## Packaged Chromium debugging (November 7 follow-up)

`packaged-debugging-2026-11-07.md` records actual native port/pipe before/after
checks. Baseline endpoints allow a CDP client to change trusted renderer settings;
the release main now strips debugging switches before ready. Random/fixed ports
and pipes are unavailable while the local startup website executes normally.
The packaged runner preserves UI/preload, isolated website, durable history worker,
CSP and cleanup assertions through a test-only ASAR observer with identical
production payload bytes and no release bypass. All 133 suites / 673 tests,
lint/types, build, directory packaging and scoped native checks pass. Signed
distribution, cookies, other platforms and broader security gates remain open.

## Attachment import ownership follow-up (November 7)

AI picker/add imports now bind to the original chat, frame, composer/access
revision and group; stale asynchronous work rejects before storage and rolls back
its created entries. Native before/after tests reproduce eight stale cases:
all accepted before, all rejected after with zero retained attachments. Normal
two-file imports succeed; selected-file synchronous reads/stats fall from 2/2
to 0/0 through bounded asynchronous descriptor reads. The existing native AI
smoke also preserves Preferences access after browser closure. See
`ai-import-boundary-2026-11-07.md` and its verification JSON.
This closes the measured import ownership race; downstream provider/upload bytes,
full IPC/decoder containment, native focus/input and signed/cross-platform release
gates remain open. Current unsigned/ad-hoc arm64 package passes the scoped
fuse/debugging/observer security runner; observer limits still apply.

## Saved-data fill/upload approval follow-up (November 7)

`ai-private-fill-2026-11-07.md` records actual Electron/MCP
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

## Temporary secure-input lifetime (November 7)

See `ai-private-input-2026-11-07.md`: eight actual native stale
collection/reuse cases now block with zero private website Request bodies. Same-URL
reloads close pending secure forms and revoke stored references; changed/restored
permissions and OS lock revoke temporary values. Normal temporary fill and explicit
scoped saving remain usable. This supersedes the earlier open temporary-input
lifetime item for the tested cases, without closing arbitrary downstream website
traffic, provider injection, IPC or signed/cross-platform security scope.

## IPC inventory and lifetime follow-up (November 7)

`../security/ipc-inventory-review-2026-11-07.md` and its AST JSON enumerate 47
fixed app-owned channels, one dynamic secure-input channel, three generic preload
methods and two generated scripts. Source entry-gate review is documented; all
subactions/dependency channels are not yet audited. Native before/after evidence
in `ipc-boundaries-2026-11-07.md` demonstrates seven stale group/
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

See `page-capture-2026-11-07.md`: nine tested stale/canceled capture
operations now reject, six existing export destinations remain intact, malformed
crop rejects, and registration replacement works. Document/source ownership spans
async capture and save selection; private temporary export checks precede rename
dispatch. Focused tests (2 suites /15 tests), lint/types, build and separate native
renderer/main capture UI pass. This supersedes the tested capture-lifetime item;
decoder/native resource containment, path races, crash durability, downstream
private-data containment and signed/cross-platform release gates remain open.

## Image preflight follow-up (November 7)

`image-preflight-2026-11-07.md` documents image dimension checks
before native decoding in AI attachments and page captures, plus the capture
base64 allocation bound. Four actual attachment decoder dispatches become zero
with controlled hostile-header fixtures; normal native PNG still works. Header
limits do not sandbox decoders or bound original Chromium capture allocation.
Space-icon file reads, download thumbnails, animation/container/native-resource
limits and signed/cross-platform gates remain open.

## Local images follow-up (November 7)

See `local-images-2026-11-07.md`: icon/thumbnail sources now use
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

See `private-outbound-2026-11-07.md`. Full access no longer bypasses
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

See `private-navigation-2026-11-07.md`. Native main-frame redirects
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

See `private-navigation-dispatch-2026-11-07.md`. Retain consent,
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

See `enter-key-2026-11-07.md`. Enter now carries carriage-return
text, and keyboard input revalidates its observed target after focus. The native
MCP fixture changes from 0/14 to 14/14 successful submissions/POSTs, restores a
textarea newline, honors canceled/default-prevented actions and blocks a field
changed during focus before any key command. Modifier/text tests, all 142 suites
/727 tests, lint/types and production build pass. This closes the listed native
Enter cases; original pointer UnknownVizError, broader sidebar focus, interruption/
frame/physical-input coverage, data containment and signed/platform gates remain
open. One renderer evaluation is added; no whole-app speedup is claimed.

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

See `extension-install-owned-2026-11-07.md`: selected native loads change from
store → A to A alone; six stale/mutation cases each change from two loads to
zero. Actual package permissions and immutable staging are enforced. All 143
suites/735 tests, lint/types and build pass; 24 native cases verify local cached
packages on macOS. All three platforms are required; remote store/package
authenticity, native-ack/recovery and broader release gates remain open.
