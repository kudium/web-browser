# Reusable sidebar panels

The existing right sidebar is shared by Chat, Notes, Activity, Tasks, Developer,
and registered feature panels. Its width, resize handle, and placement remain
owned by the workspace shell.

## React feature content

`components/UI/SidebarPanelHost.tsx` supplies a stable portal container,
document/overlay contexts, and dock/undock lifecycle. Pass a stable `id`, `title`,
`active`, and React content. `onDock` and `onWindowClose` let a feature restore
its own selection rather than writing Assistant preferences. The
`AssistantPanelHost` wrapper preserves the existing built-in panels' saved
placement and behavior.

Generic floating names use `kudium-sidebar-<id>`; IDs must start with a lowercase
letter and contain only lowercase letters, digits, or hyphens (up to 64 chars).
These blank windows are permitted only by the trusted workspace host. Remote
navigation remains blocked.

Retained React pages use `AssistantPanelVisibilityContext` to pause work that
is only needed while visible. The host reports a docked page as visible only
when selected and the sidebar is open; floating pages remain visible. Keep
drafts mounted while pausing subscriptions and refreshes for hidden pages.

## Isolated native feature content

`main/sidebarPanels.ts` exposes `sidebarPanelsFor(window).register(provider)`.
A provider supplies `info` (`id`, `title`, `kind`), a `contentKey`, an optional
availability predicate and group ID, and a factory returning a
`WebContentsView`. Main-process features register providers; renderer IPC can
only select registered IDs and report their visible rectangle. It cannot
provide a URL, session, preload, or view factory.

Use `kind: 'hook'` for future hook result pages or `kind: 'feature'` for other
features. The provider owns its content/session security policy. Use sandboxed
views with context isolation and without Node integration for untrusted
content. A changed `contentKey` replaces stale content; hiding a panel keeps its
view available without remounting. Remove the provider when its feature ends.

The shared registry handles selection, resize bounds, unavailable content,
view cleanup, error reporting, and hiding behind workspace dialogs and the tab
switcher. The `SidebarPanels` renderer component supplies the shared header,
selector, close action, pop-out action, and native content slot. Native panels
move their existing view into a sandboxed window with a Dock back control.
Docking or closing that window returns the same view without reloading its
content or changing its session. Closing the Panels sidebar page hides its
viewport and preserves the existing view and saved selection. Reopening restores
that selection without revealing another sidebar page. Provider-list metadata
refreshes must update geometry without sending an intermediate null layout. Profile changes and unloading still remove
unavailable content while it is floating.
Extension requests open only their owning window, without persisting a
cross-window Assistant pane change.

Authentication and other ordinary popup windows can share the extension's
profile without owning a sidebar host. Sidebar refresh skips those windows.
Extension pages retain their logical workspace owner when popped out:
`windows.getCurrent`, `tabs.query({currentWindow:true})`, and `tabs.create`
without an explicit window use that owner rather than an unrelated focused
authentication window. Native extension views are not added to browser tab
lists. `tabs.create` requests use regular Kudium tabs in the existing group,
including cross-site authentication pages. They retain the group's profile
and use normal navigation, history, and context menus. Extension-package
documents also use group tabs, validated against the loaded package in that
profile, with no workspace preload. New tabs clear the source tab's forced
default URL and stale restoration/customization state. The automatic popup
route and its separate lifecycle bookkeeping have been removed. Replacing an extension's
sidebar document with an authentication website is not the behavior of
`tabs.create`, and website embedding restrictions still apply.

## Chrome extension side panels

`main/extensionSidePanels.ts` adapts the existing authenticated extension router
to the generic registry. The reproducible preload patch runs during
postinstall, development startup, builds, and tests for extension frames and
classic/module service workers.

Supported APIs are `getOptions`, `setOptions`, `getPanelBehavior`,
`setPanelBehavior`, `open`, `close`, `getLayout`, `onOpened`, and `onClosed`.
Extensions must declare `sidePanel`. `side_panel.default_path` supplies the
initial resource. Global options and toolbar behavior persist per profile;
tab-specific options are tied to live tab IDs and discarded on tab removal.

Only resources inside the loaded extension package may be panel documents.
Views use that extension's session, never the workspace renderer's session or
preload. Available panels follow the workspace's active profile and tab;
disabled, unloaded, and out-of-profile panels cannot open. HTTP(S) links open
as regular browser tabs, while privileged destinations and external redirects
are blocked. `open` requires a recent native user input or authenticated
toolbar click. Specify one `windowId` or `tabId`; tab targets must be active.

Muse from Meta 2.1.12 declares `panel/index.html` and uses `open` and
`setPanelBehavior`. Sidebar support does not imply support for every other
API it requests, such as `debugger` or `tabGroups`.
The browser API adapter supplies tab-group membership, group properties,
queries, and lifecycle events, plus tab-bound debugger attachment, commands,
targets, events, and detachment. Group state comes from the saved workspace.
There is no separate in-memory group engine. Without a workspace host,
queries are empty and mutations reject explicitly.
`main/extensionWorkspaceGroups.ts` projects saved Kudium groups into stable
Chrome IDs. `tabs.group` creates or joins a real Kudium group through the normal
workspace save path; title, color and collapse updates persist and appear in the
group sidebar. Moving tabs retains the login profile and checks both source and
destination group access. `tabs.ungroup` creates standalone Kudium groups while
reporting Chrome's ungrouped ID (`-1`). Group moves and nested
debugger sessions are currently rejected explicitly. Debugger commands support
tab-level domains used by Muse (including Runtime, Page, Input and Emulation),
not browser-wide Target or Browser commands. Privileged pages, foreign-profile
tabs, and attachments owned by another extension are rejected. Navigating an
attached tab into a privileged page detaches its debugger; removing a tab or
unloading its extension also cleans up attachments.

Run `npm run test:muse-compatibility` to download and validate the actual Muse
package in a temporary profile, start its worker, and verify its rendered
signed-out panel and pop-out path. This separate network check does not use the
user's sign-in or installed package. It also clicks the real Sign in button
with native mouse input and checks the account input in the authentication
tab, using the same profile. It is not proof of completed login, chat or task
execution; those require acceptance testing with a Muse account. The generic
release fixture checks group operations and a real CDP command on a disposable
HTTP page for both classic and module workers.

The panel header uses the shared sidebar toolbar and a full-width native content
slot. Its target defaults to **Auto · current group**. Picking a group keeps the
extension's active-tab context in that group's profile; an unloaded target is
selected so its native tab can start. The picker cannot install an extension or
grant access to another profile. Only approved extensions in the target profile
appear. Unavailable or locked targets fall back to Auto. Selection and target
preferences survive restarts, and native content remains alive when the sidebar
is hidden. Extensions remain responsible for persisting their own internal
conversation state across application restarts.

## Verification

### Extension context menus

Extensions declaring `contextMenus` use the existing extension menu registry
for page menus, toolbar action menus, and extension sidebar content. The
guarded `patch-extension-context-menus.cjs` dependency patch implements
create/update/remove/removeAll, visibility and title changes, scoped parent
trees, and checkbox/radio state with `checked` and `wasChecked` click data.
Menu IDs belong to their extension, so identical IDs cannot collide between
extensions. Use the shared `attachPanelContextMenu` to combine extension entries
with native editing and link actions; do not create another menu registry.

A validated native menu choice supplies the existing side-panel user gesture
gate before dispatching the extension worker's `onClicked` event. Page clicks
report the clicked tab; extension views without a browser tab do not fabricate
one. Disabled, hidden, unloaded and foreign-profile entries cannot dispatch.
Extensions still own their menu visibility and authentication behavior.

The installed-dependency CJS/ESM regressions run through the standard test gate.
The native side-panel fixture also reproduces Muse's hidden-item creation and
visible-item update through real classic/module workers, verifies the clicked
tab, opens the panel from the menu gesture, and checks action checkbox events.

Run TypeScript and the browser unit tests. The new registry and adapter tests
cover profile boundaries, resource paths, tab settings, visibility, IPC trust,
and cleanup. Run the real fixture separately from `apps/browser`:

```sh
npm run test:extension-side-panels
node .erb/scripts/run-extension-side-panel-smoke.cjs --ui
```

The fixture uses disposable profiles and verifies both worker types, native
extension content, permissions, user gestures, tab-scoped panels, lifecycle
events, profile switches, and unloading. It does not alter the user's installed
extensions or browsing profile.
The UI fixture bundles the actual shared header and stylesheet, checks the
full-width native viewport, switches content through layout IPC, preserves a
typed draft across hiding/reopening, and restores panel/target preferences after
a renderer restart.

Native viewport rectangles must use `clipSidebarPanelBounds` before placement.
A CSS slot can extend a few pixels beyond the window after sizing or inset
changes; rejecting the whole rectangle leaves an extension selected with no
content. Clip partially visible slots to the window, and hide only fully
offscreen or invalid slots. The registry regression preserves the reported
1514 × 684 window and 3-pixel bottom overflow that blanked Muse.

## Reuse rules

Use `GroupPicker` for tab-group selection and other searchable header choices;
the panel and tab-group pickers belong in the same `AssistantPageHeader` row.
Use `EmptyState` for sidebar placeholders, with feature-owned text, icon and an
optional action. Panels and Developer share it. Do not copy their markup, picker
search/keyboard logic, or styling into another feature.

`AssistantPageHeader` owns row height, vertical spacing, action sizes and picker
appearance for every sidebar page. Use `edgeToEdge` when a page's content extends
outside the sidebar inset; it restores the same header alignment without adding
padding to the content. Do not add page-specific header padding, height, borders,
or control sizing. Page classes may arrange feature actions and accommodate a
pinned history rail, but must preserve the common header design.
Headers must be the first element in each page's layout and occupy the shared
`--assistant-page-header-height` slot. Keep scrolling and pinned-history offsets
in the content below that slot, never on the header or its whole page container.
The native UI fixture switches between the retained Chat, Notes and Activity
layouts and checks their header rectangles, including scrolling Activity.
Use `assistant-page-body-wide` for content that needs the full sidebar width
with one compact gutter. Do not stack sidebar padding, body padding and list
padding; Developer uses this shared body layout for its project controls and
page/file content. Card padding belongs inside the card, not around the list.
Shared sidebar headers use this same compact 8px inset. Normal headers reclaim
the outer content padding; edge-to-edge headers already occupy the full width.
Keep this alignment in the shared header rules, never in page-specific offsets.
Use `ChromeIconButton` for header icon actions, including Radix popup triggers;
do not mix Radix ghost-button sizes with chrome controls. Shared picker icons
are 16px and header controls are 26px, including their flex basis. Page containers
must not clip the shared header's reclaimed inset; put overflow scrolling on
the body below it. Verify actual Developer, Notes and Activity components at
368px and 640px, including control dimensions and clipping, and visually inspect
the running app's headers instead of relying only on toolbar rectangles.
Full-width panel content may reclaim horizontal padding only. Let the shared
frame's flex layout own its height; never use negative bottom margins to extend
content past the border. Native panel views use the frame's inner corner radius
and must end inside its bottom border. The native UI fixture checks this edge;
window-bound clipping remains a fallback, not a substitute for frame sizing.

Extension adapters translate Chrome contracts into the existing Kudium model;
they must not create a second group store, save path, permission mechanism, or
popup navigation system. Workspace changes use `AppManager` and its existing
access checks. Native panel content is hidden while a shared picker is open so
its popover can receive input, then restored without recreating the content.
Global menus and dialogs use `useNativeOverlay` and the existing window layout
suspension for both website viewports and native sidebar content. Check overlap
separately for `.browser-viewport` and `.sidebar-feature-content`, and send the
results through `suspended` and `sidebarSuspended`. A menu covering only a website
must not hide an unrelated panel. Full-window dialogs still suspend both surfaces in that window. Before hiding
a docked native panel, capture and paint its pixels through the shared snapshot
presentation helper so its background does not disappear. Keep the existing
view alive, release the capture on resume, and reject late capture results after
dismissal, panel switches, or host disposal. Panel pickers use this same overlap
path rather than reporting a null layout when they open. An undocked
panel belongs to its child window and must remain visible during parent-window
popups. Recheck overlap when surfaces resize, scroll, appear or disappear. Include every
native surface in the shared overlap detection, including scoped portals that
overlap a panel; do not add separate menu-specific suspension state. The native
UI fixture opens Browser options and checks panel hiding and restoration.
Sidebar website links use the owner window's shared `protectWindowNavigation`
handler and `open-sidebar` tab request, including normal anchors, `window.open`
and the shell's native Open link context-menu action. Detached sidebar windows
inherit this handler from their owner. The renderer reuses `commandDestination`
to open or focus the URL in the current group and profile, without applying
external-link routing rules or launching the system browser. Do not add separate
navigation callbacks to each sidebar page. Keep remote documents out of the
trusted shell window and block redirects. Native regression coverage clicks
actual Activity items and anchors; unit coverage checks detached ownership,
context menus and existing current-group destination behavior.

Hook output providers reuse this registry and its native-view lifecycle. See
[hook panel API](../../../docs/hook-panels.md). The shared host tracks the focused
group alongside its session reference so Auto distinguishes groups sharing a
profile. Keep group storage and navigation in their existing adapters. Custom
hook documents have a separate minimal sandbox preload, not the trusted app
preload; bridge calls require the original enabled hook/frame/token and matching
group. Do not expose privileged shell or extension APIs to custom HTML.

Resize and drag state must not suspend native sidebar content. Send only the
sidebar surface’s actual overlay intersection through `sidebarSuspended`; the
main process must honor an explicit false even when website suspension or the
tab switcher is active.

During sidebar resizing, pointer movements coalesce to one width update per
animation frame and flush the final width on release. Hook-output updates must
not resend unchanged native bounds. The shared registry restores the current
slot when an active document changes, respecting suspension, so new HTML output
cannot depend on redundant renderer layout messages or flash over a resize drag.

## Managing a panel provider

Providers may supply a `manage` callback. The shared registry advertises
`canManage` and accepts a trusted owner-window `manage` request for an available
registered provider. GroupPicker renders its Manage button separately from the
selection button and closes the popover before dispatch. Management never
activates the provider or creates its view. Hook providers open their original
site/global editor and source scope; extension providers reuse `extensionMenu`
with their own profile. Do not infer ownership by parsing renderer panel labels
or maintain another extension management path.

## Panel selection history

The shared panel header has Previous panel and Next panel controls. Both are
hidden when no history is available. Once either direction is available, the pair
stays together with the unavailable direction disabled to keep picker sizing
stable during navigation. The native
registry retains up to 50 panel selections per window, including hook reveals.
Navigation reuses existing views and does not change the website or tab group.
Removed and unavailable providers are skipped. Choosing a new panel after going
back discards the forward branch. History survives closing/reopening the sidebar
for the current browser session; it does not retain old versions of a provider's
updated document.
