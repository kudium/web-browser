# Kudium Browser

Kudium Browser is a desktop browser for keeping websites, AI, project files, and other
web apps together in one workspace. Developed by [Kudium](https://kudium.com).

The application bundle ID is `com.kudium.touchbox`. Contact: [hello@kudium.com](mailto:hello@kudium.com).

## Web service

The standalone [Bun + Hono web service](../web/README.md) serves the React
showcase and docs, app-update feeds, and PostgreSQL/Drizzle encrypted-record sync.
Desktop account connection and encryption-key enrollment remain separate work.

## AI browser control

Use the AI sidebar with your own model API key, or connect a local external AI
through MCP with no model API key in Kudium Browser. External setup is in
**Preferences → AI assistant → Use an external AI**. HTTP and stdio client
configurations can be copied there. See [MCP setup and agent guide](mcp/README.md).

Model-provider endpoints require HTTPS. Local models may use HTTP on `localhost`,
`127.0.0.1`, or `::1`. Configure the final provider endpoint directly: provider
requests and model discovery reject redirects to protect credentials and content.

Ask first reviews browser actions. Standard reads and browses within the same
website automatically, and reviews page interactions, data entry and new website
destinations. Full access automatically permits supported actions within the
selected scope. After saved-data disclosure, website actions still require local
review, including navigation, input and submissions. External-client disclosure
markers survive restart and credential rotation; private task instructions retain
the same review requirement. Page labels do not grant authority, and reviewed navigation or
page actions are refused if their document, owner or permissions change before
dispatch. Reading enabled Personal Data facts or account metadata requires a
separate local review of the exact data and AI recipient, including in Full
access. Reusing a conversation or paused task containing saved facts requires
renewed review before sending context. A refused checkpoint review preserves the
paused task for explicit retry; Stop discards it. Starting or continuing built-in
AI preserves the external-client pause until an explicit external Resume.
Downstream website disclosure controls
and large-context review remain production work.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer

## Development

From the monorepo root, run `npm run dev:browser`. The commands below run from
`apps/browser`.

```bash
npm install
npm run dev
```

The development command starts the renderer server, watches the Electron main
process and preload bundle, and opens the Kudium Browser window.
`npm start` also runs the same development workflow. Renderer components use
React Fast Refresh; main-process changes restart Electron, and preload changes
reload the window.

## Quality checks

```bash
npm run lint
npm test
```

`lint` checks code style and TypeScript types. `npm test` runs unit tests in the
background without opening Electron or taking focus. Each command stops on the
first failure. Arguments go to ESLint or Jest respectively; for example,
`npm run lint -- --fix` and `npm test -- --runInBand`.

Use `npm test -- --desktop` to also build the app and run the Electron desktop
smoke test. This explicitly enabled test opens windows and takes focus to check
native keyboard shortcuts. It uses a disposable profile. You can combine flags,
for example, `npm test -- --desktop --runInBand`.

For an existing macOS package built from current production bundles, run
`npm run test:packaged-security -- "/absolute/path/Kudium Browser.app"`. This checks the
actual fuse settings, disposable default/hardened attack fixtures, and basic
packaged Chromium port/pipe restrictions. A test-only ASAR observer checks the
production UI payload, website isolation, CSP and history persistence without
a production debugging exception. It does not verify
release signing or other platforms. See
[packaged security evidence](docs/benchmarks/packaged-debugging-2026-11-07.md).

## Command reference

| Command           | What it does                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`     | Starts the renderer server, watches the main process and preload bridge, and opens Electron with hot reload. Ctrl+C stops everything. |
| `npm start`       | Alias for `npm run dev`.                                                                                                              |
| `npm run build`   | Compiles production bundles into `release/app/dist`.                                                                                  |
| `npm run package` | Cleans production output, builds the app, and creates a local installer in `release/build`. It does not publish a release.            |
| `npm test`        | Runs unit tests in the background. Add `-- --desktop` for the build and desktop smoke test.                                           |
| `npm run lint`    | Runs ESLint and TypeScript checks without creating a build.                                                                           |

These are the six supported commands. Cleaning is part of packaging, type
checking is part of linting, and desktop testing is available through `npm test -- --desktop`.

`rebuild` was for recompiling native dependencies for Electron; `postinstall`
checked and prepared them automatically after installation. Kudium Browser currently
has no native dependencies in `release/app`, so those scripts are unnecessary.
Electron Builder handles native dependency preparation during packaging if
native dependencies are added later.

## Packaging

Build an installer for the current platform with:

```bash
npm run package
```

Packaged artifacts are written to `release/build`.

## Browser instances and sessions

Websites run in sandboxed Electron `WebContentsView` instances managed by the
main process. The workspace renderer controls layout and navigation through a
restricted preload bridge; websites do not receive that bridge.

New apps get independent persistent sessions. Right-click an app icon to open
another instance with the same session or a new session, show it beside the
current app, edit it, or remove it. Removing an instance closes its view and
popups but does not erase its saved cookies. Apps without a session ID use a dedicated legacy profile; cookies from the old
default Electron session are not automatically migrated.

The browser toolbar supports HTTP/HTTPS navigation, back, forward, reload,
stop, and home. Login popups inherit their originating instance's session.
Permission requests prompt the user. Browser profiles are local to this
Kudium Browser installation; session separation does not hide network identity.

This migration establishes the browser foundation. A dedicated session-data manager,
bookmarks, a download interface, and broader website compatibility testing are
future improvements.

## Desktop UI

The interface uses Radix Themes and Lucide icons. Kudium Browser combines a vertical
session sidebar with horizontal pages inside each session. Spaces organize
sessions; moving them does not change their cookies. Favorites, folders, pinned
sessions, an archive, and a command palette follow Arc/Dia's published interaction
conventions. See [the desktop interaction model](docs/ui-design.md) for sources,
shortcuts, migration behavior, and feature boundaries.

Appearance supports system, light, and dark modes. On macOS the window uses
native vibrancy and inset controls, with accessibility fallbacks. This is a
macOS-inspired material treatment rather than Apple's Liquid Glass API.

`npm test -- --desktop` also builds the app and runs a real Electron smoke test using a
disposable profile and local websites. It checks the hybrid tab layout, shared
and isolated cookies, command palette, space creation, settings, and appearance.
It opens test windows briefly and prints the location of its UI captures.

## Browser adapters and extensions

`src/browser/contracts.ts` defines the browser transport and backend boundary.
The renderer uses `src/browser/client.ts`; `src/main/browser.ts` selects the
Electron implementation in `src/main/electronBrowser.ts`. Backend attachment
returns a disposal function. Electron extension APIs and toolbar elements stay
behind the browser adapter. Switching engines still requires a new native host
and a profile-data migration; this boundary keeps that work out of workspace UI.

Open the gear menu → Extensions → Chrome Web Store. The store opens as a
sidebar app and reuses that app on later visits. Select an extension and choose
Add to Kudium Browser. Kudium Browser asks for consent and whether it can run in the app you opened the
store from or all apps. Store installation status and removal follow that app. The Extensions menu lets you change app access, disable,
remove, or update extensions. All-app installation shares extension files, while
each app retains separate extension storage and tab access. New apps inherit
all-app extensions unless excluded. Extension action icons appear in the toolbar.

Electron supports a subset of Chrome extension APIs. Installation does not
ensure compatibility. In the live test on Electron 45, uBlock Origin Lite
installed and its popup/storage worked, but its background worker failed on
`chrome.commands.onCommand`; ad blocking is not validated. Worker and loading
errors are available in the extension's native menu. Chrome password sync,
Google browser-account sync, and Chrome's settings page are not provided.

The optional network integration check is
`node_modules/.bin/electron .erb/scripts/extensions-smoke.cjs`. It downloads a
real extension through the store button into disposable profiles and checks
installation/removal, toolbar popup placement, storage, and profile isolation; it does not assert ad-blocking compatibility.

## Preferences

The gear button and Cmd+, open a searchable preferences page. It unifies browser
controls with apps, Spaces, appearance and the archive. Search, zoom, spelling,
website permission policy, popup behavior and download settings save immediately.
Default font size applies to new views. macOS spelling dictionaries follow the OS.
Clear-cache and clear-site-data actions target one profile and require confirmation;
site-data clearing preserves installed extension origins. Developer tools inspect
an open website, and Reveal configuration opens the JSON file’s folder.

To extend preferences, add a typed key and default in
`src/browser/preferences.ts`, register a select or toggle in `preferenceControls`,
and implement its effect in the browser backend. The registry drives rendering,
search and main-process validation. Custom categories are registered in
`preferenceSections` in the Settings component. The preload exposes only validated
preference updates and named actions, restricted to trusted Kudium Browser windows.

## Command bar

New tab, Add app, the welcome action and Cmd/Ctrl+T use one command bar in the
main workspace. Enter a URL or search term, use arrows to choose a result, and
press Enter. A same-origin URL opens a horizontal tab in the focused profile;
a different origin starts an isolated sidebar app. An already-open URL selects
its tab. Fresh session explicitly creates another isolated profile. Results
include matching open tabs, Spaces, Settings, New space and the Chrome Web Store.
The separate app window is reserved for editing names, addresses and icons.

Drag the sidebar’s right edge to resize it. The expanded width is saved locally,
with limits that leave room for websites. Collapse and expand retain that width.
Double-click the edge to reset it. Keyboard users can focus the divider and use
Left/Right, Home/End, or Enter to reset the width.

App, tab and folder right-click menus are rendered by Electron’s native Menu API.
Account-changing tab moves use a native confirmation and preserve the destination
account’s existing tabs; moving apps between Spaces keeps their login unchanged.
Spaces support monochrome symbols and custom images selected through the OS file
picker. Inline renaming uses transparent styling and a subtle underline.
