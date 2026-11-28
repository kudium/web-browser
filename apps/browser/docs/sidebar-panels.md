# Reusable sidebar panels

The right sidebar contains independent Chat, Notes, Activity, Tasks, Developer,
Email and registered-feature pages. Opening a page appends its column in opening
order; an already-open page keeps its position. Each page has its own close
control. Width, resize handle and right/bottom placement remain owned by the
workspace shell.

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
is only needed while visible. The host reports a docked page as visible while its own column is open;
floating pages remain visible. Keep
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

## Portable project groups

Linking a folder from the Developer panel or dropping it on a group reads its
`kudium.workspace.json` before writing browser context. An existing manifest gets
the shared workspace diff review: group name and slug, layout, supported session
mode, URLs and tab pins, project scripts, site permissions, terminal definitions,
skills and named AI sessions. Existing tabs and scripts are retained. Script
commands are saved without execution; restored terminals stay stopped. AI trust
and browser access mode require a separate review through the existing permission
guards. `setup_project` retains its own approved link path and does not repeat the
native import review.

With **Keep browser context in linked projects** enabled, one main-process writer
updates the manifest after group, URL, project script, terminal or site-setting
changes. Saves coalesce for 500 ms; unchanged layouts do no filesystem work. The
file retains declared skills, named AI sessions and script shortcuts. Terminal
directories are relative to the project, so a teammate can clone the folder and
link it in their own browser. Local browser/group IDs, global scripts, terminal
output, live processes and account credentials remain outside the manifest.

Unlinking retains the portable JSON. Starting the browser leaves an existing
manifest intact. External edits are checked before subsequent writes; conflicting
changes show a notice in the project section and require relinking for review.
The AI's existing `get_workspace_config` tool reads this file, and the generated
AGENTS.md reference points project agents to it and the Kudium MCP bridge.

## Linking project folders

The Developer page presents Link Folder on its own centered row. Linking from
Developer or group settings selects Files; group settings opens the same
Developer panel using its existing navigation event. Both controls share the
saved group view through `browser/developerViews.ts`.

A drop on the Developer page validates a local directory and asks for
confirmation before changing the group's project link. Cancelling leaves the
link and current view untouched. Group access is checked again after the dialog.
A drop anywhere inside the terminal bypasses project linking and inserts safely
quoted filesystem paths into the selected terminal. It does not insert `cd`,
press Enter, open a new terminal, or execute the dropped path. Control characters
in filenames are rejected; terminal readiness and the selected tab are respected.

## Developer terminal restoration

The existing main-process `ProjectTerminals` store remembers each group's tabs,
names, selection, visibility, size, output and working directories in the private
`developer-terminals.json` file. Restoring a tab starts a fresh shell without
replaying previously executed commands.

On macOS and Linux, shell directory changes are read from the owning process,
not from terminal text. Submitted input triggers a check; output checks wait for
a quiet interval. Checks coalesce and run at most once per second per shell;
macOS uses a PID-scoped lsof call with a 500 ms deadline. Saved commands do not
probe continuously while producing output. Late results are ignored after exit,
restart, removal, access changes or project replacement. Directories must resolve
inside the linked project, including through symlinks. If a restored subdirectory
was deleted, the tab opens at the project root. Windows retains the directory
chosen when creating a terminal. No live shell processes or commands are replayed
from disk.

## Shared bottom docking

The workspace panel container supports independent right or bottom placement for
Chat, Notes, Activity, Tasks, Developer, Email and native panels. Right and bottom
areas can be open at the same time. `PanelDockButton` uses the page’s dock
context, with `usePanelDock` as the legacy default; placement and bottom height
are saved locally. Changing a page’s placement
moves its stable column portal container and keeps every existing
`SidebarPanelHost` portal and native provider mounted. The
existing `SidebarResizeHandle` supports horizontal and vertical movement. The
viewport and native-panel bounds observers remain the only layout reporters.

Page Developer Tools registers as a native feature provider when Dock in panel is
selected. The existing registry owns its picker, resize bounds, suspension,
retention and pop-out behavior. Its Manage control opens the native DevTools dock
menu. Closing the inspected tab removes its provider.

## Sidebar resizing

Manual resizing keeps native webpages live. `SidebarResizeHandle` updates the
workspace CSS dimension once per animation frame through `liveResize` and commits
the saved width on release or cancellation. Keyboard sizing still commits directly.
The viewport observer sends `geometryOnly` layouts with no app metadata; the main
process accepts bounds only for the owning window's existing visible tabs and checks
current group access. It updates native bounds without reconfiguring tabs or
publishing tab state. Dialogs and overlapping portals retain snapshot suspension.

Run `.erb/scripts/sidebar-resize-smoke.cjs` with Electron from `apps/browser` for
the native view fixture. It checks intermediate bounds and final viewport agreement
with synthetic pointer events; it does not simulate physical OS pointer routing.

Native panel slots follow position-only ancestor motion while it is active,
including intermediate frames, and stop tracking on completion or after 1.5 seconds
if an end event is lost. Unchanged rounded bounds and visibility do not cause native
view updates. Terminal sizing reuses the shared live resize handle; inspector sizing
uses its live callback for native geometry and publishes tab state only on commit.
Screenshot-area dragging batches image measurements and selection changes to a frame
and flushes the final pointer position before saving the crop.

## Space and group switching

Active-space and remembered-tab changes notify this window synchronously. They
do not broadcast shared metadata events or scan saved tabs. Shared edits still
use the existing space update and workspace persistence paths. Keep unaffected
space objects stable, and resolve the destination remembered tab on the first
render so native layout never briefly selects a neighboring tab in the old space.
Clicked spaces move 12 px over 120 ms; deliberate swipes keep their full-width
transition and reduced-motion behavior.

Native tab-state publication deduplicates identical payloads per renderer. Clear
that cache on renderer reload, tab removal and group-lock changes; new windows
receive their own first state. Native page visibility and bounds only update
when changed. This retains existing pages and does not bypass ownership checks.

After building the renderer, run `node .erb/scripts/run-browser-ui-smoke.cjs
--space-switching-only` from `apps/browser` for 40 consecutive UI-driven space
and group clicks against real WebContentsViews. The disposable local fixture
checks remembered tabs, retained page identities and intermediate native focus,
and writes latency samples and a screenshot. Its 10 ms observation interval and
warmed local pages do not establish performance for cold or remote pages.

The `--switching-stress-only` fixture covers 810 saved tabs in 10 spaces and
210 groups, delayed cold responses, three pages with 8,000 DOM cards and
recurring 15 ms JavaScript tasks, retained form drafts, and MDN, Wikipedia and
GitHub cold loads. It reports selected UI frame latency separately from native
view visibility, records renderer long tasks/frame gaps and writes a Chromium
CPU profile. Public-site failures are reported separately from local correctness
checks. Small-sample percentiles and profiler overhead are not whole-app latency
guarantees; inspect outliers and repeat with one benchmark process at a time.


## Popup presentation over native surfaces

The shared overlay observer marks intersecting popup content pending until the
owning native page and/or docked panel acknowledge the current suspension token.
Keep content mounted for Radix positioning, autofocus and dismissal; pending
content has zero opacity and no pointer interaction. Overlapping content skips
its opening animation, so it appears together after native views yield. Popups
outside native surfaces keep their normal presentation.

Popup capture and replacement-image presentation each have an 80 ms deadline;
a stalled capture yields without a snapshot. The page and panel prepare in
parallel. Dismissal invalidates pending tokens, and late captures cannot hide a
restored view or reveal an old popup. Other snapshot consumers keep their existing wait and capture fallback; native
page suspension is bounded even when a dialog requests it before mounting.

Run `.erb/scripts/popup-overlay-smoke.cjs` with Electron from `apps/browser` for
a disposable native-page fixture using the actual Browser options and GroupPicker
components. It checks delayed intermediate frames, cancellation, autofocus,
action selection and retained page state. Synthetic input and a local page do
not establish installed-app or remote-page latency.


Default item-aligned Select menus participate directly in overlap detection,
including when they have no Radix popper wrapper. Custom renderer popups opt in
with `data-native-overlay-content` and reuse the same readiness and suspension
path; assistant composer suggestions use this marker. Pending popup descendants
cannot receive pointer input.

Docked right/bottom page inspectors contribute their own snapshot frame at their
actual bounds. Inspector frames retain their owning tab ID and access checks, and
are keyed by surface so the page is never stretched over the inspector. Detached
inspectors and panels retain their separate-window lifecycle.

Compact folder-style tab groups render one icon stack and open the shared anchored
tab preview. They never render inline tab lists or change the saved expanded state;
returning to the full sidebar restores that state.


Compact collections use the shared anchored preview, including empty collections.
The rail shows one collection icon and active highlight, never nested groups or
inline creation controls. Click and ArrowRight/ArrowDown open its popup without
changing persisted collapse state. Popups provide New group and Manage collection
through the existing creation and settings handlers. Empty collections reuse
EmptyState and expose one creation action. A single Add menu in the compact rail
uses existing tab, group and collection actions; full-sidebar controls are retained.

The hidden sidebar reserves an 8px visual frame. Keep its renderer trigger at that
width; observe `before-mouse-event` on visible website and docked inspector views
to extend hover access to the first 16px of the window. Do not cancel page mouse
events or add a transparent native shield. Coalesce enter/leave notifications,
ignore drags and suspended views, and unsubscribe when the native view is destroyed.

## Independent sidebar page columns

`useSidebarPages` owns opening order and active-page focus. Session storage keeps
window-local ordering across renderer reloads; a local layout preference restores
the last saved IDs and focus in a new app session. Widths and individual docks
restore separately. Only available registered providers contribute native columns;
unavailable saved providers reserve no empty space. The old single-page layout
migrates on first use. Toolbar toggles and shared header Close controls remove only
their own page. Every request to open an existing page reveals its column, including when the
active page has been scrolled out, without reordering it.
`SidebarPageColumns` keeps the existing keyed hosts mounted, including closed
pages, so drafts, AI streams and terminal content retain their identity. Do not
render a second AISidebar or duplicate feature state for each column.

Right columns keep independent saved widths; their total area is bounded to
leave room for the website. Fit each displayed column to its available area without
overwriting the saved preference. Column hosts own committed widths; do not spread
page width variables onto the workspace, where they override fitted sizes. The
shared outer area handle clears its temporary page width after committing, including
zero-distance and cancelled drags. Additional columns scroll horizontally. Bottom
columns fill the webpage’s full width, with the last column absorbing remaining
space. They fit smaller rows down to the shared 240px minimum before scrolling.
Dividers redistribute the two neighboring widths, with animation-frame live CSS
updates and preference commits only on release. The outer right handle resizes
the first right page; the bottom edge handle controls the bottom area’s height.
`useSidebarPageDocks` stores each page’s placement independently. Each shared
PanelDockButton uses its column’s context, leaving other pages in place. Both
areas maintain opening order and their existing content identities. The selected column remains
visible when the area resizes. Native content rectangles are intersected with the
scrolling area before the existing registry receives them; fully scrolled-out
native content is hidden. Column-order changes update geometry without an
intermediate null layout. Dock/undock callbacks open or close their own page and
never replace other columns. The shared AssistantPageHeader supplies each built-in
page's close action. Mixed right/bottom docking reuses the same hosts and order.

The Arrange panel grip supports header dragging and Alt+Left/Right movement.
Clicking it constructs the native layout menu on demand, with movement, Balance
panel widths and Reset panel layout. Reset restores standard ordering, widths,
right docking and bottom height while preserving open content.

The main registry creates independent lanes using its existing native lifecycle
for each activated logical panel. Tab-specific documents of the same extension
follow its existing provider selection; unrelated extensions and hook outputs
remain open together. Explicit close, dock, pop-out, content replacement
and geometry affect only that provider. Closed views remain cached for reopening;
provider removal and unloading dispose them. Profile and availability checks remain
in the shared registry and extension adapter.

Run `.erb/scripts/sidebar-native-pages-smoke.cjs` with Electron from `apps/browser`
for concurrent real native extension/hook views, retained drafts after close/reopen,
independent pop-out/dock, overlay suspension and cleanup. It uses disposable local
providers and does not establish compatibility with every extension.

Run `.erb/scripts/sidebar-pages-smoke.cjs` with Electron from `apps/browser` for
actual Developer, Email and Chat columns against a live local native web page.
It checks order, independent close/reopen, retained input, narrow-window scrolling,
independent placement, full-width bottom rows, divider dragging in both dock
areas, repeated reveal requests and complete layout restoration in a fresh window
session. Its fixture has no signed-in accounts and does not verify
remote email or AI operations.

## Responsive panel headers

AssistantPageHeader measures only its own controls with resize and mutation
observers. Secondary buttons and the dock selector collapse into More panel
options when controls overlap or the row overflows, and return when it widens. Keep titles, Close,
Arrange and picker/popup anchors in the header. Data-header-essential marks any
feature-specific control that must remain visible. Overflow controls stay mounted;
More builds native menu metadata only on click and dispatches the existing action
or select change. Recheck disabled state, connection and header visibility after
selection so stale menu choices cannot operate on closed pages.

The sidebar page Electron fixture checks narrow Chat and Activity headers, button
bounds and independent docking from More. It uses local disposable data.
