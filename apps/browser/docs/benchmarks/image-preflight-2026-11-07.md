# Image header preflight — November 7, 2026

Evidence: `image-preflight.json`, `image-preflight-verification.json`.

AI attachment dimensions were checked only after nativeImage decoding. They now
check PNG/JPEG/WebP/GIF header dimensions before that dispatch, rejecting malformed,
unsupported, zero-sized, over-40-megapixel and over-32767-side images. The existing
20 MB attachment byte limit and post-decode size check remain in force.

Page capture checks PNG headers before its second native decode. A 160 MiB encoded
byte budget is checked on base64 length before allocating the Buffer. Full-page
layout bounds and post-decode size checks remain; Chromium's original capture can
already allocate its native surface before this preflight.

| Controlled actual attachment observation | Before | After |
| --- | --- | --- |
| Native decode dispatches across four rejected fixtures | 4 | 0 |
| Normal PNG accepted by actual native decoder | Yes | Yes |

The four fixtures are oversized PNG, oversized GIF, malformed JPEG and SVG renamed
to PNG. Both phases bundle actual AIComposerAttachments; the before source is
preserved under `baselines/image-preflight/`. Dangerous fixture decoder calls use
a dispatch observer, so these results do not measure hostile native decoding,
CPU/RSS, decoder exploits or general application speed. The normal PNG uses the
real Electron decoder. Unit tests also establish the 40-million-pixel boundary,
zero/side/format limits, and capture rejection before native decoding.

Header inspection is not a decoder sandbox. It does not bound animation frames,
all malformed container behavior or native capture allocation. File-picked space
icons, download thumbnails, native resources, signed/cross-platform behavior and
downstream private-data destinations remain open production requirements.

Validation passes: 139 suites / 704 tests, final three preflight tests after
style cleanup, lint/types, production build, native capture boundary/UI and native
composer UI. The composer fixture now registers the actual required group-lock
handler (OS authentication availability controlled false) and uses actual group
metadata to assert the human scope action; its obsolete omission/hard-coded label
failed first. Full desktop suite and physical OS authentication are not claimed.
