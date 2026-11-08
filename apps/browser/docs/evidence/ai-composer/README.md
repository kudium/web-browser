# AI composer verification

`node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .erb/scripts/ai-composer-smoke.cjs` renders the production sidebar/pickers/styles with production preload and AI handlers. It uses a disposable profile, local document/image fixtures, and a local deterministic AI endpoint. No personal data or external AI credentials are used.

Reviewed light/dark at 240, 320, 368, and 480px: empty, focused draft, open access/group/model pickers, selected group icons, attached images/documents. Additional captures cover import loading, working/Stop, and error feedback in a short window. Assertions check overflow, aligned controls, popup containment, and footer reachability. Native picker file selection/cancellation is simulated; its OS appearance is unverified.

Functional checks cover native file acquisition, drop/paste, multimodal provider content, document text, secret-free metadata, invalid IDs, explicit human permissions, persisted access/group/model, missing-group fallback, and rejected foreign-window requests. Unit checks additionally cover failed-send draft recovery, byte/count/text limits, Claude conversion, preservation of user images during screenshot tool turns, and preference-file recovery. The reused PDF/DOCX extraction smoke check passes.

Supported: PNG/JPEG/WebP/GIF (static image), PDF/DOCX/TXT/Markdown. Up to eight files, 20 MB per file, 30 MB total. Image understanding requires a vision-capable model. Documents are local text references, capped at 40,000 characters per document and 80,000 combined; originals are not uploaded to the provider. Nothing is automatically saved to Personal Data.

The broader `browser-ui-smoke.cjs --ai-sidebar-only` run passed its initial sidebar alignment, collapse/reopen, Preferences connection, and model refresh checks, then failed the webpage-focus assertion after Take control. That broader browser/handoff suite is not reported as passed. Its initial full-app captures are in `app/`; the composer-specific native suite passed independently.


Compact layout update: attachments are 56px image/file thumbnails above the prompt (40px in short windows). Filename/size hover labels and accessible remove actions remain available. Eight files use one horizontal scrolling strip. Footer controls share one row at 320/368/480px; 240px uses two rows. Focused layout assertions now cover thumbnail order/height and every footer control baseline. Thirteen sidebar recovery/context tests pass; recovery assertions use the attachment's accessible list-item name.

Browser context attachments now share this strip. Tab/group references remain lazy, deduplicate covered tabs, and require an explicit scope change when necessary. Context-specific light/dark captures at 240px and 368px are named `*browser-context.png`; full-app drag sources and real AI page reading are documented in `../ai-context/README.md`. Nineteen focused tests pass.
