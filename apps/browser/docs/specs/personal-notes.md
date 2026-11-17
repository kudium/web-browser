# Personal notes

Notes use the existing Assistant / Tasks / Developer / Notes tabs and remain accessible under Personal Data. A small history button opens the same collapsible, pinnable sidebar pattern as chat history. The title and writing area remain undecorated; formatting appears on text selection or through Aa. Group assignment, AI access, locking and deletion live under Note options. The body is a Tiptap visual editor with Markdown parsing and serialization, headings, lists, code blocks and inline formatting. Cmd/Ctrl+B and Cmd/Ctrl+I toggle bold and italic; standard undo/redo stays local to the selected note. Autosave does not replace editor content or reset selection. Popovers/dialogs reuse the panel wrappers. Assistant and Notes reuse the same compact history/new-item controls; expanded history owns those actions inside its heading.

The visual editor loads lazily. Production CSP authorizes the exact bytes of every
emitted JavaScript chunk, and Webpack attaches SHA-256 integrity metadata to both
initial scripts and lazy chunks. Arbitrary local scripts, inline handlers and
modified chunks remain blocked. An editor load failure preserves the draft and
offers plain Markdown recovery.

After `npm run build:browser`, run `npm run test:browser:notes-editor` from the
repository root. The native check loads the production renderer and preload with
synthetic note IPC inside a disposable ASAR, verifies formatting, autosave and mode
switching, rejects modified lazy chunks, and exercises the renderer injection/tamper
regression. Evidence is saved under `apps/browser/release/local-notes-editor-*`.
It does not sign, install or publish a release or use the user's notes.

The same regression also audits every emitted renderer script against its CSP
hash and lazy-load integrity metadata, then loads a real two-page PDF in Developer
Files inside the ASAR. It checks rendered canvas pixels, page navigation and zoom
without policy violations. The source audit found Notes as the only renderer
import that emits lazy chunks; PDF preview's imports are deliberately eager.
Main-process PDF extraction uses the Node chunk loader and is outside renderer CSP.

Ordinary notes require no Personal Data password. They use OS-encrypted immutable content files and an encrypted title-only index. Browsing titles never decrypts note bodies; selecting a note loads only that note, and debounced autosave updates only its content file and the index. Writes use owner-only files and atomic index replacement. Each note is capped at 100,000 characters and each note store at 1,000 records.

Lock note marks the record sensitive and moves it into the protected Personal Data vault after authentication. Opening, editing, moving, deleting or removing protection from a locked note requires that existing vault grant. Lock now, OS lock and process shutdown revoke it. Ordinary drafts remain usable when Personal Data locks; sensitive content is cleared. Locked notes keep their title and lock indicator in the sidebar. Existing unmarked notes in the encrypted vault are moved to ordinary note storage once when that vault is available.

Browser-wide notes are accessible across groups. Explicit assignment changes the note's Personal Data scope, and group removal handles ordinary notes even when no protected vault exists. Scoped content reads reject other groups.

AI access is off per note by default. Personal Data tools find relevant note titles only on demand, return no note excerpts during search, and read at most 2,000 characters with a continuation offset. Existing recipient disclosure review remains in place. Sensitive-note reads additionally require authentication. Notes never preload into chat context.

Sync offers manual encrypted backup and restore using the account recovery key. Ordinary-note backups do not unlock the protected vault; including or restoring sensitive notes does. Snapshots include scope and sensitivity, omit AI grants, and are bounded to 1,000 notes / 1,000,000 combined characters. Restore validates the complete snapshot, keeps existing notes, skips identical copies, and disables AI on restored records. Groups restored on another device currently receive new IDs; notes can be reassigned through their group picker. iCloud remains unavailable; notes backup uses the connected Kudium account.

The AI `manage_note` tool creates, updates and deletes notes at the user's request, including recording research findings. Created notes allow AI access; managing existing notes requires their AI access grant and sensitive notes require authentication. Writes set `asRead: false`; opening the note marks it read. Legacy notes default to read. The Notes toolbar shows an unread count and history rows show an unread dot. Tool results include an in-app Markdown deep link (`#kudiumbrowser-note-<id>`) that opens the selected note from chat. These links are local to the app, not public web URLs.
