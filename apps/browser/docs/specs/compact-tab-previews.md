# Compact session and folder previews

Implemented 2026-11-05.

## Preferences and behavior

Appearance → **Session tab display** offers **Horizontal tab strip** (default),
**Popup on hover**, and **Popup on click**. Both popup modes remove horizontal
tabs. Header-address mode removes the whole tab row; sidebar-address mode retains
the small browser-tools/drag row. Single-page sessions keep ordinary click-to-open
behavior and never open a redundant page popup.

Hover mode waits 180ms before opening and allows 240ms to cross into the popup.
A focused search field keeps the hover popup open. Click mode opens immediately;
a second click on the same session toggles it closed. Right arrow from a focused
session opens the popup for keyboard use. Click/keyboard opening focuses search;
hover opening preserves the current focus. Escape/outside interaction dismisses
the popup; scrolling the sidebar or changing window focus also dismisses it.

**Preview closed folders on hover** is independently configurable and enabled by
default. A closed folder previews its sessions without mounting the inline list.
Clicking the heading still expands/collapses the folder normally. Down arrow from
a focused closed folder opens its preview. In compact mode, choosing a multi-page
session in a folder preview drills into its pages at the same folder anchor;
**Back to folder** returns to the session list.

## Shared implementation and performance

`AnchoredTabPreview` uses the actual app/folder button as its Radix virtual
anchor. It opens beside the anchor where there is room and underneath it on
narrow windows. Window and anchor resizing update that placement. Lists stay
scrollable and constrained to available viewport height.

One `useAnchoredPreview` controller and timer serve the whole sidebar. Session
pages and folder members are indexed once per app-list change; there is no
per-session popup tree. Popups mount only while open. Fixed-height rows render a
window of seven visible rows with three overscan rows on either side, at most
13 rows regardless of list size. Search covers the full list; arrow/Home/End keys
and Enter can reach records outside the initial window. Only visible-row icons
are decoded, and previewing does not instantiate website views for unseen pages.

The sidebar's mixed-session icon renderer reuses the index and stops after three
distinct icons instead of deduplicating the entire session with nested scans.
Closed folders keep their inline app rows unmounted until expanded.

## Verification

- Whole-project lint and TypeScript pass; production build passes.
- Full unit suite: 85 suites / 372 tests pass.
- Unit coverage includes hover delay/cancellation/gap retention/timer cleanup,
  a bounded 10,000-entry list, keyboard end selection, full-list search, and
  validated/persisted compact-mode and folder-preview preferences.
- Electron `browser-ui-smoke.cjs --compact-tab-preview-only` passes with a
  2,000-page session: hover dwell/gap retention, bounded row count/search,
  single-page suppression, click and second native-click toggle, closed-folder
  drill-down/back/ordinary expansion, keyboard opening and 800/480px placement.
  It checks that previewing does not load all websites. Website-view counts
  distinguish isolated website sessions from the app-owned AI activity layer.
- Captures: `docs/evidence/compact-tabs/`.

These are functional and scale checks, not a full CPU/GPU release profile.
