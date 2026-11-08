# Touchbox desktop interaction model

Touchbox uses Radix Themes for accessible controls and Lucide React for interface
icons. Website logos are content, with a local globe fallback. Global CSS tokens
provide light/dark appearance and desktop surfaces without a second styling
framework. macOS uses Electron vibrancy and native inset window controls; this
is not Apple's Liquid Glass rendering API.

## Published references

Reviewed November 3, 2026. These are public product guidance and release notes,
not proprietary design specifications or a promise of feature parity.

- [Arc command bar actions](https://start.arc.net/command-bar-actions): new spaces,
  switching spaces, favorites, pinned tabs, folders, reset pins, and split view.
- [Dia macOS 1.16.0](https://www.diabrowser.com/changelog/mac/1-16-0): pinned tab
  groups, recently closed groups, subtle profile indicators, and contextual menus.
- [Dia product updates](https://www.diabrowser.com/changelog/mac): current sidebar,
  profiles, and tab organization conventions.

## Touchbox's hybrid model

Spaces organize contexts such as Personal, Work, or Projects. A space is not a
cookie partition. Moving a session to another space preserves its account.

Vertical sidebar entries represent distinct session groups. Horizontal page tabs
belong to the selected session. Two Facebook accounts therefore have two sidebar
entries; Home and Messages for one account appear as horizontal tabs together.
Existing apps with no session ID retain the legacy default partition and appear
as one legacy session group within their space. This preserves their login state.

Adding a new app creates an independent persistent session. Opening another page
from the command palette shares the current session only when the URL origin matches. Different origins create separate sidebar apps. "Open with same session" adds
a horizontal page; "Open with new session" creates a separate sidebar group.

Favorites are reachable across spaces and retain their original session. Pinned
session groups remain distinct from ordinary session groups. Folders organize
sessions within a space. Closing a horizontal page archives it; restoration
retains its session. Removing an instance does not erase saved cookies.

Spaces support creation, renaming, color selection, reordering and deletion.
Deleting a space moves its apps to another space and preserves their sessions.
The final space cannot be deleted. Per-space active tabs are saved locally.

## Desktop behavior

- Command/Ctrl+T and Command/Ctrl+L open the command palette.
- Command/Ctrl+Shift+S collapses the sidebar.
- Command/Ctrl+Shift+Alt+Left/Right switches spaces while a website is focused.
- Control+Tab / Control+Shift+Tab switches horizontal pages. Command/Control+W
  archives the current page. Arrow keys navigate the focused tab strip.
- Right-click session entries to share/isolate, pin, favorite, move or archive.
- Native website views are suspended during React overlays. A local page snapshot
  retains the visual background while menus and dialogs receive input.
- Reduced motion, reduced transparency and increased contrast get solid or
  restrained fallbacks. Icon buttons have accessible labels and keyboard focus.

Chrome's settings and extension-management pages are not shipped with Electron.
Browser page actions use Electron native menus. The Chrome Web Store opens in
Touchbox and installs Manifest V3 extensions after a native consent dialog.
Extensions can run in all apps or selected apps, with independent storage in
each profile. Toolbar actions open extension popups. Electron supports a subset
of Chrome APIs; loading and worker errors appear in extension menus. The native
Downloads submenu supports pause, resume, cancel and Show in Folder. Password
management, cloud sync and the complete Chrome browser UI are not implemented.

Website titles and favicons update from WebContents events. Custom names are
stored separately and retained during metadata refresh. Both tab axes have
context menus. URL entry accepts full URLs, domains and search terms, suggests
existing tabs, and explains whether opening creates a tab or an isolated app.

## Sidebar refinement from the supplied Arc reference

The sidebar now owns compact navigation and an editable location capsule. A
three-column favorites tray sits above the space title, followed by single-line
session rows and indented folders. Session counts, status dots, promotional
branding, repeated page titles, and the persistent status footer were removed.
Folder disclosure and management controls become more visible on hover or
keyboard focus. The bottom strip holds the app library, settings and space
switching. Horizontal page tabs remain above the website for Touchbox's hybrid
session model. The populated preview uses disposable test data.

## Dragging tabs and browser controls

The header contains one browser menu. Both tab axes support dragging to reorder;
sidebar reordering moves the whole session group together. Drop a horizontal
page into the sidebar’s fresh-session zone to recreate it in a new persistent
cookie partition. Drop it on a same-origin session to switch to that account’s
partition. Cookies are not copied. Cross-origin merges are rejected, preserving
Touchbox’s origin isolation rule. Custom page names survive moves.

The native Extensions submenu lists installed extensions with enable/remove,
app-access and update controls, and the integrated Chrome Web Store.

Preferences opens from the icon-only header button, the workspace sidebar and
Cmd+,. One searchable page combines browser settings, profiles, Spaces, appearance,
extensions, downloads and developer controls. Typed settings are registered in
`src/browser/preferences.ts`, validated in the main process, and saved atomically.
Destructive profile-data actions require native confirmation. These controls use
Electron APIs; this page does not provide Chrome password or Google sync services.

## Website controls

The URL sliders open a responsive site settings dialog for the current page. It shows
HTTPS/HTTP connection information and per-origin Ask/Allow/Block choices. These
choices and site muting are persisted within each session profile; origins include
the scheme and port. Previously denied permissions can be allowed again, and the
dialog offers a reload to apply changes. The global Block permissions preference
still takes precedence and is identified in the dialog. Camera and microphone use
Electron's combined media permission.

Page tabs show audio, media playback, and muted indicators. Clicking an indicator
toggles muting for that origin in the current profile, including its other open
pages. Muting follows the site when pages reload. HTTPS information describes TLS
encryption and does not claim that the website is trustworthy.

Run the focused desktop regression after building:
`node_modules/.bin/electron .erb/scripts/browser-ui-smoke.cjs --site-settings-only`.
It uses disposable profile data and verifies permission reversal, responsive site
settings, real audio playback, and mute controls.

The site dialog uses icon rows with direct permission selectors, a mute switch,
collapsible connection information, and a fixed reload footer. Its body scrolls
on smaller windows while controls stay visible. Native page views are suspended
behind the dialog. Permission changes are checked against the current origin to
prevent a navigation from applying changes to another website.
