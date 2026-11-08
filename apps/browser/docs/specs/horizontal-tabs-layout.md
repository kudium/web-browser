# Horizontal tabs layout

Updated 2026-11-05.

The tab strip and browser tools share a 40px chrome row. Tools occupy their own
fixed area with a subtle divider; tab space follows the remaining available width
without measuring or overlaying the tools. The address field stays in the sidebar.

Add-tab, pane-close, extensions, preferences, and AI controls use the shared
`ChromeIconButton` component. It owns the native button, tooltip, forwarded ref,
accessible label, 16px icon, and 1.75px stroke. Shared CSS defines the 28px hit
area, 6px corner radius, color, hover, pressed, expanded, and keyboard-focus
states. The AI control has no separate border or geometry. The Electron layout
check compares rendered dimensions, vertical alignment, icon weight, and idle
materials across these controls.

Tabs start at 190px, shrink evenly to 120px, then scroll horizontally. The new-tab
button follows the visible tab list and stays outside its scrolling area. The
selected tab is revealed on selection, tab-count changes, and strip resizing.

Inactive tabs have subtle separators. The active tab uses the page background,
with rounded top corners and no floating-card shadow. Favicons are 16px; labels
use consistent spacing. Close buttons reserve their space and appear on active,
hovered, or keyboard-focused tabs. Existing smart labels and full-title tooltips,
media controls, drag and drop, renaming, and context menus remain available.

At window widths of 640px or less, tools move to a second 36px row, preserving
space for tabs. Split panes retain independent tab strips and an accent line on
the focused pane's active tab.

## Verification

- `npm run lint`: style and TypeScript passed.
- `npm run build`: production build passed.
- `npm test -- --runInBand`: 80 suites / 346 tests passed.
- Electron `browser-ui-smoke.cjs --horizontal-tabs-layout-only`: 1280/900/600/480px
  geometry, adjacent new-tab button, tools separation, scrolling, keyboard
  selection, and light/dark captures passed.
- Electron `--split-only`: independent pane tabs, native focus, new tabs,
  shortcuts, and closing panes passed. Fixed an undefined click-coordinate
  variable in this smoke scenario.
- Electron `--extension-toolbar-only`: real local extension popups, narrow
  layouts, pinning, ordering, and toolbar focus order passed.

Previews are in `docs/evidence/horizontal-tabs/`. These checks use disposable
profiles in the local Electron runtime.
