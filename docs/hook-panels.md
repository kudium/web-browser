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
Structured output supports `text`, `markdown`, `json`, `table` and `status`.
Markdown uses the installed Markdown parser, rejects raw HTML and unsafe links,
and never fetches images. Tables have matching column/cell counts; statuses are
`loading`, `success` or `error`. Plain output and JSON are escaped.

Custom content has `{type:'html', html, css?, script?, data?}`. The native panel
uses a disposable isolated session, sandbox, context isolation, a dedicated
minimal preload and restrictive CSP. It denies network requests, downloads,
frames, navigation into the trusted shell, device permissions and WebRTC network
access. It supports inline styles/scripts and data images, with no Node or app
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
