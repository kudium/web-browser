Restored automatic update checks in signed macOS releases.

- Include the required update metadata before signing, with the correct stable feed for Apple Silicon and Intel. Versions 1.0.18 and 1.0.19 require one manual installation of this release because their updater cannot start.
- Release verification now rejects missing or incorrect update metadata before publication.

- Improved saved-login detection and optional automatic sign-in, including multi-step website login flows and authentication before using protected credentials.
- Autofill suggestions appear when a field receives focus, with an independent setting to keep the manual picker. Saved website accounts take priority over browser-wide profiles.
- Explicit saved-value choices fill the focused field; the form-fill controls remain available for filling matching fields together.
- Refined Personal Data preferences, website and group storage, and independent autofill controls.
- More reliable automatic picture-in-picture when switching tabs or windows, with improved playback-state handling.
- Workspace and sidebar refinements for tabs, groups, collections, colors, and assistant activity.
