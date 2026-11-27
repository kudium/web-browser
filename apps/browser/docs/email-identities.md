# Email identities

The Email sidebar page gives the AI an address it can use to sign up on
websites and finish verification end to end, without putting a Kudium domain
in the loop. Two kinds of provider cooperate:

- An **alias provider** creates a forwarding address per website. SimpleLogin
  is the first implementation; its free plan allows 10 aliases.
- A **mailbox provider** reads the inbox those aliases forward to. Google and
  Microsoft sign in through the browser (OAuth with PKCE and a loopback
  redirect, then token authentication over IMAP). Everything else uses generic
  IMAP with an app password, with presets for iCloud, Fastmail, Zoho Mail and Proton Mail
  Bridge.

Both are optional and independent. Without an alias provider the AI can still
wait for mail sent to the user's own address; without a mailbox the AI can
still create aliases and can read verification messages through a configured
browser inbox.

## Page layout and multiple accounts

Email dialogs use `PanelDialogContent` and `PanelDialogHeader`, inheriting the
shared macOS glass material and its reduced-transparency fallback. Add mailbox
uses the existing segmented control for Browser tab / Connected inbox, with the
shared GroupPicker next to the email service. Method switches retain form drafts
and pause detection in the hidden browser form. Custom provider servers live in
an optional disclosure that performs no reads or saves when opened.

The page has two tabs:

- **Aliases** shows each connected provider account as a collapsible section.
  Its aliases are grouped by actual forwarding destination inside that section. The Add action connects another provider
  account. Each provider group has a New alias action that opens a dialog bound
  to that account, with its known forwarding destinations. The dialog displays
  the account without an account-switching picker. Manual creation asks for an
  optional alias name for organization, not a website. The provider generates the
  address, which can be used anywhere. Names are stored in the provider note and
  shown beside aliases; AI-created aliases can still carry a website label. SimpleLogin destinations
  come from its returned alias mailbox metadata; an unknown destination is shown
  as Provider default rather than inferred from the account email. An explicit
  forwarding choice is applied through the provider API and verified.
  Provider account headers use the same compact disclosure as mailboxes, with
  an alias count, New alias, Refresh and Remove actions. Refresh targets only
  that provider account, without changing which group is expanded. The owner email appears once in the header;
  forwarding destinations appear inside and may differ from the owner email.
  Opening an account collapses the previous one; long alias lists scroll inside
  the section. Collapse and expansion use retained local state
  and do not fetch or change any aliases. Alias and verification-code copy buttons
  show a checkmark and Copied for two seconds after clipboard success, or Copy
  failed on rejection; pending work and timers are invalidated on removal.
- **Mailboxes** lists all inboxes. Add mailbox offers a signed-in browser tab or
  a connected inbox. Connected inboxes display recent mail in the page; selecting
  a different account retains the others. Browser inboxes show the chosen email,
  provider and tab group, with Open, Edit and Remove actions.
  Each mailbox is a compact disclosure section. Expanding one collapses the
  previous section; connected messages appear directly below their account header.
  Long message lists scroll inside that section. Opened message details are retained
  when a mailbox is collapsed or another account is opened. Only the expanded
  connected inbox refreshes automatically; collapsing it stops its page timer.
  Each connected mailbox header has its own Refresh action, targeting that account
  without expanding it. The page toolbar has no inbox refresh action.

Users can connect multiple instances of the same provider, with up to 20 alias
provider accounts and 20 connected mailboxes. Existing single-account encrypted
settings migrate to account lists on the next save, retaining credentials and
aliases. Alias and message IDs are qualified by account, so matching remote IDs
cannot mix data or route mutations to the wrong provider. Removing a provider
connection does not delete its remote aliases; deleting an individual alias does.

A browser inbox saves its provider, address and HTTPS inbox URL on the tab group's
workspace tabs through AppManager. The shared group picker is in the Add/Edit
mailbox dialog. Selecting a group and service checks existing, accessible mail
tabs for account labels and offers the detected address for confirmation. Multiple
accounts require an explicit choice; a missing or unsupported account label falls
back to manual entry, with Check again after signing in. Detection does not open
tabs, fetch mail, access cookies or tokens, or save a mapping automatically.
It scans only provider account controls (8 ms scan budget, at most 64 controls),
probes at most six tabs concurrently with a 600 ms wait deadline, and rejects
results after navigation, profile changes, removal or access revocation. The
detected account's inbox URL is retained, including Gmail's account route.
A group can have multiple browser inbox mappings. Gmail, Outlook,
iCloud Mail, Fastmail, Zoho Mail, Proton Mail and custom HTTPS webmail are supported. Open
reuses a matching mail tab in that group's login profile or opens a normal group
tab using the shared navigation path. Sign in there as usual. Browser inbox mail
is read in that tab; the sidebar's message list comes from connected mailboxes.

`get_email_context` in the `email` AI family returns browser associations and mail
tab IDs within the current scope, plus connected mailbox IDs and alias provider
account IDs with forwarding destinations. The AI uses ordinary browser tools to
verify the chosen browser account is signed in. Saving an address does not verify
authentication, transfer cookies, or grant access to another group. Locked and
inaccessible groups remain protected. Multiple connected accounts require an
explicit account choice; wait_for_email can also route an explicit recipient to
one matching inbox. It never silently picks an arbitrary account.

## Where things live

| Concern | File |
| --- | --- |
| Provider catalog, field schemas, request contract, parsing helpers | `src/browser/email.ts` |
| Provider client interfaces and registry | `src/main/emailProviders.ts` |
| SimpleLogin client | `src/main/emailSimpleLogin.ts` |
| IMAP client with pooled connections, token auth and MIME parsing | `src/main/emailImap.ts` |
| Browser sign-in (PKCE loopback flow, token refresh, client config) | `src/main/emailOAuth.ts` |
| Service, encrypted storage, IPC handler | `src/main/email.ts` |
| Sidebar page and provider dialog | `src/components/UI/EmailPage.tsx`, `EmailAddDialog.tsx`, `EmailProviderForm.tsx` |
| Signed-in account detection with bounded isolated probes | `src/main/emailBrowserDetection.ts` |
| Browser inbox settings, group associations and AI context | `src/components/UI/EmailBrowserInboxForm.tsx`, `src/browser/emailGroups.ts` |
| AI tools | `get_email_context`, `create_email_alias`, `list_email_aliases`, `wait_for_email` in the `email` family |

## Adding a provider

1. Add a descriptor to `EMAIL_PROVIDERS` in `src/browser/email.ts`. Fields
   marked `secret` are never returned to the renderer or the AI. Presets fill
   non-secret fields from a picker.
2. Implement `AliasProviderClient` or `MailboxProviderClient` from
   `src/main/emailProviders.ts` and register it in the matching map. Clients
   are stateless and receive the stored values on each call.
3. Add a unit test next to `emailSimpleLogin.test.ts` that mocks the network.

The dialog, storage, IPC, AI tools and MCP exposure need no changes.

## Zoho Mail

Zoho Mail uses the shared IMAP client and encrypted account storage. Its preset
prefills `imap.zoho.com:993` with TLS, but keeps the server editable because paid
custom-domain accounts use `imappro.zoho.com` and other data centers use regional
servers. Use the exact server shown in Zoho Mail's Settings → Mail accounts.
Enable IMAP there first; the plan must support IMAP. With two-factor
authentication enabled, use a Zoho application-specific password.
See [Zoho's IMAP setup guide](https://www.zoho.com/mail/help/imap-access.html).
Browser inbox mappings also offer Zoho Mail and recognize its regional webmail
hosts; when no account label can be detected, use the existing manual fallback.

## OAuth client credentials

Google and Microsoft sign-in need an OAuth client that belongs to Kudium.
Create a **Desktop app** client in Google Cloud with the Gmail API enabled, and
a public client in Microsoft Entra with `http://127.0.0.1` registered as a
mobile/desktop redirect URI. Supply them either as build-time variables
(`KUDIUM_GOOGLE_OAUTH_CLIENT_ID`, `KUDIUM_GOOGLE_OAUTH_CLIENT_SECRET`,
`KUDIUM_MICROSOFT_OAUTH_CLIENT_ID`) or on this Mac in
`~/Library/Application Support/Kudium/email-oauth.json`:

```json
{ "google": { "clientId": "…", "clientSecret": "…" }, "microsoft": { "clientId": "…" } }
```

Without a client the provider is listed as "not set up in this build" and
cannot be chosen. The main process watches the local config directory and
invalidates cached credentials when the file is created, replaced or removed;
the next Email status refresh updates provider availability without restarting.
Google treats mail scopes as restricted: until the app passes
Google's verification and CASA assessment, the consent page shows an unverified
warning and the project is limited to 100 test users. The existing `web` client
in `google-oauth.json` cannot be reused because web clients do not accept
loopback redirects.

## Security notes

- Access and refresh tokens are stored with the other provider values and
  refreshed in the main process before each read; the renderer never sees them.
- Provider values are stored in `<userData>/email.bin`, encrypted with the
  same secure storage as Activity and notes, written atomically with mode 0600.
  Connecting is refused when the OS backend is unavailable or `basic_text`.
- Status responses contain connection summaries, aliases and parsed messages
  only. Message text is capped at 20 KB and each connected inbox keeps 50 messages.
- `wait_for_email` output is a tainting read from `EMAIL_TAINT_ORIGIN`, so
  mail content can never silently authorize project writes or shell commands.
  Descriptions tell the model that codes are for immediate entry and are never
  saved; the existing one-time-code exclusions in Personal Data remain.
- `create_email_alias` asks for approval through the normal AI review path,
  because it consumes the user's provider quota.
- Connected inbox messages are isolated by mailbox ID. Browser inbox content
  uses the existing browser read tools and their taint protections.

## Behaviour

- The Mailboxes tab refreshes its selected connected inbox when visible and
  every 60 s while it stays visible. Hiding the panel or window stops its timer
  and subscriptions; stale status replies are ignored. Automatic refreshes reuse
  results for 15 s, including a short retry throttle after failure;
  explicit refreshes bypass that throttle. Concurrent reads share an in-flight fetch
  per account. `wait_for_email` polls every 4 s up to 180 s.
- IMAP connections are pooled per account and closed after 90 s idle, and on
  disconnect or quit. Refresh fetches metadata for at most 80 candidate messages,
  then downloads at most 50 eligible, uncached bodies. Messages older than the
  requested time and sources above 512 KB are skipped before body download.
  Parsed messages are cached by UID and mailbox UIDVALIDITY on the pooled client;
  changing credentials or reconnecting creates a separate cache. MIME parsing
  yields to the main event loop between messages on initial loads.
- UI status requests send account metadata and only the selected mailbox's
  message bodies. Previously opened mailbox details remain in the renderer.
  Main-process message projection uses an indexed alias lookup and is cached
  until aliases or messages change. Revisions prevent stale responses from
  restoring removed accounts. Manual refresh locks its own button, leaving
  other account and Add controls usable.
- `emailPerformance.test.ts` measures a synthetic 20-mailbox / 1,000-message /
  10,000-alias fixture. One local run measured the previous projection at 544 ms,
  a cold indexed projection at 2.7 ms and cached status calls at 0.01 ms average.
  Body-scoped payloads were 2.3 MB rather than 21.5 MB in that extreme fixture.
  These are main-process fixture measurements, not live server timings or a
  guarantee of overall browser latency.
- Aliases created for a site carry the site in the provider note
  (`Kudium · example.com`) so they survive reinstalls and appear on other
  devices using the same account.
