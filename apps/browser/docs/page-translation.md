# Offline page translation

The page context menu translates directly to the operating system's language.
After translation it offers **Show original language**. There is no language
selector, page overlay, translation service, account or API key.

The address-bar language button appears when the page's detected language differs
from the user's language, while translating, or after translation. The shared
glass popover offers translation, restoration, and **Always translate [language]**.
That choice is saved across websites; downloading a pack is shown in the popover.
Explicit context-menu actions show immediate progress and completion/error toasts;
the address-bar icon spins while work is active. The popup reuses the shared
floating Radix material, without the page-level glass background override.

## Local engine and packs

Bergamot Translator 0.4.9 runs WebAssembly in one Node worker shared by browser
tabs. It is started on demand, freed after 60 seconds without translation work,
and disposed on quit. Old models are freed when the language pair changes.
Translation work is serialized, with at most four queued batches. Navigation and
restoring originals cancel pending work. No background polling or text cache is
used. The worker keeps CPU-intensive inference off the browser UI thread.

The installer includes the engine (~5 MB). Missing production language packs are
downloaded directly from Bergamot's model distributor over HTTPS, verified against
pinned SHA-256 digests and lengths, and atomically cached in
`userData/translation-models`. A direct pair typically takes 20–30 MB. Non-English
pairs may use two packs through English. The disk cache is capped at 256 MiB,
evicting older packs; evicted packs download again when needed. Existing cached
packs work without a connection. Pack downloads have bounded lengths and timeouts.

Supported production models currently cover English, Bulgarian, Czech, German,
Spanish, Estonian, French, Italian, Polish and Portuguese, plus Norwegian Bokmål
to English. Other languages fail with a clear message; there is no fallback to a
server or another target language. Source language uses the page's `lang` attribute
or bounded local franc-min detection when the page provides none.

## Page and privacy boundaries

The isolated top-frame preload processes visible text nodes, excluding form
controls, editable content, code, hidden content and `translate="no"`. It preserves
links, markup and input values. Only text is passed to the worker; translated
strings are written into text nodes, never interpreted as HTML. Websites receive
no engine or filesystem bridge. Private tabs and locked groups cannot translate.

Newly inserted text is translated only while translation is active. Restoring
originals cancels observers and requests and does not overwrite text subsequently
changed by the website. Collection is bounded to 5,000 nodes, with short yielding
scans and batches of 50 segments / 20,000 characters. No page text or form values
are sent to Kudium or the model distributor. The distributor receives ordinary
network information for language pack downloads.

## Packaging and checks

`copy-translation-engine.cjs` copies the pinned WASM, glue and worker with MPL
license/attribution into `dist/main/translation-engine`. The worker is given a
CommonJS entry to support upstream's Node compatibility layer. Engine assets are
unpacked from ASAR and checked by the packaged dependency gate before signing.

Run TypeScript and the pageTranslation, pageTranslationButton and
offlineTranslation unit suites. `npm run test:page-translation` exercises the real
engine and sandboxed Electron preload: direct context actions, dynamic content,
restoring originals, form privacy, navigation cancellation and a fresh worker
translating from cached packs with network blocked. Its initial run downloads
Spanish -> English packs; `KUDIUM_TRANSLATION_TEST_CACHE` optionally preserves
only those model files between test runs. This does not use the user's profile.

A browser build containing this feature is required for installed users. No
website/server deployment is needed.
