# Native window materials

TouchBox uses macOS sidebar vibrancy through Electron's native window API.
Electron 45 does not expose a macOS Liquid Glass API; this feature is native
vibrancy with translucent chrome, not a claim of Apple's newer material.

- [x] Reveal native vibrancy through a single translucent workspace tint.
- [x] Remove redundant sidebar CSS blur on macOS; website viewport stays opaque.
- [x] Add subtle address/active-tab surface highlights without animated filters.
- [x] Appearance preference: Glassy sidebar and frame, enabled by default and
  updated live; disabling it paints opaque chrome.
- [x] Respect Reduce Transparency and increased contrast with solid CSS surfaces.
  Existing nativeTheme handling disables vibrancy and tracks OS changes.
- [x] Keep non-macOS chrome's existing material fallback.
- [ ] Visually verify desktop blending, inactive window, light/dark, custom space
  colors, narrow/compact sidebar and accessibility toggles in a packaged build.
- [ ] Evaluate true Liquid Glass if Electron gains a supported native API.

Verification: TypeScript passed. Build and focused runtime checks recorded below
when complete. The effects introduce no timers, extra network requests or animated
blur; GPU performance still requires measurement before making broad claims.

The broader production review remains open: Arc extension placement and menus,
folder interactions, shortcut customization gaps, packaged security review,
performance profiling and evidence-based dead-code removal.

Completed checks: `npx tsc --noEmit`, targeted ESLint, `npm run build`,
settings Jest suite (3 tests), and `--space-title-only` desktop smoke (normal and
narrow layout, collapse, menu and rename). Normal-layout capture visually
inspected. This smoke window does not establish behind-window desktop blending;
packaged material/accessibility verification above remains unchecked.
