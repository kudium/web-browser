# Hook actions

Hooks can contain page lifecycle scripts/CSS and context menu actions. Both local and global hooks use the shared Actions editor. Enabled state, website/path restrictions, global exclusions and group locks apply to actions.

## Portable contract

Packages with actions use `schemaVersion: 2`. Lifecycle-only version 1 packages remain supported. Publishing, importing, updating and the website creator preserve action declarations.

```json
{
  "id": "save-selection",
  "name": "Save selection as note",
  "contexts": ["selection"],
  "source": "api.notes.create({title: context.title.slice(0, 120) || 'Selection', body: context.selection || ''});"
}
```

`name` is plain text, never HTML or executable code. `contexts` are static visibility rules: page, selection, link, input or password. Opening a menu never evaluates handlers. Choosing the item authorizes the action’s scoped APIs; there is no permission checklist or extra run confirmation. Older packages’ `permissions` declarations are accepted for compatibility and have no effect. Newly published packages omit them.

## Context and API

Handlers receive `context` and `api` as an async function body. Context includes the clicked page’s URL/title, selected text (up to 30,000 characters), visible page text (up to 100,000), and a link when relevant. On editable fields, `context.field` and `context.form.fields` describe up to 50 visible editable fields in the clicked form, or only the clicked field when it has no form.

Each field includes an invocation-local `key`, type, label, name, ID, placeholder, autocomplete, required state, length limits and pattern. Text fields also include their current `value`, bounded to 10,000 characters. Password values are excluded. Labels, values and page content are untrusted website data. Saved credentials, browser stores and DOM objects are not supplied to handlers.

| API | Behavior |
| --- | --- |
| `api.showResult(text)` or `return text` | Show a plain-text result |
| `await api.personalData.request({ fields })` | Compatibility alias for `api.input.request`, mapping each field to Personal Data. New scripts should use the unified API. |
| `await api.input.request({ title, fields })` | Show grouped, labelled, typed fields with optional Personal Data filling and user-controlled remembering. Returns keyed strings, or `null` on Cancel. |
| `api.personalData.fill()` | Open the local saved-field picker and fill the clicked text input. Saved values never enter the handler. HTTPS and existing Personal Data autofill settings apply. |
| `api.personalData.saveForm()` | Review and save filled fields from the clicked form into Personal Data. Passwords are captured by the browser and never enter the handler. |
| `api.field.fill(text)` | Fill the clicked text field |
| `api.form.fill([{key, value}])` | Fill captured text fields by keys from `context.form.fields`, without submitting the form |
| `api.passwords.fill(text)` | Fill the clicked password field with your script’s own password |
| `api.passwords.generateAndFill()` | Generate a cryptographic password (24 characters by default, adjusted to the field’s length limits) and fill the clicked password field |
| `api.ai.compose(prompt)` | Prepare the built-in AI composer’s draft; the user submits it |
| `api.notes.create({title, body})` | Save a note in the clicked group’s scope |
| `api.activity.create({title, message})` | Create activity linked to the hook and page |

Output methods queue commands and return no private data, note IDs or AI responses. Awaited input requests return only the values the user explicitly shares. The browser validates commands and applies them after the handler finishes. Normal notes and activity creation do not show confirmation dialogs. Test windows preview AI drafts, notes and activity without submitting or saving; field fills apply to the disposable test page.

## Custom scripts

### Save a filled form

The default **Form tools** hook includes **Save form to Personal Data** on the page and on text or password inputs. Custom actions can use `api.personalData.saveForm();` with `contexts: ["page", "input", "password"]`. Like other output APIs, it queues a browser-owned operation and returns no saved values or IDs.

The shared glass review lets users name the item, select fields, edit ordinary values, and choose fill mappings using the same matcher as Personal Data. Ordinary details can be restricted to the current website or reused on other websites within the saved group scope. Private fields force website restriction; passwords are masked in the review and remain in the main process. A selected password creates a login record, with username/email where unambiguous; other fields are saved alongside it. Equal confirmation passwords are stored once. Choose one password if a form contains different passwords. AI access defaults to off.

On a page click, the browser finds filled forms: one form opens directly, while multiple forms use the shared searchable picker. Inputs outside a form appear together as Page fields. On an input click, only its form is considered (the clicked field alone when it has no form). Only visible editable fields in the selected form are captured. Empty fields, fields exceeding 4,096 characters, one-time codes, token fields and card security codes are excluded. Up to 30 selected fields can be saved. Saving requires HTTPS, an unchanged page/form and an unlocked group. Screen lock or Personal Data lock cancels the review. Cancel saves nothing. Test windows preview the operation without saving. Existing deleted Form tools hooks stay deleted, and the new action is added once to existing defaults without changing their enabled state or other actions. Existing unmodified Save form actions are updated to support page clicks; deleted or customized actions remain user-owned.

Examples are starting points. Scripts can branch on the website URL, labels, current text values and field rules, calculate content, or generate passwords using Web Crypto.

```js
const values = (context.form?.fields || []).flatMap(field => {
  const label = `${field.label} ${field.name}`.toLowerCase();
  return label.includes('email') && field.type !== 'password' && !field.value
    ? [{ key: field.key, value: 'hello@example.com' }]
    : [];
});
if (values.length) api.form.fill(values);
```

The built-in generator keeps its password in the main-process filling path. Custom passwords exist in the handler and its private command queue; that queue is not logged. The website receives values that the user chooses to fill.

## Execution boundary

`main/hookActionSandbox.ts` runs handlers in dedicated workers inside disposable sandboxed Chromium renderers, with no preload, Node, target DOM, browser IPC or network. Execution is limited to five seconds outside browser input waits and ten bounded commands. Up to three sequential input requests may be awaited; the entire sandbox run has a 125-second deadline (five seconds of execution plus at most two minutes for interaction). Unknown commands and malformed data are rejected regardless of the script.

`main/hookActions.ts` checks page navigation, enabled action source, group identity/scope and locks before effects and after asynchronous work. Opening a replacement menu invalidates the earlier invocation. Embedded-frame actions are currently unsupported.

`main/hookActionField.ts` captures exact fields in an isolated world. Writes check invocation tokens, document URL, field connection/type, form ownership, labels/rules, editable state and length limits. Form fills preflight all targets and recheck before each write. If a page event changes a later field, remaining writes stop; earlier writes are not rolled back. Current values are read separately from metadata so filling a field does not itself invalidate the invocation.

## Extending the API

Add a bounded command validator in `packages/hooks/actions.ts`, an API method in the sandbox and a main-process handler. Update language declarations, docs and boundary tests. New capabilities should reuse click authorization when they only act on the clicked page or group. Capabilities that access another account, external destination or privileged browser data need their own narrowly scoped contract. A general IPC client, vault object or unrestricted fetch should not be exposed to scripts.

Toolbar, keyboard or scheduled triggers can reuse the broker after defining their own invocation context; they do not automatically inherit a context-menu click.

## Verification

From `apps/browser`: `npx tsc --noEmit`, the hook Jest suites, and `npx electron .erb/scripts/hook-action-smoke.cjs` for real Chromium sandbox and field-binding checks.

From `apps/web`: `npm run check` and `bun test test/hook-marketplace.test.ts`. Database integration tests require a dedicated `TEST_DATABASE_URL`.

## Built-in browser hooks

“Form tools” is an enabled, action-only global hook available in All groups. It contains Generate password (password inputs) and Fill from Personal Data (text inputs). Nothing runs when a page loads or a menu opens. You can edit, disable, exclude websites or delete it in Global hooks.

The defaults are inserted once for new and existing profiles without replacing custom hooks or turning on a disabled master switch. Deleting a default is remembered across restarts. The Personal Data action uses existing scope inheritance, hidden-record overrides, origin restrictions and autofill settings. The shared picker opens directly as a grouped, searchable list of saved field names, prioritizing matching labels/autocomplete. Selecting a value fills the captured input immediately, without a second confirmation button. Saved values are resolved and revalidated in the main process after selection; this direct picker receives only field names and item names. Protected password/token/payment fields are excluded. Personal Data is not filled into test windows.

## Awaited user input

Use `api.input.request()` when a script needs values before preparing an output. It supports both custom answers and existing Personal Data in the same editable form. Requests run when the action is clicked, never while building its menu; queued output commands apply only after the handler finishes successfully.

```js
const data = await api.input.request({
  title: "Complete your profile",
  fields: [
    { key: "firstName", label: "First name", group: "Profile", required: true, personalData: "firstName" },
    { key: "email", label: "Work email", type: "email", group: "Profile", required: true, personalData: "email" },
    { key: "question", label: "What would you like help with?", type: "textarea", required: true },
  ],
});
if (!data) return; // Cancelled.
api.ai.compose(`${data.question}\n\nProfile: ${data.firstName} (${data.email})`);
```

The browser always identifies the receiving hook/action and website. The optional `title` (up to 120 characters) names the form. Each field supports:

| Property | Behavior |
| --- | --- |
| `key` | Unique returned key, up to 60 characters; starts with a letter, then letters, numbers, spaces, underscores or hyphens. Prototype keys are rejected. |
| `label` | Custom display name, up to 120 characters. Defaults to a readable version of the key. |
| `type` | `text` (default), `email`, `tel`, `url`, `number`, `date`, `textarea`, `password`, or `select`. |
| `group` | Optional visual section heading, up to 120 characters. It does not select a browser space or Personal Data profile. |
| `required` | Optional boolean, default false. Continue shows a short inline error for missing required values or invalid input types. Cancel is always available. |
| `placeholder` | Optional input hint, up to 200 characters. |
| `personalData` | Optional saved-field matching key, such as `firstName`, `email`, or `shippingCity`. The schema is not limited to built-in profile keys. |
| `options` | Required for `select`: up to 50 unique `{ value, label }` options. |

Returns exactly the requested keys as strings (including numbers and dates), up to 10,000 characters each and a 100,000-character total bound. Optional fields may be empty. One to ten fields may be requested. String shorthand such as `fields: ["question"]` remains supported. `api.personalData.request()` is a compatibility alias that sets a Personal Data mapping for each field; new examples use the unified API. Direct `api.personalData.fill()` still fills the clicked field without disclosing saved values to the script.

### Saved values and custom answers

With `personalData`, an unambiguous matching saved field prefills the browser-owned input. Every mapped field groups its input and Personal Data button in one control. The custom picker searches eligible saved item and field names, prioritizes matches, and offers other saved values for explicit selection and editing. Results render in batches of forty; search covers the full eligible library, rather than only the first thirty suggestions. Missing matches add no explanatory text beneath the field. Unavailable or locked data is explained inside the picker when opened. Every value remains editable. Secret/protected fields and saved passwords are excluded; password inputs cannot have a Personal Data mapping. Existing HTTPS, site origin restrictions, space scope, authentication and manual-autofill settings apply. If saved data is unavailable, the user can enter custom text. No saved values reach the handler before Continue. The user may intentionally include shared values in an AI draft, note or other output.

A successful OS authentication for Personal Data is reused for the browser session, including across Preferences windows and hook actions. Screen lock, sleep, browser quit, or explicitly locking Personal Data clears that authentication. Cancelled or failed checks are never remembered, and a check completed after locking cannot unlock the new session. Protected groups keep their separate authentication.

Chosen saved fields are revalidated when continuing. Navigation, vault locking, a changed record, or a changed/disabled action prevents stale values from being delivered. Test windows use custom sample input and do not load or remember real values.

### Remembering answers

When secure local storage is available, eligible fields offer **Remember this value**, off by default. Remembering is controlled by the user, never requested automatically by a script. Answers are encrypted at rest and scoped to the browser profile, space, website origin, hook, action and action source. Changes to the field definition also prevent reuse. Password fields are never remembered.

On reopening the same action, remembered answers prefill locally and still require Continue before sharing. Uncheck Remember and continue to remove a stored answer. **Clear remembered answers** clears previously remembered inputs and their checkboxes; Continue commits the removal. Cancel preserves existing remembered answers. Remembered copies have their own lifetime: forgetting a value in Personal Data does not delete a copy the user explicitly chose to remember here.

### Runtime and reuse

Always await requests sequentially and handle `null` before emitting outputs. Invalid requests or revoked data throw. Up to three requests are permitted, with five seconds of execution outside input waits and a 125-second overall deadline. Aborted/timed-out runs cannot apply queued commands.

The shared contract and validators in `packages/hooks/actions.ts` enforce field definitions and response types. `hookActionSandbox.ts` brokers only known request kinds through the isolated worker's local renderer state, with no app preload or general IPC. `browserInput.ts` supplies the reusable form flow; `dialogs.ts` renders shared text/select controls and inline validation; `hookInputMemory.ts` provides browser-owned encrypted remembering. Future AI input consumers can reuse this service with their own recipient identity and cancellation signal. This does not enable AI access automatically.

The Personal Data manager is a saved-item library. Fill from Personal Data is available on website fields; the manager no longer has a Fill into tab selector or row Fill buttons. Notes appear in the Notes tab. Saved-item actions are icons shown on hover or keyboard focus, and autofill/access switches use the shared settings popover.

## Creating hooks with the built-in AI

Describe the result in Chat, for example “Create a global hook with a Selection action that saves the highlighted text as a note” or “Create a hook for this website that asks for my profile details and fills the email field.” AI discovers the hook tool family and reads the complete API declarations used by editor completion/hover, together with the same action templates shown in the Actions builder. The full reference is loaded on demand, rather than included in every chat request.

`read_hook_api` explains both runtimes, input field types/groups/required fields, Personal Data mappings, cancellation, context metadata, output behavior and execution limits. The bundled declarations in `.erb/resources/hook-api.txt` remain the API reference; packaged apps use the editor’s `assets/hook-language/hook-api.d.ts`. Shared examples come directly from `packages/hooks/actions.ts`, and changes to those examples are checked against the editor language service.

AI can read and update site hooks through `read_site_hooks` / `configure_site_hooks`, including default and named actions, website restrictions and test URLs. Site reads return `configHash`, used as `expectedHash` to detect stale edits. Browser-owned installation/publication metadata and omitted optional fields are retained by hook ID. Unmentioned named hooks are preserved automatically. Intentional deletions require explicit `removeHookIds`; an ID cannot be edited and removed in the same request. Local review includes action source, menu visibility, website targets and enabled state.

For global hooks, `read_global_hooks` returns the configuration and `expectedHash`. `save_global_hook` creates or updates one hook without replacing the list, changing the master switch, or publishing to the marketplace. `hookScope: "group"` (default) means the current tab’s login profile; `"browser"` explicitly means All groups. All groups must be requested by the user and appears in the local code/scope review. Changes made while review is open invalidate the save.

`test_hook` supports these operations:

- `validate`: use the editor language service to check lifecycle JavaScript and each action. CSS is not checked or executed.
- `action`: execute one `actionId` in the production sandbox with a fictional `sampleContext` and up to three sequential `sampleAnswers`. `null` simulates Cancel. Returned commands are validated previews and are never applied to the website or saved stores. This checks the handler, not actual DOM field binding.
- `page`: open the same disposable website test window used by the editor after local source/URL review. It has no existing login cookies or real Personal Data. Automatic scripts run on the preview website; external submissions still have real effects and must not be tested without an explicit request. Notes, activity and AI drafts are previewed.
- `status` / `stop`: inspect bounded runtime logs or close the owned preview using the returned `testId`.

An action-only preview reporting success means the page loaded, not that an action was invoked. AI should dry-run the action with fictional input or ask the user to right-click in the preview. Never put real passwords, saved personal values or secrets into source code, test samples or chat. Reading the API does not change AI scope or grant access to private data.
