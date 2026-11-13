# Apple local AI

Select **Apple Intelligence — Local Mac** in Preferences → Assistant, then save.
Apple is an optional local provider. New configurations default to the first
provider in the list (OpenAI); saved provider choices are preserved.
The model is `apple-on-device`; no API key or Ollama installation is needed.
Refresh models checks whether Apple Intelligence is available.

The AI input’s model dialog includes a **Context window** toggle. It defaults
on for Apple and off for other providers. Choices are saved per provider and
model. Enable it on other models to use the same compact context strategy;
disable it to send their normal context. Turning it off for Apple also disables
compaction and the smaller retry, but the native token-limit check remains.

Requires an Apple Silicon Mac, macOS 26 or later, and Apple Intelligence enabled
with its on-device model downloaded. Unsupported devices and unavailable models
show an error. This provider never falls back to a cloud model.

The packaged Swift helper uses `SystemLanguageModel` with native Foundation
Models `Tool` definitions built from the selected argument schemas. Native tool
calls yield requests to Electron, where the existing browser agent validates
and executes those requests with its normal scope, permissions and approvals.
The helper itself does not execute browser actions. Model inference stays on the
Mac; browser tools can still access websites and services.

Apple receives live focused-tab metadata within the allowed browser scope.
Requests to summarize or explain the current page, or fill its form, first obtain
a bounded page read through the existing executor and permission checks. Actual
tool calls and results are reconstructed as native transcript entries. Matching
receipts from the current turn can satisfy a native tool call without executing
it again; page-read receipts are invalidated after effects. Record identifiers
for local filling come from actual authorized tool results, not invented strings.
After a confirmed secure input request, a form-fill request can use that returned
record directly through the existing executor. No values enter the model.
Three consecutive identical read/clarification steps stop the run before the
third execution rather than repeating indefinitely.

Local requests use a shorter system prompt, a relevant subset of tool schemas,
and a rolling window of conversation text and observations. The full chat stays
in Kudium; an action ledger preserves write identities and abbreviated receipts
in model context to prevent repeated effects. Read observations may be refreshed.
On macOS 26.4 or later the helper counts tokens before inference and reserves
room for the response. An oversized request gets one smaller local retry.
If the write ledger itself outgrows the budget, continuation stops rather than
forgetting actions. Completed actions remain completed. Screenshot
attachments are not supported by this integration. Long workflows may need a
provider with a larger context window.

Development and production builds compile the universal helper through
`.erb/scripts/build-apple-ai.cjs`. Mac builds require a Swift toolchain and SDK
supporting Foundation Models (macOS 26 or later). The binary is included under
`assets/native/kudiumbrowser-apple-ai` through the existing asset packaging.

Run `node .erb/scripts/ai-apple-native-smoke.cjs` from `apps/browser` on an Apple
Intelligence Mac after building the helper. It tests a multi-turn conversation
against the actual local model with disposable tool fixtures: tab identification,
website explanation and a locally authorized form fill. It accesses no real
websites, credentials or vault records.
