# Web UI controls

The web app uses Radix UI Themes 3, matching the desktop browser: teal accent,
gray neutrals, large radii, a solid panel background and system typography.
`Layout` supplies the theme and serves package CSS locally with a content version.
`public/ui.css` contains layout integration; component appearance belongs to Radix.

Hooks pages use `src/components/web-ui.tsx` for buttons and fields. Import these
controls for new forms rather than adding unstyled native buttons. Button retains
HTML's submit default; set `type="button"` explicitly for actions such as add/remove.

The service renders static React markup with vanilla JavaScript enhancement, not
a hydrated React app. Radix TextField, TextArea and Button render usable native
controls. Select and checkbox deliberately retain native interactions and native
form serialization. Radix's interactive Select/Checkbox require hydration and must
not be substituted into these static forms without adding that architecture.

Dynamic comments and reports clone server-rendered control templates so their
styles match the original page. Keep data attributes on the actual input or
textarea, not the surrounding visual wrapper.

The initial component migration covers the Hooks marketplace, publishing,
comments and moderation. Marketing and account pages retain their existing
custom layouts and controls within the shared theme.

Validation: `bun run check`, `bun test test/hook-ui.test.ts`.

## Hook code editing

`public/hook-editor.ts` progressively enhances hook code fields with CodeMirror 6,
the desktop app's editor engine. Native textareas remain the form source of truth.
Editor changes synchronize into them; imports dispatch `hook-source-replaced`,
and removals dispatch `hook-editor-destroy` before dropping action cards.
The native textarea stays visible if the editor bundle cannot load.

The server bundles this client locally on demand and caches the successful build
in memory. CodeMirror's generated styles use a per-response CSP nonce rather
than allowing unrestricted inline styles. Browser-side syntax highlighting and
local completions work without running user code. Desktop runtime testing,
TypeScript diagnostics and type hovers still depend on the desktop bridge.

## Source validation

Both applications use `packages/hooks/source-validation.ts` with Acorn for strict
async JavaScript bodies and PostCSS for stylesheet syntax. Parsing never runs
hook source. Lifecycle wrappers mirror the runtime's context bindings; actions
are parsed with their separate `context`/`api` parameters. Errors identify the
stage or action and use one-based source line/column positions.

The web checks before publication on both client and server. Browser main-process
checks cover site/global saves, publication, package fetches/imports and test
previews. AI-authored hooks are checked before save review. CodeMirror displays
syntax diagnostics in both applications. Structural validation remains separate.
Runtime errors, missing website elements and external API failures still require
testing on the target website; a syntax pass does not prove correct behavior.
