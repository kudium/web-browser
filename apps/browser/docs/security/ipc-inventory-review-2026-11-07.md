# App-owned IPC inventory and boundary review

Date: November 7, 2026. Status: inventory delivered; full security audit remains in progress.

`ipc-inventory-2026-11-07.json` is generated from the current source AST by `.erb/scripts/ipc-inventory.cjs`. It identifies 48 main registrations: 47 fixed channels and one dynamically named secure-input channel. There are 69 renderer calls/listeners and three dynamic channel methods. Two generated preload scripts are separately flagged. Counts are not proof of authorization or branch-level validation.

## Scope and entry-gate review

| Surface | Entry authority and validation observed | Remaining validation/evidence |
| --- | --- | --- |
| AI settings/models/tasks/conversations/composer/controller/MCP/personal-agent channels (21) | `trusted` requires a live trusted browser main frame, or an approved settings main frame for configuration. Domain-specific parsers validate endpoints, access/scope, conversations, tasks, tool arguments and attachment bounds. Picker/add ownership and secure input/private-data approvals have separate native before/after reports. | Complete every async branch and subaction inventory. Composer Save, personal-agent setup and MCP update lifecycle remain priority reviews. Read-only post-await responses do not establish continued mutation authority. |
| `browser-group-lock` | Trusted main frame, action whitelist and bounded service group IDs. New document binding spans capability/auth awaits; service checks live callers before immediate mutations. | Native synthetic authentication/reload evidence in `../benchmarks/ipc-boundaries-2026-11-07.md`; physical OS authentication and locked-session behavior remain separate gates. |
| `browser-preferences`, `browser-preference-action`, `ai-open-preferences` | Trusted main frame plus BrowserWindow ownership. Preference updates use validators and main-owned snapshot. New lifetime binding protects directory selection, reset, clear-data/cache after native dialogs; profile identity is rechecked. | Diagnostics, permission transitions, settings-window navigation and all profile subactions need full branch review. Four stale mutations are natively verified; no blanket post-await claim. |
| `password-manager` | Trusted main frame, request/scope checks, per-window revision/frame and auth epoch, local grant checks and synchronous vault operations. Secret reads/fills have independent policy and consent paths. | Full operation/schema review, OS authentication/Keychain, concurrent scope changes and migration remain open. Dedicated AI data-release reports do not close all Personal Data UI operations. |
| `browser-sync`, `browser-command` | Exact owning main frame; `isBrowserLayout`/`isBrowserCommand` validate bounded layouts and command shapes. Main owns views, session/profile mapping and group-lock dispatch. | Every command's asynchronous dialog/native/menu callback and document/profile lifetime needs review. Existing native input/focus regressions remain open. |
| `browser-remove-group` | Registered owning window/main frame; source group, unloaded/locked checks, local-storage schema, reviewed count/sharing and follow-up checks. | Same-document identity and changed-owner review need strengthening. Partial multi-store deletion/failure and durable layout coordination remain open; generic frame equality alone is insufficient. |
| `browser-history` | Trusted main frame; bounded records, validated actions; destructive changes await worker durability. | Complete malformed action/id and permission-transition coverage; existing history durability/recovery reports cover their stated scope. |
| `browser-downloads`, `browser-download-recovery`, `browser-download-thumbnail` | Trusted main frame; action validation and live download/file identities. Thumbnail IDs are bounded. | Thumbnail/native decoder bounds and post-await identity, recovery/concurrent changes and all action schemas need full review. |
| `browser-native-menu`, `browser-native-confirm`, `browser-emoji-picker`, `browser-space-icon` | Trusted owning main frame. Menus/prompts are bounded; menus and confirmations watch navigation/destruction and dispose listeners. Icon selection checks file type/size and request activity. | Icon descriptor/decoder containment and concurrent native requests remain open. A 5 MB stat check before path-based decoding is not a complete resource/race bound. |
| `browser-capture` | Registered host ID/main frame; validated capture request, owning tab and bounded capture deadline; target navigation/crash aborts capture. | Requester document lifetime and every crop/export/native-save branch need review; native resource/input coverage remains open. |
| `site-developer-pages`, `site-developer-command` | Registered library host/editor main frame; bounded IDs, current main-owned tab/group/origin binding and command whitelist. | Editor focus/get branches, group changes and async command dispatch require complete validation. |
| `site-developer-config`, `site-developer-event`, `site-developer-notify` | Website preload main frame is registered with exact origin/profile/group and document token. Notification key/text bounds, local notification grants and navigation cancellation are enforced. | Generated preload, all control/log branches and arbitrary user hook/data-destination behavior require continued audit; dependency/runtime confinement is not proven by a token check alone. |
| `browser-tab-requests-ready` | Current main BrowserWindow and exact main frame; only releases queued main-owned external URLs. | Existing cold/running/external-scheme regression evidence; full app startup/ownership coverage remains separate. |
| `ipc-create-window`, `ipc-close-window` | Registered live app main frames; create accepts a fixed preset and ignores caller-supplied Electron security options; close affects source window only. | Existing source regressions cover foreign frames and security-option injection; no full-window lifecycle claim. |
| `ipc-event-bus` | Registered main frame; one known event, bounded serialized payload, broadcast only to live app windows. | Validate every renderer consumer's payload expectations; event allowlisting alone does not validate business semantics. |
| Dynamic `ai-private-input-<uuid>` | Actual private input window and exact main frame; allowed fields only, string/size bounds; no general app preload. Request/document/auth lifetime, temporary consumption and cleanup have native/unit evidence. | Physical session lock, DOM mutation/scheduling and memory zeroization remain outside the tested guarantee. |

The AST JSON supplies every fixed channel name, its source location and each renderer capability path. Grouped rows above preserve the actual individual registrations in that machine-readable artifact.

## Generated and dependency surfaces

`aiUserInput.ts` generates a restricted sandboxed form preload exposing only the one temporary response channel. `siteDeveloper.ts` generates a sandboxed website hook preload with synchronous config and token-bound event/notification calls. Their scripts are flagged independently of the ordinary preload AST. The inventory does not expand generated strings into a fictitious static channel graph.

`electron-chrome-extensions`, Chrome Web Store/native messaging, the packaged MCP bridge and external/native resources are outside this app-source registration count. Their actual registered runtime channels, extension host authorization, session origins, resource integrity and native message bounds remain part of the production audit. Existing native-messaging regressions do not prove every dependency capability safe.

## Confirmed fixes and next work

The generic `electron.ipcRenderer.sendMessage/on/once` previously accepted any string at runtime despite the three-value TypeScript `Channels` type. They now allow only ipc-create-window, ipc-close-window and ipc-event-bus. Native bridge tests demonstrate blocked arbitrary sends/subscriptions; this is capability narrowing, not proof of an exploitable renderer injection.

New request binding rejects same-URL replacement across group capability/authentication and directory/reset/session-clear dialogs. Seven actual stale effects are blocked; normal selected operations remain usable. Full suite/native verification is recorded in the corresponding benchmark manifest.

Prioritize group-removal lifetime/partial deletion, AI composer Save and personal-agent/MCP async mutations, capture requester lifetime, decoder/file-path resource bounds, and dependency IPC enumeration. Every source-reviewed row above remains limited to its observed entry checks; the full IPC release gate is not marked complete.

The inventory was refreshed after the MCP/agent ownership follow-up; channel
counts are unchanged and source locations/hashes reflect that batch. Native
configuration-lifetime, restart client isolation and competing rotation evidence
is in `../benchmarks/mcp-ownership-2026-11-07.md`. This closes those tested cases,
without completing the broader branch/schema/dependency audit.

The inventory was refreshed after group deletion coordination. Channel counts
remain unchanged; `../benchmarks/group-removal-2026-11-07.md` records tested
document/target binding, profile selection, durable progress and restart retry.
Effect/checkpoint crash windows, disk failures, extension/session writers and
recovery/cross-platform behavior remain branch-level release work.

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
