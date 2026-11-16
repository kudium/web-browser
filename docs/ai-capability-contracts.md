# AI capability completion contracts

Tool descriptions explain what an agent can do. Completion contracts define the
evidence Kudium requires before marking a requested capability completed.

The registry is `apps/browser/src/browser/aiCapabilityContracts.ts`. The built-in
agent uses `AICompletionContract` before accepting a final response. Hook tools
return structured save receipts to both the built-in agent and external MCP
clients. External clients own their execution loops; Kudium cannot enforce their
completion decisions.

## Adding a capability

1. Define narrowly identifiable user requests and explicit exclusions. Questions,
   source-code-only requests and operations where the capability is merely an
   option must not force persistent changes.
2. Specify which tools return completion evidence. Observations, previews and
   assistant prose are not write receipts.
3. Return status and scope, and distinguish verified configuration from verified
   runtime behavior. Preserve existing fields for tool clients.
4. Provide a bounded recovery instruction for an omitted workflow. Do not
   automatically repeat denied, failed or unverified writes. Respect cancellation.
5. Preserve receipts and the recovery limit through pause/resume. Never let an
   unrelated earlier conversation's receipt satisfy a new request.
6. Add regression traces for natural-language variants, missed tools, previews,
   unsuccessful writes, approval denial, cancellation, continuation and exclusions.

## Hook contract

An explicit hook installation/edit request requires a `configure_site_hooks` or
`save_global_hook` result with `saved: true` and `verified: true`. An omitted save
gets one recovery turn. Without that receipt, final execution remains incomplete
and the response includes a browser-generated notice. An unverified write is not
automatically repeated. Native denials retain the actual error and `denied` status.

Save receipts include `capability`, `status`, `scope`, and `runtimeVerified: false`.
The latter deliberately prevents configuration verification from being mistaken
for proof that a hook ran. Site receipts also return the configuration hash and
whether a reload is required.

## Validation limits

The automated suite validates discovery, tool traces, receipts and recovery logic.
It does not establish model adherence. Before changing supported models or agent
prompts, run representative requests against those models in a disposable browser
profile and examine tool traces and native review outcomes. Include “create a hook
for this website”, “script this website”, general website operations, code-only
requests, and a denied review. Never run side-effecting model evaluations against
real accounts by default.
