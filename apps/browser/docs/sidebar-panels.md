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
content or changing its session. Profile changes and unloading still remove
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
targets, events, and detachment. Group state lasts for the profile engine's
lifetime. Chrome tab groups are extension metadata; they do not create workspace
groups or persist across app restarts. Group moves between windows and nested
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

## Verification

Run TypeScript and the browser unit tests. The new registry and adapter tests
cover profile boundaries, resource paths, tab settings, visibility, IPC trust,
and cleanup. Run the real fixture separately from `apps/browser`:

```sh
npm run test:extension-side-panels
```

The fixture uses disposable profiles and verifies both worker types, native
extension content, permissions, user gestures, tab-scoped panels, lifecycle
events, profile switches, and unloading. It does not alter the user's installed
extensions or browsing profile.
