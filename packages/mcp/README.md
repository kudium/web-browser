# Kudium Browser MCP

Requires Node 22+ and an open Kudium Browser with **Preferences → AI assistant → External AI → External control** enabled.

```sh
npx @kudiumbrowser/mcp setup
# Or choose explicitly:
npx @kudiumbrowser/mcp setup codex
```

Approve the local connector once in Kudium, then restart your agent. Supports Codex (user configuration), Claude Code, Cursor and VS Code (current project configuration). Repeat setup for another client; it reuses the approved connector credential and replaces only Kudium's configuration entry. Setup still asks for browser approval when invoked.

Setup copies the stdio bridge to `~/.kudium/bin/kudium-mcp.cjs` and configures the client to launch that copy with the Node that ran setup, so the agent's first call does not wait for the npm registry. Re-run setup after upgrading Node or this package to refresh the copy. `npx -y @kudiumbrowser/mcp` without arguments starts the bridge and, on its first run, pairs with the browser (approval dialog in Kudium, progress on stderr); that is the only command a project-level entry written by Kudium contains. Credentials live in `~/.kudium/mcp-connection.json`, never in project configuration or BROWSER.md. All clients configured this way share one connector credential. Disable External control or reset its token to revoke all connector clients. Existing browser scope, access settings and action approvals apply.

Use `setup codex --port 43187` for a custom local MCP port. Keep the browser running. No model API key is required.

## Workspace manifest

When *Keep browser context in linked projects* is on, Kudium keeps `kudium.workspace.json` in each linked project folder (JSON Schema: `kudium.workspace.schema.json` in this package), a one-line reference in `AGENTS.md`, and a `.mcp.json` entry holding only the bridge command. The manifest describes the group, its tabs, action scripts, site permissions, skills and AI settings; `get_workspace_config`, `apply_workspace_config` and `setup_project` read and apply it after one native review. The `ai` block is confirmed separately. Secrets never belong in the manifest.

## Local https

Some clients refuse plain http. In Kudium, open External AI and choose **Use https locally**: the browser generates a local certificate authority that can only sign for `localhost`, `127.0.0.1` and `::1` (X.509 Name Constraints), trusts it in your user keychain (macOS) or user root store (Windows; Linux shows manual steps), proves that a certificate for any other name is rejected, and serves `https://localhost:<port+1>/mcp` beside the http endpoint. Then run `npx @kudiumbrowser/mcp setup <agent> --https`: the CA certificate is saved to `~/.kudium/kudium-local-ca.pem`, the stdio bridge is configured with `NODE_EXTRA_CA_CERTS` (Node clients ignore the OS trust store) and the connection uses the https URL. Direct HTTP clients can use the https URL shown in Kudium with the same bearer token.

## Publishing

From this directory, run `npm test` and `npm pack --dry-run`, then `npm publish --access public` using an npm account with permission to publish in the `@kudiumbrowser` scope. Until published, test locally with `node cli.cjs setup codex` and configure the client to launch the absolute local `cli.cjs` path instead of npx.
