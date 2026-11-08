# MCP private marker durability — November 7, 2026

External saved-fact disclosure must preserve its downstream review requirement across restart. The previous writer synchronized temporary file contents and renamed them, but did not synchronize the parent directory. It also treated a marker loaded after process restart as already acknowledged. This left the required durable write sequence incomplete.

`privateFile.ts` now provides an explicit durable-write option that synchronizes the parent directory after rename and closes its descriptor even on failure. `mcp.ts` requires this option for any persisted settings carrying the private marker. A newly constructed controller must confirm the marker again before returning new private facts, including when it loads a true marker left by an interrupted write. Failed writes retain the runtime review restriction, throw before the saved-fact return, and remain retryable. An acknowledged marker is cached for that controller, so repeated disclosures do not perform repeated syncs. Settings without a private marker retain their existing write behavior.

| Injected filesystem case | Before | After |
| --- | --- | --- |
| Directory sync fails after first rename | Marker call returns | Marker call throws |
| Restart observes renamed marker; directory sync fails | Marker call returns | Marker call throws |
| Successful retry | Marker call returns | File sync → rename → directory sync, then returns |
| Repeated acknowledged marker | No write | No write |

`.erb/scripts/mcp-marker-durability-smoke.cjs before/after` bundles the actual MCP controller and private writer, uses a disposable settings file and records filesystem operation order. Fault injection targets directory fsync only, after a real successful rename. Its returned flag measures whether `markPrivateDataDisclosed()` returns, the synchronous prerequisite used in `ai.ts` before approved facts return to the external client. It does not claim that an RPC/provider transmission occurred. Retained before source is in `baselines/mcp-marker-durability/`; hashes and results are in `mcp-marker-durability.json`. The probe is registered in the desktop checks.

Unit coverage verifies post-rename failure, runtime restriction, process restart, successful retry, cached acknowledgement and temporary-file cleanup. All 142 suites /732 tests, lint/types and production build pass. Final outcomes and source/log hashes are in `mcp-marker-durability-verification.json`.

This verifies the required filesystem-call ordering and failure handling on this macOS filesystem. It does not prove persistence during physical power loss or storage hardware failure. Directory sync errors are propagated; platforms/filesystems that cannot perform it refuse the private disclosure prerequisite. Windows/Linux compatibility and power-loss release validation remain open. Conversation/task storage, private descendant/worker/existing-channel network containment, full sidebar takeover, compositor checks and signed/platform release gates remain open. Production readiness remains unproven.
