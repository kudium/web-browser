# Native save dialog and download continuation

The Electron 45/macOS arm64 fixture passed a real native save picker followed by MCP artifact verification and native file reattachment. The picker was operated through CUA accessibility controls, with the destination chosen by the human side of the test. It was not replaced by a mocked save dialog or synthetic file path.

The first download reports `awaitingSaveLocation:true`. Selecting `chosen-test.txt` completes the same download ID. `get_download` verifies the existing regular file and exact bytes, then `upload_files` attaches that file to a real file input and verifies its contents. The server sees exactly one request for this workflow. A second, explicitly requested download exercises native Cancel; its manager record becomes cancelled and offers no artifact or outstanding save-location flag.

[Raw evidence](ai-native-save-dialog.json) contains the successful stages, environment, fixture hash and limits. This proves the human-choice save handoff and continuation. It does not implement agent-selected native destinations, programmatic picker dismissal, or arbitrary native file dialogs. Action approval is fixture-approved; this test specifically verifies the real OS save picker and artifact workflow.

To reproduce on macOS from the repository:

```sh
node .erb/scripts/run-ai-save-dialog-smoke.cjs
```

The launcher prints an `ISOLATED_APP` path. Bind CUA to that exact app path; the distinct identity prevents selecting the user's running TouchBox. At `CHOOSE_SAVE`, set the native Save As field to `chosen-test.txt` and click Save. The native folder already points to the disposable test directory. After `SAVED_AND_REATTACHED`, the second picker appears: click Cancel. The terminal must report `PASS` and exit zero. Only this titled fixture and its generated files should be operated. Close any default Electron window relaunched by the UI driver after the fixture exits, then remove the printed disposable app bundle directory.

The successful recorded run used the equivalent manual bundle clone/identity setup before launching the same fixture. The convenience launcher has passed syntax checks. The test has a four-minute overall deadline and bounded per-operation download waits; an observation timeout is not evidence of a successful save or cancellation.
