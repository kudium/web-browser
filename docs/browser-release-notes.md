More dependable browser panels, autofill, and local AI, with reusable toast alerts and new hook APIs.

- Preserve sidebar content when popups open and when panels close and reopen. Hidden panels pause unnecessary work.
- Improve Apple on-device AI context budgeting and saved-login intent detection, so simple questions do not initiate sign-in filling.
- Refine autofill positioning, hide form-fill actions when no fields match, and support username/email followed by password on multi-step sign-in pages.
- Add compact stacked browser toasts with actions, configurable duration, countdown dismissal and Dismiss all. Low-battery alerts offer Save energy and can be disabled in Performance preferences.
- Add optional Activity toast alerts. Explicit dismissal or using an activity's note/page action marks it read and keeps the timeline and unread count synchronized.
- Expose battery, power, appearance, local connectivity and locale status to lifecycle hooks, with automatic subscription cleanup and shared OS caches. Add a battery/toast example and illustrated documentation.
- Improve hook editor layouts, discoverability of examples, responsive Actions editor sizing and compact controls.
- Add horizontal tab edge fades, give tabs more room, and keep tab selection scrolling local to the strip to prevent workspace jumps.
- Add optional hovered-link URL previews, quieter unsecured-site indicators and tooltips, improved project-file dragging, and flexible custom HTTPS tunnel endpoints for external AI clients.

Native passkey entitlement approval remains pending; this release does not claim new native passkey support.
Versions 1.0.18 and 1.0.19 still require one manual installation of 1.0.20 or later to restore update checks.
