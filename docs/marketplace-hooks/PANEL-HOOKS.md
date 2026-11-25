# Panel hooks — November 25, 2026

These are portable marketplace packages, compatible with stable Kudium 1.0.23.
They register a panel without automatically revealing it or starting playback.
Choose the named output in Panels after installation. No installer release is
required to use these packages.

## Research

- [Reddit: reviewing very large GitHub PRs](https://www.reddit.com/r/github/comments/1tgd329/how_do_people_usually_handle_reviewing_very_large/): the author describes losing track across review sessions and new commits. Replies favor smaller PRs and local review; a navigator is a convenience, not a substitute for either practice.
- [Reddit: natural read-aloud for websites/textbooks](https://www.reddit.com/r/audiobooks/comments/1kf0by8/anyone_found_a_good_readaloud_tool_for/): direct page extraction, less copy/paste, natural voices and student-friendly pricing are recurring requests. Replies mention Edge, ElevenReader, Speechify and local XTTS.
- [MDN: localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService): distinguishes local speech services from remote voices. The player explicitly selects local voices only.
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api): reviewed on November 25. The Free/Pay-as-you-go column lists 10,000 characters for standard TTS models and 20,000 for faster variants. This is a limited allowance, not unlimited free speech, and requires an account/key. The current hook uses the free Web Speech API with installed Mac voices instead.

## Published packages

- [Listen to this page](https://browser.kudium.com/hooks/9594f984-2792-4e3e-ab02-489943094819): article/selection extraction; voice and speed selection;
  play/pause/resume/stop, passage navigation, progress seeking and transcript.
  Up to 30,000 extracted characters; no PDF/OCR, hidden content, cloud audio or
  audio-file export. Voice quality depends on installed macOS voices.
- [GitHub PR review navigator](https://browser.kudium.com/hooks/f837e01e-e524-4ac8-86d6-f78ee850a85c): loaded file/folder search, tests filter, file jumps,
  local session checklist, description and loaded thread excerpts. Tested on a
  public PR with 88 files. Up to 150 files within a bounded output budget; no GitHub API/token or review writes.
  Checklist marks are not GitHub Viewed state and are not invalidated by new
  commits: recheck your marks after updates. This tool does not assess code quality.
- [Page outline & link explorer](https://browser.kudium.com/hooks/37473415-ec2d-4d6c-b3ae-66784c8728b8): searchable headings, section jumps, unique link
  labels/domains, external/internal filters. Tested with 16 headings and 49 links.
  Up to 120 headings and 180 links within a bounded output budget. Refresh is manual; there is no polling.

## Source and validation

Editable lifecycle and panel sources are in `src/`. Generate the standalone
JSON packages from the repository root:

```sh
node scripts/hooks/build-panel-packages.mjs
node scripts/hooks/validate-panel-packages.mjs
cd apps/browser
npm run test:marketplace-panels
cd ../..
python3 scripts/hooks/prepare-panel-captures.py # requires Pillow
```

Validation uses the shared package, injected hook-body, JavaScript/CSS and panel
schema validators. Native QA creates a disposable Electron profile, loads real
public pages, renders through the production sandboxed panel registry and action
IPC bridge, checks 280/368/640px layouts, exercises installed local speech and
PR checkmarks, and captures the real panel output. Lifecycle source execution
uses the shared hook-body wrapper with a fixture publisher bridge; this is not
proof of installation in the user's normal browser profile.

`captures/manifest.json` records source URLs and titles. Overview images place
an actual source-page capture beside the actual native panel capture; no browser
chrome, answers or results are invented. PNG masters stay outside public web
routes. The marketplace uploader re-encodes them into bounded WebP derivatives.
Review the images before publication. Never publish editor-code screenshots as
usage demonstrations.

Security: extracted text is rendered through textContent, indices are validated
before DOM navigation, credential-bearing/non-HTTP links are excluded, and speech
uses localService voices. Custom panels retain the production restrictive CSP,
isolated session and declared-action bridge. No API keys or new browser grants.

## Listening player redesign (published version 2)

The local listening package uses compact SVG playback controls, system typography,
a slim progress control, and expandable voice settings and transcript. The public package matches the local source recorded in `panel-publication.json`.
The marketplace gallery shows actual playback, expanded voice settings and the
follow-along transcript. WebP masters and image hashes are in the capture manifest. Native QA checks both
collapsed and expanded layouts at 280/368/640px and captures the transcript state.

## Navigator redesigns (published PR version 4, explorer version 3)

Both panels share compact counts, system typography, SVG icons, search controls
and quiet list rows. PR filenames and folders are separated, with full paths in
tooltips. The explorer uses a segmented outline/source switcher. Additional context
is expandable. Native QA verifies file search, unchecked filtering and external
source filtering, plus source-list layouts at 280/368/640px. Refreshed gallery WebP
files and hashes are recorded together in the capture manifest.
