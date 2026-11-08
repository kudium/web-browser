# Live AI project workflow smoke test

Tested on 2026-11-07 in the running Kudium Browser development app using its native UI and the configured external model `gemini-3.5-flash-lite`. No AI responses or project tools were mocked.

Created a disposable project at `/path/to/kudium-browser-e2e-demo` with an HTML page and a Node assertion test. Served it on `http://127.0.0.1:47831/`, opened its tab, moved the tab to a new group (`hocafy · Group 2`, slug `hocafy-2`), and linked the project using the native folder picker.

Started a new AI chat and referenced `@hocafy-2`. Asked it to inspect/edit `index.html`, read `test.cjs`, save a project script named `Test website` with command `node test.cjs`, run it, read the result, reload the website, and verify the heading. The app narrowed scope to the referenced group. The explicit command-review dialog was approved for this requested disposable test.

Verified:
- The on-disk HTML was edited by the app AI to include `Website updated by Kudium Browser AI` and compact CSS.
- The Developer Scripts menu contains `Test website` with command `node test.cjs`.
- The built-in terminal output contains `PASS: website heading was updated`.
- The browser page shows the updated heading after the AI reloaded it.
- The AI final response reports the edit, script, test result, and browser verification.

Observed limitations: immediately after moving the tab, Developer briefly displayed `This group is no longer available`; linking the folder recovered it. The new group inherited the old group's base name. Shell startup printed an existing nvm/npm_config_prefix warning, but the test ran successfully. The terminal remains an interactive shell after the test command finishes.

The demo project and group are retained for inspection. The temporary HTTP server is stopped after testing; restart it with `python3 -m http.server 47831 --bind 127.0.0.1 --directory /path/to/kudium-browser-e2e-demo`.

Follow-up AI guidance now asks for actionable optional choices using the existing request_user_feedback tool (for example Add test script, Run tests, Preview website), grounded in inspected files and existing scripts. This guidance change has schema/project regression coverage, but its suggestion behavior was not separately exercised in a live conversation.
