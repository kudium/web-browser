# Kudium Browser MCP

Requires Node 22+ and an open Kudium Browser with **Preferences → AI assistant → External AI → External control** enabled.

```sh
npx @kudiumbrowser/mcp setup
# Or choose explicitly:
npx @kudiumbrowser/mcp setup codex
```

Approve the local connector once in Kudium, then restart your agent. Supports Codex (user configuration), Claude Code, Cursor and VS Code (current project configuration). Repeat setup for another client; it reuses the approved connector credential and replaces only Kudium's configuration entry. Setup still asks for browser approval when invoked.

The stdio server runs with `npx -y @kudiumbrowser/mcp`. Credentials live in `~/.kudium/mcp-connection.json`, never in project configuration or BROWSER.md. All clients configured this way share one connector credential. Disable External control or reset its token to revoke all connector clients. Existing browser scope, access settings and action approvals apply.

Use `setup codex --port 43187` for a custom local MCP port. Keep the browser running. No model API key is required.

## Publishing

From this directory, run `npm test` and `npm pack --dry-run`, then `npm publish --access public` using an npm account with permission to publish in the `@kudiumbrowser` scope. Until published, test locally with `node cli.cjs setup codex` and configure the client to launch the absolute local `cli.cjs` path instead of npx.
