# Using page hooks

Open a page’s Developer tools and choose **Presets** to enable an enhancement.
Each preset becomes its own named hook. Re-enabling it preserves any code edits.
Color presets accept a hex color; visual effects can vary by website.

**Save hooks** saves without executing. It stops the site’s previous executions
so outdated code cannot keep creating outputs. **Save & Run** saves first, then
reloads the page. Failed saves never start execution. Disabled hooks offer an
explicit Enable & Run confirmation. Page targets apply on document loads and
same-document navigation, including back/forward and SPA routes.

Before load runs only on a new document; its DOM may not exist yet. Route changes
clean up previous work, reapply matching CSS, and rerun matching after-load code.

Hook enable/disable switches save immediately; website editor switches also save
the current validated draft. There is no separate Save step for a switch. Use
Play to run an enabled hook on the current page without reloading. New marketplace
installs are enabled by default. Updating preserves the installed hook’s enabled
state and exclusions. A previously disabled global master switch stays disabled.
Exploring the marketplace closes the installer; a retained native editor is hidden
so a returning install link can open visibly in the browser or Preferences.

## Global hooks and website exceptions

In a website’s Developer hook list, the switch beside a global hook enables or
disables it for that hostname only, across HTTP and HTTPS. The hook remains
installed, and excluded hooks stay visible so you can enable them here again.
Other websites keep their existing behavior. Exact hostname exclusions do not
include subdomains; manage wildcard exclusions in the global hook editor.

Use **Disable everywhere** in the hook’s options, or disable it in Global hooks,
to stop it throughout its installed scope. **Enable everywhere** restores the
global switch while preserving website exceptions. A website switch cannot
bypass a disabled global hook or the global master switch. Deleting the global
hook removes it throughout its scope, including its website exceptions. An
All groups hook covers every group; a narrower hook covers its session only.
Separately installed copies remain independent hooks.

## Work that stops cleanly

Timers created inside a hook with `setInterval` or `setTimeout` are owned by that
execution. They require function callbacks. Prefer `context.listen` for event
listeners. Register cleanup for DOM effects and observers:

```js
const badge = document.createElement('span');
badge.textContent = 'Hook active';
document.body.append(badge);
context.onCleanup(() => badge.remove());

context.listen(document, 'click', (event) => log(event.type));
context.setInterval(() => log('Still watching', context.url), 5000);

const observer = new MutationObserver(() => log('Page changed'));
observer.observe(document.body, { childList: true, subtree: true });
context.onCleanup(() => observer.disconnect());
```

`context.signal` is aborted when an execution stops. Use it with `fetch` and
check it before applying results after an asynchronous operation.
`context.runId` identifies the hook stage execution. Callbacks must finish their
initial setup within ten seconds; register ongoing work instead of awaiting an
endless loop. Cancellation does not forcibly interrupt arbitrary synchronous
JavaScript or reverse DOM mutations without registered cleanup.

## Errors, AI and recovery

Run output identifies the hook and stage. Runtime stack traces from hook code
offer **Go to line**; syntax problems are also marked by editor diagnostics.
**Fix with AI** opens the assistant with the selected source and recent errors.
**Ask AI** lets you describe an outcome, such as a price-change alert.

Both actions prepare a prompt; you submit it in the assistant. AI uses the
existing site customization tools. Changes require local review, with a diff
of source, enabled state and page targets. Approval saves the configuration;
generated code is not automatically run by these editor actions.

**History** previews previous versions and restores only the selected hook.
Restoration preserves its current enabled state and leaves other hooks alone.
History retains ten recent snapshots plus the latest successfully executed
snapshot for each hook, with a maximum of 31 snapshots per site. Successful
setup is not a guarantee that a long-running monitor will continue to work.

## Verification

Runtime, storage, editor and review tests live in `apps/browser/src/__tests__`.
The native smoke test exercises the actual Electron sandboxed preload against
an isolated local fixture:

```sh
cd apps/browser
npx electron .erb/scripts/hook-runtime-smoke.cjs
```

It uses a temporary profile and verifies route matching, back navigation,
owned timers, CSS removal and cleanup without touching the user’s browser data.

## Sidebar output and custom designs

Page hooks can publish structured output or sandboxed HTML through
`context.panel.show`, `update`, `close` and `onAction`. Reuse the existing Panels
sidebar and group picker. See [hook-panels.md](hook-panels.md) for the API,
permissions, lifecycle and limits. The hook developer Examples list includes
Markdown, link tables, JSON, status/actions and a custom HTML dashboard. These
APIs are implemented in the development build and require a future stable release.
