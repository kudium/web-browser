# Interrupted keyboard cleanup — November 7, 2026

AI protocol sessions previously tracked pointer presses for cleanup but did not track held keyboard keys. Stop, timeout or action failure between key-down and key-up could detach without releasing the key.

`src/main/aiProtocol.ts` now retains a bounded set of 64 held keys, separated by debugger session and key identity. It records ownership before native dispatch to cover pending acknowledgements. Cleanup releases held keys in reverse order, in their original sessions, without text, command payloads or repeating acknowledged key-ups. Normal completion also cleans up an incomplete key sequence. Existing debugger ownership and 250ms maximum cleanup wait are retained.

| Native case | Before | After |
| --- | --- | --- |
| Stop after acknowledged key-down | 0 key-up events | 1 trusted key-up event |
| Action failure after acknowledged key-down | 0 key-up events | 1 trusted key-up event |
| Complete key press | 2 commands, 1 key-up | 2 commands, 1 key-up |

The retained baseline is `baselines/key-release/aiProtocol.ts.txt`. `.erb/scripts/key-release-smoke.cjs before/after` executes actual `withAIProtocol` against a disposable hidden native WebContentsView. Each case requires a trusted key-down, validates actual key-up delivery and debugger detachment, and records commands/events and source hashes in `key-release.json`. It uses synthetic values and neither OS clipboard nor physical keyboard. The after probe is registered in the desktop check runner.

Unit coverage includes root/child session releases, removal of text/commands, acknowledged release without duplication, Stop during an unresponsive key-down, stalled key-up cleanup bounded to 250ms, and timeout. All 142 suites /731 tests and the production build pass. The full suite ran before a test-only lint refactor of the same sequential root/child calls; the final focused protocol suite passes 16 tests. Final lint/type outcome and hashed logs are recorded in `key-release-verification.json`.

No extra native command is added to completed key presses. Cleanup adds only releases for outstanding keys; this is a correctness/control-handoff fix, not a whole-app performance claim. Actual iframe release delivery, simultaneous physical/AI key state, full renderer/sidebar takeover, navigation during input, and unavailable/disconnected renderer delivery remain unproven. The pointer capture/resize diagnostic and private descendant/worker/existing-channel containment and signed/platform gates remain open.
