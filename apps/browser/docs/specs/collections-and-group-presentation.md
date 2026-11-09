# Collections and tab group migration

## Product model

Collections (formerly sidebar folders) contain groups. Groups contain website tabs and keep their stable IDs, @references, projects, access controls and personal data. Folder and stack are two presentations of the same group. Folder presentation expands tabs inline; stack presentation opens the active tab. Both offer the existing hover preview and scoped add-tab command bar.

## Implementation plan

1. Persist `groupDisplay: folder | stack` and `sessionMode: separate | collection`. Use `folderId` as the internal collection identifier. Normalize group policy consistently by space and group identity; folder is the default for all unspecified presentations. Collections inherit browser storage by default unless a separate policy or explicit login profile is selected.
2. Rename parent-folder UI to Collection; leave filesystem/project folder terminology intact. Add folder/stack choice to group settings and the group context menu. Add inline tab rows to folder presentation, retaining hover previews, lock gating, scoped plus actions and keyboard access.
3. New groups created in collections default to collection sessions. Users may select separate sessions. Collection storage uses a stable profile based on space and collection IDs. Existing groups moved into, out of, or between collections keep their storage until users explicitly select collection inheritance. Explicit session changes retain the existing native confirmation and reload behavior.
4. Propagate presentation and session policy when adding or moving tabs. New independent groups must not inherit the originating group's presentation or session policy accidentally.
5. Update built-in AI and external tool schemas: list_groups exposes collectionId, collectionName, groupDisplay and sessionMode; create_group accepts collectionId, groupDisplay and sessionMode, requires an accessible source tab in the collection, and defaults to its session. Sharing never expands access scope. Group IDs and access scopes stay independent of presentation and storage policy.
6. Validate migration idempotence, session isolation and inheritance, group settings, tab destinations, AI schemas/scope and TypeScript. No publication is part of this migration.

## Storage and identity

No cookie files are copied or deleted. Explicit separate profiles remain separate. Moving groups preserves their effective login profile and changes session policy to separate. Removing a collection retains its groups. Collection membership uses `folderId`; presentation and session policy travel with tab records. Bookmark export folders remain folders in source-browser terminology.

## Acceptance checks

- Explicit folder/stack selections survive reload. Unspecified presentation defaults to folder, with no legacy stack branch.
- A new folder group expands/collapses via click and exposes selectable tabs. Both views show hover previews.
- Plus opens the command bar scoped to that group; back clears the scope.
- Two new groups in one collection share storage; an explicitly separate group does not.
- Moving an existing group preserves its effective storage; explicit inheritance changes require confirmation.
- AI can discover collection membership and create either presentation without merging identities or changing permissions.

## Audit checks

Normalization scopes group policy by space and group ID, applies the same presentation and login profile to every tab, and clears invalid inheritance without discarding retained storage. Same-collection moves are no-ops. Expanded sidebar state follows group identity rather than its representative tab. Favorite groups respect the selected presentation. A packaged Mac build and live visual QA are separate verification steps.

## Implementation review — November 9, 2026

Reviewed persistence and normalization, collection/group moves, group settings,
sidebar expansion and selection, hover previews, scoped tab creation, migration
scan gating and shared controls, portable exports, built-in AI and external MCP.

Corrections from the review:

- Removed the old-record stack default; unspecified presentation uses folder.
- Scoped normalization to space/group identity and kept group tabs on one policy
  and browser profile.
- Clear collection inheritance when membership is removed, while retaining
  existing browser storage. Same-collection moves do not change policy.
- Validate the selected collection before saving group settings.
- Keep expansion state attached to group identity when its first tab closes;
  favorites respect the chosen presentation. Selected child tabs expose
  aria-current, and locked groups do not announce expanded contents.
- Corrected AI schema descriptions for collection storage and explicit overrides.
- Simplified sidebar conditionals without lint suppression or runtime patching.

Verification: all 219 browser suites passed (1,271 tests). After the final
sidebar simplification, all four relevant sidebar/keyboard/preview suites passed
(15 tests). TypeScript, lint on the reviewed UI/helpers/AI/transfer files and
`git diff --check` passed. A repository-wide Jest discovery also encountered an
unrelated demo using `bun:test`; the browser suite is scoped to `src/__tests__`.
Live visual QA and a packaged Mac build have not been performed.

### Nav history

Nav history keeps recently activated, available tabs in most recent first order.
A quick Control + Tab release switches to the previous active tab; repeating it
switches back. Control + Shift + Tab cycles in reverse. Holding the chord for
1.5 seconds opens the chooser; releasing Control commits, and Escape cancels.
Unloaded tabs and groups leave Nav history, including automatic page discards.
Command + W unloads the page while preserving the saved tab and selects the
previous Nav history entry. Command + Shift + W removes the saved tab through
the normal protected-group checks. Both bindings appear in keyboard preferences.
