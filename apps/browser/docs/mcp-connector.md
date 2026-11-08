# npm MCP connector

Source: `packages/mcp` at the repository root. Public package name: `@kudiumbrowser/mcp`.

Enable external control before setup. The CLI requests approval through a loopback-only `/connect` endpoint. Website Origin headers and DNS aliases are rejected. The existing native dialog grants a shared connector credential, separate from personal-agent credentials. Setup is serialized and rate limited. Token rotation, disabling external control, or controller disposal prevents outstanding approval from granting access. Resetting the token revokes all npm connector clients.

Credentials live in a mode-0600 file under `~/.kudium` (mode 0700), outside projects. MCP configuration contains only the launch command. Codex uses user config; Claude Code, Cursor and VS Code use project configs. Malformed JSON stops setup; unrelated settings are preserved. Nested existing Codex Kudium settings require manual review.

External AI provides the setup command and an enabled-by-default Project browser instructions toggle. It gates linking and subsequent context refresh. Turning it off keeps existing documents. Unlink/relink cleanup removes Kudium-owned context for old associations. BROWSER.md includes connection steps and group metadata, with AGENTS.md referencing it; neither contains credentials.

Validation: package config tests, local MCP approval/initialization/revocation test, project-context/preferences tests, production main build, Electron settings fixtures at 360/900px in light/dark with hints and toggle. TypeScript reports existing SyncSettings.tsx provider comparisons. Published @kudiumbrowser/mcp@0.1.0 on npm, with latest pointing to 0.1.0. The free kudiumbrowser organization owns the scope. Verified the registry and the published npx --help command. An installed production-browser connection end-to-end run has not been performed.
