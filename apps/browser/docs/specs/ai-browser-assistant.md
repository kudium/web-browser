# AI browser assistant

External AI control is available through the local MCP server without a Kudium Browser model API key. Setup, tools, access revocation, and the stdio bridge are documented in `mcp/README.md`. The sidebar keeps only the composer, a short empty state, and the current action; configuration and external access live in Preferences.

Drag the AI panel’s left edge to resize it. Its width is saved locally and adapts to available window space. With the handle focused, arrow keys resize (Shift makes larger steps), Home/End select the minimum/maximum, and Enter or double-click restores the default.

Open the sparkle button in the top-right browser toolbar. The right sidebar can collapse without losing its current task or transcript. The sidebar settings button opens Preferences → AI assistant. Choose a provider, enter its API key, and select a model there. Refresh models queries the provider’s model catalog; a manual model ID is available when discovery is unsupported. Save settings, return to the sidebar, and describe a task. Enter submits; Shift+Enter adds a line. Stop cancels the current run. Each new task starts with fresh model context; the sidebar keeps its visible transcript until the window reloads.

Provider presets include OpenAI, Google Gemini, Anthropic Claude, DeepSeek, Alibaba Qwen, Moonshot Kimi, Z.ai GLM, MiniMax, xAI Grok, Mistral, and OpenRouter. Claude uses native Messages with tool blocks; the other presets use OpenAI-compatible Chat Completions with function calls. Endpoint overrides support regional/workspace URLs (including Qwen), and custom model IDs remain available. Preset IDs are starting points: refresh the catalog or enter a tool-capable model enabled for your account. No temperature override is sent, and provider reasoning fields are preserved between tool turns. Tasks and extracted webpage text are sent to the configured provider. No live provider credentials are included in tests.

The assistant lists open tabs, reads page text and visible interactive elements, opens tabs sharing the current tab's session, selects tabs, navigates HTTP/HTTPS pages, goes back, scrolls, clicks, and fills standard inputs, text areas, selects, and content-editable fields. Newly opened tabs reuse the current space and profile. Sleeping tabs should be selected before reading. Each run is limited to 30 provider turns, with a 90-second timeout per provider request.

Clicks and typing require a native confirmation showing the site, target element ID, and proposed text. Read-only inspection, scrolling, tab creation, and navigation proceed automatically. Stop prevents future actions; actions already performed cannot be undone by stopping. API configuration cannot change during a run.

Keys are held in the main process and are never exposed by the settings response. Session-only keys are not written to disk. Optional remembered keys use Electron safeStorage; plaintext storage backends are rejected. Remove key deletes the stored credential. Configuration IPC accepts the trusted main window and dedicated Preferences window, always restricted to their main frames. Browser execution IPC accepts only the main window. Configuration and session-only keys survive closing and recreating the browsing window during the same app session. Model tool arguments are validated data passed into fixed page programs; the model cannot execute arbitrary JavaScript. Website content is labeled untrusted in the agent instructions.

Current limits: no screenshot-based computer vision, cross-origin iframe traversal, shadow DOM traversal, arbitrary app-settings automation, file uploads, password entry, or CAPTCHA solving. Dynamic controls can become stale and require a new page read. Provider instructions cannot guarantee immunity to prompt injection; native approval remains required for page mutations. Success is checked through subsequent page reads when the model follows its instructions.

Validation:

- `npm test -- --runInBand` runs unit tests including page actions, stale targets, password blocking, and URL validation.
- `npm run build` builds both Electron processes.
- `npx electron .erb/scripts/mcp-smoke.cjs` tests the official MCP client, page tools, screenshots, approvals, local authorization, cancellation, token rotation, and the stdio bridge without a model API key.
- `npx electron .erb/scripts/ai-smoke.cjs` uses a local deterministic provider and real Electron pages to test the tool loop, approvals, tab session sharing, navigation, stop, key removal, and IPC isolation.
- `npx electron .erb/scripts/browser-ui-smoke.cjs --ai-sidebar-only` verifies the compiled sidebar at normal and narrow window sizes, including collapse/reopen and page bounds.
- Both desktop checks are included in `npm test -- --desktop`.

## Snapshot targeting

Read results include a snapshotId and element IDs. Pass both to click/type. A new read invalidates the old snapshot, and changes to target identity, label, destination, type, role, or disabled state reject the action. The same snapshot is checked again after approval. Legacy numeric-only clients capture the current snapshot before approval; use explicit snapshot IDs to prevent ambiguity across reads. Target storage lives in isolated world 1004, separate from webpage scripts.

Nested open shadow roots are included. Select elements expose option values and disabled state; type uses an enabled option value. Targets scroll into view before interaction. Closed shadow roots and frame traversal still require further work.

## Keyboard actions

press_key accepts tabId, elementId, snapshotId and key. Examples: Enter, Escape, Tab, ArrowDown, Shift+Tab, Control+A, Meta+A. Use Meta+A on macOS or Control+A elsewhere for select-all. Letters and digits are supported for single-key input; type remains the efficient way to fill a complete value. All key actions require approval and target focus validation. Password/file inputs are blocked, including fields that change to password during focus. Events use Chromium protocol input and are verified as trusted in real Electron fixtures.
