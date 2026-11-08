# Action review after saved-data disclosure — November 7, 2026

Evidence: `private-outbound.json` and `private-outbound-verification.json`.
Electron 45, macOS arm64, synthetic facts only.

Previously, recipient-specific disclosure review approved saved facts reaching an
AI provider/client, but Full access then skipped ordinary action review. Those
facts could be copied or transformed into website URLs, fields or actions without
another local decision. Public Full-access behavior remains automatic. Once the
current AI context contains saved data, actions using the shared approval boundary
require native review even in Full access. Navigation/new tabs and scroll receive
the same floor; scroll reviews once. Read-only observations remain automatic in
Standard/Full and execute in the existing isolated page world.

Reviews retain native host/source documents, ownership/profile/scope/access mode,
controller lifetime and private-data revocation across the dialog. A consent
change followed by restoration still rejects. The existing action-specific detail
shows the target and values, with password values redacted. The review explains
that website scripts can contact other destinations; accepting the action is not
an exact network-destination guarantee.

External-client disclosure is recorded before releasing saved data. The marker
survives controller recreation, configuration updates and token rotation; legacy
unmarked connections are treated as potentially private. Failed persistence
refuses the disclosure and retries on the next attempt. It stores a boolean in
existing owner-only MCP settings, not saved facts. Atomic file/fsync persistence
is not a verified power-loss/directory durability guarantee.

Tasks created from private AI context retain a private marker in encrypted task
storage. Legacy tasks are treated conservatively. Toggling a task retains that
marker; later runs require provider-context review and website action review.
Unit tests cover creation/toggling and storage reload/migration; a full native
scheduled-private-task/provider integration remains open.

| Actual observation | Before | After |
| --- | --- | --- |
| Denied navigation URL, typing, click and select private requests | 1 each | 0 each |
| Private URL request after MCP controller recreation | 1 | 0 |
| Provider encodes an approved fact into a denied URL | 1 | 0 |
| Explicitly approved private form request | 1 | 1 |
| Public Full-access navigation reviews | 0 | 0 |
| Enter action accepted without private review | Yes | No |

Six unsafe socket transmissions become zero in this fixture. Native callbacks
are controlled; Chromium requests and loopback request bodies are real. The fake
provider must actually receive the approved fact before emitting its encoded-URL
tool call. Consent-change-and-restoration and Stop reject before any private
request. The Enter action is refused after review denial, but its baseline key
handler did not reliably receive the dispatched key; no before/after Enter
transmission improvement is claimed. That native input regression remains open.

Both phases use the same probe hash and retained source/bundle identities.
Normal public navigation and intentionally approved private typing succeed.
The packet fixture covers navigation/input/select/click paths and MCP/provider
contexts; native new-tab, scroll, hook and file subaction coverage remains part of
the broader audit. Existing local fill/upload/hook consent boundaries continue to
apply. This is a review floor, not complete private-data flow containment.

141 suites / 713 tests, lint/types and production build pass. Dedicated marker
persistence/failure and task privacy tests are included. Production composer
integration is recorded separately in the verification manifest. No physical OS
authentication, signed distribution, full desktop suite, cross-platform validation
or general performance improvement is claimed.

Remaining P0: enforce actual network destinations for accepted actions and
persistent hooks; include redirects, iframe/service-worker requests, existing
WebSocket/WebRTC channels, queued transmissions after Stop/restart and shared
profiles. A webRequest listener alone cannot prove containment of already-open
channels. Private attachments/user input and arbitrary website-derived facts need
an explicit data-flow policy beyond the saved-fact markers tested here. Approved
providers/website recipients can retain or forward data after disclosure.
