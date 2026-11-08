# AI site hooks

Ask the Assistant to inspect the page and configure a hook, for example:

> Watch price changes on this page and alert me on Telegram using my Telegram fields in Personal Data.

Save a Personal Data record with a `webhook` field containing the full HTTPS Telegram `https://api.telegram.org/bot<token>/sendMessage` URL and a `chat ID` field containing your recipient. Mark these values private. Global records are inherited; group-local records and overrides follow the existing Personal Data rules. An optional website on a record restricts it to that website.

The AI can find the record and field names without reading the saved credentials. Kudium Browser shows the proposed script, website, group, destination host and selected fields for review, then uses the existing authentication flow. Approving grants local use to that exact script and group for the current browser session. It does not enable general secret access. Developer shows Allow/Revoke controls for saved grants.

Hooks call `await context.notify('approved-key', 'Market update')`. Kudium Browser retrieves the credentials locally, sends HTTPS JSON and returns `{accepted:true}`. Telegram includes the saved `chat_id`; generic webhooks receive `{text}`. Setup does not send a test alert. Delivery acceptance does not establish that a person read the message.

Scripts and destinations changing require renewed approval. OS lock/suspend, group lock, Personal Data lock/disable and disabling AI access revoke active grants. Navigation and page destruction cancel pending delivery. Loading the page again runs its saved hook; monitoring ends when its tab is unloaded or the browser closes. This is page monitoring, not an unattended background scheduler.

Delivery rejects private/reserved destinations, mixed public/private DNS answers, redirects and custom ports. DNS is validated and pinned; requests have a 10-second deadline and a 4 KB response budget. Alerts are limited to 2,000 characters, one per 30 seconds and 20 per hour per permission; identical alerts are deduplicated for five minutes. Remote error bodies, credential URLs and notification text are not written to hook logs.

Shared Assistant/MCP tools:

- `read_site_hooks`: saved source with protected values redacted, status and recent bounded logs.
- `find_hook_personal_data`: up to five matching records and field names, at most 4,000 characters, without values.
- `configure_site_hooks`: complete reviewed before/after JavaScript and CSS, with an optional selected notification binding.

Callers supply a target tab, never a Personal Data scope. Main-process tab access, group locks, origin restrictions and effective inheritance determine the available records. Hook code is shared by groups using the same website login profile; notification grants remain group-specific. Stored code and page content are untrusted input, and can never approve a proposal themselves.

Verification uses isolated Electron profiles, a scripted fake provider and a fixture-only transport substitution. Real websites, OS authentication prompts and Telegram delivery were not used.

## Multiple hooks and page filters

The config can include `hooks: [{id, name, enabled, path, before, after, css}]` (up to 20). Preserve the existing default fields and other hooks when editing. `path` is an anchored pathname glob: `/account/*` matches account pages; `/checkout` matches that exact path. Query strings and hash fragments are ignored. Filters are evaluated at document load. For SPA navigation, the script must install its own route listener. Default code runs first, then enabled matching hooks in list order. All code and filters participate in notification permission fingerprints and local script review.

Use `request_user_feedback` when intent is unclear, with a title, reason and optional suggestions. Use `request_personal_data` when task inputs are missing, with the target tab and observed field names. Its local form returns only a recordId for `fill_personal_data`; never request credentials in chat or copy secrets into hooks. Respect cancellation. Temporary references expire and are bound to the same tab, URL and Personal Data scope.
