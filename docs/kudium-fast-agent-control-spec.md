# Fast agent control for Kudium Browser

Status: proposal, 2026-11-26. Scope: the external AI surface (MCP endpoint in
`apps/browser/src/main/mcp.ts`, tool engine in `apps/browser/src/main/ai.ts`,
bridge in `packages/mcp`). Hooks, Personal Data and the built-in chat keep
their current contracts unless a section says otherwise.

## 1. Summary

Kudium already has the hard parts: a trusted in-process action engine, native
approvals, private-data isolation, groups with linked project folders and a
local MCP endpoint. What it lacks is a way for an agent to express a whole
flow in one request. Today every click is one model turn plus one HTTP request
plus one CDP session, and some paths carry fixed costs (a 15 s unload
inspection before every navigate on a dev SPA) that a scripted browser such as
Ego lite never pays.

This spec adds a **script runtime** (one call runs a whole flow inside the
browser), a **session and consent model** that approves a run instead of every
click, and a set of **engine fixes** that remove fixed latency. The goal is to
beat Ego lite on the flows people actually run (sign in, change a setting,
verify a result, extract a table) while keeping every control Kudium has now.

Measured on this Mac on 2026-11-26 against the Delight dev app (Vite SPA at
`localhost:5173`) and its API docs page:

| Step | Kudium today (MCP bridge) | Ego lite | Target |
| --- | ---: | ---: | ---: |
| Connect / first call | 878 ms (npx bridge start) | 139 ms | ≤ 100 ms |
| `read_page` / snapshot | 14 to 17 ms | ~20 ms | ≤ 10 ms |
| Navigate, plain page | 218 to 408 ms | ~200 ms | ≤ 250 ms |
| Navigate, dev SPA | **15 006 ms, then error** | 440 ms | ≤ 500 ms |
| Screenshot | 50 ms | 1 050 ms | ≤ 50 ms |
| Click → wait for route → snapshot | 3 model turns | 1 script | 1 script, no model turn between steps |
| Login + settings flow (DEL test, 2026-11-02) | ~32 s (argent, comparable per-call model) | 17 s | ≤ 12 s |

Per-call latency is not Kudium's problem; it is already faster than Ego inside
the browser. The problem is the number of calls a flow needs, and a few paths
that time out.

## 2. Goals and non-goals

Goals

1. One request can run a complete flow: navigate, wait, act, assert, extract,
   screenshot, hand back.
2. A user keeps the control Kudium has now: scope by group, access modes,
   native review only where the mode asks for it, Stop and Take control at any moment,
   nothing secret in model context.
3. Agents that only speak MCP tool calls (no scripting) still get faster: fewer
   round trips, smaller payloads, no fixed timeouts.
4. Shell-driven agents (Claude Code, Codex, scripts) get a CLI shaped like
   `ego-browser nodejs`, backed by the same engine and token.

Non-goals

- Replacing hooks. Scripts are one-off; hooks stay the persistent mechanism.
- Exposing Node, the filesystem or raw network to scripts beyond what a group's
  linked project folder and the page already allow.
- Changing how Personal Data, passwords or disclosure review work.

## 3. Why flows are slow today (verified in source)

1. **One tool per request, one request per model turn.** `createMCPServer`
   builds a new `Server` and `StreamableHTTPServerTransport` for every POST
   (`mcp.ts`, `sessionIdGenerator: undefined`, `enableJsonResponse: true`).
   There is no session, no streaming and `listener.requestTimeout = 15000`, so
   nothing long-running can be a single call.
2. **Global controller lock.** `execute` refuses any call while `run` or
   `externalRun` is set. Reads block on writes, and the built-in assistant and
   an external agent cannot work in different groups at the same time.
3. **Navigate inspects unload handlers before checking the access mode.**
   `approveDeparture` always awaits `hasAIUnloadHandlers` (CDP attach, frame
   tree, `Runtime.enable` per renderer, `DOMDebugger.getEventListeners` per
   frame) and only then decides whether a review is needed. On the Vite SPA
   this hits `AI_PROTOCOL_TIMEOUT` (15 s) and the tool fails even though the
   page loaded; `wait_until` on the same URL returns in 10 ms right after.
4. **Each action opens its own protocol session.** `withAIProtocol` attaches
   the debugger per action and detaches after. Fine for one click; a 20-step
   flow pays attach/detach 20 times plus a fresh `read_page` each time because
   `snapshotId` is invalidated by any navigation and actions require the latest
   read.
5. **Observation payloads are larger for external clients than for the built-in
   agent.** `formatAIObservation` emits the compact `semantic-v1` line format
   and TOON tables only for the built-in provider; MCP clients receive raw JSON
   (`list_tabs` was 6.6 KB for 24 tabs, `read_page` compact 2.4 KB for a small
   page).
6. **No composable waits.** `wait_until` accepts one URL or one exact visible
   label. There is no wait on a selector, a predicate, load state, network
   idle, a download or a popup, so agents poll with `read_page`.
7. **Weak targeting.** Actions take only `elementId` from the last snapshot
   or `find_element` by exact label. No CSS, role+name, text substring, href or
   xpath selectors, so a changed label or a duplicate label means another
   round trip.
8. **Bridge cold start.** `npx -y @kudiumbrowser/mcp` costs about 0.9 s per
   client start and fails outright when the registry is slow (observed this
   morning as "fetch failed"), although Claude Code can talk Streamable HTTP
   directly.

## 4. Target architecture

```
agent (MCP client or CLI)
   │  Streamable HTTP, persistent session, SSE progress      ◄── 4.1
   ▼
External control server  (mcp.ts)
   │  tools (existing) + run_script + session/consent tools   ◄── 4.2, 4.4
   ▼
Script runtime  (new, Electron utility process per run)      ◄── 4.3
   │  Page API over a private MessagePort, no Node globals
   ▼
Action engine  (ai.ts, aiFrames.ts, aiProtocol.ts)
   │  per-tab action lease, shared protocol session per run  ◄── 4.5
   ▼
WebContents / CDP
```

### 4.1 Transport

- **Direct HTTP first.** The setup command writes the `url` + `Authorization`
  form for clients that support Streamable HTTP (Claude Code, Codex, Cursor,
  VS Code all do). The stdio bridge stays as a fallback and is shipped as a
  prebuilt single file so it never depends on the registry at start.
- **Sessions.** Enable `sessionIdGenerator`; keep one `Server` per session
  instead of per request. A session carries the agent's current scope, owned
  tabs and run history, so `list_tabs` and `read_page` can return deltas.
- **Streaming.** `run_script` and long waits stream MCP progress notifications
  (log lines, step receipts, "waiting for approval") over SSE. The 15 s request
  timeout applies to the idle gap between events, not the whole call. The
  overall lease stays capped (default 120 s, max 600 s with explicit
  `budgetMs`).
- **Cancellation.** `notifications/cancelled` already aborts; the script runtime
  honours it the same way Stop does.
- **WebSocket channel (optional, same token).** Alongside HTTP, expose
  `ws://127.0.0.1:<port>/ws` carrying the same JSON-RPC messages. Measured
  cost of one HTTP tool call through the bridge is 12 to 17 ms, of which
  roughly 5 to 8 ms is connection setup and request parsing; a persistent
  socket brings that to about 1 to 2 ms and gives true two-way traffic:
  the browser can push page events (navigation committed, dialog opened,
  download finished, human took control) without the client polling, and
  the CLI can stream a running script's log lines with no SSE framing.
  Rules: WebSocket is only for the CLI and for clients that do not speak
  MCP natively; MCP clients keep Streamable HTTP because that is what they
  implement. Origin header must be absent (browser pages can never open it),
  the bearer token is sent in the first frame, one socket maps to one
  session, and the same per-group lock and consent rules apply. This is a
  Phase 1 item because the CLI is where the latency shows; it is not needed
  for the engine fixes in Phase 0.

### 4.2 Script tool and CLI

New tool `run_script` and CLI command `kudium nodejs` (the CLI is a thin
client: it posts the script, streams events to stdout, exits with the script's
result). Script source is JavaScript (ESM, top-level await), executed inside
the browser (see 4.3), never on the client. The CLI prints `[kudium:skill]`
usage text like `ego-browser skill` so agents can self-brief.

```ts
run_script({
  source: string,            // ≤ 64 KB
  groupId?: string,          // defaults to the session scope
  intent: string,            // one line shown in the consent dialog and activity feed
  scope?: ScriptScope,       // see 4.4; defaults derived from source analysis
  budgetMs?: number,         // 120 000 default, 600 000 max
  trace?: 'receipts' | 'full'
}) → { ok, value, receipts: ActionReceipt[], logs, screenshots: string[], error? }
```

Script API (available as globals, modelled on Ego so agents transfer skills):

```ts
const s = await session();            // current scope, owned tabs
const page = s.page("p1") ?? await s.newPage();   // labels persist per session
await page.goto(url, { waitUntil: "load" | "domcontentloaded" | "networkidle", timeout });
await page.waitFor({ url?, selector?, text?, fn?, state?: "visible"|"hidden", timeout });
const snap = await page.snapshot({ scope: "viewport" | "full" | { root: "@12" }, maxText });
await page.click("@21" | "text=Save" | "css=#id" | "role=button[name='Sign in']" | "href=/x", { label });
await page.fill("@7", "value");                // never a password literal
await page.fill("@8", { secret: "login:delightapp.dev/password" });   // filled locally, see 4.6
await page.press("@7", "Enter"); await page.select("@9", { label: "October" });
await page.hover(sel); await page.scroll(sel | { y }); await page.drag(from, to);
const v = await page.evaluate((arg) => document.title, arg);     // isolated world, 5 s cap
const r = await page.fetch("/api/items", { method, headers, body }); // page's cookies and CORS
const dl = page.waitForEvent("download" | "popup" | "dialog");    // arm, act, await
const path = await page.screenshot({ element?: sel, path?: projectRelativePath });
const rows = await page.extract({ rows: "tr", columns: { name: "td:nth-child(1)" } });
await s.handOff("Sign in, then continue");    // pauses, returns control to the human
await s.finish({ keep: ["p2"] });            // closes agent-owned tabs except kept ones
log(...)                                       // streamed to the client and the sidebar
```

Rules: selectors must resolve to exactly one actionable element; refs (`@N`)
come from the latest snapshot in this run and survive scrolling but not
main-frame navigation; every action auto-scrolls into view; every action
returns a receipt with `{ step, tool, target, url, durationMs, approval }`.

For MCP-only agents that do not want to write a script, add `act` which takes
an ordered `steps[]` of existing tool calls with the same semantics (stop on
first error, one consent, one receipt list). `act` is literally `run_script`
with a generated body, so there is one engine path.

### 4.3 Script runtime

- Runs in an Electron `utilityProcess` with `contextIsolation`, no
  `require`, no `process`, no `fetch`, no timers beyond the budget. The only
  bridge is a `MessagePort` to the main process that exposes the Page API. This
  keeps the controller lock, approvals and disclosure rules in one place
  (`ai.ts`) and means a script cannot do anything a tool call cannot.
- **Warm, not per run.** Spawning a process costs 50 to 100 ms, which would
  eat the 60 ms call budget. One utility process is started when a session
  opens and kept alive; each run gets a fresh `vm` context inside it and the
  process is recycled after 50 runs or any abort. Cold path only on the very
  first run after launch.
- **Pipelined Page API.** Calls over the `MessagePort` are batched per
  microtask: `await Promise.all([page.fill(a, x), page.fill(b, y)])` is one
  message, and every action carries an implicit "settle" check (one animation
  frame plus 100 ms without DOM mutation, capped at 1 s) before it returns,
  so the next snapshot is never stale and never waits longer than needed.
- File access is limited to the group's linked project folder
  (`project.path` from `list_groups`) for screenshot output and
  `upload_files` sources, plus explicit paths the user approves in the upload
  review. No other filesystem access.
- Each Page API call maps onto the existing tool implementations. The
  runtime holds the run's protocol session and action lease (4.5) so calls do
  not re-attach.
- Scripts get `signal` and must stop within 1 s of abort; the runtime kills
  the process at 2 s.
- Output cap 1 MB per run; screenshots are files plus a reference, never
  base64 in the result.

### 4.4 Control model: consent per run, not per click

Kudium's three modes stay, but Standard changes from "review each page
interaction" to "review each run":

| Mode | Reads | Navigation | Interactions | Sensitive actions | Hard floor |
| --- | --- | --- | --- | --- | --- |
| Ask first | auto | review | review each | review each | review |
| Standard | auto | same-origin auto, cross-origin in the run consent | **one consent per run** covering the declared scope | review each | review |
| Full | auto | auto | auto | **auto** | review |

Full access means full: the agent works without prompts for the whole run.
The only prompts left in Full mode are the hard floor, and the user can even
pre-approve those per group ("trusted group"), which makes a run completely
silent. Friction is replaced by visibility (receipt panel, agent cursor,
activity feed) and by Stop / Take control, which are always one click away.

- **Scope declaration.** A run declares (or the server infers from a static
  pass over the source and the first `goto`) its `ScriptScope`: origins, action
  classes (`read`, `interact`, `type`, `submit`, `navigate-cross-origin`,
  `upload`, `download`, `close-tab`, `evaluate`, `cdp`) and whether it uses
  saved data. The consent dialog lists exactly that, with the intent line and
  the group. A step outside the declared scope does not fail: in Standard
  mode it asks once for that class and origin and remembers the answer; in
  Full mode it proceeds; in Ask first it asks as always. Failing the step
  would cost a whole model turn to recover, and the lazy prompt is the same
  dialog the user would have seen anyway.
- **Sensitive actions** (reviewed in Ask first and Standard, automatic in
  Full): password submission with a saved login, uploads from the linked
  project folder, `close_tab` of a user tab, cross-origin POST, departures
  from a page with a `beforeunload` handler, `cdp` calls within the
  allowlist, and actions after a saved-data lookup. Today several of these
  prompt even in Full mode (`approveDeparture` runs before the mode check,
  and `privateDataDisclosed` forces review of every later action). Both go.
  In Full mode a saved-data lookup of non-protected facts no longer flips
  the session into review; protected values are never disclosed anyway, so
  the flag only ever punished ordinary work.
- **Hard floor** (reviewed in every mode unless the group is marked trusted):
  filling a saved payment card, generating or filling a password outside a
  saved-login fill, uploading files from outside the linked project folder,
  revoking or widening the agent's own scope or mode, and `cdp` outside the
  allowlist. These are the actions that spend money, change credentials or
  escape the sandbox; everything else is undoable by the user from the
  receipt panel. The list lives in one table in `aiPermissions.ts` with
  tests, so adding to it is a visible decision.
- **Trusted group.** A per-group setting ("Let agents act without asking in
  this group") that skips the hard floor too, meant for a dev group like the
  Delight one linked to a project folder, where the pages are local and the
  data is seed data. It is off by default, shown in the group header while
  on, and never set from the API.
- **No repeat prompts.** When a prompt does happen, the answer is remembered
  for the rest of the run for that action class and origin, so a flow never
  asks twice for the same thing.
- **Live receipt panel.** Every run shows in the sidebar as a list of steps
  with the agent cursor label (the `observeAIPointer` presentation already
  exists), the current URL and Stop / Take control. Take control pauses the
  run at the next step boundary and flips the session to `handedOff`, exactly
  like Ego's `waitForControl`; `resume_control` resumes from that step.
- **Session ownership.** A session (one agent token + one group) has
  ownership `agent | user | handedOff`. Tabs the agent opened are agent-owned
  and close without approval at `finish`; user tabs are never closed without
  review. This replaces the ad-hoc "pinned tabs are protected" rule with the
  same model Ego uses, mapped onto Kudium groups.
- **Per-group controllers.** The lock in `execute` becomes per group: the
  built-in assistant in group A and an external agent in group B run
  concurrently. Inside a group there is still one controller; reads never take
  the lock.

### 4.5 Engine fixes (benefit tool calls and scripts alike)

1. **Navigate.** Remove the up-front `hasAIUnloadHandlers` inspection
   entirely. Chromium already raises the `beforeunload` dialog when a
   handler exists, and Kudium already returns dialog receipts; so navigate
   dispatches immediately, and only a page that really has a handler
   produces a dialog, which the run answers through `handle_dialog` under the
   normal mode rules (auto-leave in Full, prompt otherwise). Zero cost on the
   common path, one dialog on the rare one, and no CDP attach for a
   navigation. Add `waitUntil` (`commit`, `domcontentloaded`, `load`, `networkidle`), with
   `load` as the default and `networkidle` defined as 500 ms without main-frame
   requests, ignoring WebSocket and EventSource traffic so dev servers settle.
2. **Protocol session per run.** `withAIProtocol` already supports a shared
   session when the same signal is passed; the runtime passes the run signal
   so one attach serves the whole run.
3. **Snapshot reuse.** Keep `snapshotId` bound to the document, not to the
   last read: an action after another action on the same document re-resolves
   the ref by its recorded fingerprint (role, label, nth, nearest stable id)
   and only fails if the fingerprint no longer matches. This removes the
   mandatory read between consecutive actions.
4. **Selectors.** Add `text=`, `css=`, `role=…[name=…]`, `href=`, `xpath=` to
   `find_element`, `click`, `type`, `hover`, `press_key`, `select_options`.
   Resolution runs in the same isolated-world program as `read_page`, so the
   security properties (no page-visible globals, bounded traversal) hold.
5. **Composable waits.** Extend `wait_until` with `selector`, `text`,
   `state`, `fn` (isolated world, 100 ms poll) and `loadState`; add
   `wait_event` for `download`, `popup`, `dialog` with a receipt that carries
   the new `tabId` or `dialogId`.
6. **Compact observations for external clients.** Send the `semantic-v1`
   format and TOON lists to MCP clients when the client opts in
   (`format: "compact"` already exists; add `encoding: "lines"`). Expected
   payload drop: 40 to 60 % on `read_page`, 70 % on `list_tabs`.
7. **Action receipts carry the next observation on request.**
   `click({ then: "snapshot" | "diff" | "none" })` returns the post-action
   observation in the same response once the page settles (see 4.3), saving
   a round trip for the common click-then-look case. `diff` returns only
   refs added, removed or changed since the last snapshot of the same
   document, which is typically a tenth of a full snapshot and is what the
   script runtime uses between steps by default.
7b. **Smaller screenshots for models.** `screenshot({ imageFormat: "jpeg" |
   "png" | "webp", scale })` with JPEG at 0.5 scale as the default for model
   consumption and PNG only on request; a 1.2 MB PNG becomes well under
   100 KB with no loss the model can use. JPEG rather than WebP as the
   default because the compositor encodes it directly (no protocol attach,
   so the 50 ms budget holds) and every provider decodes it; WebP is
   available on request through the page protocol and falls back to JPEG
   when a tab is open in DevTools. `element` clipping waits for the script
   runtime, where the selector resolution lives.
8. **Startup.** Ship the bridge as a single prebuilt file inside the app
   bundle and point setup at it (`~/.kudium/bin/kudium-mcp`), with `npx` only
   as the documented fallback. Target first call ≤ 100 ms.

### 4.6 Secrets and saved data in scripts

- `page.fill(sel, { secret: "<record reference>" })` resolves through the
  existing `fill_saved_login` / `fill_personal_data` path: the value is written
  by the browser, never returned, and the receipt records only the reference.
  Password fields accept only this form.
- A run that touches saved data flips the existing disclosure flag with the
  same consequences as today (later actions review).
- `page.evaluate` and `page.fetch` cannot read password fields or saved data;
  the isolated world program redacts `type=password` values as `read_page`
  does now.

### 4.7 Visual pages

Keep `click_at`, `drag_at`, `wheel` as they are (they already match Ego's
mouse API in capability) and expose them in the script API as `page.mouse`.
Add `page.keyboard.type/press/paste` where `paste` uses the existing
clipboard-restore path.

### 4.8 Project folder, terminals, scripts and browser configuration

Today the built-in assistant has four project tools (`get_project`,
`project_files`, `project_scripts`, `project_terminal`, see
`apps/browser/src/main/aiProject.ts`) but `MCP_NAMES` filters them out, so an
external agent cannot see the linked folder, the Developer action scripts or
the terminals at all. Configuration is spread over private JSON files in
`userData` (`developer-projects.json` for group → folder links,
`developer-scripts.json` for action scripts, `preferences.ts` and
`siteSettings.ts` for the rest) with no single document an agent could read
or write.

**Expose the project tools over MCP and in the script API.**

```ts
const project = await s.project();                // { linked, name, path, repository, available }
await project.files.list("src"); await project.files.read("package.json");
await project.files.save("docs/notes.md", text, { version });   // same version check as today
const term = await project.terminal.run("npm test", { name: "tests" });   // visible terminal tab
for await (const chunk of term.output()) log(chunk);            // live over the WebSocket channel
await term.wait({ timeout: 120_000 });                            // exit code, not "running"
await project.scripts.save({ name: "Dev server", command: "npm run dev", shortcut: "cmd+shift+d" });
await project.scripts.run("dev-server");
```

Control stays where it is today for the shell: the terminal is not sandboxed
to the folder, so `terminal.run` and `scripts.run` are **sensitive actions**
(one consent per run in Standard, automatic in Full) and the command text is
always shown in the receipt panel. A trusted group runs them silently. File
writes stay inside the linked folder with the existing version check; reads
are automatic in Standard and Full.

**Shell commands after reading foreign content always review.** A run that
has read page content (snapshot, `extract`, `evaluate`, `fetch`, console or
network logs) from any origin outside the group's own set is *tainted* for
the rest of the run. The group's own set is the manifest's `tabs` origins
plus `localhost` / `127.0.0.1`; without a manifest it is only the local
origins. In a tainted run, `terminal.run`, `scripts.run` with a command that
is not already in the manifest's `scripts`, and `project.files.save` outside
`docs/` review in every mode, trusted group included, and the dialog shows
which origin tainted the run. Commands already declared in the manifest's
`scripts` list keep running silently, because the user authored them, not the
page. This is the one place the trusted-group bypass does not apply: text on
a page the agent read must never be able to run a command without the user
seeing it. The taint is per run, so the dev loop (read local app, run tests)
stays prompt-free.

**One configuration document per group.** Add a declarative group manifest
that the browser can export and apply, and that an agent can author:

```jsonc
// kudium.workspace.json  (lives in the linked project folder; optional)
{
  "group": { "name": "Delight", "display": "folder", "sessionMode": "separate" },
  "project": { "path": ".", "editor": "cursor" },
  "tabs": [
    { "url": "http://localhost:5173", "pinned": true, "title": "Web" },
    { "url": "http://localhost:8000/docs", "title": "API docs" }
  ],
  "scripts": [
    { "id": "dev-web", "name": "Web dev server", "command": "cd web && pnpm dev", "shortcut": "cmd+shift+1" },
    { "id": "dev-api", "name": "API dev server", "command": "make run-local", "shortcut": "cmd+shift+2" }
  ],
  "terminals": [{ "name": "shell", "cwd": "." }],
  "hooks": { "site": ["./.kudium/hooks/*.json"] },
  "siteSettings": { "localhost:5173": { "notifications": "allow" } },
  "ai": { "mode": "full", "trusted": true, "skills": ["delight-qa"] }
}
```

Tools: `get_workspace_config(groupId)` returns the effective manifest (from
the file if present, otherwise generated from the browser's current state);
`apply_workspace_config(groupId, manifest)` shows a native diff review
(tabs to open, scripts to add or change, settings to change, shell commands
that will become runnable) and applies it atomically; `setup_project(path,
manifest?)` creates the group, links the folder, writes `BROWSER.md`
context as today, opens the tabs and registers the scripts in one approved
step. Secrets never live in the manifest; a script that needs one references
a Personal Data record by name. The `ai` block is applied only after its own
explicit confirmation, because it is the one part that widens what the agent
may do. The manifest is also the natural unit for sharing a setup between
machines or teammates, and for the workspace sync item on the roadmap.

**Replaces `BROWSER.md`.** The manifest takes over the job
`browserProjectContext.ts` does today: the linked-group block moves into
`kudium.workspace.json`, and the `AGENTS.md` marker block becomes one line
("This project is linked to Kudium Browser. Read `kudium.workspace.json` and
use the Kudium MCP tools; if the server is missing, run
`npx @kudiumbrowser/mcp setup`"). The connection paragraph is not duplicated
because it already lives in the `kudiumbrowser://guide` resource. The
"Keep browser context in linked projects" preference keeps its meaning: off
writes nothing into the folder and the configuration stays in the private
store; on writes the manifest and keeps it in sync both ways (browser edits
update the file, file edits apply after the normal diff review). Migration:
on the first write with the preference on, generate the manifest from the
browser state plus the old `BROWSER.md` group block, then delete `BROWSER.md`
only when it contains nothing outside the Kudium markers; otherwise strip the
marker block and leave the user's own text.

**Point an agent at the folder and it works.** Three more pieces make the
folder self-sufficient, all behind the same preference:

- `setup_project` and the sync write the client's project-level MCP entry
  (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor; Codex is
  user-level and handled by the setup command). The entry holds only the
  bridge command. The bridge pairs on its first run through the existing
  connector approval and keeps the credential in `~/.kudium`, so no restart
  and no token in the project.
- When the manifest's group reference does not resolve in this browser (new
  machine, teammate's clone), the agent calls `setup_project` with the
  manifest and the group, tabs, scripts and links are recreated after one
  review.
- An optional `skills` list in the manifest names skill files in the folder
  (recorded flows from 4.11, project-specific instructions). `list_skills`
  returns them for that group, so the agent discovers what this project
  already knows how to do.

**Browser-wide preferences** (theme, shortcuts, link routing, protection
exceptions) get a read tool and a reviewed write tool with the same diff
dialog. The agent helps the user configure, the user still sees every change
before it lands.

### 4.9 Parity between the built-in assistant and external agents

One engine, one tool catalog, one permission table, one runtime. Today the
two differ in three places, and each one goes:

| Today | After |
| --- | --- |
| Project tools (`get_project`, `project_files`, `project_scripts`, `project_terminal`) are built-in only; `MCP_NAMES` filters them out | Same catalog for both; MCP exposes every tool the built-in agent has, including `run_script`, `act` and the workspace tools |
| Compact `semantic-v1` and TOON observations are built-in only (`formatAIObservation`) | Both receive the same encodings; the client picks with `encoding` |
| One global lock; whichever agent starts first blocks the other everywhere | One controller per group; both can work in different groups at once |

What stays different, on purpose:

- The built-in assistant runs its own model loop inside Kudium, so Kudium
  can enforce completion contracts (`aiCompletionContract.ts`) and tool
  discovery bundles on it. An external agent owns its loop; Kudium can only
  return receipts and refuse actions. The receipts are identical.
- Access mode, trusted group, scope and consent are properties of the group
  and the run, not of which agent is asking. A Full-mode trusted group is
  silent for both; an Ask-first group prompts both.
- The human controls are the same surface for both: Stop, Take control,
  the receipt panel and the footer access mode. "External AI" in the status
  line only labels who is driving.

Regression rule: every tool trace in the test suite runs twice, once through
the built-in path and once through the MCP path, and must produce the same
receipts and the same prompts.

### 4.10 Model tiers

The control surface above is model-agnostic, but which model drives it
decides whether a run succeeds. Verified constraints:

- **Chromium built-in AI is not available.** Chrome's Prompt, Summarizer,
  Translator and Writer APIs are backed by Gemini Nano, which Chrome fetches
  through Google's component updater with Chrome branding. The model is not
  in the Chromium tree, is not available to Electron, and its weights are
  not published or redistributable. Treat it as unavailable.
- **Apple on-device Foundation Model** (about 3B parameters, small context)
  cannot run a 60-tool loop over page snapshots, even with the reduced
  context window. It is reliable for narrow one-shot jobs.

Tiers Kudium should offer, all working through the same tools:

| Tier | Model | Cost | Use |
| --- | --- | --- | --- |
| Assist | Apple Foundation Model (existing `aiApple*.ts`) | free, on device | intent classification, summarise selection, pick one of N labels, draft notes, fill a parameterised flow template |
| Local control | Gemma 3n or Qwen 3 small via Ollama (existing local-endpoint path) | free, on device, open weights | browser control with `run_script` / `act`, hooks authoring, project tasks |
| Cloud | user's own key (OpenAI, Anthropic, Google AI Studio free tier) | user pays or free tier | long multi-site tasks, research |
| External | Claude Code, Codex, Cursor through MCP | user's existing subscription | development workflows with the project tools |

Changes needed:

1. **One-click local model install.** Preferences → Assistant → "Install a
   local model": detect or install Ollama, pull the chosen model (Gemma 3n
   default, Qwen 3 as the tool-calling alternative), register the endpoint.
   No key, nothing leaves the machine.
2. **Routing by task shape, not by user choice alone.** A zero-cost
   heuristic decides first (request length, presence of a URL or tab
   reference, verbs that imply actions); only ambiguous requests pay for an
   Assist-tier classification call. The control-tier model is kept warm
   (Ollama `keep_alive`, Apple session reused) so the first token of a run
   does not include model load time. The user still sees and can change the
   tier per group.
3. **Flow templates for small models.** Ship a handful of parameterised
   flows (sign in with a saved login, open a settings page, extract a table,
   check a page for a phrase) as `act` step lists. A small model only has
   to choose a template and fill its slots, which is well within the Apple
   model's reach; the engine does the rest.
4. **Keep the loop guard.** `aiLoopGuard.ts` already stops a small model
   that repeats itself; extend it to suggest the next tier up in its message
   instead of only reporting failure.

Gemma's licence permits commercial use with usage restrictions; show the
licence once at install. Qwen 3 is Apache 2.0.

### 4.11 Gaps the sections above do not cover

Debugging and QA (what people actually use a scripted browser for):

- **Console and network logs.** No tool reads page console output or the
  requests a page made. Add `page.console()` and `page.requests({ since,
  filter })` with bodies redacted for password and payment fields, plus
  `waitFor({ request: /pattern/ })`. Argent has both and QA flows lean on
  them; Ego hides console by default and needs raw CDP.
- **Viewport and device emulation.** `page.setViewport({ width, height,
  mobile, scale })` and a light/dark toggle for responsive checks. Scoped to
  the agent-owned tab, reset at `finish`.
- **Screenshot diff.** `page.screenshot({ compareTo: path, threshold })`
  returning a diff image and a changed-pixel ratio, for before/after checks.
- **Record a run as a script.** Every run already produces receipts; add
  "Save as flow" that turns them into a `run_script` body with selectors
  instead of refs, stored as a group skill or as a file in the project
  folder. Replaying it is how a flow becomes a regression test without the
  agent in the loop.

Sessions and scheduling:

- **Disposable sessions.** `s.newPage({ disposable: true })` opens a tab in
  a fresh storage partition (the `test_hook` preview already does this), for
  sign-in tests and anything that must not touch the user's cookies.
- **Scheduled scripts.** `create_task` today schedules a natural-language
  instruction for the built-in assistant. Let a task carry a saved script
  instead, so a nightly check runs deterministically with no model at all,
  and fall back to the assistant only when the script fails.
- **Runs while the window is hidden.** The scheduler refuses when the host
  window is not visible. A run that uses only agent-owned tabs should be
  allowed in the background with the receipt panel catching up on focus.

Governance:

- **Per-agent identity.** `personalAgents.ts` already issues one token per
  personal agent; the connector token for external clients is shared. Give
  each client its own token, name and permission ceiling (a client can be
  capped at Standard even in a Full group), and stamp every receipt with the
  agent name. Revocation then targets one client.
- **Exportable audit log.** Receipts live in the activity feed; add an export
  (JSON lines per run: agent, group, steps, approvals, outcome) and a
  retention setting, so a user or team can review what agents did.
- **Contract versioning.** Publish a version in the MCP `serverInfo`, the
  guide resource and `kudium skill` output, and keep removed fields readable
  for one minor version, so agents with cached skills do not break on
  update.
- **Runaway protection.** Budgets cover time; add caps per run on
  navigations, tab creations, uploads and bytes written to the project
  folder, with the receipt saying which cap was hit.

Platform and docs:

- **Windows and Linux.** Everything above is Electron-portable except the
  Apple tier; make the Local control tier the default there and say so in
  the preferences copy.
- **Agent skill file.** Ship a `SKILL.md` (and `kudium skill` output) in the
  npm package that documents the script API with examples, the way Ego's
  guide does. Agents learn the surface from that file, not from 64 tool
  descriptions.
- **Clipboard.** `page.keyboard.paste(text)` with clipboard restore is in
  4.7; add `s.clipboard.read()` behind the same review as saved data, since
  the clipboard often holds secrets.

### 4.12 HTTPS and remote access without manual tunnels

"Needs https" covers two different cases.

**Local clients that refuse plain http.** Serve `https://127.0.0.1:<port>/mcp`
beside the http endpoint:

1. On first enable, generate a Kudium root CA (ECDSA P-256, 10-year, stored
   in the private store) and ask the OS to trust it: `security
   add-trusted-cert` on macOS (one admin prompt), the user cert store on
   Windows, the NSS and system stores on Linux. This is what mkcert does.
   The CA carries a critical **X.509 Name Constraints** extension that
   permits only `DNS:localhost`, `IP:127.0.0.1/32` and `IP:::1/128` and
   excludes everything else, so even a leaked CA key cannot sign a
   certificate for any real site. Verification: the setup step issues a test
   leaf for `example.com`, confirms the OS and Node both reject it, and only
   then reports "https ready". The CA key never leaves the private store
   and is regenerated, with a new trust prompt, if the store is reset.
2. Issue a leaf certificate for `localhost` and `127.0.0.1` (90-day, rotated
   automatically) and bind the existing `http.Server` logic to an
   `https.Server` as well.
3. Node-based clients (Claude Code, most SDKs) ignore the OS trust store.
   The setup command writes the CA path into the client configuration
   (`NODE_EXTRA_CA_CERTS`, or `--use-system-ca` where the Node version has
   it) and verifies with a test request before saying "connected".
4. Host and Origin checks stay as they are; the certificate changes nothing
   about who may connect.

**Cloud clients** (claude.ai connectors, ChatGPT, Gemini) need a public URL
and OAuth. Replace the manual tunnel with a Kudium relay:

- The browser opens an outbound WebSocket to `relay.kudium.com` (a service
  in `apps/web`, Bun/Hono) and receives a stable URL
  `https://<device-id>.relay.kudium.com/mcp`. The relay forwards MCP
  requests over the socket and returns responses; it holds no browser
  state. Reconnects keep the same URL.
- **OAuth 2.1 with the approval in the browser.** The relay is the
  authorization server the cloud client talks to; the consent step is a
  push to the browser that opens the existing connector-approval dialog.
  Tokens are issued per connector, shown nowhere, revocable from
  Preferences, and the relay checks them before forwarding.
- **End-to-end encryption.** The pairing step derives a key between the
  cloud client's connector and the browser (the relay only ever sees
  ciphertext). This keeps Kudium's own server out of the trust boundary.
- **Quick tunnel fallback** for people who will not use a Kudium service:
  detect or install `cloudflared`, start a quick tunnel (no account, random
  hostname), and write the client configuration. Same OAuth flow, with the
  browser as the authorization server.
- **Safety defaults for remote.** Off by default; a persistent "remote
  connected" indicator in the status line; remote connectors capped at
  Standard mode unless the user raises it per connector; idle sessions
  expire after 30 minutes; the trusted-group bypass never applies to a
  remote connector; disabling external control drops every relay session
  at once.

Setup flow for the user is one button per case: "Use https locally" (admin
prompt, done) and "Connect a cloud assistant" (sign in to the relay, approve
the connector, done).

### 4.13 Finding the right tab, group and session

Today an agent has `list_groups`, a flat `list_tabs` (title and URL only;
6.6 KB for 24 tabs) and `resolve_reference` for an explicit `@group/page`
mention. Nothing reports which account a tab is signed into, there is no
search, and changing scope to another group mid-task opens a confirmation
dialog. Finding "the tab signed into the QA build" means reading every title.

- **`find_tabs`.** `find_tabs({ query, origin, groupId, signedIn })` with
  fuzzy matching over title, URL, group name and the saved-login reference
  for the tab's origin. `signedIn` is answered by matching the partition's
  cookies against saved-login references and reports the account reference
  name, never a value. Returns a compact list (TOON) with group, tab and
  session fields.
- **Session identity on groups.** `list_groups` adds `sessions`: the origins
  with a live signed-in session in that group's partition and the matching
  saved-login reference. This is usually the real question. The match is
  computed once per partition and cached, invalidated by the cookie-change
  event, so the call stays as cheap as `list_groups` is today.
- **Named sessions in the manifest.** `ai.sessions` maps a name to a group
  or tab reference (`"simpro-qa": "@qa-builds/us-devops"`); the script API
  resolves `s.page("simpro-qa")` through it. Projects state where their test
  accounts live once.
- **Groups in the run consent.** A run declares the groups it needs; the
  single consent lists them, so switching scope inside the run needs no
  second dialog. A switch outside the declared set fails with a receipt.
  In Full mode the switch is automatic within the agent's ceiling.
- **Assist-tier disambiguation.** When search leaves several candidates,
  the on-device model chooses from the short list; the control model never
  pages through the full tab list.

### 4.14 Making the Apple on-device model useful

Why it fails today (`apps/browser/src/main/aiApple*.ts`,
`native/apple-ai/main.swift`): the helper process is spawned per turn and
rebuilds a `Transcript` from the whole chat history; `appleAIContext` then
abridges tools to about 2,900 characters, history to 3,400 and observations
to 1,100 so the request fits the roughly 4k-token window; the model is asked
to pick the next tool call from that. A 3B model cannot plan a multi-step
browser task from a trimmed page dump, so it repeats itself and
`aiLoopGuard` stops it. The fix is to change what the model is asked to do,
not to trim harder.

**Engine-driven loop, model-driven step.** The engine (not the model) owns
the task state and the loop. Each turn the model sees a fixed, small frame
and returns exactly one step as guided generation:

```
instructions   ≤ 250 tokens, fixed
goal           the user's request, ≤ 120 tokens
state          engine-written summary: page title and URL, steps done with
               their receipts, what is pending  (≤ 200 tokens, deterministic)
observation    diff or focused snapshot, ≤ 1,200 tokens (see below)
choices        the 4 to 6 tools valid in this phase, ≤ 60 tokens each
→ output       @Generable Step { action, target, text?, done?: boolean }
```

Guided generation (`@Generable`, constrained decoding) replaces free-form
tool calling: the model cannot produce a malformed call, cannot call a tool
that is not in the frame, and cannot "answer" when a step is required. The
engine executes the step, appends the receipt to the state summary and
builds the next frame. The model never sees history; the engine's summary is
the history, and it costs nothing to produce.

**Persistent session.** One helper daemon per browser instead of one process
per turn; one `LanguageModelSession` per conversation with `prewarm()`, the
transcript kept native-side so the KV cache survives between turns. Turn
latency drops from process spawn plus full prefill to a short incremental
prefill.

**Focused observations.** The engine ranks interactive elements against the
goal and the pending step (lexical match on label, role and nearby text, no
model call) and sends the top 40 with the `diff` encoding; the rest are a
one-line count. Full page text is never sent on an action turn. Answering a
question about a page uses the separate answer session that already exists,
with the text budget spent on the passage the ranker selects.

**Phases decide the tool set.** `observe` (read, find, wait), `act` (click,
fill, press, select, scroll), `navigate`, `answer`, `hand off`. The engine
picks the phase from the state, so the model chooses among a handful of
tools rather than 64, and `discover_tools` disappears from this tier.

**Deterministic plans for known intents.** Sign in, open a named settings
page, search a site, extract a table and the other 4.10 templates are
step lists the engine runs without the model; the model is consulted only at
uncertain hops (which of three matching links, is the task done). The
existing intent matchers in `aiAppleIntent.ts` become the entry point.

**Cheap escalation.** If a step repeats, the frame cannot fit, or the model
declares `done` without a matching receipt, the engine hands the goal and
its state summary to the next tier (local Ollama or cloud). The summary is a
few hundred tokens, so escalation does not restart the task.

Targets: 90 % completion on a fixture set of 20 template tasks and 60 % on
20 free-form single-site tasks, turn latency ≤ 1.5 s after prewarm, zero
loop-guard stops on the template set.

## 5. Performance budget

Measured locally, release build, warm browser, Delight dev app:

| Metric | Budget |
| --- | --- |
| Script call overhead (empty script) | ≤ 60 ms end to end |
| Page API call inside a run (snapshot, click) | ≤ 10 ms plus page time |
| `goto` on the Vite SPA with `load` | ≤ 500 ms |
| 10-step login + settings + verify script | ≤ 12 s wall clock, 0 model turns between steps |
| `read_page` compact payload, Delight dashboard | ≤ 1.5 KB |
| `list_tabs` for 25 tabs | ≤ 2 KB |
| `diff` observation between steps on the same document | ≤ 300 chars typical |
| Screenshot handed to a model (WebP, 0.5 scale) | ≤ 80 KB |
| Navigate: CDP attaches on the common path | 0 |
| Consent dialogs for a Standard-mode run with no sensitive actions | exactly 1 |
| Prompts for a Full-mode run in a trusted group | 0 |
| Prompts for a Full-mode run elsewhere | 0 unless a hard-floor action is hit |

Add a benchmark script under `apps/browser/src/__tests__/perf/` that runs the
Delight-style flow against a local fixture site and fails CI-local checks when
a budget regresses by more than 20 %.

## 6. Security invariants (must hold after every phase)

- No script can perform an action class the run did not declare and the
  user did not consent to; declared scope is shown verbatim in the dialog.
- Hard-floor actions review in every mode unless the group is marked trusted; the list is a single table with tests.
- A run that has read content from outside the group's own origins cannot
  run a shell command, a non-manifest script or write outside `docs/`
  without review, in any mode and in trusted groups too (4.8 taint rule).
- The local CA can only sign for `localhost` and loopback addresses
  (name constraints, 4.12); a leaf for any other name is rejected by test.
- Secrets never cross the MessagePort toward the script or the client.
- Scripts run without Node globals, filesystem or network; the only file paths
  are inside the linked project folder or approved upload selections.
- Stop, Take control and disabling external control cancel a run within 2 s
  and leave the page as it is (no rollback claims).
- Page content remains untrusted data; nothing in a snapshot can change scope,
  mode or consent.
- Origin, host and token checks on the endpoint are unchanged.

## 7. Delivery plan

Each phase ships on its own and leaves today's tools working.

**Phase 0, engine fixes (about a week).** 4.5 items 1, 6, 7b and 8, plus
the one-line change that stops `MCP_NAMES` filtering out the project tools
(4.9, their existing approvals apply unchanged; lands together with the
taint rule in 4.8, since exposing a shell to external clients without it
would be a regression). Item 2 (one protocol session per run) has nothing
to attach to until the script runtime exists and moves to Phase 1.
Acceptance: navigate on the Vite SPA ≤ 500 ms; MCP `read_page` compact
lines format; half-scale JPEG screenshots; project tools callable over MCP;
bridge start ≤ 100 ms; existing regression traces pass.

Phase 0 status, 2026-11-26 (source in this repository; measurements on the
fixture site are still owed, see section 9):

- Item 1 done. `approveDeparture` no longer inspects unload handlers;
  navigation dispatches immediately. A page whose `beforeunload` handler
  blocks leaving ends the action lease at once (`AIDepartureBlockedError`),
  Full access retries with the departure approved, other modes show the
  Leave page dialog first. `navigate` accepts `waitUntil`
  (`commit`, `domcontentloaded`, `load`, `networkidle`); networkidle is
  500 ms without a new HTTP request after load, ignoring WebSocket traffic.
  `hasAIUnloadHandlers` is removed.
- Item 6 done. `encoding: "lines"` on `read_page`, `wait_until`,
  `list_tabs` and `extract_rows` returns the same `semantic-v1` and TOON
  text the built-in assistant receives; the field never reaches the engine.
- Item 7b done as JPEG by default (see 4.5), `imageFormat` and `scale`
  on `screenshot`, MIME type carried in the MCP image result.
- Item 8 done on the setup side: `setup` copies the bridge to
  `~/.kudium/bin/kudium-mcp.cjs` and configures the client to launch that
  copy with the Node that ran setup, so no client start touches the npm
  registry. The app bundle already ships the same file under
  `Resources/mcp/`. First-call latency on the new configuration is not yet
  measured.
- Project tools over MCP: done together with the taint rule (below).

Phase 1 status, 2026-11-26:

- `act` and `run_script` are tools in the shared catalog (family `flows`),
  so the built-in assistant and MCP clients get the same engine path: a run
  is ordinary tool calls under one controller lease, with the external
  recovery checks per step. Budgets default to 120 s (max 600 s); Stop
  aborts the step signal and the sandbox renderer within the lease.
- The script runtime is a hidden, sandboxed Chromium renderer (no Node,
  in-memory partition that cancels every request, `default-src 'none'`
  document, permissions denied), not a Node `vm`. Each run executes in its
  own isolated world of a warm document, so no navigation is paid inside the
  budget and nothing from an earlier script is reachable; the renderer is
  recycled after 50 runs or any abort. The only bridge is the Page API over
  IPC, answered by the same tool implementations.
- Page API: `session()`, `page.goto/waitFor/waitForEvent/snapshot/find/
  click/doubleClick/hover/fill/press/select/scroll/back/forward/reload/
  screenshot/extract/upload/dialog/close`, `page.mouse.click/drag/draw/
  wheel`, `page.keyboard.type/press`, `page.drag`, `log()`. Targets:
  `@ref`, `text=`, `role=…[name=…]`, `css=`, `xpath=`, `href=`.
  `page.evaluate` and `page.fetch` are deliberately absent (see the taint
  discussion in 4.8): they are data channels, not reads.
- MCP sessions: `initialize` opens a stateful session (`Mcp-Session-Id`),
  token-bound, 30-minute idle timeout, DELETE ends it; sessionless requests
  from older bridges are still served one at a time. The bridge carries the
  session id. SSE progress streaming and the WebSocket channel are not
  built: measured bridge call overhead is 6 to 8 ms end to end, under the
  5 ms gain threshold in section 9, so the WebSocket item is dropped.
- Measured on the fixture (medians of 3, fresh engine): act flow of 11
  steps 494 ms, script flow of 16 engine steps 403 ms, Page API call 6 ms,
  navigate 10 ms with zero protocol attaches, screenshot 12 ms / 12 KB.
  Script call overhead (`return 1`) was 74 ms with a per-run document
  reload; with one isolated world per run it is 2 ms, Page API call
  overhead under 1 ms, act flow 478 ms, script flow 370 ms (Full access,
  2026-11-26 23:41 report under `apps/browser/release/perf/`).

Phase 2 status, 2026-11-26:

- One consent per run in Standard mode: `act`/`run_script` infer their scope
  statically (tool classes and literal origins from the steps or source),
  show it once, and `approve()` auto-approves covered (class, origin) pairs
  for the run; a step outside the scope prompts once and the answer is
  remembered. Sensitive actions (saved logins, uploads, closing user tabs,
  shell) still ask each time in Standard; Full access stays silent.
  Correction (same day, after a read-only run on a local page still showed
  the dialog): a run whose declared classes are all ones Standard already
  performs silently (`read`, same-site `navigate`, `project-read`) gets no
  consent dialog at all (`aiRunNeedsConsent`), and the dialog text is the
  scope only. The benchmark harness now runs in Full access, because the
  consent is a modal window its stub cannot answer; the Phase 1 run numbers
  taken after Phase 2 landed had been measuring that hang, not the engine.
- Hard floor: `request_access`/`set_scope`, saved payment card fills and
  uploads from outside the linked folder review in every mode unless the
  group is marked trusted. Trusted is a per-group setting in the group
  editor (`aiTrusted`), reported by `list_groups`, never set from the API.
- Taint rule: reads from any non-local origin taint the controller (built-in
  or external) until Take control, Resume, or a scope change; tainted shell
  commands, non-manifest scripts and file writes outside `docs/` review in
  every mode and trusted groups, naming the origins. Shell execution is
  otherwise a sensitive action (reviewed in Ask/Standard, automatic in Full).
- Session ownership: tabs a run opens are agent-owned; `close_tab` on them
  needs no dialog; `session.finish({ keep })` closes the rest.
- Receipts: every run writes one Activity entry (title, outcome, steps);
  the status line shows the current step. A dedicated live receipt panel
  with Stop / Take control is not built; the existing sidebar controls apply.
- Per-group controllers are NOT done: the built-in assistant and the MCP
  controller share one scope variable (`groupId`) across a 7,000-line
  closure, so separating them needs an async-context refactor of `ai.ts`.
  The one-controller-at-a-time rule stands; recorded in section 9.

Phase 3 status, 2026-11-26:

- Selectors (`css=`, `xpath=`, `href=`, `text=`, `role=…[name=…]`) on
  `find_element` and on click/type/hover/double_click/press_key/
  select_options, resolved in the same isolated-world program as read_page.
- Self-healing refs: a stale element ID is re-resolved by its recorded
  fingerprint when exactly one visible control still matches, for click,
  type, hover, double_click, press_key, select_options, read_options and
  wheel; uploads, drags and coordinate actions fail closed.
- `wait_until` composes url, label, selector (state), text, fn and
  loadState (load, domcontentloaded, networkidle); `wait_event` waits for
  the next download, popup tab or dialog from the tab.
- `then: "snapshot" | "diff"` on interactions returns the settled page
  (100 ms without DOM mutations, capped at 1 s, timers not animation frames
  so hidden windows settle too) or the element diff against the last read.
- Script `page.mouse`/`page.keyboard` map onto click_at, drag_at, wheel and
  the existing fill/press; clipboard paste waits for a paste tool.

Section 4.8 status, 2026-11-26:

- `kudium.workspace.json` (version 1) is the one configuration document per
  group: `group`, `project`, `tabs`, `scripts`, `terminals`, `siteSettings`,
  `skills`, `ai` (`mode`, `trusted`, named `sessions`). Validation is strict
  (unknown keys, secret-looking keys, absolute or escaping paths and
  credentialed URLs are rejected); the JSON Schema ships in
  `packages/mcp/kudium.workspace.schema.json`. `hooks` globs and script
  `shortcut` binding are not applied yet (`shortcut` is accepted and kept).
- Tools: `get_workspace_config` (file if present, otherwise generated from
  the browser's tabs, project scripts, site permissions and trusted flag;
  file-only keys carry over), `apply_workspace_config` (one native diff
  review listing tabs to open, commands that become runnable scripts, site
  permissions and group changes; nothing is ever removed; the `ai` block has
  its own confirmation; group fields change through the renderer-owned
  workspace save), `setup_project(folder, manifest?)` (reuses the group
  already linked to the folder or creates one from the first tab, links the
  folder through the Developer panel's own path, opens the remaining tabs,
  registers scripts and permissions, then confirms `ai`), plus
  `get_preferences` / `set_preferences` (account sync, advanced network
  settings and consent flags are hidden; every write reviews in every
  mode). The setup review covers the nested `create_group`/`new_tab` calls
  so they do not prompt a second time.
- `BROWSER.md` is replaced: `updateBrowserProjectContext` now merges the
  group block into the manifest, strips the old marker blocks from
  `BROWSER.md` (deleting it when nothing else remains), writes the one-line
  `AGENTS.md` reference and a `.mcp.json` entry (`.cursor/mcp.json` when
  that folder exists) holding only `npx -y @kudiumbrowser/mcp`. The bridge
  pairs on its first run when `~/.kudium/mcp-connection.json` is missing
  (approval dialog in Kudium, progress on stderr), so no token ever lands
  in the project. An existing `kudiumbrowser` entry is never replaced; a
  hand-edited manifest that no longer validates is left alone.
- Taint integration: the manifest's tab and site origins are the group's own
  set; browser scripts whose command appears in the manifest keep running
  silently when tainted. Project tools are now served over MCP (the
  in-app-only gate is gone). Manifest `skills` appear in `list_skills` with
  `project:` ids.
- The terminal-streaming part of 4.8 (`term.output()` over a channel) is not
  built: `project_terminal` read/poll stands in, consistent with dropping the
  WebSocket channel.

Phase 4 status, 2026-11-26 (built by two parallel forks; details in their
test files):

- 4.12 local https: `mcpCertificates.ts` generates a CA with X.509 Name
  Constraints limiting it to `localhost`, `127.0.0.1` and `::1`, proves at
  startup that a certificate for a foreign name is rejected, serves
  `https://localhost:<port+1>/mcp` beside http, and reports trust-store
  status per platform (manual steps where no tool exists). `/connect`
  advertises `httpsUrl` and the public `caPem`; `setup <agent> --https`
  stores the CA in `~/.kudium` and configures the bridge with
  `NODE_EXTRA_CA_CERTS`. Covered by `mcpCertificates.test.ts` and the
  connector test (a real TLS client accepts localhost and rejects a foreign
  name).
- 4.10 model tiers: `aiModelTiers.ts` classifies a request by shape with no
  model call, routes with the group's `aiTier` override first, warms local
  control models and flags bigger tasks; `aiLocalModels.ts` installs a local
  model from Preferences with every command shown and the licence
  acknowledged once; `aiFlowTemplates.ts` lets a small model pick a template
  and fill slots, rendered as a `run_script` call.
- 4.14 Apple loop: `aiAppleDaemon.ts` keeps one helper process and a
  session per conversation; `aiAppleEngineLoop.ts` owns the loop and the
  phase, feeds a focused observation and a short allowed-action list,
  validates the single returned step and escalates on repeats or overflow.
  The 20-task fixture trial in section 9 is still owed.

Phase 5 status (QA tools), 2026-11-26:

- Console and network logs: `read_console` and `read_requests` read per-tab
  ring buffers (500 entries) captured from tab creation; requests carry
  method, URL, type, status, cache flag, duration and error, never bodies or
  headers; credential-looking URL values and card-like digit runs are
  redacted before storage; `filter` takes a substring or `/pattern/`. Both
  are tainting reads. Script: `page.console()`, `page.requests()`.
- `wait_until { request }` composes with the other conditions: a request
  matching the substring or pattern must start after the wait began.
  Script: `page.waitFor({ request })`.
- Viewport emulation: `set_viewport` (width, height, mobile, deviceScale,
  colorScheme, reset) uses native device emulation, silent on agent-opened
  tabs and reviewed on the user's tabs; every emulation is removed when the
  run ends. Approximation: the light/dark toggle is the browser-wide native
  theme while active (restored on reset), because Electron has no per-tab
  colour-scheme switch without a permanently attached debugger.
- Screenshot diff: `screenshot { compareTo, threshold }` compares against a
  baseline PNG/JPEG at the baseline's size and returns `changedRatio`,
  `same` (default threshold 0.005) and a diff image (changed pixels red
  over the dimmed baseline); over MCP the diff is a second image. Script:
  `page.screenshot({ compareTo, threshold })` with the diff in the run's
  images.
- Not built: request bodies/response headers (by design), per-tab colour
  scheme, live console streaming (reads are polled), and console/network
  capture inside the sandboxed script renderer.

Phase 5 status (governance), 2026-11-26:

- Per-agent identity: `/connect` with `{ name }` issues a per-client token
  (`mcpClients.ts`), the approval dialog names the client, settings show
  clients with a permission ceiling and one-click revoke; the ceiling caps
  `taskAccessMode` per external call (a Standard-capped client behaves as
  Standard in a Full group); the shared connector token remains the default
  client, named from `clientInfo.name`; receipts, Activity titles and audit
  lines carry the client name. `setup` passes the agent name; the first-run
  project bridge pairs as "Project bridge".
- Audit log: one JSON line per run (`ai-audit.jsonl`: agent, group, intent,
  steps, approvals with answers and reasons, outcome, caps usage),
  `auditRetentionDays` preference (90) pruned at startup, Export button in
  External AI, `export_audit_log` tool (returns lines, or writes a `.jsonl`
  after native review; arguments are `auditSince`/`auditPath` because
  `since` and `destination` already mean other things).
- Contract version: `1.0.0` in `serverInfo.version`, the guide and
  SKILL.md `contract:`; the one-minor-version compatibility rule is stated
  in the guide. No field has been removed yet, so the rule is untested.
- Run caps: navigations/tabs/uploads/projectBytes per run, defaults
  200/20/20/5 MB, `caps` on act and run_script, enforced before each step
  with the cap named in the receipt. Bytes are counted from `project_files`
  save/create text; other write paths are not metered.
- SKILL.md shipped in `packages/mcp` (mirrored into `apps/browser/mcp`),
  `npx @kudiumbrowser/mcp skill` prints it. Windows/Linux: Auto routing no
  longer picks Assist off macOS and the group editor says so.
- Not built: per-client audit retention or export filters; the ceiling
  applies to external clients only (the built-in assistant is uncapped).

Phase 5 status (sessions, scheduling, tab search), 2026-11-26:

- `find_tabs({ query, origin, groupId, signedIn, limit })` ranks open tabs
  by fuzzy match over title, URL, group name and the signed-in account
  reference; returns group, tab and session fields, `encoding: "lines"`
  supported. `list_groups` adds `sessions` (origins with cookies in the
  group's partition, matched to the saved-login title; never a value),
  cached per partition until its cookie-change event.
- Named sessions: `s.page("name")` resolves `ai.sessions[name].tabs` from
  the group's `kudium.workspace.json` to an open tab, opening the first URL
  when none is open.
- Groups in the run consent: `act`/`run_script` accept `groups`; the single
  Standard consent lists them; `switch_group` (page API `s.useGroup`)
  switches inside the declared set without a dialog and fails outside it;
  Full access switches automatically.
- Disposable sessions: `new_tab { disposable: true }` /
  `s.newPage(url, { disposable: true })` open an agent-owned tab in a fresh
  in-memory partition (no `persist:`), cleared when the run closes it.
- Scheduled scripts: `create_task` carries `script`; the scheduler replays
  it through `run_script` with no model, records receipts, and falls back
  to the instructions only when the script fails and the window is visible.
  Scripted tasks may run while the window is hidden (approximation: not
  limited to agent-owned tabs).
- Save as flow: `save_flow({ name, from, receipts?, flowDestination })`
  renders the last run's trace (targets resolved to `text=`/`role=`/`css=`
  selectors, no element ids) into a `run_script` body and, after native
  review showing the script, stores it as a group skill or as
  `.kudium/flows/<slug>/SKILL.md` listed in the manifest `skills`.
- Clipboard: `read_clipboard` / `s.clipboard.read()` goes through the
  saved-data (private) review in every mode; text capped at 20,000
  characters.
- Not built: cookie-to-account matching beyond title lookup; Assist-tier
  disambiguation of search candidates; a receipt panel for background runs.

Phase 6 status, 2026-11-26 (browser side; backend in `apps/web/src/relay`):

- Built: relay client with outbound WebSocket (`wss://<relay>/relay/device`,
  device-token bearer), hello/ping-pong, reconnect with exponential backoff
  (1 s to 60 s), per-request 30 s deadline and `cancel` handling; `request`
  frames replayed as loopback MCP requests with `Mcp-Session-Id` in and
  out, so the relay path shares auth, sessions and tool execution with
  local clients; `consent` frames answered through the connector-approval
  dialog naming the client and redirect host, with Ask first or Standard as
  the only grants; connector identity and ceiling delivered to the engine
  via a loopback-only header and enforced as a cap on the access mode
  (trusted-group bypass disabled for relay connectors); remote safety
  defaults (new connectors capped at Standard, project/workspace tools
  refused remotely unless "Allow project tools remotely" is on, every
  remote session ended when the relay or external control is turned off or
  a connector revoked, tested under 2 s); `e2e` envelopes for Kudium's own
  clients (X25519 ECDH, HKDF-SHA256, AES-256-GCM; malformed envelopes
  ignored, never answered in plaintext); cloudflared quick tunnel (installed
  binary only, URL parsed from its output, killed on stop/disable/quit);
  settings card (pair, on/off, connectors with ceiling and revoke,
  project-tools switch, remove device, quick tunnel, status); tests for
  parsing, crypto round trip and tampering, pairing, routing with ceiling
  clamp and session teardown, consent, disable timing, quick tunnel, and an
  end-to-end run through the real MCP server.
- Approximated: pairing is by pasting the device token the relay shows once
  (account-bearer device creation exists but is not wired to the UI); the
  relay's OAuth consent flow is exercised only through the `consent` frame
  contract; third-party cloud clients remain plaintext at the relay, as the
  design doc states.
- Not built: e2e for third-party clients (impossible by design),
  Windows/Linux paths for cloudflared beyond PATH lookup.
- Needs the hosted backend to verify: ciphertext-only relay logs, OAuth
  authorize/token round trip with a real claude.ai connector, idle-timeout
  and rate-limit behaviour, and the 2 s session drop measured end to end.

**Phase 1, `run_script`, CLI and project tools (three weeks).** 4.1 sessions, WebSocket channel and
streaming, 4.2 tool and CLI, 4.3 runtime, 4.6 secrets, 4.8 project tools in the script API. Standard mode still
reviews per action inside a run (consent per run comes next). Acceptance: the
10-step Delight flow runs as one script in Full mode within budget; `act`
steps share the engine path; abort and budget tests; runtime sandbox tests
(no `require`, no `process`, no outbound fetch).

**Phase 2, consent and sessions (two weeks).** 4.4: scope declaration and
inference, one consent per run in Standard mode, sensitive and hard-floor tables, trusted groups, workspace manifest and `setup_project` (4.8),
per-group controllers, session ownership and `finish`/`handOff`, receipt
panel with Stop / Take control. Acceptance: exactly one dialog for a
Standard run with no sensitive step; a Full-mode run shows zero prompts; a hard-floor step still reviews outside a trusted group;
built-in and external agents run in two groups concurrently.

**Phase 3, targeting and waits (one to two weeks).** 4.5 items 3, 4, 5, 7 and
4.7. Acceptance: consecutive actions without an intermediate read; selector
suite over the fixture site; `wait_event` for download and popup.

**Phase 4, local https and model tiers (two to three weeks).** 4.12 local CA
and https endpoint with client trust setup; 4.10 one-click local model
install, task-shape routing, flow templates, loop-guard tier suggestion;
4.14 Apple daemon with persistent session, engine-driven loop with guided
single-step output, focused observations and escalation.
Acceptance: Claude Code connects over https with no manual steps; a
template flow completes on the Apple model; a planning request routes to the
local model.

**Phase 5, QA tools, tab search and governance (two to three weeks).** 4.13 tab search and session identity; 4.11 console and
network logs, viewport emulation, screenshot diff, save-as-flow, disposable
sessions, scheduled scripts, hidden-window runs, per-agent tokens and
ceilings, audit export, run caps, contract version, `SKILL.md`. Acceptance:
a recorded Delight login flow replays as a scheduled script with no model;
two clients with different ceilings get different prompts in the same group.

**Phase 6, relay (three to four weeks, needs the backend).** 4.12 cloud
relay with OAuth, end-to-end encryption, quick-tunnel fallback and the remote
safety defaults. Acceptance: a claude.ai connector pairs through the
approval dialog; the relay logs show ciphertext only; disabling external
control drops the session within 2 s.

## 8. Open questions

1. Should `act` be exposed at all, or should MCP-only agents be told to use
   `run_script` with a trivial body? Keeping one surface is simpler; `act` is
   friendlier for small models that cannot write JavaScript.
2. Scope inference: static analysis of the script is cheap but approximate.
   Proposal: infer, show, and let the user edit the scope in the consent
   dialog; a step outside the final scope fails, it never prompts mid-run.
3. `page.cdp` is useful for diagnosis but is the one API that can bypass the
   isolated-world guarantees. Proposal: Full mode only, allowlist of domains
   (`DOM`, `Runtime` in world 1004, `Input`, `Network` read-only, `Page`
   read-only), each call reviewed once per run.
4. Whether to let a run span groups. Proposal: no; one run, one group, which
   matches scope semantics and the lock.

## 9. What is still unproven, and what closes it

This document is a proposal built from source reading and one day of
measurements of the current system. The items below are the gap between
"good enough to start" and "settled". Each names the evidence that would
close it.

| Area | Status | What closes it |
| --- | --- | --- |
| Time estimates per phase | guessed from code size, not from building | a one-week Phase 0 spike; re-estimate the rest from how long it really took |
| Performance budget (section 5) | green: every budget in `__tests__/perf/budgets.json` passes on the Phase 3 build in Full access (`npm run test:agent-perf`) | keep the harness in CI-free local runs; re-baseline only with a reason |
| Apple tier targets (4.14) | 90 % / 60 % are aims, not results | a 20-task fixture set and one week of trials with guided generation; keep the design, publish whatever the numbers are |
| Scope inference (4.4) | "static pass over the source" is unspecified | write the analyser, log hit/miss on 50 recorded runs; if misses exceed 10 %, make the lazy prompt the primary path and inference a hint |
| Self-healing refs (4.5 item 3) | fingerprint fields chosen by intuition | measure false matches on the fixture site after DOM churn (list reorder, label change); require zero wrong-element actions |
| Relay (4.12) | sketch of a service with OAuth, E2E encryption and abuse handling | its own spec: hosting, key exchange, rate limits, cost per device, incident response; not before Phase 6 |
| Local CA on Linux (4.12) | trust-store handling varies by distro | test on Ubuntu, Fedora and Arch with Firefox and Chromium clients; document the manual fallback |
| Node client trust (4.12) | the bridge is configured with `NODE_EXTRA_CA_CERTS`; the connector test verifies a real Node TLS client against the CA | still verify with the Node versions Claude Code, Codex and Cursor bundle |
| Fixture site | done: `apps/browser/demo/fixture` (login form, table, beforeunload page, iframe, long list) behind `npm run test:agent-perf` | keep budgets in `__tests__/perf/budgets.json` pass/fail |
| Session identity (4.13) | cookie-to-saved-login matching is a heuristic | precision on the user's real groups; show the matched account name in the UI so a wrong match is visible and correctable |
| Workspace manifest (4.8) | done: `version: 1`, JSON Schema in `packages/mcp`, migration test from the `BROWSER.md` block (`browserProjectContext.test.ts`) | hooks globs and shortcut binding remain |
| WebSocket channel (4.1) | measured: bridge call overhead 6–8 ms end to end on the Phase 1 build, under the 5 ms gain threshold | dropped; revisit only if streaming terminal output needs it |
| Parity tests (4.9) | rule stated, suite not designed | a trace runner that executes each recorded trace through both paths and diffs receipts and prompts |
| Open questions (section 8) | four decisions pending | decide before Phase 1 starts; each is a one-line change in the spec |

Rule for this table: an item moves out of it only with a number or a test,
never with an opinion.

## 10. References

- Measurements and raw tool contract dumps from 2026-11-26 are in the session
  scratchpad (`kudium-tools.json`, `kudium-guide.md`, `ego-guide.md`).
- Source studied: `apps/browser/src/main/{mcp,ai,aiExecution,aiActionApproval,aiObservation,aiNavigation,aiFrames,aiProtocol,aiWait,aiPrivateInputLease}.ts`,
  `apps/browser/src/browser/{aiPermissions,aiObservationFormat,aiSnapshot,mcp}.ts`,
  `packages/mcp/{cli,bridge}.cjs`, `docs/ai-capability-contracts.md`,
  `docs/ai-tool-discovery.md`.
- Ego lite guide v2.2.1 (`ego-browser skill`) for the script API shape.
