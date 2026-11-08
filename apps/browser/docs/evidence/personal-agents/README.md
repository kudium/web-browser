# Personal agent setup evidence

The disposable Electron fixture `.erb/scripts/personal-agents-smoke.cjs` renders the real `AISettingsPage`, `ExternalAISettings`, and `PersonalAgentSettings` components in a Preferences shell. It uses real `registerAI` IPC and the official MCP client, with temporary Hermes/OpenClaw configuration directories. It does not read or change the user's agent configs or restart the user's running application.

Reviewed standard/narrow layouts at 1080px/light, 760px/dark and 480px/light, including configured rows, available connections, reconnect after token reset and the Hermes help popover. Row bounds and button clearance are asserted. Native replacement review cancellation and file picker selection/cancellation are exercised with fixture dialog responses.

The generated YAML and JSON5 configurations successfully initialize actual MCP clients and list the fixture browser tab. Per-agent disconnect invalidates one client while retaining the other; token reset invalidates all clients. The fixture verifies private status results, deferred credential loading, and untrusted sender/frame rejection.

Vendor agent executables were not installed or launched. Compatibility is based on documented native MCP formats and successful connections using those configurations, not a claim of full Hermes/OpenClaw end-to-end execution. OpenClaw requires a native-MCP-capable version; local/container networking remains as documented in `mcp/README.md`.

Final verification: 30 tests across four focused suites passed, alongside targeted lint, TypeScript and the production build. The existing full MCP Electron smoke passed after replacing obsolete fixed tool counts with transport parity checks and explicitly selecting Ask first for its approval assertions. Quick-setup native screenshots also include a missing OpenClaw configuration and the return-to-Preferences rescan.
