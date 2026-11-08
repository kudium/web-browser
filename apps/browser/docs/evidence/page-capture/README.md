# Page capture and PDF export

Site settings now has a compact Capture menu (Capture area, Visible page, Full page) and Save PDF. The preview offers Copy and Save image, with a frozen selection surface, keyboard area selection/movement/resizing, and image-pixel crop coordinates that account for screen DPI and page zoom. Failed or canceled saves preserve the preview. Capturing never clicks or injects controls into the website.

The user-facing service reuses the AI's compositor/protocol PNG helper; AI payload limits remain unchanged. Full-page images use a bounded Chromium clip without scrolling, capped at 40 megapixels and 32,767 pixels per side. PDF export uses Chromium's print layout and includes print backgrounds. Images are window-owned, held locally in memory with a five-minute expiry, and removed on dismissal or window closure. Only the native save chooser supplies output paths; IDs/crop bounds and window/main-frame ownership are validated in the main process.

Verification:

```sh
TOUCHBOX_SMOKE_OUTPUT=docs/evidence/page-capture \
node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
.erb/scripts/browser-ui-smoke.cjs --page-capture-only
```

This renders the production app using disposable storage and a local long-page fixture. It verifies real mouse area selection without page clicks, actual red webpage pixels in the crop, PNG dimensions, clipboard payloads, native save cancellation and errors, full-page content below the fold, unchanged scroll position, 1.5× zoom, PDF print-only text and below-fold content, and rejected foreign-window requests. Screenshots cover 1160px/480px in light/dark, open capture menus, focused/selected previews, loading and save errors. PDF text is checked using the installed local parser.

Nineteen focused tests pass across capture service, capture preview, site settings and the reused AI screenshot helper. Nine additional browser lifecycle/request tests pass. TypeScript, targeted ESLint and production build pass. Native save chooser responses use disposable paths and cancellation stubs; the OS dialog appearance was not reviewed. Browser research used Arc's official release notes and the user-provided toolbar image; the Arc desktop app was not operated.

The initial clipboard smoke test copied a cropped fixture image, then failed to restore the previous clipboard item because Electron 45 refuses writing items directly returned by read(). Its prior clipboard contents could not be restored. The corrected test reconstructs all MIME payloads into new ClipboardItem instances before copying, and its subsequent restoration checks passed.
