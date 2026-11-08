# Sidebar spaces and motion

Implemented November 4, 2026.

## Arc observation

Inspected Arc’s native sidebar and selected another space using its bottom dock. The sidebar exposes a horizontal scroll collection containing space content and a separate shared dock. Synthetic native scrolling did not reproduce Arc’s trackpad gesture, so the precise gesture thresholds and animation timings were not verified. TouchBox uses its own deliberate horizontal gesture recognition.

## TouchBox behavior

- [x] One sidebar sequence: Downloads, History, then user spaces.
- [x] Downloads and History are built-in sidebar spaces with a separate System spaces group at the left of the dock.
- [x] Remove top close control and separate library tab bar.
- [x] Clicking an active built-in space icon returns to the underlying browsing space.
- [x] Dock selection and existing next/previous-space keyboard bindings use the same sequence.
- [x] Trackpad horizontal wheel gestures and touch swipes navigate the sequence.
- [x] Vertical scrolling and pinch zoom retain their existing behavior.
- [x] Gesture accumulation requires deliberate horizontal motion.
- [x] Momentum is latched until the gesture pauses, preventing rapid page skipping.
- [x] Live frame-scheduled movement follows horizontal gestures without rerendering the page on every delta.
- [x] Snap immediately at the horizontal threshold; subthreshold gestures return after a 90 ms pause.
- [x] Coordinated outgoing/incoming 140 ms composited slides replace threshold jumps.
- [x] Outgoing snapshots are inert, hidden from accessibility, stripped of duplicate IDs and released after the transition.
- [x] Reduced-motion preference disables movement and transitions.
- [x] Websites retain their current browser sessions when built-in spaces are selected.
- [x] Built-in spaces do not become removable organizational spaces or cookie profiles.

Verification: 82 unit tests passed, production build, TypeScript and focused lint passed. Electron smoke checks verify user-space and built-in-space navigation, vertical scroll exclusion, momentum latching, dock toggles, keyboard wrapping, responsive widths and reduced motion. Download sidebar regression retains history and clear behavior.

Run after building:
`npx electron .erb/scripts/browser-ui-smoke.cjs --sidebar-navigation-only`
`npx electron .erb/scripts/browser-ui-smoke.cjs --downloads-sidebar-only`

Shared form controls: the address bar and library search use FormInput; SearchControl and SelectControl reuse the same rounded surface and focus styles. Native select controls retain keyboard and OS menu behavior.

Footer refinement: one System spaces button on the left; user spaces occupy the remaining dock. The button toggles the last system page. Its context menu and the system-page title menu provide Downloads, History, Settings and Create Space actions. Footer smoke: `--sidebar-footer-only`.

Footer: user-space icons are centered, divider borders removed, and a reserved Create Space button appears on footer hover or keyboard focus. Touch interfaces keep the button visible.

## Drag between sidebar sections

- [x] Move sessions between Favorites, Pinned, and Regular sections in both directions.
- [x] Provide drop targets and hints while dragging, including empty sections.
- [x] Dropping on a vertical item updates section status and order.
- [x] Section changes preserve URLs and login partitions and clear folder membership.
- [x] Verify bidirectional section drops in Electron and status/session preservation in unit tests.

Vertical rows represent sessions; section placement applies to their tabs together. Dragging an individual page onto a section also places its existing session there without changing its cookies.

## Drag motion polish

- [x] Prevent drag hints and the new-session target from shifting the sidebar layout.
- [x] Use a compact native drag preview and dim the source item.
- [x] Show insertion lines on item targets and subtle section highlighting.
- [x] Animate displaced rows to their new positions over 180ms, respecting reduced motion.
- [x] Clean up the drag preview on drop/cancel/unmount.
- [x] Desktop regression verifies stable space heading during drag, preview cleanup, and bidirectional section drops.

### Crowded list layout correction

- [x] Keep section containers and list controls from shrinking below their contents; the full list scrolls instead.
- [x] Preserve consistent spacing within pinned and regular sections.
- [x] Restrict position animations to drag completion and cancel previous motion before measuring layout; ordinary tab metadata updates do not animate rows.
- [x] Desktop regression with 18 extra sessions verifies no overlapping rows/divider controls, full section heights, and correct scrolling; section drag regression still passes.
