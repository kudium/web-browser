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
selector, close action, and native content slot. Native panels are docked in
this first implementation; they do not use the React portal's undocking path.
Extension requests open only their owning window, without persisting a
cross-window Assistant pane change.

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
