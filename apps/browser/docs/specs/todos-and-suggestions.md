# Todo notes, Today and suggested actions

Notes and todo lists share the existing Notes panel, group picker, encrypted note
store and backup path. New todo creates a note containing structured task records;
ordinary notes remain Markdown. Tasks have stable IDs, titles, optional completion
timestamps and an optional local calendar date for Today. The encrypted title index
contains the note type and inbox marker, never task titles or completion content.

Today is a permanent view pinned by default in the notes list, including empty
libraries. Every note supports Pin/Unpin through its lazy native context menu.
Pins use the existing local page-preference store, remain above other notes, and
survive reopening. Today can also be unpinned; it remains available in the list. It opens the shared checklist without creating a new note every day. Direct additions go into the
browser-wide Tasks inbox, or the selected group's inbox when filtering that group.
Tasks from other todo notes can be added to Today without copying them. Yesterday's
unfinished tasks remain in their owning lists; the daily selection resets at
local midnight. Today shows only selected tasks. Use the date picker on a task to schedule Today or another calendar date.
Future tasks appear in Today and its suggestion queue only on their scheduled
local date. The saved `today` field holds this date and survives encrypted backup.
Quick choices include Today, Tomorrow and Next week; the calendar stages changes
until Apply. Clear removes the date. Previous dates remain on the task in its
owning list; they are not automatically rolled forward. Focus and group-lock events refresh the view.
Protected todo notes retain normal authentication and editing, but are excluded
from Today and the suggestion surface. Task titles can be edited, reordered,
completed, restored and deleted through the same checklist in Today and their
owning todo note. Drag handles appear on hover or focus; Alt + arrow keys provide
keyboard reordering. Drops save one task mutation. Note order follows the saved
items array; Today has a separate encrypted numeric rank (`todayOrder`) so tasks
from different lists can be ordered without changing their owning lists. Manual
Today ordering refreshes the suggestion queue; Next still rotates only the session
queue.

The bottom sidebar hosts separate Today and Hooks queues, with one expanded card.
Today comes first unless the user selects Hooks. New entries append behind the
current action. Next rotates the current entry to the end of its session queue; it
never completes a task or removes it from Today. The queue count opens a compact
picker. Clicking a task opens its owning note and focuses that checkbox. Complete
persists the change and advances immediately without a completion card. Completed
tasks can be unchecked in their owning todo note. With one entry, Next is disabled. Discover
recommendations return when both action queues are empty.

Todo suggestions recognize website URLs, common bare domains, email addresses and
phone numbers in the task title. `My Email: me@example.com`, `Mobile: +1 (416)
555-0123`, and Markdown `[My inbox](https://mail.example.com)` keep their labels
on compact link actions inside the card. Two links are visible; further links go
in a small picker. Repeated destinations are deduplicated. Clicking a link does
not complete the task. Web links reuse the current group's shared navigation;
email and phone links use the existing external application route. Only the
visible task is parsed, with no network or filesystem lookup. Executable/local
file schemes and credential-bearing URLs never become actions.

Task queues subscribe to a content-free todos-changed event, rather than scanning
notes on every ordinary-note autosave. Reads load only todo note bodies and reuse
the encrypted store's content cache. Each list is bounded to 500 tasks; normal note
and backup limits still apply, with structured tasks counted in the backup size.
Queues cancel/ignore stale renderer responses on scope changes.

## Page hook API

Approved installed page hooks receive the following context APIs. They cannot read
or change unrelated notes. Task creation uses the existing scoped note save path,
with AI access off. Temporary suggestions belong to the originating window, group,
page and approved hook run, and disappear on navigation, hook cleanup, removal,
revocation or expiry. Opening the card/picker never invokes its action.

```js
context.suggestions.onAction('review', async () => {
  // Invoke the hook's own page behavior. Reject to keep the card for retry.
  await reviewCurrentPage();
});
await context.suggestions.upsert({
  key: 'review-page',
  title: 'Review this page',
  description: 'Check the items you highlighted.',
  actionId: 'review',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});
await context.suggestions.remove('review-page');

const saved = await context.todos.create({
  key: 'follow-up-page',
  title: 'Follow up on this page',
  today: true,
});
// saved.recordId, saved.taskId (on first creation), saved.deepLink
```

Register onAction before upsert. Keys/action IDs use 1–100 letters, digits,
underscores or hyphens. Suggestions accept titles up to 200 characters and
optional descriptions up to 500. Expiry defaults to one hour and must be within
24 hours. A page may hold at most 20 suggestions; the existing ten-output-per-minute
limit also applies. Reusing a key updates its entry without moving it in the queue.
Run revalidates the originating hook and resolves only a matching invocation
response. Failures remain queued. The UI waits at most ten seconds; after a timeout,
a duplicate run is blocked until the original invocation finishes or its source
is cleaned up. A late successful response resolves that original suggestion.

Saved tasks are separate from transient suggestions. Creation requires a key and a
title up to 500 characters; today is optional. Keys deduplicate within the hook,
origin and source scope across runs. They create a separate attributed todo note,
never append to an arbitrary user list. Repeating a key returns the existing note;
it does not overwrite user edits or recreate completed tasks. Saved tasks survive
hook removal. Keys are retained inside encrypted note content and backups.

## Declarative hook actions

Context-menu action scripts can create saved tasks through api.todos.create with
the same key/title/today shape. The portable capability name is todos.create.
Choosing the existing scoped hook action authorizes its output, consistent with
notes.create; previews never write tasks. Transient onAction callbacks belong to
live page hooks, not the short-lived context-menu action sandbox.


## AI creation

The `todos` AI family exposes `create_todo` to the assistant and external MCP
clients. User requests mentioning Today, todos, checklists or creating tasks load
it automatically. It creates one task per call through the same `addTodo` path as
the UI, defaulting to the current local date and group. `today:false` leaves the
task unscheduled; `destination:browser` explicitly chooses the shared inbox.
Optional `todoDetails` stores Markdown details. The response supplies the task ID,
owning note ID, selected date and note link without reading other task content.
It preserves existing task lists' AI-access settings and group locks. Creation
uses the normal saved-data action approval and cancels when scope, tab ownership
or permissions change during review. `create_task` remains a separate tool for
scheduled AI runs. Inbox/page content alone never authorizes todo creation.
