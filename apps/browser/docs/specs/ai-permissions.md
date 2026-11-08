# AI permissions

Implemented November 5, 2026.

The chat footer has three modes shared by built-in AI and external MCP:

| Mode | Approval behavior |
| --- | --- |
| Ask first | Review every browser mutation, including navigation, tab selection/creation and scrolling. Observations remain automatic. |
| Standard (default) | Automatically navigate, scroll, hover, change page appearance and select options. Routine text editing, supplied login credentials, ordinary controls and basic form submissions are automatic. Enter/Space use the same target/form classification as clicks. Review payment or destructive submissions, other sensitive actions and inputs, unfamiliar controls, closing tabs, guarded departure, dialogs, uploads, download control and task creation. |
| Full access | Automatically approve supported browser mutations within the selected group scope. |

Standard uses conservative target classification, not a proof of website intent. Page handlers may produce side effects from ordinary clicks, typing or selection. Full access does not add unsupported capabilities or remove snapshot validation, protected file/hidden targets, scope restrictions, human takeover, native OS permissions, CAPTCHA/MFA handoff or save-location pickers. Group scope expansion and permission-mode changes through an agent remain independently confirmed.

Footer changes are direct human authorization and are blocked during active operations. Mode defaults to Standard in a fresh window. Choosing Full access applies to built-in runs and external calls while that window/controller remains active. Scheduled tasks use the current selected mode, not permission claims embedded in their generated instructions.

Direct built-in chat examples:

```
You have full access for this task. Open GitHub and check the latest release.
Use ask first: update the form.
You can do anything. Find the cheapest option for this task.
```

Only a leading direct human grant is parsed. Quoted/negated/incidental text, model-generated task instructions, tool results and page content cannot grant access. Unrecognized permission requests can use request_access and local confirmation. Temporary chat grants are displayed as “Full access · Task”, expire when the task completes/stops, and are retained in encrypted pause checkpoints. A human picker change while paused replaces the checkpoint's mode before resume.

MCP get_access returns base mode, effectiveMode and taskOnly. request_access takes mode and reason and always asks the local human, even when Full access is already selected. The browser controller owns every approval decision; clients cannot supply an auto-approve flag.

Validation: permission policy and direct-grant parser tests, footer selection integration, and disposable native Electron/MCP checks for real action effects, Standard automation, Ask-first denial, Full-access automation, sensitive input review, protected/stale-target refusal, locally confirmed mode changes, page-instruction refusal and expiry of direct chat grants. Group-scope native regression also passes. Full unit suite: 388 passed, one existing command-palette session assertion failed. No personal credentials or user instance are used.

The native fixture also verifies that saved/generated task instructions claiming full access do not elevate permissions. TypeScript, targeted ESLint and production build pass. The running personal Kudium Browser instance and its MCP service remain untouched.

Login update: Standard and Full access permit typing supplied credentials into password inputs, including native input events for controlled fields. Ask first retains the password guard. Password values remain absent from observations; action details redact password text and agents are instructed not to repeat credentials. Standard allows routine login and form submissions. Sensitive-action classification uses the target label/link, surrounding form or dialog text and input names/autocomplete attributes so generic Continue/Submit buttons and Enter cannot bypass payment or deletion review. Unfamiliar controls and file operations still require review. MFA and CAPTCHA require human handoff.

Validation for this update: 24 page-action and permission tests pass, covering login/password redaction, routine submissions, payment inputs and generic sensitive Continue buttons. TypeScript and targeted lint pass. Live website login was not exercised.
