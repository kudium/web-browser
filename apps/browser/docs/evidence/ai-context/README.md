# Browser context attachments

Drag a horizontal tab or sidebar group onto the Assistant. Context uses the existing thumbnail strip, AppIcon and GroupIcon. Names and counts are available on hover; each reference can be removed. Dropping copies the reference without changing tab membership or waking any pages. Duplicate references are ignored; a group replaces individual references to its pages.

The browser validates IDs and scope again when sending. Out-of-scope context offers an explicit group/scope change; it never changes access mode automatically. Closed, archived, unknown and foreign-window targets are rejected. Failed sends keep the draft and its references.

Up to eight browser references produce at most 4,000 characters of metadata. Group indexes include counts and up to three representative pages, falling back to compact IDs when the shared budget is tight. The AI uses existing list_tabs/read_page/select_tab tools to discover and read relevant pages, waking only needed tabs. Page snapshots, screenshots and full group content are not collected on drop.

Verification uses disposable Electron storage and a local deterministic AI endpoint:

- `browser-ui-smoke.cjs --ai-context-only` exercises the production horizontal/sidebar drag handlers with synthetic DataTransfer events, checks unchanged membership, the shared group icon, and an actual AI select_tab/read_page targeting the attached inactive tab rather than the previously focused tab. Full-app captures at 1160px and 800px.
- `ai-composer-smoke.cjs` checks scope isolation, duplicate/group replacement behavior, bounded provider context, unknown IDs and untrusted IPC. Context thumbnails reviewed at 240px and 368px in light/dark, alongside the existing full 240/320/368/480px composer audit.
- Nineteen focused tests cover context validation/budgets, latest metadata, scope changes, unavailable targets, and failed-send draft recovery.

Physical OS pointer dragging was not exercised. Native browser handlers, production rendering, preload/IPC and AI tools were used; file chooser interaction remains stubbed in the composer fixture. Existing broader handoff-suite limitations remain documented in ../ai-composer/README.md.
