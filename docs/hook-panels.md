# Hook panels

Implemented in the development build; no stable installer release is implied.
The website guide is `/tutorials/hook-panels`. Its runnable code comes from the
same `hookPanelExamples` list used by the hook developer editor.

Page hooks use the existing authenticated `site-developer-output` bridge:

```js
await context.panel.show({
  id: 'output', title: 'Hook output', reveal: true,
  content: { type: 'markdown', text: '# Results\nReady.' },
  actions: [{ id: 'refresh', label: 'Refresh' }],
});
context.panel.onAction('refresh', async payload => {
  await context.panel.update({
    id: 'output', title: 'Hook output',
    content: { type: 'json', value: { links: document.links.length } },
    actions: [{ id: 'refresh', label: 'Refresh' }],
  });
  return { refreshed: true };
});
```

Register handlers before revealing output if the action is immediately usable.
`show` and `update` take the same complete payload. IDs are local to the hook/page
instance; `reveal` defaults to false. `close(id)` removes that provider.
With `reveal: true`, the panel picker returns to Auto and opens output belonging
to the current group. Background pages can publish output without selecting a
tab or pinning a group. The group must remain available and the hook must still
be authorized.
Structured output supports `text`, `markdown`, `json`, `table` and `status`.
Markdown uses the installed Markdown parser, rejects raw HTML and unsafe links,
and never fetches images. Tables have matching column/cell counts; statuses are
`loading`, `success` or `error`. Plain output and JSON are escaped.

Custom content has `{type:'html', html, css?, script?, data?}`. The native panel
uses a disposable isolated session, sandbox, context isolation, a dedicated
minimal preload and restrictive CSP. It denies unrestricted network requests, downloads,
frames, navigation into the trusted shell, device permissions and WebRTC network
access. It supports inline styles/scripts, data images and up to 24 explicitly declared HTTP(S) image URLs in `content.images`, with no Node or app
preload bridge. It receives only bounded JSON from its originating hook.

Custom scripts use:

```js
const unsubscribe = kudiumHookPanel.onUpdate(output => {
  document.querySelector('#count').textContent = output.content.data.links;
});
await kudiumHookPanel.invoke('refresh', { reason: 'user' });
await kudiumHookPanel.openLink('https://example.com');
```

Actions must be declared in output metadata and registered with `onAction` in
the page hook. Structured panels render shared action buttons; custom designs
render their own buttons. Handlers retain the original hook's existing scope and
page access; this does not grant new browser capabilities or expose website DOM
to the HTML document. One dispatcher per hook run prevents before/after stages
from racing to answer the same action. Errors are returned to `invoke`; custom
UI should catch them and display feedback. A valid response must come from the
exact source frame, hook, token and live panel/group binding.

HTML/CSS/script form the provider content key. Changing only data or structured
output retains the native view; changing the custom design recreates it. Use
updates without `reveal` to avoid stealing sidebar focus. Hooks do not rerun when
the panel is selected, hidden, switched or docked. Runtime panel data is not saved
across browser restarts or source-page navigation. Hook navigation, replacement,
disabling and locks revoke its output and pending actions. Isolated hook tests
may render preview panels without gaining the ability to save real Notes or
Activity records.

Panels reuse `SidebarPanelRegistry`, the existing Panels page, `GroupPicker`,
`AssistantPageHeader`, `EmptyState`, saved selection, native layout/clipping,
overlay suspension and docking. Auto follows the focused group, even when two
groups share a browser session. A fixed target must match the authorized source
group. Native HTML links use the shared shell link handler with that explicit
group; they cannot silently open in another group or the default browser.

Bounds: ten panels/page, sixty updates/page/minute, 100,000 JSON characters per
output, 32,000 per action request/response, twenty table columns, two hundred rows,
ten declared actions, three pending actions/panel, twenty pending process-wide,
and ten seconds to answer. No extra permission or group storage is introduced.

Verification includes schema/escaping tests, actual generated hook preload
execution and cancellation, native structured/custom rendering, retained input,
declared action round-trips, unauthorized action rejection, CSP/network and
preload isolation, access revocation and the existing shared sidebar regressions.

Every built-in panel snippet is checked against the shared `pageHookBody`
wrapper used by runtime execution and save/publish validation, and against the
actual editor language worker. Do not syntax-check examples with a bare async
function that omits the injected hook variables. Names such as `content` and
`panel` are reserved runtime aliases; use descriptive names such as `panelDesign`
for local UI definitions. Native checks execute all five shared snippets on a
fixture page and exercise their declared actions and retained HTML input state.

AI authoring uses `read_hook_api`, returning the exact shared panel examples and editor declarations. Page hooks can render extracted JSON with `context.panel.show({id:"results",title:"Page data",content:{type:"json",value:data},reveal:true})`. The reference distinguishes lifecycle panel APIs from action workers. AI must inspect the page, preserve existing hooks, validate/test and verify saved/runtime results.

Native hook and extension views reuse the system context-menu builder. Inputs receive editing/spelling actions; selections, links and images receive matching actions. Structured hook outputs offer Copy JSON, Copy table or Copy panel content. Links retain group routing and check current access. Do not duplicate menus or expose shell APIs to panel scripts.

Hook editor instances are scoped to selection and stage to prevent editor transactions crossing hook selections. Keep rapid switching covered by regression tests.

Hook list selection applies to the entire card, including status and padding, while Run, switches and menus retain independent targets. Verify the production list with native pointer events; a simplified editor-only fixture does not cover card hit testing.

The shared **Panel: page media gallery** example scans images (including srcset/picture sources), video/audio source elements and direct media-file links. It deduplicates HTTP(S) URLs, excludes credentials and transient blob/data URLs, and pages through the complete discovered list in batches of 12. Refresh rescans the page. Cards open source links in the originating group. Thumbnails use bounded JPEG snapshots when available. Other picture cards load their actual source URLs through `content.images`; inaccessible/protected images show an error fallback. Audio uses a music card, and unavailable video frames use a play card. Only the explicit image URLs can load, without cookies, authorization or referrer; fetch, script, iframe and other network requests remain blocked. This does not discover hidden media, CSS backgrounds or URLs inside protected streaming players.

Panels inherit the existing resolved browser theme and update their colors without reloading content. Page hooks read the current read-only `context.theme.primary`, `context.theme.frame` and `context.theme.contrast` hex colors. The theme belongs to the owning browser; no workspace identifiers are exposed. Read `context.theme` again in later callbacks to obtain updated values. For example:

```js
await context.panel.show({
  id: 'theme', title: 'Browser theme', reveal: true,
  content: { type: 'json', value: context.theme }
});
```

Custom panel CSS can use `var(--kudium-primary)`, `var(--kudium-frame)` and `var(--kudium-primary-contrast)`; these update automatically. Links and gallery icons inherit neutral content text by default, following the light/dark appearance. Use `a { color: var(--kudium-primary); }` only when a custom design explicitly needs the primary color. Custom JavaScript can subscribe with `kudiumHookPanel.onThemeChanged(colors => { /* redraw with colors.primary */ })`, which returns an unsubscribe function. Reuse the browser theme resolver and its change subscription; do not introduce a separate panel palette or theme store.


### Shared form styles (development build)

Custom HTML can opt into the browser's compact controls without copying CSS:

```html
<div class="kudium-form">
  <label class="kudium-field">
    Search
    <input type="search" placeholder="Enter a keyword">
  </label>
  <label class="kudium-field">
    Format
    <select><option>Summary</option><option>Details</option></select>
  </label>
  <label class="kudium-field">
    Notes
    <textarea rows="3" placeholder="Optional notes"></textarea>
  </label>
  <p class="kudium-hint">Only data provided by your hook is available.</p>
  <button type="button" class="kudium-button kudium-button-primary">Refresh</button>
</div>
```

`kudium-form` adds compact spacing and styles text inputs, dropdowns and textareas.
`kudium-field` groups a visible label with its control; `kudium-hint` styles helper
text. `kudium-button` supplies a neutral action; add `kudium-button-primary` for
the main action. Controls support keyboard focus, disabled states and
`aria-invalid="true"`. Connect validation text with `aria-describedby`. These
classes are optional; custom CSS is applied afterward and can override them.
Buttons still need the existing action bridge or custom event handlers.

## Remembered progress and page navigation

`context.panel.saveState(id, value)` saves JSON to encrypted local browser storage.
`loadState(id)` returns the last value or `null`; `clearState(id)` deletes it.
Main derives the profile, tab group, website origin and hook id from the approved
run; scripts cannot select another scope. State survives reload/restart and code
updates that retain the same hook id. It is local, not synchronized, and does not
restore a panel automatically: load state and publish the panel when the hook starts.
Ten ids per hook/website/group, 32 KB UTF-8 JSON per value; operations share the
sixty-per-minute panel budget. No plaintext fallback; previews cannot persist.
Handle unavailable storage with in-memory state. Deleting the panel does not erase
saved progress; call `clearState` explicitly. A newly installed copy has another id.

The shared **Panel: page navigator with saved progress** example adds search,
heading links, hover/focus highlighting, page-selection context and Reset progress.
It stores only the search query and selected heading. Source elements stay in the
page hook; the isolated panel receives labels and indices. DOM highlights are
removed on cleanup. Inputs/results remain intact on close/reopen; saved query
and chosen heading restore after navigation or restart when the hook runs again.

## Installed global hooks in the picker

The panel picker has **Active** and **Global hooks** views. Active lists existing
output; Global hooks lists installed hooks matching the current webpage. Clicking
an enabled lifecycle hook runs it in that page; action-only hooks remain context
menu actions. Off/disabled hooks explain their status and retain Manage, opening
the exact global editor and its original scope. Global execution reuses the normal reviewed
runtime and never runs a hook in a different panel-pinned group.

Installation offers **Auto · enable separately on each website** for All groups
hooks. Auto starts with an empty website allowlist. Hook Developer’s Global hooks
switch immediately adds/removes the current website. Global master switches
still override website choices. Existing installations retain their behavior;
updates preserve Auto mode and the allowed/excluded websites. Auto can also be
changed in the global editor, with an Enabled websites list.

The global hook editor keeps **Enabled globally** and **Auto** in the editor header. Both switches save immediately without saving unfinished code or name edits. Global disable takes precedence over individual website settings; Auto starts off for websites until enabled individually. The shared footer options menu contains Publish, Check for updates, and **View all global hooks**, which opens Preferences → Hooks.
