# AI Skills settings review

The real Settings page was rendered in isolated Electron fixtures at 1000 × 760 and 760 × 760, light/dark. Captures cover the compact empty state, information popover, Add menu, link installation (empty, error, saving, installed), skill creation (empty, filled, created), drag-over/drop, installed disabled, enabled, instructions expanded, bundled resource expanded, loading, library error, save error, removal confirmation, and removed states. The contact sheets were inspected in all four size/theme combinations. Main-content and skill-content overflow checks passed. Removal confirmation cancellation and retry/recovery were exercised.

The native file/folder picker and a live remote installation were not manually reviewed; the fixture simulates their results. Separate filesystem tests exercise real package reading, snapshot isolation, disabled-by-default discovery, persistence, removal, rejected missing/oversized/symlinked resources, and malformed-library preservation. Link tests cover GitHub normalization, public HTTPS validation, private-address rejection, pinned DNS, bounded downloads, and cancellation. Provider-schema and MCP tests pass. Twenty-four focused tests, TypeScript, and targeted ESLint pass.

Skills are globally enabled in this first version. Instructions and text resources are copied into a local library; scripts are not executed by installation or skill tools. See docs/skills/README.md and the installable project-review example.

Run `./node_modules/.bin/electron .erb/scripts/ai-skills-settings-review.cjs`.
