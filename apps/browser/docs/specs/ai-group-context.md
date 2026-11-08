# AI group context

Implemented November 5, 2026.

The composer has compact scope and model pickers. Scope defaults to All groups; choosing a group restricts tab listing, content reads, screenshots and all browser actions in the controller. Explicit tab IDs cannot bypass scope. Implicit actions choose an accessible working/focused tab, then an accessible group tab. New tabs inherit their source group and login profile.

Group names already receive defaults at creation. Groups now receive persisted unique slugs, editable in Edit Session. Autocomplete supports @group and @group/page, with icons and display names. Mentions supply context, not access. Out-of-scope mentions disable Send and offer an explicit All groups action. Submission resolves mentions to stable group/tab IDs. Group slug/name changes do not change those IDs. Page reference slugs are derived from page names; autocomplete disambiguates duplicates with numeric suffixes.

The current model can be changed directly in the composer. It loads the configured provider's model list and allows manual IDs when model discovery is unsupported. Credentials remain in Preferences. The app currently stores one provider connection; switching among multiple saved provider connections and named agent personas is a separate milestone.

External MCP adds list_groups, set_scope and resolve_reference. list_tabs includes groupId and reference. Metadata discovery can list group names/slugs across scope, but only accessible pages are returned by browser tools. Narrowing from All groups needs no approval; changing beyond a selected group prompts locally. Scope changes are reflected in the composer. The human can select scope directly; scope changes during active operations are blocked. Browser mutation approvals and takeover rules remain in effect.

Saved tasks capture scope and resolved mention IDs at creation; checkpoints retain scope across pause/restart/resume. Local and external requests enforce the same scope. Group identity combines session ID and space ID; moving a group between spaces or deleting it invalidates its old scope and fails closed. Scope defaults to All groups on a fresh window unless restoring a scoped checkpoint.

Validation: unit coverage for slug migration/collisions, stable IDs after edits, inaccessible/deleted groups, mention insertion and explicit scope expansion, model changes preserving key settings. The disposable Electron/MCP fixture verifies explicit/implicit targeting, screenshot/navigation/tab/download isolation, approved/denied expansion, new-tab inheritance, renamed references, built-in isolation and foreign-window IPC rejection. No personal credentials or running user instance are used.

The native fixture also verifies saved-task scope/reference persistence and restoration of original group scope after pausing, changing the picker and resuming. Full suite: 385 passed; one previously failing command-palette session-selection assertion remains. Focused group/storage/sidebar/task/checkpoint checks pass. TypeScript, targeted ESLint and production build pass. Existing personal Kudium Browser/MCP instances were not restarted or replaced.
