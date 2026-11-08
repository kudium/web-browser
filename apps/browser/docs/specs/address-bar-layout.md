# Address bar and extensions

Implemented 2026-11-05.

Appearance preferences include **Address bar position** (Sidebar / Header above
tabs) and **Expand address bar extensions**. Both persist and update open browser
windows immediately. The address bar's grouped Site settings / chevron controls
also toggle the saved expansion preference. Site settings remain independently
accessible. Header chevrons point right to expand and left to collapse; sidebar
chevrons point down to expand and up to collapse.

The reusable `AddressBar` component owns the address surface, native input,
copy action, grouped settings controls, and extension slot. Sidebar mode shows
the compact hostname when unfocused and places extensions underneath the URL.
Header mode shows the complete URL, including path/query/fragment, in a monospace
input above the tabs and places extensions on the same row. The input scrolls
when a full URL exceeds available space. Header mode also places Browser Preferences
and AI controls inside the address container, independently of extension expansion,
leaving the 40px tab row entirely for tabs and new-tab actions. On narrow windows
these tools wrap within the address container.

The reusable `ExtensionToolbar` owns pinned actions and the Extensions picker.
Collapsing hides both together. The separate pinned-icon preference still allows
keeping the picker visible while hiding pinned icons. Existing profile affinity,
pinning, ordering, management, store access, and popup behavior are retained.
The Extensions shortcut reveals collapsed extensions; in sidebar mode it also
opens the sidebar and returns to the active browsing space.

Both containers use `ChromeIconButton`. Extension action areas scroll without
forcing the address input or container outside the window. At narrow widths the
copy icon gives space to the input; copying from the input remains available.

## Validation

- Whole-project lint, TypeScript, and production build pass.
- Unit suite: 82 suites / 359 tests pass, including placement/visibility validation
  and persistence.
- Electron `browser-ui-smoke.cjs --address-bar-layout-only`: sidebar/header at
  1160/800/480px; complete unfocused header URL; extension row placement;
  collapse/reload/re-expansion; live Appearance preference selection and toggle.
- Electron `--extension-toolbar-only` in both sidebar and `--header-address`
  modes: real local extensions, search, pinning, popup activation/profile,
  keyboard traversal, narrow popup placement, persistent ordering and reset.
- Electron `--horizontal-tabs-layout-only`: compact/crowded tabs, tools
  separation, 1280/900/600/480px, overflow selection and keyboard navigation.

Light/dark previews and the preference-page capture are in
`docs/evidence/address-bar/`. Checks use disposable local Electron profiles.
