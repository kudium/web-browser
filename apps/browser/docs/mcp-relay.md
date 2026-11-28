# MCP relay protocol (browser side)

The relay in `apps/web/src/relay/` lets cloud assistants (claude.ai
connectors, ChatGPT, Gemini) reach a Kudium Browser that sits behind NAT. The
browser keeps one outbound WebSocket to the relay; the relay speaks ordinary
Streamable HTTP plus OAuth 2.1 to the cloud client and forwards each MCP
request over that socket. The relay holds no browser state and never stores
request bodies.

**Trust boundary.** TLS terminates at the relay for third-party cloud clients,
so the relay process sees plaintext JSON-RPC for those connectors. True
end-to-end encryption is impossible for clients that only speak HTTPS and
OAuth. The `e2e` frame type is reserved for Kudium's own clients, which can
carry ciphertext the relay never decodes. Users are told this in the
"Connect a cloud assistant" flow; the relay is off per device by default.

## Setup in Kudium

1. If signed out, select **Sign in to Kudium** in Cloud relay to open
   **Preferences → Sync**. Encrypted sync can stay off.
2. In **External AI → Other agents & manual setup**, enable external control,
   using **Enable external control** in the relay card, then select
   **Connect cloud relay**. The main process creates a device at
   `https://browser.kudium.com`, enables it, and saves its credential in the
   owner-only relay store. Neither the account bearer nor device token is
   returned to the settings page.
3. Copy the connector URL into a cloud assistant and approve its request in
   Kudium. Use the path URL, which needs no wildcard DNS.

The relay switch appears only after a device is paired; it pauses or resumes
cloud connections for that device. Before pairing the card shows the next
available action instead. Missing account services, unavailable secure storage,
and private windows display a specific limitation. Private windows cannot use
the regular window's saved account to create relay devices. An isolated profile
needs its own account sign-in; copying project workspace files does not transfer
account credentials. Connection errors appear next to the relay heading.

The advanced token form is for an existing device or a custom relay. A `kd_…`
credential comes from `POST /relay/devices` using an authenticated account;
it is not an MCP client token. There is currently no token-generation web page.
The old `relay.kudium.com` default is not required for account pairing.

**Quick tunnel** is a separate temporary fallback. Install `cloudflared`
(on macOS, `brew install cloudflared`), enable external control, then select
**Use quick tunnel**. Kudium waits for both the public URL and Cloudflare's
registered connection before selecting **Quick tunnel (HTTPS)** in Client
configuration. Copy that configuration, including its bearer token, to a
client supporting token headers. This is not the relay's OAuth connector flow.
Stopping the tunnel restores the local HTTP configuration.

Startup has a 45-second deadline; failure remains visible after the process
exits. The subprocess ignores named-tunnel configuration and `TUNNEL_*`
environment overrides, uses HTTP/2, and forwards the loopback Host header
required by the MCP server's DNS-rebinding protection. It never downloads a
binary or modifies the local server's authentication checks.

## Device lifecycle

1. **Pairing.** With the desktop sign-in credential (the same bearer the sync
   API uses), `POST /relay/devices {"name"}` returns `{ deviceId, deviceToken,
   enabled: false, urls: { host?, path } }`. `deviceToken` (`kd_…`) is shown
   once; keep it in the private store. `urls.host` is
   `https://<deviceId>.<RELAY_HOST>/mcp` when the deployment has wildcard
   DNS; `urls.path` (`https://browser.kudium.com/relay/d/<deviceId>/mcp`) uses the
   serving origin without wildcard DNS.
2. **Enable.** `POST /relay/devices/:id/enabled {"enabled": true}` with either
   the account bearer or the device token. Disabling closes the socket and
   drops every relay session at once (connectors must start a new MCP session).
3. **Connect.** Open a WebSocket to `wss://<relay>/relay/device` with
   `Authorization: Bearer <deviceToken>` (or `?token=` when headers cannot be
   set). The first frame is `hello`. Reconnect with backoff; a newer connection
   replaces an older one.
4. **Manage.** `GET /relay/devices/:id/connectors` lists connector tokens
   (never the secrets); `POST …/connectors/:tokenId {"ceiling","name"}` edits
   one; `POST …/connectors/:tokenId/revoke` revokes; `GET …/audit?limit=`
   returns rows `{ at, tokenId, method?, status, durationMs }`;
   `POST …/token` rotates the device token; `DELETE /relay/devices/:id`
   removes the device and all its tokens.

## Frames (JSON text messages)

Relay → device:

| type | fields | meaning |
| --- | --- | --- |
| `hello` | `version: 1, deviceId, urls, pingIntervalMs, idleTimeoutMs` | sent once per connection |
| `request` | `id, method: 'POST' \| 'DELETE', session?, body, connector: { id, name, ceiling }` | one MCP HTTP request; `body` is the raw JSON-RPC text (≤ 1 MB); `session` is the client's `Mcp-Session-Id` |
| `cancel` | `id` | the HTTP client went away or the 30 s deadline passed; abort the request if still running |
| `consent` | `id, client: { clientId, name, redirectUri, scope }` | a cloud client is asking for access: show the connector-approval dialog |
| `ping` | | sent every `pingIntervalMs`; answer with `pong` |
| `e2e` | `payload` | reserved |

Device → relay:

| type | fields | meaning |
| --- | --- | --- |
| `response` | `id, status, session?, contentType?, body` | answer to a `request`; `session` becomes the `Mcp-Session-Id` response header |
| `consent` | `id, approved, name?, ceiling?` | the human's answer; `name` labels the connector, `ceiling` (`ask` \| `standard` \| `full`, default `standard`) caps the access mode the browser will grant it |
| `pong` | | keeps the socket alive |
| `e2e` | `payload` | reserved |

The browser must answer every `request` (any status is fine) and every
`consent` within 120 s; unanswered consents are treated as denied. A socket
that sends nothing for `idleTimeoutMs` (30 min) is closed by the relay; the
`pong` reply to `ping` is enough to stay connected. Requests arriving while
the browser is offline fail with `503 device_offline`.

## What the browser enforces

- **Ceiling.** Every forwarded request carries `connector.ceiling`. The
  browser treats a relay connector as capped at that mode even when the group
  is in Full access, and the trusted-group bypass never applies to a relay
  connector.
- **Identity.** `connector.id` is stable per connector token; stamp receipts
  and activity rows with it, and show `connector.name` in the status line.
- **Sessions.** Handle `request` frames exactly like local MCP POST/DELETE
  requests (`mcp.ts` request path), including `Mcp-Session-Id` in and out.
  When the socket closes, end those MCP sessions.
- **Consent.** The `consent` frame reuses the existing connector-approval
  dialog (`approveConnector`), with the client name and redirect host shown.
  Reply with the ceiling the human chose.

## OAuth 2.1 for cloud clients

Per device, the relay is the authorization server:

- Protected-resource metadata at `<issuer>/.well-known/oauth-protected-resource`
  (host form) or `/.well-known/oauth-protected-resource/relay/d/<id>/mcp`
  (path form). Unauthenticated `/mcp` calls get a `WWW-Authenticate: Bearer
  resource_metadata="…"` challenge so clients discover it.
- Authorization-server metadata at `<issuer>/.well-known/oauth-authorization-server`
  (or `/.well-known/oauth-authorization-server/relay/d/<id>`): `authorize`,
  `token`, `register` (RFC 7591 dynamic registration, public clients only,
  https redirect URIs or http://localhost), `revoke`; PKCE S256 required;
  grant `authorization_code`; scope `mcp`.
- `GET /authorize` validates the client and PKCE, pushes a `consent` frame to
  the device, waits for the answer, then redirects with a single-use code
  (5-minute lifetime). Offline device → `503 device_offline`.
- `POST /token` exchanges the code with the verifier for a bearer access
  token (`kr_…`, 30-day lifetime). The token's `ceiling` claim is what the
  human chose at consent.

## Limits and safety defaults

Off per device by default; device sockets expire after 30 minutes idle;
per-device limit 120 requests / 10 s and per-connector 60 / 10 s (`429`);
request bodies ≤ 1 MB (`413`); 30 s forward deadline (`504`); audit rows kept
per device (last 500) without bodies; disabling a device detaches its socket
immediately; revoked or expired tokens get `401`.

## Deployment notes

`RELAY_HOST` (for example `relay.kudium.com`) enables the host form; without
it only the path form is advertised. State is in memory in this first version
(`MemoryRelayStore`): a relay restart forgets devices, clients and tokens, and
the service runs as a single instance. The `RelayStore` interface is async so
a database-backed store can replace it without changing routes.
