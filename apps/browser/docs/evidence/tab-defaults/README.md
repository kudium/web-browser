# Horizontal tab defaults

Pinning captures the live URL in `tabDefaultURL`. The existing native tab context menu adds “Set current URL as default”; it is disabled when the current URL is already the default. Unpinning preserves the default. New pages created from a tab inherit neither its horizontal pin nor its default.

Unloaded tabs load their default URL before considering the last location. Default tabs discard their saved history and scroll position on sleep. Unload Group clears navigation histories for all successfully unloaded tabs, including tabs that were already sleeping. Tabs without defaults reopen at their last location. Cookies and browser-wide browsing history are preserved. Cancelling an unsaved-changes prompt preserves the live page and navigation history.

Verification: 18 focused tests, targeted ESLint, TypeScript, and production build passed. `node node_modules/electron/cli.js .erb/scripts/tab-defaults-smoke.cjs` passed against actual Electron views and the production renderer, with disposable profiles and a local HTTP server. It exercises live-URL pinning, explicit defaults, unpinning, lazy wake, clean navigation histories, automatic sleep, already-sleeping group tabs, cancellation, cookie retention, and persistence after renderer reload. Native menu labels and enabled states are asserted; native menu appearance is not included in window screenshots.
