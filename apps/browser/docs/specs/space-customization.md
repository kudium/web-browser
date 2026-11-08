# Space customization and sidebar spacing

Implemented November 4, 2026.

- [x] Equal 8 px spacing above and below Favorites.
- [x] Current space icon displayed next to its name.
- [x] Expanded symbol library (22 options).
- [x] Recommended emoji icons and editable emoji field.
- [x] macOS native Emoji & Symbols panel, opened with the emoji input focused and selected.
- [x] Emoji input stores one grapheme, preserving multi-codepoint emoji.
- [x] Existing custom image icon support retained.
- [x] Recommended color swatches and native custom color picker.
- [x] Creation in the browser and Preferences, plus editing existing spaces.
- [x] Custom colors tint the active sidebar and dock icon.
- [x] Emoji and custom colors included in the workspace sync snapshot.
- [x] Native emoji-panel IPC restricted to trusted main-frame UI requests.

System emoji panel uses Electron app.showEmojiPanel on macOS. Other platforms retain recommendations and manual emoji entry. Changing to a recommended symbol clears emoji/image overrides; selecting emoji or an image replaces the other override.

Verification: Electron smoke checks equal Favorites spacing, heading icon, emoji recommendation, native-picker control availability, and saved/applied custom color. The native UI regression verifies the real panel API is invoked only through trusted main-frame requests.

`npx electron .erb/scripts/browser-ui-smoke.cjs --space-customization-only`
