# AI cursor and movable activity popup

The existing isolated activity layer now displays a virtual AI cursor from trusted pointer commands. It supports movement, click feedback, drag/scroll positions, idle fading, and reset on tab changes, completion, and takeover. Embedded-frame coordinates are translated to the top-level viewport; page zoom is applied before presentation. Website events cannot drive the cursor.

Move the popup using its grip. The focused grip also supports arrow keys and Home to restore bottom-center placement. Its position is retained while the activity layer exists and clamped after resizing. Only Take control interrupts the AI; dragging, typing other keys, clicking the overlay, and scrolling do not. The popup remains above the virtual cursor. Reduced-motion preferences disable animation.

Verified with a disposable Electron profile and local pages:

- Native input drag, keyboard movement/reset, resize bounds, cursor movement/click/idle states, tab isolation, resumed-state cleanup, Take control, and underlying page-input isolation.
- Actual rendered light/dark views at 700, 400, 320, and 240 CSS pixels; focus and reduced-motion presentation.
- 36 tests across protocol, iframe geometry, handoff, and input guard suites; TypeScript and targeted ESLint.
- End-to-end visible browser-action smoke passed, including activity and follow-up context.

Screenshots composite the actual page and isolated overlay captures because BrowserWindow.capturePage returned an empty image for this child-view-only fixture. Native input used Electron sendInputEvent; physical OS mouse routing was not exercised in this run. Embedded-frame translation is covered by focused tests; a new full-app zoomed-frame visual scenario was not run.
