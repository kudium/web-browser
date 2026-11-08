# TouchBox browser and AI security review

Reviewed November 6, 2026. Scope: current working tree, including uncommitted changes. Source review, isolated DOM/policy probes, eight targeted unit suites and production npm dependency audit. No live account attacks, packaged binary inspection, network penetration test, or Chromium exploit assessment. Original findings describe the reviewed baseline; dated follow-ups and corrections below describe subsequent work; exploit chains requiring prompt injection were not demonstrated end to end.

## Assessment

Website isolation has a reasonable foundation, but AI authority is not yet strong enough to claim protection against session misuse by hostile pages. The assistant deliberately operates authenticated tabs and can therefore use the user's session without stealing cookies. If a model follows injected page instructions, some supported actions can execute without an independent authorization check. Full access expands this risk by design. No direct arbitrary model JavaScript tool, website-to-Node bridge, or unauthenticated remote MCP access was found in the reviewed paths. This is not proof those vulnerabilities are absent everywhere.

## Findings and priorities

### 1. High: Standard sensitivity decisions rely on attacker-controlled page semantics

Sources: src/main/ai.ts:594–634, 2724–2747; src/browser/aiPermissions.ts:73 onward.

Buttons and input controls are marked safe when an English keyword regex does not identify a sensitive action. A generic Continue button outside a form is safe even if its event handler performs an authenticated deletion or purchase. Other languages, canvas interactions and application-specific semantics further limit inference. select_options is automatically allowed regardless of sensitivity; change handlers can send data or perform destructive actions immediately.

Reproduced using the actual readAIPage/actAIPage functions in JSDOM: a visible Continue button returned sensitiveAction:false and safeInteraction:true. requiresAIApproval('standard','click',true) returned false; requiresAIApproval('standard','select_options',false) also returned false for a page containing an Erase account option. These probes demonstrate classification/approval gaps, not an end-to-end account deletion.

Improve: treat semantic classification as advisory. Bind approval to a concrete task, destination origin and action, and conservatively review ambiguous state-changing controls. Include select changes and keyboard shortcuts in sensitive-action handling. Keep a locally enforced review floor for payments, credential release, destructive operations and external communication. Test generic labels, non-English text, change handlers and DOM mutation during approval.

### 2. High, conditional: destination and private-data release authority

Correction after complete control-flow review: the original claim that Ask first
skipped ordinary navigate/back/forward/reload approval was incorrect. Both the
baseline Git revision and the reviewed working tree had an earlier shared Ask
first gate. The unload helper alone did not describe the full action path.

AI URLs accept arbitrary HTTP/HTTPS hosts. An assistant that reads available page
or Personal Data information can put it in a destination query string and
navigate there. Standard previously permitted new origins automatically. This
chain depends on model behavior and accessible data; it does not give a website
direct access to the vault. Same-origin transmission and Full access remain
important limits even after new-origin reviews.

Implementation follow-up: Standard now reviews new-origin navigation and all
stateful page controls independently of page-supplied semantic hints. Navigation
review and unload warning share one prompt. Navigation and generic DOM approvals
bind to the original host/target document, owner/profile, group, access revision
and cancellation signal until dispatch, including pending native dialog leases.
See `../benchmarks/ai-action-policy.json` and `ai-action-runtime.json` for the
specific verified cases. This does not close the private-data release finding.

Remaining work: enforce explicit record consent and recipient-specific private
information release for provider/external-client observations and downstream
navigation, forms, upload and tools. A URL denylist cannot reliably distinguish
encoded private data. Fake-provider injection and disclosure tests remain required.

### 3. High, conditional: broad Personal Data access increases prompt-injection impact

Implementation follow-up: saving/editing/migrating now preserves explicit record
consent. Missing consent, new records/imports and new memories default to off;
the local editor provides a disclosure explanation and opt-in switch. The global
legacy AI flag is preserved. `../benchmarks/vault-consent.json` includes exact
before/after encrypted-store checks (corrected confirmation: nine unwanted grants
to zero), and local-provider tests exclude opted-out facts. Historical forced true
flags cannot be distinguished from intentional grants. The per-task recipient and
downstream release issues below remain open; the original forced-consent text
describes baseline behavior.

Sources: src/main/passwordManager/vault.ts:229–240, 368, 544–600; src/main/ai.ts:1552–1563, 3113, 3152–3168; src/main/passwordManager/index.ts:166.

Saving records forces allowAI:true, and migration changes previous records to AI-allowed. AI search/read tools return eligible non-secret fields, notes and document passages without a per-read approval. Origin-bound records are restricted to the current site's origin, but records without an origin can be available to any tab in their applicable scope. An authenticated Preferences grant calls retainUntilLock(), so the basic five-minute vault timeout does not apply to that grant.

When a provider is used, tool observations become provider input; local encryption does not prevent this intentional transmission. Passwords and protected fields are filtered by safeRecord, but ordinary notes/documents can still be highly confidential. The model's instruction to ignore injected page/document instructions helps but is not an enforced data-release boundary.

Improve: explicit record-level AI consent preserved across saves/migrations, task-specific document selection, separate permission for provider transmission, and an enforced release policy for private information. Reassess idle locking and lock on OS session lock/sleep. Clearly describe provider data handling. Test records without origins and revoked consent. Severity depends on which data is unlocked, the chosen scope and whether injection succeeds.

### 4. Medium: provider endpoints allow plaintext HTTP

Implementation follow-up: dedicated HTTPS/loopback validation and redirect
rejection are now implemented for settings load/save, inference and model
discovery. See `../benchmarks/production-improvements-2026-11-06.md` and raw
`../benchmarks/provider-transport.json` for actual before/after evidence. The
original observation below describes the reviewed baseline. Other findings in
this review remain independently open.

Sources: src/browser/ai.ts:78–91; src/main/aiTransport.ts:5–20; src/main/aiProviderRequest.ts:50–55; src/main/ai.ts:3569.

The shared URL validator permits HTTP for AI provider settings as well as navigation. Provider requests include credentials and conversation content. A user-configured remote HTTP endpoint exposes these to network interception. The default OpenAI endpoint is HTTPS; configuring another endpoint is a prerequisite.

Improve: use a distinct provider validator requiring HTTPS, with an explicit narrowly scoped loopback exception for local models. Apply it to model discovery and inference; define a redirect policy that prevents downgrade and unintended credential forwarding.

### 5. Medium hardening gap: privileged UI CSP permits inline scripts

Source: src/renderer/index.ejs:5–8; src/main/preload.ts.

The app document uses script-src 'self' 'unsafe-inline' and has no default-src, object-src, base-uri or frame restrictions. If an injection reaches this trusted renderer, the CSP permits inline JavaScript, and the exposed bridge grants substantial browser/settings capabilities. Sender checks do not distinguish legitimate UI code from injected code in the same main frame. No exploitable UI injection was found; AI Markdown is sanitized and remote image references are converted to links.

Improve: remove unsafe-inline in production, use hashes/nonces where needed, add default-src 'none', object-src 'none', base-uri 'none', and explicit directives for required assets/network access. Review icon, favicon and document rendering inputs. Test packaged CSP and malicious Markdown/metadata.

Implemented follow-up: production HTML now uses emitted-script SHA-256 hashes
and matching integrity attributes, with default-src none and explicit resource
directives. Inline/event/local-script injection, bridge calls, base rewrites and
HTTP fetch/beacon/form/object probes are blocked in actual emitted-file runtime.
A modified script with unchanged HTML is rejected. See
`../benchmarks/renderer-csp.json` and the production improvement report. Dynamic
styles and legacy/custom image URLs retain explicit allowances. Installed ASAR,
signing and broader input/IPC audits remain open; source/HTML replacement together
is outside the scope of an integrity attribute.

## Existing strengths

- Website WebContentsView creation explicitly enables sandbox, contextIsolation and webSecurity, and disables nodeIntegration.
- The privileged UI preload is assigned to app windows; protectWindowNavigation restricts app navigation and redirects and denies new windows. Privileged IPC paths checked in this review require trusted contents and the main frame.
- AI page programs run in an isolated world; tool output supplies arguments to fixed programs rather than arbitrary model-generated JavaScript. Snapshot receipts and target checks reduce stale-target and geometry attacks.
- Website permission decisions are origin-based and outstanding requests cancel on document navigation.
- Password storage uses scrypt and AES-256-GCM with random salt/IV and restrictive file permissions; protected values are filtered from safe observations. AI keys use secure OS storage when remembered.
- MCP binds to 127.0.0.1, checks exact Host, rejects Origin, requires a timing-safe bearer-token comparison, limits body size and has request timeouts. The token remains a bearer capability for local software that obtains it.
- Signed/notarized macOS packaging is configured and an automatic update path exists; release signing and installed update behavior were not verified.

## Validation

32 tests passed across windowNavigation, windowCommands, websitePermissions, aiPermissions, aiSnapshot, aiMessage, aiProviderRequest and passwordVault. Existing tests do not cover all findings above. npm audit --omit=dev returned zero known production advisories; this does not assess application logic, development dependencies, installed Electron binary vulnerabilities or Chromium patch freshness.

## Recommended order

1. Verify Standard action review and document/owner-bound approvals; Ask first already had navigation gating.
2. Add task-bound origin/data-release controls and explicit Personal Data consent.
3. Require secure provider transport and tighten production UI CSP.
4. Add adversarial integration tests using a fake provider and synthetic authenticated site: injected instructions, misleading controls, immediate select submissions, private-data navigation, credential autofill, scope changes, Stop, and approval-time mutations.
5. Before release, inspect Electron fuses (RunAsNode, NODE_OPTIONS, debugging, ASAR integrity), signed binaries, update authenticity and Chromium patch cadence; assess phishing/download protection, extensions, permissions, session storage and OS locking across platforms.

Until the first two items are addressed, use Ask first with narrow scope for AI browsing on untrusted sites, keep confidential Personal Data unavailable to the task, and reserve Full access for tightly controlled workflows. Ordinary manual browsing and AI-driven browsing should be evaluated separately.

## November 7 packaged runtime follow-up

Five packaging fuse settings now disable Node mode, Node environment options and
the main inspector, require ASAR and enable embedded ASAR integrity validation.
Native reconstructed default/hardened fixtures demonstrate marker code rejection
for Node mode, modified ASAR and unpacked fallback, plus inspector refusal.
Packaged Electron already rejected NODE_OPTIONS --require before this change;
that is not a newly fixed code-injection vulnerability. A supported header-size
override is now ignored. Actual current unsigned/ad-hoc macOS arm64 UI/preload,
website isolation, history-worker persistence, inline CSP and tab cleanup pass.
See `../benchmarks/electron-fuses-2026-11-07.md` for exact scope. Signed cookie
migration, Chromium debugging switches, file-protocol privileges, external/native
resources, other platforms and trusted release signing/update checks remain open.

Subsequent November 7 follow-up: packaged initialization now removes Chromium
remote-debugging port/pipe and access-configuration switches. Actual package
before/after tests verify baseline endpoints and privileged renderer preference
writes, then endpoint refusal with normal local page execution. The replacement
test-only ASAR observer retains production-payload UI/history/CSP coverage without
a production exception. See `../benchmarks/packaged-debugging-2026-11-07.md`;
the tested macOS arm64 Chromium CLI entry points are closed. The remaining
cross-platform, file-protocol, private-data/IPC and signed release scope is open.

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

## Temporary secure-input lifetime (November 7)

See `../benchmarks/ai-private-input-2026-11-07.md`: eight actual native stale
collection/reuse cases now block with zero private website Request bodies. Same-URL
reloads close pending secure forms and revoke stored references; changed/restored
permissions and OS lock revoke temporary values. Normal temporary fill and explicit
scoped saving remain usable. This supersedes the earlier open temporary-input
lifetime item for the tested cases, without closing arbitrary downstream website
traffic, provider injection, IPC or signed/cross-platform security scope.

## IPC inventory and lifetime follow-up (November 7)

`ipc-inventory-review-2026-11-07.md` and its AST JSON enumerate 47
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
